/* =========================================================
   gallery.js — Pokédex-style challenge collection page.

   Renders every challenge from the manifest as a card.
     - Unlocked  → full-color reference image
     - Locked    → blurred + darkened reference
   Counter at the top shows "X / Y unlocked".

   Anonymous users see every card locked + a "Sign in to track
   your gallery" banner.
   ========================================================= */

(function () {
    'use strict';

    const grid       = document.getElementById('gallery-grid');
    const counter    = document.getElementById('gallery-counter');
    const counterRow = document.getElementById('gallery-counter-row');
    const anonBanner = document.getElementById('gallery-anon-banner');
    const anonSignin = document.getElementById('gallery-anon-signin');

    /* ---------- Hook the sign-in button in the banner ----------
       Opens the global provider-choice modal (Discord + Google) so users
       can pick their preferred provider rather than being forced into
       Google. Modal lives in auth-ui.js. */
    if (anonSignin) {
        anonSignin.addEventListener('click', () => {
            if (window.gg?.openLoginModal) {
                window.gg.openLoginModal();
            } else {
                window.gg?.signInWithGoogle(window.location.href);
            }
        });
    }

    /* ---------- Helpers ---------- */
    function escHTML(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
        }[c]));
    }

    function padId(id) {
        return String(id).padStart(3, '0');
    }

    // i18n helper for strings built after first paint (cards are created
    // async, so data-i18n auto-translation has already run by then).
    function tt(key) {
        return (window.gg_i18n && window.gg_i18n.t) ? window.gg_i18n.t(key) : key;
    }


    /* ---------- Main render ---------- */
    async function init() {
        // Wait for the auth client to finish booting so we know whether
        // the user is anonymous or authenticated before we start.
        if (window.gg?.ready) await window.gg.ready;

        // Fetch the manifest (challenges list).
        let manifest = null;
        try {
            const r = await fetch('images/challenges/manifest.json?t=' + Date.now(), { cache: 'no-store' });
            if (!r.ok) throw new Error('http ' + r.status);
            manifest = await r.json();
        } catch (e) {
            console.error('[gallery] manifest load failed:', e);
            grid.innerHTML = `<div class="gallery-empty">unable to load manifest — ${escHTML(e.message)}</div>`;
            return;
        }

        const challenges = (manifest && manifest.challenges) || [];

        // Anonymous users → all locked + show the banner.
        // Authenticated users → fetch their distinct completed challenge IDs.
        let unlocked = new Set();
        const isAuth = !!window.gg?.isAuthenticated;
        if (isAuth) {
            unlocked = await window.gg.getUnlockedChallengeIds();
            if (anonBanner) anonBanner.hidden = true;
        } else {
            if (anonBanner) anonBanner.hidden = false;
        }

        // Update the counter.
        if (counter) {
            counter.innerHTML =
                `<strong>${unlocked.size}</strong> / <strong>${challenges.length}</strong> unlocked`;
        }

        // Empty state.
        if (!challenges.length) {
            grid.innerHTML = `<div class="gallery-empty">no challenges in the manifest yet</div>`;
            return;
        }

        // Build the card grid.
        grid.innerHTML = '';
        challenges.forEach(c => {
            const isUnlocked = unlocked.has(String(c.id));
            grid.appendChild(buildCard(c, isUnlocked));
        });
    }


    /* ---------- One card ---------- */
    function buildCard(challenge, isUnlocked) {
        const card = document.createElement('article');
        card.className = 'gallery-card ' + (isUnlocked ? 'is-unlocked' : 'is-locked');
        card.setAttribute(
            'aria-label',
            isUnlocked
                ? `Challenge ${padId(challenge.id)} unlocked`
                : `Challenge ${padId(challenge.id)} locked`
        );

        // Prefer the reference image (the "answer") for unlocked,
        // fall back to the cover for locked or missing reference.
        const imgSrc = challenge.reference || challenge.cover || '';

        // Unlocked cards open the community wall for that photo. The hover
        // hint tells the player the card is a doorway, not just a trophy.
        const unlockedOverlay =
            `<span class="gallery-card-view">
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M3 5h8v6H3V5zm10 0h8v6h-8V5zM3 13h8v6H3v-6zm10 0h8v6h-8v-6z"/></svg>
                <span>${escHTML(tt('gallery.view_edits'))}</span>
            </span>`;
        const lockedOverlay =
            '<svg class="gallery-card-lock" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm0 2a3 3 0 0 1 3 3v3H9V6a3 3 0 0 1 3-3z"/></svg>';

        card.innerHTML = `
            <div class="gallery-card-frame">
                ${imgSrc ? `<div class="gallery-card-img" style="background-image:url('${escHTML(imgSrc)}')"></div>` : ''}
                <div class="gallery-card-overlay">
                    ${isUnlocked ? unlockedOverlay : lockedOverlay}
                </div>
            </div>
            <div class="gallery-card-info">
                <div class="gallery-card-id">${padId(challenge.id)}</div>
                ${isUnlocked
                    ? `<div class="gallery-card-photographer">${escHTML(challenge.photographer || 'unknown')}</div>`
                    : `<div class="gallery-card-photographer gallery-card-photographer--locked">— locked —</div>`}
            </div>
        `;

        // Make the whole unlocked card a link to its wall. Locked cards
        // stay inert (no spoiling, no navigation).
        if (isUnlocked) {
            const href = 'challenge.html?c=' + encodeURIComponent(challenge.id);
            card.setAttribute('role', 'link');
            card.setAttribute('tabindex', '0');
            const go = () => { window.location.href = href; };
            card.addEventListener('click', go);
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    go();
                }
            });
        }

        return card;
    }


    /* ---------- Re-render on auth state change ----------
       If the user signs in while on the gallery page, we want
       the gallery to refresh with their unlocked set instead of
       still showing everything as locked. */
    if (window.gg?.onAuthChange) {
        let firstFire = true;
        window.gg.onAuthChange(() => {
            // Skip the first INIT fire — init() already handles that.
            if (firstFire) { firstFire = false; return; }
            init().catch(err => console.error('[gallery] re-render failed:', err));
        });
    }

    init().catch(err => console.error('[gallery] init failed:', err));

})();
