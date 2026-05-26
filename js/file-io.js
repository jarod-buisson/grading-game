/* =========================================================
   file-io.js — download and upload helpers + sessionStorage
   game-state persistence (for handoff between game.html
   and result.html / compare.html).
   ========================================================= */

(function (global) {
    'use strict';

    /* ---------- Session state ---------- */
    const SESSION_KEY = 'gradinggame.session';

    function saveSession(data) {
        const json = JSON.stringify(data);
        try {
            sessionStorage.setItem(SESSION_KEY, json);
            console.log('[session] saved · ' + (json.length / 1024).toFixed(1) + ' KB');
            return true;
        } catch (e) {
            console.error('[session] save failed ·', e.name, '·', e.message,
                          '· tried to write', (json.length / 1024).toFixed(1) + ' KB');
            // Quota fallback: drop the heaviest field (gradeDataUrl) and try again.
            // The result page will display "(image too large to display)" instead of
            // the user's grade, but the rest of the comparison still works.
            if (data && data.gradeDataUrl) {
                try {
                    const stripped = Object.assign({}, data, {
                        gradeDataUrl: null,
                        _gradeStripped: true
                    });
                    sessionStorage.setItem(SESSION_KEY, JSON.stringify(stripped));
                    console.warn('[session] saved without gradeDataUrl (over quota)');
                    return true;
                } catch (e2) {
                    console.error('[session] fallback save also failed:', e2.message);
                }
            }
            return false;
        }
    }

    function loadSession() {
        try {
            const raw = sessionStorage.getItem(SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function clearSession() {
        try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* noop */ }
    }

    /* ---------- Image read as data URL ---------- */
    function readImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    /* ---------- Image read + downscale + JPEG compress ----------
       Why: a typical 4-5 MB JPEG produces a ~6-7 MB base64 data URL,
       which overflows sessionStorage (5 MB cap in most browsers) and
       silently kills the saveSession() call. By rendering through a
       canvas we cap the longest edge to `maxDim` px and re-encode as
       JPEG at `quality`, dropping the typical payload to 200-800 KB
       — plenty of fidelity for the side-by-side comparison view. */
    function readImageDownscaled(file, maxDim = 1600, quality = 0.85) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                try {
                    const longestEdge = Math.max(img.naturalWidth, img.naturalHeight);
                    const scale = longestEdge > maxDim ? maxDim / longestEdge : 1;
                    const w = Math.max(1, Math.round(img.naturalWidth  * scale));
                    const h = Math.max(1, Math.round(img.naturalHeight * scale));
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    const dataUrl = canvas.toDataURL('image/jpeg', quality);
                    URL.revokeObjectURL(url);
                    console.log('[image] downscaled to', w + 'x' + h,
                                '·', (dataUrl.length / 1024).toFixed(1) + ' KB');
                    resolve(dataUrl);
                } catch (e) {
                    URL.revokeObjectURL(url);
                    reject(e);
                }
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('image load failed (corrupt or unsupported format?)'));
            };
            img.src = url;
        });
    }

    /* ---------- Trigger a download ----------
       Strategy: fetch the file as a Blob and download via
       `URL.createObjectURL`. This forces a true download regardless
       of how the server set the Content-Type (some browsers preview
       .tif and .rw2 inline if mime is `image/tiff`).
       Data URLs bypass the fetch and use a plain anchor click. */
    function downloadFile(url, filename) {
        if (!url) {
            console.warn('[download] no url provided');
            return;
        }
        const name = filename || url.split('/').pop().split('?')[0] || 'download';
        console.log('[download] start', url, '→', name);

        // data:/blob: URLs already in memory — anchor-click directly
        if (url.startsWith('data:') || url.startsWith('blob:')) {
            anchorClick(url, name);
            return;
        }

        // Network URLs — fetch as Blob then anchor-click that
        fetch(url, { cache: 'no-store' })
            .then(r => {
                if (!r.ok) throw new Error('http ' + r.status);
                return r.blob();
            })
            .then(blob => {
                const objUrl = URL.createObjectURL(blob);
                anchorClick(objUrl, name);
                setTimeout(() => URL.revokeObjectURL(objUrl), 8000);
                console.log('[download] blob download done ·', name, '·', formatSize(blob.size));
            })
            .catch(err => {
                console.warn('[download] blob fetch failed (', err.message, ') · falling back to anchor');
                anchorClick(url, name);
            });
    }

    function anchorClick(href, filename) {
        const a = document.createElement('a');
        a.href = href;
        a.download = filename;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    /* ---------- Format bytes ---------- */
    function formatSize(bytes) {
        if (!bytes && bytes !== 0) return '— mb';
        const mb = bytes / (1024 * 1024);
        if (mb < 0.1) return (bytes / 1024).toFixed(1) + ' kb';
        return mb.toFixed(1) + ' mb';
    }

    /* ---------- URL params ---------- */
    function getParams() {
        return new URLSearchParams(window.location.search);
    }

    global.FileIO = {
        saveSession, loadSession, clearSession,
        readImage, readImageDownscaled, downloadFile, formatSize, getParams
    };

})(window);
