barba.init({
    transitions: [
        {
            name: 'default-transition',

            async leave(data) {
                await fadeOut(data.current.container);
            },

            async enter(data) {
                fadeIn(data.next.container);
            }
        }
    ]
});

/* animations simples */

function fadeOut(element) {
    return new Promise(resolve => {
        element.style.transition = 'opacity 0.3s';
        element.style.opacity = '0';

        setTimeout(resolve, 300);
    });
}

function fadeIn(element) {
    element.style.opacity = '0';

    requestAnimationFrame(() => {
        element.style.transition = 'opacity 0.3s';
        element.style.opacity = '1';
    });
}