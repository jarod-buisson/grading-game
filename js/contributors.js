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

        const titlesHTML = group.titles.slice(0, 8).map(t =>
            `<div class="contributor-title-row">
                <span class="ct-id">${escHTML(String(t.id).padStart(3, '0'))}</span>
                <span class="ct-title">${escHTML(t.title)}</span>
             </div>`
        ).join('');

        const moreCount = group.titles.length - 8;
        const moreHTML = moreCount > 0
            ? `<div class="contributor-title-row"><span class="ct-id">+${moreCount}</span><span class="ct-title">more</span></div>`
            : '';

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

})();
