/* =========================================================
   supabase-client.js — single source of truth for the Supabase
   client + auth boot.

   Exposed as `window.gg`:
     gg.supabase             — the supabase-js client
     gg.userId               — current auth user id (anon or authenticated)
     gg.session              — current auth session
     gg.profile              — current profile row (null when anon)
     gg.isAuthenticated      — true if signed in via OAuth/email
     gg.isAnon               — true if running on an anonymous session
     gg.ready                — Promise that resolves when boot is done
     gg.onReady(fn)          — subscribe to boot completion
     gg.onAuthChange(fn)     — subscribe to sign-in / sign-out events
     gg.signInWithGoogle()   — start the Google OAuth flow
     gg.signOut()            — sign out (auto-falls back to anon)
     gg.loadProfile()        — refresh gg.profile from the DB

   Auth policy: login is OPTIONAL. Anon users can use everything
   except persistent stats. Signing in upgrades them to a real
   account with a profile row + game_history logging.

   Loaded after the @supabase/supabase-js CDN script.
   ========================================================= */

(function (global) {
    'use strict';

    /* ============================================================
       CONFIG — safe to commit. The publishable key is meant for
       client-side use; RLS policies enforce real security.
       ============================================================ */
    const CONFIG = {
        url: 'https://wreetwhtwnefoecuebxy.supabase.co',
        key: 'sb_publishable_AJraDMgfqAVULLyF88wqeg_e2ic3SPE'
    };

    const NICK_LS_KEY = 'gradinggame.nickname';

    /* `chromatic-wheel.js` auto-fills localStorage with a `guest_XXXX`
       default the moment the home page paints. That value isn't a real
       user choice — it's just a placeholder for the anon flow. We
       therefore never adopt it as a profile nickname, and we even
       proactively promote a profile already stuck on that pattern
       (left over from an earlier buggy first sign-in) to a Google-derived
       nickname when we load it. */
    const GUEST_PATTERN = /^guest_[a-z0-9]{4}$/i;

    if (!global.supabase || !global.supabase.createClient) {
        console.error(
            '[gg] supabase-js SDK not found. Add this in <head>:\n' +
            '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>'
        );
        return;
    }

    const supabase = global.supabase.createClient(CONFIG.url, CONFIG.key, {
        auth: {
            persistSession: true,
            // Auto-refresh disabled. The SDK's background refresh task can
            // interfere with getSession on page navigations (we observed
            // 5s+ hangs). We rely on Supabase to issue a session that's
            // good for ~1h after sign-in; if it expires the user simply
            // re-signs-in. Future improvement: implement manual refresh.
            autoRefreshToken: false,
            // True so that the OAuth `?code=…&state=…` query string
            // appended on return from Google is detected and exchanged
            // for a session automatically by the SDK.
            detectSessionInUrl: true,
            // Disable cross-tab auth lock (navigator.locks). Defense in
            // depth — our actual fix is reading storage directly in
            // boot(), but no point keeping a known-buggy lock around.
            lock: (_name, _acquireTimeout, fn) => Promise.resolve(fn())
        },
        realtime: {
            params: { eventsPerSecond: 10 }
        }
    });

    /* ============================================================
       Mutable state (closure-private, read via getters on gg)
       ============================================================ */
    let userId  = null;
    let session = null;
    let profile = null;
    let isAnon  = true;

    const authListeners = new Set();
    let readyResolve;
    const ready = new Promise(r => { readyResolve = r; });


    /* ============================================================
       Timeout helper — guards against hanging Supabase queries
       (typically caused by a stale refresh token that the SDK
       can't refresh, leaving requests in a "pending" limbo). When
       a critical step times out we treat it as a soft failure
       rather than blocking the whole UI forever.
       ============================================================ */
    function withTimeout(promise, ms, label) {
        return Promise.race([
            promise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms))
        ]);
    }

    /* Nuke any Supabase tokens left in localStorage and refresh the
       page state. Used when a query hangs — most often that means
       the refresh-token in storage is rejected silently by the SDK. */
    function clearSupabaseAuthState() {
        try {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('sb-')) keys.push(k);
            }
            keys.forEach(k => localStorage.removeItem(k));
            if (keys.length) {
                console.warn(`[gg] cleared ${keys.length} stale Supabase auth key(s) from localStorage`);
            }
        } catch (e) {
            console.warn('[gg] could not clear Supabase auth storage:', e);
        }
    }


    /* ============================================================
       Read the Supabase session directly from localStorage.
       Bypasses the SDK's getSession() which can hang on internal
       coordination tasks (refresh, lock acquisition, etc.). Returns
       the session object on success, null if absent or unparseable.
       ============================================================ */
    function readSessionFromStorage() {
        try {
            // Supabase storage key format: `sb-<projectref>-auth-token`
            // The projectref is the leading subdomain of the project URL.
            const projectRef = new URL(CONFIG.url).hostname.split('.')[0];
            const storageKey = `sb-${projectRef}-auth-token`;
            const raw = localStorage.getItem(storageKey);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            // The Supabase SDK has shipped a few storage shapes over
            // versions — try the common ones in order.
            return parsed?.currentSession || parsed?.session || parsed || null;
        } catch (e) {
            console.warn('[gg] could not read session from localStorage:', e.message);
            return null;
        }
    }

    /* ============================================================
       Boot: resume an existing session or sign in anonymously.
       Reads localStorage DIRECTLY rather than calling
       supabase.auth.getSession() — that SDK method has caused 5s+
       hangs on page navigations (likely from inline refresh or lock
       coordination), even with the lock disabled. Local read is
       synchronous and never hangs.
       ============================================================ */
    async function boot() {
        try {
            const existingSession = readSessionFromStorage();

            if (existingSession?.user) {
                session = existingSession;
                userId  = session.user.id;
                isAnon  = !session.user.email;
                console.log(`[gg] resumed session · ${userId.slice(0, 8)} · ${isAnon ? 'anon' : 'auth'}`);
                if (!isAnon) {
                    // loadProfile already wraps its own queries in timeouts.
                    await loadProfile();
                }
            } else {
                // No session — anonymous sign-in.
                try {
                    const { data, error } = await withTimeout(
                        supabase.auth.signInAnonymously(), 5000, 'signInAnonymously');
                    if (error) throw error;
                    session = data.session;
                    userId  = data.user.id;
                    isAnon  = true;
                    console.log('[gg] signed in anonymously ·', userId.slice(0, 8));
                } catch (e) {
                    console.warn('[gg] anonymous sign-in failed/timed out — UI will still show sign-in:', e.message);
                }
            }

            readyResolve(userId);
        } catch (e) {
            console.error('[gg] auth boot failed:', e);
            readyResolve(null);
        }
    }


    /* ============================================================
       Global auth state listener.
       Reacts to SIGNED_IN / SIGNED_OUT and notifies subscribers.
       ============================================================ */
    supabase.auth.onAuthStateChange(async (event, newSession) => {
        const wasAnon = isAnon;
        session = newSession;
        userId  = newSession?.user?.id ?? null;
        isAnon  = !newSession?.user?.email;

        if (event === 'SIGNED_IN' && !isAnon) {
            await loadProfile();
            // First sign-in upgrades the anon user to an authenticated one:
            // try to adopt their nickname from localStorage.
            if (wasAnon) {
                await maybeAdoptLocalStorageNickname();
            }
        } else if (event === 'SIGNED_OUT') {
            profile = null;
            // Re-establish an anon session so the user can keep browsing
            // without having to refresh manually.
            const { data, error } = await supabase.auth.signInAnonymously();
            if (!error && data) {
                session = data.session;
                userId  = data.user.id;
                isAnon  = true;
                console.log('[gg] back to anon ·', userId.slice(0, 8));
            }
        }

        notifyAuthChange(event);
    });

    function notifyAuthChange(event) {
        const payload = { event, session, userId, isAnon, profile };
        for (const fn of authListeners) {
            try { fn(payload); }
            catch (e) { console.error('[gg] auth listener error:', e); }
        }
    }


    /* ============================================================
       Public auth functions
       ============================================================ */

    /**
     * Start the Google OAuth flow. The user is redirected to Google's
     * consent screen and then back to `redirectTo` (defaults to the
     * current page).
     */
    async function signInWithGoogle(redirectTo) {
        const target = redirectTo || window.location.href;
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: target }
        });
        if (error) {
            console.error('[gg] Google sign-in failed:', error);
            throw error;
        }
        return data;
    }

    /**
     * Sign out the current authenticated user. The onAuthStateChange
     * listener above will re-establish an anonymous session so the
     * UI keeps working without forcing a page refresh.
     */
    async function signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) {
            console.error('[gg] sign-out failed:', error);
            throw error;
        }
    }

    /**
     * Permanently delete the current user's account. Calls the server
     * RPC `delete_my_account()` which removes the auth.users row;
     * cascade FKs erase profile, game_history, players. The session
     * is then ended and an anonymous one is re-established via the
     * auth state listener.
     */
    async function deleteAccount() {
        if (isAnon || !userId) throw new Error('not authenticated');
        const { error } = await supabase.rpc('delete_my_account');
        if (error) {
            console.error('[gg] delete account failed:', error);
            throw error;
        }
        // Best-effort signOut — the auth.users row is gone, so the
        // existing JWT is now invalid. signOut clears the local
        // storage and triggers SIGNED_OUT → anon fallback.
        try { await supabase.auth.signOut(); } catch (_) {}
    }

    /**
     * Fetch the current user's profile (from the `profile_stats` view
     * so we get aggregated stats in one query). Updates gg.profile.
     * No-op for anonymous users.
     *
     * If no profile row exists for the authenticated user (e.g. they
     * deleted their account earlier and are signing back in with the
     * same provider — so the auth-trigger didn't re-fire), creates a
     * fresh one client-side using metadata from the auth session.
     */
    async function loadProfile() {
        if (!userId || isAnon) {
            profile = null;
            return null;
        }

        // Bypass the Supabase SDK and call PostgREST directly. The SDK has
        // shown to hang here for 5s+ on page navigations, even with auth
        // lock and autoRefreshToken disabled. A plain fetch with the JWT
        // manually attached takes <100ms.
        const accessToken = session?.access_token;
        if (!accessToken) {
            console.warn('[gg] loadProfile: no access_token in session — cannot fetch profile');
            profile = null;
            return null;
        }

        let data = null;
        try {
            const url = `${CONFIG.url}/rest/v1/profile_stats?id=eq.${encodeURIComponent(userId)}&select=*&limit=1`;
            const res = await withTimeout(fetch(url, {
                method: 'GET',
                headers: {
                    'apikey':        CONFIG.key,
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept':        'application/json'
                }
            }), 5000, 'loadProfile');

            if (!res.ok) {
                console.warn('[gg] loadProfile failed:', res.status, res.statusText);
                profile = null;
                return null;
            }

            const rows = await res.json();
            data = Array.isArray(rows) ? (rows[0] || null) : (rows || null);
        } catch (e) {
            console.warn('[gg] profile fetch hung or failed — clearing auth storage so user can re-sign-in:', e.message);
            clearSupabaseAuthState();
            profile = null;
            return null;
        }

        if (!data) {
            // No profile row — create one from the auth session metadata.
            profile = await createProfileFromSession();
            return profile;
        }

        profile = data;

        // One-shot migration: if this profile is still stuck on the
        // legacy `guest_XXXX` nickname (left over from a sign-in that
        // happened before the localStorage-adoption bug was fixed),
        // promote it to a sensible Google-derived nickname now.
        if (GUEST_PATTERN.test(profile.nickname || '')) {
            await promoteGuestNickname();
        }

        return profile;
    }

    /**
     * Replace a `guest_XXXX` nickname with one derived from the auth
     * session metadata (Google's display name typically). No-op if no
     * usable metadata is available — the user can still rename
     * manually from /profile.html.
     */
    async function promoteGuestNickname() {
        if (!session?.user || !profile) return;
        const meta = session.user.user_metadata || {};

        const baseRaw =
            (meta.preferred_username || meta.user_name || meta.name ||
             meta.full_name || (session.user.email || '').split('@')[0] || '');
        const sanitized =
            baseRaw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);

        if (!sanitized || GUEST_PATTERN.test(sanitized)) return;
        if (sanitized === profile.nickname) return;

        // Find a free slot, mirroring the SQL trigger's collision logic
        let nick = sanitized;
        for (let n = 0; n < 200; n++) {
            const candidate = n === 0 ? sanitized : `${sanitized}${n}`;
            const { data: existing } = await supabase
                .from('profiles')
                .select('id')
                .eq('nickname', candidate)
                .maybeSingle();
            if (!existing || existing.id === userId) {
                nick = candidate;
                break;
            }
        }

        const { error } = await supabase
            .from('profiles')
            .update({ nickname: nick })
            .eq('id', userId);

        if (error) {
            console.warn('[gg] failed to promote guest nickname:', error);
            return;
        }

        console.log(`[gg] promoted nickname "${profile.nickname}" → "${nick}"`);
        profile.nickname = nick;
    }

    /**
     * Return a Set of challenge IDs the current user has already
     * completed (in either solo or multi). Used by:
     *   - gallery.html → renders unlocked vs locked cards
     *   - solo-setup.js → populates the per-challenge dropdown
     *
     * Returns an EMPTY Set if the user is anonymous or unauthenticated.
     * Uses direct fetch (same pattern as loadProfile) to avoid the SDK's
     * occasional hang on page navigations.
     */
    async function getUnlockedChallengeIds() {
        if (!userId || isAnon) return new Set();
        const accessToken = session?.access_token;
        if (!accessToken) return new Set();

        try {
            const url = `${CONFIG.url}/rest/v1/game_history`
                + `?user_id=eq.${encodeURIComponent(userId)}`
                + `&select=challenge_id`;
            const res = await withTimeout(fetch(url, {
                method: 'GET',
                headers: {
                    'apikey':        CONFIG.key,
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept':        'application/json'
                }
            }), 5000, 'getUnlockedChallengeIds');

            if (!res.ok) {
                console.warn('[gg] getUnlockedChallengeIds failed:', res.status);
                return new Set();
            }

            const rows = await res.json();
            return new Set(rows.map(r => String(r.challenge_id)));
        } catch (e) {
            console.warn('[gg] getUnlockedChallengeIds hung/failed:', e.message);
            return new Set();
        }
    }


    /**
     * Build a fresh profile row from the current auth session.
     * Mirrors the SQL trigger's logic (sanitize → uniquify) so the
     * post-delete sign-in flow produces a sensible default profile.
     */
    async function createProfileFromSession() {
        if (!session?.user) return null;
        const meta = session.user.user_metadata || {};

        const baseRaw =
            (meta.preferred_username || meta.user_name || meta.name ||
             meta.full_name || (session.user.email || '').split('@')[0] ||
             ('user_' + userId.slice(0, 8)));
        const sanitized =
            baseRaw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20)
            || ('user_' + userId.slice(0, 8));

        // Find a unique nickname by appending a numeric suffix on collision.
        // Cap retries to avoid pathological loops.
        let nick = sanitized;
        for (let n = 0; n < 200; n++) {
            const candidate = n === 0 ? sanitized : `${sanitized}${n}`;
            const { data: existing } = await supabase
                .from('profiles')
                .select('id')
                .eq('nickname', candidate)
                .maybeSingle();
            if (!existing) {
                nick = candidate;
                break;
            }
        }

        const { error } = await supabase
            .from('profiles')
            .insert({
                id: userId,
                nickname: nick,
                display_name: meta.name || null,
                avatar_url: meta.avatar_url || null
            });

        if (error) {
            console.warn('[gg] failed to create profile from session:', error);
            return null;
        }

        // Re-query the stats view so we get the same shape as the normal path.
        const { data } = await supabase
            .from('profile_stats')
            .select('*')
            .eq('id', userId)
            .maybeSingle();
        return data ?? null;
    }

    /**
     * If a freshly-signed-in user has a nickname saved in localStorage
     * from their anon sessions, try to migrate it onto their new
     * profile. Skips if the desired nickname is taken — they keep the
     * auto-generated one and can change it later from /profile.html.
     */
    async function maybeAdoptLocalStorageNickname() {
        if (!profile) return;
        const lsNick = (localStorage.getItem(NICK_LS_KEY) || '').trim();
        if (!lsNick) return;

        // Skip auto-generated guest placeholders — they aren't real
        // user choices, just defaults written by chromatic-wheel.js on
        // first paint. Adopting one would clobber the sensible
        // Google-derived nickname picked by the SQL trigger.
        if (GUEST_PATTERN.test(lsNick)) {
            console.log('[gg] localStorage nickname is a guest placeholder — keeping profile nickname');
            return;
        }

        // Sanitize identically to the SQL trigger so we never request
        // a nickname the server would reject.
        const sanitized = lsNick.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
        if (!sanitized || sanitized === profile.nickname) return;

        const { data: existing } = await supabase
            .from('profiles')
            .select('id')
            .eq('nickname', sanitized)
            .maybeSingle();

        if (existing) {
            console.log(`[gg] nickname "${sanitized}" taken, keeping "${profile.nickname}"`);
            return;
        }

        const { error } = await supabase
            .from('profiles')
            .update({ nickname: sanitized })
            .eq('id', userId);

        if (error) {
            console.warn('[gg] failed to adopt localStorage nickname:', error);
            return;
        }
        console.log(`[gg] adopted nickname "${sanitized}" from localStorage`);
        profile.nickname = sanitized;
    }


    /* ============================================================
       Subscriptions
       ============================================================ */

    function onReady(fn) { ready.then(fn); }

    /**
     * Subscribe to auth state changes (SIGNED_IN, SIGNED_OUT, INIT, …).
     * Called immediately on subscribe with the current state.
     * Returns an unsubscribe function.
     */
    function onAuthChange(fn) {
        authListeners.add(fn);
        ready.then(() => {
            fn({ event: 'INIT', session, userId, isAnon, profile });
        });
        return () => authListeners.delete(fn);
    }


    /* ============================================================
       Public API
       ============================================================ */
    global.gg = {
        supabase,
        get userId()           { return userId; },
        get session()          { return session; },
        get profile()          { return profile; },
        get isAuthenticated()  { return !isAnon && !!userId; },
        get isAnon()           { return isAnon; },
        ready,
        onReady,
        onAuthChange,
        signInWithGoogle,
        signOut,
        deleteAccount,
        loadProfile,
        getUnlockedChallengeIds
    };

    boot();

})(window);
