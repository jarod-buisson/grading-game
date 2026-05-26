/* =========================================================
   scopes.js — decorative animated scope canvases
   (waveform / histogram / vectorscope)

   Performance: each scope runs its own rAF loop with low
   amplitude changes; visually "alive" but unobtrusive.
   ========================================================= */

(function () {
    'use strict';

    const ACCENT_WARM = 'rgba(212, 165, 116, ';
    const ACCENT_R    = 'rgba(208, 92, 92, ';
    const ACCENT_G    = 'rgba(95, 168, 109, ';
    const ACCENT_B    = 'rgba(92, 154, 208, ';

    /* ============== WAVEFORM ============== */
    function initWaveform(canvas) {
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        let t = 0;

        function draw() {
            ctx.clearRect(0, 0, W, H);

            // background grid (subtle)
            ctx.strokeStyle = 'rgba(255,255,255,0.04)';
            ctx.lineWidth = 1;
            for (let i = 1; i < 4; i++) {
                const y = (H * i) / 4;
                ctx.beginPath();
                ctx.moveTo(0, y + 0.5);
                ctx.lineTo(W, y + 0.5);
                ctx.stroke();
            }

            // waveform "trace"
            ctx.strokeStyle = ACCENT_WARM + '0.65)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let x = 0; x < W; x++) {
                const k = x / W;
                // a stable waveform shape with very small drift
                const shape =
                    Math.sin(k * 6 + t * 0.4) * 8 +
                    Math.sin(k * 13 + t * 0.6) * 4 +
                    Math.sin(k * 27 + t * 0.9) * 2;
                const y = H * 0.5 + shape;
                if (x === 0) ctx.moveTo(x + 0.5, y);
                else         ctx.lineTo(x + 0.5, y);
            }
            ctx.stroke();

            // ghost trace (slightly offset, dimmer)
            ctx.strokeStyle = ACCENT_WARM + '0.18)';
            ctx.beginPath();
            for (let x = 0; x < W; x++) {
                const k = x / W;
                const shape =
                    Math.sin(k * 6 + t * 0.4 - 0.4) * 8 +
                    Math.sin(k * 13 + t * 0.6 - 0.4) * 4;
                const y = H * 0.5 + shape + 3;
                if (x === 0) ctx.moveTo(x + 0.5, y);
                else         ctx.lineTo(x + 0.5, y);
            }
            ctx.stroke();

            t += 0.015;
            requestAnimationFrame(draw);
        }
        draw();
    }

    /* ============== HISTOGRAM ============== */
    /* When a tone curve is active (window.toneCurveInstance), this scope
       displays the curve's LUT applied to a baseline RGB distribution.
       Result: dragging the curve visibly reshapes the histogram in real time.
       Without a curve, it falls back to a subtle animated baseline. */
    function initHistogram(canvas) {
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const BARS = 64;

        // Baseline RGB distributions — slightly different Gaussians so the
        // three channels don't perfectly overlap (gives the scope life).
        const baselineR = makeGaussian(0.50, 0.16);   // peak near mid, std ~16% of range
        const baselineG = makeGaussian(0.46, 0.18);
        const baselineB = makeGaussian(0.42, 0.20);

        // Smooth render state for each channel (animated toward target)
        const stateR = new Float32Array(BARS);
        const stateG = new Float32Array(BARS);
        const stateB = new Float32Array(BARS);

        function makeGaussian(peakUnit, stdUnit) {
            // 256-bin baseline normalized so max ≈ 1
            const arr = new Float32Array(256);
            const peak = peakUnit * 255;
            const std  = stdUnit * 255;
            let maxV = 0;
            for (let i = 0; i < 256; i++) {
                const d = (i - peak) / std;
                arr[i] = Math.exp(-d * d * 0.5);
                if (arr[i] > maxV) maxV = arr[i];
            }
            for (let i = 0; i < 256; i++) arr[i] /= maxV;
            return arr;
        }

        // Apply the curve LUT to a baseline 256-bin distribution, then
        // down-sample to BARS bins for rendering.
        function applyLUTAndBin(baseline, lut) {
            const out = new Float32Array(BARS);
            const binSize = 256 / BARS;
            if (lut) {
                // Pour each input bin into its mapped output bin
                const out256 = new Float32Array(256);
                for (let i = 0; i < 256; i++) out256[lut[i]] += baseline[i];
                for (let j = 0; j < BARS; j++) {
                    const start = Math.floor(j * binSize);
                    const end   = Math.floor((j + 1) * binSize);
                    let sum = 0;
                    for (let k = start; k < end; k++) sum += out256[k];
                    out[j] = sum / binSize;
                }
            } else {
                // No curve — just down-sample
                for (let j = 0; j < BARS; j++) {
                    const start = Math.floor(j * binSize);
                    const end   = Math.floor((j + 1) * binSize);
                    let sum = 0;
                    for (let k = start; k < end; k++) sum += baseline[k];
                    out[j] = sum / binSize;
                }
            }
            // Normalize so peak ≈ 1
            let max = 0;
            for (let j = 0; j < BARS; j++) if (out[j] > max) max = out[j];
            if (max > 0) for (let j = 0; j < BARS; j++) out[j] /= max;
            return out;
        }

        function draw() {
            ctx.clearRect(0, 0, W, H);

            // baseline floor
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.beginPath();
            ctx.moveTo(0, H - 0.5);
            ctx.lineTo(W, H - 0.5);
            ctx.stroke();

            const curve = window.toneCurveInstance;
            const lut = curve ? curve.getLUT() : null;

            const tgtR = applyLUTAndBin(baselineR, lut);
            const tgtG = applyLUTAndBin(baselineG, lut);
            const tgtB = applyLUTAndBin(baselineB, lut);

            const bw = W / BARS;
            const maxH = H * 0.92;
            for (let i = 0; i < BARS; i++) {
                // Smooth interpolation toward target so dragging the curve
                // looks like the histogram "flows" rather than snaps
                stateR[i] += (tgtR[i] - stateR[i]) * 0.18;
                stateG[i] += (tgtG[i] - stateG[i]) * 0.18;
                stateB[i] += (tgtB[i] - stateB[i]) * 0.18;

                const r = stateR[i] * maxH;
                const g = stateG[i] * maxH;
                const b = stateB[i] * maxH;

                ctx.fillStyle = ACCENT_R + '0.34)';
                ctx.fillRect(i * bw, H - r, bw - 0.4, r);
                ctx.fillStyle = ACCENT_G + '0.34)';
                ctx.fillRect(i * bw, H - g, bw - 0.4, g);
                ctx.fillStyle = ACCENT_B + '0.34)';
                ctx.fillRect(i * bw, H - b, bw - 0.4, b);
            }

            requestAnimationFrame(draw);
        }
        requestAnimationFrame(draw);
    }

    /* ============== VECTORSCOPE ============== */
    function initVectorscope(canvas) {
        const ctx = canvas.getContext('2d');
        const W = canvas.width;
        const H = canvas.height;
        const cx = W / 2;
        const cy = H / 2;
        const R = Math.min(W, H) / 2 - 4;

        // pre-generate a stable scatter cloud
        const DOTS = 60;
        const dots = [];
        for (let i = 0; i < DOTS; i++) {
            dots.push({
                a: Math.random() * Math.PI * 2,
                r: Math.random() * R * 0.7,
                w: Math.random() * 0.5 + 0.3,
                phase: Math.random() * Math.PI * 2
            });
        }

        let t = 0;
        function draw() {
            ctx.clearRect(0, 0, W, H);

            // outer ring
            ctx.strokeStyle = 'rgba(255,255,255,0.10)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, Math.PI * 2);
            ctx.stroke();

            // inner targets (75%, 50%, 25% — like a real vectorscope)
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            [R * 0.75, R * 0.5, R * 0.25].forEach((rr) => {
                ctx.beginPath();
                ctx.arc(cx, cy, rr, 0, Math.PI * 2);
                ctx.stroke();
            });

            // crosshair
            ctx.beginPath();
            ctx.moveTo(cx - R, cy + 0.5);
            ctx.lineTo(cx + R, cy + 0.5);
            ctx.moveTo(cx + 0.5, cy - R);
            ctx.lineTo(cx + 0.5, cy + R);
            ctx.stroke();

            // animated scatter
            ctx.fillStyle = ACCENT_WARM + '0.55)';
            for (let i = 0; i < DOTS; i++) {
                const d = dots[i];
                const drift = Math.sin(t + d.phase) * 1.5;
                const x = cx + Math.cos(d.a) * (d.r + drift);
                const y = cy + Math.sin(d.a) * (d.r + drift);
                ctx.beginPath();
                ctx.arc(x, y, d.w, 0, Math.PI * 2);
                ctx.fill();
            }

            t += 0.015;
            requestAnimationFrame(draw);
        }
        draw();
    }

    /* ============== BOOTSTRAP ============== */
    const waveformEl    = document.getElementById('scope-waveform');
    const histogramEl   = document.getElementById('scope-histogram');
    const vectorscopeEl = document.getElementById('scope-vectorscope');

    if (waveformEl)    initWaveform(waveformEl);
    if (histogramEl)   initHistogram(histogramEl);
    if (vectorscopeEl) initVectorscope(vectorscopeEl);

})();
