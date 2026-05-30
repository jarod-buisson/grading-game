/* =========================================================
   i18n-dict.js — translation strings for the visible UI.

   Phase 1 coverage:
     · Landing page (index.html) — wheel + mobile hero + nav cards + chrome
     · Rules page (about.html)   — eyebrow, title, intro, 5 rules
     · Welcome popup             — first-visit explainer
     · Chrome links              — info / legal pills + language picker

   English is the source / fallback. If a key is missing in fr/it/es,
   i18n.js falls back to the english string so we never show "key.path"
   in the UI.

   Brand "grading-game" is never translated. Numerals (01, 02…) and the
   version pill (v1.5.2) are not translated either.
   ========================================================= */

window.GG_I18N_DICT = {

    /* ============================================================ */
    en: {
        /* Wheel menu items + mobile nav cards */
        'wheel.solo':              'solo',
        'wheel.solo_desc':         'free training',
        'wheel.multi':             'multiplayer',
        'wheel.multi_desc':        'online lobby',
        'wheel.gallery':           'gallery',
        'wheel.gallery_desc':      'your collection',
        'wheel.contributors':      'contributors',
        'wheel.contributors_desc': 'project photographers',
        'wheel.rules':             'rules',
        'wheel.rules_desc':        'how to play',

        /* Landing — mobile hero */
        'hero.eyebrow':            'color grading · photo game',
        'hero.tagline_html':       'A photo color-grading game for photographers. Pick a flat <strong>RAW</strong> or scan, grade it in your favorite software (Lightroom, Capture One, DarkTable…), then compete with other photographers in timed rounds with anonymous voting.',
        'hero.callout_html':       'Edit on <strong>any device</strong> — Lightroom Mobile, Snapseed, VSCO, Polarr… download the source, develop your grade in your favorite app, then upload your JPEG. Works on phone, tablet and desktop alike.',

        /* Nickname input (landing) */
        'nick.label':              'nickname',
        'nick.placeholder':        'pick a nickname',
        'nick.hint_mobile':        'saved locally · used in multiplayer rooms',

        /* CTAs */
        'donate.label':            'donate',
        'signin.label':            'sign in',
        'back.menu':               '← back to menu',

        /* Chrome pills (top bar / mobile footer) */
        'chrome.info':             'info',
        'chrome.legal':            'legal',
        'chrome.info_title':       'Credits & patch notes',
        'chrome.legal_title':      'Terms · Privacy · Copyright',
        'chrome.lang_label':       'language',
        'online.label':            'online',

        /* Welcome popup */
        'welcome.eyebrow':         'welcome',
        'welcome.title':           'Color grading, the game',
        'welcome.lead':            'Real RAW files from real photographers. A timer. Develop your grade in your favorite app, upload your JPEG, see how it compares.',
        'welcome.step1_title':     'Download the source',
        'welcome.step1_body':      'A RAW or scan picked from the contributors pool.',
        'welcome.step2_title':     'Grade it your way',
        'welcome.step2_body':      'Lightroom, Capture One, Snapseed, VSCO — your call.',
        'welcome.step3_title':     'Upload your JPEG',
        'welcome.step3_body':      'Solo for training with a reference grade · Multi for anonymous voting.',
        'welcome.cta':             "let's go",
        'welcome.full_rules':      'read the full rules →',
        'welcome.close_aria':      'dismiss this introduction',

        /* Rules page (about.html) */
        'meta.title.home':         'grading-game — photo color-grading game',
        'meta.title.rules':        'rules · grading-game — how to play',
        'rules.eyebrow':           '05 · rules',
        'rules.title':             'How to play',
        'rules.intro1_html':       '<strong>grading-game</strong> is a photo color-grading game. You’re given an image — a RAW file, a negative scan, a flat export — and a time limit to develop it in the software of your choice before re-importing it into the round.',
        'rules.intro2':            'In multiplayer, every submission is then revealed anonymously. Each player rates the others’ grades (except their own). A winner is declared at the end.',
        'rules.rule1':             'A source image is picked at random and presented to every player.',
        'rules.rule2':             'Download the original (RAW / TIFF / DNG depending on the challenge).',
        'rules.rule3':             'Grade it however you like in the software you prefer — Lightroom, Capture One, DaVinci, Darktable…',
        'rules.rule4':             'Re-import your final JPEG before the timer runs out.',
        'rules.rule5':             'In multiplayer, vote on the other players’ anonymous submissions.'
    },

    /* ============================================================ */
    fr: {
        /* Wheel menu items + mobile nav cards */
        'wheel.solo':              'solo',
        'wheel.solo_desc':         'entraînement libre',
        'wheel.multi':             'multijoueur',
        'wheel.multi_desc':        'lobby en ligne',
        'wheel.gallery':           'galerie',
        'wheel.gallery_desc':      'votre collection',
        'wheel.contributors':      'contributeurs',
        'wheel.contributors_desc': 'photographes du projet',
        'wheel.rules':             'règles',
        'wheel.rules_desc':        'comment jouer',

        /* Landing — mobile hero */
        'hero.eyebrow':            'étalonnage couleur · jeu photo',
        'hero.tagline_html':       'Un jeu d’étalonnage couleur photo pour photographes. Choisissez un <strong>RAW</strong> brut ou un scan, étalonnez-le dans votre logiciel préféré (Lightroom, Capture One, DarkTable…), puis affrontez d’autres photographes en rounds chronométrés avec vote anonyme.',
        'hero.callout_html':       'Étalonnez sur <strong>n’importe quel appareil</strong> — Lightroom Mobile, Snapseed, VSCO, Polarr… téléchargez la source, développez votre grade dans votre app préférée, puis uploadez votre JPEG. Fonctionne sur téléphone, tablette et bureau.',

        /* Nickname input (landing) */
        'nick.label':              'pseudo',
        'nick.placeholder':        'choisissez un pseudo',
        'nick.hint_mobile':        'sauvegardé localement · utilisé dans les rooms multijoueur',

        /* CTAs */
        'donate.label':            'soutenir',
        'signin.label':            'connexion',
        'back.menu':               '← retour au menu',

        /* Chrome pills */
        'chrome.info':             'infos',
        'chrome.legal':            'mentions',
        'chrome.info_title':       'Crédits & notes de version',
        'chrome.legal_title':      'CGU · Vie privée · Copyright',
        'chrome.lang_label':       'langue',
        'online.label':            'en ligne',

        /* Welcome popup */
        'welcome.eyebrow':         'bienvenue',
        'welcome.title':           'L’étalonnage couleur, le jeu',
        'welcome.lead':            'Des vrais RAW de vrais photographes. Un chrono. Développez votre grade dans votre app préférée, uploadez votre JPEG, voyez comment il se compare.',
        'welcome.step1_title':     'Téléchargez la source',
        'welcome.step1_body':      'Un RAW ou un scan tiré du pool des contributeurs.',
        'welcome.step2_title':     'Étalonnez à votre façon',
        'welcome.step2_body':      'Lightroom, Capture One, Snapseed, VSCO — vous décidez.',
        'welcome.step3_title':     'Uploadez votre JPEG',
        'welcome.step3_body':      'Solo pour s’entraîner avec une référence · Multi pour le vote anonyme.',
        'welcome.cta':             'c’est parti',
        'welcome.full_rules':      'lire toutes les règles →',
        'welcome.close_aria':      'fermer cette introduction',

        /* Rules page */
        'meta.title.home':         'grading-game — jeu d’étalonnage couleur photo',
        'meta.title.rules':        'règles · grading-game — comment jouer',
        'rules.eyebrow':           '05 · règles',
        'rules.title':             'Comment jouer',
        'rules.intro1_html':       '<strong>grading-game</strong> est un jeu d’étalonnage couleur photo. On vous donne une image — un fichier RAW, un scan de négatif, un export plat — et une limite de temps pour la développer dans le logiciel de votre choix avant de la réimporter dans le round.',
        'rules.intro2':            'En multijoueur, chaque soumission est ensuite révélée anonymement. Chaque joueur note les grades des autres (sauf le sien). Un vainqueur est désigné à la fin.',
        'rules.rule1':             'Une image source est choisie au hasard et présentée à tous les joueurs.',
        'rules.rule2':             'Téléchargez l’original (RAW / TIFF / DNG selon le challenge).',
        'rules.rule3':             'Étalonnez-le comme vous voulez dans le logiciel de votre choix — Lightroom, Capture One, DaVinci, Darktable…',
        'rules.rule4':             'Réimportez votre JPEG final avant que le chrono ne se termine.',
        'rules.rule5':             'En multijoueur, votez sur les soumissions anonymes des autres joueurs.'
    },

    /* ============================================================ */
    it: {
        /* Wheel menu items + mobile nav cards */
        'wheel.solo':              'solo',
        'wheel.solo_desc':         'allenamento libero',
        'wheel.multi':             'multigiocatore',
        'wheel.multi_desc':        'lobby online',
        'wheel.gallery':           'galleria',
        'wheel.gallery_desc':      'la tua collezione',
        'wheel.contributors':      'contributori',
        'wheel.contributors_desc': 'fotografi del progetto',
        'wheel.rules':             'regole',
        'wheel.rules_desc':        'come si gioca',

        /* Landing — mobile hero */
        'hero.eyebrow':            'color grading · gioco fotografico',
        'hero.tagline_html':       'Un gioco di color grading fotografico per fotografi. Scegli un <strong>RAW</strong> piatto o una scansione, sviluppalo nel tuo software preferito (Lightroom, Capture One, DarkTable…), poi sfida altri fotografi in round a tempo con voto anonimo.',
        'hero.callout_html':       'Sviluppa su <strong>qualsiasi dispositivo</strong> — Lightroom Mobile, Snapseed, VSCO, Polarr… scarica la sorgente, sviluppa il tuo grade nell’app che preferisci, poi carica il tuo JPEG. Funziona su telefono, tablet e desktop.',

        /* Nickname input */
        'nick.label':              'nickname',
        'nick.placeholder':        'scegli un nickname',
        'nick.hint_mobile':        'salvato localmente · usato nelle stanze multigiocatore',

        /* CTAs */
        'donate.label':            'sostieni',
        'signin.label':            'accedi',
        'back.menu':               '← torna al menu',

        /* Chrome pills */
        'chrome.info':             'info',
        'chrome.legal':            'legale',
        'chrome.info_title':       'Crediti & note di versione',
        'chrome.legal_title':      'Termini · Privacy · Copyright',
        'chrome.lang_label':       'lingua',
        'online.label':            'online',

        /* Welcome popup */
        'welcome.eyebrow':         'benvenuto',
        'welcome.title':           'Il color grading, il gioco',
        'welcome.lead':            'Veri file RAW di veri fotografi. Un timer. Sviluppa il tuo grade nell’app che preferisci, carica il tuo JPEG, vedi come si confronta.',
        'welcome.step1_title':     'Scarica la sorgente',
        'welcome.step1_body':      'Un RAW o una scansione presa dal pool dei contributori.',
        'welcome.step2_title':     'Sviluppa a modo tuo',
        'welcome.step2_body':      'Lightroom, Capture One, Snapseed, VSCO — decidi tu.',
        'welcome.step3_title':     'Carica il tuo JPEG',
        'welcome.step3_body':      'Solo per allenarti con un grade di riferimento · Multi per il voto anonimo.',
        'welcome.cta':             'iniziamo',
        'welcome.full_rules':      'leggi tutte le regole →',
        'welcome.close_aria':      'chiudi questa introduzione',

        /* Rules page */
        'meta.title.home':         'grading-game — gioco di color grading fotografico',
        'meta.title.rules':        'regole · grading-game — come si gioca',
        'rules.eyebrow':           '05 · regole',
        'rules.title':             'Come si gioca',
        'rules.intro1_html':       '<strong>grading-game</strong> è un gioco di color grading fotografico. Ti viene data un’immagine — un file RAW, una scansione di negativo, un export piatto — e un limite di tempo per svilupparla nel software che preferisci prima di reimportarla nel round.',
        'rules.intro2':            'In multigiocatore, ogni soumissione viene poi rivelata in modo anonimo. Ogni giocatore vota i grade degli altri (tranne il proprio). Un vincitore viene proclamato alla fine.',
        'rules.rule1':             'Un’immagine sorgente viene scelta a caso e presentata a ogni giocatore.',
        'rules.rule2':             'Scarica l’originale (RAW / TIFF / DNG a seconda della sfida).',
        'rules.rule3':             'Sviluppalo come vuoi nel software che preferisci — Lightroom, Capture One, DaVinci, Darktable…',
        'rules.rule4':             'Reimporta il tuo JPEG finale prima che scada il timer.',
        'rules.rule5':             'In multigiocatore, vota sulle soumissioni anonime degli altri giocatori.'
    },

    /* ============================================================ */
    es: {
        /* Wheel menu items + mobile nav cards */
        'wheel.solo':              'solo',
        'wheel.solo_desc':         'entrenamiento libre',
        'wheel.multi':             'multijugador',
        'wheel.multi_desc':        'sala en línea',
        'wheel.gallery':           'galería',
        'wheel.gallery_desc':      'tu colección',
        'wheel.contributors':      'colaboradores',
        'wheel.contributors_desc': 'fotógrafos del proyecto',
        'wheel.rules':             'reglas',
        'wheel.rules_desc':        'cómo jugar',

        /* Landing — mobile hero */
        'hero.eyebrow':            'color grading · juego fotográfico',
        'hero.tagline_html':       'Un juego de color grading fotográfico para fotógrafos. Elige un <strong>RAW</strong> plano o un escaneo, revélalo en tu software favorito (Lightroom, Capture One, DarkTable…), y compite con otros fotógrafos en rondas cronometradas con voto anónimo.',
        'hero.callout_html':       'Revela en <strong>cualquier dispositivo</strong> — Lightroom Mobile, Snapseed, VSCO, Polarr… descarga la fuente, desarrolla tu grade en tu app favorita, y sube tu JPEG. Funciona en teléfono, tableta y escritorio.',

        /* Nickname input */
        'nick.label':              'apodo',
        'nick.placeholder':        'elige un apodo',
        'nick.hint_mobile':        'guardado localmente · usado en las salas multijugador',

        /* CTAs */
        'donate.label':            'donar',
        'signin.label':            'iniciar sesión',
        'back.menu':               '← volver al menú',

        /* Chrome pills */
        'chrome.info':             'info',
        'chrome.legal':            'legal',
        'chrome.info_title':       'Créditos & notas de versión',
        'chrome.legal_title':      'Términos · Privacidad · Copyright',
        'chrome.lang_label':       'idioma',
        'online.label':            'en línea',

        /* Welcome popup */
        'welcome.eyebrow':         'bienvenido',
        'welcome.title':           'El color grading, el juego',
        'welcome.lead':            'RAW reales de fotógrafos reales. Un cronómetro. Desarrolla tu grade en tu app favorita, sube tu JPEG, mira cómo se compara.',
        'welcome.step1_title':     'Descarga la fuente',
        'welcome.step1_body':      'Un RAW o escaneo elegido del pool de colaboradores.',
        'welcome.step2_title':     'Revélalo a tu manera',
        'welcome.step2_body':      'Lightroom, Capture One, Snapseed, VSCO — tú decides.',
        'welcome.step3_title':     'Sube tu JPEG',
        'welcome.step3_body':      'Solo para entrenar con un grade de referencia · Multi para el voto anónimo.',
        'welcome.cta':             'empecemos',
        'welcome.full_rules':      'leer todas las reglas →',
        'welcome.close_aria':      'cerrar esta introducción',

        /* Rules page */
        'meta.title.home':         'grading-game — juego de color grading fotográfico',
        'meta.title.rules':        'reglas · grading-game — cómo jugar',
        'rules.eyebrow':           '05 · reglas',
        'rules.title':             'Cómo jugar',
        'rules.intro1_html':       '<strong>grading-game</strong> es un juego de color grading fotográfico. Se te da una imagen — un archivo RAW, un escaneo de negativo, un export plano — y un límite de tiempo para revelarla en el software que elijas antes de reimportarla a la ronda.',
        'rules.intro2':            'En multijugador, cada envío se revela después de forma anónima. Cada jugador califica los grades de los demás (excepto el suyo). Un ganador se anuncia al final.',
        'rules.rule1':             'Una imagen fuente se elige al azar y se presenta a cada jugador.',
        'rules.rule2':             'Descarga el original (RAW / TIFF / DNG según el desafío).',
        'rules.rule3':             'Revélalo como quieras en el software que prefieras — Lightroom, Capture One, DaVinci, Darktable…',
        'rules.rule4':             'Reimporta tu JPEG final antes de que se acabe el cronómetro.',
        'rules.rule5':             'En multijugador, vota sobre los envíos anónimos de los demás jugadores.'
    }

};
