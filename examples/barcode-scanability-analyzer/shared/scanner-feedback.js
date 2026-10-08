/*
 * Shared "capture in progress" feedback for the Codepool demos.
 *
 * Why this exists: CaptureVisionRouter.capture() is a single-frame API and the
 * first call on a cold WASM engine can take a noticeable moment — long enough
 * that a click with no visual acknowledgement reads as "frozen" or "nothing
 * happened". Every demo therefore wraps its capture() calls in this so the user
 * gets feedback the instant they act, not when the promise settles.
 *
 * Design notes:
 *   - The overlay is created and styled from here, so a demo only needs a
 *     <script> tag plus one wrapper call. No markup changes.
 *   - It is pointer-events: none. A click-blocking overlay is exactly the kind
 *     of thing that silently swallows every later click (cf. the SDK licence
 *     mask), so this one can never do that. Use ScannerFeedback.isBusy() if a
 *     demo wants to guard against double submission.
 *   - The label never changes mid-flight: re-rendering text while the user is
 *     reading it is worse than showing a slightly stale one.
 */

(function () {
    'use strict';

    var MIN_VISIBLE_MS = 400;   // below this the pill only flickers, which reads as a glitch
    var STYLE_ID = 'dy-capture-feedback-style';
    var OVERLAY_ID = 'dy-capture-feedback';

    var root = null;
    var labelEl = null;
    var depth = 0;              // captures can overlap; only hide when all settle
    var shownAt = 0;
    var hideTimer = null;

    var CSS = [
        '#dy-capture-feedback{',
        '  position:fixed;inset:0;z-index:2147483000;display:none;',
        '  align-items:center;justify-content:center;',
        /* Never intercept input: this is feedback, not a modal. */
        '  pointer-events:none;',
        '}',
        '#dy-capture-feedback.dy-cf-on{display:flex}',
        /* Soft vignette so the "busy" state is legible over a bright camera frame
           without hiding what the camera sees. */
        '#dy-capture-feedback::before{',
        '  content:"";position:absolute;inset:0;',
        '  background:radial-gradient(ellipse at center,rgba(50,50,52,.30) 0%,rgba(50,50,52,.12) 45%,rgba(50,50,52,0) 75%);',
        '}',
        '.dy-cf-pill{',
        '  position:relative;display:flex;align-items:center;gap:10px;',
        '  padding:11px 20px;border-radius:999px;',
        '  background:rgba(50,50,52,.90);',
        '  box-shadow:0 8px 28px rgba(0,0,0,.35),0 0 0 1px rgba(255,255,255,.10) inset;',
        '  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);',
        '  font-family:"Open Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
        '  font-size:14px;font-weight:600;letter-spacing:.01em;color:#fff;',
        '  white-space:nowrap;',
        '}',
        /* One-shot expanding halo: the immediate "your click landed" cue. */
        '.dy-cf-halo{',
        '  position:absolute;left:50%;top:50%;width:100%;height:100%;',
        '  margin:0;border-radius:999px;border:2px solid #FE8E14;',
        '  transform:translate(-50%,-50%);opacity:0;',
        '  animation:dy-cf-halo .9s cubic-bezier(.22,.61,.36,1) 1;',
        '}',
        '@keyframes dy-cf-halo{',
        '  0%{transform:translate(-50%,-50%) scale(1);opacity:.85}',
        '  100%{transform:translate(-50%,-50%) scale(2.05);opacity:0}',
        '}',
        '.dy-cf-spinner{',
        '  flex:0 0 auto;width:17px;height:17px;border-radius:50%;',
        '  border:2px solid rgba(255,255,255,.22);',
        '  border-top-color:#FE8E14;',
        '  animation:dy-cf-spin .7s linear infinite;',
        '}',
        '@keyframes dy-cf-spin{to{transform:rotate(360deg)}}',
        '@media (prefers-reduced-motion:reduce){',
        '  .dy-cf-spinner{animation-duration:2.4s}',
        '  .dy-cf-halo{animation:none}',
        '}',
        '@media (max-width:480px){',
        '  .dy-cf-pill{font-size:13px;padding:10px 16px;gap:8px}',
        '  .dy-cf-spinner{width:15px;height:15px}',
        '}'
    ].join('\n');

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        (document.head || document.documentElement).appendChild(style);
    }

    function ensureRoot() {
        if (root && document.body.contains(root)) {
            return root;
        }
        injectStyle();

        root = document.createElement('div');
        root.id = OVERLAY_ID;
        /* Announce the wait to screen readers without stealing focus. */
        root.setAttribute('role', 'status');
        root.setAttribute('aria-live', 'polite');

        var pill = document.createElement('div');
        pill.className = 'dy-cf-pill';

        var halo = document.createElement('span');
        halo.className = 'dy-cf-halo';

        var spinner = document.createElement('span');
        spinner.className = 'dy-cf-spinner';

        labelEl = document.createElement('span');
        labelEl.className = 'dy-cf-label';

        pill.appendChild(halo);
        pill.appendChild(spinner);
        pill.appendChild(labelEl);
        root.appendChild(pill);
        (document.body || document.documentElement).appendChild(root);
        return root;
    }

    /* Restart the halo so every capture gets its own pulse, not just the first. */
    function replayHalo() {
        var halo = root.querySelector('.dy-cf-halo');
        if (!halo) {
            return;
        }
        halo.style.animation = 'none';
        void halo.offsetWidth;          // force reflow so the animation restarts
        halo.style.animation = '';
    }

    function begin(label) {
        ensureRoot();
        depth += 1;
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }
        labelEl.textContent = label || 'Scanning…';
        root.classList.add('dy-cf-on');
        shownAt = (window.performance && performance.now) ? performance.now() : Date.now();
        replayHalo();
    }

    function end() {
        depth = Math.max(0, depth - 1);
        if (depth > 0 || !root) {
            return;
        }
        var now = (window.performance && performance.now) ? performance.now() : Date.now();
        var remaining = MIN_VISIBLE_MS - (now - shownAt);
        hideTimer = setTimeout(function () {
            hideTimer = null;
            if (depth === 0 && root) {
                root.classList.remove('dy-cf-on');
            }
        }, remaining > 0 ? remaining : 0);
    }

    /*
     * Wrap a capture. `factory` may be a function returning a promise (preferred
     * — the work starts after the overlay paints) or an already-started promise.
     */
    function run(label, factory) {
        begin(label);
        var result;
        try {
            result = (typeof factory === 'function') ? factory() : factory;
        } catch (err) {
            end();
            throw err;
        }
        return Promise.resolve(result).then(function (value) {
            end();
            return value;
        }, function (err) {
            end();
            throw err;
        });
    }

    window.ScannerFeedback = {
        begin: begin,
        end: end,
        run: run,
        isBusy: function () { return depth > 0; }
    };
})();
