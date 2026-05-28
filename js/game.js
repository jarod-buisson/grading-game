/* =========================================================
   game.js — main game-screen logic
   - load challenge from manifest
   - countdown timer with bar
   - download source
   - upload graded jpeg
   - submit → navigate to result.html
   ========================================================= */

(function () {
    'use strict';

    /* ============================================================
       ACTIVE SOLO SESSION — sessionStorage lock against F5/refresh
       ============================================================
       Without this, every page load (including a stray F5) would
       pick a new random challenge AND restart the timer from 0 —
       letting a player rerolls easy photos or get bonus time. Here
       we persist the chosen challenge + the moment the timer
       started so a refresh resumes the EXACT same state.

       The lock is cleared on:
         - Successful submit (grade saved → result.html)
         - Timeout auto-submit
         - Explicit quit (✕ button)
         - The "Start session" button on solo.html (so a deliberate
           new session always wipes the previous one)
       Closing the tab also wipes it (sessionStorage scope = tab).
       ============================================================ */
    const ACTIVE_KEY = 'gradinggame.activeSolo';

    function loadActiveSession() {
        try {
            return JSON.parse(sessionStorage.getItem(ACTIVE_KEY) || 'null');
        } catch (e) { return null; }
    }
    function saveActiveSession(data) {
        try { sessionStorage.setItem(ACTIVE_KEY, JSON.stringify(data)); }
        catch (e) { console.warn('[solo] could not save active session:', e); }
    }
    function clearActiveSession() {
        try { sessionStorage.removeItem(ACTIVE_KEY); } catch (_) {}
    }

    const active = loadActiveSession();

    /* ---------- Parse params ----------
       If we have an active session, ITS values win — URL params
       are advisory only. This prevents a user from extending their
       remaining time by tweaking ?duration in the address bar. */
    const params = FileIO.getParams();
    const DURATION_MIN = active?.duration
        ?? parseInt(params.get('duration') || '20', 10);
    const SHOW_REF     = active
        ? !!active.showRef
        : params.get('reference') !== '0';
    // Optional specific-challenge selection (from the solo dropdown).
    // If absent or "random", we pick at random from the manifest.
    const REQUESTED_CHALLENGE_ID =
        active?.challenge?.id != null
            ? String(active.challenge.id)
            : (params.get('challenge') && params.get('challenge') !== 'random'
                ? params.get('challenge')
                : null);

    // Optional category filter ("negative" / "digital"). Narrows the
    // random pool to a single capture medium so the player only grades
    // photos of the kind they picked at setup. Resumed from the active
    // session on refresh so the filter survives F5.
    const CATEGORY_FILTER =
        active?.category != null
            ? active.category
            : (params.get('category') && params.get('category') !== 'random'
                ? params.get('category')
                : null);

    /* ---------- DOM refs ---------- */
    const $ = (id) => document.getElementById(id);
    const timerDisplay = $('timer-display');
    const timeMinEl    = $('time-min');
    const timeSecEl    = $('time-sec');
    const timerStatus  = $('timer-status');
    const timerBarFill = $('timer-bar-fill');
    const timerBarTotalEl = $('timer-bar-total');
    const timerBarTicks = $('timer-bar-ticks');

    const previewFrame = $('preview-frame');
    const previewPh    = $('preview-placeholder');
    const previewMeta  = $('preview-meta');

    const challengeTitle = $('challenge-title');
    const challengeMeta  = $('challenge-meta');
    const pillChallenge  = $('pill-challenge');

    const downloadBtn  = $('download-btn');
    const sourceName   = $('source-name');
    const sourceSize   = $('source-size');

    const dropZone   = $('drop-zone');
    const gradeInput = $('grade-input');
    const dropIcon   = $('drop-icon');
    const dropText   = $('drop-text');
    const dropSub    = $('drop-sub');
    const dropFn     = $('drop-filename');

    const submitBtn  = $('submit-btn');
    const quitBtn    = $('quit-btn');

    /* ---------- Build timer bar ticks ---------- */
    if (timerBarTicks) {
        for (let i = 0; i < DURATION_MIN; i++) {
            timerBarTicks.appendChild(document.createElement('span'));
        }
    }

    /* ---------- Format the bottom-right total ---------- */
    if (timerBarTotalEl) {
        timerBarTotalEl.textContent =
            String(DURATION_MIN).padStart(2, '0') + ':00';
    }

    /* ---------- Load challenge manifest ---------- */
    let challenge = null;
    let gradedFile = null;
    // Wall-clock timestamp (ms) of when the timer started for this
    // session. Persisted in the active session so a refresh doesn't
    // restart the timer.
    let startedAtMs = active?.startedAt || null;

    function demoChallenge(reason) {
        return {
            id: 'demo',
            title: '— demo fallback —',
            meta: reason || 'no real challenge loaded',
            cover: null,
            source: null,
            sourceSize: 0,
            reference: null
        };
    }

    async function loadChallenge() {
        // ─── If we have an active session, RESUME — no random pick ───
        // This is what prevents F5 from rerolling the challenge: when
        // the user reloads, sessionStorage still has the locked entry,
        // so we just re-use it (same id, same source, same start time).
        if (active && active.challenge) {
            challenge = active.challenge;
            console.log('[challenge] resumed active solo session ·', challenge.id,
                        '· started', new Date(active.startedAt).toLocaleTimeString());
            renderChallenge(challenge);
            return;
        }

        // Detect file:// up-front — fetch() will throw with a confusing message
        if (location.protocol === 'file:') {
            console.error('[challenge] page opened via file:// — fetch is blocked. ' +
                          'serve the project with a local http server, e.g. ' +
                          '`python -m http.server 5501` inside the grading-game folder.');
            renderNoChallenge('opened via file:// — run a local server (see console)');
            challenge = demoChallenge('file:// protocol blocks fetch');
            renderChallenge(challenge);
            return;
        }

        let resp;
        try {
            // Cache-bust: ensures every page load re-reads the manifest so
            // `Math.random()` actually picks freshly. Without it, browsers
            // can cache aggressively (some serve from disk for the full session).
            resp = await fetch('images/challenges/manifest.json?t=' + Date.now(), {
                cache: 'no-store'
            });
        } catch (e) {
            console.error('[challenge] network error fetching manifest:', e);
            renderNoChallenge('network error · check that images/challenges/manifest.json is served');
            challenge = demoChallenge('network error');
            renderChallenge(challenge);
            return;
        }

        if (!resp.ok) {
            console.error('[challenge] manifest http', resp.status, resp.statusText, 'at', resp.url);
            renderNoChallenge('manifest http ' + resp.status + ' · check the file is at images/challenges/manifest.json');
            challenge = demoChallenge('http ' + resp.status);
            renderChallenge(challenge);
            return;
        }

        let data;
        try {
            data = await resp.json();
        } catch (e) {
            console.error('[challenge] manifest JSON parse error:', e);
            renderNoChallenge('manifest invalid json · ' + (e.message || 'parse error'));
            challenge = demoChallenge('invalid json');
            renderChallenge(challenge);
            return;
        }

        const list = (data && data.challenges) || [];
        if (!list.length) {
            console.warn('[challenge] manifest has no entries');
            renderNoChallenge('manifest empty — add a challenge entry');
            challenge = demoChallenge('manifest empty');
            renderChallenge(challenge);
            return;
        }

        // If the user picked a specific challenge from the solo
        // dropdown (gallery / replay flow), try to honor it. Falls
        // back to a random pick if the requested id isn't in the
        // manifest (e.g. removed since the dropdown was rendered).
        if (REQUESTED_CHALLENGE_ID) {
            const found = list.find(c => String(c.id) === REQUESTED_CHALLENGE_ID);
            if (found) {
                challenge = found;
                console.log('[challenge] using requested', challenge.id, '·', challenge.title);
            } else {
                console.warn('[challenge] requested id', REQUESTED_CHALLENGE_ID,
                             'not in manifest, falling back to random');
            }
        }

        // ─── Random pick — category filter + discovery mode ───
        // Two layered filters:
        //   1. Category — narrows to a single capture medium when the
        //      player chose one at setup (negative / digital). Skipped
        //      entirely when CATEGORY_FILTER is null ("random · all").
        //   2. Discovery — for signed-in users, exclude challenges
        //      they've already completed so they keep discovering new
        //      photos. Re-opens for replay once everything in the
        //      filtered pool is unlocked.
        // Anonymous users always get the full category pool. So do
        // signed-in users when the unlocks query fails — graceful
        // degradation.
        if (!challenge) {
            // Step 1: apply category filter
            let pool = list;
            let mode = 'full pool';
            if (CATEGORY_FILTER) {
                const inCat = list.filter(c => c.category === CATEGORY_FILTER);
                if (inCat.length > 0) {
                    pool = inCat;
                    mode = `category=${CATEGORY_FILTER} (${inCat.length} photos)`;
                } else {
                    console.warn('[challenge] no photos in category', CATEGORY_FILTER,
                                 '— falling back to full pool');
                }
            }

            // Step 2: apply discovery mode within the (already
            // category-filtered) pool.
            let pickPool = pool;

            if (window.gg?.isAuthenticated) {
                try {
                    // Make sure boot has finished so isAuthenticated /
                    // session.access_token are populated.
                    if (window.gg.ready) await window.gg.ready;

                    const unlocked = await window.gg.getUnlockedChallengeIds();

                    if (unlocked.size > 0) {
                        const locked = pool.filter(c => !unlocked.has(String(c.id)));
                        if (locked.length > 0 && locked.length < pool.length) {
                            // Discovery — pick only from photos not yet completed in this pool
                            pickPool = locked;
                            mode += ` · discovery (${locked.length} locked / ${pool.length})`;
                        } else if (locked.length === 0) {
                            // Completionist for this pool — re-open for replay
                            mode += ` · replay (all ${pool.length} unlocked)`;
                        }
                    }
                } catch (e) {
                    console.warn('[challenge] unlock fetch failed, using full pool:', e);
                }
            }

            const pickIdx = Math.floor(Math.random() * pickPool.length);
            challenge = pickPool[pickIdx];
            console.log(
                '[challenge] picked', challenge.id, '·', challenge.title,
                '\n  mode:', mode,
                '\n  candidates:', pickPool.map(c => c.id).join(', '),
                '\n  pickIdx:', pickIdx, '/', pickPool.length
            );
        }

        // ─── Lock this session: persist challenge + start time ───
        // Any subsequent refresh re-uses this entry instead of rolling.
        // The category is persisted too so F5 doesn't accidentally
        // widen the pool — though in practice the locked challenge
        // already constrains it.
        startedAtMs = Date.now();
        saveActiveSession({
            challenge: challenge,
            startedAt: startedAtMs,
            duration:  DURATION_MIN,
            showRef:   SHOW_REF,
            category:  CATEGORY_FILTER
        });

        renderChallenge(challenge);
    }

    function renderChallenge(c) {
        if (challengeTitle) challengeTitle.textContent = c.title || 'untitled';
        if (challengeMeta)  challengeMeta.textContent  = c.meta  || '— · — · —';
        if (pillChallenge)  pillChallenge.textContent  = (c.id || '?').toString().padStart(3, '0');
        if (previewMeta)    previewMeta.textContent    = c.meta  || '— · — · —';

        // Attribution (photographer + license)
        const attrPhotographer = document.getElementById('attr-photographer');
        const attrLicense      = document.getElementById('attr-license');
        if (attrPhotographer) attrPhotographer.textContent = c.photographer || 'unknown';
        if (attrLicense)      attrLicense.textContent      = c.license      || 'All Rights Reserved';

        // Preview image
        if (c.cover) {
            const img = new Image();
            img.onload = () => {
                previewPh.style.display = 'none';
                previewFrame.insertBefore(img, previewFrame.firstChild);
            };
            img.onerror = () => {
                if (previewPh) previewPh.children[1].textContent = 'failed to load cover';
            };
            img.src = c.cover;
        }

        // Source file meta
        if (c.source) {
            const fn = c.source.split('/').pop();
            if (sourceName) sourceName.textContent = fn;
            if (sourceSize) sourceSize.textContent = FileIO.formatSize(c.sourceSize);
        } else {
            if (sourceName) sourceName.textContent = 'source.???';
            if (sourceSize) sourceSize.textContent = '— mb · demo';
        }
    }

    function renderNoChallenge(msg) {
        if (previewPh) previewPh.children[1].textContent = msg;
    }

    /* ---------- Download source ---------- */
    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            if (!challenge || !challenge.source) {
                downloadBtn.classList.add('is-done');
                downloadBtn.querySelector('span').innerHTML =
                    '<span class="btn-icon">◇</span> demo · no real source';
                return;
            }
            // Pre-download ToU modal — player must accept terms before
            // the file is fetched. Then the file is renamed to embed the
            // player's pseudo as a passive deterrent against re-sharing.
            if (window.DownloadConfirm) {
                DownloadConfirm.show(challenge, () => {
                    const filename = DownloadConfirm.personalizeFilename(challenge);
                    FileIO.downloadFile(challenge.source, filename);
                    downloadBtn.classList.add('is-done');
                    downloadBtn.querySelector('span').innerHTML =
                        '<span class="btn-icon">✓</span> downloaded · re-download';
                });
            } else {
                // Fallback if the download-confirm module didn't load
                FileIO.downloadFile(challenge.source, challenge.source.split('/').pop());
                downloadBtn.classList.add('is-done');
            }
        });
    }

    /* ---------- Upload graded JPEG ---------- */
    function handleFile(file) {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            flashDrop('not an image · jpg / png / tif only');
            return;
        }
        gradedFile = file;
        dropZone.classList.add('is-loaded');
        dropIcon.textContent = '✓';
        dropText.textContent = 'grade loaded';
        dropSub.textContent  = FileIO.formatSize(file.size) + ' · ready to submit';
        dropFn.style.display = 'block';
        dropFn.textContent   = file.name;
        submitBtn.disabled = false;
    }

    function flashDrop(msg) {
        const old = dropText.textContent;
        dropText.style.color = 'var(--accent-red)';
        dropText.textContent = msg;
        setTimeout(() => {
            dropText.style.color = '';
            dropText.textContent = old;
        }, 1600);
    }

    if (gradeInput) {
        gradeInput.addEventListener('change', (e) => {
            handleFile(e.target.files[0]);
        });
    }

    // Drag & drop
    ['dragenter', 'dragover'].forEach(ev => {
        dropZone.addEventListener(ev, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('is-over');
        });
    });
    ['dragleave', 'drop'].forEach(ev => {
        dropZone.addEventListener(ev, (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (ev !== 'drop') dropZone.classList.remove('is-over');
        });
    });
    dropZone.addEventListener('drop', (e) => {
        dropZone.classList.remove('is-over');
        const file = e.dataTransfer.files[0];
        handleFile(file);
    });

    /* ---------- Submit ---------- */
    async function submit(reason) {
        if (!gradedFile && reason !== 'timeout') {
            flashDrop('upload a grade first');
            return;
        }
        timerStatus.textContent = reason === 'timeout'
            ? 'time elapsed · submitting…'
            : 'submitting…';

        let gradeDataUrl = null;
        if (gradedFile) {
            try {
                // Downscale + re-encode so it fits in sessionStorage (5 MB cap).
                // A full-res JPEG export from Lightroom is often 4-8 MB → base64
                // would overflow. 1600 px max edge / quality 0.85 is plenty for
                // the side-by-side comparison view.
                gradeDataUrl = await FileIO.readImageDownscaled(gradedFile, 1600, 0.85);
            } catch (e) {
                console.warn('Failed to read grade', e);
            }
        }

        FileIO.saveSession({
            challenge: challenge || null,
            duration:  DURATION_MIN,
            showRef:   SHOW_REF,
            gradeDataUrl,
            gradeName: gradedFile ? gradedFile.name : null,
            submittedBy: reason || 'user',
            timestamp: Date.now()
        });

        // Session is over — release the lock so the next solo round
        // can pick a fresh challenge.
        clearActiveSession();

        document.body.style.transition = 'opacity 280ms ease';
        document.body.style.opacity = '0';
        setTimeout(() => { window.location.href = 'result.html'; }, 260);
    }

    if (submitBtn) submitBtn.addEventListener('click', () => submit('user'));

    /* ---------- Quit ---------- */
    if (quitBtn) {
        quitBtn.addEventListener('click', () => {
            if (confirm('Abandon this session? Your grade will not be saved.')) {
                // Release both the active solo lock AND any stale
                // completed-session data, then return to the menu.
                clearActiveSession();
                FileIO.clearSession();
                window.location.href = 'index.html';
            }
        });
    }

    /* ---------- TIMER ----------
       Uses Date.now() (wall clock) instead of performance.now() so
       the timer survives page reloads — performance.now() resets to
       0 on every load, which is exactly the F5 bug we're fixing.
       The startedAtMs is set once (either resumed from active
       session OR initialized by loadChallenge when picking fresh)
       and never moves. */
    const TOTAL_MS = DURATION_MIN * 60 * 1000;
    let timerRaf = null;

    function tick() {
        // Wait until loadChallenge has set startedAtMs (either from
        // an active session or by saving a fresh one).
        if (!startedAtMs) {
            timerRaf = requestAnimationFrame(tick);
            return;
        }
        const elapsed = Date.now() - startedAtMs;
        const remaining = Math.max(0, TOTAL_MS - elapsed);

        const totalSec = Math.ceil(remaining / 1000);
        const min = Math.floor(totalSec / 60);
        const sec = totalSec % 60;

        if (timeMinEl) timeMinEl.textContent = String(min).padStart(2, '0');
        if (timeSecEl) timeSecEl.textContent = String(sec).padStart(2, '0');

        const ratio = remaining / TOTAL_MS;
        if (timerBarFill) timerBarFill.style.transform = `scaleX(${ratio.toFixed(4)})`;

        // Warning states
        timerDisplay.classList.remove('is-warning', 'is-critical');
        if (totalSec <= 60)      timerDisplay.classList.add('is-critical');
        else if (totalSec <= 180) timerDisplay.classList.add('is-warning');

        if (remaining <= 0) {
            cancelAnimationFrame(timerRaf);
            timerStatus.textContent = 'time elapsed · auto-submitting…';
            submit('timeout');
            return;
        }
        timerRaf = requestAnimationFrame(tick);
    }

    /* ---------- Boot ---------- */
    loadChallenge();
    timerRaf = requestAnimationFrame(tick);

})();
