/* =========================================================
   challenge.js — per-photo community wall (opened from the gallery).

   A player clicks an UNLOCKED card in gallery.html → lands here with
   ?c={id}. This page shows, for that one photo:
     - the original (the photographer's reference grade), badged
     - every edit the community has published on it
     - a COMPARATOR: pick any two edits (A / B) and view them side by
       side or through a wipe slider. Fill a slot by dragging a
       thumbnail onto it, picking from its list, or tapping a card.

   Gating: server-side via gg.getChallengeWall(), which only returns
   the items if the caller has UNLOCKED the photo (played it). If they
   haven't (or they're anonymous / hit the URL directly), we show a
   "play this photo first" CTA instead of revealing anything.
   ========================================================= */

(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const t = (k) => (window.gg_i18n && window.gg_i18n.t) ? window.gg_i18n.t(k) : k;

    const idEl     = $('cw-id');
    const creditEl = $('cw-credit');
    const subEl    = $('cw-sub');
    const lockedEl = $('cw-locked');
    const gridEl   = $('cw-grid');

    function padId(id) { return String(id).padStart(3, '0'); }

    /* Read the requested challenge id from the query string. Accept both
       ?c= and ?id= so old links / hand-typed URLs both work. */
    function requestedId() {
        const p = new URLSearchParams(window.location.search);
        return p.get('c') || p.get('id') || '';
    }

    function showError(msg) {
        lockedEl.hidden = true;
        gridEl.hidden = false;
        gridEl.innerHTML = '';
        const box = document.createElement('div');
        box.className = 'cw-empty';
        box.textContent = msg;
        gridEl.appendChild(box);
    }

    async function init() {
        const wantId = requestedId();
        if (!wantId) {
            idEl.textContent = '—';
            showError(t('challenge.not_found'));
            return;
        }
        idEl.textContent = padId(wantId);

        if (window.gg?.ready) { try { await window.gg.ready; } catch (_) {} }

        // Find the challenge in the manifest (for the reference image +
        // photographer credit). The wall data itself comes from the RPC.
        let challenge = null;
        try {
            const r = await fetch('images/challenges/manifest.json?t=' + Date.now(), { cache: 'no-store' });
            if (r.ok) {
                const manifest = await r.json();
                const list = (manifest && manifest.challenges) || [];
                challenge = list.find(c => String(c.id) === String(wantId)) || null;
            }
        } catch (e) {
            console.warn('[challenge] manifest load failed:', e);
        }

        if (!challenge) {
            showError(t('challenge.not_found'));
            return;
        }

        // Fetch the wall (unlock-gated server-side).
        let wall;
        try {
            wall = await window.gg.getChallengeWall(challenge.id);
        } catch (e) {
            console.warn('[challenge] wall unavailable:', e);
            // Migration 011 not run yet, or a transient error → treat as
            // locked so we never leak anything.
            wall = { count: 0, can_view: false, items: [] };
        }

        if (!wall.can_view) {
            renderLocked();
            return;
        }
        renderOpen(challenge, wall);
    }

    function renderLocked() {
        gridEl.hidden  = true;
        creditEl.hidden = true;
        lockedEl.hidden = false;
    }

    function teaser(count) {
        if (count === 0) return t('wall.teaser_none');
        if (count === 1) return t('wall.teaser_one');
        return t('wall.teaser_many').replace('{n}', count);
    }

    function renderOpen(challenge, wall) {
        lockedEl.hidden = true;

        // Photographer credit line (the "original").
        if (challenge.photographer && challenge.reference) {
            creditEl.textContent =
                t('challenge.original_by').replace('{name}', challenge.photographer);
            creditEl.hidden = false;
        } else {
            creditEl.hidden = true;
        }

        subEl.textContent = teaser(wall.count);

        /* ---- Build the participant pool (original + every edit) ----
           Each participant has a stable key used by the grid cards
           (data-pkey), the two <select>s, and the drop targets. */
        const participants = [];
        if (challenge.reference) {
            participants.push({
                key:   'ref',
                src:   challenge.reference,
                name:  challenge.photographer || t('challenge.cmp_original'),
                isRef: true
            });
        }
        (wall.items || []).forEach((it) => {
            participants.push({
                key:   String(it.id),
                src:   window.gg.wallImageUrl(it.image_path, it.updated_at),
                name:  it.nickname || 'player',
                isYou: !!it.is_you
            });
        });
        const byKey = new Map(participants.map(p => [p.key, p]));

        /* ---- Render the grid ---- */
        gridEl.innerHTML = '';
        gridEl.hidden = false;
        participants.forEach((p) => {
            gridEl.appendChild(card({
                src:   p.src,
                nick:  p.name,
                badge: p.isRef ? 'ref' : (p.isYou ? 'you' : null),
                id:    p.isRef ? null : p.key,
                isYou: p.isYou,
                pkey:  p.key
            }));
        });

        if (!gridEl.children.length) {
            showError(t('challenge.empty'));
            return;
        }

        // The comparator only makes sense with at least two things to
        // compare. With a single image, skip the whole apparatus.
        if (participants.length >= 2) {
            setupComparator(participants, byKey);
        }
    }

    /* =========================================================
       COMPARATOR
       ========================================================= */
    function setupComparator(participants, byKey) {
        const toolbar   = $('cw-toolbar');
        const toggleBtn = $('cw-compare-toggle');
        const panel     = $('cw-comparator');
        const closeBtn  = $('cw-cmp-close');
        const selA      = $('cw-select-a');
        const selB      = $('cw-select-b');
        const stage     = $('cw-cmp-stage');
        if (!toolbar || !panel) return;

        let slotA = null;
        let slotB = null;
        let nextFill = 'a';   // which slot a card-tap fills next
        let open = false;

        function optionLabel(p) {
            if (p.isRef) {
                return '★ ' + t('challenge.cmp_original')
                     + (p.name ? ' · ' + p.name : '');
            }
            return p.name + (p.isYou ? ' · ' + t('wall.badge_you') : '');
        }
        function shortName(p) {
            if (p.isRef) return t('challenge.cmp_original');
            return p.name + (p.isYou ? ' · ' + t('wall.badge_you') : '');
        }

        // Populate both selects.
        [selA, selB].forEach((sel) => {
            sel.innerHTML = '';
            participants.forEach((p) => {
                const o = document.createElement('option');
                o.value = p.key;
                o.textContent = optionLabel(p);
                sel.appendChild(o);
            });
        });

        // Defaults: A = original (or first), B = your edit (or the next
        // distinct participant).
        slotA = byKey.has('ref') ? 'ref' : participants[0].key;
        const you = participants.find(p => p.isYou && p.key !== slotA);
        slotB = you ? you.key
                    : (participants.find(p => p.key !== slotA)?.key || slotA);
        selA.value = slotA;
        selB.value = slotB;

        /* ---- Frames ---- */
        function setFrame(frameEl, p) {
            frameEl.innerHTML = '';
            if (!p) return;
            const img = new Image();
            img.alt = '';
            img.src = p.src;
            frameEl.appendChild(img);
        }

        /* ---- Wipe ---- */
        const wipeContainer = $('cw-wipe-container');
        const wipeA = $('cw-wipe-a');   // slot A — clipped on top
        const wipeB = $('cw-wipe-b');   // slot B — underneath
        const wipeDivider = $('cw-wipe-divider');
        const wipePct = $('cw-wipe-pct');

        function setSplit(pct) {
            const c = Math.max(0, Math.min(100, pct));
            wipeDivider.style.left = c + '%';
            wipeA.style.clipPath = `inset(0 ${(100 - c).toFixed(2)}% 0 0)`;
            if (wipePct) wipePct.textContent = Math.round(c) + '%';
        }

        function syncWipeSize() {
            const st = wipeContainer.parentElement;
            const ref = wipeB.naturalWidth ? wipeB : wipeA;
            if (!st || !ref.naturalWidth || !ref.naturalHeight) return;
            const imgRatio = ref.naturalWidth / ref.naturalHeight;
            const stageW = st.clientWidth, stageH = st.clientHeight;
            if (!stageW || !stageH) return;     // hidden → wait
            const stageRatio = stageW / stageH;
            let w, h;
            if (imgRatio > stageRatio) { w = stageW; h = w / imgRatio; }
            else                       { h = stageH; w = h * imgRatio; }
            wipeContainer.style.width  = Math.floor(w) + 'px';
            wipeContainer.style.height = Math.floor(h) + 'px';
        }
        wipeA.addEventListener('load', syncWipeSize);
        wipeB.addEventListener('load', syncWipeSize);
        window.addEventListener('resize', syncWipeSize);

        (function wireWipeDrag() {
            let dragging = false;
            function fromEvent(e) {
                const rect = wipeContainer.getBoundingClientRect();
                if (!rect.width) return;
                setSplit(((e.clientX - rect.left) / rect.width) * 100);
            }
            wipeContainer.addEventListener('pointerdown', (e) => {
                dragging = true;
                try { wipeContainer.setPointerCapture(e.pointerId); } catch (_) {}
                fromEvent(e);
            });
            wipeContainer.addEventListener('pointermove', (e) => { if (dragging) fromEvent(e); });
            wipeContainer.addEventListener('pointerup',   (e) => {
                dragging = false;
                try { wipeContainer.releasePointerCapture(e.pointerId); } catch (_) {}
            });
            wipeContainer.addEventListener('pointercancel', () => { dragging = false; });
            wipeContainer.tabIndex = 0;
            wipeContainer.addEventListener('keydown', (e) => {
                const cur = parseFloat(wipeDivider.style.left) || 50;
                const step = e.shiftKey ? 10 : 2;
                if (e.key === 'ArrowLeft')  { setSplit(cur - step); e.preventDefault(); }
                if (e.key === 'ArrowRight') { setSplit(cur + step); e.preventDefault(); }
            });
        })();

        /* ---- Apply the current A / B selection everywhere ---- */
        function apply() {
            const a = byKey.get(slotA);
            const b = byKey.get(slotB);
            setFrame($('cw-frame-a'), a);
            setFrame($('cw-frame-b'), b);
            $('cw-name-a').textContent = a ? shortName(a) : '';
            $('cw-name-b').textContent = b ? shortName(b) : '';
            // Wipe layers
            if (a) wipeA.src = a.src;
            if (b) wipeB.src = b.src;
            $('cw-wipe-name-a').textContent = a ? shortName(a) : '';
            $('cw-wipe-name-b').textContent = b ? shortName(b) : '';
            setSplit(50);
            requestAnimationFrame(syncWipeSize);
            highlightActive();
        }

        function setSlot(slot, key) {
            if (!byKey.has(key)) return;
            if (slot === 'a') { slotA = key; selA.value = key; }
            else              { slotB = key; selB.value = key; }
            apply();
        }

        // Tap a card → fill A, then B, then A… (mobile-friendly path).
        function fillNext(key) {
            setSlot(nextFill, key);
            nextFill = nextFill === 'a' ? 'b' : 'a';
        }

        // Mark which grid cards are currently in A / B.
        function highlightActive() {
            gridEl.querySelectorAll('.wall-card').forEach((c) => {
                c.classList.toggle('in-slot-a', c.dataset.pkey === slotA);
                c.classList.toggle('in-slot-b', c.dataset.pkey === slotB);
            });
        }

        selA.addEventListener('change', () => setSlot('a', selA.value));
        selB.addEventListener('change', () => setSlot('b', selB.value));

        /* ---- View mode (side / wipe) ---- */
        const modeBtns = panel.querySelectorAll('.cw-mode-btn');
        modeBtns.forEach((btn) => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                stage.dataset.mode = mode;
                modeBtns.forEach(b => b.classList.toggle('is-active', b === btn));
                if (mode === 'wipe') requestAnimationFrame(syncWipeSize);
            });
        });

        /* ---- Drag & drop: grid thumbnails → A / B slots ---- */
        gridEl.addEventListener('dragstart', (e) => {
            const c = e.target.closest('.wall-card');
            if (!c || !c.dataset.pkey) return;
            e.dataTransfer.setData('text/plain', c.dataset.pkey);
            e.dataTransfer.effectAllowed = 'copy';
        });

        ['a', 'b'].forEach((slot) => {
            const zone = $('cw-slot-' + slot);
            if (!zone) return;
            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                zone.classList.add('is-dragover');
            });
            zone.addEventListener('dragleave', () => zone.classList.remove('is-dragover'));
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('is-dragover');
                const key = e.dataTransfer.getData('text/plain');
                if (key) setSlot(slot, key);
            });
        });

        /* ---- Tap a card to fill the next slot (only while open) ---- */
        gridEl.addEventListener('click', (e) => {
            if (!open) return;
            if (e.target.closest('.wall-report')) return;   // report button wins
            const c = e.target.closest('.wall-card');
            if (c && c.dataset.pkey) fillNext(c.dataset.pkey);
        });

        /* ---- Open / close ---- */
        function setOpen(v) {
            open = v;
            panel.hidden = !v;
            toggleBtn.setAttribute('aria-expanded', v ? 'true' : 'false');
            toolbar.classList.toggle('is-open', v);
            if (v) {
                requestAnimationFrame(syncWipeSize);
                panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }
        toggleBtn.addEventListener('click', () => setOpen(!open));
        closeBtn?.addEventListener('click', () => setOpen(false));

        // Prime everything, then reveal the toolbar.
        apply();
        toolbar.hidden = false;
    }

    /* Build a wall card via DOM APIs — nicknames are user content, never
       feed them through innerHTML. Mirrors result.js's card builder so
       the two walls look identical; adds drag + slot affordances. */
    function card(opts) {
        const el = document.createElement('div');
        el.className = 'wall-card'
            + (opts.isYou ? ' is-you' : '')
            + (opts.badge === 'ref' ? ' is-reference' : '');
        if (opts.pkey) {
            el.dataset.pkey = opts.pkey;
            el.setAttribute('draggable', 'true');
        }

        const frame = document.createElement('div');
        frame.className = 'wall-card-frame';
        const img = new Image();
        img.loading = 'lazy';
        img.alt = '';
        img.src = opts.src;
        frame.appendChild(img);

        const meta = document.createElement('div');
        meta.className = 'wall-card-meta';

        const nick = document.createElement('span');
        nick.className = 'wall-card-nick';
        nick.textContent = opts.nick;
        meta.appendChild(nick);

        if (opts.badge === 'ref') {
            const b = document.createElement('span');
            b.className = 'wall-badge wall-badge--ref';
            b.textContent = t('wall.badge_ref');
            meta.appendChild(b);
        } else if (opts.badge === 'you') {
            const b = document.createElement('span');
            b.className = 'wall-badge wall-badge--you';
            b.textContent = t('wall.badge_you');
            meta.appendChild(b);
        } else if (opts.id) {
            const rep = document.createElement('button');
            rep.className = 'wall-report';
            rep.type = 'button';
            rep.textContent = t('wall.report');
            rep.addEventListener('click', async (e) => {
                e.stopPropagation();      // don't trigger tap-to-fill
                rep.disabled = true;
                const ok = await window.gg.reportWallSubmission(opts.id);
                rep.textContent = ok ? t('wall.reported') : t('wall.report');
                if (!ok) rep.disabled = false;
            });
            meta.appendChild(rep);
        }

        el.appendChild(frame);
        el.appendChild(meta);
        return el;
    }

    init().catch(err => console.error('[challenge] init failed:', err));

})();
