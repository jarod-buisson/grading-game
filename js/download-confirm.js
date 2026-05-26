/* =========================================================
   download-confirm.js — pre-download Terms-of-Use modal

   Used by solo (game.js) and multi (room-state.js) before
   triggering the actual file download. Shows the photo's
   attribution, the license, the per-photo terms, and a
   checkbox the player MUST tick before they can proceed.

   Exposes:
     DownloadConfirm.show(challenge, onConfirm, onCancel?)
     DownloadConfirm.personalizeFilename(challenge)
   ========================================================= */

(function (global) {
    'use strict';

    let modalEl = null;

    function ensureModal() {
        if (modalEl) return modalEl;
        modalEl = document.createElement('div');
        modalEl.className = 'modal-overlay';
        modalEl.id = 'download-modal';
        modalEl.setAttribute('role', 'dialog');
        modalEl.setAttribute('aria-modal', 'true');
        modalEl.innerHTML = `
            <div class="modal-card">
                <div class="modal-head">
                    <div class="modal-title">Confirm download</div>
                    <div class="modal-close" data-close>esc ✕</div>
                </div>

                <div class="attribution-card">
                    <div class="attribution-row">
                        <span class="attribution-label">photographer</span>
                        <span class="attribution-value" id="dl-attr-photographer">—</span>
                    </div>
                    <div class="attribution-row">
                        <span class="attribution-label">license</span>
                        <span class="attribution-value attribution-value--mono" id="dl-attr-license">All Rights Reserved</span>
                    </div>
                    <div class="attribution-row attribution-row--block">
                        <span class="attribution-label">terms</span>
                        <span class="attribution-terms" id="dl-attr-terms">—</span>
                    </div>
                </div>

                <label class="tou-checkbox">
                    <input type="checkbox" id="dl-tou-accept">
                    <span class="tou-text">
                        I agree to use this file only for personal grading practice
                        and to <strong>not redistribute it</strong> or use it commercially.
                    </span>
                </label>

                <div class="modal-actions">
                    <button class="result-action" data-close>cancel</button>
                    <button class="result-action is-primary" id="dl-confirm" disabled>
                        <span>confirm &amp; download</span>
                        <span>↓</span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);

        // Close handlers
        modalEl.querySelectorAll('[data-close]').forEach(el => {
            el.addEventListener('click', () => hide());
        });
        modalEl.addEventListener('click', (e) => {
            if (e.target === modalEl) hide();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modalEl.classList.contains('is-open')) hide();
        });

        return modalEl;
    }

    function show(challenge, onConfirm, onCancel) {
        const m = ensureModal();
        if (!challenge) {
            console.warn('[download-confirm] no challenge provided');
            return;
        }
        m.querySelector('#dl-attr-photographer').textContent = challenge.photographer || 'unknown';
        m.querySelector('#dl-attr-license').textContent      = challenge.license || 'All Rights Reserved';
        m.querySelector('#dl-attr-terms').textContent        =
            challenge.terms ||
            'Personal grading practice only. Do not redistribute or use commercially.';

        const checkbox = m.querySelector('#dl-tou-accept');
        const confirmBtn = m.querySelector('#dl-confirm');
        checkbox.checked = false;
        confirmBtn.disabled = true;

        checkbox.onchange = () => { confirmBtn.disabled = !checkbox.checked; };
        confirmBtn.onclick = () => {
            hide();
            if (typeof onConfirm === 'function') onConfirm();
        };

        // Wire cancel buttons to also fire onCancel
        m.querySelectorAll('[data-close]').forEach(el => {
            el.onclick = () => {
                hide();
                if (typeof onCancel === 'function') onCancel();
            };
        });

        m.classList.add('is-open');
        // Focus the checkbox for keyboard users
        setTimeout(() => checkbox.focus(), 50);
    }

    function hide() {
        if (modalEl) modalEl.classList.remove('is-open');
    }

    /* ---------- Personalize the downloaded filename ----------
       Outgoing pattern: gg_{challengeId}_{nickname}_{YYYYMMDD}.{ext}
       This is a soft deterrent — anyone who passes the file along passes
       their own pseudo along with it. Easily stripped by determined bad
       actors, but a clear "fingerprint" for casual sharing. */
    function personalizeFilename(challenge) {
        const safeNick = (() => {
            try {
                const n = (localStorage.getItem('gradinggame.nickname') || 'guest').trim();
                return n.replace(/[^a-z0-9_-]/gi, '').slice(0, 20) || 'guest';
            } catch (e) { return 'guest'; }
        })();
        const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const src = challenge?.source || '';
        const base = src.split('/').pop() || 'source.dat';
        const ext = base.includes('.') ? base.split('.').pop() : 'dat';
        const id = challenge?.id || 'xxx';
        return `gg_${id}_${safeNick}_${ts}.${ext}`;
    }

    global.DownloadConfirm = { show, hide, personalizeFilename };

})(window);
