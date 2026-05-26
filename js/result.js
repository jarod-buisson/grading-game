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
