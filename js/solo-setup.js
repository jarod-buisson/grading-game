/* =========================================================
   solo-setup.js — solo setup screen wiring.
   Handles duration picker, toggle, start button.
   ========================================================= */

(function () {
    'use strict';

    /* ---------- Bezier curve init ---------- */
    if (window.BezierCurve) {
        window.BezierCurve.init('curve-svg');
    }

    /* ---------- Duration picker ---------- */
    const durMinEl  = document.getElementById('dur-min');
    const durSecEl  = document.getElementById('dur-sec');
    const sumDurEl  = document.getElementById('sum-dur');
    const refToggle = document.getElementById('ref-toggle');
    const sumRefEl  = document.getElementById('sum-ref');
    const startBtn  = document.getElementById('start-btn');
    const ticks     = document.querySelectorAll('.dur-tick');

    let durationMin = 20;
    let showReference = true;

    function setDuration(min) {
        durationMin = min;
        if (durMinEl) durMinEl.textContent = String(min).padStart(2, '0');
        if (durSecEl) durSecEl.textContent = '00';
        if (sumDurEl) sumDurEl.textContent = String(min);
        ticks.forEach(t => t.classList.toggle('is-active',
            parseInt(t.dataset.min, 10) === min));
    }

    ticks.forEach(t => {
        t.addEventListener('click', () => {
            setDuration(parseInt(t.dataset.min, 10));
        });
    });

    /* ---------- Reference toggle ---------- */
    if (refToggle) {
        refToggle.addEventListener('change', () => {
            showReference = refToggle.checked;
            if (sumRefEl) sumRefEl.textContent = showReference ? 'on' : 'off';
        });
    }


    /* ---------- Challenge dropdown ----------
       Populate with all challenges from the manifest:
         - Unlocked challenges (already completed) are selectable
         - Locked challenges are listed but disabled (motivating preview)
         - "Random pick" is always the default and available to anyone
       Anonymous users see all challenges as locked. */
    const challengeSelect = document.getElementById('challenge-select');
    const challengeHint   = document.getElementById('challenge-hint');

    async function populateChallengeSelect() {
        if (!challengeSelect) return;
        try {
            const r = await fetch('images/challenges/manifest.json?t=' + Date.now(),
                                  { cache: 'no-store' });
            if (!r.ok) return;
            const data = await r.json();
            const challenges = (data && data.challenges) || [];

            // Wait for auth client to know whether we have a user
            if (window.gg?.ready) await window.gg.ready;

            let unlocked = new Set();
            const isAuth = !!window.gg?.isAuthenticated;
            if (isAuth) {
                unlocked = await window.gg.getUnlockedChallengeIds();
            }

            // Update hint text based on auth + progress
            if (challengeHint) {
                if (!isAuth) {
                    challengeHint.textContent = 'sign in to unlock photos by playing & replay them here';
                } else if (unlocked.size === 0) {
                    challengeHint.textContent = 'play a few rounds to unlock specific challenges';
                } else {
                    challengeHint.textContent =
                        unlocked.size + ' / ' + challenges.length + ' challenges unlocked';
                }
            }

            // Remove any previously injected options (defensive — should
            // only happen if this runs more than once)
            Array.from(challengeSelect.querySelectorAll('option[data-injected="1"]'))
                .forEach(o => o.remove());

            // Add a visual separator + per-challenge options
            challenges.forEach(c => {
                const idStr = String(c.id);
                const padded = idStr.padStart(3, '0');
                const isUnlocked = unlocked.has(idStr);
                const opt = document.createElement('option');
                opt.value = idStr;
                opt.dataset.injected = '1';
                const title = c.title && c.title !== 'Challenge ' + idStr
                    ? ' · ' + c.title
                    : '';
                opt.textContent = (isUnlocked ? '✓ ' : '🔒 ') + padded + title;
                opt.disabled = !isUnlocked;
                challengeSelect.appendChild(opt);
            });
        } catch (e) {
            console.warn('[solo-setup] could not populate challenge select:', e);
        }
    }
    populateChallengeSelect();

    /* ---------- Start session ----------
       Wipe any leftover active-solo state from sessionStorage so
       game.html boots fresh and picks a brand new random challenge.
       Without this, hitting Start while a previous game was still
       locked in the tab's sessionStorage would just resume the old
       challenge with the old timer — confusing as hell. */
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            try { sessionStorage.removeItem('gradinggame.activeSolo'); }
            catch (_) {}

            const params = new URLSearchParams({
                duration:  String(durationMin),
                reference: showReference ? '1' : '0'
            });

            // If a specific challenge is chosen (i.e. not "random"),
            // pass the id as a URL param so game.js loads THAT one
            // instead of a random pick.
            const selected = challengeSelect?.value;
            if (selected && selected !== 'random') {
                params.set('challenge', selected);
            }

            // Brief fade transition before navigation
            document.body.style.transition = 'opacity 280ms ease';
            document.body.style.opacity = '0';
            setTimeout(() => {
                window.location.href = 'game.html?' + params.toString();
            }, 260);
        });
    }

    /* ---------- Keyboard shortcuts ---------- */
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (e.key === 'Enter') {
            e.preventDefault();
            if (startBtn) startBtn.click();
        } else if (e.key === 'Escape') {
            window.location.href = 'index.html';
        }
    });

})();
