/* =========================================================
   chromatic-wheel.js
   Interactive chromatic-wheel menu.
   Convention: angles in degrees, 0° = top, increasing clockwise.
   ========================================================= */

(function () {
    'use strict';

    const PUCK_RADIUS = 122;       // SVG units from center (in the colored ring)
    const TICK_INNER = 156;        // SVG units — inner edge of major ticks
    const TICK_OUTER = 168;        // SVG units — outer edge of major ticks

    const puckEl       = document.getElementById('puck');
    const ticksEl      = document.getElementById('wheel-ticks');
    const centerValEl  = document.getElementById('center-value');
    const cursorHueEl  = document.getElementById('cursor-hue');
    const cursorModeEl = document.getElementById('cursor-mode');
    const menuItems    = document.querySelectorAll('.menu-item');
    const puckFillEl   = puckEl ? puckEl.querySelector('.puck-fill') : null;
    const tetherEl     = puckEl ? puckEl.querySelector('.puck-tether') : null;
    const centerMetaEl = document.querySelector('.center-meta');

    /* ---------- Angle → cartesian (0° = top, clockwise) ---------- */
    function angleToXY(angleDeg, radius) {
        const r = angleDeg * Math.PI / 180;
        return {
            x: radius * Math.sin(r),
            y: -radius * Math.cos(r)
        };
    }

    /* ---------- Generate tick marks every 5° ---------- */
    if (ticksEl) {
        const svgNS = 'http://www.w3.org/2000/svg';
        for (let a = 0; a < 360; a += 5) {
            const isCardinal = a % 90 === 0;
            const isMajor    = a % 30 === 0;
            const innerR = isCardinal ? 153 : isMajor ? 156 : 160;
            const outerR = isCardinal ? 170 : isMajor ? 168 : 165;
            const p1 = angleToXY(a, innerR);
            const p2 = angleToXY(a, outerR);
            const tick = document.createElementNS(svgNS, 'line');
            tick.setAttribute('x1', p1.x.toFixed(2));
            tick.setAttribute('y1', p1.y.toFixed(2));
            tick.setAttribute('x2', p2.x.toFixed(2));
            tick.setAttribute('y2', p2.y.toFixed(2));
            tick.setAttribute('stroke',
                isCardinal ? 'rgba(255,255,255,0.5)'
                : isMajor  ? 'rgba(255,255,255,0.22)'
                           : 'rgba(255,255,255,0.10)');
            tick.setAttribute('stroke-width', isCardinal ? 1.4 : 1);
            ticksEl.appendChild(tick);
        }
    }

    /* ---------- Move puck to a given angle ---------- */
    function setPuckAngle(angleDeg, animate) {
        if (!puckEl) return;
        const pos = angleToXY(angleDeg, PUCK_RADIUS);
        if (animate === false) {
            puckEl.style.transition = 'none';
            void puckEl.getBoundingClientRect();
        }
        puckEl.setAttribute('transform',
            `translate(${pos.x.toFixed(2)}, ${pos.y.toFixed(2)})`);
        // tether goes from puck-local origin back to wheel center
        if (tetherEl) {
            tetherEl.setAttribute('x1', 0);
            tetherEl.setAttribute('y1', 0);
            tetherEl.setAttribute('x2', (-pos.x).toFixed(2));
            tetherEl.setAttribute('y2', (-pos.y).toFixed(2));
        }
        if (animate === false) {
            requestAnimationFrame(() => { puckEl.style.transition = ''; });
        }
        // colour the puck like the wheel at this hue
        if (puckFillEl) {
            // Map our 0=top convention to hue around the wheel.
            // The conic gradient starts at -90deg (CSS), which means hue 0 at top.
            // So our angle (0=top, clockwise) == hue directly.
            const hue = ((angleDeg % 360) + 360) % 360;
            puckFillEl.setAttribute('fill', `hsl(${hue}, 60%, 55%)`);
        }
        if (cursorHueEl) {
            cursorHueEl.textContent =
                String(Math.round(((angleDeg % 360) + 360) % 360)).padStart(3, '0') + '°';
        }
    }

    /* ---------- Activate a menu mode ---------- */
    let currentMode = null;
    function activateMode(mode, animate) {
        const item = document.querySelector(`.menu-item[data-mode="${mode}"]`);
        if (!item) return;
        currentMode = mode;
        const angle = parseFloat(item.dataset.angle);
        setPuckAngle(angle, animate);

        const label = item.querySelector('.item-label').textContent.trim();
        const desc  = item.querySelector('.item-desc').textContent.trim();

        if (centerValEl)  centerValEl.textContent  = label;
        if (cursorModeEl) cursorModeEl.textContent = label;
        if (centerMetaEl) {
            const num = item.querySelector('.item-num').textContent.trim();
            centerMetaEl.textContent = `${num} · h ${String(Math.round(angle)).padStart(3, '0')}`;
        }
        menuItems.forEach(mi => mi.classList.toggle('is-active', mi === item));
    }

    /* ---------- Init ---------- */
    activateMode('solo', false);

    /* ---------- Bg hue tint per menu item ----------
       The conic-gradient wheel uses `from -90deg`, which puts hsl(90°)
       (yellow-green) at the top and hsl(180°) (cyan) at the right etc.
       So the rotation amount that brings the tint's red base to match each
       wheel quadrant is the same numeric offset as the wheel ring shows.   */
    const TINT_HUE = {
        solo:         90,   //   0° (top)        → yellow-green
        multi:        160,  //  72° (upper-right) → cyan-teal
        gallery:      230,  // 144° (lower-right) → blue
        contributors: 310,  // 216° (lower-left)  → magenta-pink
        about:         20   // 288° (upper-left)  → warm orange
    };
    function setTint(mode, on) {
        const root = document.documentElement;
        if (on && mode && TINT_HUE[mode] != null) {
            root.style.setProperty('--menu-hue', TINT_HUE[mode] + 'deg');
            root.style.setProperty('--menu-tint-alpha', '1');
        } else {
            root.style.setProperty('--menu-tint-alpha', '0');
        }
    }

    /* ---------- Bind hover/focus/click ---------- */
    menuItems.forEach(item => {
        item.addEventListener('mouseenter', () => {
            activateMode(item.dataset.mode, true);
            setTint(item.dataset.mode, true);
        });
        item.addEventListener('mouseleave', () => setTint(null, false));
        item.addEventListener('focus',  () => {
            activateMode(item.dataset.mode, true);
            setTint(item.dataset.mode, true);
        });
        item.addEventListener('blur',   () => setTint(null, false));
        item.addEventListener('click', (e) => {
            const mode = item.dataset.mode;
            const href = item.dataset.href;
            if (item.classList.contains('menu-item--coming-soon') || !href) {
                e.preventDefault();
                shake(item);
                flashCenter('soon');
                return;
            }
            // Brief fade transition before navigation
            document.body.style.transition = 'opacity 300ms ease';
            document.body.style.opacity = '0';
            setTimeout(() => { window.location.href = href; }, 280);
        });
    });

    /* ---------- Helpers ---------- */
    function shake(el) {
        el.animate(
            [
                { transform: getComputedStyle(el).transform + ' translateX(0)' },
                { transform: getComputedStyle(el).transform + ' translateX(-3px)' },
                { transform: getComputedStyle(el).transform + ' translateX(3px)' },
                { transform: getComputedStyle(el).transform + ' translateX(0)' }
            ],
            { duration: 240, iterations: 1 }
        );
    }

    function flashCenter(text) {
        if (!centerValEl) return;
        const original = centerValEl.textContent;
        centerValEl.style.transition = 'opacity 120ms ease';
        centerValEl.style.opacity = '0';
        setTimeout(() => {
            centerValEl.textContent = text;
            centerValEl.style.opacity = '1';
            setTimeout(() => {
                centerValEl.style.opacity = '0';
                setTimeout(() => {
                    centerValEl.textContent = original;
                    centerValEl.style.opacity = '1';
                }, 120);
            }, 600);
        }, 120);
    }

    /* ---------- Mini tone curve in the scope-bar ---------- */
    if (window.BezierCurve && document.getElementById('curve-svg')) {
        window.BezierCurve.init('curve-svg');
    }

    /* ---------- Nickname editor (left panel) ---------- */
    (function () {
        const NICK_KEY = 'gradinggame.nickname';
        const input = document.getElementById('landing-nickname-input');
        const hint  = document.getElementById('landing-nickname-hint');
        if (!input) return;

        function makeGuest() {
            return 'guest_' + Math.random().toString(36).slice(2, 6).toUpperCase();
        }

        let nick = '';
        try { nick = localStorage.getItem(NICK_KEY) || ''; } catch (e) {}
        if (!nick) {
            nick = makeGuest();
            try { localStorage.setItem(NICK_KEY, nick); } catch (e) {}
        }
        input.value = nick;

        let saveTimer = null;
        input.addEventListener('input', () => {
            // Normalize: lowercase, only alphanumeric + _ and -, max 20 chars
            const next = input.value.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20);
            if (next !== input.value) input.value = next;
            nick = next;
            if (nick.length < 3) {
                hint.textContent = '3+ chars · letters, digits, _ or -';
                hint.className = 'panel-hint is-error';
                return;
            }
            // Debounce save by 350 ms
            clearTimeout(saveTimer);
            saveTimer = setTimeout(() => {
                try { localStorage.setItem(NICK_KEY, nick); } catch (e) {}
                hint.textContent = 'saved · ' + nick;
                hint.className = 'panel-hint is-saved';
                setTimeout(() => {
                    hint.textContent = 'saved locally · used in multi';
                    hint.className = 'panel-hint';
                }, 1200);
            }, 350);
        });

        // Save once on first paint to ensure default guest_ is persisted
        try { localStorage.setItem(NICK_KEY, nick); } catch (e) {}
    })();

    /* ---------- Live timecode (right panel) ---------- */
    const nowEl = document.getElementById('now-date');
    if (nowEl) {
        const update = () => {
            const d = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const yy = String(d.getFullYear()).slice(2);
            nowEl.textContent =
                `${yy}-${pad(d.getMonth()+1)}-${pad(d.getDate())} · ` +
                `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        };
        update();
        setInterval(update, 1000);
    }

    /* ---------- Keyboard navigation (left/right cycle menu items) ---------- */
    const cycleOrder = ['solo', 'multi', 'gallery', 'contributors', 'about'];
    document.addEventListener('keydown', (e) => {
        const idx = cycleOrder.indexOf(currentMode);
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            const next = cycleOrder[(idx + 1) % cycleOrder.length];
            activateMode(next, true);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = cycleOrder[(idx - 1 + cycleOrder.length) % cycleOrder.length];
            activateMode(prev, true);
        } else if (e.key === 'Enter' || e.key === ' ') {
            const item = document.querySelector(`.menu-item[data-mode="${currentMode}"]`);
            if (item) item.click();
        }
    });

})();
