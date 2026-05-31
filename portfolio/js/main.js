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
