/*
 * PDF417 Error Correction & Damage Visualizer — application logic.
 *
 * Three ideas, in order of importance:
 *
 *   1. The symbol is built by pdf417-encoder.js, which returns the codeword
 *      behind every 17-module cell. That is what makes the budget meter exact
 *      rather than a guess: a wiped cell is one corrupted codeword, and one
 *      corrupted codeword spends one of the ⌊EC/2⌋ repairs the level bought.
 *
 *   2. PDF417 fails in three different ways, and the page counts all three
 *      separately: corrupted codewords (what Reed-Solomon repairs), damaged
 *      row indicators (a detection failure — no parity protects them), and
 *      damaged guard patterns (the symbol may not be found at all).
 *
 *   3. Damage comes in two independent layers. Codeword damage edits the
 *      symbol itself and is counted exactly; capture defects are rendered onto
 *      the finished canvas the way a camera would have seen it and are
 *      estimated by sampling module centres.
 *
 * Decoding uses Dynamsoft Barcode Reader on the clean render plus damage —
 * never the structure colours, which are an annotation layer. Everything runs
 * in the browser; the payload and the damaged image stay here.
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
     * and the page should say so instead of failing silently later. */
    var els = {
        payload: $('payload'),
        levelChips: $('level-chips'), levelHint: $('level-hint'),
        encodeError: $('encode-error'), symbolNote: $('symbol-note'),
        print: $('symbol-canvas'), overlay: $('symbol-overlay'), stage: $('symbol-stage'),
        stageHint: $('stage-hint'),
        structureToggle: $('structure-toggle'), codewordInfo: $('codeword-info'),
        facts: $('facts'), levelBars: $('level-bars'), exportBtn: $('export-btn'),
        brushSizes: $('brush-sizes'),
        btnRow: $('btn-row'), btnColumn: $('btn-column'), btnCover: $('btn-cover'),
        btnLeft: $('btn-left'), btnRight: $('btn-right'), btnGuard: $('btn-guard'),
        randomRange: $('random-range'), randomValue: $('random-value'), btnRandom: $('btn-random'),
        pixelPreset: $('pixel-preset'), pixelAmount: $('pixel-amount'),
        pixelAmountValue: $('pixel-amount-value'),
        btnUndo: $('btn-undo'), btnClear: $('btn-clear'),
        damagePct: $('damage-pct'), budgetText: $('budget-text'),
        budgetFill: $('budget-fill'), budgetCap: $('budget-cap'),
        budgetCapErasure: $('budget-cap-erasure'),
        budgetNote: $('budget-note'), functionWarn: $('function-warn'),
        decodeAuto: $('decode-auto'), decodeStatus: $('decode-status'),
        btnDecode: $('btn-decode'), btnSweep: $('btn-sweep'),
        readerFacts: $('reader-facts'),
        logTbody: $('log-tbody'), logEmpty: $('log-empty'),
        anatomyCanvas: $('anatomy-canvas'), anatomyLegend: $('anatomy-legend'),
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
            analytics.error((e && e.errorCode) || -1, 'pdf417_ec_engine_initialization_failed');
            throw e;
        });
        return enginePromise;
    }

    /* ------------------------------------------------------------------ *
     * State
     * ------------------------------------------------------------------ */
    var QUIET = 2;          /* quiet zone, in modules */
    var ROWMULT = 3;        /* a PDF417 row is at least three modules high */
    var LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8];

    var state = {
        text: 'https://www.dynamsoft.com/codepool/',
        level: 2,
        encoded: null,
        damage: null,          /* Uint8Array, 0 clean | 1 forced dark | 2 forced light */
        brush: 1,              /* cells per stroke */
        pixelPreset: 'none',
        pixelAmount: 50,
        undo: [],
        sweeping: false,
        estimate: null,        /* codeword estimate while a capture defect is active */
        selected: null         /* { row, col } of the inspected cell */
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

    function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

    function escapeHtml(text) {
        return String(text).replace(/[&<>"']/g, function (ch) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
        });
    }

    function shorten(text, max) {
        max = max || 40;
        return text.length > max ? text.slice(0, max - 1) + '…' : text;
    }

    function plural(n, one, many) { return n === 1 ? one : many; }

    var toastTimer = null;
    function toast(message) {
        els.toast.textContent = message;
        els.toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { els.toast.classList.remove('show'); }, 2200);
    }

    function modulePx(width) {
        /* The canvas is the decoding input, so it wants roughly a thousand
           pixels across; the CSS then scales it into the card. */
        return Math.max(2, Math.min(5, Math.floor(880 / (width + QUIET * 2))));
    }

    /* ------------------------------------------------------------------ *
     * Encoding
     * ------------------------------------------------------------------ */
    function encodeNow() {
        var enc;
        try {
            enc = window.PDF417Encoder.encode(state.text, { ecLevel: state.level });
        } catch (e) {
            els.encodeError.textContent = e.message;
            els.encodeError.hidden = false;
            /* The selector must never claim a level the symbol on screen was not
               built with: a failed encode puts the control back where it was. */
            if (state.encoded) {
                state.level = state.encoded.ecLevel;
                renderLevelHint();
            }
            return false;
        }
        els.encodeError.hidden = true;
        enc.modulePx = modulePx(enc.width);
        state.encoded = enc;
        /* A new symbol invalidates cell damage: cell coordinates belong to the
           matrix that was on screen when the user painted. */
        state.damage = new Uint8Array(enc.width * enc.height);
        state.undo = [];
        state.estimate = null;
        state.selected = null;
        els.symbolNote.textContent = enc.columns + ' columns × ' + enc.rows + ' rows · ' +
            enc.totalCodewords + ' codewords';
        return true;
    }

    /* ------------------------------------------------------------------ *
     * Rendering — print canvas (what gets decoded and exported)
     * ------------------------------------------------------------------ */
    function renderSymbol() {
        var enc = state.encoded;
        if (!enc) return;
        var px = enc.modulePx;
        var W = (enc.width + QUIET * 2) * px;
        var H = (enc.height * ROWMULT + QUIET * 2) * px;
        if (els.print.width !== W || els.print.height !== H) {
            els.print.width = W;
            els.print.height = H;
        }
        var ctx = els.print.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);

        /* One fillRect per run of same-valued modules instead of one per
           module: a wide symbol is ~12k modules and this keeps painting
           responsive while the pointer moves. */
        for (var r = 0; r < enc.height; r++) {
            var bits = enc.matrix[r];
            var y = (r + QUIET) * ROWMULT * px;
            var runStart = 0;
            var runValue = moduleValue(r, 0);
            for (var c = 1; c <= enc.width; c++) {
                var value = c < enc.width ? moduleValue(r, c) : -1;
                if (value !== runValue) {
                    if (runValue) {
                        ctx.fillStyle = '#000000';
                        ctx.fillRect((runStart + QUIET) * px, y,
                            (c - runStart) * px, ROWMULT * px);
                    }
                    runStart = c;
                    runValue = value;
                }
            }
        }

        applyPixelDefect(ctx, W, H);
    }

    function moduleValue(r, c) {
        var forced = state.damage[r * state.encoded.width + c];
        if (forced === 1) return 1;
        if (forced === 2) return 0;
        return state.encoded.matrix[r].charAt(c) === '1' ? 1 : 0;
    }

    /* The capture defects. One active at a time, all seeded, so the same
       settings always produce the same damaged render. */
    function applyPixelDefect(ctx, W, H) {
        var preset = state.pixelPreset;
        if (preset === 'none') { state.estimate = null; return; }
        var amount = state.pixelAmount / 100;
        var rand = mulberry32(0x9e3779b9 ^ (preset.length * 2654435761) ^ Math.round(amount * 1000));

        if (preset === 'noise' || preset === 'contrast') {
            var image = ctx.getImageData(0, 0, W, H);
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
            temp.width = W; temp.height = H;
            var tctx = temp.getContext('2d');
            if (typeof tctx.filter === 'string') {
                tctx.filter = 'blur(' + (amount * 6).toFixed(2) + 'px)';
            }
            tctx.drawImage(els.print, 0, 0);
            ctx.clearRect(0, 0, W, H);
            ctx.drawImage(temp, 0, 0);
            return;
        }

        if (preset === 'resolution') {
            /* A cheap camera: shrink to a fraction of the size and let the
               browser smear it back up, which is what a low-resolution capture
               of a 3-module-high row really looks like. */
            var factor = 1 - amount * 0.92;
            var small = document.createElement('canvas');
            small.width = Math.max(24, Math.round(W * factor));
            small.height = Math.max(16, Math.round(H * factor));
            var sctx = small.getContext('2d');
            sctx.imageSmoothingEnabled = true;
            sctx.drawImage(els.print, 0, 0, small.width, small.height);
            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, H);
            ctx.imageSmoothingEnabled = true;
            ctx.drawImage(small, 0, 0, small.width, small.height, 0, 0, W, H);
            return;
        }

        if (preset === 'occlusion') {
            var blocks = 1 + Math.floor(amount * 3);
            ctx.fillStyle = '#111111';
            for (var b = 0; b < blocks; b++) {
                var bw = W * (0.1 + rand() * 0.14);
                var bh = H * (0.2 + rand() * 0.3);
                var bx = rand() * (W - bw);
                var by = rand() * (H - bh);
                ctx.fillRect(bx, by, bw, bh);
            }
            return;
        }

        if (preset === 'crop') {
            /* Partly out of frame: keep the middle and scale it back up. */
            var keep = 1 - amount * 0.55;
            var sw = W * keep, sh = H * keep;
            var sx = (W - sw) / 2, sy = (H - sh) / 2;
            var snap = document.createElement('canvas');
            snap.width = W; snap.height = H;
            snap.getContext('2d').drawImage(els.print, sx, sy, sw, sh, 0, 0, W, H);
            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, H);
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
            ctx.fillRect(0, 0, W, H);
            return;
        }

        if (preset === 'rotate') {
            var angle = (amount - 0.5) * 0.4; /* ±0.1 rad ≈ ±6° */
            var spun = document.createElement('canvas');
            spun.width = W; spun.height = H;
            var rctx = spun.getContext('2d');
            rctx.translate(W / 2, H / 2);
            rctx.rotate(angle);
            rctx.drawImage(els.print, -W / 2, -H / 2);
            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, H);
            ctx.drawImage(spun, 0, 0);
            return;
        }
    }

    /* ------------------------------------------------------------------ *
     * Rendering — structure overlay (annotation layer, never decoded)
     * ------------------------------------------------------------------ */
    function renderOverlay() {
        var enc = state.encoded;
        if (!enc) return;
        var px = enc.modulePx;
        var W = els.print.width, H = els.print.height;
        if (els.overlay.width !== W || els.overlay.height !== H) {
            els.overlay.width = W;
            els.overlay.height = H;
        }
        var ctx = els.overlay.getContext('2d');
        ctx.clearRect(0, 0, W, H);
        if (!els.structureToggle.checked) return;

        var top = QUIET * ROWMULT * px;
        var height = enc.height * ROWMULT * px;
        var x0 = QUIET * px;

        /* The guard patterns and row indicators run the full height, so they
           are four strips rather than one rect per module per row. */
        ctx.fillStyle = 'rgba(48,104,119,0.16)';
        ctx.fillRect(x0, top, 17 * px, height);
        ctx.fillRect(x0 + 17 * px, top, 17 * px, height);
        ctx.fillRect(x0 + (34 + 17 * enc.columns) * px, top, 17 * px, height);
        ctx.fillRect(x0 + (51 + 17 * enc.columns) * px, top, 18 * px, height);

        for (var r = 0; r < enc.height; r++) {
            var y = (r + QUIET) * ROWMULT * px;
            for (var c = 0; c < enc.columns; c++) {
                var role = enc.cells[r][c].role;
                var fill = null;
                if (role === 'parity') fill = 'rgba(254,142,20,0.20)';
                else if (role === 'pad') fill = 'rgba(50,50,52,0.12)';
                if (fill) {
                    ctx.fillStyle = fill;
                    ctx.fillRect(x0 + (34 + c * 17) * px, y, 17 * px, ROWMULT * px);
                }
            }
        }

        /* A hairline around parity cells keeps them readable when the cells are
           only two pixels wide. */
        ctx.strokeStyle = 'rgba(254,142,20,0.55)';
        ctx.lineWidth = 1;
        for (var r2 = 0; r2 < enc.height; r2++) {
            for (var c2 = 0; c2 < enc.columns; c2++) {
                if (enc.cells[r2][c2].role !== 'parity') continue;
                ctx.strokeRect(Math.round(x0 + (34 + c2 * 17) * px) + 0.5,
                    Math.round((r2 + QUIET) * ROWMULT * px) + 0.5,
                    Math.round(17 * px) - 1, Math.round(ROWMULT * px) - 1);
            }
        }

        /* Damaged modules, in red, merged into runs. */
        ctx.fillStyle = 'rgba(180,35,24,0.42)';
        for (var r3 = 0; r3 < enc.height; r3++) {
            var run = 0;
            var value = false;
            for (var c3 = 0; c3 <= enc.width; c3++) {
                var hit = c3 < enc.width && isModuleDamaged(r3, c3);
                if (hit !== value) {
                    if (value) {
                        ctx.fillRect(x0 + run * px, (r3 + QUIET) * ROWMULT * px,
                            (c3 - run) * px, ROWMULT * px);
                    }
                    run = c3;
                    value = hit;
                }
            }
        }

        if (state.selected) {
            var s = state.selected;
            ctx.strokeStyle = 'rgba(48,104,119,0.95)';
            ctx.lineWidth = 2;
            var sx = x0 + (s.col - 34) * px;
            ctx.strokeRect(sx + 1, (s.row + QUIET) * ROWMULT * px + 1,
                17 * px - 2, ROWMULT * px - 2);
        }
    }

    /* A module counts as damaged only when the damage layer forces a value the
       clean symbol did not have — wiping an already-dark module changes
       nothing, and the budget must not charge for it. */
    function isModuleDamaged(r, c) {
        var forced = state.damage[r * state.encoded.width + c];
        if (!forced) return false;
        var clean = state.encoded.matrix[r].charAt(c) === '1' ? 1 : 0;
        return (forced === 1 ? 1 : 0) !== clean;
    }

    /* ------------------------------------------------------------------ *
     * Corruption accounting — exact for the damage layer, estimated for
     * capture defects
     * ------------------------------------------------------------------ */
    function countCorruption() {
        var enc = state.encoded;
        var result = {
            cells: 0, dataCells: 0, parityCells: 0,
            leftRows: 0, rightRows: 0, startRows: 0, stopRows: 0,
            modules: 0, estimated: false
        };
        if (!enc) return result;

        for (var r = 0; r < enc.height; r++) {
            var badLeft = false, badRight = false, badStart = false, badStop = false;
            for (var c = 0; c < enc.width; c++) {
                if (!isModuleDamaged(r, c)) continue;
                result.modules++;
                if (c < 17) badStart = true;
                else if (c < 34) badLeft = true;
                else if (c >= enc.width - 18) badStop = true;
                else if (c >= enc.width - 35) badRight = true;
            }
            for (var cell = 0; cell < enc.columns; cell++) {
                var base = 34 + cell * 17;
                var hit = false;
                for (var k = 0; k < 17; k++) {
                    if (isModuleDamaged(r, base + k)) { hit = true; break; }
                }
                if (!hit) continue;
                result.cells++;
                if (enc.cells[r][cell].role === 'parity') result.parityCells++;
                else result.dataCells++;
            }
            if (badLeft) result.leftRows++;
            if (badRight) result.rightRows++;
            if (badStart) result.startRows++;
            if (badStop) result.stopRows++;
        }
        return result;
    }

    /* What a camera would have read: sample each module's centre pixel and
       compare it with the value the clean symbol intended. Only used while a
       capture defect is active, and labelled as an estimate wherever it is
       shown. */
    function estimateCorruption() {
        var enc = state.encoded;
        if (!enc) return null;
        if (state.pixelPreset === 'none') return null;
        var px = enc.modulePx;
        var ctx = els.print.getContext('2d');
        var W = els.print.width;
        var image = ctx.getImageData(0, 0, W, els.print.height);
        var data = image.data;
        var cells = 0, dataCells = 0, parityCells = 0;

        function darkAt(col, row) {
            var x = Math.floor((col + QUIET) * px + px / 2);
            var y = Math.floor((row + QUIET) * ROWMULT * px + (ROWMULT * px) / 2);
            if (x < 0 || y < 0 || x >= W || y >= els.print.height) return false;
            var i = (y * W + x) * 4;
            return (data[i] + data[i + 1] + data[i + 2]) / 3 < 128 ? 1 : 0;
        }

        for (var r = 0; r < enc.height; r++) {
            for (var c = 0; c < enc.columns; c++) {
                var hit = false;
                for (var k = 0; k < 17; k++) {
                    var col = 34 + c * 17 + k;
                    var intended = enc.matrix[r].charAt(col) === '1' ? 1 : 0;
                    if (darkAt(col, r) !== intended) { hit = true; break; }
                }
                if (!hit) continue;
                cells++;
                if (enc.cells[r][c].role === 'parity') parityCells++;
                else dataCells++;
            }
        }
        return { cells: cells, dataCells: dataCells, parityCells: parityCells, modules: 0 };
    }

    function currentCorruption() {
        var exact = countCorruption();
        var estimate = estimateCorruption();
        if (estimate && estimate.cells > exact.cells) {
            return {
                cells: estimate.cells,
                dataCells: estimate.dataCells,
                parityCells: estimate.parityCells,
                modules: exact.modules,
                leftRows: exact.leftRows, rightRows: exact.rightRows,
                startRows: exact.startRows, stopRows: exact.stopRows,
                estimated: true
            };
        }
        return exact;
    }

    /* ------------------------------------------------------------------ *
     * Facts, level comparison
     * ------------------------------------------------------------------ */
    function renderFacts() {
        var enc = state.encoded;
        if (!enc) return;
        var share = (enc.ecCodewords / enc.totalCodewords) * 100;
        var rows = [
            ['Error correction', 'level ' + enc.ecLevel + ' — ' + enc.ecCodewords + ' codewords'],
            ['Repair budget', '⌊' + enc.ecCodewords + '/2⌋ = ' + enc.repairBudget + ' codewords'],
            ['Symbol', enc.columns + ' columns × ' + enc.rows + ' rows'],
            ['Codewords', enc.totalCodewords + ' = ' + enc.dataCodewords + ' data + ' + enc.ecCodewords + ' parity'],
            ['Payload', enc.payloadCodewords + ' codewords · ' + enc.padCodewords + ' padding'],
            ['Parity share', share.toFixed(0) + '% of the symbol'],
            ['Modules', enc.width + ' wide · rows drawn ' + ROWMULT + ' high'],
            ['Render', els.print.width + ' × ' + els.print.height + ' px']
        ];
        els.facts.innerHTML = rows.map(function (pair) {
            return '<dt>' + pair[0] + '</dt><dd>' + escapeHtml(pair[1]) + '</dd>';
        }).join('');
    }

    function renderLevelBars() {
        els.levelBars.innerHTML = '';
        for (var i = 0; i < LEVELS.length; i++) {
            var level = LEVELS[i];
            var info = null;
            try {
                info = window.PDF417Encoder.encode(state.text, { ecLevel: level });
            } catch (e) { info = null; }

            var row = document.createElement('button');
            row.type = 'button';
            row.className = 'ec-bar-row';
            row.setAttribute('aria-checked', String(level === state.level));
            row.setAttribute('aria-current', String(level === state.level));
            row.dataset.level = String(level);

            var share = info ? (info.ecCodewords / info.totalCodewords) * 100 : 0;
            var note = info
                ? info.ecCodewords + ' cw · ' + info.totalCodewords + ' total'
                : 'does not fit';
            row.innerHTML = '<span class="ec-bar-level">' + level + '</span>'
                + '<span class="ec-bar-track"><span class="ec-bar-fill" style="width:'
                + Math.max(0, Math.min(100, share)).toFixed(1) + '%"></span></span>'
                + '<span class="ec-bar-note">' + escapeHtml(note) + '</span>';
            row.title = info
                ? 'Level ' + level + ': ' + info.ecCodewords + ' parity codewords in a '
                + info.columns + '×' + info.rows + ' symbol — ' + share.toFixed(0) + '% of it'
                : 'Level ' + level + ' cannot hold this payload';
            els.levelBars.appendChild(row);
        }
    }

    function renderLevelHint() {
        var k = Math.pow(2, state.level + 1);
        els.levelHint.textContent = 'Level ' + state.level + ' buys ' + k + ' parity codewords — '
            + Math.floor(k / 2) + ' repairable.';
        var chips = els.levelChips.querySelectorAll('.level-chip');
        for (var i = 0; i < chips.length; i++) {
            chips[i].setAttribute('aria-checked', String(Number(chips[i].dataset.level) === state.level));
        }
    }

    /* ------------------------------------------------------------------ *
     * Damage model
     * ------------------------------------------------------------------ */
    function snapshot() {
        state.undo.push(state.damage.slice());
        if (state.undo.length > 30) state.undo.shift();
        els.btnUndo.disabled = false;
    }

    /* Wipe one codeword cell: every module of the 17 goes dark, which turns a
       valid codeword pattern into a solid bar no decoder can read as the value
       it used to hold. */
    function wipeCell(row, cell, damage) {
        var enc = state.encoded;
        var base = row * enc.width + 34 + cell * 17;
        for (var k = 0; k < 17; k++) {
            if (enc.matrix[row].charAt(34 + cell * 17 + k) === '1') continue;
            damage[base + k] = 1;
        }
    }

    function wipeCellRange(row, from, count, damage) {
        for (var i = 0; i < count; i++) {
            var cell = from + i;
            if (cell >= 0 && cell < state.encoded.columns) wipeCell(row, cell, damage);
        }
    }

    function wipeIndicator(row, side, damage) {
        var enc = state.encoded;
        var start = side === 'left' ? 17 : enc.width - 35;
        for (var k = 0; k < 17; k++) {
            if (enc.matrix[row].charAt(start + k) === '1') continue;
            damage[row * enc.width + start + k] = 1;
        }
    }

    function wipeGuard(row, side, damage) {
        var enc = state.encoded;
        var start = side === 'start' ? 0 : enc.width - 18;
        var len = side === 'start' ? 17 : 18;
        for (var k = 0; k < len; k++) {
            /* Break the pattern by inverting it: a guard has to *look* like a
               guard, and an inverted one does not. */
            var bit = enc.matrix[row].charAt(start + k) === '1' ? 2 : 1;
            damage[row * enc.width + start + k] = bit;
        }
    }

    function damageChanged() {
        renderSymbol();
        renderOverlay();
        renderMeter();
        renderCodewordInfo();
        scheduleAutoDecode();
    }

    function applyPreset(kind) {
        if (!state.encoded || state.sweeping) return;
        snapshot();
        var enc = state.encoded;
        var rand = mulberry32(0x51ed270b ^ (kind.length * 2654435761) ^ enc.totalCodewords);
        var d = state.damage;
        var row, cell;

        if (kind === 'row') {
            row = Math.floor(rand() * enc.height);
            for (cell = 0; cell < enc.columns; cell++) wipeCell(row, cell, d);
        } else if (kind === 'column') {
            cell = Math.floor(rand() * enc.columns);
            for (row = 0; row < enc.height; row++) wipeCell(row, cell, d);
        } else if (kind === 'cover') {
            row = Math.floor(rand() * Math.max(1, enc.height - 3));
            for (var i = 0; i < 3 && row + i < enc.height; i++) {
                for (cell = 0; cell < enc.columns; cell++) wipeCell(row + i, cell, d);
                wipeIndicator(row + i, 'left', d);
                wipeIndicator(row + i, 'right', d);
            }
        } else if (kind === 'left' || kind === 'right') {
            for (row = 0; row < enc.height; row++) wipeIndicator(row, kind, d);
        } else if (kind === 'guard') {
            for (row = 0; row < enc.height; row++) {
                wipeGuard(row, 'start', d);
                wipeGuard(row, 'stop', d);
            }
        }
        analytics.action('pdf417_damage_applied', { type: kind, level: state.level });
        damageChanged();
    }

    /* A seeded permutation of the codeword cells, so a percentage always wipes
       the same cells and a sweep accumulates instead of reshuffling. */
    function shuffledCells(seed) {
        var enc = state.encoded;
        var total = enc.columns * enc.height;
        var order = new Array(total);
        for (var i = 0; i < total; i++) order[i] = i;
        var rand = mulberry32(seed);
        for (var j = total - 1; j > 0; j--) {
            var k = Math.floor(rand() * (j + 1));
            var tmp = order[j]; order[j] = order[k]; order[k] = tmp;
        }
        return order;
    }

    /* Wipe the first `count` cells of a seeded permutation. Wiping is
       idempotent, so a sweep can call this with a growing count and land on an
       exact corrupted-codeword total instead of a rounded percentage. */
    function wipeSequential(count, seed) {
        var enc = state.encoded;
        var order = shuffledCells(seed);
        var d = state.damage;
        var limit = Math.min(order.length, count);
        for (var i = 0; i < limit; i++) {
            var index = order[i];
            wipeCell(Math.floor(index / enc.columns), index % enc.columns, d);
        }
    }

    function applyRandomDamage(percent, seed) {
        var total = state.encoded.columns * state.encoded.height;
        wipeSequential(Math.round(total * percent / 100), seed);
    }

    function randomDamage() {
        if (!state.encoded || state.sweeping) return;
        snapshot();
        var percent = Number(els.randomRange.value);
        applyRandomDamage(percent, 1000 + percent);
        analytics.action('pdf417_damage_applied', { type: 'random', percent: percent, level: state.level });
        damageChanged();
    }

    function clearDamage(recordUndo) {
        if (!state.encoded) return;
        if (recordUndo !== false) snapshot();
        state.damage = new Uint8Array(state.encoded.width * state.encoded.height);
        state.estimate = null;
        damageChanged();
    }

    function undo() {
        if (!state.undo.length) return;
        state.damage = state.undo.pop();
        els.btnUndo.disabled = state.undo.length === 0;
        damageChanged();
    }

    /* ------------------------------------------------------------------ *
     * Budget meter
     * ------------------------------------------------------------------ */
    function renderMeter() {
        var enc = state.encoded;
        if (!enc) return;
        var info = currentCorruption();
        var budget = enc.repairBudget;
        var total = enc.totalCodewords;

        els.damagePct.textContent = (info.estimated ? '≈' : '') + info.cells;
        els.budgetText.textContent = 'of ' + total + ' codewords · budget ' + budget;

        var fill = Math.min(100, (info.cells / total) * 100);
        els.budgetFill.style.width = fill.toFixed(2) + '%';
        els.budgetCap.style.left = Math.min(100, (budget / total) * 100).toFixed(2) + '%';
        els.budgetCapErasure.style.left = Math.min(100, (enc.ecCodewords / total) * 100).toFixed(2) + '%';
        var track = els.budgetCap.parentNode;
        if (track) track.className = 'budget-track' + (info.cells > budget ? ' over' : '');

        /* Two bounds, not one. ⌊k/2⌋ is the unknown-error bound; k is the
           erasure bound, which a reader can use when it can tell *which*
           codewords are unreadable — and a wiped cell is unreadable by
           construction, so the reader often beats the halved number. */
        var parts = [];
        if (info.cells === 0) {
            parts.push('No damage yet — ' + budget + ' unknown errors or ' + enc.ecCodewords
                + ' erasures are repairable at level ' + enc.ecLevel + '.');
        } else if (info.estimated) {
            /* A capture defect is measured by sampling pixels, which is a
               proxy: it cannot know which codewords the reader will actually
               fail to read, so it must not be dressed up as a budget verdict. */
            parts.push('≈' + info.cells + ' codewords look corrupted in the render (' + info.dataCells
                + ' data, ' + info.parityCells + ' parity) — a pixel estimate, not a budget verdict. '
                + 'The reader samples the same modules with more care than a centre-pixel test.');
        } else if (info.cells <= budget) {
            parts.push(info.cells + ' corrupted (' + info.dataCells + ' data, ' + info.parityCells
                + ' parity) · ' + (budget - info.cells) + ' left before the ⌊k/2⌋ error bound.');
        } else if (info.cells <= enc.ecCodewords) {
            parts.push(info.cells + ' corrupted (' + info.dataCells + ' data, ' + info.parityCells
                + ' parity) · past the ⌊k/2⌋ error bound, inside the ' + enc.ecCodewords
                + '-erasure bound — it depends on whether the reader can tell which codewords are gone.');
        } else {
            parts.push(info.cells + ' corrupted (' + info.dataCells + ' data, ' + info.parityCells
                + ' parity) · past the ' + enc.ecCodewords + '-erasure bound as well.');
        }
        els.budgetNote.textContent = parts.join('');
        els.budgetNote.className = 'budget-note' + (info.cells > budget ? ' over' : '');

        var warnings = [];
        if (info.leftRows || info.rightRows) {
            var sides = [];
            if (info.leftRows) sides.push('left in ' + info.leftRows + ' ' + plural(info.leftRows, 'row', 'rows'));
            if (info.rightRows) sides.push('right in ' + info.rightRows + ' ' + plural(info.rightRows, 'row', 'rows'));
            var both = info.leftRows > 0 && info.rightRows > 0;
            warnings.push('Row indicators damaged (' + sides.join(', ') + ') — they carry the row number, the '
                + 'symbol size and the level. Every row repeats that at both ends, so one side alone is usually '
                + 'recoverable; ' + (both ? 'both sides gone leaves the grid with nothing to rebuild it from, and no '
                    + 'parity protects geometry.' : 'the reader can fall back to the other end.'));
        }
        if (info.startRows || info.stopRows) {
            var guards = [];
            if (info.startRows) guards.push('start in ' + info.startRows + ' ' + plural(info.startRows, 'row', 'rows'));
            if (info.stopRows) guards.push('stop in ' + info.stopRows + ' ' + plural(info.stopRows, 'row', 'rows'));
            warnings.push('Guard patterns damaged (' + guards.join(', ') + ') — a PDF417 row begins and ends '
                + 'with them, and Reed-Solomon cannot rebuild a row the reader cannot find.');
        }
        if (warnings.length) {
            els.functionWarn.textContent = warnings.join(' ');
            els.functionWarn.hidden = false;
        } else {
            els.functionWarn.hidden = true;
        }

        els.btnUndo.disabled = state.undo.length === 0;
    }

    /* ------------------------------------------------------------------ *
     * Cell inspection (click without dragging)
     * ------------------------------------------------------------------ */
    function renderCodewordInfo() {
        var enc = state.encoded;
        if (!enc) return;
        var s = state.selected;
        if (!s) return;
        var cell = enc.cells[s.row][s.col];
        var label = {
            length: 'the symbol length descriptor',
            data: 'a payload codeword',
            pad: 'a padding codeword (900)',
            parity: 'a Reed-Solomon parity codeword'
        }[cell.role];
        var hit = '';
        for (var k = 0; k < 17; k++) {
            if (isModuleDamaged(s.row, 34 + s.col * 17 + k)) { hit = ' · damaged'; break; }
        }
        els.codewordInfo.textContent = 'Row ' + s.row + ', column ' + s.col + ' — codeword ' + cell.index
            + ': ' + label + ', value ' + cell.value + hit;
    }

    function selectCellAt(row, cell) {
        var enc = state.encoded;
        if (!enc || row < 0 || row >= enc.height || cell < 0 || cell >= enc.columns) {
            state.selected = null;
        } else {
            state.selected = { row: row, col: cell };
        }
        renderOverlay();
        renderCodewordInfo();
        if (!state.selected) {
            els.codewordInfo.textContent = 'Click a cell to see the codeword it carries.';
        }
    }

    /* ------------------------------------------------------------------ *
     * Pointer painting
     * ------------------------------------------------------------------ */
    function toGrid(event) {
        var enc = state.encoded;
        var rect = els.print.getBoundingClientRect();
        var x = (event.clientX - rect.left) / rect.width * els.print.width;
        var y = (event.clientY - rect.top) / rect.height * els.print.height;
        var px = enc.modulePx;
        var col = Math.floor(x / px) - QUIET;
        var row = Math.floor(y / (px * ROWMULT)) - QUIET;
        if (row < 0 || row >= enc.height || col < 0 || col >= enc.width) return null;
        return { row: row, col: col };
    }

    var painting = false;
    var paintedThisStroke = false;

    function paintAt(event) {
        var enc = state.encoded;
        var point = toGrid(event);
        if (!point || !enc) return;
        var d = state.damage;

        if (point.col < 17 || point.col >= enc.width - 18) {
            /* The guard patterns are not codewords, so a stroke nicks them
               module by module instead of wiping a whole cell. */
            var i = point.row * enc.width + point.col;
            d[i] = enc.matrix[point.row].charAt(point.col) === '1' ? 2 : 1;
        } else if (point.col < 34) {
            wipeIndicator(point.row, 'left', d);
        } else if (point.col >= enc.width - 35) {
            wipeIndicator(point.row, 'right', d);
        } else {
            var cell = Math.floor((point.col - 34) / 17);
            wipeCellRange(point.row, cell, state.brush, d);
        }
        paintedThisStroke = true;
        damageChanged();
    }

    els.print.addEventListener('pointerdown', function (event) {
        if (state.sweeping) return;
        event.preventDefault();
        var before = state.damage.slice();
        painting = true;
        paintedThisStroke = false;
        els.print.setPointerCapture(event.pointerId);
        paintAt(event);
        if (paintedThisStroke) {
            state.undo.push(before);
            if (state.undo.length > 30) state.undo.shift();
        }
    });

    els.print.addEventListener('pointermove', function (event) {
        if (!painting) return;
        paintAt(event);
    });

    els.print.addEventListener('pointerup', function (event) {
        if (!painting) return;
        painting = false;
        try { els.print.releasePointerCapture(event.pointerId); } catch (_) { }
        var point = toGrid(event);
        if (point && point.col >= 34 && point.col < state.encoded.width - 35) {
            selectCellAt(point.row, Math.floor((point.col - 34) / 17));
        }
    });

    els.print.addEventListener('pointercancel', function () { painting = false; });

    /* ------------------------------------------------------------------ *
     * Decoding
     * ------------------------------------------------------------------ */
    function setStatus(text, tone) {
        els.decodeStatus.textContent = text;
        els.decodeStatus.className = 'status-line' + (tone ? ' ' + tone : '');
    }

    function scheduleAutoDecode() {
        /* Always drop a queued decode first: a timer armed just before a sweep
           must not fire afterwards and replace the sweep's table with one row. */
        clearTimeout(autoDecodeTimer);
        if (!els.decodeAuto.checked || state.sweeping) return;
        autoDecodeTimer = setTimeout(function () { decodeNow('live'); }, 450);
    }

    function logRow(corrupted, verdict, ms, source, tone, image) {
        els.logEmpty.hidden = true;
        /* The log holds exactly one experiment. An interactive decode replaces
           whatever is there — including a finished sweep table — and a sweep
           run starts from an empty table, so its rows read as one run-up. */
        if (source.indexOf('sweep') !== 0) {
            els.logTbody.innerHTML = '';
        }
        var tr = document.createElement('tr');
        tr.className = 'result-' + tone;
        tr.innerHTML = '<td>' + corrupted + '</td><td class="result">' + escapeHtml(verdict) + '</td>'
            + '<td>' + (ms === null ? '—' : ms + ' ms') + '</td>'
            + '<td class="source">' + escapeHtml(source) + '</td>'
            + imageCell(image);
        els.logTbody.insertBefore(tr, els.logTbody.firstChild);
        while (els.logTbody.children.length > 14) {
            els.logTbody.removeChild(els.logTbody.lastChild);
        }
    }

    /* The image column: every row keeps the render it decoded as a PNG it can
       hand back, so a sweep's steps stay comparable after the canvas moves on. */
    function imageCell(image) {
        if (!image) return '<td class="image"></td>';
        return '<td class="image"><a class="row-download" href="' + escapeHtml(image.url)
            + '" download="' + escapeHtml(image.name)
            + '" title="Download the exact render this row decoded, as a PNG">Download</a></td>';
    }

    function rowFilename(corrupted, source) {
        var slug = String(source).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        return 'pdf417-L' + state.encoded.ecLevel + '-' + state.encoded.columns + 'x' + state.encoded.rows
            + '-' + corrupted + 'cw' + (slug ? '-' + slug : '') + '.png';
    }

    function renderReaderFacts(details) {
        if (!details) {
            els.readerFacts.hidden = true;
            return;
        }
        var enc = state.encoded;
        var rows = [];
        rows.push(['Reader rows', details.rows == null ? 'not reported' : String(details.rows)]);
        rows.push(['Reader columns', details.columns == null ? 'not reported' : String(details.columns)]);
        rows.push(['Reader level', details.errorCorrectionLevel == null ? 'not reported'
            : String(details.errorCorrectionLevel)]);
        rows.push(['Row indicators', (details.hasLeftRowIndicator ? 'left' : '')
            + (details.hasLeftRowIndicator && details.hasRightRowIndicator ? ' + ' : '')
            + (details.hasRightRowIndicator ? 'right' : '')
            + (!details.hasLeftRowIndicator && !details.hasRightRowIndicator ? 'none reported' : '')]);
        rows.push(['Codewords read', details.codewords && details.codewords.length
            ? String(details.codewords.length) : 'not reported']);
        var agree = details.rows === enc.rows && details.columns === enc.columns
            && details.errorCorrectionLevel === enc.ecLevel;
        rows.push(['Matches encoder', agree ? 'yes — same geometry and level' : 'no']);
        els.readerFacts.innerHTML = rows.map(function (pair) {
            return '<dt>' + pair[0] + '</dt><dd>' + escapeHtml(pair[1]) + '</dd>';
        }).join('');
        els.readerFacts.hidden = false;
    }

    async function decodeNow(sourceLabel) {
        if (state.sweeping && sourceLabel.indexOf('sweep') !== 0) return;
        var enc = state.encoded;
        if (!enc) return;
        setStatus('Decoding…');
        var startedAt = performance.now();
        var snapshotImage = null;
        try {
            var cvr = await engine();
            var W = els.print.width, H = els.print.height;
            var image = els.print.getContext('2d').getImageData(0, 0, W, H);
            var info = currentCorruption();
            var rowCount = info.cells;
            snapshotImage = {
                url: els.print.toDataURL('image/png'),
                name: rowFilename(rowCount, sourceLabel)
            };
            /* Canvas ImageData is RGBA in memory, which is the ABGR_8888 byte
               order the SDK wants. A fresh buffer per call: capture can detach
               the one it is given. */
            var result = await feedback.run('Decoding…', function () {
                return cvr.capture({
                    bytes: new Uint8Array(image.data),
                    width: W, height: H, stride: W * 4, format: 10
                }, 'ReadBarcodes_Default');
            });
            var ms = Math.round(performance.now() - startedAt);
            var items = (result.items || []).filter(function (item) { return item.type === 2; });
            var pdf = null;
            for (var i = 0; i < items.length; i++) {
                if (/^pdf417$/i.test(items[i].formatString || '')) { pdf = items[i]; break; }
            }
            if (!pdf) {
                for (var j = 0; j < items.length; j++) {
                    if (/pdf417/i.test(items[j].formatString || '')) { pdf = items[j]; break; }
                }
            }

            if (pdf) {
                var match = pdf.text === state.text;
                logRow(rowCount, match ? '✓ decoded — matches payload'
                    : '✓ decoded — "' + shorten(pdf.text, 22) + '"',
                    ms, sourceLabel, match ? 'ok' : 'mismatch', snapshotImage);
                setStatus(match
                    ? 'Decoded in ' + ms + ' ms — the payload came back intact with '
                    + rowCount + ' corrupted ' + plural(rowCount, 'codeword', 'codewords') + '.'
                    : 'Decoded in ' + ms + ' ms, but the text differs from the payload.', match ? 'ok' : 'bad');
                renderReaderFacts(pdf.details);
                analytics.action('pdf417_decode_succeeded', {
                    source: sourceLabel, level: state.level, corrupted: rowCount, match: match
                });
            } else {
                logRow(rowCount, '✗ no decode', ms, sourceLabel, 'bad', snapshotImage);
                /* Not every failure is the repair budget: say what the page
                   knows and leave the rest alone. */
                var cause = 'Decode failed in ' + ms + ' ms. ';
                if (info.startRows || info.stopRows) {
                    cause += 'The guard patterns are damaged, so the reader may not have found the rows at all.';
                } else if (info.leftRows || info.rightRows) {
                    cause += 'Row indicators are damaged, so row reconstruction may have failed before error correction.';
                } else if (rowCount > enc.repairBudget) {
                    cause += 'Corrupted codewords exceed the ' + enc.repairBudget + '-codeword budget.';
                } else {
                    cause += 'The budget was not exceeded, so detection or sampling failed first — exact cause not determined.';
                }
                setStatus(cause, 'bad');
                renderReaderFacts(null);
                analytics.action('pdf417_decode_failed', {
                    source: sourceLabel, level: state.level, corrupted: rowCount
                });
            }
        } catch (e) {
            var message = (e && e.message) || String(e);
            setStatus('Reader unavailable: ' + message + ' Everything except decoding still works.', 'bad');
            logRow(currentCorruption().cells, '— reader error', null, sourceLabel, 'bad', snapshotImage);
            renderReaderFacts(null);
        }
    }

    /* Corrupt whole codewords, one at a time, until the reader gives up. The
       x axis is the budget's own unit, so the failure point reads directly
       against ⌊EC/2⌋. */
    async function runSweep() {
        if (state.sweeping) return;
        var enc = state.encoded;
        if (!enc) return;
        state.sweeping = true;
        clearTimeout(autoDecodeTimer);
        setControlsBusy(true);
        els.stageHint.textContent = 'Sweeping codewords…';
        setStatus('Running the sweep — seeded renders decoded one by one.');

        var budget = Math.max(1, enc.repairBudget);
        var top = Math.max(2, Math.ceil(enc.ecCodewords * 1.15));
        var steps = [];
        for (var i = 0; i <= 11; i++) {
            var value = Math.round((top * i) / 11);
            if (!steps.length || steps[steps.length - 1] !== value) steps.push(value);
        }

        var applied = 0;
        try {
            els.logTbody.innerHTML = '';
            clearDamage(false);
            for (var s = 0; s < steps.length; s++) {
                var target = steps[s];
                if (target > applied) {
                    wipeSequential(target, 4242);
                    applied = target;
                }
                damageChanged();
                await decodeNow('sweep ' + target + ' cw');
            }
            setStatus('Sweep complete. Level ' + enc.ecLevel + ', ' + enc.columns + '×' + enc.rows
                + ', ' + enc.ecCodewords + ' parity codewords, budget ' + budget
                + '. Download any row\'s PNG to compare, or switch level and sweep again.');
        } finally {
            state.sweeping = false;
            setControlsBusy(false);
            els.stageHint.textContent = 'Drag on the symbol to wipe codeword cells';
        }
    }

    function setControlsBusy(busy) {
        els.btnSweep.disabled = busy;
        els.btnDecode.disabled = busy;
        els.btnRandom.disabled = busy;
        els.btnClear.disabled = busy;
        els.btnUndo.disabled = busy || state.undo.length === 0;
        els.btnRow.disabled = busy;
        els.btnColumn.disabled = busy;
        els.btnCover.disabled = busy;
        els.btnLeft.disabled = busy;
        els.btnRight.disabled = busy;
        els.btnGuard.disabled = busy;
        els.exportBtn.disabled = busy;
        els.payload.disabled = busy;
    }

    /* ------------------------------------------------------------------ *
     * Export
     * ------------------------------------------------------------------ */
    function exportPng() {
        if (!state.encoded) return;
        var info = currentCorruption();
        if (els.print.toBlob) {
            els.print.toBlob(function (blob) {
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = rowFilename(info.cells, 'export');
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
     * PDF417 anatomy card: every named region, in its own colour, with a
     * plain-language glossary. Hovering a term lights the region up.
     * ------------------------------------------------------------------ */
    var ANATOMY_REGIONS = [
        {
            kind: 'start', color: '#8c3b2a', tint: '#f2dcd6', term: 'Start pattern',
            text: '17 modules at the left of every row, in the pattern 8-1-1-1-1-1-1-3. It tells the reader '
                + 'that a row starts here and gives it the module width.'
        },
        {
            kind: 'indicator', color: '#2f6472', tint: '#d8e5e8', term: 'Row indicators',
            text: 'One codeword at each end of every row. They carry the row number, the number of rows and '
                + 'columns, and the error correction level — the geometry of the symbol, repeated per row.'
        },
        {
            kind: 'data', color: '#323234', tint: '#fbe6cd', term: 'Data region',
            text: 'The codewords themselves: the length descriptor, the payload, padding, then the '
                + 'Reed-Solomon parity. Placed left to right, top to bottom, one row at a time.'
        },
        {
            kind: 'stop', color: '#4d6b2f', tint: '#e2ead4', term: 'Stop pattern',
            text: '18 modules closing every row — one wider than the start pattern, so a scanner knows which '
                + 'end it is reading.'
        },
        {
            kind: 'quiet', color: '#8f9196', tint: '#efeff1', term: 'Quiet zone',
            text: 'Two modules of white on all four sides. A reader needs them to find the edges of the '
                + 'symbol against whatever it is printed on.'
        },
        {
            kind: 'rows', color: '#8b4f05', tint: '#f7e9d4', term: 'Row height',
            text: 'Each row is drawn at least three modules high, and a scanner reads a symbol by cutting '
                + 'through every row. This is why a horizontal scratch is worse than a vertical one.'
        }
    ];

    function anatomyKindAt(enc, col) {
        if (col < 17) return 'start';
        if (col < 34) return 'indicator';
        if (col >= enc.width - 18) return 'stop';
        if (col >= enc.width - 35) return 'indicator';
        return 'data';
    }

    function anatomyColors(kind) {
        for (var i = 0; i < ANATOMY_REGIONS.length; i++) {
            if (ANATOMY_REGIONS[i].kind === kind) return ANATOMY_REGIONS[i];
        }
        return ANATOMY_REGIONS[0];
    }

    function drawAnatomy(activeKind) {
        var enc = state.encoded;
        var canvas = els.anatomyCanvas;
        if (!enc) return;
        /* Size the canvas to the width it will be displayed at, so the module
           grid stays crisp instead of being upscaled by CSS. */
        var stage = canvas.parentNode;
        var display = Math.max(240, (stage ? stage.clientWidth : 480) - 20);
        var scale = Math.max(1, Math.min(5, Math.round(display / (enc.width + QUIET * 2))));
        var W = (enc.width + QUIET * 2) * scale;
        var H = (enc.height * ROWMULT + QUIET * 2) * scale;
        canvas.width = W;
        canvas.height = H;
        var ctx = canvas.getContext('2d');

        ctx.fillStyle = anatomyColors('quiet').tint;
        ctx.fillRect(0, 0, W, H);

        var top = QUIET * scale;
        var height = enc.height * ROWMULT * scale;

        /* One tinted band per region column, then the modules drawn in the
           region's ink: the anatomy reads like the barcode it explains. */
        var focus = activeKind === 'rows' || activeKind === 'quiet' ? null : activeKind;
        function band(from, width, kind) {
            var info = anatomyColors(kind);
            ctx.globalAlpha = !focus || focus === kind ? 1 : 0.25;
            ctx.fillStyle = info.tint;
            ctx.fillRect(from * scale, top, width * scale, height);
            ctx.globalAlpha = 1;
        }
        band(0, 17, 'start');
        band(17, 17, 'indicator');
        band(34, 17 * enc.columns, 'data');
        band(34 + 17 * enc.columns, 17, 'indicator');
        band(51 + 17 * enc.columns, 18, 'stop');

        ctx.globalAlpha = activeKind === 'rows' ? 0.6 : 1;
        for (var r = 0; r < enc.height; r++) {
            var bits = enc.matrix[r];
            var y = (r + QUIET) * ROWMULT * scale;
            for (var c = 0; c < enc.width; c++) {
                if (bits.charAt(c) !== '1') continue;
                var kind = anatomyKindAt(enc, c);
                ctx.globalAlpha = !focus || focus === kind ? 1 : 0.3;
                ctx.fillStyle = anatomyColors(kind).color;
                ctx.fillRect((c + QUIET) * scale, y, scale, ROWMULT * scale);
            }
        }
        ctx.globalAlpha = 1;

        if (activeKind === 'quiet') {
            ctx.strokeStyle = '#8f9196';
            ctx.lineWidth = 2;
            ctx.strokeRect(1, 1, W - 2, H - 2);
        }
        if (activeKind === 'rows') {
            ctx.strokeStyle = '#8b4f05';
            ctx.lineWidth = 1;
            for (var r2 = 0; r2 < enc.height; r2++) {
                ctx.beginPath();
                ctx.moveTo(top, (r2 + QUIET) * ROWMULT * scale + 0.5);
                ctx.lineTo(W - top, (r2 + QUIET) * ROWMULT * scale + 0.5);
                ctx.stroke();
            }
        }
    }

    function renderAnatomyLegend() {
        els.anatomyLegend.innerHTML = '';
        ANATOMY_REGIONS.forEach(function (item) {
            var wrap = document.createElement('div');
            wrap.className = 'anatomy-term';
            wrap.dataset.kind = item.kind;
            wrap.innerHTML = '<span class="swatch" style="background:' + item.color + ';border-color:' + item.color
                + '"></span><dt>' + escapeHtml(item.term) + '</dt><dd>' + escapeHtml(item.text) + '</dd>';
            wrap.addEventListener('mouseenter', function () { drawAnatomy(item.kind); });
            wrap.addEventListener('mouseleave', function () { drawAnatomy(null); });
            els.anatomyLegend.appendChild(wrap);
        });
    }

    /* ------------------------------------------------------------------ *
     * Controls
     * ------------------------------------------------------------------ */
    function setLevel(level) {
        if (state.level === level) return;
        state.level = level;
        renderLevelHint();
        if (!encodeNow()) return;
        renderSymbol();
        renderOverlay();
        renderFacts();
        renderLevelBars();
        renderMeter();
        renderAnatomyLegend();
        drawAnatomy(null);
        scheduleAutoDecode();
    }

    function reencode() {
        if (!encodeNow()) return;
        renderSymbol();
        renderOverlay();
        renderFacts();
        renderLevelBars();
        renderMeter();
        drawAnatomy(null);
        els.codewordInfo.textContent = 'Click a cell to see the codeword it carries.';
        scheduleAutoDecode();
    }

    function buildLevelChips() {
        els.levelChips.innerHTML = '';
        LEVELS.forEach(function (level) {
            var button = document.createElement('button');
            button.type = 'button';
            button.className = 'level-chip';
            button.dataset.level = String(level);
            button.setAttribute('role', 'radio');
            button.setAttribute('aria-checked', String(level === state.level));
            button.innerHTML = '<span class="level-num">' + level + '</span><span class="level-ec">'
                + Math.pow(2, level + 1) + '</span>';
            button.title = 'Level ' + level + ': ' + Math.pow(2, level + 1)
                + ' error correction codewords, ' + Math.pow(2, level) + ' repairable';
            button.addEventListener('click', function () {
                setLevel(level);
                analytics.action('pdf417_symbol_generated', { level: level });
            });
            els.levelChips.appendChild(button);
        });
    }

    function bindControls() {
        var payloadTimer = null;
        els.payload.addEventListener('input', function () {
            clearTimeout(payloadTimer);
            payloadTimer = setTimeout(function () {
                state.text = els.payload.value;
                reencode();
            }, 220);
        });

        els.structureToggle.addEventListener('change', renderOverlay);

        els.brushSizes.addEventListener('click', function (event) {
            var button = event.target.closest('.chip');
            if (!button) return;
            state.brush = Number(button.dataset.size);
            var chips = els.brushSizes.querySelectorAll('.chip');
            for (var i = 0; i < chips.length; i++) {
                chips[i].setAttribute('aria-checked', String(chips[i] === button));
            }
        });

        els.btnRow.addEventListener('click', function () { applyPreset('row'); });
        els.btnColumn.addEventListener('click', function () { applyPreset('column'); });
        els.btnCover.addEventListener('click', function () { applyPreset('cover'); });
        els.btnLeft.addEventListener('click', function () { applyPreset('left'); });
        els.btnRight.addEventListener('click', function () { applyPreset('right'); });
        els.btnGuard.addEventListener('click', function () { applyPreset('guard'); });

        els.randomRange.addEventListener('input', function () {
            els.randomValue.textContent = els.randomRange.value + '%';
        });
        els.btnRandom.addEventListener('click', randomDamage);
        els.btnUndo.addEventListener('click', undo);
        els.btnClear.addEventListener('click', function () { clearDamage(true); });

        els.pixelPreset.addEventListener('change', function () {
            state.pixelPreset = els.pixelPreset.value;
            damageChanged();
        });
        els.pixelAmount.addEventListener('input', function () {
            state.pixelAmount = Number(els.pixelAmount.value);
            els.pixelAmountValue.textContent = state.pixelAmount + '%';
            if (state.pixelPreset !== 'none') damageChanged();
        });

        els.decodeAuto.addEventListener('change', function () {
            if (els.decodeAuto.checked) scheduleAutoDecode();
        });
        els.btnDecode.addEventListener('click', function () { decodeNow('manual'); });
        els.btnSweep.addEventListener('click', runSweep);
        els.exportBtn.addEventListener('click', exportPng);

        els.levelBars.addEventListener('click', function (event) {
            var row = event.target.closest('.ec-bar-row');
            if (!row) return;
            setLevel(Number(row.dataset.level));
            analytics.action('pdf417_symbol_generated', { level: state.level });
        });
    }

    /* ------------------------------------------------------------------ *
     * Bootstrap
     * ------------------------------------------------------------------ */
    function boot() {
        if (!window.PDF417Encoder) {
            document.body.insertAdjacentHTML('afterbegin',
                '<p style="padding:1rem;font-weight:600;color:#b42318">The PDF417 encoder did not load.</p>');
            return;
        }
        buildLevelChips();
        renderLevelHint();
        state.text = els.payload.value;
        if (!encodeNow()) return;
        renderSymbol();
        renderOverlay();
        renderFacts();
        renderLevelBars();
        renderMeter();
        renderAnatomyLegend();
        drawAnatomy(null);
        bindControls();
        analytics.action('pdf417_demo_loaded', { level: state.level });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
