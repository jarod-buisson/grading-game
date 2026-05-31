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

    const pwdModal    = $('pwd-modal');
    const pwdInput    = $('pwd-input');
    const pwdConfirm  = $('pwd-confirm');
    const pwdHint     = $('pwd-hint');
    const pwdSave     = $('pwd-save');
    const pwdCancel   = $('pwd-cancel');


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


    /* ---------- Sign-in button (anon state) ----------
       Opens the global provider-choice modal (Discord + Google) instead
       of jumping straight to Google. The modal logic lives in auth-ui.js
       and is exposed via window.gg.openLoginModal. */
    $('profile-cta-signin').addEventListener('click', () => {
        if (window.gg?.openLoginModal) {
            window.gg.openLoginModal();
        } else {
            // Fallback: SDK ready but modal helper isn't (rare race).
            // Just fall back to Google flow directly.
            window.gg?.signInWithGoogle(window.location.href);
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
            // Renaming to our own current nickname is a no-op — skip
            // the availability check (it would return false because
            // we already have the nickname).
            const myCurrent = window.gg.profile?.nickname || '';
            if (newNick && newNick !== myCurrent) {
                // Check uniqueness via the SECURITY DEFINER RPC so we
                // don't need anon SELECT on profiles. Returns only a
                // boolean — no profile row leaks to the client.
                const { data: available } = await window.gg.supabase
                    .rpc('is_nickname_available', { p_nickname: newNick });

                if (!available) {
                    editHint.textContent = `@${newNick} is already taken — pick another`;
                    editHint.classList.add('is-error');
                    editSave.disabled = false;
                    return;
                }
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


    /* ---------- Password reset modal ----------
       Opens automatically when the user arrives from a "forgot password"
       email link. Supabase processes the recovery token in the URL
       fragment and fires PASSWORD_RECOVERY on our auth state listener;
       we react to it below by popping this modal. The user must either
       set a new password or cancel (which signs them out) — there is
       no "X" close button, because closing without doing either would
       leave them in a half-state where they're signed in but can't do
       anything useful.

       Note: PASSWORD_RECOVERY fires once on initial page load IF the
       URL contains the recovery hash. We additionally check the hash
       manually because the auth event might arrive *before* this
       script subscribes (race in older Supabase SDKs). */

    function isRecoveryUrl() {
        // Recovery URL looks like: /profile.html#access_token=...&type=recovery&...
        const h = window.location.hash || '';
        return h.includes('type=recovery');
    }

    function openPwdModal() {
        if (!pwdModal) return;
        pwdInput.value   = '';
        pwdConfirm.value = '';
        pwdHint.classList.remove('is-error');
        pwdHint.textContent = '8 characters min · must match';
        pwdSave.disabled = true;
        // Hide the rest of the profile UI underneath — the user is in a
        // recovery session, they shouldn't see stats / settings yet.
        hide(loadingEl);
        hide(anonEl);
        hide(authEl);
        show(pwdModal);
        setTimeout(() => pwdInput.focus(), 40);
    }

    function closePwdModal() {
        if (pwdModal) hide(pwdModal);
    }

    function validatePwdForm() {
        const v1 = pwdInput.value;
        const v2 = pwdConfirm.value;
        let valid = true;
        if (v1.length < 8) {
            valid = false;
            pwdHint.textContent = '8 characters min · must match';
            pwdHint.classList.remove('is-error');
        } else if (v2.length > 0 && v1 !== v2) {
            valid = false;
            pwdHint.textContent = 'passwords don\'t match';
            pwdHint.classList.add('is-error');
        } else if (v1 === v2) {
            pwdHint.textContent = '✓ ready to save';
            pwdHint.classList.remove('is-error');
        }
        pwdSave.disabled = !valid || v1 !== v2 || v2.length === 0;
    }

    if (pwdInput)   pwdInput.addEventListener('input', validatePwdForm);
    if (pwdConfirm) pwdConfirm.addEventListener('input', validatePwdForm);

    if (pwdSave) pwdSave.addEventListener('click', async () => {
        const newPwd = pwdInput.value;
        if (newPwd.length < 8 || newPwd !== pwdConfirm.value) return;
        pwdSave.disabled = true;
        pwdHint.textContent = 'updating…';
        pwdHint.classList.remove('is-error');
        try {
            await window.gg.updatePassword(newPwd);
            // Strip the recovery hash so a refresh doesn't re-open
            // the modal (and so the URL looks clean).
            if (window.location.hash) {
                history.replaceState(null, '', window.location.pathname);
            }
            closePwdModal();
            // The session is now fully-fledged — render the profile.
            // onAuthChange would also re-render on the next USER_UPDATED
            // event, but doing it here avoids a flicker.
            if (window.gg.profile) {
                renderAuthenticated(window.gg.profile);
            } else {
                await window.gg.loadProfile();
                if (window.gg.profile) renderAuthenticated(window.gg.profile);
                else renderAnonymous();
            }
        } catch (err) {
            console.error('[profile] update password failed:', err);
            pwdHint.textContent = err?.message || 'something went wrong — try again';
            pwdHint.classList.add('is-error');
            pwdSave.disabled = false;
        }
    });

    if (pwdCancel) pwdCancel.addEventListener('click', async () => {
        pwdCancel.disabled = true;
        try {
            await window.gg.signOut();
        } catch (err) {
            console.error('[profile] cancel-reset sign-out failed:', err);
        }
        // Strip the recovery hash so refresh / back doesn't re-trigger
        if (window.location.hash) {
            history.replaceState(null, '', window.location.pathname);
        }
        closePwdModal();
        // signOut auto-establishes an anon session; auth listener will
        // render the anon panel. Redirect home for cleanliness.
        window.location.href = 'index.html';
    });


    /* ---------- Esc to close modals ---------- */
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!editModal.hidden) closeEditModal();
        if (!delModal.hidden)  closeDeleteModal();
        // Intentionally no Esc handler for pwd-modal — recovery flow
        // requires an explicit save or cancel.
    });
    // Click outside modal card to close
    [editModal, delModal].forEach(m => {
        m.addEventListener('click', (e) => { if (e.target === m) m.hidden = true; });
    });


    /* ---------- Auth state coordination ---------- */
    let recoveryHandled = false;

    window.gg.onAuthChange((state) => {
        // PASSWORD_RECOVERY hijacks the normal anon/auth render until
        // the user finishes the reset flow.
        if (state.event === 'PASSWORD_RECOVERY' && !recoveryHandled) {
            recoveryHandled = true;
            openPwdModal();
            return;
        }
        // Don't re-render normal profile UI while pwd-modal is up
        if (pwdModal && !pwdModal.hidden) return;

        if (state.isAnon || !state.profile) {
            renderAnonymous();
        } else {
            renderAuthenticated(state.profile);
        }
    });

    // Race-safe fallback: if the page loaded with a recovery hash but
    // PASSWORD_RECOVERY fired before our listener attached, force-open
    // the modal here. The double-trigger is guarded by recoveryHandled.
    if (isRecoveryUrl() && !recoveryHandled) {
        recoveryHandled = true;
        openPwdModal();
    }

})();
