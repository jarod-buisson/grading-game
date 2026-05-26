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

    /* ---------- Start session ---------- */
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            const params = new URLSearchParams({
                duration:  String(durationMin),
                reference: showReference ? '1' : '0'
            });
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
