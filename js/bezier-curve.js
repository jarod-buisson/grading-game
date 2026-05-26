/* =========================================================
   bezier-curve.js — interactive tone curve.

   Two endpoints fixed at bottom-left (0, H) and top-right (W, 0).
   Two draggable cubic control points (CP1, CP2).
   Curve is purely aesthetic; it does NOT drive duration.

   Exports a single `BezierCurve.init(svgId, options)` global.
   ========================================================= */

(function (global) {
    'use strict';

    const SIZE = 280;
    const DEFAULTS = {
        cp1: { x: 0.30, y: 0.60 },  // unit space, y measured from top
        cp2: { x: 0.70, y: 0.40 }
    };

    function init(svgId, options) {
        const svg = document.getElementById(svgId);
        if (!svg) return null;

        const pathEl     = svg.querySelector('#curve-path');
        const fillEl     = svg.querySelector('#curve-fill');
        const cp1El      = svg.querySelector('#cp1');
        const cp2El      = svg.querySelector('#cp2');
        const cp1HitEl   = svg.querySelector('#cp1-hitbox');   // optional larger hit area
        const cp2HitEl   = svg.querySelector('#cp2-hitbox');
        const cp1LineEl  = svg.querySelector('#cp1-line');
        const cp2LineEl  = svg.querySelector('#cp2-line');
        const gridEl     = svg.querySelector('#curve-grid');
        const resetEl    = document.getElementById('curve-reset');

        const opts = Object.assign({}, DEFAULTS, options || {});

        let cp1 = { ...opts.cp1 };
        let cp2 = { ...opts.cp2 };

        /* ---------- Build grid ---------- */
        if (gridEl) {
            for (let i = 1; i < 10; i++) {
                const p = (i / 10) * SIZE;
                const major = (i === 5);
                const v = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                v.setAttribute('x1', p); v.setAttribute('y1', 0);
                v.setAttribute('x2', p); v.setAttribute('y2', SIZE);
                if (major) v.setAttribute('class', 'grid-major');
                gridEl.appendChild(v);

                const h = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                h.setAttribute('x1', 0);    h.setAttribute('y1', p);
                h.setAttribute('x2', SIZE); h.setAttribute('y2', p);
                if (major) h.setAttribute('class', 'grid-major');
                gridEl.appendChild(h);
            }
        }

        /* ---------- Bezier shape → CSS filter on bg-grade-layer ---------- */
        // SVG y is inverted (y=0 is top → highlights, y=1 is bottom → shadows).
        // A "contrast boost" S-curve has cp1 below the diagonal (cp1.y > cp2.y)
        // because it crushes shadows and lifts highlights.
        // The simple measure `cp1.y - cp2.y` captures S-strength reliably:
        //   positive → contrast boost, negative → contrast reduce.
        function emitFilter() {
            const sStrength = cp1.y - cp2.y;                       // -1 .. 1
            const contrast = clamp(1 + sStrength * 1.0, 0.4, 2.0); // 0.4 .. 2.0

            // Brightness: average y position. cp1+cp2 high (toward bottom) =
            // "lift shadows" curve which makes the image visually brighter on a
            // real photo — but on our bg layer it just looks "raised". We map
            // it as: avgY low = brighter, high = darker (intuitive).
            const avgY = (cp1.y + cp2.y) / 2;                      // 0 .. 1
            const brightness = clamp(1 - (avgY - 0.5) * 0.8, 0.55, 1.45);

            document.documentElement.style.setProperty('--curve-contrast',   contrast.toFixed(3));
            document.documentElement.style.setProperty('--curve-brightness', brightness.toFixed(3));
        }

        /* ---------- Sync the SVG <feComponentTransfer> tableValues -----
           If a #tone-lut-filter exists in the document, we keep its R/G/B
           lookup-tables in sync with the current curve LUT. The filter
           is then applied via CSS to the bg-grade-layer for a real per-
           pixel transformation (CSS contrast() alone is linear). */
        let svgFilterR, svgFilterG, svgFilterB;
        function refreshSvgFilterRefs() {
            svgFilterR = svgFilterR || document.getElementById('lut-r');
            svgFilterG = svgFilterG || document.getElementById('lut-g');
            svgFilterB = svgFilterB || document.getElementById('lut-b');
        }

        function updateSvgFilterFromLUT() {
            refreshSvgFilterRefs();
            if (!svgFilterR && !svgFilterG && !svgFilterB) return;  // no filter on page

            // 32 samples is plenty smooth for component-transfer
            // (SVG interpolates linearly between them).
            const N = 32;
            const lut = buildLUT();
            const samples = new Array(N);
            for (let i = 0; i < N; i++) {
                const idx = Math.round((i / (N - 1)) * 255);
                samples[i] = (lut[idx] / 255).toFixed(4);
            }
            const tv = samples.join(' ');
            if (svgFilterR) svgFilterR.setAttribute('tableValues', tv);
            if (svgFilterG) svgFilterG.setAttribute('tableValues', tv);
            if (svgFilterB) svgFilterB.setAttribute('tableValues', tv);
        }

        /* ---------- Render the curve ---------- */
        function render() {
            const c1x = cp1.x * SIZE;
            const c1y = cp1.y * SIZE;
            const c2x = cp2.x * SIZE;
            const c2y = cp2.y * SIZE;

            const d = `M 0 ${SIZE} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${SIZE} 0`;
            pathEl.setAttribute('d', d);

            if (fillEl) {
                fillEl.setAttribute('d',
                    d + ` L ${SIZE} ${SIZE} L 0 ${SIZE} Z`);
            }

            cp1El.setAttribute('cx', c1x);
            cp1El.setAttribute('cy', c1y);
            cp2El.setAttribute('cx', c2x);
            cp2El.setAttribute('cy', c2y);

            // Keep the invisible hitboxes synced with the visible CPs
            if (cp1HitEl) { cp1HitEl.setAttribute('cx', c1x); cp1HitEl.setAttribute('cy', c1y); }
            if (cp2HitEl) { cp2HitEl.setAttribute('cx', c2x); cp2HitEl.setAttribute('cy', c2y); }

            if (cp1LineEl) {
                cp1LineEl.setAttribute('x1', 0);
                cp1LineEl.setAttribute('y1', SIZE);
                cp1LineEl.setAttribute('x2', c1x);
                cp1LineEl.setAttribute('y2', c1y);
            }
            if (cp2LineEl) {
                cp2LineEl.setAttribute('x1', SIZE);
                cp2LineEl.setAttribute('y1', 0);
                cp2LineEl.setAttribute('x2', c2x);
                cp2LineEl.setAttribute('y2', c2y);
            }

            emitFilter();
            updateSvgFilterFromLUT();
        }

        /* ---------- Pointer dragging ---------- */
        let dragging = null;

        function getSvgPt(evt) {
            const rect = svg.getBoundingClientRect();
            const x = (evt.clientX - rect.left) / rect.width;
            const y = (evt.clientY - rect.top)  / rect.height;
            return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
        }

        function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

        function onDown(target) {
            return function (e) {
                e.preventDefault();
                dragging = target;
                const hitEl = target === 'cp1' ? (cp1HitEl || cp1El) : (cp2HitEl || cp2El);
                hitEl.classList.add('is-dragging');
                document.addEventListener('pointermove', onMove);
                document.addEventListener('pointerup',   onUp);
            };
        }

        function onMove(e) {
            if (!dragging) return;
            const p = getSvgPt(e);
            if (dragging === 'cp1') cp1 = p;
            else                    cp2 = p;
            render();
        }

        function onUp() {
            (cp1HitEl || cp1El).classList.remove('is-dragging');
            (cp2HitEl || cp2El).classList.remove('is-dragging');
            dragging = null;
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup',   onUp);
        }

        // Bind to the larger invisible hitbox when present, otherwise fall back
        // to the visible CP (which is what older HTML markup uses, e.g. solo).
        (cp1HitEl || cp1El).addEventListener('pointerdown', onDown('cp1'));
        (cp2HitEl || cp2El).addEventListener('pointerdown', onDown('cp2'));

        /* ---------- Reset ---------- */
        if (resetEl) {
            resetEl.addEventListener('click', () => {
                cp1 = { ...DEFAULTS.cp1 };
                cp2 = { ...DEFAULTS.cp2 };
                render();
            });
        }

        /* ---------- 256-bin LUT for histogram / image-grading consumers ----------
           For each input bin (0..255), sample the cubic bezier to find the
           output intensity. Curve goes from P0=(0,1) to P3=(1,0) in our
           SVG-y-down unit space; we invert y at the end so 0 = dark, 255 = bright. */
        function buildLUT() {
            const SAMPLES = 1024;
            const xs = new Float32Array(SAMPLES + 1);
            const ys = new Float32Array(SAMPLES + 1);
            for (let i = 0; i <= SAMPLES; i++) {
                const t = i / SAMPLES;
                const omt = 1 - t;
                // x(t) = 3·(1-t)²·t·cp1.x + 3·(1-t)·t²·cp2.x + t³
                xs[i] = 3 * omt*omt*t * cp1.x + 3 * omt*t*t * cp2.x + t*t*t;
                // y(t) = (1-t)³·1 + 3·(1-t)²·t·cp1.y + 3·(1-t)·t²·cp2.y + t³·0
                ys[i] = omt*omt*omt + 3*omt*omt*t * cp1.y + 3*omt*t*t * cp2.y;
            }
            const lut = new Uint8Array(256);
            for (let bin = 0; bin < 256; bin++) {
                const targetX = bin / 255;
                // Binary search since xs[] is monotonic increasing 0→1
                let lo = 0, hi = SAMPLES;
                while (lo < hi) {
                    const mid = (lo + hi) >> 1;
                    if (xs[mid] < targetX) lo = mid + 1;
                    else hi = mid;
                }
                const y = ys[lo];
                // SVG y=0 is top (bright) → intensity 255; y=1 is bottom (dark) → 0
                lut[bin] = Math.max(0, Math.min(255, Math.round((1 - y) * 255)));
            }
            return lut;
        }

        /* ---------- Initial paint ---------- */
        render();

        const instance = {
            getState: () => ({ cp1: { ...cp1 }, cp2: { ...cp2 } }),
            getLUT:   () => buildLUT(),
            reset: () => {
                cp1 = { ...DEFAULTS.cp1 };
                cp2 = { ...DEFAULTS.cp2 };
                render();
            }
        };
        // Expose the most-recently-initialized instance globally so other
        // modules (scopes.js, …) can read the LUT without explicit wiring.
        global.toneCurveInstance = instance;
        return instance;
    }

    global.BezierCurve = { init };
})(window);
