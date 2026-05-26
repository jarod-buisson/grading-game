/* =========================================================
   room-state.js — multiplayer room state machine
                   (Supabase-wired version)

   States are driven by the `rooms.state` field, observed via
   realtime postgres_changes. All clients render the same UI
   based on the shared state.

   Host-only transitions go through set_room_state RPC.
   PLAYING → GALLERY auto-advances when all players have
   submitted OR the timer expires (the host's client triggers
   the RPC; others just observe the change).

   ?dev=1 in URL shows a state switcher for debugging (host only).
   ========================================================= */

(function () {
    'use strict';

    if (!window.gg) {
        document.body.innerHTML =
            '<pre style="color:white;padding:32px;">Supabase SDK not loaded · check console</pre>';
        return;
    }
    const { supabase } = gg;
    const $  = (id) => document.getElementById(id);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));

    /* ============ URL params ============ */
    const params    = new URLSearchParams(location.search);
    const ROOM_CODE = (params.get('code') || '').toUpperCase();
    const DEV_MODE  = params.get('dev') === '1';

    if (!ROOM_CODE) {
        location.href = 'multi.html';
        return;
    }

    /* ============ STATE ============ */
    const st = {
        room:        null,    // current rooms row
        players:     [],      // players rows
        submissions: [],      // submissions rows
        votes:       [],      // votes rows
        myPlayer:    null,    // current user's player row
        challenge:   null,    // resolved challenge from manifest.json
        myVotes:     {},      // submission_id → stars (local only)
        myGradeFile: null,    // File chosen by the user (not yet uploaded)
        channel:     null,    // realtime channel
        rafId:       null,    // current timer rAF id
        advanceLock: false,   // prevents double-fire of set_room_state from same client
        historyLogged: false  // flips on game_history insert; reset on leave 'result'
    };

    /* ============ BOOT ============ */
    gg.onReady(async (uid) => {
        if (!uid) {
            alert('auth required · enable anonymous sign-ins in Supabase dashboard');
            location.href = 'multi.html';
            return;
        }
        await joinFlow();
    });

    async function joinFlow() {
        const nick = (localStorage.getItem('gradinggame.nickname') || '').trim() ||
                     ('guest_' + Math.random().toString(36).slice(2, 6).toUpperCase());

        // Try a SELECT first — works if room is public or we're already a member
        const { data: room } = await supabase
            .from('rooms').select('*').eq('code', ROOM_CODE).maybeSingle();

        if (room) {
            const { data: existing } = await supabase
                .from('players').select('*')
                .eq('room_id', room.id).eq('user_id', gg.userId).maybeSingle();
            if (existing) {
                // Already a member — bump last_seen and continue
                st.room = room;
                st.myPlayer = existing;
                supabase.from('players')
                    .update({ last_seen: new Date().toISOString() })
                    .eq('id', existing.id).then();   // fire-and-forget
                return initRoom();
            }
        }

        // Either room is private (not visible via SELECT) or we're not a member —
        // try the RPC. It will fail if state != 'lobby' AND we're a new joiner.
        const { data: joined, error } = await supabase.rpc('join_room_by_code', {
            p_code: ROOM_CODE,
            p_nickname: nick
        });
        if (error) {
            alert('Cannot join room ' + ROOM_CODE + ': ' + error.message);
            location.href = 'multi.html';
            return;
        }
        st.room = joined;

        // Re-fetch our own player record
        const { data: mine } = await supabase
            .from('players').select('*')
            .eq('room_id', joined.id).eq('user_id', gg.userId).single();
        st.myPlayer = mine;

        await initRoom();
    }

    async function initRoom() {
        console.log('[room] joined', st.room.code, 'as', st.myPlayer.nickname, st.myPlayer.is_host ? '(host)' : '');
        await fetchAll();
        subscribeRealtime();
        await loadChallenge();
        bindUI();
        renderAll();
        // Dev switcher
        if (DEV_MODE && st.myPlayer.is_host) {
            $('dev-switcher').classList.add('is-on');
            $$('#dev-switcher button').forEach(b => {
                b.onclick = () => transitionState(b.dataset.state);
            });
        }
    }

    async function fetchAll() {
        const id = st.room.id;
        const [pl, sub, vt] = await Promise.all([
            supabase.from('players').select('*').eq('room_id', id).order('joined_at'),
            supabase.from('submissions').select('*').eq('room_id', id),
            supabase.from('votes').select('*').eq('room_id', id)
        ]);
        st.players     = pl.data  || [];
        st.submissions = sub.data || [];
        st.votes       = vt.data  || [];
    }

    /* ============ REALTIME ============ */
    function subscribeRealtime() {
        if (st.channel) supabase.removeChannel(st.channel);
        const id = st.room.id;
        st.channel = supabase
            .channel('room:' + id)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'rooms', filter: 'id=eq.' + id },
                onRoomChange)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'players', filter: 'room_id=eq.' + id },
                onPlayersChange)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'submissions', filter: 'room_id=eq.' + id },
                onSubmissionsChange)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'votes', filter: 'room_id=eq.' + id },
                onVotesChange)
            .subscribe((status) => console.log('[room] realtime ·', status));
    }

    function onRoomChange(payload) {
        if (payload.eventType === 'DELETE') {
            alert('The room was closed.');
            location.href = 'multi.html';
            return;
        }
        const prevState = st.room?.state;
        st.room = payload.new;
        if (prevState !== st.room.state) {
            console.log('[room] state →', st.room.state);
            // Reset transient state when entering a new phase
            if (st.room.state === 'playing') st.myGradeFile = null;
            if (st.room.state === 'gallery') st.myVotes = {};
            // Re-fetch everything when entering gallery / result so we don't
            // depend on every individual realtime INSERT having arrived in
            // time (any submission/vote that landed after our last state
            // sync would otherwise be missing from our local arrays).
            if (st.room.state === 'gallery' || st.room.state === 'result') {
                fetchAll().then(() => {
                    console.log('[room] post-transition refetch ·',
                        st.submissions.length, 'subs ·',
                        st.votes.length, 'votes');
                    renderAll();
                });
                return;  // renderAll will run after fetchAll resolves
            }
        }
        renderAll();
    }

    function onPlayersChange(p) {
        applyChange(st.players, p);
        if (p.new?.user_id === gg.userId) st.myPlayer = p.new;
        renderAll();
    }
    function onSubmissionsChange(p) {
        applyChange(st.submissions, p);
        renderAll();
        // Auto-advance: if I'm the host and everyone has submitted, advance to gallery
        if (st.room?.state === 'playing' && st.myPlayer?.is_host) {
            if (allPlayersSubmitted()) transitionState('gallery');
        }
    }
    function onVotesChange(p) {
        applyChange(st.votes, p);
        renderAll();
        // Auto-advance: if I'm the host and everyone has finished voting, go to result
        if (st.room?.state === 'gallery' && st.myPlayer?.is_host) {
            if (allPlayersVoted()) transitionState('result');
        }
    }

    function applyChange(array, p) {
        if (p.eventType === 'INSERT' || p.eventType === 'UPDATE') {
            const row = p.new;
            const idx = array.findIndex(x => x.id === row.id);
            if (idx >= 0) array[idx] = row;
            else array.push(row);
        } else if (p.eventType === 'DELETE') {
            const row = p.old || p.new;
            const idx = array.findIndex(x => x.id === row.id);
            if (idx >= 0) array.splice(idx, 1);
        }
    }

    /* ============ STATE TRANSITIONS ============ */
    async function transitionState(target) {
        if (st.advanceLock) return;
        if (st.room?.state === target) return;
        if (!st.myPlayer?.is_host) {
            console.warn('[room] only host can advance state');
            return;
        }
        st.advanceLock = true;
        const { error } = await supabase.rpc('set_room_state', {
            p_room_id: st.room.id,
            p_state: target
        });
        if (error) console.error('[room] set_room_state failed:', error);
        setTimeout(() => { st.advanceLock = false; }, 400);
    }

    /* ============ CHALLENGE ============ */
    async function loadChallenge() {
        try {
            const resp = await fetch('images/challenges/manifest.json?t=' + Date.now(),
                { cache: 'no-store' });
            const data = await resp.json();
            const list = data.challenges || [];
            const cid = st.room.challenge_id;
            if (cid && cid !== 'random') {
                st.challenge = list.find(c => c.id === cid) || list[0] || null;
            } else {
                // Deterministic pick from room id so all clients see the same challenge
                const h = Array.from(st.room.id).reduce((s, c) => s + c.charCodeAt(0), 0);
                st.challenge = list[h % Math.max(list.length, 1)] || null;
            }
        } catch (e) {
            console.warn('[room] challenge load failed:', e);
            st.challenge = null;
        }
    }

    /* ============ HELPERS ============ */
    const allPlayersSubmitted = () =>
        st.players.length > 0 &&
        st.players.every(p => st.submissions.some(s => s.player_id === p.id));

    function votableSubmissions() {
        return st.submissions.filter(s => {
            const owner = st.players.find(p => p.id === s.player_id);
            return owner?.user_id !== gg.userId;
        });
    }

    function allPlayersVoted() {
        // For each player, count if they voted on every submission they should have
        // (every submission except their own).
        for (const p of st.players) {
            const expectedSubs = st.submissions.filter(s => s.player_id !== p.id);
            const myVoteCount = st.votes.filter(v => v.voter_id === p.id).length;
            if (myVoteCount < expectedSubs.length) return false;
        }
        return st.submissions.length > 0;
    }

    /* ============ RENDER ============ */
    function renderAll() {
        const s = st.room?.state || 'lobby';
        // Reset the once-per-round logging flag when we leave the result panel
        if (s !== 'result') st.historyLogged = false;
        $$('.state-panel').forEach(p => p.classList.toggle('is-active', p.dataset.state === s));
        $('state-label').textContent = s;
        $('room-code-display').textContent = st.room?.code || '——————';
        renderPlayerChips();
        if (s === 'lobby')   renderLobby();
        if (s === 'playing') renderPlaying();
        if (s === 'gallery') renderGallery();
        if (s === 'result')  renderResult();
        if (DEV_MODE) {
            $$('#dev-switcher button').forEach(b =>
                b.classList.toggle('is-active', b.dataset.state === s));
        }
    }

    function renderPlayerChips() {
        const wrap = $('player-chips');
        wrap.innerHTML = '';
        st.players.forEach(p => {
            const submitted = st.submissions.some(s => s.player_id === p.id);
            const isMe = p.user_id === gg.userId;
            const chip = document.createElement('span');
            chip.className = 'player-chip is-online';
            if (p.is_host) chip.classList.add('is-host');
            if (isMe)      chip.classList.add('is-self');
            if (submitted) chip.classList.add('is-submitted');
            chip.innerHTML = `<span class="chip-dot"></span>${escHTML(p.nickname)}${p.is_host ? ' ★' : ''}`;
            wrap.appendChild(chip);
        });
    }

    /* ----- LOBBY ----- */
    function renderLobby() {
        const r = st.room;
        $('lobby-code-big').textContent = r.code;
        $('sess-duration').textContent   = r.duration_min + ' min';
        $('sess-challenge').textContent  = r.challenge_id || 'random';
        $('sess-visibility').textContent = r.visibility;
        $('lobby-player-count').textContent = `${st.players.length}/${r.max_players}`;

        const list = $('lobby-player-list');
        list.innerHTML = '';
        for (let i = 0; i < r.max_players; i++) {
            const p = st.players[i];
            const isMe = p?.user_id === gg.userId;
            const row = document.createElement('div');
            row.className = 'player-row' + (p ? '' : ' is-waiting') + (isMe ? ' is-self' : '');
            row.innerHTML = p
                ? `<div class="player-row-name">${escHTML(p.nickname)}${p.is_host ? ' <span class="role-tag">host</span>' : ''}</div>
                   <div class="player-row-status">online</div>`
                : `<div class="player-row-name">waiting…</div>
                   <div class="player-row-status">open</div>`;
            list.appendChild(row);
        }

        const startBtn  = $('btn-start');
        const startLbl  = $('btn-start-label');
        const waitHint  = $('waiting-hint');
        const meIsHost  = st.myPlayer?.is_host;
        if (meIsHost) {
            startBtn.style.display = 'flex';
            waitHint.style.display = 'none';
            const ok = st.players.length >= 2;
            startBtn.disabled = !ok;
            startLbl.textContent = ok
                ? `start with ${st.players.length} player${st.players.length > 1 ? 's' : ''}`
                : 'need at least 2 players';
        } else {
            startBtn.style.display = 'none';
            waitHint.style.display = 'block';
        }
    }

    /* ----- PLAYING ----- */
    function renderPlaying() {
        const r = st.room;

        // Timer ticks (one block per minute)
        const ticksEl = $('play-timer-ticks');
        if (ticksEl.childElementCount !== r.duration_min) {
            ticksEl.innerHTML = '';
            for (let i = 0; i < r.duration_min; i++) ticksEl.appendChild(document.createElement('span'));
        }
        $('play-timer-total').textContent = String(r.duration_min).padStart(2, '0') + ':00';

        // Preview image
        const frame = $('play-preview-frame');
        const ph    = $('play-preview-ph');
        if (st.challenge?.cover && !frame.querySelector('img')) {
            const img = new Image();
            img.onload  = () => { ph.style.display = 'none'; frame.insertBefore(img, frame.firstChild); };
            img.onerror = () => { ph.children[1].textContent = 'cover failed to load'; };
            img.src = st.challenge.cover;
        }
        if (st.challenge) {
            $('play-preview-meta').textContent = st.challenge.meta || '— · — · —';
            $('play-source-name').textContent  = st.challenge.source
                ? st.challenge.source.split('/').pop()
                : 'source.???';
            $('play-source-size').textContent  = st.challenge.sourceSize
                ? formatSize(st.challenge.sourceSize) : '— mb';
        }

        // Submission status rows (one per player)
        const sub = $('submission-status');
        sub.innerHTML = '';
        st.players.forEach(p => {
            const submitted = st.submissions.some(s => s.player_id === p.id);
            const row = document.createElement('div');
            row.className = 'sub-row' + (submitted ? ' is-submitted' : '');
            row.innerHTML = `
                <span class="sub-row-name">${escHTML(p.nickname)}${p.user_id === gg.userId ? ' (you)' : ''}</span>
                <span class="sub-row-status">${submitted ? 'submitted ✓' : 'waiting'}</span>
            `;
            sub.appendChild(row);
        });

        // Wire upload + submit
        wirePlayingInputs();

        // Reflect whether I've already submitted
        const mySub = st.submissions.find(s => s.player_id === st.myPlayer.id);
        const dropZone  = $('play-drop-zone');
        const dropText  = $('play-drop-text');
        const dropSub   = $('play-drop-sub');
        const dropIcon  = $('play-drop-icon');
        const submitBtn = $('play-submit-btn');
        if (mySub) {
            dropZone.classList.add('is-loaded');
            dropIcon.textContent = '✓';
            dropText.textContent = 'grade submitted';
            dropSub.textContent  = 'waiting for others…';
            submitBtn.disabled = true;
            submitBtn.querySelector('span').textContent = 'submitted';
            $('play-drop-filename').style.display = 'block';
            $('play-drop-filename').textContent = (mySub.file_name || 'your grade');
        }

        // Download button — gated by the Terms-of-Use modal so the player
        // explicitly accepts the contributor's license + the file gets renamed
        // with their pseudo (gg_{id}_{nick}_{date}.{ext}) as a passive deterrent
        // against re-sharing.
        $('play-download-btn').onclick = () => {
            if (!st.challenge?.source) { alert('No source file for this challenge.'); return; }
            if (window.DownloadConfirm) {
                DownloadConfirm.show(st.challenge, () => {
                    const filename = DownloadConfirm.personalizeFilename(st.challenge);
                    FileIO.downloadFile(st.challenge.source, filename);
                });
            } else {
                FileIO.downloadFile(st.challenge.source, st.challenge.source.split('/').pop());
            }
        };

        // Start the timer rAF loop
        if (!st.rafId) tickTimer();
    }

    function tickTimer() {
        if (st.rafId) cancelAnimationFrame(st.rafId);
        function loop() {
            if (st.room?.state !== 'playing') { st.rafId = null; return; }
            const r = st.room;
            const startMs = r.started_at ? new Date(r.started_at).getTime() : Date.now();
            const totalMs = r.duration_min * 60_000;
            const remaining = Math.max(0, startMs + totalMs - Date.now());
            const totalSec = Math.ceil(remaining / 1000);
            const m = Math.floor(totalSec / 60);
            const s = totalSec % 60;
            $('play-time-min').textContent = String(m).padStart(2, '0');
            $('play-time-sec').textContent = String(s).padStart(2, '0');
            const fill = $('play-timer-fill');
            if (fill) fill.style.transform = `scaleX(${(remaining / totalMs).toFixed(4)})`;
            const disp = $('play-timer-display');
            disp.classList.remove('is-warning', 'is-critical');
            if      (totalSec <= 60)  disp.classList.add('is-critical');
            else if (totalSec <= 180) disp.classList.add('is-warning');
            if (remaining <= 0) {
                // Timer expired — host advances
                if (st.myPlayer?.is_host) transitionState('gallery');
                st.rafId = null;
                return;
            }
            st.rafId = requestAnimationFrame(loop);
        }
        loop();
    }

    function wirePlayingInputs() {
        const dropZone   = $('play-drop-zone');
        const gradeInput = $('play-grade-input');
        const submitBtn  = $('play-submit-btn');

        // Avoid double-binding
        if (dropZone.dataset.wired === '1') return;
        dropZone.dataset.wired = '1';

        gradeInput.onchange = (e) => acceptFile(e.target.files[0]);
        ['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, (e) => {
            e.preventDefault(); e.stopPropagation();
            dropZone.classList.add('is-over');
        }));
        ['dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, (e) => {
            e.preventDefault(); e.stopPropagation();
            if (ev !== 'drop') dropZone.classList.remove('is-over');
        }));
        dropZone.addEventListener('drop', (e) => {
            dropZone.classList.remove('is-over');
            acceptFile(e.dataTransfer.files[0]);
        });

        submitBtn.onclick = () => uploadAndSubmit();
    }

    function acceptFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        st.myGradeFile = file;
        $('play-drop-zone').classList.add('is-loaded');
        $('play-drop-icon').textContent = '✓';
        $('play-drop-text').textContent = 'grade loaded';
        $('play-drop-sub').textContent  = formatSize(file.size) + ' · ready to submit';
        $('play-drop-filename').style.display = 'block';
        $('play-drop-filename').textContent = file.name;
        $('play-submit-btn').disabled = false;
    }

    async function uploadAndSubmit() {
        if (!st.myGradeFile) return;
        const file = st.myGradeFile;
        const btn  = $('play-submit-btn');
        btn.disabled = true;
        btn.querySelector('span').textContent = 'uploading…';

        const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
        const path = `${st.room.id}/${st.myPlayer.id}/grade.${ext}`;
        const { error: upErr } = await supabase.storage
            .from('submissions')
            .upload(path, file, { upsert: true, contentType: file.type });
        if (upErr) {
            alert('Upload failed: ' + upErr.message);
            btn.disabled = false;
            btn.querySelector('span').textContent = 'submit grade';
            return;
        }
        const { data: pub } = supabase.storage.from('submissions').getPublicUrl(path);
        const fileUrl = pub.publicUrl;

        // Insert/replace submission row
        const { error: insErr } = await supabase
            .from('submissions')
            .upsert({
                room_id: st.room.id,
                player_id: st.myPlayer.id,
                file_url: fileUrl,
                file_name: file.name,
                file_size: file.size
            }, { onConflict: 'room_id,player_id' });
        if (insErr) {
            alert('Submit failed: ' + insErr.message);
            btn.disabled = false;
            btn.querySelector('span').textContent = 'submit grade';
            return;
        }
        btn.querySelector('span').textContent = 'submitted';
    }

    /* ----- GALLERY ----- */
    function renderGallery() {
        console.log('[gallery] render ·',
            st.submissions.length, 'submissions ·',
            st.players.length, 'players ·',
            st.votes.length, 'votes');

        $('votes-total').textContent = votableSubmissions().length;
        $('votes-done').textContent  = Object.keys(st.myVotes).length;

        const grid = $('gallery-grid');
        grid.innerHTML = '';

        // Shuffle submissions deterministically per voter for anonymity.
        // .filter(Boolean) is a defensive guard against any undefined entries
        // (e.g. if a vote arrives via realtime before the corresponding
        // submission row has been re-fetched).
        const seed = stringSeed(st.myPlayer.id);
        const shuffled = shuffleStable([...st.submissions], seed).filter(Boolean);

        shuffled.forEach((s, idx) => {
            if (!s || !s.id) return;  // safety, see filter(Boolean) above
            const owner = st.players.find(p => p.id === s.player_id);
            const isOwn = owner?.user_id === gg.userId;
            const labelNum = String(idx + 1).padStart(2, '0');

            const card = document.createElement('div');
            card.className = 'submission-card' + (isOwn ? ' is-own' : '');
            card.dataset.id = s.id;

            const existingVote = st.myVotes[s.id] || (
                st.votes.find(v => v.voter_id === st.myPlayer.id && v.submission_id === s.id)?.stars
            );
            if (existingVote) {
                st.myVotes[s.id] = existingVote;
                card.classList.add('is-voted');
            }

            card.innerHTML = `
                <div class="submission-img">
                    <span class="anon-badge">anon · ${labelNum}</span>
                    <img src="${escAttr(s.file_url)}" alt="">
                </div>
                <div class="submission-meta">
                    <span class="submission-num">submission · ${labelNum}</span>
                    ${isOwn
                        ? '<span class="submission-num" style="color:var(--accent)">your grade</span>'
                        : `<div class="submission-stars" data-sub="${s.id}">
                              ${[1,2,3,4,5].map(n =>
                                  `<button class="star-btn ${existingVote && n <= existingVote ? 'is-on' : ''}"
                                           data-stars="${n}">★</button>`).join('')}
                          </div>`
                    }
                </div>
                ${isOwn ? '<div class="submission-own-overlay">cannot vote on your own grade</div>' : ''}
            `;
            grid.appendChild(card);
        });

        // Wire stars
        grid.querySelectorAll('.submission-stars').forEach(group => {
            const subId = group.dataset.sub;
            group.querySelectorAll('.star-btn').forEach(btn => {
                btn.onclick = () => castStar(subId, parseInt(btn.dataset.stars, 10), group);
            });
        });

        const finalize = $('finalize-votes');
        const done = Object.keys(st.myVotes).length;
        const total = votableSubmissions().length;
        finalize.disabled = done < total;
        finalize.onclick = () => transitionState('result');
    }

    async function castStar(submissionId, stars, group) {
        st.myVotes[submissionId] = stars;
        group.querySelectorAll('.star-btn').forEach(b => {
            const n = parseInt(b.dataset.stars, 10);
            b.classList.toggle('is-on', n <= stars);
        });
        const card = group.closest('.submission-card');
        card.classList.add('is-voted');

        $('votes-done').textContent = Object.keys(st.myVotes).length;
        const total = votableSubmissions().length;
        if (Object.keys(st.myVotes).length >= total) $('finalize-votes').disabled = false;

        // Persist the vote (upsert based on UNIQUE(voter_id, submission_id))
        const { error } = await supabase.from('votes').upsert({
            room_id:       st.room.id,
            voter_id:      st.myPlayer.id,
            submission_id: submissionId,
            stars:         stars
        }, { onConflict: 'voter_id,submission_id' });
        if (error) console.warn('[vote] upsert failed:', error);
    }

    /* ----- RESULT ----- */
    function renderResult() {
        // Aggregate votes per submission
        const scores = st.submissions.map(s => {
            const owner = st.players.find(p => p.id === s.player_id);
            const myVotes = st.votes.filter(v => v.submission_id === s.id);
            const sum = myVotes.reduce((a, v) => a + v.stars, 0);
            const avg = myVotes.length ? sum / myVotes.length : 0;
            return {
                submission: s,
                nick: owner?.nickname || '?',
                isMe: owner?.user_id === gg.userId,
                avg,
                votes: myVotes.length
            };
        });
        scores.sort((a, b) => b.avg - a.avg);

        $('result-winner').textContent =
            scores.length
                ? `${scores[0].nick} · ${scores[0].avg.toFixed(2)} ★`
                : '— no submissions —';

        // Podium top 3
        const podium = $('podium-row');
        podium.innerHTML = '';
        const order = [scores[1], scores[0], scores[2]].filter(Boolean);
        const rankFor = (s) => scores.indexOf(s);
        order.forEach(s => {
            const r = rankFor(s);
            const cls = r === 0 ? 'is-first' : r === 1 ? 'is-second' : 'is-third';
            const cell = document.createElement('div');
            cell.className = 'podium-cell ' + cls;
            cell.innerHTML = `
                <div class="podium-cell-rank ${cls}">
                    ${r === 0 ? '01 · winner' : r === 1 ? '02 · runner up' : '03 · third'}
                </div>
                <div class="podium-cell-img"><img src="${escAttr(s.submission.file_url)}" alt=""></div>
                <div class="podium-cell-info">
                    <div class="podium-cell-name">${escHTML(s.nick)}${s.isMe ? ' (you)' : ''}</div>
                    <div class="podium-cell-score">${s.avg.toFixed(2)} ★ · ${s.votes} vote${s.votes>1?'s':''}</div>
                </div>
            `;
            podium.appendChild(cell);
        });

        const rows = $('scoreboard-rows');
        rows.innerHTML = '';
        scores.forEach((s, i) => {
            const row = document.createElement('div');
            row.className = 'score-row' + (s.isMe ? ' is-self' : '');
            row.innerHTML = `
                <span class="score-rank ${i < 3 ? 'is-top' : ''}">${String(i+1).padStart(2,'0')}</span>
                <span class="score-name ${s.isMe ? 'is-self' : ''}">${escHTML(s.nick)}${s.isMe ? ' (you)' : ''}</span>
                <span class="score-stars">${s.avg.toFixed(2)} ★</span>
                <span class="score-votes">${s.votes} votes</span>
            `;
            rows.appendChild(row);
        });

        $('result-back').onclick = () => transitionState('lobby');
        $('result-new').onclick  = () => { location.href = 'multi.html'; };

        // ----- Log this round to game_history (authenticated users only) -----
        if (!st.historyLogged && gg.isAuthenticated) {
            st.historyLogged = true;  // optimistic; we won't retry on insert failure
            logMultiHistory(scores).catch(err =>
                console.warn('[room] failed to log multi history:', err));
        }
    }

    /**
     * Insert one game_history row for the current user, capturing their
     * score (sum of stars received) and rank (1-based) in this round.
     * No-op for anonymous users (caller already checked).
     */
    async function logMultiHistory(scores) {
        const mineIdx = scores.findIndex(s => s.isMe);
        if (mineIdx === -1) {
            // Voter-only user (didn't submit a grade) → still log the participation
            // so games_played counts, but no score/rank.
            await insertHistoryRow(null, null);
            return;
        }
        const mine     = scores[mineIdx];
        const myVotes  = st.votes.filter(v => v.submission_id === mine.submission.id);
        const myScore  = myVotes.reduce((a, v) => a + v.stars, 0);  // sum of stars
        const myRank   = mineIdx + 1;
        await insertHistoryRow(myScore, myRank);
    }

    async function insertHistoryRow(score, rank) {
        const challengeId = st.room?.challenge_id || st.challenge?.id || null;
        if (!challengeId) {
            console.log('[room] skipping history log — no challenge id resolved');
            return;
        }
        const { error } = await supabase
            .from('game_history')
            .insert({
                user_id:      gg.userId,
                mode:         'multi',
                challenge_id: String(challengeId),
                room_id:      st.room?.id || null,
                score:        score ?? 0,
                rank:         rank
            });
        if (error) {
            console.warn('[room] game_history insert error:', error);
            // Re-enable so a retry happens on the next renderResult tick
            st.historyLogged = false;
        } else {
            console.log('[room] logged multi history · score=', score, 'rank=', rank);
        }
    }

    /* ============ UI WIRING (one-shot) ============ */
    let uiBound = false;
    function bindUI() {
        if (uiBound) return;
        uiBound = true;

        // Top bar
        const copy = (code) => {
            navigator.clipboard?.writeText(code).then(() => {
                const hint = $('lobby-code-hint');
                if (hint) {
                    hint.textContent = 'copied!';
                    hint.style.color = 'var(--accent-green)';
                    setTimeout(() => { hint.textContent = 'click to copy'; hint.style.color = ''; }, 1600);
                }
            });
        };
        $('room-code-display').onclick = () => copy(st.room.code);
        $('lobby-code-big').onclick    = () => copy(st.room.code);

        $('btn-start').onclick = () => transitionState('playing');

        $('quit-room').onclick = async () => {
            if (!confirm('Leave this room?')) return;
            // Remove our player row (cascades unsubmits/votes via FK ON DELETE CASCADE)
            await supabase.from('players').delete().eq('id', st.myPlayer.id);
            location.href = 'multi.html';
        };
    }

    /* ============ UTILITIES ============ */
    function formatSize(bytes) {
        if (!bytes && bytes !== 0) return '— mb';
        const mb = bytes / (1024 * 1024);
        return mb < 0.1 ? (bytes / 1024).toFixed(1) + ' kb' : mb.toFixed(1) + ' mb';
    }

    function escHTML(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[c]));
    }

    function escAttr(s) { return escHTML(s); }

    function stringSeed(s) {
        // Cheap deterministic seed from a string. `>>> 0` forces unsigned
        // 32-bit so we never return a negative number (which used to break
        // shuffleStable by producing negative array indices → undefined holes
        // → render exceptions → unclicked stars).
        let h = 0;
        for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        return h >>> 0;
    }

    function shuffleStable(arr, seed) {
        const a = arr.slice();
        // Guard against any non-finite or negative seed sneaking in
        let s = (seed >>> 0) || 1;
        for (let i = a.length - 1; i > 0; i--) {
            s = (s * 9301 + 49297) % 233280;
            const j = Math.floor((s / 233280) * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

})();
