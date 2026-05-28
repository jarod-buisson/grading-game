/* =========================================================
   contributors.js — build the contributors page dynamically
   from images/challenges/manifest.json

   For each unique photographer, shows a card with:
     - their name
     - photo count
     - license(s) used
     - the titles of the photos they contributed
   Anonymous photos (photographer === "unknown") are bundled
   into a separate "anonymous / not specified yet" card.
   ========================================================= */

(function () {
    'use strict';

    const grid    = document.getElementById('contributors-grid');
    const stats   = document.getElementById('contributors-stats');

    fetch('images/challenges/manifest.json?t=' + Date.now(), { cache: 'no-store' })
        .then(r => r.ok ? r.json() : Promise.reject(new Error('http ' + r.status)))
        .then(render)
        .catch(err => {
            console.error('[contributors] manifest load failed:', err);
            grid.innerHTML = `<div class="contributors-empty">unable to load manifest — ${escHTML(err.message)}</div>`;
        });

    function render(data) {
        const challenges = (data && data.challenges) || [];

        // Group challenges by photographer name (case-insensitive key,
        // but we keep the original casing of the first occurrence).
        const groups = new Map();
        for (const c of challenges) {
            const raw = (c.photographer || 'unknown').trim();
            const key = raw.toLowerCase();
            if (!groups.has(key)) {
                groups.set(key, {
                    name: raw,
                    licenses: new Set(),
                    titles: [],
                    instagram: c.instagram || null   // take from first occurrence
                });
            }
            const g = groups.get(key);
            // If the first occurrence didn't have an Instagram handle but a
            // later one does, adopt it. (Most photographers will use the same
            // handle across all their photos, so this is mostly defensive.)
            if (!g.instagram && c.instagram) g.instagram = c.instagram;
            if (c.license) g.licenses.add(c.license);
            g.titles.push({ id: c.id, title: c.title || ('Challenge ' + c.id) });
        }

        // Split named / anonymous
        const named = [];
        let anonymous = null;
        for (const [key, g] of groups) {
            if (key === 'unknown') anonymous = g;
            else                   named.push(g);
        }
        // Sort named by photo count desc, then name asc
        named.sort((a, b) =>
            (b.titles.length - a.titles.length) || a.name.localeCompare(b.name)
        );

        // Update stats
        stats.innerHTML = `
            <span><strong>${named.length}</strong> photographer${named.length > 1 ? 's' : ''}</span>
            <span><strong>${challenges.length}</strong> photo${challenges.length > 1 ? 's' : ''} available</span>
        `;

        // Render cards
        grid.innerHTML = '';
        if (named.length === 0 && !anonymous) {
            grid.innerHTML = `<div class="contributors-empty">no challenges in the manifest yet — drop photos into images/challenges/ and run python build_manifest.py</div>`;
            return;
        }

        named.forEach(g => grid.appendChild(buildCard(g, false)));
        if (anonymous) grid.appendChild(buildCard(anonymous, true));
    }

    function buildCard(group, isAnonymous) {
        const card = document.createElement('article');
        card.className = 'contributor-card' + (isAnonymous ? ' is-anonymous' : '');

        const licenses = Array.from(group.licenses);
        const licensesHTML = licenses.length
            ? `<div class="contributor-licenses">
                 ${licenses.map(l => `<span class="contributor-license-tag">${escHTML(l)}</span>`).join('')}
               </div>`
            : '';

        // Compact challenge list — was one row per title (id + name),
        // which ate vertical space for very little signal (the name is
        // often just "Challenge {id}"). Replaced with a single inline
        // line of comma-separated ids: "challenges · 004, 005, 006…".
        const idList = group.titles
            .map(t => String(t.id).padStart(3, '0'))
            .join(', ');
        const titlesHTML = `
            <div class="contributor-title-row contributor-title-row--compact">
                <span class="ct-id">challenges</span>
                <span class="ct-title">${escHTML(idList)}</span>
            </div>`;

        // moreHTML is no longer needed (everything fits on one line via
        // wrap) but the variable is still expected below — keep it empty.
        const moreHTML = '';

        const displayName = isAnonymous ? 'Anonymous · not specified yet' : group.name;
        const countLabel = `${group.titles.length} photo${group.titles.length > 1 ? 's' : ''}`;

        // Optional Instagram link — appears as a small pill button under the
        // name. Hover applies the official Instagram gradient.
        const instaHTML = !isAnonymous && group.instagram
            ? `<a class="contributor-social contributor-social--instagram"
                 href="https://instagram.com/${encodeURIComponent(group.instagram)}"
                 target="_blank"
                 rel="noopener noreferrer me"
                 title="visit ${escHTML(group.name)} on Instagram">
                <svg class="social-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 2c2.717 0 3.056.01 4.122.06 1.065.05 1.79.217 2.428.465.66.254 1.216.598 1.772 1.153.509.5.902 1.105 1.153 1.772.247.637.415 1.363.465 2.428.047 1.066.06 1.405.06 4.122 0 2.717-.01 3.056-.06 4.122-.05 1.065-.218 1.79-.465 2.428-.252.667-.644 1.272-1.153 1.772-.5.508-1.105.902-1.772 1.153-.637.247-1.363.415-2.428.465-1.066.047-1.405.06-4.122.06-2.717 0-3.056-.01-4.122-.06-1.065-.05-1.79-.218-2.428-.465a4.89 4.89 0 0 1-1.772-1.153 4.904 4.904 0 0 1-1.153-1.772c-.248-.637-.415-1.363-.465-2.428C2.013 15.056 2 14.717 2 12c0-2.717.01-3.056.06-4.122.05-1.066.217-1.79.465-2.428a4.88 4.88 0 0 1 1.153-1.772A4.897 4.897 0 0 1 5.45 2.525c.638-.248 1.362-.415 2.428-.465C8.944 2.013 9.283 2 12 2zm0 5a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm6.5-.25a1.25 1.25 0 1 0-2.5 0 1.25 1.25 0 0 0 2.5 0zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"/>
                </svg>
                <span>@${escHTML(group.instagram)}</span>
              </a>`
            : '';

        card.innerHTML = `
            <div>
                <div class="contributor-name">${escHTML(displayName)}</div>
                <div class="contributor-count">${countLabel}</div>
            </div>
            ${instaHTML}
            ${licensesHTML}
            <div class="contributor-divider"></div>
            <div class="contributor-titles">
                ${titlesHTML}${moreHTML}
            </div>
        `;
        return card;
    }

    function escHTML(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }


    /* =========================================================
       CONTRIBUTION FORM
       =========================================================
       Submits in parallel to:
         1. Supabase `contributions` table (permanent record)
         2. Formspree endpoint (real-time email to admin)

       If one fails the other still goes through — we surface
       success as long as AT LEAST ONE channel succeeded. The
       admin always has either a DB row or an email (and usually
       both) for every legit submission.

       ⚠️ REPLACE the Formspree FORM_ID below with yours after
       signing up at formspree.io. Until you do, only the Supabase
       half will work and the email half logs a warning.
       ========================================================= */
    const FORMSPREE_FORM_ID = 'xjgzjlrn';
    const FORMSPREE_URL = 'https://formspree.io/f/' + FORMSPREE_FORM_ID;

    const form     = document.getElementById('contribute-form');
    const submitBtn = document.getElementById('contribute-submit');
    const statusEl = document.getElementById('contribute-status');

    if (form && submitBtn && statusEl) {
        form.addEventListener('submit', handleSubmit);
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (submitBtn.disabled) return;

        // Honeypot — bots fill this, real users don't see it.
        // Silently "succeed" so the bot thinks it worked.
        const honeypot = form.querySelector('input[name="_gotcha"]');
        if (honeypot && honeypot.value) {
            console.log('[contribute] honeypot triggered, ignoring');
            showThanks();
            return;
        }

        // Collect + validate
        const data = Object.fromEntries(new FormData(form).entries());
        delete data._gotcha;
        data.first_name    = (data.first_name   || '').trim();
        data.last_name     = (data.last_name    || '').trim();
        data.email         = (data.email        || '').trim();
        data.transfer_link = (data.transfer_link|| '').trim();
        data.message       = (data.message      || '').trim() || null;

        const errors = validate(data);
        if (errors.length) {
            setStatus('error', errors[0]);
            return;
        }

        // UI: loading
        submitBtn.disabled = true;
        const btnSpan = submitBtn.querySelector('span');
        const originalLabel = btnSpan ? btnSpan.textContent : '';
        if (btnSpan) btnSpan.textContent = 'sending…';
        setStatus('pending', 'sending your submission…');

        // Fire both in parallel.
        const [supaResult, mailResult] = await Promise.allSettled([
            submitToSupabase(data),
            submitToFormspree(data)
        ]);

        const supaOk = supaResult.status === 'fulfilled' && supaResult.value === true;
        const mailOk = mailResult.status === 'fulfilled' && mailResult.value === true;

        if (supaOk || mailOk) {
            // At least one channel succeeded → consider it a win.
            console.log('[contribute] supabase:', supaOk, '· email:', mailOk);
            showThanks();
        } else {
            // Both failed
            console.error('[contribute] both channels failed', supaResult, mailResult);
            submitBtn.disabled = false;
            if (btnSpan) btnSpan.textContent = originalLabel;
            setStatus('error',
                'could not send — please try again, or email buissonjarod@gmail.com directly');
        }
    }

    function validate(d) {
        const errs = [];
        if (!d.first_name)    errs.push('please enter your first name');
        else if (!d.last_name) errs.push('please enter your last name');
        else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email))
            errs.push('please enter a valid email address');
        else if (!/^https?:\/\//i.test(d.transfer_link))
            errs.push('transfer link must start with http:// or https://');
        return errs;
    }

    function setStatus(kind, msg) {
        statusEl.classList.remove('is-success', 'is-error');
        if (kind === 'success') statusEl.classList.add('is-success');
        if (kind === 'error')   statusEl.classList.add('is-error');
        statusEl.textContent = msg || '';
    }

    function showThanks() {
        form.classList.add('is-submitted');
        const cta = document.querySelector('.contributors-cta');
        if (cta) {
            const thanks = document.createElement('div');
            thanks.className = 'contribute-thanks';
            thanks.innerHTML = `
                <strong>Thanks — we got it.</strong>
                We'll review your work and get back to you within a few days.
                If we haven't replied after a week, ping us at
                <a href="mailto:buissonjarod@gmail.com" style="color:var(--accent);">buissonjarod@gmail.com</a>.
            `;
            cta.appendChild(thanks);
        }
    }

    /* ---------- Channel 1: Supabase ---------- */
    async function submitToSupabase(d) {
        if (!window.gg?.supabase) {
            console.warn('[contribute] supabase client not ready');
            return false;
        }
        try {
            // Wait so we know whether we have a user_id to attach
            if (window.gg.ready) await window.gg.ready;
            const userId = window.gg.userId || null;

            const { error } = await window.gg.supabase
                .from('contributions')
                .insert({
                    first_name:    d.first_name,
                    last_name:     d.last_name,
                    email:         d.email,
                    transfer_link: d.transfer_link,
                    message:       d.message,
                    user_id:       userId
                });
            if (error) {
                console.warn('[contribute] supabase insert failed:', error);
                return false;
            }
            return true;
        } catch (e) {
            console.warn('[contribute] supabase insert threw:', e);
            return false;
        }
    }

    /* ---------- Channel 2: Formspree ---------- */
    async function submitToFormspree(d) {
        if (FORMSPREE_FORM_ID === 'REPLACE_ME_FORMSPREE_ID') {
            console.warn('[contribute] Formspree FORM_ID not set in contributors.js — skipping email channel');
            return false;
        }
        try {
            const fd = new FormData();
            fd.append('first_name',    d.first_name);
            fd.append('last_name',     d.last_name);
            fd.append('email',         d.email);
            fd.append('transfer_link', d.transfer_link);
            if (d.message) fd.append('message', d.message);
            // Subject line shown in your inbox
            fd.append('_subject',
                `grading-game · new contribution from ${d.first_name} ${d.last_name}`);
            // Reply-To = the photographer's email so you can reply directly
            fd.append('_replyto', d.email);

            const res = await fetch(FORMSPREE_URL, {
                method: 'POST',
                body: fd,
                headers: { 'Accept': 'application/json' }
            });
            return res.ok;
        } catch (e) {
            console.warn('[contribute] formspree submit threw:', e);
            return false;
        }
    }

})();
