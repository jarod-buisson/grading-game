/* =========================================================
   presence.js — live "X online" pill in the bottom-right.

   Uses Supabase Realtime Presence. Every page subscribes to a
   single global channel called `online-users`. Each client
   tracks itself under its user_id (anon or authenticated), and
   listens for sync/join/leave events to update the count.

   Behavior:
     - Auto-deduplicates: same user across multiple tabs = 1 count
     - Auto-cleans disconnects (Supabase drops stale presences
       when the websocket closes, ~30 sec)
     - Fails gracefully if Supabase isn't reachable: pill stays
       at "—" instead of breaking the page

   Mounted via head-common.html so the pill shows on every page.
   ========================================================= */

(function () {
    'use strict';

    if (!window.gg) return;

    let channel = null;
    let pillEl  = null;

    /* ---------- DOM-ready guard ---------- */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    function init() {
        if (document.getElementById('online-pill')) return;
        injectStyles();
        mountPill();
        // Wait for the auth client to know our userId, then subscribe.
        if (window.gg.ready) {
            window.gg.ready.then(subscribe).catch(err => {
                console.warn('[presence] gg.ready failed:', err);
            });
        } else {
            subscribe();
        }
    }


    /* ---------- UI ---------- */
    function injectStyles() {
        if (document.getElementById('online-pill-styles')) return;
        const style = document.createElement('style');
        style.id = 'online-pill-styles';
        style.textContent = `
            /* Default: inline chip that lives inside the top bar
               next to the auth/audio widgets. Same shape as those
               widgets so it feels native to the layout. */
            .online-pill {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 4px 12px 4px 10px;
                background: var(--bg-elev-1);
                border: 1px solid var(--border-subtle);
                border-radius: 999px;
                font-family: var(--font-mono);
                font-size: 10px;
                color: var(--text-tertiary);
                text-transform: uppercase;
                letter-spacing: var(--tracking-wide);
                opacity: 0;
                transition:
                    opacity var(--t-fast),
                    border-color var(--t-fast);
                pointer-events: auto;
                user-select: none;
                white-space: nowrap;
            }
            .online-pill.is-ready { opacity: 1; }
            .online-pill:hover { border-color: var(--border); }

            /* Fallback for pages where no top-bar mount point exists.
               Positioned bottom-LEFT (not right) to avoid conflict
               with the donate/discord buttons and game submit area. */
            .online-pill--floating {
                position: fixed;
                bottom: 14px;
                left: 14px;
                z-index: 998;
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
            }

            .online-pill-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: var(--accent-green, #5fa86d);
                box-shadow: 0 0 6px rgba(95, 168, 109, 0.6);
                animation: online-pulse 2.2s ease-in-out infinite;
                flex-shrink: 0;
            }
            .online-pill-dot.is-offline {
                background: var(--text-quaternary);
                box-shadow: none;
                animation: none;
            }
            .online-pill-count {
                color: var(--text-primary);
                font-weight: 500;
                min-width: 12px;
                text-align: right;
            }
            @keyframes online-pulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50%      { opacity: 0.5; transform: scale(0.85); }
            }

            /* Mobile: pill is moved into the .mobile-chrome-footer
               (where info + legal already live), so we want it to
               look at home there — slightly tighter padding, kept
               horizontally aligned with the chrome pills. */
            @media (max-width: 799px) {
                .mobile-chrome-footer .online-pill {
                    padding: 4px 10px 4px 8px;
                    font-size: 10px;
                    border-radius: 999px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function mountPill() {
        pillEl = document.createElement('div');
        pillEl.className = 'online-pill';
        pillEl.id = 'online-pill';
        pillEl.setAttribute('title', 'live count of players currently on grading-game');
        pillEl.innerHTML = `
            <span class="online-pill-dot is-offline" aria-hidden="true"></span>
            <span class="online-pill-count">—</span>
            <span class="online-pill-label">online</span>
        `;

        // Pick the best mount point in priority order. On mobile we
        // join the chrome footer (info + legal) at the bottom of the
        // page so the pill is actually visible — the desktop top-bar
        // is too cramped under 800 px. On desktop we keep the existing
        // top-bar behavior so the pill sits next to the auth widget.
        const isMobile = window.matchMedia
            && window.matchMedia('(max-width: 799px)').matches;

        let mount;
        if (isMobile) {
            mount = ensureMobileChromeFooter();
        } else {
            mount =
                document.querySelector('.top-bar-right') ||
                document.querySelector('.game-header-pills') ||
                document.querySelector('.room-bar');
        }

        if (mount) {
            mount.appendChild(pillEl);
        } else {
            // No top bar on this page — fall back to a floating pill
            // in the bottom-LEFT corner (less crowded than bottom-right).
            pillEl.classList.add('online-pill--floating');
            document.body.appendChild(pillEl);
        }

        // Tiny stagger so the fade-in feels nice
        setTimeout(() => pillEl.classList.add('is-ready'), 50);
    }

    function updateCount(count) {
        if (!pillEl) return;
        const dot   = pillEl.querySelector('.online-pill-dot');
        const num   = pillEl.querySelector('.online-pill-count');
        if (num) num.textContent = count;
        if (dot) dot.classList.toggle('is-offline', count === 0);
    }

    /* Ensure the mobile footer container exists. chrome.js also
       creates this element (for the info + legal pills) but
       presence.js loads BEFORE chrome.js in head-common, so we
       can't assume it's already in the DOM. Idempotent — both
       scripts can call this safely. */
    function ensureMobileChromeFooter() {
        let footer = document.querySelector('.mobile-chrome-footer');
        if (!footer) {
            footer = document.createElement('div');
            footer.className = 'mobile-chrome-footer';
            document.body.appendChild(footer);
        }
        return footer;
    }


    /* ---------- Realtime subscription ---------- */
    function subscribe() {
        const { supabase } = window.gg;
        const userId = window.gg.userId;
        if (!supabase || !userId) {
            console.warn('[presence] no supabase client or userId — skipping');
            return;
        }

        try {
            // Each user_id is a unique presence key. Multiple tabs of the
            // same user collapse to a single entry, so the count is "people"
            // not "open tabs".
            channel = supabase.channel('online-users', {
                config: { presence: { key: userId } }
            });

            channel.on('presence', { event: 'sync' }, () => {
                const state = channel.presenceState();
                const count = Object.keys(state).length;
                updateCount(count);
            });

            channel.subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await channel.track({
                        user_id:   userId,
                        joined_at: new Date().toISOString()
                    });
                    console.log('[presence] subscribed to online-users channel');
                } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
                    console.warn('[presence] channel', status);
                    updateCount(0);
                }
            });
        } catch (e) {
            console.warn('[presence] subscribe failed:', e);
        }
    }


    /* ---------- Cleanup on unload ---------- */
    // Best-effort: untrack + unsubscribe when the user leaves so
    // their presence is removed quickly (instead of waiting for the
    // websocket timeout). Wrapped in a try/catch because some
    // browsers throttle async work in beforeunload.
    window.addEventListener('beforeunload', () => {
        try {
            if (channel) {
                channel.untrack();
                channel.unsubscribe();
            }
        } catch (_) {}
    });

})();
