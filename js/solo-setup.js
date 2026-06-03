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

    /* ---------- Duration picker ----------
       The big mm:ss display + the bottom-row summary both mirror the
       current value of the horizontal duration-wheel. The wheel itself
       owns the user input (drag / scroll / click / keys) — we just
       react to its onChange. */
    const durMinEl  = document.getElementById('dur-min');
    const durSecEl  = document.getElementById('dur-sec');
    const sumDurEl  = document.getElementById('sum-dur');
    const refToggle = document.getElementById('ref-toggle');
    const sumRefEl  = document.getElementById('sum-ref');
    const startBtn  = document.getElementById('start-btn');

    let durationMin = 20;
    let showReference = true;

    function setDuration(min) {
        durationMin = min;
        if (durMinEl) durMinEl.textContent = String(min).padStart(2, '0');
        if (durSecEl) durSecEl.textContent = '00';
        if (sumDurEl) sumDurEl.textContent = String(min);
    }

    const wheelEl = document.getElementById('dur-wheel');
    if (wheelEl && window.DurationWheel) {
        window.DurationWheel.init(wheelEl, {
            min:        5,
            max:        120,
            step:       5,
            value:      durationMin,
            tickWidth:  14,
            labelEvery: 15,
            onChange:   setDuration
        });
    }
    // Apply the initial label even if the wheel is missing — keeps the
    // display in sync with the static "20" default in markup.
    setDuration(durationMin);

    /* ---------- Reference toggle ---------- */
    if (refToggle) {
        refToggle.addEventListener('change', () => {
            showReference = refToggle.checked;
            if (sumRefEl) sumRefEl.textContent = showReference ? 'on' : 'off';
        });
    }


    /* ---------- Category + Challenge dropdowns ----------
       The challenge dropdown is re-populated every time the category
       dropdown changes so the player only sees photos that match the
       chosen capture medium. "Random pick" stays as the default option;
       below that we list every challenge that matches the category,
       with unlocked ones selectable and locked ones grayed out. */
    const categorySelect  = document.getElementById('category-select');
    const categoryHint    = document.getElementById('category-hint');
    const challengeSelect = document.getElementById('challenge-select');
    const challengeHint   = document.getElementById('challenge-hint');

    // Module-level cache so the category change handler doesn't have
    // to re-fetch the manifest or re-query unlocks every time.
    let allChallenges = [];
    let unlockedSet   = new Set();
    let isAuth        = false;

    // Tiny i18n helper — falls back to the key if the engine isn't ready.
    function tt(key) {
        return (window.gg_i18n && window.gg_i18n.t) ? window.gg_i18n.t(key) : key;
    }

    function categoryLabel(cat) {
        if (cat === 'negative') return tt('solo.catlabel_negative');
        if (cat === 'digital')  return tt('solo.catlabel_digital');
        return tt('solo.catlabel_all');
    }

    function getCategoryFilter() {
        return categorySelect?.value || 'random';
    }

    function renderChallengeOptions() {
        if (!challengeSelect) return;

        const catFilter = getCategoryFilter();

        // Remove previously injected options (keep only the default "random")
        Array.from(challengeSelect.querySelectorAll('option[data-injected="1"]'))
            .forEach(o => o.remove());

        // Update the default "random pick" option's label to reflect category
        const defaultOpt = challengeSelect.querySelector('option[value="random"]');
        if (defaultOpt) {
            defaultOpt.textContent = tt('solo.chall_randompick') + ' · ' + categoryLabel(catFilter);
        }

        // Filter the challenge list by category (unless "random" = no filter)
        const filtered = catFilter === 'random'
            ? allChallenges
            : allChallenges.filter(c => c.category === catFilter);

        // Add per-challenge options
        filtered.forEach(c => {
            const idStr = String(c.id);
            const padded = idStr.padStart(3, '0');
            const isUnlocked = unlockedSet.has(idStr);
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

        // Reset selection to "random" whenever the category changes so
        // we don't end up with a stale specific-challenge id that's no
        // longer in the filtered pool.
        challengeSelect.value = 'random';

        // Update the challenge hint with progress for the current filter
        if (challengeHint) {
            const unlockedInPool = filtered.filter(c => unlockedSet.has(String(c.id))).length;
            if (!isAuth) {
                challengeHint.textContent = tt('solo.challenge_hint');
            } else if (filtered.length === 0) {
                challengeHint.textContent = tt('solo.chall_hint_empty');
            } else if (unlockedInPool === 0) {
                challengeHint.textContent = tt('solo.chall_hint_locked');
            } else {
                challengeHint.textContent = tt('solo.chall_hint_progress')
                    .replace('{n}', unlockedInPool)
                    .replace('{total}', filtered.length);
            }
        }

        // Hint for the category dropdown itself
        if (categoryHint) {
            if (catFilter === 'random') {
                categoryHint.textContent = tt('solo.category_hint');
            } else {
                const inCat = allChallenges.filter(c => c.category === catFilter).length;
                const key = inCat > 1 ? 'solo.cat_hint_many' : 'solo.cat_hint_one';
                categoryHint.textContent = tt(key).replace('{n}', inCat);
            }
        }
    }

    async function populateChallengeSelect() {
        if (!challengeSelect) return;
        try {
            const r = await fetch('images/challenges/manifest.json?t=' + Date.now(),
                                  { cache: 'no-store' });
            if (!r.ok) return;
            const data = await r.json();
            allChallenges = (data && data.challenges) || [];

            // Wait for auth client to know whether we have a user
            if (window.gg?.ready) await window.gg.ready;

            isAuth = !!window.gg?.isAuthenticated;
            unlockedSet = isAuth ? await window.gg.getUnlockedChallengeIds() : new Set();

            renderChallengeOptions();
        } catch (e) {
            console.warn('[solo-setup] could not populate challenge select:', e);
        }
    }

    // Re-render the challenge dropdown when the category changes
    if (categorySelect) {
        categorySelect.addEventListener('change', renderChallengeOptions);
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

            // Category filter — narrows the random pool to a single
            // capture medium (negative / digital). Skipped when a
            // specific challenge id is selected because the category
            // is implicit in that case.
            const cat = categorySelect?.value;
            if (cat && cat !== 'random' && (!selected || selected === 'random')) {
                params.set('category', cat);
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
