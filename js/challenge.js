/* =========================================================
   challenge.js — per-photo community wall (opened from the gallery).

   A player clicks an UNLOCKED card in gallery.html → lands here with
   ?c={id}. This page shows, for that one photo:
     - the original (the photographer's reference grade), badged
     - every edit the community has published on it

   Gating: server-side via gg.getChallengeWall(), which only returns
   the items if the caller has UNLOCKED the photo (played it). If they
   haven't (or they're anonymous / hit the URL directly), we show a
   "play this photo first" CTA instead of revealing anything.
   ========================================================= */

(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const t = (k) => (window.gg_i18n && window.gg_i18n.t) ? window.gg_i18n.t(k) : k;

    const idEl      = $('cw-id');
    const titleEl   = document.querySelector('.cw-title');
    const creditEl  = $('cw-credit');
    const subEl     = $('cw-sub');
    const lockedEl  = $('cw-locked');
    const gridEl    = $('cw-grid');

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
        // If the visitor isn't signed in at all, nudge toward sign-in via
        // the global modal rather than straight into a session they can't
        // have unlocked.
        if (window.gg && !window.gg.isAuthenticated) {
            subEl.textContent = '';
        }
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

        gridEl.innerHTML = '';
        gridEl.hidden = false;

        // The original opens the wall when a reference exists.
        if (challenge.reference) {
            gridEl.appendChild(card({
                src:   challenge.reference,
                nick:  challenge.photographer || 'photographer',
                badge: 'ref'
            }));
        }
        (wall.items || []).forEach((it) => {
            gridEl.appendChild(card({
                src:   window.gg.wallImageUrl(it.image_path, it.updated_at),
                nick:  it.nickname || 'player',
                badge: it.is_you ? 'you' : null,
                id:    it.id,
                isYou: !!it.is_you
            }));
        });

        // Nothing but the reference (or not even that)? Say so gently.
        if (!gridEl.children.length) {
            showError(t('challenge.empty'));
        }
    }

    /* Build a wall card via DOM APIs — nicknames are user content, never
       feed them through innerHTML. Mirrors result.js's card builder so
       the two walls look identical. */
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

    init().catch(err => console.error('[challenge] init failed:', err));

})();
