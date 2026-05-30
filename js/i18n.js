/* =========================================================
   i18n.js — tiny client-side translation engine.

   Loads after js/i18n-dict.js (which puts the strings on
   window.GG_I18N_DICT). On DOM ready it walks the document
   looking for:

       <span data-i18n="key">…</span>
           → element.textContent = t(key)

       <input data-i18n-attr="placeholder:nick.placeholder, title:nick.label">
           → element.setAttribute(attr, t(key)) for each pair

       <p data-i18n-html="hero.callout">…</p>
           → element.innerHTML = t(key)   (use for strings containing markup)

   Language detection order:
     1. localStorage('gradinggame.lang')
     2. navigator.language (first 2 chars)
     3. 'en' (default)

   Public API exposed on window.gg_i18n:
     · t(key)              → translated string for current lang
     · getLang()           → current 2-letter code
     · setLang(code)       → persist + hard reload so everything refreshes
     · apply(root?)        → re-run the DOM swap inside root (defaults to document)
     · SUPPORTED           → ['en', 'fr', 'it', 'es']

   Loaded BEFORE chrome.js (which injects the language picker
   pill into the top-bar) and BEFORE the page's own scripts.
   ========================================================= */

(function (global) {
    'use strict';

    const STORAGE_KEY = 'gradinggame.lang';
    const DEFAULT_LANG = 'en';
    const SUPPORTED = ['en', 'fr', 'it', 'es'];

    function getLang() {
        /* Priority chain:
             1. ?lang=xx URL parameter (lets Google crawl per-language
                variants declared via hreflang in the page <head>; also
                handy for sharing direct deep-links in a given language)
             2. localStorage (user's previous choice via the picker)
             3. navigator.language (browser's UI language)
             4. 'en' default */
        try {
            const url = new URLSearchParams(window.location.search);
            const urlLang = (url.get('lang') || '').toLowerCase();
            if (urlLang && SUPPORTED.indexOf(urlLang) >= 0) {
                // Persist URL choice so navigating away keeps the language
                try { localStorage.setItem(STORAGE_KEY, urlLang); } catch (_) {}
                return urlLang;
            }
        } catch (_) {}

        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved && SUPPORTED.indexOf(saved) >= 0) return saved;
        } catch (_) {}

        const browser = (navigator.language || '').slice(0, 2).toLowerCase();
        if (SUPPORTED.indexOf(browser) >= 0) return browser;

        return DEFAULT_LANG;
    }

    function t(key, lang) {
        lang = lang || getLang();
        const dict = global.GG_I18N_DICT || {};
        const langDict = dict[lang] || {};
        const fallback = dict[DEFAULT_LANG] || {};
        // Resolve: current lang → english fallback → key itself (so missing
        // strings are visible in the UI instead of silently empty).
        if (key in langDict) return langDict[key];
        if (key in fallback) return fallback[key];
        return key;
    }

    function apply(root) {
        root = root || document;
        const lang = getLang();
        if (root === document) {
            document.documentElement.lang = lang;
        }

        root.querySelectorAll('[data-i18n]').forEach((el) => {
            el.textContent = t(el.dataset.i18n, lang);
        });

        root.querySelectorAll('[data-i18n-html]').forEach((el) => {
            el.innerHTML = t(el.dataset.i18nHtml, lang);
        });

        root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
            // Spec format: "attr1:key1, attr2:key2"
            (el.dataset.i18nAttr || '').split(',').forEach((pair) => {
                const idx = pair.indexOf(':');
                if (idx < 0) return;
                const attr = pair.slice(0, idx).trim();
                const key  = pair.slice(idx + 1).trim();
                if (attr && key) el.setAttribute(attr, t(key, lang));
            });
        });

        // Special-case: <title> can carry data-i18n too. Browsers don't
        // visually paint a "title" element, but the tab label needs the
        // textContent set, same as anything else — the querySelectorAll
        // above already handles it. Nothing extra to do.
    }

    function setLang(code) {
        if (SUPPORTED.indexOf(code) < 0) return;
        try { localStorage.setItem(STORAGE_KEY, code); } catch (_) {}
        // Hard reload — cheapest way to ensure every script re-evaluates
        // its strings (dynamic content like the welcome popup or
        // chrome-injected pills picks up the new lang on next boot).
        window.location.reload();
    }

    /* ---------- Boot ----------
       Apply translations as soon as the DOM is parsed so the user
       doesn't see a flash of English. We run on `DOMContentLoaded`
       rather than `load` to beat the visual paint. */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => apply(), { once: true });
    } else {
        apply();
    }

    global.gg_i18n = {
        t: t,
        apply: apply,
        getLang: getLang,
        setLang: setLang,
        SUPPORTED: SUPPORTED.slice()
    };

})(window);
