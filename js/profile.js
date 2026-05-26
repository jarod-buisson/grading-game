/* =========================================================
   profile.js — drives the profile page (hero + stats + settings)

   Two UI states managed by the same page:
     - anonymous → "sign in to see your profile" + Google button
     - authenticated → hero, stats, edit nickname, delete account

   All auth coordination goes through window.gg (set up by
   supabase-client.js, loaded before this script).
   ========================================================= */

(function () {
    'use strict';

    if (!window.gg) {
        console.warn('[profile] window.gg missing — supabase-client.js must load first');
        return;
    }

    /* ---------- DOM refs ---------- */
    const $ = (id) => document.getElementById(id);
    const loadingEl = $('profile-loading');
    const anonEl    = $('profile-anon');
    const authEl    = $('profile-auth');

    const avatarEl    = $('profile-avatar');
    const avatarFb    = $('profile-avatar-fallback');
    const displayName = $('profile-display-name');
    const handleEl    = $('profile-handle');
    const sinceEl     = $('profile-since');

    const statTotal = $('stat-total');
    const statMulti = $('stat-multi');
    const statSolo  = $('stat-solo');
    const statWins  = $('stat-wins');
    const statBest  = $('stat-best');
    const statAvg   = $('stat-avg');

    const editModal   = $('edit-modal');
    const editInput   = $('edit-input');
    const editHint    = $('edit-hint');
    const editSave    = $('edit-save');

    const delModal    = $('delete-modal');
    const delHandle   = $('delete-confirm-handle');
    const delInput    = $('delete-confirm-input');
    const delConfirm  = $('delete-confirm');


    /* ---------- Utilities ---------- */
    function show(el) { if (el) el.hidden = false; }
    function hide(el) { if (el) el.hidden = true; }
    function escHTML(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
        }[c]));
    }
    function fmtDate(iso) {
        if (!iso) return '—';
        try {
            const d = new Date(iso);
            return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (_) { return '—'; }
    }


    /* ---------- Render ---------- */
    function renderAnonymous() {
        hide(loadingEl);
        hide(authEl);
        show(anonEl);
    }

    function renderAuthenticated(profile) {
        hide(loadingEl);
        hide(anonEl);
        show(authEl);

        // Avatar
        if (profile.avatar_url) {
            avatarEl.innerHTML = `<img src="${escHTML(profile.avatar_url)}" alt="" referrerpolicy="no-referrer">`;
        } else {
            const initial = (profile.nickname || 'U').charAt(0).toUpperCase();
            avatarEl.innerHTML = `<span class="profile-avatar-fallback">${escHTML(initial)}</span>`;
        }

        // Identity
        displayName.textContent = profile.display_name || profile.nickname || '—';
        handleEl.textContent    = '@' + (profile.nickname || '—');
        sinceEl.textContent     = fmtDate(profile.created_at);

        // Stats (the view returns 0 for missing values, so no nullish-checks needed)
        statTotal.textContent = profile.games_played       ?? 0;
        statMulti.textContent = profile.multi_games_played ?? 0;
        statSolo.textContent  = profile.solo_games_played  ?? 0;
        statWins.textContent  = profile.wins               ?? 0;
        statBest.textContent  = profile.best_score         ?? 0;
        statAvg.textContent   = (profile.avg_score ?? 0).toString();
    }


    /* ---------- Sign-in button (anon state) ---------- */
    $('profile-cta-signin').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
            await window.gg.signInWithGoogle(window.location.href);
        } catch (err) {
            console.error('[profile] sign-in failed:', err);
            btn.disabled = false;
            alert('Sign in failed. See the console for details.');
        }
    });


    /* ---------- Sign-out button (auth state) ---------- */
    $('setting-signout-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
            await window.gg.signOut();
        } catch (err) {
            console.error('[profile] sign-out failed:', err);
            btn.disabled = false;
        }
    });


    /* ---------- Edit nickname modal ---------- */
    function openEditModal() {
        const current = window.gg.profile?.nickname || '';
        editInput.value = current;
        editInput.classList.remove('is-error');
        editHint.classList.remove('is-error');
        editHint.textContent = 'lowercase letters, digits and underscore · max 20 chars · must be unique';
        editSave.disabled = true;
        show(editModal);
        setTimeout(() => editInput.focus(), 40);
    }
    function closeEditModal() {
        hide(editModal);
    }

    $('profile-edit-btn').addEventListener('click', openEditModal);
    $('edit-close').addEventListener('click', closeEditModal);
    $('edit-cancel').addEventListener('click', closeEditModal);

    editInput.addEventListener('input', () => {
        const val = editInput.value.trim();
        const sanitized = val.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
        const isValid = sanitized.length >= 2 && sanitized === val.toLowerCase();
        const changed = sanitized !== (window.gg.profile?.nickname || '');

        editSave.disabled = !(isValid && changed);
        editInput.classList.toggle('is-error', val !== '' && !isValid);

        if (val === '') {
            editHint.textContent = 'lowercase letters, digits and underscore · max 20 chars · must be unique';
            editHint.classList.remove('is-error');
        } else if (!isValid) {
            editHint.textContent = 'invalid chars — only a-z, 0-9 and _ are allowed (2-20 chars)';
            editHint.classList.add('is-error');
        } else {
            editHint.textContent = `→ will become @${sanitized}`;
            editHint.classList.remove('is-error');
        }
    });

    editSave.addEventListener('click', async () => {
        const newNick = editInput.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
        editSave.disabled = true;
        editHint.textContent = 'checking availability…';
        editHint.classList.remove('is-error');

        try {
            // Check uniqueness first for a friendlier error than the DB throwing
            const { data: existing } = await window.gg.supabase
                .from('profiles')
                .select('id')
                .eq('nickname', newNick)
                .maybeSingle();

            if (existing && existing.id !== window.gg.userId) {
                editHint.textContent = `@${newNick} is already taken — pick another`;
                editHint.classList.add('is-error');
                editSave.disabled = false;
                return;
            }

            const { error } = await window.gg.supabase
                .from('profiles')
                .update({ nickname: newNick })
                .eq('id', window.gg.userId);

            if (error) {
                console.error('[profile] update nickname failed:', error);
                editHint.textContent = 'could not save — try again';
                editHint.classList.add('is-error');
                editSave.disabled = false;
                return;
            }

            // Refresh local profile + UI
            await window.gg.loadProfile();
            renderAuthenticated(window.gg.profile);
            closeEditModal();
        } catch (err) {
            console.error('[profile] nickname update error:', err);
            editHint.textContent = 'unexpected error — see console';
            editHint.classList.add('is-error');
            editSave.disabled = false;
        }
    });


    /* ---------- Delete account modal ---------- */
    function openDeleteModal() {
        const nick = window.gg.profile?.nickname || '—';
        delHandle.textContent = '@' + nick;
        delInput.value = '';
        delConfirm.disabled = true;
        show(delModal);
        setTimeout(() => delInput.focus(), 40);
    }
    function closeDeleteModal() {
        hide(delModal);
    }

    $('setting-delete-btn').addEventListener('click', openDeleteModal);
    $('delete-close').addEventListener('click', closeDeleteModal);
    $('delete-cancel').addEventListener('click', closeDeleteModal);

    delInput.addEventListener('input', () => {
        const nick = window.gg.profile?.nickname || '';
        delConfirm.disabled = delInput.value.trim().toLowerCase() !== nick.toLowerCase();
    });

    delConfirm.addEventListener('click', async () => {
        delConfirm.disabled = true;
        try {
            await window.gg.deleteAccount();
            // After deletion the auth state listener flips us back to anon.
            // Close the modal manually since the anon render hides the auth UI.
            closeDeleteModal();
            // Redirect to home so they don't see a half-stripped state.
            window.location.href = 'index.html';
        } catch (err) {
            console.error('[profile] delete account failed:', err);
            alert('Could not delete account. See console for details.');
            delConfirm.disabled = false;
        }
    });


    /* ---------- Esc to close modals ---------- */
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!editModal.hidden) closeEditModal();
        if (!delModal.hidden)  closeDeleteModal();
    });
    // Click outside modal card to close
    [editModal, delModal].forEach(m => {
        m.addEventListener('click', (e) => { if (e.target === m) m.hidden = true; });
    });


    /* ---------- Auth state coordination ---------- */
    window.gg.onAuthChange((state) => {
        if (state.isAnon || !state.profile) {
            renderAnonymous();
        } else {
            renderAuthenticated(state.profile);
        }
    });

})();
