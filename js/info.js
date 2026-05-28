/* =========================================================
   info.js — highlight the active section in the sticky TOC
   as the user scrolls through the info page.

   Mirrors the behavior of legal.js — same IntersectionObserver
   trick, only the selectors differ.
   ========================================================= */

(function () {
    'use strict';

    const items    = Array.from(document.querySelectorAll('.info-toc-item'));
    const sections = Array.from(document.querySelectorAll('.info-section'));
    if (!items.length || !sections.length) return;

    function setActive(id) {
        items.forEach(it => {
            const href = it.getAttribute('href') || '';
            it.classList.toggle('is-active', href === '#' + id);
        });
    }

    // Pick the topmost section that's at least partially visible.
    // -25% top / -65% bottom = the active marker switches when a
    // section crosses roughly a quarter of the way down the viewport.
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

    // Click on a TOC item: optimistic highlight (the
    // IntersectionObserver will confirm after scroll settles).
    items.forEach(it => {
        it.addEventListener('click', () => {
            const id = (it.getAttribute('href') || '').replace('#', '');
            if (id) setActive(id);
        });
    });

})();
