/* =========================================================
   multi-lobby.js — multiplayer lobby (Supabase-wired)

   Reads public rooms from `rooms` (with embedded `players`),
   subscribes to realtime changes, calls `create_room` and
   `join_room_by_code` RPCs for the host/join flows.

   Requires `window.gg` (set up by supabase-client.js).
   ========================================================= */

(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);

    if (!window.gg) {
        const t = $('status-text'); if (t) t.textContent = 'supabase sdk failed to load · check console';
        const g = $('status-tag');  if (g) g.textContent = 'err';
        return;
    }
    const { supabase } = gg;

    /* =========================================================
       STATUS BANNER
       ========================================================= */
    function setStatus(tag, text, kind) {
        if ($('status-tag'))  $('status-tag').textContent  = tag;
        if ($('status-text')) $('status-text').textContent = text;
        const banner = $('demo-banner');
        if (banner) {
            banner.style.borderColor =
                kind === 'err' ? 'rgba(208,92,92,0.5)' :
                kind === 'ok'  ? 'rgba(95,168,109,0.4)' :
                                 'rgba(212,165,116,0.25)';
            const tagEl = $('status-tag');
            if (tagEl) {
                tagEl.style.background =
                    kind === 'err' ? 'var(--accent-red)'   :
                    kind === 'ok'  ? 'var(--accent-green)' :
                                     'var(--accent)';
            }
        }
    }

    /* =========================================================
       NICKNAME (persisted in localStorage — unchanged)
       ========================================================= */
    const NICK_KEY = 'gradinggame.nickname';

    function makeGuestNick() {
        return 'guest_' + Math.random().toString(36).slice(2, 6).toUpperCase();
    }

    const nickInput = $('nickname-input');
    const identityStatus = $('identity-status');

    let nick = (() => {
        try { return localStorage.getItem(NICK_KEY) || makeGuestNick(); }
        catch (e) { return makeGuestNick(); }
    })();

    if (nickInput) {
        nickInput.value = nick;
        try { localStorage.setItem(NICK_KEY, nick); } catch (e) {}
        nickInput.addEventListener('input', () => {
            nick = nickInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
            if (nick !== nickInput.value) nickInput.value = nick;
            if (nick.length >= 3) {
                try { localStorage.setItem(NICK_KEY, nick); } catch (e) {}
                identityStatus.textContent = 'anonymous · saved locally';
                identityStatus.style.color = '';
            } else {
                identityStatus.textContent = 'pick a nickname (3+ chars)';
                identityStatus.style.color = 'var(--accent-red)';
            }
        });
    }

    function nicknameOK() {
        return nick && nick.length >= 3;
    }

    function flashNickname(msg) {
        if (!nickInput) return;
        nickInput.focus();
        nickInput.style.borderBottomColor = 'var(--accent-red)';
        identityStatus.textContent = msg || 'pick a nickname (3+ chars)';
        identityStatus.style.color = 'var(--accent-red)';
        setTimeout(() => {
            nickInput.style.borderBottomColor = '';
        }, 1600);
    }

    /* =========================================================
       AUTH READY — kick off everything once we have an anon userId
       ========================================================= */
    gg.onReady((uid) => {
        if (!uid) {
            setStatus('err',
                'auth failed · activate "Anonymous Sign-Ins" in Supabase → Authentication → Sign In/Up',
                'err');
            return;
        }
        setStatus('live', 'connected as ' + uid.slice(0, 8) + '… · realtime active', 'ok');
        fetchRooms();
        subscribeRealtime();
    });

    /* =========================================================
       FETCH ROOMS — embed players so we can show host + counts
       ========================================================= */
    const grid       = $('room-grid');
    const roomCountEl = $('room-count');

    async function fetchRooms() {
        // Use the RPC instead of querying `rooms` directly: it returns
        // every active room (public OR private), with private codes
        // redacted to ★ characters, and pre-aggregates host + player count.
        const { data, error } = await supabase.rpc('list_lobby_rooms');

        if (error) {
            console.error('[lobby] list_lobby_rooms error:', error);
            setStatus('err', 'fetch rooms failed: ' + error.message, 'err');
            return;
        }

        const list = (data || []).map(r => {
            const isFull = r.player_count >= r.max_players;
            const status =
                r.state !== 'lobby' ? 'playing' :
                isFull              ? 'full'    : 'open';
            return {
                id:          r.id,
                code:        r.display_code,                 // may be ★★★★★★ for private
                isPrivate:   r.visibility === 'private',
                host:        r.host_nickname || 'unknown',
                players:     r.player_count,
                maxPlayers:  r.max_players,
                durationMin: r.duration_min,
                status
            };
        });

        renderRooms(list);
    }

    function renderRooms(list) {
        // Remove all existing room cards (keep the create card)
        Array.from(grid.querySelectorAll('.room-card:not(.room-card--create)'))
            .forEach(el => el.remove());

        if (list.length === 0) {
            // Insert an empty-state card after the create card
            const empty = document.createElement('div');
            empty.className = 'room-card';
            empty.style.opacity = '0.5';
            empty.style.cursor = 'default';
            empty.innerHTML = `
                <div class="room-head">
                    <div class="room-code" style="font-size:14px; color:var(--text-tertiary)">— no rooms yet —</div>
                </div>
                <div class="room-host">host one with "+ new room"</div>
            `;
            grid.appendChild(empty);
        } else {
            list.forEach(r => {
                const card = document.createElement('div');
                card.className = 'room-card';
                if (r.status === 'full')    card.classList.add('is-full');
                if (r.status === 'playing') card.classList.add('is-playing');
                if (r.isPrivate)            card.classList.add('is-private');
                card.dataset.code = r.code;
                const statusLabel =
                    r.status === 'playing' ? 'playing' :
                    r.status === 'full'    ? 'full'    : 'open';
                card.innerHTML = `
                    <div class="room-head">
                        <div class="room-code">${escapeHTML(r.code)}</div>
                        <div class="room-status room-status--${r.status}">${statusLabel}</div>
                    </div>
                    <div class="room-host">
                        <span class="host-tag">host</span>${escapeHTML(r.host)}
                    </div>
                    <div class="room-meta-row">
                        <div class="room-players">
                            <span class="count-active">${r.players}</span>/${r.maxPlayers} players
                        </div>
                        <div class="room-duration">
                            ${r.isPrivate ? '<span class="lock-tag">⌬ private · code below</span>' : r.durationMin + ' min'}
                        </div>
                    </div>
                `;
                // Public + open rooms join in one click. Private rooms can't
                // be joined this way — user must enter the code manually.
                if (r.status === 'open' && !r.isPrivate) {
                    card.addEventListener('click', () => joinByCode(r.code));
                }
                grid.appendChild(card);
            });
        }

        const openCount = list.filter(r => r.status === 'open').length;
        if (roomCountEl) roomCountEl.textContent = openCount;
    }

    /* =========================================================
       REALTIME — refetch on any change to rooms or players
       ========================================================= */
    let channel = null;

    function subscribeRealtime() {
        if (channel) supabase.removeChannel(channel);
        channel = supabase
            .channel('lobby:public')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'rooms' },
                () => fetchRooms())
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'players' },
                () => fetchRooms())
            .subscribe((status) => {
                console.log('[lobby] realtime channel status:', status);
            });
    }

    /* =========================================================
       REFRESH BUTTON
       ========================================================= */
    $('refresh-rooms')?.addEventListener('click', () => {
        fetchRooms();
    });

    /* =========================================================
       JOIN BY CODE (input field at the bottom)
       ========================================================= */
    const codeInput = $('code-input');
    const joinBtn   = $('join-by-code');

    codeInput?.addEventListener('input', () => {
        codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        if (joinBtn) joinBtn.disabled = codeInput.value.length !== 6;
    });

    joinBtn?.addEventListener('click', () => {
        const code = (codeInput.value || '').trim();
        if (code.length === 6) joinByCode(code);
    });

    codeInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !joinBtn.disabled) joinBtn.click();
    });

    /* =========================================================
       JOIN flow — calls join_room_by_code RPC
       ========================================================= */
    async function joinByCode(code) {
        if (!nicknameOK()) { flashNickname(); return; }
        if (!gg.userId) {
            console.warn('[lobby] no userId yet'); return;
        }

        const upperCode = code.toUpperCase();
        console.log('[lobby] joining', upperCode, 'as', nick);

        const { data: room, error } = await supabase.rpc('join_room_by_code', {
            p_code: upperCode,
            p_nickname: nick
        });

        if (error) {
            console.error('[lobby] join failed:', error);
            alert('Cannot join: ' + (error.message || 'unknown error'));
            return;
        }
        if (!room || !room.code) {
            alert('Room not found.');
            return;
        }
        navigateTo('room.html?code=' + room.code);
    }

    /* =========================================================
       CREATE ROOM modal — calls create_room RPC
       ========================================================= */
    const modal           = $('create-modal');
    const modalClose      = $('modal-close');
    const modalCreateBtn  = $('modal-create-btn');
    const createCard      = $('create-card');

    createCard?.addEventListener('click', openModal);
    createCard?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(); }
    });

    function openModal() {
        if (!nicknameOK()) { flashNickname(); return; }
        modal.classList.add('is-open');
    }
    function closeModal() { modal.classList.remove('is-open'); }

    modalClose?.addEventListener('click', closeModal);
    modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
    });

    // Radio rows
    modal?.querySelectorAll('[data-radio]').forEach(group => {
        group.querySelectorAll('.radio-option').forEach(opt => {
            opt.addEventListener('click', () => {
                if (opt.hasAttribute('disabled')) return;
                group.querySelectorAll('.radio-option')
                    .forEach(o => o.classList.remove('is-selected'));
                opt.classList.add('is-selected');
            });
        });
    });

    function getRadio(name) {
        const grp = modal.querySelector(`[data-radio="${name}"]`);
        return grp?.querySelector('.is-selected')?.dataset.value;
    }

    modalCreateBtn?.addEventListener('click', async () => {
        if (!nicknameOK()) { flashNickname(); return; }
        const visibility = getRadio('visibility')  || 'public';
        const duration   = parseInt(getRadio('duration') || '20', 10);
        const challenge  = getRadio('challenge')   || 'random';
        // Category filter — "random" means no filter, anything else
        // (negative / digital) constrains the host's random pick to
        // that capture medium. The RPC normalises "random" → NULL so
        // we can pass the raw radio value as-is.
        const category   = getRadio('category')    || 'random';

        modalCreateBtn.disabled = true;
        modalCreateBtn.querySelector('span').textContent = 'creating room…';

        const { data: room, error } = await supabase.rpc('create_room', {
            p_visibility: visibility,
            p_duration_min: duration,
            p_challenge_id: challenge,
            p_nickname: nick,
            p_category: category
        });

        if (error) {
            console.error('[lobby] create_room failed:', error);
            alert('Cannot create room: ' + (error.message || 'unknown error'));
            modalCreateBtn.disabled = false;
            modalCreateBtn.querySelector('span').textContent = 'create room';
            return;
        }

        console.log('[lobby] room created:', room.code);
        navigateTo('room.html?code=' + room.code);
    });

    /* =========================================================
       Helpers
       ========================================================= */
    function navigateTo(url) {
        document.body.style.transition = 'opacity 280ms ease';
        document.body.style.opacity = '0';
        setTimeout(() => { window.location.href = url; }, 260);
    }

    function escapeHTML(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[c]));
    }

})();
