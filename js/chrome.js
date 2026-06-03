/* =========================================================
   chrome.js — small "page chrome" extras injected globally.

   Currently adds three pill links in the top bar:
     · "donate" → buymeacoffee (accent pill — support the project)
     · "info"   → info.html  (credits + patch notes)
     · "legal"  → legal.html (terms / privacy / copyright)

   Mounts on any page that has the standard `.top-bar-right`
   container — skips game.html / room.html (custom headers)
   and the destination page itself (no point linking to self).

   Loaded from head-common.html so it shows up everywhere with
   no per-page wiring needed.
   ========================================================= */

(function () {
    'use strict';

    /* Single source of truth for the visible site version.
       Bump this string when releasing a new patch-card in info.html
       so the "v…" pill in the index.html top bar stays in sync.
       The pill is updated client-side so we don't need a build step.
       Exposed on window for potential future read-only consumers. */
    const SITE_VERSION = '1.7.0';
    window.GG_VERSION = SITE_VERSION;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    function init() {
        injectChromeLinks();
        injectDonate();
        injectLangPicker();
        updateVersionTag();
        // Update info / legal pill labels (and their tooltip titles) once
        // i18n is ready. They were created with English defaults in
        // injectChromeLinks above so the swap is now just a textContent
        // refresh — guards against i18n loading after chrome.js for
        // whatever reason.
        translateChromeLinks();
    }

    /* Re-apply i18n-driven labels to the info / legal pills, plus the
       online pill if presence.js already mounted it. Idempotent. */
    function translateChromeLinks() {
        if (!window.gg_i18n) return;
        const t = window.gg_i18n.t;
        const info  = document.getElementById('chrome-info-link');
        const legal = document.getElementById('chrome-legal-link');
        if (info)  { info.textContent  = t('chrome.info');  info.setAttribute('title',  t('chrome.info_title')); }
        if (legal) { legal.textContent = t('chrome.legal'); legal.setAttribute('title', t('chrome.legal_title')); }
        const donate = document.getElementById('chrome-donate-link');
        if (donate) {
            const lbl = donate.querySelector('.chrome-donate-label');
            if (lbl) lbl.textContent = t('donate.label');
            donate.setAttribute('title', t('donate.title'));
        }
        const onlineLabel = document.querySelector('.online-pill .online-pill-label');
        if (onlineLabel) onlineLabel.textContent = t('online.label');
    }

    function updateVersionTag() {
        // Only the landing page has #gg-version-tag — other pages keep
        // their section labels (e.g. "08 · info"). The id makes the
        // intent explicit and avoids accidentally rewriting other tags.
        const el = document.getElementById('gg-version-tag');
        if (el) el.textContent = 'v' + SITE_VERSION;
    }

    function injectChromeLinks() {
        injectStyles();

        // Pick mount + insertion strategy based on viewport.
        //   Desktop: insert into .top-bar-right (existing behavior — pills sit
        //            left of the version-tag / auth widget).
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

    /* Language picker — native <select> styled to match the chrome
       pills. Mounted alongside info / legal: top-bar on desktop,
       mobile-chrome-footer on mobile. Single-source for choosing
       and persisting the active locale. */
    function injectLangPicker() {
        if (document.getElementById('chrome-lang-picker')) return;
        if (!window.gg_i18n) return;

        const isMobile = window.matchMedia
            && window.matchMedia('(max-width: 799px)').matches;

        const mount = isMobile
            ? ensureMobileFooter()
            : document.querySelector('.top-bar-right');
        if (!mount) return;   // game/room desktop have no top-bar-right — skip

        const select = document.createElement('select');
        select.id = 'chrome-lang-picker';
        select.className = 'chrome-lang-picker';
        select.setAttribute('aria-label', window.gg_i18n.t('chrome.lang_label'));

        const current = window.gg_i18n.getLang();
        window.gg_i18n.SUPPORTED.forEach((code) => {
            const opt = document.createElement('option');
            opt.value = code;
            opt.textContent = code.toUpperCase();
            if (code === current) opt.selected = true;
            select.appendChild(opt);
        });

        select.addEventListener('change', (e) => {
            window.gg_i18n.setLang(e.target.value);
        });

        // Desktop: prepend so it sits alongside the other pills.
        // Mobile footer: append so it lines up with info + legal + online.
        if (isMobile) {
            mount.appendChild(select);
        } else {
            mount.insertBefore(select, mount.firstChild);
        }
    }

    /* Donate / "soutenir" pill — an accent-tinted external link to the
       support page. Lives next to info / legal: top-bar on desktop,
       mobile-chrome-footer on mobile. Label + tooltip get translated in
       translateChromeLinks() once i18n is ready (created with the English
       default 'donate' here). Skipped on game / room (no top-bar-right). */
    function injectDonate() {
        if (document.getElementById('chrome-donate-link')) return;

        const isMobile = window.matchMedia
            && window.matchMedia('(max-width: 799px)').matches;
        const mount = isMobile
            ? ensureMobileFooter()
            : document.querySelector('.top-bar-right');
        if (!mount) return;

        const link = document.createElement('a');
        link.id = 'chrome-donate-link';
        link.className = 'chrome-link chrome-link--donate';
        link.href = 'https://buymeacoffee.com/jarodbuisson';
        link.target = '_blank';
        link.rel = 'noopener';
        link.setAttribute('title', 'Support the project');
        link.innerHTML =
            '<span class="chrome-donate-icon" aria-hidden="true">♥</span>' +
            '<span class="chrome-donate-label">donate</span>';

        if (isMobile) {
            mount.appendChild(link);
        } else {
            // Prepend so the support pill sits leftmost of the chrome group.
            mount.insertBefore(link, mount.firstChild);
        }
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

            /* Donate / support pill — accent-tinted so it stands out a
               touch from the neutral info / legal pills, and fills solid
               on hover. */
            .chrome-link--donate {
                gap: 6px;
                color: var(--accent);
                border-color: rgba(212, 148, 107, 0.45);
            }
            .chrome-link--donate:hover {
                color: #0a0a0b;
                background: var(--accent);
                border-color: var(--accent);
            }
            .chrome-donate-icon { font-size: 11px; line-height: 1; }

            /* Language picker — native <select> styled to match the
               chrome pills. Native chrome stripped via appearance:none
               + custom caret SVG so it looks at home next to info/legal. */
            .chrome-lang-picker {
                margin-left: 6px;
                padding: 4px 22px 4px 10px;
                background: transparent;
                border: 1px solid var(--border-subtle);
                border-radius: 999px;
                font-family: var(--font-mono);
                font-size: 10px;
                color: var(--text-tertiary);
                text-transform: uppercase;
                letter-spacing: var(--tracking-wide);
                cursor: pointer;
                appearance: none;
                -webkit-appearance: none;
                -moz-appearance: none;
                background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6' fill='none' stroke='%237a7a7e' stroke-width='1.4'><path d='M1 1 L5 5 L9 1'/></svg>");
                background-repeat: no-repeat;
                background-position: right 8px center;
                background-size: 8px 5px;
                transition:
                    color var(--t-fast),
                    border-color var(--t-fast),
                    background-color var(--t-fast);
            }
            .chrome-lang-picker:hover,
            .chrome-lang-picker:focus {
                color: var(--accent);
                border-color: var(--accent);
                background-color: var(--accent-soft);
                outline: none;
            }
            .chrome-lang-picker option {
                background: var(--bg-elev-1);
                color: var(--text-primary);
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
