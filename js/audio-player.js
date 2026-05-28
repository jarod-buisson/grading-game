/* =========================================================
   audio-player.js — global background-music widget
   Auto-injects a fixed bottom-right pill (speaker icon + hover-reveal
   volume slider). Persists volume + mute state to localStorage.
   Source defaults to `audio/ambient.mp3` (user must supply file).
   ========================================================= */

(function () {
    'use strict';

    /* ---------- Skip on mobile ----------
       Background music on mobile is more annoying than useful:
         - Browsers throttle / mute audio on tabs in background
         - The widget itself eats top-bar real estate at < 800 px
         - Users on data plans don't want extra MP3 transfer
       The CSS media query that drives the rest of the mobile
       layout is `(max-width: 799px)` — match the same threshold. */
    if (window.matchMedia && window.matchMedia('(max-width: 799px)').matches) {
        return;
    }

    const VOL_KEY  = 'gradinggame.audioVolume';
    const MUTE_KEY = 'gradinggame.audioMuted';

    /* Audio source — hosted on Cloudflare R2 (same bucket as RAW source
       files). R2 has unlimited bandwidth + zero egress fees, so we don't
       have to worry about quota even if the track is large or played
       many times. The file is fetched cross-origin; CORS is configured
       on the bucket to allow grading-game.com. */
    const SRC      = 'https://sources.grading-game.com/audio/ambient.mp3';

    /* ---------- Inject widget HTML (once per page) ---------- */
    if (document.getElementById('audio-widget')) return;

    const widget = document.createElement('div');
    widget.className = 'audio-widget';
    widget.id = 'audio-widget';
    widget.innerHTML = `
        <button class="audio-toggle" id="audio-toggle" title="toggle sound" aria-label="toggle sound">
            <svg class="audio-icon-on"  viewBox="0 0 16 16" width="14" height="14">
                <path d="M3 6 v4 h2 l3 3 V3 L5 6 Z" fill="currentColor"/>
                <path d="M10.5 5.5 q1.4 0.6 1.4 2.5 q0 1.9 -1.4 2.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
                <path d="M12.5 3.5 q2.6 1.2 2.6 4.5 q0 3.3 -2.6 4.5"  fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
            </svg>
            <svg class="audio-icon-off" viewBox="0 0 16 16" width="14" height="14">
                <path d="M3 6 v4 h2 l3 3 V3 L5 6 Z" fill="currentColor"/>
                <path d="M11 6 l4 4 M15 6 l-4 4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
        </button>
        <input type="range" class="audio-volume" id="audio-volume" min="0" max="100" value="30" aria-label="volume">
    `;
    // Pick the best mount point in priority order:
    //   1. .top-bar-right     (index, multi, solo, result, about, contributors)
    //   2. .game-header-pills (game.html)
    //   3. .room-bar          (room.html)
    //   4. body               (fallback — uses fixed positioning)
    const mount =
        document.querySelector('.top-bar-right') ||
        document.querySelector('.game-header-pills') ||
        document.querySelector('.room-bar') ||
        document.body;
    if (mount === document.body) {
        widget.classList.add('audio-widget--floating');
    }
    mount.appendChild(widget);

    /* ---------- Audio element ---------- */
    const audio = document.createElement('audio');
    audio.id     = 'gg-audio';
    audio.src    = SRC;
    audio.loop   = true;
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audio.setAttribute('playsinline', '');
    document.body.appendChild(audio);

    /* ---------- DOM refs ---------- */
    const toggleBtn = document.getElementById('audio-toggle');
    const slider    = document.getElementById('audio-volume');

    /* ---------- State (persisted) ---------- */
    let volume = clampUnit(parseFloat(localStorage.getItem(VOL_KEY) ?? '0.30'));
    let muted  = localStorage.getItem(MUTE_KEY) === '1';

    audio.volume = volume;
    audio.muted  = muted;
    slider.value = String(Math.round(volume * 100));
    toggleBtn.classList.toggle('is-muted', muted);

    /* ---------- Auto-play on first user gesture ---------- */
    // Browsers block autoplay until a gesture; we try once on the first click anywhere.
    let everPlayed = false;
    function tryPlay() {
        if (everPlayed) return;
        audio.play().then(() => { everPlayed = true; }).catch(() => {/* still no gesture or no file */});
    }
    ['click', 'keydown', 'touchstart'].forEach(ev =>
        document.addEventListener(ev, tryPlay, { once: true, capture: true }));

    /* ---------- Audio load errors (e.g. missing file) ---------- */
    audio.addEventListener('error', () => {
        console.warn('[audio] failed to load ' + SRC + ' — drop an mp3 there to enable background music');
        widget.classList.add('is-broken');
    });

    /* ---------- Mute toggle ---------- */
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        muted = !muted;
        audio.muted = muted;
        toggleBtn.classList.toggle('is-muted', muted);
        localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
        if (!muted) tryPlay();
    });

    /* ---------- Volume slider ---------- */
    slider.addEventListener('input', () => {
        volume = parseInt(slider.value, 10) / 100;
        audio.volume = volume;
        localStorage.setItem(VOL_KEY, String(volume));
        if (volume > 0 && muted) {
            muted = false;
            audio.muted = false;
            toggleBtn.classList.remove('is-muted');
            localStorage.setItem(MUTE_KEY, '0');
        }
        if (volume === 0 && !muted) {
            muted = true;
            audio.muted = true;
            toggleBtn.classList.add('is-muted');
            localStorage.setItem(MUTE_KEY, '1');
        }
    });

    function clampUnit(v) {
        if (!isFinite(v) || v < 0) return 0;
        if (v > 1) return 1;
        return v;
    }

    /* ---------- Save playback position ---------- */

const TIME_KEY = 'gradinggame.audioTime';
const PLAYING_KEY = 'gradinggame.audioPlaying';

/* sauvegarde régulière */
setInterval(() => {
    localStorage.setItem(TIME_KEY, audio.currentTime);
    localStorage.setItem(PLAYING_KEY, (!audio.paused).toString());
}, 500);

/* restauration */
audio.addEventListener('loadedmetadata', () => {
    const savedTime = parseFloat(localStorage.getItem(TIME_KEY) || '0');

    if (!isNaN(savedTime)) {
        audio.currentTime = savedTime;
    }

    const wasPlaying = localStorage.getItem(PLAYING_KEY) === 'true';

    if (wasPlaying) {
        tryPlay();
    }
});

window.addEventListener('beforeunload', () => {
    localStorage.setItem(TIME_KEY, audio.currentTime);
});

/* ---------- Fix bfcache (back-forward cache) ----------
   When the user navigates to another page and clicks the browser's back
   button, modern browsers restore the page from memory (bfcache) instead
   of re-running the scripts. That leaves JS-driven dynamic state in a
   broken half-frozen mode — most visibly, the SVG `#tone-lut-filter`
   used by the bg-grade-layer can map every value to 0, rendering the
   whole page as a black screen.
   The cleanest, bulletproof fix is to detect a bfcache restoration via
   the `pageshow` event with `event.persisted === true` and force a
   normal reload. Performance cost is negligible since everything is
   already in the HTTP cache. */
window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
        window.location.reload();
    }
});

})();
