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
        injectStyles();

        // Pick mount + insertion strategy based on viewport.
        //   Desktop: insert into .top-bar-right (existing behavior — pills sit
        //            left of the version-tag / auth widget / audio widget).
        //   Mobile:  inject into a dedicated .mobile-chrome-footer appended
        //            at the very end of <body>. On the landing page that
        //            means the pills land right under the donate button.
        //            On other pages they sit at the bottom of the page.
        const isMobile = window.matchMedia && window.matchMedia('(max-width: 799px)').matches;

        let mount;
        let insertMode;
        if (isMobile) {
            mount = ensureMobileFooter();
            insertMode = 'append';   // visual order = DOM order
        } else {
            mount = document.querySelector('.top-bar-right');
            if (!mount) return;       // game/room have non-standard headers — desktop only
            insertMode = 'prepend';   // first-child → ends up leftmost
        }

        // Order matters: on desktop we prepend, so the LAST one we insert
        // ends up leftmost. On mobile we append, so order follows insertion.
        // Final visual order (both): info · legal.
        if (insertMode === 'prepend') {
            // Reverse order so the *last* insert is "info" on the left
            maybeInjectLink({ id: 'chrome-legal-link', href: 'legal.html',
                              text: 'legal', title: 'Terms · Privacy · Copyright',
                              mount, insertMode });
            maybeInjectLink({ id: 'chrome-info-link',  href: 'info.html',
                              text: 'info',  title: 'Credits & patch notes',
                              mount, insertMode });
        } else {
            maybeInjectLink({ id: 'chrome-info-link',  href: 'info.html',
                              text: 'info',  title: 'Credits & patch notes',
                              mount, insertMode });
            maybeInjectLink({ id: 'chrome-legal-link', href: 'legal.html',
                              text: 'legal', title: 'Terms · Privacy · Copyright',
                              mount, insertMode });
        }
    }

    function ensureMobileFooter() {
        let footer = document.querySelector('.mobile-chrome-footer');
        if (!footer) {
            footer = document.createElement('div');
            footer.className = 'mobile-chrome-footer';
            document.body.appendChild(footer);
        }
        return footer;
    }

    function maybeInjectLink({ id, href, text, title, mount, insertMode }) {
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

        if (insertMode === 'append') {
            mount.appendChild(link);
        } else {
            mount.insertBefore(link, mount.firstChild);
        }
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

            /* Two links sit shoulder-to-shoulder on desktop. */
            .chrome-link + .chrome-link {
                margin-left: 6px;
            }

            /* Mobile footer container — appended to <body> on narrow
               viewports. On the landing page it lands right under the
               donate button; on other pages it's the very bottom of
               the page. Two pills, centered, breathing space below
               so it isn't clipped by the iOS Safari bottom toolbar. */
            .mobile-chrome-footer {
                display: none;
            }
            @media (max-width: 799px) {
                .mobile-chrome-footer {
                    display: flex;
                    justify-content: center;
                    gap: 10px;
                    padding: 18px 16px 32px;
                }
                .mobile-chrome-footer .chrome-link {
                    margin-left: 0;
                    padding: 8px 18px;
                    font-size: 11px;
                }
            }
        `;
        document.head.appendChild(style);
    }

})();
