/* =========================================================
   mobile-gate.js — auto-injected "desktop only" gate

   Below 800px viewport width, the rest of the page is hidden via
   CSS (see .mobile-gate rules in theme.css) and only this gate
   shows up. Pure presentational JS — no business logic, no
   blocking of script execution (the other scripts still run but
   are visually hidden, which is fine for the MVP).
   ========================================================= */

(function () {
    'use strict';

    if (document.getElementById('mobile-gate')) return;

    const html = `
        <div id="mobile-gate" class="mobile-gate" role="dialog" aria-modal="true">
            <div class="mobile-gate-card">
                <div class="mobile-gate-brand">
                    <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
                        <circle cx="9" cy="9" r="8" fill="none" stroke="currentColor" stroke-width="1.2"/>
                        <path d="M 9 1 A 8 8 0 0 1 9 17 Z" fill="currentColor"/>
                    </svg>
                    <span class="mobile-gate-name">grading<span class="mobile-gate-dot">-</span>game</span>
                </div>
                <div class="mobile-gate-eyebrow">display requirement</div>
                <h2 class="mobile-gate-title">Desktop only</h2>
                <p class="mobile-gate-body">
                    The game is designed for a screen at least
                    <strong>800&nbsp;px wide</strong>.
                    Please open this URL on a laptop or desktop to play.
                </p>
                <div class="mobile-gate-meta">
                    <span>viewport · <strong class="mobile-gate-w">—</strong>&nbsp;px</span>
                    <span class="mobile-gate-sep">·</span>
                    <span>required · ≥&nbsp;800&nbsp;px</span>
                </div>
            </div>
        </div>
    `;

    function inject() {
        if (document.getElementById('mobile-gate')) return;
        if (!document.body) {
            document.addEventListener('DOMContentLoaded', inject, { once: true });
            return;
        }
        document.body.insertAdjacentHTML('afterbegin', html);
        updateWidth();
        window.addEventListener('resize', updateWidth);
    }

    function updateWidth() {
        const el = document.querySelector('#mobile-gate .mobile-gate-w');
        if (el) el.textContent = String(window.innerWidth);
    }

    inject();
})();
