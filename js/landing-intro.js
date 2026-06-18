/* Landing — l'animation d'arrivée du hero est gérée en CSS (landing-intro.css).
   Ici : clic sur la pastille « explorer » → scroll animé vers la roue avec un
   léger fondu (voile qui monte puis redescend), au lieu d'un saut instantané. */
(function () {
    var link = document.querySelector('.intro-scroll');
    if (!link) return;

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var animating = false;
    var overlay = null;

    function easeInOut(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    /* Scroll jusqu'en bas de la page (la roue + la barre de scopes sont
       alors visibles). On vise le scroll maximum du document. */
    function destinationY() {
        return Math.max(
            0,
            document.documentElement.scrollHeight - window.innerHeight
        );
    }

    function getOverlay() {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'page-fade-overlay';
            document.body.appendChild(overlay);
        }
        return overlay;
    }

    link.addEventListener('click', function (e) {
        var endY = destinationY();
        if (endY === null) return;            // pas de cible : on laisse le navigateur gérer
        e.preventDefault();

        if (reduce) { window.scrollTo(0, endY); return; }
        if (animating) return;
        animating = true;

        var startY = window.scrollY;
        var ov = getOverlay();
        var duration = 1000;
        var start = null;

        function step(ts) {
            if (start === null) start = ts;
            var p = Math.min((ts - start) / duration, 1);
            window.scrollTo(0, startY + (endY - startY) * easeInOut(p));
            /* sin(0)=sin(π)=0, sin(π/2)=1 → fondu qui monte à ~0.4 au milieu
               puis revient à 0 : fade-out puis fade-in pendant la descente. */
            ov.style.opacity = (Math.sin(p * Math.PI) * 0.4).toFixed(3);
            if (p < 1) {
                requestAnimationFrame(step);
            } else {
                ov.style.opacity = '0';
                animating = false;
            }
        }
        requestAnimationFrame(step);
    });
})();
