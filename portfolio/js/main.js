/* Comportements communs : barre de nav au scroll + menu mobile. */
(function () {
  var nav = document.getElementById('nav');
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle('scrolled', window.scrollY > 30);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* Compteurs animés (section À propos).
     - data-year-since="2018"  -> cible = année courante - 2018 (se met à jour seul chaque année)
     - data-count="44"         -> cible fixe
     - data-suffix=" ans"      -> texte ajouté après le nombre */
  var counters = document.querySelectorAll('.stat .n[data-count], .stat .n[data-year-since]');
  if (counters.length && 'IntersectionObserver' in window) {
    var animate = function (el) {
      var target = el.hasAttribute('data-year-since')
        ? (new Date().getFullYear() - parseInt(el.getAttribute('data-year-since'), 10))
        : parseInt(el.getAttribute('data-count'), 10);
      var suffix = el.getAttribute('data-suffix') || '';
      var dur = 1200, start = null;
      var tick = function (ts) {
        if (!start) start = ts;
        var p = Math.min((ts - start) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 3);            // ease-out cubic
        el.textContent = Math.round(eased * target) + suffix;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { animate(e.target); io.unobserve(e.target); }
      });
    }, { threshold: 0.5 });
    counters.forEach(function (c) { io.observe(c); });
  }

  var toggle = document.getElementById('navToggle');
  var menu = document.getElementById('mobileMenu');
  var close = document.getElementById('menuClose');
  if (toggle && menu) {
    toggle.addEventListener('click', function () { menu.classList.add('open'); });
    if (close) close.addEventListener('click', function () { menu.classList.remove('open'); });
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { menu.classList.remove('open'); });
    });
  }
})();
