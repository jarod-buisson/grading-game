/* =========================================================
   result.js — comparison screen logic
   - read session state
   - render "your grade" + "reference" only (no original card)
   - two view modes: side-by-side (cards) and wipe (overlay with draggable divider)
   - actions: download your grade, new session
   ========================================================= */

(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const grid = $('compare-grid');

    const session = FileIO.loadSession();

    /* ----- Header meta ---------------------------------------------------- */
    function renderHeader() {
        const ch = session?.challenge || {};
        $('meta-challenge').textContent =
            ch.id ? String(ch.id).padStart(3, '0') : '—';
        $('meta-duration').textContent = session?.duration || '—';
        $('meta-submitted').textContent =
            !session ? '—'
                : session.submittedBy === 'timeout' ? 'auto on timeout'
                : 'manual submit';
    }
    renderHeader();

    /* ----- No-session fallback ------------------------------------------ */
    if (!session) {
        grid.innerHTML =
            '<div class="compare-empty" style="grid-column:1/-1; min-height:300px;">' +
            '<div class="ph-mark">◇</div><div>no session data · start a new one</div></div>';
        // Hide the wipe view + switcher when there's nothing to compare
        document.querySelector('.view-switcher')?.setAttribute('hidden', '');
        document.getElementById('compare-wipe')?.setAttribute('hidden', '');
        wireFooter(null);
        return;
    }

    const ch          = session.challenge || {};
    const yourGrade   = session.gradeDataUrl || null;
    const yourName    = session.gradeName || 'your-grade.jpg';
    const reference   = (session.showRef && ch.reference) ? ch.reference : null;

    /* =========================================================
       SIDE-BY-SIDE VIEW
       ========================================================= */
    grid.innerHTML = '';
    addCell('01', 'your grade', 'is-user',      yourGrade, yourName, true);
    addCell('02', 'reference',  'is-reference', reference, ch.photographer ? ("by " + ch.photographer) : "admin's grade", false);

    function addCell(num, label, labelClass, src, sub, isUser) {
        const cell = document.createElement('div');
        cell.className = 'compare-cell';

        cell.innerHTML = `
            <div class="compare-cell-head">
                <span class="compare-cell-label ${labelClass}">${num} · ${label}</span>
                <span class="compare-cell-num">${sub || ''}</span>
            </div>
            <div class="compare-frame ${isUser ? 'is-user' : ''} ${labelClass === 'is-reference' ? 'is-reference' : ''}"></div>
        `;
        const frame = cell.querySelector('.compare-frame');
        if (src) {
            const img = new Image();
            img.onload  = () => frame.appendChild(img);
            img.onerror = () => emptyFrame(frame, 'failed to load');
            img.src = src;
        } else if (isUser && session?._gradeStripped) {
            emptyFrame(frame, 'grade too large to preview · file ok');
        } else if (!isUser) {
            emptyFrame(frame, 'no reference for this challenge');
        } else {
            emptyFrame(frame, 'no image');
        }
        grid.appendChild(cell);
    }

    function emptyFrame(frame, msg) {
        frame.innerHTML =
            '<div class="compare-empty"><div class="ph-mark">◫</div><div>' + msg + '</div></div>';
    }

    /* =========================================================
       WIPE VIEW
       ========================================================= */
    const wipeContainer = $('wipe-container');
    const wipeImgLeft   = $('wipe-img-left');   // your grade — clipped on top
    const wipeImgRight  = $('wipe-img-right');  // reference  — fully visible underneath
    const wipeDivider   = $('wipe-divider');
    const wipePct       = $('wipe-pct');

    let canWipe = false;
    if (yourGrade && reference) {
        wipeImgLeft.src  = yourGrade;
        wipeImgRight.src = reference;
        canWipe = true;
        setSplit(50);

        // Resize the wipe-container to the largest box that fits inside
        // the wipe-stage while keeping the reference image's aspect ratio.
        // This way the divider stays inside the actual image bounds — no
        // overflow into the letterbox area on the sides.
        function syncWipeSize() {
            const stage = wipeContainer.parentElement;
            if (!stage || !wipeImgRight.naturalWidth || !wipeImgRight.naturalHeight) return;
            const imgRatio   = wipeImgRight.naturalWidth / wipeImgRight.naturalHeight;
            const stageW     = stage.clientWidth;
            const stageH     = stage.clientHeight;
            if (stageW === 0 || stageH === 0) return;  // stage is hidden, wait
            const stageRatio = stageW / stageH;
            let w, h;
            if (imgRatio > stageRatio) {
                w = stageW;
                h = w / imgRatio;
            } else {
                h = stageH;
                w = h * imgRatio;
            }
            wipeContainer.style.width  = Math.floor(w) + 'px';
            wipeContainer.style.height = Math.floor(h) + 'px';
        }

        wipeImgRight.addEventListener('load', syncWipeSize);
        window.addEventListener('resize',    syncWipeSize);
        if (wipeImgRight.complete && wipeImgRight.naturalWidth) syncWipeSize();

        // Re-sync when we actually switch to the wipe view (the stage might
        // have been 0×0 before because side-by-side was active).
        const wipeBtn = document.querySelector('.view-btn[data-view="wipe"]');
        wipeBtn?.addEventListener('click', () => requestAnimationFrame(syncWipeSize));
    } else {
        // Disable wipe mode if we don't have both images
        const wipeView = document.getElementById('compare-wipe');
        if (wipeView) {
            const why = !yourGrade
                ? 'no grade submitted to compare'
                : 'no reference for this challenge';
            wipeView.innerHTML =
                `<div class="wipe-container"><div class="wipe-empty">wipe mode unavailable — ${why}</div></div>`;
        }
        // Also disable the wipe button visually
        document.querySelector('.view-btn[data-view="wipe"]')?.setAttribute('disabled', '');
    }

    function setSplit(pct) {
        const c = Math.max(0, Math.min(100, pct));
        wipeDivider.style.left = c + '%';
        wipeImgLeft.style.clipPath = `inset(0 ${(100 - c).toFixed(2)}% 0 0)`;
        if (wipePct) wipePct.textContent = Math.round(c) + '%';
    }

    function setupWipeDrag() {
        if (!canWipe || !wipeContainer) return;
        let dragging = false;

        function fromEvent(e) {
            const rect = wipeContainer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            setSplit((x / rect.width) * 100);
        }

        wipeContainer.addEventListener('pointerdown', (e) => {
            dragging = true;
            wipeContainer.setPointerCapture(e.pointerId);
            fromEvent(e);
        });
        wipeContainer.addEventListener('pointermove', (e) => {
            if (dragging) fromEvent(e);
        });
        wipeContainer.addEventListener('pointerup', (e) => {
            dragging = false;
            try { wipeContainer.releasePointerCapture(e.pointerId); } catch (_) {}
        });
        wipeContainer.addEventListener('pointercancel', () => { dragging = false; });

        // Keyboard support: ←/→ moves the divider when the container is focused
        wipeContainer.tabIndex = 0;
        wipeContainer.addEventListener('keydown', (e) => {
            const current = parseFloat(wipeDivider.style.left) || 50;
            const step = e.shiftKey ? 10 : 2;
            if (e.key === 'ArrowLeft')  { setSplit(current - step); e.preventDefault(); }
            if (e.key === 'ArrowRight') { setSplit(current + step); e.preventDefault(); }
        });
    }
    setupWipeDrag();

    /* =========================================================
       VIEW SWITCHER
       ========================================================= */
    const viewsContainer = document.querySelector('.compare-views');
    const viewButtons    = document.querySelectorAll('.view-btn');
    viewButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.hasAttribute('disabled')) return;
            const view = btn.dataset.view;
            setView(view);
        });
    });

    function setView(view) {
        if (!viewsContainer) return;
        // Visibility is driven entirely by the parent's data-active attribute +
        // CSS rules in result.css — we used to use the `hidden` HTML attribute
        // here but it loses the cascade fight against `.compare-wipe { display: flex }`.
        viewsContainer.dataset.active = view;
        viewButtons.forEach(b => {
            const active = b.dataset.view === view;
            b.classList.toggle('is-active', active);
            b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
    }

    /* =========================================================
       LOG TO GAME_HISTORY (authenticated users only)
       =========================================================
       Fired once per result page load. Skips silently if the user
       is anonymous or if there's no session to log. We don't await
       it from the main flow — it's fire-and-forget. */
    (async function logSoloHistory() {
        if (!window.gg || !session) return;
        try {
            await window.gg.ready;
            if (!window.gg.isAuthenticated) return;

            const challengeId = session.challenge?.id
                ? String(session.challenge.id)
                : null;
            if (!challengeId) return;

            const { error } = await window.gg.supabase
                .from('game_history')
                .insert({
                    user_id:          window.gg.userId,
                    mode:             'solo',
                    challenge_id:     challengeId,
                    duration_seconds: (session.duration || 0) * 60
                });
            if (error) {
                console.warn('[result] failed to log solo history:', error);
            } else {
                console.log('[result] logged solo history for challenge', challengeId);
            }
        } catch (e) {
            console.warn('[result] solo history logging crashed:', e);
        }
    })();


    /* =========================================================
       COMMUNITY WALL (migration 010)
       =========================================================
       Publish-to-view: the feed only unlocks once YOUR edit is on
       it. The server enforces the gate (get_wall returns empty
       items until you've published) — this code just renders the
       three states: anonymous teaser / publish CTA / open grid. */
    (async function wireWall() {
        const section = $('wall-section');
        if (!section || !window.gg || !session?.challenge?.id) return;

        const challengeId = String(session.challenge.id);
        const t = (k) => (window.gg_i18n && window.gg_i18n.t) ? window.gg_i18n.t(k) : k;

        const lockedEl  = $('wall-locked');
        const gridEl    = $('wall-grid');
        const subEl     = $('wall-sub');
        const ctaEl     = $('wall-cta');
        const hintEl    = $('wall-hint');
        const actionsEl = $('wall-actions');
        const updateBtn = $('wall-update-btn');

        try { await window.gg.ready; } catch (_) { return; }

        let wall;
        try {
            wall = await window.gg.getWall(challengeId);
        } catch (e) {
            console.warn('[result] wall unavailable:', e);
            return;                       // migration not run yet → stay hidden
        }
        section.hidden = false;
        render();

        function teaser(count) {
            if (count === 0) return t('wall.teaser_none');
            if (count === 1) return t('wall.teaser_one');
            return t('wall.teaser_many').replace('{n}', count);
        }

        function render() {
            subEl.textContent = teaser(wall.count);

            if (wall.can_view) {
                lockedEl.hidden  = true;
                renderGrid(wall.items);
                gridEl.hidden    = false;
                // Offer "replace with this session's edit" only when a fresh
                // grade exists in the session (not after a bare revisit).
                actionsEl.hidden = !session.gradeDataUrl;
                return;
            }

            gridEl.hidden    = true;
            actionsEl.hidden = true;
            lockedEl.hidden  = false;

            if (!window.gg.isAuthenticated) {
                ctaEl.textContent  = t('wall.signin_btn');
                ctaEl.disabled     = false;
                hintEl.textContent = t('wall.signin_hint');
                ctaEl.onclick = () => window.gg.openLoginModal && window.gg.openLoginModal();
            } else if (!session.gradeDataUrl) {
                ctaEl.textContent  = t('wall.publish_btn');
                ctaEl.disabled     = true;
                hintEl.textContent = t('wall.no_grade');
            } else {
                ctaEl.textContent  = t('wall.publish_btn');
                ctaEl.disabled     = false;
                hintEl.textContent = t('wall.publish_hint');
                ctaEl.onclick = publish;
            }
        }

        async function publish() {
            ctaEl.disabled    = true;
            ctaEl.textContent = t('wall.publishing');
            try {
                await window.gg.publishToWall(challengeId, session.gradeDataUrl);
                wall = await window.gg.getWall(challengeId);
                render();
            } catch (e) {
                ctaEl.disabled     = false;
                ctaEl.textContent  = t('wall.publish_btn');
                hintEl.textContent = t('wall.publish_error');
            }
        }

        updateBtn?.addEventListener('click', async () => {
            if (!session.gradeDataUrl) return;
            updateBtn.disabled = true;
            try {
                await window.gg.publishToWall(challengeId, session.gradeDataUrl);
                wall = await window.gg.getWall(challengeId);
                render();
            } catch (e) {
                console.warn('[result] wall update failed:', e);
            }
            updateBtn.disabled = false;
        });

        function renderGrid(items) {
            gridEl.innerHTML = '';
            // The photographer's reference opens the wall when it exists —
            // that's the deal with contributors (their visibility) and it
            // seeds the wall so it's never empty on curated photos.
            if (ch.reference) {
                gridEl.appendChild(card({
                    src:     ch.reference,
                    nick:    ch.photographer || 'photographer',
                    badge:   'ref'
                }));
            }
            (items || []).forEach((it) => {
                gridEl.appendChild(card({
                    src:   window.gg.wallImageUrl(it.image_path, it.updated_at),
                    nick:  it.nickname || 'player',
                    badge: it.is_you ? 'you' : null,
                    id:    it.id,
                    isYou: !!it.is_you
                }));
            });
        }

        /* Build a card via DOM APIs — nicknames are user content, never
           feed them through innerHTML. */
        function card(opts) {
            const el = document.createElement('div');
            el.className = 'wall-card'
                + (opts.isYou ? ' is-you' : '')
                + (opts.badge === 'ref' ? ' is-reference' : '');

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
                rep.addEventListener('click', async () => {
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
    })();


    /* =========================================================
       FOOTER ACTIONS
       ========================================================= */
    wireFooter(session);
    function wireFooter(s) {
        const dlBtn  = $('download-grade');
        const newBtn = $('new-session');
        if (dlBtn) {
            dlBtn.addEventListener('click', () => {
                if (s && s.gradeDataUrl) {
                    FileIO.downloadFile(s.gradeDataUrl, s.gradeName || 'my-grade.jpg');
                } else {
                    dlBtn.textContent = '◇ no grade to download';
                    setTimeout(() => dlBtn.textContent = '⤓ download my grade', 1400);
                }
            });
        }
        if (newBtn) {
            newBtn.addEventListener('click', () => {
                window.location.href = 'solo.html';
            });
        }
    }

})();
