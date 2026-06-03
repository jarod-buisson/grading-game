/* =========================================================
   auth-ui.js — global "Sign in / Avatar" widget for the top bar.

   Behavior:
     - Anonymous user → shows a "sign in" button
     - Authenticated user → shows avatar + nickname with a dropdown
       (view profile, sign out)

   Requires:
     window.gg from supabase-client.js (loaded before this script).

   Self-contained: injects its own CSS, no external stylesheet needed.
   ========================================================= */

(function () {
    'use strict';

    // The widget injects DOM into the top bar, so we MUST wait for the
    // body to be parsed. This script is loaded from head-common.html
    // (so it lives in <head>), which means it runs before <body> exists
    // unless we defer init until DOMContentLoaded.
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    function init() {
        console.log('[auth-ui] init · readyState =', document.readyState);
        if (document.getElementById('auth-widget')) return;
        if (!window.gg) {
            console.warn('[auth-ui] window.gg not found — load supabase-client.js first');
            return;
        }
        run();
    }

    function run() {
        console.log('[auth-ui] run() · looking for mount point…');

    /* ---------- Inject CSS once per page ---------- */
    const css = `
        .auth-widget {
            position: relative;
            display: inline-flex;
            align-items: center;
        }

        /* Sign-in button (shown when anon) */
        .auth-signin-btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            font-family: var(--font-mono);
            font-size: 11px;
            color: var(--text-secondary);
            background: var(--bg-elev-1);
            border: 1px solid var(--border-subtle);
            border-radius: 3px;
            text-transform: uppercase;
            letter-spacing: var(--tracking-wide);
            cursor: pointer;
            transition:
                color var(--t-fast),
                border-color var(--t-fast),
                background var(--t-fast);
        }
        .auth-signin-btn:hover {
            color: var(--accent);
            border-color: var(--accent);
            background: var(--accent-soft);
        }
        .auth-signin-btn .auth-google-icon {
            width: 13px;
            height: 13px;
            flex-shrink: 0;
        }
        .auth-signin-btn.is-loading {
            opacity: 0.5;
            pointer-events: none;
        }

        /* Authenticated chip + dropdown */
        .auth-chip {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 4px 12px 4px 4px;
            font-family: var(--font-mono);
            font-size: 11px;
            color: var(--text-secondary);
            background: var(--bg-elev-1);
            border: 1px solid var(--border-subtle);
            border-radius: 999px;
            cursor: pointer;
            transition:
                color var(--t-fast),
                border-color var(--t-fast),
                background var(--t-fast);
        }
        .auth-chip:hover {
            color: var(--text-primary);
            border-color: var(--border);
        }
        .auth-chip.is-open {
            border-color: var(--accent);
            color: var(--accent);
        }
        .auth-avatar {
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: var(--bg-elev-2);
            border: 1px solid var(--border-subtle);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            flex-shrink: 0;
        }
        .auth-avatar img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }
        .auth-avatar-fallback {
            font-family: var(--font-mono);
            font-size: 11px;
            font-weight: 500;
            color: var(--accent);
            text-transform: uppercase;
            letter-spacing: 0;
        }
        .auth-nickname {
            letter-spacing: var(--tracking-mono);
        }
        .auth-chip-caret {
            font-size: 8px;
            color: var(--text-quaternary);
            margin-left: -2px;
        }

        /* Dropdown */
        .auth-dropdown {
            position: absolute;
            top: calc(100% + 8px);
            right: 0;
            min-width: 200px;
            background: var(--bg-elev-1);
            border: 1px solid var(--border-subtle);
            border-radius: 3px;
            padding: 6px;
            display: flex;
            flex-direction: column;
            gap: 2px;
            z-index: 1000;
            box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.5);
            opacity: 0;
            visibility: hidden;
            transform: translateY(-4px);
            transition:
                opacity var(--t-fast),
                visibility var(--t-fast),
                transform var(--t-fast);
        }
        .auth-dropdown.is-open {
            opacity: 1;
            visibility: visible;
            transform: translateY(0);
        }
        .auth-dropdown-head {
            padding: 8px 10px 10px;
            border-bottom: 1px solid var(--border-faint);
            margin-bottom: 4px;
        }
        .auth-dropdown-name {
            font-family: var(--font-ui);
            font-size: 13px;
            color: var(--text-primary);
            font-weight: 500;
        }
        .auth-dropdown-handle {
            font-family: var(--font-mono);
            font-size: 10px;
            color: var(--text-tertiary);
            margin-top: 2px;
            letter-spacing: var(--tracking-mono);
        }
        .auth-dropdown-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 10px;
            font-family: var(--font-mono);
            font-size: 11px;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: var(--tracking-wide);
            cursor: pointer;
            background: transparent;
            border: none;
            border-radius: 2px;
            text-align: left;
            transition: background var(--t-fast), color var(--t-fast);
            text-decoration: none;
        }
        .auth-dropdown-item:hover {
            background: var(--bg-elev-2);
            color: var(--text-primary);
        }
        .auth-dropdown-item.is-danger:hover {
            color: var(--accent-red, #d96055);
        }
        .auth-dropdown-icon {
            width: 12px;
            height: 12px;
            flex-shrink: 0;
            opacity: 0.7;
        }


        /* =========================================================
           LOGIN MODAL — provider-choice dialog
           ========================================================= */
        .auth-login-modal {
            position: fixed;
            inset: 0;
            z-index: 2000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            animation: auth-modal-fade-in var(--t-fast) ease-out;
        }
        .auth-login-modal[hidden] { display: none; }

        @keyframes auth-modal-fade-in {
            from { opacity: 0; }
            to   { opacity: 1; }
        }

        .auth-login-backdrop {
            position: absolute;
            inset: 0;
            background: rgba(0, 0, 0, 0.72);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            cursor: pointer;
        }

        .auth-login-card {
            position: relative;
            width: 100%;
            max-width: 420px;
            padding: 32px 28px 24px;
            background: var(--bg-elev-1);
            border: 1px solid var(--border);
            border-radius: 4px;
            box-shadow: 0 32px 80px -24px rgba(0, 0, 0, 0.7);
            display: flex;
            flex-direction: column;
            gap: 14px;
            animation: auth-modal-card-in 0.22s ease-out;
        }

        @keyframes auth-modal-card-in {
            from { opacity: 0; transform: translateY(8px) scale(0.985); }
            to   { opacity: 1; transform: translateY(0)   scale(1); }
        }

        .auth-login-close {
            position: absolute;
            top: 14px;
            right: 14px;
            background: transparent;
            border: none;
            font-family: var(--font-mono);
            font-size: 10px;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: var(--tracking-wide);
            cursor: pointer;
            transition: color var(--t-fast);
        }
        .auth-login-close:hover { color: var(--text-primary); }

        .auth-login-eyebrow {
            font-family: var(--font-mono);
            font-size: 10px;
            color: var(--accent);
            text-transform: uppercase;
            letter-spacing: var(--tracking-wide);
        }

        .auth-login-title {
            font-family: var(--font-ui);
            font-size: 26px;
            font-weight: 500;
            letter-spacing: -0.02em;
            color: var(--text-primary);
            line-height: 1.15;
            margin: 0;
        }

        .auth-login-intro {
            font-family: var(--font-ui);
            font-size: 13px;
            line-height: 1.55;
            color: var(--text-secondary);
            margin: 0;
        }

        .auth-login-buttons {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-top: 8px;
        }

        .auth-login-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            padding: 14px 18px;
            background: var(--bg-elev-2);
            border: 1px solid var(--border-subtle);
            border-radius: 3px;
            font-family: var(--font-mono);
            font-size: 12px;
            color: var(--text-primary);
            text-transform: uppercase;
            letter-spacing: var(--tracking-wide);
            cursor: pointer;
            transition:
                background var(--t-fast),
                border-color var(--t-fast),
                color var(--t-fast),
                transform var(--t-fast);
        }
        .auth-login-btn:hover:not(:disabled) {
            transform: translateY(-1px);
            border-color: var(--border);
        }
        .auth-login-btn:disabled {
            opacity: 0.5;
            cursor: wait;
        }
        .auth-login-icon {
            width: 18px;
            height: 18px;
            flex-shrink: 0;
        }

        /* Provider-specific hover accents */
        .auth-login-btn--discord {
            color: #fff;
        }
        .auth-login-btn--discord .auth-login-icon { color: #5865F2; }
        .auth-login-btn--discord:hover:not(:disabled) {
            border-color: #5865F2;
            background: rgba(88, 101, 242, 0.12);
        }

        .auth-login-btn--google:hover:not(:disabled) {
            border-color: var(--accent);
            background: var(--accent-soft);
        }

        .auth-login-disclaimer {
            font-family: var(--font-ui);
            font-size: 11px;
            line-height: 1.55;
            color: var(--text-tertiary);
            margin: 14px 0 0;
            padding-top: 14px;
            border-top: 1px solid var(--border-faint);
        }
        .auth-login-disclaimer strong {
            color: var(--text-secondary);
            font-weight: 500;
        }
        .auth-login-disclaimer a {
            color: var(--accent);
            text-decoration: none;
            border-bottom: 1px dotted var(--accent);
        }
        .auth-login-disclaimer a:hover {
            color: var(--text-primary);
            border-color: var(--text-primary);
        }

        /* ---------- Email form ---------- */
        .auth-login-sep {
            display: flex;
            align-items: center;
            gap: 12px;
            font-family: var(--font-mono);
            font-size: 10px;
            color: var(--text-quaternary);
            text-transform: uppercase;
            letter-spacing: var(--tracking-wide);
            margin: 4px 0;
        }
        .auth-login-sep::before,
        .auth-login-sep::after {
            content: "";
            flex: 1;
            height: 1px;
            background: var(--border-faint);
        }

        .auth-email-form {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .auth-email-field {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .auth-email-field label {
            font-family: var(--font-mono);
            font-size: 9px;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: var(--tracking-wide);
        }
        .auth-email-input-wrap {
            position: relative;
            display: flex;
            align-items: stretch;
        }
        .auth-email-input-wrap input {
            flex: 1;
            background: var(--bg-elev-2);
            border: 1px solid var(--border-subtle);
            border-radius: 2px;
            color: var(--text-primary);
            font-family: var(--font-ui);
            font-size: 14px;     /* >= 16px on mobile via .mobile-friendly below */
            padding: 10px 12px;
            outline: none;
            transition: border-color var(--t-fast);
        }
        .auth-email-input-wrap input:focus {
            border-color: var(--accent);
        }
        .auth-email-input-wrap input::placeholder {
            color: var(--text-quaternary);
        }
        .auth-email-input-wrap input.is-invalid {
            border-color: var(--accent-red, #d96055);
        }
        /* iOS Safari focus-zoom prevention */
        @media (max-width: 799px) {
            .auth-email-input-wrap input { font-size: 16px; }
        }

        .auth-password-toggle {
            position: absolute;
            top: 0;
            right: 0;
            height: 100%;
            width: 38px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            background: transparent;
            border: none;
            color: var(--text-tertiary);
            cursor: pointer;
            font-family: var(--font-mono);
            font-size: 11px;
            transition: color var(--t-fast);
        }
        .auth-password-toggle:hover { color: var(--accent); }

        .auth-field-hint {
            font-family: var(--font-mono);
            font-size: 9px;
            color: var(--text-quaternary);
            text-transform: uppercase;
            letter-spacing: var(--tracking-wide);
            margin-top: 2px;
        }
        .auth-field-hint.is-error {
            color: var(--accent-red, #d96055);
        }
        .auth-field-hint.is-success {
            color: var(--accent-green, #5fa86d);
        }

        .auth-submit-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            padding: 12px 18px;
            background: var(--accent-soft, rgba(212, 165, 116, 0.12));
            border: 1px solid var(--accent);
            border-radius: 3px;
            font-family: var(--font-mono);
            font-size: 12px;
            font-weight: 500;
            color: var(--accent);
            text-transform: uppercase;
            letter-spacing: var(--tracking-wide);
            cursor: pointer;
            margin-top: 4px;
            transition:
                color var(--t-fast),
                background var(--t-fast),
                box-shadow var(--t-fast);
        }
        .auth-submit-btn:hover:not(:disabled) {
            color: var(--bg-base);
            background: var(--accent);
            box-shadow: 0 0 20px rgba(212, 165, 116, 0.25);
        }
        .auth-submit-btn:disabled {
            opacity: 0.55;
            cursor: wait;
        }

        .auth-mode-switch {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            font-family: var(--font-mono);
            font-size: 11px;
            color: var(--text-tertiary);
            text-transform: uppercase;
            letter-spacing: var(--tracking-wide);
            margin-top: 6px;
            flex-wrap: wrap;
        }
        .auth-mode-switch button {
            background: transparent;
            border: none;
            color: var(--accent);
            cursor: pointer;
            font: inherit;
            text-transform: inherit;
            letter-spacing: inherit;
            padding: 0;
            border-bottom: 1px dotted var(--accent);
            transition: color var(--t-fast);
        }
        .auth-mode-switch button:hover {
            color: var(--text-primary);
            border-color: var(--text-primary);
        }

        /* Hide elements that don't belong to the current mode */
        .auth-login-card[data-mode="signin"]   [data-only="signup"],
        .auth-login-card[data-mode="signin"]   [data-only="forgot"],
        .auth-login-card[data-mode="signin"]   [data-only="success"],
        .auth-login-card[data-mode="signup"]   [data-only="signin"],
        .auth-login-card[data-mode="signup"]   [data-only="forgot"],
        .auth-login-card[data-mode="signup"]   [data-only="success"],
        .auth-login-card[data-mode="forgot"]   [data-only="signin"],
        .auth-login-card[data-mode="forgot"]   [data-only="signup"],
        .auth-login-card[data-mode="forgot"]   [data-only="success"],
        .auth-login-card[data-mode="forgot"]   [data-hide-on-forgot],
        .auth-login-card[data-mode="success"]  [data-only="signin"],
        .auth-login-card[data-mode="success"]  [data-only="signup"],
        .auth-login-card[data-mode="success"]  [data-only="forgot"],
        .auth-login-card[data-mode="success"]  [data-hide-on-success] {
            display: none;
        }
        /* Success view also hides the OAuth buttons section */
        .auth-login-card[data-mode="success"] .auth-login-buttons,
        .auth-login-card[data-mode="success"] .auth-login-sep,
        .auth-login-card[data-mode="success"] .auth-login-disclaimer {
            display: none;
        }

        /* "Check your email" success panel */
        .auth-success-panel {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 16px 16px;
            background: var(--bg-elev-2);
            border: 1px solid var(--accent-green, #5fa86d);
            border-left-width: 3px;
            border-radius: 3px;
        }
        .auth-success-panel strong {
            color: var(--text-primary);
            font-weight: 500;
        }
        .auth-success-panel-title {
            font-family: var(--font-ui);
            font-size: 14px;
            color: var(--accent-green, #5fa86d);
            font-weight: 500;
        }
        .auth-success-panel-body {
            font-family: var(--font-ui);
            font-size: 13px;
            line-height: 1.55;
            color: var(--text-secondary);
        }
    `;
    const styleEl = document.createElement('style');
    styleEl.id = 'auth-widget-styles';
    styleEl.textContent = css;
    document.head.appendChild(styleEl);


    /* ---------- Inject widget HTML ---------- */
    const widget = document.createElement('div');
    widget.className = 'auth-widget';
    widget.id = 'auth-widget';
    widget.innerHTML = `<!-- populated by renderState() -->`;

    // Pick the best mount point in priority order.
    const mount =
        document.querySelector('.top-bar-right') ||
        document.querySelector('.game-header-pills') ||
        document.querySelector('.room-bar');

    if (!mount) {
        console.warn('[auth-ui] no .top-bar-right / .game-header-pills / .room-bar found — widget not injected');
        return;
    }
    console.log('[auth-ui] mounting in', '.' + mount.className.split(' ')[0]);
    // Prepend so it sits to the left of any other right-side controls.
    mount.insertBefore(widget, mount.firstChild);


    /* ---------- Render helpers ---------- */
    function escHTML(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
        }[c]));
    }

    function renderSignedOut() {
        widget.innerHTML = `
            <button class="auth-signin-btn" id="auth-signin-btn" type="button" title="Sign in to save your stats">
                <span>sign in</span>
            </button>
        `;
        document.getElementById('auth-signin-btn').addEventListener('click', onSignInClick);
    }

    function renderSignedIn(profile) {
        const nick = profile.nickname || 'user';
        const initial = nick.charAt(0).toUpperCase();
        const avatarHTML = profile.avatar_url
            ? `<img src="${escHTML(profile.avatar_url)}" alt="" referrerpolicy="no-referrer">`
            : `<span class="auth-avatar-fallback">${escHTML(initial)}</span>`;

        widget.innerHTML = `
            <button class="auth-chip" id="auth-chip" type="button" aria-haspopup="true" aria-expanded="false">
                <span class="auth-avatar">${avatarHTML}</span>
                <span class="auth-nickname">${escHTML(nick)}</span>
                <span class="auth-chip-caret">▾</span>
            </button>
            <div class="auth-dropdown" id="auth-dropdown" role="menu">
                <div class="auth-dropdown-head">
                    <div class="auth-dropdown-name">${escHTML(profile.display_name || nick)}</div>
                    <div class="auth-dropdown-handle">@${escHTML(nick)}</div>
                </div>
                <a class="auth-dropdown-item" href="profile.html" role="menuitem">
                    <svg class="auth-dropdown-icon" viewBox="0 0 16 16">
                        <circle cx="8" cy="5" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/>
                        <path d="M2.5 14 q0-5 5.5-5 t5.5 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                    </svg>
                    <span>view profile</span>
                </a>
                <button class="auth-dropdown-item is-danger" id="auth-signout-btn" type="button" role="menuitem">
                    <svg class="auth-dropdown-icon" viewBox="0 0 16 16">
                        <path d="M10 2 H4 a1 1 0 0 0-1 1 v10 a1 1 0 0 0 1 1 h6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                        <path d="M8 8 H15 M12 5 L15 8 L12 11" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span>sign out</span>
                </button>
            </div>
        `;

        const chip     = document.getElementById('auth-chip');
        const dropdown = document.getElementById('auth-dropdown');
        const signout  = document.getElementById('auth-signout-btn');

        chip.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdown.classList.toggle('is-open');
            chip.classList.toggle('is-open', isOpen);
            chip.setAttribute('aria-expanded', String(isOpen));
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!widget.contains(e.target)) {
                dropdown.classList.remove('is-open');
                chip.classList.remove('is-open');
                chip.setAttribute('aria-expanded', 'false');
            }
        });

        // Close on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                dropdown.classList.remove('is-open');
                chip.classList.remove('is-open');
                chip.setAttribute('aria-expanded', 'false');
            }
        });

        signout.addEventListener('click', async () => {
            try {
                signout.disabled = true;
                await window.gg.signOut();
                // onAuthChange will re-render the widget as "signed out"
            } catch (e) {
                console.error('[auth-ui] sign out failed:', e);
                signout.disabled = false;
            }
        });
    }


    /* ---------- Handlers ---------- */
    function onSignInClick() {
        // Replaced direct Google flow with a provider-choice modal so
        // we can offer Discord + Google + (later) Email/Password from
        // a single entry point. The modal is exposed globally via
        // `window.gg.openLoginModal` so profile.html / gallery.html
        // can reuse it from their own "Sign in" buttons.
        openLoginModal();
    }


    /* =========================================================
       LOGIN MODAL — provider-choice dialog
       =========================================================
       Centered card with two stacked buttons (Discord, Google).
       Built once and toggled with the `hidden` attribute. Click
       outside / ESC / X button all close it. Each provider button
       hands off to the matching `gg.signInWith*` function which
       redirects to the provider's consent screen. */
    let modalEl = null;

    function ensureLoginModal() {
        if (modalEl) return modalEl;
        modalEl = document.createElement('div');
        modalEl.className = 'auth-login-modal';
        modalEl.id = 'auth-login-modal';
        modalEl.setAttribute('role', 'dialog');
        modalEl.setAttribute('aria-modal', 'true');
        modalEl.setAttribute('aria-labelledby', 'auth-login-title');
        modalEl.hidden = true;
        modalEl.innerHTML = `
            <div class="auth-login-backdrop" data-close></div>
            <div class="auth-login-card" id="auth-login-card" data-mode="signin">
                <button class="auth-login-close" type="button" data-close aria-label="Close">esc ✕</button>
                <div class="auth-login-eyebrow" data-i18n="auth.eyebrow">welcome</div>
                <h2 class="auth-login-title" id="auth-login-title">
                    <span data-only="signin"  data-i18n="auth.title_signin">Sign in</span>
                    <span data-only="signup"  data-i18n="auth.title_signup">Create an account</span>
                    <span data-only="forgot"  data-i18n="auth.title_forgot">Reset your password</span>
                    <span data-only="success" data-i18n="auth.title_success">Check your email</span>
                </h2>
                <p class="auth-login-intro">
                    <span data-only="signin"  data-i18n="auth.intro_signin">Welcome back. Your stats and gallery sync across sessions and devices.</span>
                    <span data-only="signup"  data-i18n="auth.intro_signup">Set up an account to keep your stats, unlocked photos and pseudo across devices.</span>
                    <span data-only="forgot"  data-i18n="auth.intro_forgot">Enter the email you used to sign up. We'll send you a link to set a new password.</span>
                </p>

                <!-- OAuth buttons (hidden on forgot/success modes via CSS) -->
                <div class="auth-login-buttons" data-hide-on-success>
                    <button class="auth-login-btn auth-login-btn--discord" id="auth-login-discord" type="button">
                        <svg class="auth-login-icon" viewBox="0 0 24 24" aria-hidden="true">
                            <path fill="currentColor" d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.03.01.06.02.09.01 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z"/>
                        </svg>
                        <span data-i18n="auth.with_discord">continue with Discord</span>
                    </button>
                    <button class="auth-login-btn auth-login-btn--google" id="auth-login-google" type="button">
                        <svg class="auth-login-icon" viewBox="0 0 24 24" aria-hidden="true">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/>
                            <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l3.66-2.83Z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.83C6.71 7.3 9.14 5.38 12 5.38Z"/>
                        </svg>
                        <span data-i18n="auth.with_google">continue with Google</span>
                    </button>
                </div>

                <!-- Separator "or with email" (hidden on forgot/success) -->
                <div class="auth-login-sep" data-hide-on-success data-i18n="auth.or_email">or with email</div>

                <!-- Email + password (+ nickname for signup) form -->
                <form class="auth-email-form" id="auth-email-form" novalidate data-hide-on-success>
                    <div class="auth-email-field" data-only="signup">
                        <label for="auth-email-nick" data-i18n="auth.label_nickname">nickname</label>
                        <div class="auth-email-input-wrap">
                            <input type="text"
                                   id="auth-email-nick"
                                   name="nickname"
                                   maxlength="20"
                                   placeholder="your-nickname"
                                   data-i18n-attr="placeholder:auth.ph_nickname"
                                   autocomplete="username"
                                   spellcheck="false"
                                   required>
                        </div>
                        <div class="auth-field-hint" data-i18n="auth.hint_nickname">3-20 chars · lowercase letters, digits, underscore</div>
                    </div>

                    <div class="auth-email-field">
                        <label for="auth-email-email" data-i18n="auth.label_email">email</label>
                        <div class="auth-email-input-wrap">
                            <input type="email"
                                   id="auth-email-email"
                                   name="email"
                                   placeholder="name@domain.com"
                                   data-i18n-attr="placeholder:auth.ph_email"
                                   autocomplete="email"
                                   spellcheck="false"
                                   required>
                        </div>
                    </div>

                    <div class="auth-email-field" data-hide-on-forgot>
                        <label for="auth-email-pwd" data-i18n="auth.label_password">password</label>
                        <div class="auth-email-input-wrap">
                            <input type="password"
                                   id="auth-email-pwd"
                                   name="password"
                                   placeholder="at least 8 characters"
                                   data-i18n-attr="placeholder:auth.ph_password"
                                   autocomplete="current-password"
                                   minlength="8"
                                   required>
                            <button type="button" class="auth-password-toggle" id="auth-pwd-toggle"
                                    title="show password" aria-label="toggle password visibility"
                                    data-i18n="auth.pwd_show">show</button>
                        </div>
                        <div class="auth-field-hint" data-only="signup" data-i18n="auth.hint_password">8 chars min · used only to sign you back in</div>
                    </div>

                    <div class="auth-field-hint" id="auth-form-error" hidden></div>

                    <button class="auth-submit-btn" id="auth-email-submit" type="submit">
                        <span data-only="signin" data-i18n="auth.btn_signin">sign in</span>
                        <span data-only="signup" data-i18n="auth.btn_signup">create account</span>
                        <span data-only="forgot" data-i18n="auth.btn_forgot">send reset link</span>
                        <span aria-hidden="true">→</span>
                    </button>
                </form>

                <!-- Success panel — shown after sign-up (confirmation email sent)
                     or forgot-password (reset link sent). Body text is set
                     dynamically depending on which flow we came from. -->
                <div class="auth-success-panel" data-only="success">
                    <div class="auth-success-panel-title" id="auth-success-title" data-i18n="auth.success_title">Check your inbox.</div>
                    <div class="auth-success-panel-body" id="auth-success-body" data-i18n="auth.success_body_signup">We've sent a confirmation link to your email address. Click it to activate your account, then come back and sign in.</div>
                </div>

                <!-- Mode switcher (sign in ↔ sign up + forgot) -->
                <div class="auth-mode-switch" data-hide-on-success>
                    <span data-only="signin">
                        <span data-i18n="auth.no_account">No account yet?</span>
                        <button type="button" data-go="signup" data-i18n="auth.go_signup">Create one</button>
                    </span>
                    <span data-only="signup">
                        <span data-i18n="auth.have_account">Already registered?</span>
                        <button type="button" data-go="signin" data-i18n="auth.go_signin">Sign in</button>
                    </span>
                    <span data-only="forgot">
                        <button type="button" data-go="signin" data-i18n="auth.back_signin">← back to sign in</button>
                    </span>
                    <button type="button" data-only="signin" data-go="forgot" data-i18n="auth.forgot_link">Forgot password?</button>
                </div>

                <p class="auth-login-disclaimer">
                    <span data-i18n="auth.disclaimer_pre">By continuing you agree to our</span>
                    <a href="legal.html#terms" target="_blank" rel="noopener" data-i18n="auth.disclaimer_terms">Terms</a>
                    <span data-i18n="auth.disclaimer_and">and</span>
                    <a href="legal.html#privacy" target="_blank" rel="noopener" data-i18n="auth.disclaimer_privacy">Privacy Policy</a>.
                </p>
            </div>
        `;
        document.body.appendChild(modalEl);

        // Re-apply i18n to the freshly-injected modal so the new
        // [data-i18n] elements pick up the active language. If i18n
        // hasn't booted yet we'll catch them on its DOMContentLoaded
        // pass — apply() is idempotent.
        if (window.gg_i18n) window.gg_i18n.apply(modalEl);

        // Close handlers: backdrop, X button, ESC
        modalEl.querySelectorAll('[data-close]').forEach(el => {
            el.addEventListener('click', closeLoginModal);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modalEl.hidden) closeLoginModal();
        });

        // OAuth provider buttons
        modalEl.querySelector('#auth-login-discord')
            .addEventListener('click', () => onProviderClick('discord'));
        modalEl.querySelector('#auth-login-google')
            .addEventListener('click', () => onProviderClick('google'));

        // Mode switcher (signin ↔ signup ↔ forgot)
        modalEl.querySelectorAll('[data-go]').forEach(btn => {
            btn.addEventListener('click', () => setMode(btn.dataset.go));
        });

        // Password show/hide toggle
        const pwdToggle = modalEl.querySelector('#auth-pwd-toggle');
        const pwdInput  = modalEl.querySelector('#auth-email-pwd');
        pwdToggle.addEventListener('click', () => {
            const isPwd = pwdInput.type === 'password';
            pwdInput.type = isPwd ? 'text' : 'password';
            // Flip data-i18n key so a later lang-switch re-applies the right label
            const newKey = isPwd ? 'auth.pwd_hide' : 'auth.pwd_show';
            pwdToggle.dataset.i18n = newKey;
            pwdToggle.textContent = (window.gg_i18n && window.gg_i18n.t)
                ? window.gg_i18n.t(newKey)
                : (isPwd ? 'hide' : 'show');
        });

        // Email form submit — dispatch based on current mode
        modalEl.querySelector('#auth-email-form')
            .addEventListener('submit', onEmailFormSubmit);

        return modalEl;
    }

    /* Switch the modal between signin / signup / forgot / success */
    function setMode(mode) {
        if (!modalEl) return;
        const card = modalEl.querySelector('#auth-login-card');
        card.dataset.mode = mode;
        clearFormError();
        // Reset password-toggle to "hidden" state on mode change so the
        // password isn't accidentally exposed if the user switched from
        // signin (with text visible) to signup.
        const pwdInput = modalEl.querySelector('#auth-email-pwd');
        const pwdToggle = modalEl.querySelector('#auth-pwd-toggle');
        if (pwdInput && pwdToggle) {
            pwdInput.type = 'password';
            pwdToggle.dataset.i18n = 'auth.pwd_show';
            pwdToggle.textContent = (window.gg_i18n && window.gg_i18n.t)
                ? window.gg_i18n.t('auth.pwd_show')
                : 'show';
        }
        // Focus the first relevant input for keyboard users
        setTimeout(() => {
            const focusOrder = mode === 'signup'
                ? ['#auth-email-nick', '#auth-email-email', '#auth-email-pwd']
                : mode === 'forgot'
                    ? ['#auth-email-email']
                    : ['#auth-email-email', '#auth-email-pwd'];
            for (const sel of focusOrder) {
                const el = modalEl.querySelector(sel);
                if (el && el.offsetParent !== null) { el.focus(); break; }
            }
        }, 30);
    }

    function clearFormError() {
        const err = modalEl && modalEl.querySelector('#auth-form-error');
        if (err) { err.hidden = true; err.textContent = ''; err.classList.remove('is-error'); }
    }
    function showFormError(msg) {
        const err = modalEl && modalEl.querySelector('#auth-form-error');
        if (err) { err.hidden = false; err.textContent = msg; err.classList.add('is-error'); }
    }

    /* Form submit — handles signin, signup and forgot in one entry point */
    async function onEmailFormSubmit(e) {
        e.preventDefault();
        const card    = modalEl.querySelector('#auth-login-card');
        const mode    = card.dataset.mode;
        const emailEl = modalEl.querySelector('#auth-email-email');
        const pwdEl   = modalEl.querySelector('#auth-email-pwd');
        const nickEl  = modalEl.querySelector('#auth-email-nick');
        const submit  = modalEl.querySelector('#auth-email-submit');
        const t       = (window.gg_i18n && window.gg_i18n.t) || ((k) => k);

        const email = (emailEl.value || '').trim();
        const password = pwdEl.value || '';
        const nickname = ((nickEl && nickEl.value) || '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);

        clearFormError();
        if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
            showFormError(t('auth.err_invalid_email'));
            emailEl.focus();
            return;
        }
        if (mode !== 'forgot' && password.length < 8) {
            showFormError(t('auth.err_password_short'));
            pwdEl.focus();
            return;
        }
        if (mode === 'signup' && (!nickname || nickname.length < 3)) {
            showFormError(t('auth.err_nickname_short'));
            nickEl.focus();
            return;
        }

        // For signup: pre-check nickname availability so the user gets
        // a friendly error instead of a generic SQL conflict.
        if (mode === 'signup') {
            try {
                const { data: avail } = await window.gg.supabase
                    .rpc('is_nickname_available', { p_nickname: nickname });
                if (!avail) {
                    showFormError(t('auth.err_nickname_taken'));
                    nickEl.focus();
                    return;
                }
            } catch (_) { /* RPC unavailable → fall through, server will catch dup */ }
        }

        submit.disabled = true;
        try {
            if (mode === 'signin') {
                await window.gg.signInWithEmail(email, password);
                // onAuthStateChange will render the avatar widget;
                // close the modal so the user sees the page.
                closeLoginModal();
            } else if (mode === 'signup') {
                const data = await window.gg.signUpWithEmail(email, password, nickname);
                // If Confirm-email is enabled, data.session is null until
                // the user clicks the confirmation link. Show the "check
                // your email" panel either way — it's the same UX.
                const body = modalEl.querySelector('#auth-success-body');
                if (body) {
                    body.dataset.i18n   = 'auth.success_body_signup';
                    body.textContent    = t('auth.success_body_signup');
                }
                setMode('success');
                // If no confirmation needed and they're auto-signed-in,
                // the auth state listener will close the modal next tick.
                if (data && data.session) {
                    setTimeout(closeLoginModal, 1800);
                }
            } else if (mode === 'forgot') {
                await window.gg.requestPasswordReset(email);
                const body = modalEl.querySelector('#auth-success-body');
                if (body) {
                    body.dataset.i18n   = 'auth.success_body_forgot';
                    body.textContent    = t('auth.success_body_forgot');
                }
                setMode('success');
            }
        } catch (err) {
            // Translate the most common Supabase errors to friendly messages.
            const raw = (err && (err.message || err.error_description || '')) || '';
            const lower = raw.toLowerCase();
            let key = 'auth.err_generic';
            if (lower.includes('already registered') || lower.includes('already exists')) key = 'auth.err_email_taken';
            else if (lower.includes('invalid login') || lower.includes('invalid credentials')) key = 'auth.err_invalid_creds';
            else if (lower.includes('email not confirmed') || lower.includes('not confirmed')) key = 'auth.err_not_confirmed';
            else if (lower.includes('rate limit') || lower.includes('429')) key = 'auth.err_rate_limit';
            showFormError(t(key));
        } finally {
            submit.disabled = false;
        }
    }

    function openLoginModal() {
        ensureLoginModal();
        modalEl.hidden = false;
        // Lock body scroll while modal is open
        document.body.style.overflow = 'hidden';
        // Focus the first button for keyboard users
        setTimeout(() => {
            const first = modalEl.querySelector('#auth-login-discord');
            if (first) first.focus();
        }, 40);
    }

    function closeLoginModal() {
        if (!modalEl) return;
        modalEl.hidden = true;
        document.body.style.overflow = '';
    }

    async function onProviderClick(provider) {
        // Disable both buttons while a redirect is in flight to avoid
        // double-clicks queuing two OAuth flows.
        const discordBtn = modalEl.querySelector('#auth-login-discord');
        const googleBtn  = modalEl.querySelector('#auth-login-google');
        [discordBtn, googleBtn].forEach(b => { if (b) b.disabled = true; });

        try {
            if (provider === 'discord') {
                await window.gg.signInWithDiscord();
            } else {
                await window.gg.signInWithGoogle();
            }
            // The browser is about to redirect to the provider's consent
            // screen — we don't need to do anything else here.
        } catch (e) {
            console.error('[auth-ui] sign in failed:', e);
            [discordBtn, googleBtn].forEach(b => { if (b) b.disabled = false; });
            alert('Sign in failed. Check the console for details.');
        }
    }

    // Expose so other pages (profile.html, gallery.html) can open the
    // same modal from their own "Sign in" buttons.
    if (window.gg) {
        window.gg.openLoginModal = openLoginModal;
        window.gg.closeLoginModal = closeLoginModal;
    }


    /* ---------- State sync ----------
       Three possible states:
         - state.isAnon === true                → not signed in → show sign-in
         - !state.isAnon && state.profile       → fully authenticated → show chip
         - !state.isAnon && !state.profile      → AUTH PENDING (session resumed,
                                                   profile still being fetched) →
                                                   render NOTHING to avoid the
                                                   "sign in" flicker on page navs.
       The widget stays empty until profile lands. If profile load fails for some
       reason, the widget will stay empty rather than mislead the user into
       clicking "sign in" while they're already signed in. */
    window.gg.onAuthChange((state) => {
        if (state.isAnon) {
            renderSignedOut();
        } else if (state.profile) {
            renderSignedIn(state.profile);
        } else {
            // Auth pending — clear any previous render so we don't show stale
            // data, but DON'T show the sign-in button. The next onAuthChange
            // call (after loadProfile resolves) will populate properly.
            widget.innerHTML = '';
        }
    });

    } /* end run() */

})();
