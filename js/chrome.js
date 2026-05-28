/* =========================================================
   chrome.js — small "page chrome" extras injected globally.

   Currently just adds a discreet "legal" link in the top bar
   so every page has a stable path to the legal/privacy/terms
   info. Mounts on any page that has the standard `.top-bar-right`
   container — skips game.html / room.html (which use their own
   header layouts) and legal.html itself.

   Loaded from head-common.html so it shows up everywhere with
   no per-page wiring needed.
   ========================================================= */

(function () {
    'use strict';

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    function init() {
        injectLegalLink();
    }

    function injectLegalLink() {
        if (document.getElementById('chrome-legal-link')) return;

        // Skip on the legal page itself — no point linking to self
        if (/legal\.html$/i.test(window.location.pathname)) return;

        const mount = document.querySelector('.top-bar-right');
        if (!mount) return;  // game/room have non-standard headers, leave them alone

        injectStyles();

        const link = document.createElement('a');
        link.id = 'chrome-legal-link';
        link.className = 'chrome-legal-link';
        link.href = 'legal.html';
        link.textContent = 'legal';
        link.setAttribute('title', 'Terms of Service · Privacy Policy · Copyright');

        // Insert as the FIRST child of top-bar-right so it sits leftmost
        // in the right group — before the version-tag, auth chip,
        // online pill and audio widget. Discreet but always visible.
        mount.insertBefore(link, mount.firstChild);
    }

    function injectStyles() {
        if (document.getElementById('chrome-styles')) return;
        const style = document.createElement('style');
        style.id = 'chrome-styles';
        style.textContent = `
            .chrome-legal-link {
                display: inline-flex;
                align-items: center;
                padding: 4px 12px;
                background: transparent;
                border: 1px solid var(--border-subtle);
                border-radius: 999px;
                font-family: var(--font-mono);
                font-size: 10px;
                color: var(--text-tertiary);
                text-transform: uppercase;
                letter-spacing: var(--tracking-wide);
                text-decoration: none;
                transition:
                    color var(--t-fast),
                    border-color var(--t-fast),
                    background var(--t-fast);
            }
            .chrome-legal-link:hover {
                color: var(--accent);
                border-color: var(--accent);
                background: var(--accent-soft);
            }

            /* Hide on narrow viewports so it doesn't clash with the
               desktop-only mobile gate. */
            @media (max-width: 799px) {
                .chrome-legal-link { display: none; }
            }
        `;
        document.head.appendChild(style);
    }

})();
