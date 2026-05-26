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

    // Pick the best mount point in priority order, mirroring audio-player.js
    const mount =
        document.querySelector('.top-bar-right') ||
        document.querySelector('.game-header-pills') ||
        document.querySelector('.room-bar');

    if (!mount) {
        console.warn('[auth-ui] no .top-bar-right / .game-header-pills / .room-bar found — widget not injected');
        return;
    }
    console.log('[auth-ui] mounting in', '.' + mount.className.split(' ')[0]);
    // Insert the widget BEFORE the audio widget if it's already there,
    // otherwise prepend so it sits to the left of any other right-side
    // controls.
    const audioWidget = mount.querySelector('.audio-widget');
    if (audioWidget) {
        mount.insertBefore(widget, audioWidget);
    } else {
        mount.insertBefore(widget, mount.firstChild);
    }


    /* ---------- Render helpers ---------- */
    function escHTML(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
        }[c]));
    }

    function renderSignedOut() {
        widget.innerHTML = `
            <button class="auth-signin-btn" id="auth-signin-btn" type="button" title="Sign in to save your stats">
                <svg class="auth-google-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/>
                    <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l3.66-2.83Z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.83C6.71 7.3 9.14 5.38 12 5.38Z"/>
                </svg>
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
    async function onSignInClick() {
        const btn = document.getElementById('auth-signin-btn');
        if (btn) btn.classList.add('is-loading');
        try {
            await window.gg.signInWithGoogle();
            // Browser will redirect to Google → no need to render anything
        } catch (e) {
            console.error('[auth-ui] sign in failed:', e);
            if (btn) btn.classList.remove('is-loading');
            alert('Sign in failed. Check the console for details.');
        }
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
