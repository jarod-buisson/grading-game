/* =========================================================
   legal.js — highlight the active section in the sticky TOC
   as the user scrolls through the legal page.
   ========================================================= */

(function () {
    'use strict';

    const items    = Array.from(document.querySelectorAll('.legal-toc-item'));
    const sections = Array.from(document.querySelectorAll('.legal-section'));
    if (!items.length || !sections.length) return;

    function setActive(id) {
        items.forEach(it => {
            const href = it.getAttribute('href') || '';
            it.classList.toggle('is-active', href === '#' + id);
        });
    }

    // IntersectionObserver: pick the topmost section that's at least
    // partially visible. We trigger when its top crosses ~25% from the
    // top of the viewport, which feels natural for a long-form page.
    const observer = new IntersectionObserver((entries) => {
        const visible = entries
            .filter(e => e.isIntersecting)
            .sort((a, b) => a.target.offsetTop - b.target.offsetTop);
        if (visible.length) setActive(visible[0].target.id);
    }, {
        rootMargin: '-25% 0px -65% 0px',
        threshold: 0
    });

    sections.forEach(s => observer.observe(s));

    // Direct click on a TOC item: optimistic highlight (the
    // IntersectionObserver will confirm after scroll settles).
    items.forEach(it => {
        it.addEventListener('click', () => {
            const id = (it.getAttribute('href') || '').replace('#', '');
            if (id) setActive(id);
        });
    });

})();
