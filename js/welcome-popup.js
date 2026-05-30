/* =========================================================
   welcome-popup.js — first-visit explainer modal.

   Shown ONCE per browser (localStorage flag) when the user
   lands on index.html. Three-step "how to play" summary +
   primary CTA "Let's go" and a secondary link to /rules.

   Dismiss = clicks on the CTA, the close (✕), the overlay,
   or pressing Escape. Any of those sets the flag so the
   modal never reappears for that browser.

   Mobile-first markup: card fills the screen padding on
   narrow viewports, the 3 step bullets stay readable.
   ========================================================= */

(function () {
    'use strict';

    const DISMISS_KEY = 'gradinggame.welcome.dismissed';

    /* Already seen? bail before touching the DOM */
    try {
        if (localStorage.getItem(DISMISS_KEY) === '1') return;
    } catch (_) {
        /* localStorage blocked (e.g. Safari private mode) — show
           the modal anyway. Better to remind every visit than to
           hide the explainer entirely. */
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount, { once: true });
    } else {
        mount();
    }

    function mount() {
        injectStyles();

        /* Resolve translation strings up-front. If i18n hasn't loaded
           yet (e.g. script-order quirk), `t` becomes an identity
           function so we render the english keys as a graceful
           fallback — the user still sees readable text. */
        const t = (window.gg_i18n && window.gg_i18n.t)
            ? window.gg_i18n.t
            : (key) => key;

        const overlay = document.createElement('div');
        overlay.className = 'welcome-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'welcome-title');
        overlay.innerHTML = `
            <div class="welcome-card">
                <button class="welcome-close" type="button" aria-label="${t('welcome.close_aria')}">✕</button>
                <div class="welcome-eyebrow">${t('welcome.eyebrow')}</div>
                <h2 class="welcome-title" id="welcome-title">${t('welcome.title')}</h2>
                <p class="welcome-lead">${t('welcome.lead')}</p>

                <ol class="welcome-steps">
                    <li class="welcome-step">
                        <span class="welcome-step-num">01</span>
                        <span class="welcome-step-body">
                            <strong>${t('welcome.step1_title')}</strong>
                            <span>${t('welcome.step1_body')}</span>
                        </span>
                    </li>
                    <li class="welcome-step">
                        <span class="welcome-step-num">02</span>
                        <span class="welcome-step-body">
                            <strong>${t('welcome.step2_title')}</strong>
                            <span>${t('welcome.step2_body')}</span>
                        </span>
                    </li>
                    <li class="welcome-step">
                        <span class="welcome-step-num">03</span>
                        <span class="welcome-step-body">
                            <strong>${t('welcome.step3_title')}</strong>
                            <span>${t('welcome.step3_body')}</span>
                        </span>
                    </li>
                </ol>

                <div class="welcome-actions">
                    <button class="welcome-cta" type="button">
                        <span>${t('welcome.cta')}</span>
                        <span class="welcome-cta-arrow" aria-hidden="true">→</span>
                    </button>
                    <a class="welcome-rules-link" href="about.html">
                        ${t('welcome.full_rules')}
                    </a>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        /* ── Dismiss wiring ──────────────────────────────────── */
        let dismissed = false;
        function dismiss() {
            if (dismissed) return;
            dismissed = true;
            try { localStorage.setItem(DISMISS_KEY, '1'); } catch (_) {}
            overlay.classList.add('is-closing');
            document.removeEventListener('keydown', onKey);
            setTimeout(() => overlay.remove(), 240);
        }
        function onKey(e) {
            if (e.key === 'Escape') dismiss();
        }

        overlay.querySelector('.welcome-close').addEventListener('click', dismiss);
        overlay.querySelector('.welcome-cta').addEventListener('click', dismiss);
        /* Tapping the dim background also closes — but only if the click
           target is the overlay itself, not a child bubbling up. */
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) dismiss();
        });
        document.addEventListener('keydown', onKey);

        /* Trigger the open animation on the next frame so the browser
           paints the initial (hidden) state before transitioning. */
        requestAnimationFrame(() => overlay.classList.add('is-open'));
    }

    /* ─────────────────────────────────────────────────────────
       Styles. Inlined here so the popup is one self-contained
       file you can drop on any page later.
       ───────────────────────────────────────────────────────── */
    function injectStyles() {
        if (document.getElementById('welcome-popup-styles')) return;
        const style = document.createElement('style');
        style.id = 'welcome-popup-styles';
        style.textContent = `
            .welcome-overlay {
                position: fixed;
                inset: 0;
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 24px;
                background: rgba(6, 6, 9, 0.78);
                backdrop-filter: blur(6px);
                -webkit-backdrop-filter: blur(6px);
                opacity: 0;
                transition: opacity 240ms ease;
                pointer-events: auto;
            }
            .welcome-overlay.is-open { opacity: 1; }
            .welcome-overlay.is-closing { opacity: 0; }

            .welcome-card {
                position: relative;
                width: 100%;
                max-width: 520px;
                max-height: calc(100vh - 48px);
                overflow-y: auto;
                padding: 32px 32px 28px;
                background: var(--bg-elev-2, #14141a);
                border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
                border-radius: 4px;
                box-shadow: 0 24px 64px -16px rgba(0,0,0,0.7);
                transform: translateY(8px) scale(0.97);
                opacity: 0;
                transition:
                    transform 280ms cubic-bezier(0.2, 0.7, 0.2, 1),
                    opacity   280ms ease;
            }
            .welcome-overlay.is-open .welcome-card {
                transform: translateY(0) scale(1);
                opacity: 1;
            }

            .welcome-close {
                position: absolute;
                top: 14px;
                right: 14px;
                width: 30px;
                height: 30px;
                padding: 0;
                background: transparent;
                border: 1px solid var(--border-subtle, rgba(255,255,255,0.08));
                border-radius: 50%;
                color: var(--text-tertiary, #7a7a7e);
                font-family: var(--font-mono, monospace);
                font-size: 13px;
                cursor: pointer;
                transition:
                    color 160ms ease,
                    border-color 160ms ease,
                    background 160ms ease;
            }
            .welcome-close:hover {
                color: var(--accent-red, #d96055);
                border-color: rgba(217, 96, 85, 0.5);
                background: rgba(217, 96, 85, 0.08);
            }

            .welcome-eyebrow {
                font-family: var(--font-mono, monospace);
                font-size: 10px;
                color: var(--accent, #d4a574);
                text-transform: uppercase;
                letter-spacing: 0.18em;
                margin-bottom: 8px;
            }
            .welcome-title {
                font-family: var(--font-ui, sans-serif);
                font-size: 26px;
                font-weight: 500;
                letter-spacing: -0.02em;
                color: var(--text-primary, #e8e8ea);
                line-height: 1.15;
                margin: 0 0 12px;
            }
            .welcome-lead {
                font-family: var(--font-ui, sans-serif);
                font-size: 14px;
                line-height: 1.6;
                color: var(--text-secondary, #b4b4b8);
                margin: 0 0 22px;
            }

            .welcome-steps {
                list-style: none;
                counter-reset: none;
                padding: 0;
                margin: 0 0 22px;
                display: flex;
                flex-direction: column;
                gap: 14px;
            }
            .welcome-step {
                display: flex;
                gap: 14px;
                align-items: flex-start;
                padding: 14px 14px;
                background: var(--bg-elev-1, rgba(255,255,255,0.025));
                border: 1px solid var(--border-faint, rgba(255,255,255,0.04));
                border-radius: 3px;
            }
            .welcome-step-num {
                flex-shrink: 0;
                font-family: var(--font-mono, monospace);
                font-size: 11px;
                color: var(--accent, #d4a574);
                letter-spacing: 0.1em;
                padding-top: 1px;
                min-width: 22px;
            }
            .welcome-step-body {
                display: flex;
                flex-direction: column;
                gap: 2px;
                min-width: 0;
                font-family: var(--font-ui, sans-serif);
                font-size: 13px;
                line-height: 1.5;
                color: var(--text-secondary, #b4b4b8);
            }
            .welcome-step-body strong {
                color: var(--text-primary, #e8e8ea);
                font-weight: 500;
                letter-spacing: -0.005em;
            }

            .welcome-actions {
                display: flex;
                flex-direction: column;
                gap: 12px;
                align-items: stretch;
            }
            .welcome-cta {
                display: flex;
                justify-content: space-between;
                align-items: center;
                width: 100%;
                padding: 14px 20px;
                background: var(--accent-soft, rgba(212, 165, 116, 0.1));
                border: 1px solid var(--accent, #d4a574);
                border-radius: 3px;
                font-family: var(--font-mono, monospace);
                font-size: 12px;
                font-weight: 500;
                text-transform: uppercase;
                letter-spacing: 0.12em;
                color: var(--accent, #d4a574);
                cursor: pointer;
                transition:
                    color 160ms ease,
                    background 160ms ease,
                    box-shadow 160ms ease;
            }
            .welcome-cta:hover {
                color: var(--bg-base, #0a0a0b);
                background: var(--accent, #d4a574);
                box-shadow: 0 0 20px rgba(212, 165, 116, 0.25);
            }
            .welcome-cta-arrow { font-size: 16px; transition: transform 160ms ease; }
            .welcome-cta:hover .welcome-cta-arrow { transform: translateX(4px); }

            .welcome-rules-link {
                font-family: var(--font-mono, monospace);
                font-size: 11px;
                color: var(--text-tertiary, #7a7a7e);
                text-decoration: none;
                text-transform: uppercase;
                letter-spacing: 0.12em;
                text-align: center;
                padding: 6px 0;
                transition: color 160ms ease;
            }
            .welcome-rules-link:hover {
                color: var(--accent, #d4a574);
            }

            /* Mobile — same shell, tighter padding so it breathes on
               a 375 px viewport. */
            @media (max-width: 599px) {
                .welcome-overlay { padding: 16px; }
                .welcome-card { padding: 26px 22px 22px; }
                .welcome-title { font-size: 22px; }
                .welcome-lead { font-size: 13px; }
                .welcome-step { padding: 12px 12px; }
                .welcome-step-body { font-size: 12px; }
            }

            /* Honor the OS "reduced motion" setting — drop the animations
               but keep the modal usable. */
            @media (prefers-reduced-motion: reduce) {
                .welcome-overlay,
                .welcome-overlay .welcome-card { transition: none; }
            }
        `;
        document.head.appendChild(style);
    }

})();
