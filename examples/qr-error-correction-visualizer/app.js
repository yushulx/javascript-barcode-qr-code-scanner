/*
 * QR Error Correction Visualizer — application logic.
 *
 * Three ideas, in order of importance:
 *
 *   1. The symbol is built by qr-encoder.js (vendored from the Barcode
 *      Structure Diagram), which exposes the interleaved codeword index
 *      behind every module (`placement`) and the Reed-Solomon block split
 *      (`blocks`). That is what makes the budget meter exact rather than a
 *      guess: a module is damaged, its codeword is corrupted, the block that
 *      owns that codeword spends one of its ⌊EC/2⌋ repairs.
 *
 *   2. Damage comes in two independent layers. Module damage (paint, finder /
 *      timing / format targeting, seeded random) edits the symbol itself and
 *      is counted exactly. Capture defects (noise, blur, contrast, occlusion,
 *      crop, shadow, rotation) are rendered onto the finished canvas the way
 *      a camera would have seen it, and are estimated by sampling each
 *      module's centre pixel.
 *
 *   3. Decoding uses Dynamsoft Barcode Reader on the clean render plus damage
 *      — never the structure colours, which are an annotation layer. The
 *      reader loads lazily, so the page works without it and the first decode
 *      pays the engine cost.
 *
 * Everything runs in the browser; the payload and the damaged image stay here.
 */
(function () {
    'use strict';

    /* ------------------------------------------------------------------ *
     * Shared helpers. Both are optional: the Codepool pages load them from
     * demos/shared/, the standalone copy runs without them.
     * ------------------------------------------------------------------ */
    function noop() { }
    var analytics = window.DemoAnalytics || {
        ready: noop, error: noop, start: noop, success: noop, fail: noop,
        action: noop, trialClick: noop
    };
    var feedback = window.ScannerFeedback || {
        run: function (label, factory) { return factory(); },
        isBusy: function () { return false; }
    };

    function $(id) { return document.getElementById(id); }

    /* Every element the app touches, captured once. A missing id is a bug,
       and the page should say so instead of failing silently later. */
    var els = {
        payload: $('payload'), version: $('version'), versionError: $('version-error'),
        symbolNote: $('symbol-note'),
        print: $('qr-canvas'), overlay: $('qr-overlay'), stage: $('qr-stage'),
        stageHint: $('stage-hint'),
        structureToggle: $('structure-toggle'), codewordInfo: $('codeword-info'),
        facts: $('facts'), ecBars: $('ec-bars'), exportBtn: $('export-btn'),
        brushSizes: $('brush-sizes'),
        btnFinder: $('btn-finder'), btnTiming: $('btn-timing'), btnFormat: $('btn-format'),
        randomRange: $('random-range'), randomValue: $('random-value'), btnRandom: $('btn-random'),
        pixelPreset: $('pixel-preset'), pixelAmount: $('pixel-amount'), pixelAmountValue: $('pixel-amount-value'),
        btnClear: $('btn-clear'),
        damagePct: $('damage-pct'), budgetText: $('budget-text'), budgetBars: $('budget-bars'),
        functionWarn: $('function-warn'),
        decodeAuto: $('decode-auto'), decodeStatus: $('decode-status'),
        btnDecode: $('btn-decode'), btnSweep: $('btn-sweep'),
        logTbody: $('log-tbody'), logEmpty: $('log-empty'),
        toast: $('toast')
    };

    /* ------------------------------------------------------------------ *
     * License and reader engine (same host-based split as the other demos)
     * ------------------------------------------------------------------ */
    var CODEPOOL_LICENSE_KEY = 'DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAwLTEwMTY0ODQ5MCIsIm1haW5TZXJ2ZXJVUkwiOiJodHRwczovL21sdHMuZHluYW1zb2Z0LmNvbS8iLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMCIsInN0YW5kYnlTZXJ2ZXJVUkwiOiJodHRwczovL3NsdHMuZHluYW1zb2Z0LmNvbS8iLCJjaGVja0NvZGUiOjE0MDA4MDY1Mjl9';
    var TRIAL_LICENSE_KEY = 'DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==';
    var SDK_VERSION = '11.6.3200';

    var router = null;
    var enginePromise = null;
    var sdkPromise = null;

    function loadReader() {
        if (window.Dynamsoft) return Promise.resolve();
        if (sdkPromise) return sdkPromise;
        var script = document.createElement('script');
        sdkPromise = new Promise(function (resolve, reject) {
            script.async = true;
            script.src = 'https://cdn.jsdelivr.net/npm/dynamsoft-barcode-reader-bundle@' + SDK_VERSION + '/dist/dbr.bundle.js';
            script.onload = function () { window.Dynamsoft ? resolve() : reject(new Error('Barcode Reader did not initialize.')); };
            script.onerror = function () { reject(new Error('Barcode Reader could not load. Check your network and retry.')); };
            document.head.appendChild(script);
        }).catch(function (e) {
            script.remove();
            sdkPromise = null;
            throw e;
        });
        return sdkPromise;
    }

    function engine() {
        if (enginePromise) return enginePromise;
        enginePromise = (async function () {
            await loadReader();
            if (!window.isSecureContext) {
                throw new Error('Use HTTPS or localhost so the SDK can activate its trial license.');
            }
            var host = location.hostname.toLowerCase();
            var bound = host === 'dynamsoft.com' || host.endsWith('.dynamsoft.com');
            var custom = null;
            try {
                custom = new URLSearchParams(location.search).get('license')
                    || localStorage.getItem('dy-demo-license');
            } catch (_) { }
            var key = custom || (bound ? CODEPOOL_LICENSE_KEY : TRIAL_LICENSE_KEY);
            if (!bound && !custom) {
                analytics.action('license_fallback', { host: host, secure: window.isSecureContext });
            }
            var startedAt = performance.now();
            Dynamsoft.Core.CoreModule.engineResourcePaths.rootDirectory = 'https://cdn.jsdelivr.net/npm/';
            await Dynamsoft.License.LicenseManager.initLicense(key, true);
            await Dynamsoft.Core.CoreModule.loadWasm(['DBR']);
            router = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();
            analytics.ready(performance.now() - startedAt);
            return router;
        })().catch(function (e) {
            enginePromise = null;
            analytics.error((e && e.errorCode) || -1, 'qr_ec_engine_initialization_failed');
            throw e;
        });
        return enginePromise;
    }

    /* ------------------------------------------------------------------ *
     * State
     * ------------------------------------------------------------------ */
    var QUIET = 4;          /* quiet zone, in modules */
    var MODULE_PX = 10;     /* px per module on the print canvas */
    var MAX_VERSION = 10;   /* the version dropdown tops out here */
    var EC_LEVELS = ['L', 'M', 'Q', 'H'];

    var state = {
        text: 'https://www.dynamsoft.com/codepool/',
        ecLevel: 'M',
        version: 'auto',          /* 'auto' or 1..MAX_VERSION */
        encoded: null,            /* BarcodeQR.encode() result */
        structure: null,          /* BarcodeQR.blockStructure() result */
        dataCells: [],            /* [r, c] cells that carry codeword bits */
        damaged: {},              /* 'r,c' -> 0|1, the value the damaged module renders as */
        damageSeed: 1,
        finderCovered: 0,         /* 0..3 */
        timingMode: 'none',       /* none | row | col | both */
        formatMode: 'none',       /* none | copy1 | copy2 | both */
        brushSize: 1,
        pixelPreset: 'none',
        pixelAmount: 40,
        sweeping: false,
        estimate: null            /* corruption estimate while a capture defect is active */
    };

    var autoDecodeTimer = null;

    /* ------------------------------------------------------------------ *
     * Small utilities
     * ------------------------------------------------------------------ */
    function mulberry32(seed) {
        var a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            var t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function key(r, c) { return r + ',' + c; }

    function parseKey(k) {
        var parts = k.split(',');
        return { r: Number(parts[0]), c: Number(parts[1]) };
    }

    function damagedBit(r, c) {
        /* A stable pseudo-random value per cell: the same cell always renders
           the same way, so re-renders and re-decodes are reproducible. */
        var h = (r * 73856093) ^ (c * 19349663) ^ (state.damageSeed * 83492791);
        h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
        return (h >>> 16) & 1;
    }

    function shorten(text, max) {
        max = max || 40;
        return text.length > max ? text.slice(0, max - 1) + '…' : text;
    }

    var toastTimer = null;
    function toast(message) {
        els.toast.textContent = message;
        els.toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { els.toast.classList.remove('show'); }, 2200);
    }

    /* ------------------------------------------------------------------ *
     * Encoding
     * ------------------------------------------------------------------ */
    function encodeCurrent() {
        var text = els.payload.value.replace(/^\s+|\s+$/g, '');
        state.text = text;

        if (!text) {
            showVersionError('Type a payload first — an empty QR code has nothing to correct.');
            return false;
        }

        var opts = { ecLevel: state.ecLevel, mode: 'auto' };
        if (state.version !== 'auto') opts.version = state.version;

        try {
            var encoded = window.BarcodeQR.encode(text, opts);
            state.encoded = encoded;
            state.structure = window.BarcodeQR.blockStructure(encoded.version, encoded.ecLevel);
            state.dataCells = [];
            for (var r = 0; r < encoded.size; r++) {
                for (var c = 0; c < encoded.size; c++) {
                    if (!encoded.functionMask[r][c] && encoded.placement[r][c] !== null) {
                        state.dataCells.push([r, c]);
                    }
                }
            }
            showVersionError(null);
            /* A new matrix invalidates module damage: coordinates belong to the
               old symbol. Capture defects are render-level and survive. */
            clearDamage(false);
            return true;
        } catch (e) {
            var message = (e && e.message) || String(e);
            if (/version/i.test(message)) {
                showVersionError(message + ' Pick a larger version, a lower level, or a shorter payload.');
            } else {
                showVersionError(message);
            }
            return false;
        }
    }

    function showVersionError(message) {
        if (message) {
            els.versionError.textContent = message;
            els.versionError.hidden = false;
        } else {
            els.versionError.hidden = true;
            els.versionError.textContent = '';
        }
    }

    /* ------------------------------------------------------------------ *
     * Rendering — print canvas (what gets decoded and exported)
     * ------------------------------------------------------------------ */
    function renderSymbol() {
        var enc = state.encoded;
        if (!enc) return;
        var total = enc.size + QUIET * 2;
        var W = total * MODULE_PX;
        if (els.print.width !== W) {
            els.print.width = W;
            els.print.height = W;
        }
        var ctx = els.print.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, W);

        var damaged = state.damaged;
        for (var r = 0; r < enc.size; r++) {
            for (var c = 0; c < enc.size; c++) {
                var k = key(r, c);
                var value = Object.prototype.hasOwnProperty.call(damaged, k)
                    ? damaged[k]
                    : enc.matrix[r][c];
                ctx.fillStyle = value ? '#000000' : '#ffffff';
                ctx.fillRect((c + QUIET) * MODULE_PX, (r + QUIET) * MODULE_PX, MODULE_PX, MODULE_PX);
            }
        }

        applyPixelDefect(ctx, W);
    }

    /* The capture defects. One active at a time, all seeded, so the same
       settings always produce the same damaged render. */
    function applyPixelDefect(ctx, W) {
        var preset = state.pixelPreset;
        if (preset === 'none') { state.estimate = null; return; }
        var amount = state.pixelAmount / 100;
        var rand = mulberry32(0x9e3779b9 ^ (preset.length * 2654435761) ^ Math.round(amount * 1000));

        if (preset === 'noise' || preset === 'contrast') {
            var image = ctx.getImageData(0, 0, W, W);
            var data = image.data;
            for (var i = 0; i < data.length; i += 4) {
                if (preset === 'noise') {
                    var n = (rand() - 0.5) * 2 * amount * 170;
                    data[i] = clamp(data[i] + n);
                    data[i + 1] = clamp(data[i + 1] + n);
                    data[i + 2] = clamp(data[i + 2] + n);
                } else {
                    /* Low contrast: pull every channel toward mid grey. */
                    data[i] = clamp(data[i] + (128 - data[i]) * amount * 0.85);
                    data[i + 1] = clamp(data[i + 1] + (128 - data[i + 1]) * amount * 0.85);
                    data[i + 2] = clamp(data[i + 2] + (128 - data[i + 2]) * amount * 0.85);
                }
            }
            ctx.putImageData(image, 0, 0);
            return;
        }

        if (preset === 'blur') {
            var temp = document.createElement('canvas');
            temp.width = W; temp.height = W;
            var tctx = temp.getContext('2d');
            if (typeof tctx.filter === 'string') {
                tctx.filter = 'blur(' + (amount * 6).toFixed(2) + 'px)';
            }
            tctx.drawImage(els.print, 0, 0);
            ctx.clearRect(0, 0, W, W);
            ctx.drawImage(temp, 0, 0);
            return;
        }

        if (preset === 'occlusion') {
            var blocks = 1 + Math.floor(amount * 3);
            ctx.fillStyle = '#111111';
            for (var b = 0; b < blocks; b++) {
                var bw = W * (0.1 + rand() * 0.14);
                var bh = W * (0.1 + rand() * 0.14);
                var bx = rand() * (W - bw);
                var by = rand() * (W - bh);
                ctx.fillRect(bx, by, bw, bh);
            }
            return;
        }

        if (preset === 'crop') {
            /* Partly out of frame: keep the middle (1 - amount*0.55) of the
               symbol and scale it back up, the way a tight viewfinder crops. */
            var keep = 1 - amount * 0.55;
            var sw = W * keep, sh = W * keep;
            var sx = (W - sw) / 2, sy = (W - sh) / 2;
            var snap = document.createElement('canvas');
            snap.width = W; snap.height = W;
            snap.getContext('2d').drawImage(els.print, sx, sy, sw, sh, 0, 0, W, W);
            ctx.clearRect(0, 0, W, W);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, W);
            ctx.drawImage(snap, 0, 0);
            return;
        }

        if (preset === 'shadow') {
            var gradient = ctx.createLinearGradient(0, 0, W, 0);
            var alpha = amount * 0.55;
            gradient.addColorStop(0, 'rgba(0,0,0,' + alpha.toFixed(3) + ')');
            gradient.addColorStop(0.45, 'rgba(0,0,0,' + (alpha * 0.35).toFixed(3) + ')');
            gradient.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, W, W);
            return;
        }

        if (preset === 'rotate') {
            var angle = (amount - 0.5) * 0.5; /* ±0.25 rad ≈ ±14° */
            var spun = document.createElement('canvas');
            spun.width = W; spun.height = W;
            var sctx = spun.getContext('2d');
            sctx.translate(W / 2, W / 2);
            sctx.rotate(angle);
            sctx.drawImage(els.print, -W / 2, -W / 2);
            ctx.clearRect(0, 0, W, W);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, W);
            ctx.drawImage(spun, 0, 0);
            return;
        }
    }

    function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

    /* ------------------------------------------------------------------ *
     * Rendering — structure overlay (annotation layer, never decoded)
     * ------------------------------------------------------------------ */
    function renderOverlay() {
        var enc = state.encoded;
        if (!enc) return;
        var total = enc.size + QUIET * 2;
        var W = total * MODULE_PX;
        if (els.overlay.width !== W) {
            els.overlay.width = W;
            els.overlay.height = W;
        }
        var ctx = els.overlay.getContext('2d');
        ctx.clearRect(0, 0, W, W);
        if (!els.structureToggle.checked) return;

        var kinds = [];
        for (var i = 0; i < enc.components.length; i++) kinds.push(enc.components[i].kind);

        var M = MODULE_PX;
        for (var r = 0; r < enc.size; r++) {
            for (var c = 0; c < enc.size; c++) {
                var k = key(r, c);
                var fill = null;
                if (Object.prototype.hasOwnProperty.call(state.damaged, k)) {
                    fill = 'rgba(180,35,24,0.20)';
                } else {
                    var comp = enc.moduleColors[r][c];
                    var kind = comp >= 0 ? kinds[comp] : null;
                    if (kind === 'ec') fill = 'rgba(254,142,20,0.18)';
                    else if (kind === 'data') fill = null;
                    else fill = 'rgba(48,104,119,0.14)';
                }
                if (fill) {
                    ctx.fillStyle = fill;
                    ctx.fillRect((c + QUIET) * M, (r + QUIET) * M, M, M);
                }
            }
        }
        /* A hairline around parity codeword cells keeps the two data roles
           distinguishable when a module is zoomed out. */
        ctx.strokeStyle = 'rgba(254,142,20,0.45)';
        ctx.lineWidth = 1;
        for (var r2 = 0; r2 < enc.size; r2++) {
            for (var c2 = 0; c2 < enc.size; c2++) {
                var comp2 = enc.moduleColors[r2][c2];
                if (comp2 >= 0 && kinds[comp2] === 'ec') {
                    ctx.strokeRect((c2 + QUIET) * M + 0.5, (r2 + QUIET) * M + 0.5, M - 1, M - 1);
                }
            }
        }
    }

    /* ------------------------------------------------------------------ *
     * Facts and EC comparison
     * ------------------------------------------------------------------ */
    function renderFacts() {
        var enc = state.encoded;
        if (!enc) return;
        var st = state.structure;
        var blocksNote;
        if (st.numBlocks === 1) {
            blocksNote = '1 block · ' + st.dataCodewords + ' data + ' + st.ecPerBlock + ' parity';
        } else if (st.numShort === st.numBlocks) {
            blocksNote = st.numBlocks + ' blocks · ' + st.shortLength + ' data + ' + st.ecPerBlock + ' parity each';
        } else {
            blocksNote = st.numBlocks + ' blocks · ' + st.numShort + '×' + st.shortLength
                + ' + ' + (st.numBlocks - st.numShort) + '×' + (st.shortLength + 1)
                + ' data, ' + st.ecPerBlock + ' parity each';
        }
        var used = new TextEncoder().encode(state.text).length;

        var rows = [
            ['Version', enc.version + (state.version === 'auto' ? ' (auto)' : ' (pinned)')],
            ['Size', enc.size + ' × ' + enc.size + ' modules'],
            ['Mode', enc.mode],
            ['Mask', enc.mask + ' — ' + enc.maskFormula],
            ['Data codewords', enc.dataCodewords + ' (' + used + ' of ' + enc.summary.dataCapacityBytes + ' bytes used)'],
            ['Parity codewords', enc.ecCodewords + ' — ' + enc.summary.errorCorrectionPercent + '% of the symbol'],
            ['Blocks', blocksNote]
        ];
        var html = '';
        for (var i = 0; i < rows.length; i++) {
            html += '<dt>' + escapeHtml(rows[i][0]) + '</dt><dd>' + escapeHtml(String(rows[i][1])) + '</dd>';
        }
        els.facts.innerHTML = html;
        els.symbolNote.textContent = 'Version ' + enc.version + ' · ' + enc.size + '×' + enc.size
            + ' · level ' + enc.ecLevel + ' · mask ' + enc.mask;
    }

    function escapeHtml(text) {
        return text.replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    function renderEcBars() {
        var version = state.encoded ? state.encoded.version : 1;
        var maxEc = 0;
        var data = EC_LEVELS.map(function (level) {
            var st = window.BarcodeQR.blockStructure(version, level);
            var correctable = st.numBlocks * Math.floor(st.ecPerBlock / 2);
            maxEc = Math.max(maxEc, st.ecCodewords);
            return { level: level, ec: st.ecCodewords, correctable: correctable };
        });
        els.ecBars.innerHTML = '';
        data.forEach(function (row) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'ec-bar-row';
            button.setAttribute('aria-current', String(row.level === state.ecLevel));
            button.innerHTML = '<span class="ec-bar-level">' + row.level + '</span>'
                + '<span class="ec-bar-track"><span class="ec-bar-fill" style="width:'
                + (row.ec / maxEc * 100).toFixed(1) + '%"></span></span>'
                + '<span class="ec-bar-note">' + row.ec + ' parity · repairs ' + row.correctable + '</span>';
            button.addEventListener('click', function () { setEcLevel(row.level); });
            els.ecBars.appendChild(button);
        });
    }

    /* ------------------------------------------------------------------ *
     * Damage model
     * ------------------------------------------------------------------ */
    function componentCells(id) {
        var enc = state.encoded;
        if (!enc) return [];
        for (var i = 0; i < enc.components.length; i++) {
            if (enc.components[i].id === id) return enc.components[i].cells;
        }
        return [];
    }

    function addDamage(r, c) {
        var k = key(r, c);
        if (Object.prototype.hasOwnProperty.call(state.damaged, k)) return;
        state.damaged[k] = damagedBit(r, c);
        state.damageSeed = (state.damageSeed + 1) >>> 0;
    }

    function paintBrush(r, c) {
        var size = state.brushSize;
        var half = Math.floor((size - 1) / 2);
        for (var dr = -half; dr <= half + ((size - 1) % 2); dr++) {
            for (var dc = -half; dc <= half + ((size - 1) % 2); dc++) {
                var rr = r + dr, cc = c + dc;
                if (rr < 0 || cc < 0 || rr >= state.encoded.size || cc >= state.encoded.size) continue;
                addDamage(rr, cc);
            }
        }
    }

    function applyFinderCover(count) {
        state.finderCovered = count;
        var ids = ['finder-tl', 'finder-tr', 'finder-bl'];
        for (var i = 0; i < count; i++) {
            componentCells(ids[i]).forEach(function (cell) { addDamage(cell[0], cell[1]); });
        }
        els.btnFinder.textContent = count === 0
            ? 'Cover finder patterns'
            : 'Cover finder patterns (' + count + '/3) — click to ' + (count === 3 ? 'clear' : 'add');
    }

    function applyTiming(mode) {
        state.timingMode = mode;
        if (mode === 'row' || mode === 'both') {
            componentCells('timing-row').forEach(function (cell) { addDamage(cell[0], cell[1]); });
        }
        if (mode === 'col' || mode === 'both') {
            componentCells('timing-col').forEach(function (cell) { addDamage(cell[0], cell[1]); });
        }
        var label = { none: '', row: 'row 6', col: 'column 6', both: 'row + column' }[mode];
        els.btnTiming.textContent = mode === 'none'
            ? 'Damage timing patterns'
            : 'Damage timing patterns (' + label + ') — click to cycle';
    }

    function applyFormat(mode) {
        state.formatMode = mode;
        if (mode === 'copy1' || mode === 'both') {
            componentCells('format-1').forEach(function (cell) { addDamage(cell[0], cell[1]); });
        }
        if (mode === 'copy2' || mode === 'both') {
            componentCells('format-2').forEach(function (cell) { addDamage(cell[0], cell[1]); });
        }
        var label = { none: '', copy1: 'copy 1', copy2: 'copy 2', both: 'both copies' }[mode];
        els.btnFormat.textContent = mode === 'none'
            ? 'Damage format info'
            : 'Damage format info (' + label + ') — click to cycle';
    }

    function applyRandomDamage(pct, seed) {
        var cells = state.dataCells;
        if (!cells.length || pct <= 0) return 0;
        var count = Math.round(cells.length * pct / 100);
        count = Math.max(1, Math.min(cells.length, count));
        var rand = mulberry32(seed);
        /* Partial Fisher-Yates: pick `count` distinct cells without a full shuffle. */
        var pool = cells.slice();
        for (var i = 0; i < count; i++) {
            var j = i + Math.floor(rand() * (pool.length - i));
            var tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
            addDamage(pool[i][0], pool[i][1]);
        }
        return count;
    }

    function clearDamage(rerender) {
        state.damaged = {};
        state.damageSeed = (state.damageSeed + 1) >>> 0;
        state.finderCovered = 0;
        state.timingMode = 'none';
        state.formatMode = 'none';
        state.estimate = null;
        applyFinderCover(0);
        applyTiming('none');
        applyFormat('none');
        if (rerender !== false) {
            renderSymbol();
            renderOverlay();
            renderMeter();
        }
    }

    /* ------------------------------------------------------------------ *
     * Budget meter — exact for module damage, estimated for capture defects
     * ------------------------------------------------------------------ */
    function codewordBlock(p, st) {
        if (p < st.dataCodewords) {
            if (p < st.shortLength * st.numBlocks) return p % st.numBlocks;
            return st.numShort + (p - st.shortLength * st.numBlocks);
        }
        return (p - st.dataCodewords) % st.numBlocks;
    }

    function countCorruption() {
        var enc = state.encoded;
        var st = state.structure;
        var total = enc.size * enc.size;
        var corrupted = {};       /* codeword index -> true */
        var damagedCount = 0;
        var functionCount = 0;

        if (state.pixelPreset !== 'none') {
            /* Estimate from the render: a module counts as corrupted when its
               centre pixel disagrees with the value the symbol intends. */
            var W = els.print.width;
            var ctx = els.print.getContext('2d');
            var image = ctx.getImageData(0, 0, W, W);
            var data = image.data;
            var M = MODULE_PX;
            for (var r = 0; r < enc.size; r++) {
                for (var c = 0; c < enc.size; c++) {
                    var px = Math.round((c + QUIET + 0.5) * M);
                    var py = Math.round((r + QUIET + 0.5) * M);
                    /* Average a 3x3 block around the module centre: a single
                       pixel is too jumpy under noise to mean anything. */
                    var sum = 0;
                    for (var dy = -1; dy <= 1; dy++) {
                        for (var dx = -1; dx <= 1; dx++) {
                            var p = ((py + dy) * W + (px + dx)) * 4;
                            sum += (data[p] + data[p + 1] + data[p + 2]) / 3;
                        }
                    }
                    var brightness = sum / 9;
                    var intended = enc.matrix[r][c];
                    var looksDark = brightness < 140;
                    if (looksDark !== (intended === 1)) {
                        damagedCount++;
                        var cw = enc.placement[r][c];
                        if (cw !== null) corrupted[cw] = true;
                        else functionCount++;
                    }
                }
            }
            return {
                estimated: true, total: total, damagedCount: damagedCount, functionCount: functionCount,
                corrupted: corrupted, perBlock: perBlockCounts(corrupted, st)
            };
        }

        var damaged = state.damaged;
        for (var k in damaged) {
            if (!Object.prototype.hasOwnProperty.call(damaged, k)) continue;
            var cell = parseKey(k);
            damagedCount++;
            var cwIndex = enc.placement[cell.r][cell.c];
            if (cwIndex !== null) corrupted[cwIndex] = true;
            else functionCount++;
        }
        return {
            estimated: false, total: total, damagedCount: damagedCount, functionCount: functionCount,
            corrupted: corrupted, perBlock: perBlockCounts(corrupted, st)
        };
    }

    function perBlockCounts(corrupted, st) {
        var perBlock = new Array(st.numBlocks).fill(0);
        for (var p in corrupted) {
            if (!Object.prototype.hasOwnProperty.call(corrupted, p)) continue;
            perBlock[codewordBlock(Number(p), st)]++;
        }
        return perBlock;
    }

    function renderMeter() {
        var enc = state.encoded;
        if (!enc) return;
        var st = state.structure;
        var info = countCorruption();
        state.estimate = info.estimated ? info : null;

        var pct = info.total ? (info.damagedCount / info.total * 100) : 0;
        els.damagePct.textContent = pct.toFixed(1);

        var corruptedTotal = 0;
        var budgetTotal = 0;
        var overBudget = false;
        var html = '';
        for (var b = 0; b < st.numBlocks; b++) {
            var budget = Math.floor(st.ecPerBlock / 2);
            var used = info.perBlock[b];
            corruptedTotal += used;
            budgetTotal += budget;
            if (used > budget) overBudget = true;
            var width = Math.min(100, used / Math.max(1, st.ecPerBlock) * 100);
            html += '<div class="budget-row' + (used > budget ? ' over' : '') + '">'
                + '<span class="budget-label">Block ' + (b + 1) + '</span>'
                + '<span class="budget-track"><span class="budget-fill" style="width:' + width.toFixed(1) + '%"></span>'
                + '<span class="budget-cap" style="left:' + (budget / Math.max(1, st.ecPerBlock) * 100).toFixed(1) + '%"></span></span>'
                + '<span class="budget-note">' + used + ' / ' + budget + ' repairs used</span>'
                + '</div>';
        }
        els.budgetBars.innerHTML = html;

        var text;
        if (info.damagedCount === 0) {
            text = state.pixelPreset !== 'none' ? 'Defect rendered — no module corruption detected' : 'No damage yet';
        } else if (overBudget) {
            text = 'Beyond Reed-Solomon repair';
        } else if (corruptedTotal === 0) {
            text = 'Only function patterns hit — parity untouched';
        } else {
            text = corruptedTotal + ' of ' + budgetTotal + ' correctable codewords corrupted';
        }
        if (info.estimated) text += ' (estimated)';
        els.budgetText.textContent = text;

        if (info.functionCount > 0) {
            els.functionWarn.hidden = false;
            els.functionWarn.textContent = info.functionCount + ' function-pattern module'
                + (info.functionCount === 1 ? '' : 's') + ' damaged (finder, timing, alignment, format or dark module). '
                + 'Error correction cannot repair these — a scanner may fail to find or orient the symbol at all.';
        } else {
            els.functionWarn.hidden = true;
        }
    }

    /* ------------------------------------------------------------------ *
     * Module inspection (click without dragging)
     * ------------------------------------------------------------------ */
    function inspectModule(r, c) {
        var enc = state.encoded;
        var st = state.structure;
        var cw = enc.placement[r][c];
        if (cw === null) {
            var comp = enc.moduleColors[r][c];
            var label = comp >= 0 ? enc.components[comp].label : 'Function pattern';
            els.codewordInfo.textContent = 'Module (' + r + ', ' + c + ') — ' + label
                + '. Function patterns carry no codeword and get no parity.';
            return;
        }
        var isData = cw < enc.dataCodewords;
        var block = codewordBlock(cw, st);
        var position;
        if (isData) {
            var firstStride = st.shortLength * st.numBlocks;
            position = cw < firstStride ? Math.floor(cw / st.numBlocks) : st.shortLength;
            position += 1;
        } else {
            position = Math.floor((cw - enc.dataCodewords) / st.numBlocks) + 1;
        }
        els.codewordInfo.textContent = 'Module (' + r + ', ' + c + ') — '
            + (isData ? 'Data' : 'Error correction') + ' codeword ' + cw + ' of '
            + (isData ? enc.dataCodewords : enc.ecCodewords) + ' · block ' + (block + 1) + ' of '
            + st.numBlocks + ' · position ' + position + ' of '
            + (isData ? st.dataCounts[block] : st.ecPerBlock) + '.';
    }

    /* ------------------------------------------------------------------ *
     * Pointer painting on the print canvas
     * ------------------------------------------------------------------ */
    function pointerToModule(e) {
        var rect = els.print.getBoundingClientRect();
        var total = state.encoded.size + QUIET * 2;
        var scale = rect.width / total;
        var mx = Math.floor((e.clientX - rect.left) / scale) - QUIET;
        var my = Math.floor((e.clientY - rect.top) / scale) - QUIET;
        if (mx < 0 || my < 0 || mx >= state.encoded.size || my >= state.encoded.size) return null;
        return { r: my, c: mx };
    }

    function wirePainting() {
        var painting = false;
        var downAt = 0;
        var downX = 0, downY = 0;
        var moved = 0;

        els.print.addEventListener('pointerdown', function (e) {
            if (state.sweeping) return;
            var cell = pointerToModule(e);
            if (!cell) return;
            painting = true;
            moved = 0;
            downAt = Date.now();
            downX = e.clientX; downY = e.clientY;
            paintBrush(cell.r, cell.c);
            renderSymbol(); renderOverlay(); renderMeter();
            try { els.print.setPointerCapture(e.pointerId); } catch (_) { }
            e.preventDefault();
        });
        els.print.addEventListener('pointermove', function (e) {
            if (!painting) return;
            moved = Math.max(moved, Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY));
            var cell = pointerToModule(e);
            if (!cell) return;
            paintBrush(cell.r, cell.c);
            renderSymbol(); renderOverlay(); renderMeter();
        });
        function finish(e) {
            if (!painting) return;
            painting = false;
            if (moved < 8 && Date.now() - downAt < 500) {
                var cell = pointerToModule(e);
                if (cell) inspectModule(cell.r, cell.c);
            }
            scheduleAutoDecode();
        }
        els.print.addEventListener('pointerup', finish);
        els.print.addEventListener('pointercancel', function () { painting = false; });
    }

    /* ------------------------------------------------------------------ *
     * Decoding
     * ------------------------------------------------------------------ */
    function setStatus(text, tone) {
        els.decodeStatus.textContent = text;
        els.decodeStatus.className = 'status-line' + (tone ? ' ' + tone : '');
    }

    function scheduleAutoDecode() {
        if (!els.decodeAuto.checked || state.sweeping) return;
        clearTimeout(autoDecodeTimer);
        autoDecodeTimer = setTimeout(function () { decodeNow('live'); }, 450);
    }

    function logRow(pct, verdict, ms, source, tone) {
        els.logEmpty.hidden = true;
        /* The log holds exactly one experiment. An interactive decode (auto,
           manual, reader error) replaces whatever is there — including a
           finished sweep table — and a sweep run starts from an empty table,
           so its ten rows read as one run-up, never a pile of old runs. */
        if (source.indexOf('sweep') !== 0) {
            els.logTbody.innerHTML = '';
        }
        var tr = document.createElement('tr');
        tr.className = 'result-' + tone;
        tr.innerHTML = '<td>' + pct + '</td><td class="result">' + escapeHtml(verdict) + '</td>'
            + '<td>' + (ms === null ? '—' : ms + ' ms') + '</td>'
            + '<td class="source">' + escapeHtml(source) + '</td>';
        els.logTbody.insertBefore(tr, els.logTbody.firstChild);
        while (els.logTbody.children.length > 12) {
            els.logTbody.removeChild(els.logTbody.lastChild);
        }
    }

    function currentDamagePct() {
        var enc = state.encoded;
        if (!enc) return '0.0';
        var info = countCorruption();
        var pct = info.damagedCount / (enc.size * enc.size) * 100;
        return pct.toFixed(1) + '%';
    }

    async function decodeNow(sourceLabel) {
        if (state.sweeping && sourceLabel.indexOf('sweep') !== 0) return;
        var enc = state.encoded;
        if (!enc) return;
        setStatus('Decoding…');
        var startedAt = performance.now();
        try {
            var cvr = await engine();
            var W = els.print.width;
            var image = els.print.getContext('2d').getImageData(0, 0, W, W);
            /* Canvas ImageData is RGBA in memory, which is the ABGR_8888 byte
               order the SDK wants. A fresh buffer per call: capture can detach
               the one it is given. */
            var result = await feedback.run('Decoding…', function () {
                return cvr.capture({
                    bytes: new Uint8Array(image.data),
                    width: W, height: W, stride: W * 4, format: 10
                }, 'ReadBarcodes_Default');
            });
            var ms = Math.round(performance.now() - startedAt);
            var items = (result.items || []).filter(function (item) { return item.type === 2; });
            var qr = null;
            for (var i = 0; i < items.length; i++) {
                if (/qr/i.test(items[i].formatString || '')) { qr = items[i]; break; }
            }
            if (!qr && items.length) qr = items[0];

            if (qr) {
                var match = qr.text === state.text;
                logRow(currentDamagePct(), match ? '✓ decoded — matches payload' : '✓ decoded — "' + shorten(qr.text, 24) + '"',
                    ms, sourceLabel, match ? 'ok' : 'mismatch');
                setStatus(match
                    ? 'Decoded in ' + ms + ' ms — the payload came back intact.'
                    : 'Decoded in ' + ms + ' ms, but the text differs from the payload.', match ? 'ok' : 'bad');
                analytics.action('decode_result', { source: sourceLabel, match: match, damaged_pct: Number(currentDamagePct().replace('%', '')) });
            } else {
                logRow(currentDamagePct(), '✗ no decode', ms, sourceLabel, 'bad');
                setStatus('No decode in ' + ms + ' ms — this much damage defeats the reader.', 'bad');
                analytics.action('decode_result', { source: sourceLabel, match: false, damaged_pct: Number(currentDamagePct().replace('%', '')) });
            }
        } catch (e) {
            var message = (e && e.message) || String(e);
            setStatus('Reader unavailable: ' + message + ' Everything except decoding still works.', 'bad');
            logRow(currentDamagePct(), '— reader error', null, sourceLabel, 'bad');
        }
    }

    async function runSweep() {
        if (state.sweeping) return;
        state.sweeping = true;
        setControlsBusy(true);
        els.stageHint.textContent = 'Sweeping damage…';
        setStatus('Running the damage sweep — ten seeded renders, decoded one by one.');
        /* Percentages of the encoding region (the modules that carry codewords),
           which is what the random-damage slider means. Finer steps at the low
           end because that is where the levels separate. Damage accumulates:
           each step adds its increment on top of the previous one, so the log
           reads as one clean run-up to the breaking point instead of ten
           unrelated renders. */
        var steps = [0, 2, 4, 6, 8, 10, 13, 16, 20, 25];
        var applied = 0;
        try {
            /* A new sweep is a new experiment: the log starts empty. */
            els.logTbody.innerHTML = '';
            clearDamage(false);
            for (var i = 0; i < steps.length; i++) {
                var pct = steps[i];
                var delta = pct - applied;
                applied = pct;
                if (delta > 0) applyRandomDamage(delta, 1000 + pct);
                renderSymbol();
                renderOverlay();
                renderMeter();
                await decodeNow('sweep ' + pct + '%');
            }
            setStatus('Sweep complete. Level ' + state.ecLevel + ' at version '
                + state.encoded.version + ' — switch levels and sweep again to compare.');
        } finally {
            state.sweeping = false;
            setControlsBusy(false);
            els.stageHint.textContent = 'Drag on the symbol to damage modules';
        }
    }

    function setControlsBusy(busy) {
        els.btnSweep.disabled = busy;
        els.btnDecode.disabled = busy;
        els.btnRandom.disabled = busy;
        els.btnClear.disabled = busy;
        els.btnFinder.disabled = busy;
        els.btnTiming.disabled = busy;
        els.btnFormat.disabled = busy;
        els.exportBtn.disabled = busy;
        els.payload.disabled = busy;
        els.version.disabled = busy;
    }

    /* ------------------------------------------------------------------ *
     * Export
     * ------------------------------------------------------------------ */
    function exportPng() {
        if (!state.encoded) return;
        var pct = currentDamagePct().replace('%', '').replace('.', '-');
        if (els.print.toBlob) {
            els.print.toBlob(function (blob) {
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = 'qr-' + state.encoded.ecLevel + '-v' + state.encoded.version + '-' + pct + '-damaged.png';
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
                toast('PNG downloaded');
            }, 'image/png');
        } else {
            toast('This browser cannot export the canvas');
        }
    }

    /* ------------------------------------------------------------------ *
     * Controls
     * ------------------------------------------------------------------ */
    function renderAfterEncode() {
        renderSymbol();
        renderOverlay();
        renderFacts();
        renderEcBars();
        renderMeter();
    }

    /* A failed encode must not leave the control and the symbol disagreeing:
       roll the state back and put the control back on the last encode. */
    function setEcLevel(level) {
        if (state.ecLevel === level) return;
        var previous = state.ecLevel;
        state.ecLevel = level;
        var buttons = document.querySelectorAll('.ec-option');
        function syncButtons(value) {
            for (var i = 0; i < buttons.length; i++) {
                buttons[i].setAttribute('aria-checked', String(buttons[i].getAttribute('data-level') === value));
            }
        }
        syncButtons(level);
        if (encodeCurrent()) {
            renderAfterEncode();
            scheduleAutoDecode();
        } else {
            state.ecLevel = previous;
            syncButtons(previous);
        }
    }

    function setVersion(value) {
        var previous = state.version;
        state.version = value === 'auto' ? 'auto' : Number(value);
        if (encodeCurrent()) {
            renderAfterEncode();
            scheduleAutoDecode();
        } else {
            state.version = previous;
            els.version.value = previous === 'auto' ? 'auto' : String(previous);
        }
    }

    function wireEvents() {
        /* EC level segmented control */
        var ecButtons = document.querySelectorAll('.ec-option');
        for (var i = 0; i < ecButtons.length; i++) {
            ecButtons[i].addEventListener('click', function () {
                setEcLevel(this.getAttribute('data-level'));
            });
        }

        /* Payload and version */
        var payloadTimer = null;
        els.payload.addEventListener('input', function () {
            clearTimeout(payloadTimer);
            payloadTimer = setTimeout(function () {
                if (encodeCurrent()) {
                    renderAfterEncode();
                    scheduleAutoDecode();
                }
            }, 350);
        });
        els.version.addEventListener('change', function () { setVersion(this.value); });

        /* Structure toggle */
        els.structureToggle.addEventListener('change', function () {
            renderOverlay();
            analytics.action('structure_view', { enabled: this.checked });
        });

        /* Brush size chips */
        var chips = els.brushSizes.querySelectorAll('.chip');
        for (var j = 0; j < chips.length; j++) {
            chips[j].addEventListener('click', function () {
                state.brushSize = Number(this.getAttribute('data-size'));
                for (var k = 0; k < chips.length; k++) {
                    chips[k].setAttribute('aria-checked', String(chips[k] === this));
                }
            });
        }

        /* Pattern targeting */
        els.btnFinder.addEventListener('click', function () {
            if (state.sweeping) return;
            applyFinderCover((state.finderCovered + 1) % 4);
            renderSymbol(); renderOverlay(); renderMeter(); scheduleAutoDecode();
        });
        els.btnTiming.addEventListener('click', function () {
            if (state.sweeping) return;
            var order = ['none', 'row', 'col', 'both'];
            applyTiming(order[(order.indexOf(state.timingMode) + 1) % 4]);
            renderSymbol(); renderOverlay(); renderMeter(); scheduleAutoDecode();
        });
        els.btnFormat.addEventListener('click', function () {
            if (state.sweeping) return;
            var order = ['none', 'copy1', 'copy2', 'both'];
            applyFormat(order[(order.indexOf(state.formatMode) + 1) % 4]);
            renderSymbol(); renderOverlay(); renderMeter(); scheduleAutoDecode();
        });

        /* Random damage */
        els.randomRange.addEventListener('input', function () {
            els.randomValue.textContent = this.value + '%';
        });
        els.btnRandom.addEventListener('click', function () {
            if (state.sweeping || !state.encoded) return;
            var pct = Number(els.randomRange.value);
            var count = applyRandomDamage(pct, 0x51ed + pct);
            renderSymbol(); renderOverlay(); renderMeter();
            toast(count + ' modules damaged (' + pct + '%)');
            scheduleAutoDecode();
        });

        /* Capture defects */
        els.pixelPreset.addEventListener('change', function () {
            state.pixelPreset = this.value;
            renderSymbol(); renderMeter(); scheduleAutoDecode();
        });
        els.pixelAmount.addEventListener('input', function () {
            state.pixelAmount = Number(this.value);
            els.pixelAmountValue.textContent = this.value + '%';
            renderSymbol(); renderMeter(); scheduleAutoDecode();
        });

        els.btnClear.addEventListener('click', function () {
            if (state.sweeping) return;
            clearDamage(true);
            scheduleAutoDecode();
        });

        /* Decode panel */
        els.btnDecode.addEventListener('click', function () { decodeNow('manual'); });
        els.btnSweep.addEventListener('click', function () { runSweep(); });
        els.decodeAuto.addEventListener('change', function () {
            if (this.checked) scheduleAutoDecode();
        });

        els.exportBtn.addEventListener('click', exportPng);
    }

    /* ------------------------------------------------------------------ *
     * Bootstrap
     * ------------------------------------------------------------------ */
    function fillVersionOptions() {
        var auto = els.version.options[0];
        els.version.innerHTML = '';
        els.version.appendChild(auto);
        for (var v = 1; v <= MAX_VERSION; v++) {
            var option = document.createElement('option');
            option.value = String(v);
            option.textContent = 'Version ' + v + ' — ' + (v * 4 + 17) + '×' + (v * 4 + 17);
            els.version.appendChild(option);
        }
    }

    function bootstrap() {
        /* The encoder is a defer-script like this file, but check anyway: a
           missing encoder must not throw a blank page. */
        if (!window.BarcodeQR) {
            showVersionError('The QR encoder failed to load. Reload the page.');
            return;
        }
        fillVersionOptions();

        /* EC button labels: the widely quoted recovery capability (L recovers
           roughly 7% of the data codewords, H roughly 30%). The exact parity
           counts live in the comparison bars below the symbol. */
        var EC_RECOVERY = { L: 7, M: 15, Q: 25, H: 30 };
        var ecButtons = document.querySelectorAll('.ec-option');
        for (var i = 0; i < ecButtons.length; i++) {
            var level = ecButtons[i].getAttribute('data-level');
            ecButtons[i].textContent = level + ' · ~' + EC_RECOVERY[level] + '%';
            if (level === state.ecLevel) ecButtons[i].setAttribute('aria-checked', 'true');
        }

        applyFinderCover(0);
        applyTiming('none');
        applyFormat('none');
        wirePainting();
        wireEvents();

        if (encodeCurrent()) {
            renderSymbol();
            renderOverlay();
            renderFacts();
            renderEcBars();
            renderMeter();
        }
        setStatus('The reader loads on the first decode. Decoding uses the clean render plus your damage — never the structure colours.');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }
}());
