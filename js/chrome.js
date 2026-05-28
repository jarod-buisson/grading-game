/* =========================================================
   chrome.js — small "page chrome" extras injected globally.

   Currently adds two discreet pill links in the top bar:
     · "info"  → info.html  (credits + patch notes)
     · "legal" → legal.html (terms / privacy / copyright)

   Mounts on any page that has the standard `.top-bar-right`
   container — skips game.html / room.html (custom headers)
   and the destination page itself (no point linking to self).

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
        injectChromeLinks();
    }

    function injectChromeLinks() {
        const mount = document.querySelector('.top-bar-right');
        if (!mount) return;  // game/room have non-standard headers, leave them alone

        injectStyles();

        // Order matters: we insert each link as the FIRST child of
        // .top-bar-right, so the LAST one we insert ends up leftmost.
        // Final visual order (left → right): info · legal · …rest.
        // → insert legal first, then info on top of it.
        maybeInjectLink({
            id:    'chrome-legal-link',
            href:  'legal.html',
            text:  'legal',
            title: 'Terms of Service · Privacy Policy · Copyright',
            mount
        });
        maybeInjectLink({
            id:    'chrome-info-link',
            href:  'info.html',
            text:  'info',
            title: 'Credits & patch notes',
            mount
        });
    }

    function maybeInjectLink({ id, href, text, title, mount }) {
        // Already injected on this page? bail
        if (document.getElementById(id)) return;

        // Skip on the destination page itself (no point linking to self)
        const here = window.location.pathname.toLowerCase();
        if (here.endsWith('/' + href.toLowerCase()) || here.endsWith(href.toLowerCase())) return;

        const link = document.createElement('a');
        link.id = id;
        link.className = 'chrome-link';
        link.href = href;
        link.textContent = text;
        link.setAttribute('title', title);

        mount.insertBefore(link, mount.firstChild);
    }

    function injectStyles() {
        if (document.getElementById('chrome-styles')) return;
        const style = document.createElement('style');
        style.id = 'chrome-styles';
        style.textContent = `
            .chrome-link {
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
            .chrome-link:hover {
                color: var(--accent);
                border-color: var(--accent);
                background: var(--accent-soft);
            }

            /* Two links sit shoulder-to-shoulder; tiny gap between
               them via margin-left on every chrome-link that follows
               another chrome-link. */
            .chrome-link + .chrome-link {
                margin-left: 6px;
            }

            /* Hide on narrow viewports so it doesn't clash with the
               desktop-only mobile gate. */
            @media (max-width: 799px) {
                .chrome-link { display: none; }
            }
        `;
        document.head.appendChild(style);
    }

})();
