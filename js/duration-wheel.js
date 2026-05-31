/* =========================================================
   duration-wheel.js — horizontal "DaVinci-style" duration picker.

   Renders a horizontally-scrollable ruler with one tick per `step`
   minutes (5 by default), labels every 15 min, and a fixed centre
   indicator. The selected value is whichever tick lands under the
   centre indicator.

   Interaction surface:
     - Mouse / touch drag — pan the ruler
     - Trackpad / mouse wheel — pan the ruler
     - Click on a tick — snap to it
     - Arrow Left / Right (or Down / Up) — step ±1 unit
     - Home / End — jump to min / max

   Exposed on window.DurationWheel.init(rootEl, opts) so solo-setup
   and multi-lobby can mount it without duplicating logic.
   ========================================================= */

(function (global) {
    'use strict';

    function init(rootEl, opts) {
        opts = opts || {};
        const MIN       = opts.min       != null ? opts.min       : 5;
        const MAX       = opts.max       != null ? opts.max       : 120;
        const STEP      = opts.step      != null ? opts.step      : 5;
        const TICK_W    = opts.tickWidth != null ? opts.tickWidth : 36;
        const LABEL_AT  = opts.labelEvery != null ? opts.labelEvery : 15;
        const onChange  = typeof opts.onChange === 'function' ? opts.onChange : function () {};

        // Decorative ridges rendered before MIN and after MAX so the wheel
        // can be spun past either bound and still show ridges scrolling
        // past — like an infinite knurled cylinder. The value clamps at
        // MIN/MAX but the visual offset is free to drift, so we get a
        // rubber-band feel that snaps back on release.
        const GHOST_COUNT = opts.ghosts != null ? opts.ghosts : 30;

        let value = clamp(snap(opts.value != null ? opts.value : 20));
        let currentX = 0;

        const trackEl = rootEl.querySelector('.duration-wheel-track');
        if (!trackEl) {
            console.warn('[duration-wheel] missing .duration-wheel-track in', rootEl);
            return null;
        }

        /* ---------- Build ticks: ghosts + real + ghosts ---------- */
        function renderTick(v, isMajor) {
            const cls = [
                'duration-wheel-tick',
                isMajor   ? 'duration-wheel-tick--major' : '',
                v == null ? 'duration-wheel-tick--ghost' : ''
            ].filter(Boolean).join(' ');
            const attr = v == null ? '' : ' data-value="' + v + '"';
            return '<div class="' + cls + '"' + attr +
                       ' style="flex-basis:' + TICK_W + 'px">' +
                       '<span class="duration-wheel-tick-mark" aria-hidden="true"></span>' +
                       (v != null && isMajor
                           ? '<span class="duration-wheel-tick-label">' + String(v).padStart(2, '0') + '</span>'
                           : '') +
                   '</div>';
        }

        let html = '';
        // Ghost ridges BEFORE the real range — sprinkle "major" every 3
        // so the texture looks natural and matches the real range's
        // major-tick rhythm at LABEL_AT/STEP = 3 ticks.
        for (let i = GHOST_COUNT; i > 0; i--) {
            html += renderTick(null, (i % 3) === 0);
        }
        // Real ticks
        for (let v = MIN; v <= MAX; v += STEP) {
            html += renderTick(v, (v % LABEL_AT) === 0);
        }
        // Ghost ridges AFTER the real range
        for (let i = 1; i <= GHOST_COUNT; i++) {
            html += renderTick(null, (i % 3) === 0);
        }
        trackEl.innerHTML = html;

        /* ---------- Helpers ---------- */
        function snap(v)  { return Math.round(v / STEP) * STEP; }
        function clamp(v) { return Math.max(MIN, Math.min(MAX, v)); }

        function translateForValue(v) {
            // We want the tick for v to land at the centre of rootEl.
            // Real ticks start at index GHOST_COUNT inside the track.
            const w = rootEl.offsetWidth || rootEl.getBoundingClientRect().width;
            const idx = GHOST_COUNT + (v - MIN) / STEP;
            return (w / 2) - (TICK_W / 2) - (idx * TICK_W);
        }

        function valueForTranslate(x) {
            // Inverse of translateForValue, with the value clamped to
            // [MIN, MAX] so spinning past either bound doesn't change
            // the timer (only the visual offset drifts on).
            const w = rootEl.offsetWidth || rootEl.getBoundingClientRect().width;
            const centre = (w / 2) - (TICK_W / 2);
            const idx = Math.round((centre - x) / TICK_W) - GHOST_COUNT;
            return clamp(MIN + idx * STEP);
        }

        function applyX(x) {
            currentX = x;
            trackEl.style.transform = 'translateX(' + x + 'px)';
        }

        function setValueInternal(v, animate, fireChange) {
            v = clamp(snap(v));
            const changed = v !== value;
            value = v;
            rootEl.setAttribute('aria-valuenow', String(value));

            if (animate) {
                trackEl.style.transition = 'transform 220ms cubic-bezier(.4,.0,.2,1)';
                applyX(translateForValue(value));
                setTimeout(function () {
                    if (trackEl) trackEl.style.transition = '';
                }, 240);
            } else {
                trackEl.style.transition = '';
                applyX(translateForValue(value));
            }

            updateActiveClass();
            if (fireChange && changed) onChange(value);
        }

        function updateActiveClass() {
            const els = trackEl.querySelectorAll('.duration-wheel-tick');
            for (let i = 0; i < els.length; i++) {
                const v = parseInt(els[i].getAttribute('data-value'), 10);
                els[i].classList.toggle('is-active', v === value);
            }
        }

        /* ---------- Initial render ---------- */
        rootEl.setAttribute('aria-valuemin', String(MIN));
        rootEl.setAttribute('aria-valuemax', String(MAX));
        rootEl.setAttribute('aria-valuenow', String(value));
        applyX(translateForValue(value));
        updateActiveClass();

        /* ---------- Pointer drag ---------- */
        let dragging = false;
        let pointerId = null;
        let dragStartClientX = 0;
        let dragStartTrackX  = 0;
        let didDrag = false;

        function onPointerDown(e) {
            if (e.button != null && e.button !== 0) return;
            dragging = true;
            didDrag = false;
            pointerId = e.pointerId;
            dragStartClientX = e.clientX;
            dragStartTrackX  = currentX;
            trackEl.style.transition = '';
            try { rootEl.setPointerCapture(pointerId); } catch (_) {}
            // NB: we intentionally do NOT call preventDefault here.
            // Doing so on pointerdown swallows the subsequent click event
            // in most browsers — breaking "tap a tick to snap to it".
            // Text selection is already blocked via CSS (user-select:none).
        }

        function onPointerMove(e) {
            if (!dragging) return;
            const dx = e.clientX - dragStartClientX;
            if (Math.abs(dx) > 2) {
                didDrag = true;
                // Once we're sure it's a drag, suppress default behaviour
                // (e.g. native horizontal-scroll on touch) so the wheel
                // owns the gesture.
                e.preventDefault();
            }

            let x = dragStartTrackX + dx;
            // No visual clamp — we let the ruler scroll past MIN/MAX into
            // the ghost-ridge territory so the wheel feels like an
            // infinite cylinder. The value clamp below stops the timer
            // from going anywhere illegal. We do clamp at the absolute
            // end of the ghosts to stop the user dragging into empty
            // space.
            const minX = translateForValue(MAX) - GHOST_COUNT * TICK_W;
            const maxX = translateForValue(MIN) + GHOST_COUNT * TICK_W;
            if (x < minX) x = minX;
            if (x > maxX) x = maxX;
            applyX(x);

            // Live update of the value (without snap-animation yet) so the
            // big display stays in sync while the user is still dragging.
            const live = valueForTranslate(x);
            if (live !== value) {
                value = live;
                rootEl.setAttribute('aria-valuenow', String(value));
                updateActiveClass();
                onChange(value);
            }
        }

        function onPointerUp(e) {
            if (!dragging) return;
            dragging = false;
            try { rootEl.releasePointerCapture(pointerId); } catch (_) {}
            pointerId = null;

            // If the user didn't drag (just tapped/clicked a tick), snap
            // to whichever tick is under the pointer right now. We do
            // this here instead of in a separate "click" listener because
            // setPointerCapture redirects subsequent events to rootEl,
            // so a real `click` on a tick child often arrives with
            // e.target === rootEl (no useful tick to read).
            if (!didDrag && e && typeof e.clientX === 'number') {
                // Find the tick element under the pointer via document API.
                const hit = document.elementFromPoint(e.clientX, e.clientY);
                const tickEl = hit && hit.closest && hit.closest('.duration-wheel-tick');
                if (tickEl && trackEl.contains(tickEl)) {
                    const v = parseInt(tickEl.getAttribute('data-value'), 10);
                    if (!isNaN(v)) {
                        setValueInternal(v, true, true);
                        return;
                    }
                }
            }
            // Otherwise (drag), snap to whatever value is closest to the
            // centre right now and fire onChange so consumers see the
            // final, snapped value.
            setValueInternal(value, true, true);
        }

        rootEl.addEventListener('pointerdown',   onPointerDown);
        rootEl.addEventListener('pointermove',   onPointerMove);
        rootEl.addEventListener('pointerup',     onPointerUp);
        rootEl.addEventListener('pointercancel', onPointerUp);
        rootEl.addEventListener('lostpointercapture', onPointerUp);

        /* ---------- Trackpad / wheel ---------- */
        let wheelTimer = null;
        rootEl.addEventListener('wheel', function (e) {
            // Prefer the dominant axis — trackpads commonly use deltaX for
            // horizontal swipes, but mice only have deltaY.
            const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            if (Math.abs(dx) < 1) return;
            e.preventDefault();
            const dir = dx > 0 ? 1 : -1;
            setValueInternal(value + dir * STEP, false, true);
            clearTimeout(wheelTimer);
            wheelTimer = setTimeout(function () {
                setValueInternal(value, true, false);
            }, 80);
        }, { passive: false });

        /* ---------- Keyboard ---------- */
        rootEl.addEventListener('keydown', function (e) {
            switch (e.key) {
                case 'ArrowLeft':
                case 'ArrowDown':
                    setValueInternal(value - STEP, true, true);
                    e.preventDefault();
                    break;
                case 'ArrowRight':
                case 'ArrowUp':
                    setValueInternal(value + STEP, true, true);
                    e.preventDefault();
                    break;
                case 'Home':
                    setValueInternal(MIN, true, true);
                    e.preventDefault();
                    break;
                case 'End':
                    setValueInternal(MAX, true, true);
                    e.preventDefault();
                    break;
            }
        });

        /* ---------- Resize ---------- */
        let ro = null;
        if (typeof ResizeObserver !== 'undefined') {
            ro = new ResizeObserver(function () {
                // Centre line is at 50%, so any width change needs the
                // track translation to be recomputed.
                applyX(translateForValue(value));
            });
            ro.observe(rootEl);
        } else {
            window.addEventListener('resize', function () {
                applyX(translateForValue(value));
            });
        }

        /* ---------- Public API ---------- */
        return {
            getValue: function () { return value; },
            setValue: function (v) { setValueInternal(v, true, true); },
            // Same as setValue but without firing onChange — useful when
            // the caller already owns the new value (e.g. restoring from
            // localStorage) and shouldn't trigger their own listener.
            setValueSilent: function (v) { setValueInternal(v, false, false); },
            destroy: function () {
                if (ro) ro.disconnect();
                rootEl.removeEventListener('pointerdown',   onPointerDown);
                rootEl.removeEventListener('pointermove',   onPointerMove);
                rootEl.removeEventListener('pointerup',     onPointerUp);
                rootEl.removeEventListener('pointercancel', onPointerUp);
            }
        };
    }

    global.DurationWheel = { init: init };
})(window);
