/*
 * Barcode Parameter Tuner
 * =======================
 *
 * A workbench for the Dynamsoft Barcode Reader parameter template. It answers the
 * question a plain scanner cannot: *which stage of the pipeline lost this barcode,
 * and which knob brings it back?*
 *
 * Three ideas hold the page together.
 *
 * 1. The template is always a document the SDK produced.
 *    `initSettings()` accepts a hand-written template and then `capture()` rejects
 *    it with `[-10038] ... BarcodeFormatIds: The parameter value is invalid or out
 *    of range` — naming the format list while the fault is elsewhere in the
 *    document. So every template here starts as `outputSettings(name, true)`, is
 *    edited in place, and is written back. See `loadTemplateInto()`.
 *
 * 2. The parameter panel is derived from that live document, not from a schema.
 *    `parameters.js` supplies labels, help text and enum lists; the *shape* of each
 *    value decides which control is drawn. A parameter the catalog has never heard
 *    of still gets an editor, which is what makes "every barcode parameter" true
 *    rather than aspirational.
 *
 * 3. Intermediate results are the diagnosis. `getIntermediateResultManager()`
 *    hands back the units each pipeline stage produced, and the stage strip renders
 *    them in pipeline order: the pre-processed images, the localization output, the
 *    candidate zones, the decoded barcodes. An empty stage is the finding — nothing
 *    downstream can recover a barcode localization never found.
 */
(function () {
    'use strict';

    /* ---------------------------------------------------------------- helpers */

    function $(id) {
        return document.getElementById(id);
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null) node.textContent = text;
        return node;
    }

    function clear(node) {
        while (node.firstChild) node.removeChild(node.firstChild);
    }

    function safeStringify(value, pretty) {
        var json = JSON.stringify(value, function (key, item) {
            return typeof item === 'bigint' ? item.toString() : item;
        }, pretty ? 2 : 0);
        return json === undefined ? 'null' : json;
    }

    function deepClone(value) {
        if (value === undefined) return undefined;
        return JSON.parse(safeStringify(value));
    }

    function isPlainObject(value) {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }

    function fmtNumber(value) {
        if (typeof value !== 'number' || !isFinite(value)) return String(value);
        if (Number.isInteger(value)) return String(value);
        return String(Math.round(value * 1000) / 1000);
    }

    function clamp(value, low, high) {
        return Math.min(high, Math.max(low, value));
    }

    function debounce(fn, wait) {
        var timer = null;
        return function () {
            var args = arguments;
            var self = this;
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () {
                timer = null;
                fn.apply(self, args);
            }, wait);
        };
    }

    // Local capture feedback works without additional scripts.
    var feedback = {
        begin: function () {},
        end: function () {},
        isBusy: function () { return false; },
        run: function (label, work) {
            return Promise.resolve(typeof work === 'function' ? work() : work);
        }
    };

    /* -------------------------------------------------------------- constants */

    var CODEPOOL_HOSTS = ['dynamsoft.com'];
    var CODEPOOL_LICENSE_KEY = 'DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAwLTEwMTY0ODQ5MCIsIm1haW5TZXJ2ZXJVUkwiOiJodHRwczovL21sdHMuZHluYW1zb2Z0LmNvbS8iLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMCIsInN0YW5kYnlTZXJ2ZXJVUkwiOiJodHRwczovL3NsdHMuZHluYW1zb2Z0LmNvbS8iLCJjaGVja0NvZGUiOjE0MDA4MDY1Mjl9';
    var LOCAL_LICENSE_KEY = 'DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==';
    var SDK_CDN_ROOT = 'https://cdn.jsdelivr.net/npm/';

    var ENTRY_TEMPLATE = 'ReadBarcodes_Default';
    var ENTRY_SAMPLE = 'multiple-symbologies-multiple-barcodes-9.jpg';
    var CRIT_BARCODE = 2;
    var IPF_ABGR_8888 = 10;
    var MAX_SHAPES_DRAWN = 1200;
    var EDIT_DEBOUNCE_MS = 320;
    var THUMB_W = 96;
    var THUMB_H = 64;
    var MAX_CROP_UNITS = 24;

    var PIXEL_FORMAT_NAMES = {
        0: 'IPF_BINARY', 1: 'IPF_BINARYINVERTED', 2: 'IPF_GRAYSCALED', 3: 'IPF_NV21',
        4: 'IPF_RGB_565', 5: 'IPF_RGB_555', 6: 'IPF_RGB_888', 7: 'IPF_ARGB_8888',
        8: 'IPF_RGB_161616', 9: 'IPF_ARGB_16161616', 10: 'IPF_ABGR_8888',
        11: 'IPF_ABGR_16161616', 12: 'IPF_BGR_888', 13: 'IPF_BINARY_8',
        14: 'IPF_NV12', 15: 'IPF_BINARY_8_INVERTED'
    };

    /*
     * The name says what the format claims to be; the note says what it means
     * when you look at the picture. Where this build contradicts its own name
     * (measured: IPF_RGB_888 arrives B,G,R), the note states the measured
     * truth instead of repeating the label.
     */
    var PIXEL_FORMAT_NOTES = {
        0: 'one bit per pixel \u2014 ink is 1, paper is 0',
        1: 'one bit per pixel with the polarity flipped \u2014 paper is 1',
        2: 'one byte per pixel, brightness only: colour is gone from here on',
        3: 'YUV 4:2:0 (NV21), converted to RGB for this thumbnail',
        6: 'three bytes per pixel, handed over B,G,R despite the RGB name',
        7: 'four bytes per pixel, A,R,G,B',
        10: 'four bytes per pixel, A,B,G,R \u2014 the order a canvas uses',
        12: 'three bytes per pixel, B,G,R',
        13: 'one byte per pixel, each either 0 or 255 \u2014 the binarised image',
        15: 'one byte per pixel, 0 or 255, with the polarity flipped'
    };

    var CATALOG = window.ParamCatalog || {};
    var PARAMS = CATALOG.PARAMS || {};
    var ENUMS = CATALOG.ENUMS || {};
    var STAGES = CATALOG.STAGES || [];
    var GROUPS = CATALOG.GROUPS || [];
    var MODE_ARRAY_PARAMS = CATALOG.MODE_ARRAY_PARAMS || [];
    var RANGE_PARAMS = CATALOG.RANGE_PARAMS || [];
    var MODE_SUBPARAMS = CATALOG.MODE_SUBPARAMS || {};
    var MODE_ENTRY_TEMPLATE = CATALOG.MODE_ENTRY_TEMPLATE || {};

    /*
     * One-click starting points. Each is a small set of edits that the parameter
     * reference or the template-optimizer notes call out as a first thing to try,
     * so a visitor with a hard image is not left staring at 300 controls.
     */
    var RECIPES = [
        {
            id: 'inverted', label: 'Also try inverted',
            help: 'Adds GTM_INVERTED so a light-on-dark symbol becomes visible.',
            apply: function (ctx) {
                return ctx.addMode('ImageParameterOptions', 'GrayscaleTransformationModes', 'GTM_INVERTED');
            }
        },
        {
            id: 'equalize', label: 'Boost contrast',
            help: 'Adds histogram equalization plus sharpen-and-smooth before binarization.',
            apply: function (ctx) {
                return ctx.addMode('ImageParameterOptions', 'GrayscaleEnhancementModes', 'GEM_GRAY_EQUALIZE')
                    + ctx.addMode('ImageParameterOptions', 'GrayscaleEnhancementModes', 'GEM_SHARPEN_SMOOTH');
            }
        },
        {
            id: 'all-localization', label: 'Diagnostic: wider localization',
            help: 'Use only after the binary image looks readable but no candidate zone is found.',
            apply: function (ctx) {
                return ctx.setModeList('BarcodeReaderTaskSettingOptions', 'LocalizationModes', [
                    'LM_CONNECTED_BLOCKS', 'LM_STATISTICS', 'LM_LINES', 'LM_SCAN_DIRECTLY',
                    'LM_CENTRE', 'LM_STATISTICS_MARKS', 'LM_NEURAL_NETWORK'
                ]);
            }
        },
        {
            id: 'deep-deblur', label: 'Harder deblur',
            help: 'Writes an explicit DeblurModes list ending with deep analysis.',
            apply: function (ctx) {
                return ctx.setModeList('BarcodeReaderTaskSettingOptions', 'DeblurModes', [
                    'DM_BASED_ON_LOC_BIN', 'DM_THRESHOLD_BINARIZATION', 'DM_DIRECT_BINARIZATION',
                    'DM_GRAY_EQUALIZATION', 'DM_SMOOTHING', 'DM_SHARPENING', 'DM_SHARPENING_SMOOTHING',
                    'DM_MORPHING', 'DM_DEEP_ANALYSIS'
                ]);
            }
        },
        {
            id: 'damaged', label: 'Damaged or warped symbol',
            help: 'Tests only deformation resistance. If it helps, keep it before testing barcode complement separately.',
            apply: function (ctx) {
                return ctx.setModeList('BarcodeReaderTaskSettingOptions', 'DeformationResistingModes', ['DRM_GENERAL']);
            }
        },
        {
            id: 'rescue-small', label: 'Rescue a tiny symbol',
            help: 'Tests only barcode-scale interpolation. Compare the candidate crop before changing image scaling too.',
            apply: function (ctx) {
                return ctx.setField('BarcodeReaderTaskSettingOptions', 'BarcodeScaleModes', [{
                    Mode: 'BSM_LINEAR_INTERPOLATION', ModuleSizeThreshold: 4,
                    TargetModuleSize: 8, AcuteAngleWithXThreshold: -1
                }]);
            }
        },
        {
            id: 'patient', label: 'Give it more time',
            help: 'Raises only the per-image timeout to 60 s. A new decode then means the search was timing out.',
            apply: function (ctx) {
                return ctx.setField('CaptureVisionTemplates', 'Timeout', 60000);
            }
        },
        {
            id: 'complement', label: 'Repair incomplete modules',
            help: 'Tests only BarcodeComplementModes for a clipped or physically damaged symbol.',
            apply: function (ctx) {
                return ctx.setModeList('BarcodeReaderTaskSettingOptions', 'BarcodeComplementModes', ['BCM_GENERAL']);
            }
        },
        {
            id: 'keep-text', label: 'Keep nearby text',
            help: 'Disables text-zone erasure. Useful when text removal is erasing a rotated barcode region.',
            apply: function (ctx) {
                return ctx.setField('ImageParameterOptions', 'IfEraseTextZone', 0);
            }
        },
        {
            id: 'every-format', label: 'Diagnostic: all formats',
            help: 'Use only when the symbology is unknown. It is slower and can admit a wrong symbology.',
            apply: function (ctx) {
                return ctx.setField('BarcodeReaderTaskSettingOptions', 'BarcodeFormatIds', ['BF_ALL']);
            }
        }
    ];

    /* ------------------------------------------------------------------ state */

    var state = {
        ready: false,
        cvr: null,
        irManager: null,
        licenseKey: null,
        licenseProfile: null,
        wasmLoaded: false,
        activationPromise: null,

        template: null,
        templateName: ENTRY_TEMPLATE,
        templateIncludesDefaults: true,
        baseline: null,
        model: null,

        /*
         * Every preset the SDK ships, read once before anything is applied. This is
         * not a cache for speed: `initSettings()` REPLACES the whole template set, so
         * after the first apply `outputSettings('ReadBarcodes_SpeedFirst')` fails with
         * [-10036] "The template name is invalid" and `getTemplateNames()` reports one
         * template. Reading them all up front is the only way to keep them switchable.
         */
        templates: [],

        owners: [],
        changed: {},

        source: null,
        sourceLabel: '',
        cameraStream: null,
        cameraActive: false,

        units: {},
        unitInfo: {},
        /* Unique candidate-processing snapshots retained per stage. */
        unitGroups: {},
        cropFingerprints: {},
        selectedCrop: {},
        /* The group open/closed state from before a search started opening them. */
        paramFilterOpen: null,
        /* How many of this stage's crops were matched to a located region this render. */
        cropAreas: { total: 0, matched: 0 },
        /* How many unique crops each stage delivered, including those over the display cap. */
        arrivals: {},
        originalWidth: 0,
        originalHeight: 0,
        selectedStage: 'final',
        showRoi: false,
        lastResult: null,

        // Ground truth for the bundled samples (see loadGroundTruth) and the
        // last expected-vs-decoded comparison, kept so the preview overlay and
        // the results panel cannot disagree about what was missed.
        groundTruth: null,
        groundTruthPromise: null,
        expected: null,
        compare: null,

        // Auto-run: on by default, so an edit reaches the results without a
        // second thought. With it off, changes wait for the Run button.
        autoRun: true,
        changesPending: false,
        missingOpen: false,

        runToken: 0,
        runActive: false,
        runPending: null,
        fieldNodes: {},
        log: []
    };

    var dom = {};

    function cacheDom() {
        [
            'loading-overlay', 'loading-text', 'sdk_badge', 'sdk_badge_text',
            'sample_select', 'pick_file', 'source_title', 'source_meta',
            'camera_toggle', 'camera_shoot', 'camera_video', 'camera_note',
            'template_select', 'run_button', 'reset_button',
            'reload_button', 'preview_base', 'preview_overlay', 'preview_caption',
            'preview_status', 'preview_wrap', 'stage_strip', 'stage_empty',
            'stage_missing', 'diagnosis_summary', 'auto_run', 'auto_run_hint',
            'stage_detail', 'result_body', 'result_summary', 'run_log',
            'param_search', 'only_changed', 'param_groups', 'param_count', 'param_filter_status',
            'json_editor', 'json_status', 'json_apply', 'json_copy', 'json_download',
            'json_card', 'changes_download', 'changes_copy', 'export_jump',
            'json_revert', 'roi_toggle', 'roi_hint', 'recipe_list', 'recipe_help',
            'compare_button', 'compare_status', 'compare_body'
        ].forEach(function (id) {
            dom[id] = $(id);
        });
    }

    /* ------------------------------------------------------------------- boot */

    function hostMatches(host, allowed) {
        return allowed.some(function (bound) {
            return host === bound || host.endsWith('.' + bound);
        });
    }

    // Use the hosted demo key on dynamsoft.com and the SDK trial key elsewhere.
    /*
     * A licence supplied by the page. The two built-in keys cover the bound domain and
     * the self-hoster's trial; this covers the rest — a key of your own, or a key that
     * is not server-validated and therefore usable on an origin without a secure
     * context (see `originLicenseMessage`). Explicit rather than a UI input: the
     * migration SOP drops the key box on purpose, and the page opens straight onto a
     * template.
     *
     * Note the trade-off: a key in the URL lands in history. It is meant for local
     * work, and `localStorage['dy-demo-license']` is there for anyone who minds.
     */
    function suppliedLicense() {
        var fromQuery = null;
        try {
            fromQuery = new URLSearchParams(window.location.search).get('license');
        } catch (ex) {
            fromQuery = null;
        }
        if (fromQuery) return fromQuery;
        try {
            return window.localStorage.getItem('dy-demo-license');
        } catch (ex) {
            return null;
        }
    }

    function resolveLicense() {
        var supplied = suppliedLicense();
        if (supplied) {
            console.info('[demo] Using a licence supplied by the page ('
                + supplied.slice(0, 8) + '\u2026).');
            return { key: supplied, profile: 'supplied' };
        }
        var host = window.location.hostname.toLowerCase();
        if (hostMatches(host, CODEPOOL_HOSTS)) {
            return { key: CODEPOOL_LICENSE_KEY, profile: 'codepool' };
        }
        console.info('[demo] Using the SDK trial license: the Codepool license is bound to '
            + CODEPOOL_HOSTS.join(', ') + ' and cannot activate on "' + host + '".');
        // The trial key is an *online* key: the SDK exchanges it with the licence
        // server through `crypto.subtle`, which requires HTTPS or localhost.

        return { key: LOCAL_LICENSE_KEY, profile: 'trial' };
    }

    function showLoading(text) {
        dom['loading-overlay'].classList.remove('hidden');
        if (text) dom['loading-text'].textContent = text;
    }

    function hideLoading() {
        dom['loading-overlay'].classList.add('hidden');
    }

    function setBadge(kind, text) {
        dom['sdk_badge'].className = 'sdk-badge ' + kind;
        dom['sdk_badge_text'].textContent = text;
    }

    function logRun(level, message) {
        state.log.push({ level: level, message: message, at: new Date() });
        if (state.log.length > 60) state.log.shift();
        renderRunLog();
    }

    function renderRunLog() {
        var box = dom['run_log'];
        clear(box);
        if (!state.log.length) {
            box.appendChild(el('p', 'hint', 'Nothing has run yet.'));
            return;
        }
        state.log.slice().reverse().forEach(function (entry) {
            var row = el('div', 'log-row log-' + entry.level);
            row.appendChild(el('span', 'log-time', entry.at.toLocaleTimeString()));
            row.appendChild(el('span', 'log-message', entry.message));
            box.appendChild(row);
        });
    }

    /*
     * Why any server-validated licence dies on a non-secure origin.
     *
     * Read from bundle 11.6.3200, the licence module classifies the key and then gates
     * every class except one on the crypto API:
     *
     *     T = 0   offline / device-bound key (`DLC2…`, or the internal t…/f… markers)
     *     T = 1   online key       (`200001-…`, the public trial key)
     *     T = 2   server-checked   (a `DLS2…` key with an organizationID, e.g. Codepool's)
     *     if (T && !crypto.subtle) throw new Error("Require https to use online key…")
     *
     * `if (T && …)` is false only for T = 0, so **both** the trial key and the Codepool
     * key are refused on `http://192.168.x.x` — measured, not inferred: supplying the
     * Codepool key through ?license= produced the identical error. Only a key that
     * needs no handshake at all can activate off a secure context, and for a web page
     * that in practice means https (or localhost).
     *
     * The camera is hidden on those origins for the same reason, licence or no licence:
     * `navigator.mediaDevices` does not exist off a secure context.
     */
    function originLicenseMessage(sdkMessage) {
        return 'The barcode engine could not start on ' + window.location.origin
            + ' \u2014 ' + sdkMessage
            + '\n\nThe SDK needs the browser\u2019s crypto API to validate a licence, and browsers '
            + 'only expose it on https, localhost or file origins. That covers every licence with a '
            + 'server handshake \u2014 the public trial key this page falls back to *and* the '
            + 'Codepool key, which is why swapping keys does not help here. Only a key that needs no '
            + 'handshake at all can activate on this origin.\n\nWays forward: '
            + '(1) open the page on this machine as http://localhost:<port>; '
            + '(2) serve it over https \u2014 `python demos/serve-https.py` serves this repository '
            + 'with a certificate covering this address, and `tailscale serve` gives a real trusted '
            + 'certificate with nothing to install; '
            + '(3) pass ?license=<key> (or set localStorage[\'dy-demo-license\']) if you have a key '
            + 'that works without the handshake.'
            + '\n\nOne more thing this origin blocks, licence or no licence: the camera, because '
            + 'navigator.mediaDevices is missing here too.';
    }

    async function activateDynamsoft() {
        if (state.ready) return;
        if (state.activationPromise) return state.activationPromise;

        state.activationPromise = (async function () {
            var startedAt = performance.now();
            showLoading('Initializing Dynamsoft Barcode Reader\u2026');
            try {
                var license = resolveLicense();
                state.licenseKey = license.key;
                state.licenseProfile = license.profile;

                /* Make the Worker/WASM origin deterministic. Script-tag path
                   inference is fragile when this demo is mounted at `/`. */
                Dynamsoft.Core.CoreModule.engineResourcePaths.rootDirectory = SDK_CDN_ROOT;
                await Dynamsoft.License.LicenseManager.initLicense(state.licenseKey, true);

                if (!state.wasmLoaded) {
                    await Dynamsoft.Core.CoreModule.loadWasm(['DBR']);
                    state.wasmLoaded = true;
                }

                state.cvr = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();
                await attachIntermediateResults();

                state.ready = true;
                setBadge('badge-active', 'Active');


                await populateTemplateList();
                await loadGroundTruth();
                await loadTemplateInto(ENTRY_TEMPLATE);

                hideLoading();
                if (state.source) requestRun('first run');
            } catch (ex) {
                console.error(ex);
                state.activationPromise = null;
                setBadge('badge-inactive', 'Failed');
                var message = (ex && (ex.message || ex.errorString)) || String(ex);
                // Only the online-key handshake fails this way. Matched narrowly so a
                // genuine licence rejection on a secure origin keeps the SDK's wording.
                var onlineKeyBlocked = !window.isSecureContext
                    && /online key/i.test(message);
                if (onlineKeyBlocked) {
                    showLoading(originLicenseMessage(message));
                    logRun('bad', 'The trial licence is an online key and this origin is not a '
                        + 'secure context (' + window.location.origin + '). See the overlay.');
                } else {
                    showLoading('Dynamsoft Barcode Reader failed to load: ' + message);
                }

            }
        })();

        return state.activationPromise;
    }

    /* --------------------------------------------------- intermediate results */

    /*
     * Every stage callback is registered, plus the generic `onTaskResultsReceived`
     * as a fallback: which shape a given build delivers is not pinned down by the
     * documentation, so both are accepted and stored under the same stage id.
     * `unitType` is a BigInt, so it is matched against the exported name table
     * rather than turned into a number.
     */
    async function attachIntermediateResults() {
        state.irManager = state.cvr.getIntermediateResultManager();

        /*
         * The receiver has to be an instance of the SDK's own class:
         * `addResultReceiver` rejects a plain object with "Invalid Intermediate
         * Result Receiver", and the class carries private observation state that a
         * literal cannot fake. The callbacks are then assigned onto the instance,
         * which is what the API expects.
         */
        var Ctor = (window.Dynamsoft && Dynamsoft.CVR
            && Dynamsoft.CVR.IntermediateResultReceiver) || null;
        if (typeof Ctor !== 'function') {
            state.intermediateUnavailable = true;
            logRun('warn', 'This build does not expose IntermediateResultReceiver, so the stage strip '
                + 'will stay empty. Everything else on the page still works.');
            return;
        }

        var receiver = new Ctor();
        STAGES.forEach(function (stage) {
            if (!stage.callback) return;
            receiver[stage.callback] = function (unit, info) {
                ingestUnit(stage.id, unit, info);
            };
        });
        // A safety net for a build that delivers the section-level aggregate
        // instead of the per-stage units; deduplicated by stage id either way.
        receiver.onTaskResultsReceived = function (taskResult, info) {
            var units = (taskResult && taskResult.intermediateResultUnits) || [];
            units.forEach(function (unit) {
                var stage = stageForUnitType(unit.unitType);
                if (stage) ingestUnit(stage.id, unit, info);
            });
        };

        try {
            await state.irManager.addResultReceiver(receiver);
            state.irReceiver = receiver;
        } catch (ex) {
            state.intermediateUnavailable = true;
            console.warn('The intermediate result receiver was rejected:', ex);
            logRun('warn', 'Intermediate results are unavailable on this build: '
                + ((ex && ex.message) || String(ex)));
        }
    }

    function unitTypeName(unitType) {
        var table = (window.Dynamsoft && Dynamsoft.Core && Dynamsoft.Core.EnumIntermediateResultUnitType) || null;
        if (!table || unitType === undefined || unitType === null) return '';
        var target = String(unitType);
        var names = Object.keys(table);
        for (var i = 0; i < names.length; i++) {
            if (String(table[names[i]]) === target) return names[i];
        }
        return '';
    }

    function stageForUnitType(unitType) {
        var name = unitTypeName(unitType);
        if (!name) return null;
        return STAGES.find(function (stage) { return stage.unitType === name; }) || null;
    }

    /*
     * All the evidence a run produces, cleared as one thing.
     *
     * These four maps are four views of the *same* run: `units` is what the
     * preview draws, `arrivals` is the number on the stage card, `unitGroups` is
     * the candidate gallery, `cropFingerprints` is the dedupe key that keeps a
     * unit from being counted twice. Clearing some of them and not others is how
     * the strip ends up claiming "2 candidate snapshots" over a gallery of
     * twenty-four — twenty-two of them from runs the visitor has already moved on
     * from — and how the preview comes to draw a crop that the run in front of you
     * never produced. `selectedCrop` addresses that gallery, so it goes too.
     */
    function clearStageEvidence() {
        state.units = {};
        state.unitInfo = {};
        state.unitGroups = {};
        state.cropFingerprints = {};
        state.arrivals = {};
        state.selectedCrop = {};
    }

    /*
     * A unit's own image, wherever the payload keeps it.
     *
     * Almost every image unit puts the bitmap on `imageData`. The deformation-resistance stage
     * does not: it delivers `deformationResistedBarcode: { format, imageData, location }` and
     * leaves `unit.imageData` undefined. The demo read `unit.imageData`, concluded the unit had
     * no pixels, and so this stage looked like it had produced nothing — its card fell back to
     * the nearest earlier image and it had no candidate gallery, while the stage had in fact
     * delivered one crop per refined candidate, exactly like the other two. Normalised once here
     * into a copy carrying `imageData` where every consumer already looks for it.
     */
    function normaliseUnitImage(unit) {
        if (!unit || unit.imageData) return unit;
        var nested = null;
        Object.keys(unit).forEach(function (key) {
            if (nested) return;
            var value = unit[key];
            if (value && typeof value === 'object' && !Array.isArray(value) && value.imageData) {
                nested = value.imageData;
            }
        });
        if (!nested) return unit;
        var copy = {};
        Object.keys(unit).forEach(function (key) { copy[key] = unit[key]; });
        copy.imageData = nested;
        return copy;
    }

    function ingestUnit(stageId, unit, info) {
        unit = normaliseUnitImage(unit);
        if (!unit) return;
        if (unit.imageData && isCandidateStageId(stageId)) {
            var fingerprint = imageFingerprint(unit.imageData);
            var seen = state.cropFingerprints[stageId] || (state.cropFingerprints[stageId] = {});
            // The SDK can deliver the same unit through both the stage callback
            // and onTaskResultsReceived. Count the pixels once, not the callback.
            if (seen[fingerprint]) return;
            seen[fingerprint] = true;
            state.arrivals[stageId] = (state.arrivals[stageId] || 0) + 1;

            var group = state.unitGroups[stageId] || (state.unitGroups[stageId] = []);
            if (group.length < MAX_CROP_UNITS) {
                group.push({ unit: unit, info: info || null, interest: imageInterest(unit.imageData) });
            }
            if (!state.units[stageId]) {
                state.units[stageId] = unit;
                state.unitInfo[stageId] = info || null;
            }
            return;
        }
        state.units[stageId] = unit;
        state.unitInfo[stageId] = info || null;
    }

    function imageFingerprint(imageData) {
        var bytes = imageData.bytes || [];
        var hash = 2166136261;
        var step = Math.max(1, Math.floor(bytes.length / 64));
        for (var i = 0; i < bytes.length; i += step) {
            hash ^= bytes[i];
            hash = Math.imul(hash, 16777619);
        }
        return [imageData.width, imageData.height, imageData.stride, imageData.format,
            bytes.length, hash >>> 0].join(':');
    }

    /*
     * How much there is to see in an image: its contrast. Sampled rather than
     * fully scanned \u2014 about twenty thousand reads answer the same question
     * without making a page-sized image pay a full pass on every arrival.
     */
    function imageInterest(imageData) {
        var bytes = imageData.bytes;
        if (!bytes || !bytes.length) return 0;
        var step = Math.max(1, Math.floor(bytes.length / 20000));
        var min = 255;
        var max = 0;
        for (var i = 0; i < bytes.length; i += step) {
            var value = bytes[i];
            if (value < min) min = value;
            if (value > max) max = value;
        }
        return max - min;
    }

    /* --------------------------------------------------------------- template */

    /*
     * Read one preset in both forms, WITHOUT applying anything. Applying is what
     * discards every other preset, so all the reading has to finish first.
     * `includeDefaultValues: true` is the form that makes every parameter real and
     * editable instead of only the ones a preset overrides; the sparse form is kept
     * as a fallback because the fuller document is not always accepted.
     */
    async function readTemplateDocuments(name) {
        var entry = { name: name, full: null, sparse: null };
        try {
            entry.full = await state.cvr.outputSettings(name, true);
        } catch (ex) {
            logRun('warn', 'outputSettings(\u201c' + name + '\u201d, true) failed: '
                + ((ex && ex.message) || String(ex)));
        }
        if (!entry.full) {
            try {
                entry.sparse = await state.cvr.outputSettings(name);
            } catch (ex) {
                logRun('warn', 'outputSettings(\u201c' + name + '\u201d) failed: '
                    + ((ex && ex.message) || String(ex)));
            }
        }
        return (entry.full || entry.sparse) ? entry : null;
    }

    /*
     * The SDK's list holds two presets whose names both end in "Default", and they are
     * not the same document. Measured against bundle 11.6.3200:
     *
     *   Default              generic engine template. Carries the
     *                        ST_REGION_PREDETECTION section (RPM_GENERAL), localizes
     *                        with four modes (CONNECTED_BLOCKS, SCAN_DIRECTLY,
     *                        STATISTICS, LINES), leaves DeblurModes unset, erases
     *                        detected text zones (IfEraseTextZone = 1).
     *   ReadBarcodes_Default barcode template. No predetection section, two
     *                        localization modes (CONNECTED_BLOCKS, SCAN_DIRECTLY), an
     *                        explicit four-mode DeblurModes list ending in
     *                        DM_DEEP_ANALYSIS, text zones kept.
     *
     * `Default` is hidden from the picker anyway, on the page owner's call: for a barcode tuner the
     * two overlap enough that offering both asks "which default do I want?" before the reader has
     * any basis for answering it, and the barcode template is the one this page exists to tune.
     * Hidden, not deleted — the preset is still in the SDK, and putting it back is one entry in
     * HIDDEN_TEMPLATES. The comparison uses this same visible list, so the picker and
     * "Compare all built-in templates" cannot disagree about what "all" means.
     */
    /* The decode-section stages that carry a candidate image rather than the frame. */
    var CANDIDATE_STAGE_IDS = ['scaledBarcodeImage', 'deformationResisted', 'complementedBarcodeImage'];
    var HIDDEN_TEMPLATES = ['Default'];

    /* The presets this page offers: the SDK's list minus the hidden near-duplicate. */
    function visibleTemplates() {
        return state.templates.filter(function (item) {
            return HIDDEN_TEMPLATES.indexOf(item.name) === -1;
        });
    }
    var TEMPLATE_NOTES = {
        'ReadBarcodes_Default': 'Barcode template: two localization modes, a four-mode DeblurModes '
            + 'list ending in deep analysis, text zones kept. The generic `Default` engine template '
            + 'differs in a predetection section, four localization modes, no DeblurModes list and '
            + 'text zones erased; it is hidden from this picker.'
    };
    var TEMPLATE_SHORT = {
        'ReadBarcodes_Default': 'barcode default'
    };

    async function populateTemplateList() {
        var names = [];
        try {
            names = await state.cvr.getTemplateNames();
        } catch (ex) {
            console.warn('getTemplateNames() failed:', ex);
        }
        if (!Array.isArray(names) || !names.length) names = [ENTRY_TEMPLATE];

        // The page opens on the documented default, so put it first.
        names.sort(function (a, b) {
            if (a === ENTRY_TEMPLATE) return -1;
            if (b === ENTRY_TEMPLATE) return 1;
            return 0;
        });

        state.templates = [];
        for (var i = 0; i < names.length; i++) {
            var entry = await readTemplateDocuments(names[i]);
            if (entry) state.templates.push(entry);
        }
        if (!state.templates.length) {
            throw new Error('The SDK did not return a readable barcode template.');
        }

        clear(dom['template_select']);
        visibleTemplates().forEach(function (item) {
                var option = el('option', null, item.name
                    + (TEMPLATE_SHORT[item.name] ? ' \u2014 ' + TEMPLATE_SHORT[item.name] : ''));
                option.value = item.name;
                option.title = TEMPLATE_NOTES[item.name] || '';
                dom['template_select'].appendChild(option);
            });
        dom['template_select'].value = state.templateName;
    }

    async function tryApply(template) {
        var info;
        try {
            info = await state.cvr.initSettings(safeStringify(template));
        } catch (ex) {
            return { ok: false, message: (ex && (ex.message || ex.errorString)) || String(ex) };
        }
        if (info && info.errorCode) {
            return { ok: false, message: '[' + info.errorCode + '] ' + info.errorString };
        }
        return { ok: true };
    }

    /*
     * Apply one of the cached presets. The document is cloned first because from
     * here on it belongs to the visitor: every control edits it in place.
     */
    async function activateTemplate(entry) {
        showLoading('Applying template \u201c' + entry.name + '\u201d\u2026');

        var applied = null;
        var includesDefaults = false;

        if (entry.full) {
            var fullResult = await tryApply(entry.full);
            if (fullResult.ok) {
                applied = entry.full;
                includesDefaults = true;
            } else {
                logRun('warn', 'The fully expanded form of \u201c' + entry.name + '\u201d was rejected: '
                    + fullResult.message + ' \u2014 using the preset as stored instead.');
            }
        }

        if (!applied) {
            var sparse = entry.sparse || entry.full;
            var sparseResult = await tryApply(sparse);
            if (!sparseResult.ok) {
                hideLoading();
                throw new Error('Could not apply template \u201c' + entry.name + '\u201d: ' + sparseResult.message);
            }
            applied = sparse;
        }

        state.template = deepClone(applied);
        state.templateName = entry.name;
        state.templateIncludesDefaults = includesDefaults;
        state.baseline = deepClone(applied);
        clearStageEvidence();
        dom['template_select'].value = entry.name;

        buildModel();
        renderParamUI();
        renderJson();
        renderStageStrip();
        renderCompare([], 0);

        hideLoading();
        logRun('info', 'Applied template \u201c' + entry.name + '\u201d'
            + (includesDefaults ? ' with all defaults expanded.' : ' in its sparse form.')
            + ' The SDK keeps ' + state.templates.length + ' presets; this page offers '
            + visibleTemplates().length + ' of them, and all were read before this one was applied.');
    }

    /** Apply a cached preset by name. */
    async function loadTemplateInto(name) {
        var entry = state.templates.find(function (item) { return item.name === name; });
        if (!entry) {
            logRun('warn', 'No cached preset is named \u201c' + name + '\u201d; keeping the current template.');
            return;
        }
        await activateTemplate(entry);
    }

    /* ---------------------------------------------------------- template model */

    function findByName(list, names) {
        list = list || [];
        if (!names || !names.length) return list;
        return list.filter(function (item) {
            return item && names.indexOf(item.Name) !== -1;
        });
    }

    function collectNames(objects, key) {
        var out = [];
        objects.forEach(function (object) {
            (object[key] || []).forEach(function (name) { out.push(name); });
        });
        return out;
    }

    /*
     * Flatten the loaded document into the list of objects whose own keys become
     * controls. The catalog decides the grouping and the labels; this only has to
     * find the objects the template actually references, so a preset with more than
     * one ROI or task is shown as-is rather than silently truncated.
     */
    function buildModel() {
        var t = state.template || {};
        var cvTemplates = t.CaptureVisionTemplates || [];
        var cv = cvTemplates.find(function (x) { return x.Name === state.templateName; }) || cvTemplates[0];

        var roiDefs = (t.TargetROIDefOptions || []).filter(function (roi) {
            if (!cv || !Array.isArray(cv.ImageROIProcessingNameArray) || !cv.ImageROIProcessingNameArray.length) {
                return true;
            }
            return cv.ImageROIProcessingNameArray.indexOf(roi.Name) !== -1;
        });

        var tasks = findByName(t.BarcodeReaderTaskSettingOptions, collectNames(roiDefs, 'TaskSettingNameArray'));
        var formatSpecs = findByName(t.BarcodeFormatSpecificationOptions,
            collectNames(tasks, 'BarcodeFormatSpecificationNameArray'));

        var imageParamNames = [];
        tasks.forEach(function (task) {
            (task.SectionArray || []).forEach(function (section) {
                if (section && section.ImageParameterName) imageParamNames.push(section.ImageParameterName);
            });
        });
        var imageParams = findByName(t.ImageParameterOptions, imageParamNames);
        if (!imageParams.length) imageParams = (t.ImageParameterOptions || []).slice();

        state.model = {
            cv: cv, cvTemplates: cvTemplates, roiDefs: roiDefs,
            tasks: tasks, formatSpecs: formatSpecs, imageParams: imageParams
        };

        var owners = [];

        function push(record) {
            owners.push(record);
        }

        if (cv) {
            push({
                group: 'capture', title: 'Template \u201c' + cv.Name + '\u201d',
                path: 'CaptureVisionTemplates(' + cvTemplates.indexOf(cv) + ')', obj: cv,
                skip: ['Name', 'ImageROIProcessingNameArray', 'TargetROIDefNameArray', 'SemanticProcessingNameArray']
            });
        }

        roiDefs.forEach(function (roi) {
            push({
                // The explanation for this group is on its definition in parameters.js, which is what
                // renderParamUI reads — an owner record has no note of its own.
                group: 'roi', title: 'ROI \u201c' + roi.Name + '\u201d',
                path: 'TargetROIDefOptions(' + (t.TargetROIDefOptions || []).indexOf(roi) + ')', obj: roi,
                skip: ['Name', 'TaskSettingNameArray', 'BaseTargetROIDefName']
            });
        });

        imageParams.forEach(function (ip) {
            var base = 'ImageParameterOptions(' + (t.ImageParameterOptions || []).indexOf(ip) + ')';
            (ip.ApplicableStages || []).forEach(function (stage, stageIndex) {
                if (!stage || !stage.Stage) return;
                push({
                    group: 'pre', stage: stage.Stage, title: stageTitleOf(stage.Stage),
                    path: base + '.ApplicableStages(' + stageIndex + ')', obj: stage, skip: ['Stage', 'Name']
                });
            });
        });

        tasks.forEach(function (task) {
            push({
                group: 'task', title: 'Task \u201c' + task.Name + '\u201d',
                path: 'BarcodeReaderTaskSettingOptions(' + (t.BarcodeReaderTaskSettingOptions || []).indexOf(task) + ')',
                obj: task,
                skip: ['Name', 'SectionArray', 'BarcodeFormatSpecificationNameArray']
            });
        });

        tasks.forEach(function (task) {
            var taskIndex = (t.BarcodeReaderTaskSettingOptions || []).indexOf(task);
            (task.SectionArray || []).forEach(function (section, sectionIndex) {
                if (!section || !section.Section) return;
                (section.StageArray || []).forEach(function (stage, stageIndex) {
                    if (!stage || !stage.Stage) return;
                    push({
                        group: 'pipeline', section: section.Section, stage: stage.Stage,
                        title: stageTitleOf(stage.Stage),
                        path: 'BarcodeReaderTaskSettingOptions(' + taskIndex + ').SectionArray('
                            + sectionIndex + ').StageArray(' + stageIndex + ')',
                        obj: stage, skip: ['Stage', 'ImageParameterName']
                    });
                });
            });
        });

        formatSpecs.forEach(function (spec) {
            push({
                group: 'format', title: 'Format specification \u201c' + spec.Name + '\u201d',
                path: 'BarcodeFormatSpecificationOptions('
                    + (t.BarcodeFormatSpecificationOptions || []).indexOf(spec) + ')',
                obj: spec, skip: ['Name']
            });
        });

        if (isPlainObject(t.GlobalParameter)) {
            push({ group: 'global', title: 'Engine-wide', path: 'GlobalParameter', obj: t.GlobalParameter, skip: [] });
        }

        state.owners = owners;
    }

    function stageTitleOf(stageName) {
        var stage = STAGES.find(function (s) { return s.stage === stageName; });
        return stage ? stage.title : titleFromCode(stageName);
    }

    function titleFromCode(code) {
        return String(code)
            .replace(/^SST_|^ST_|^IRUT_/, '')
            .toLowerCase()
            .replace(/_/g, ' ')
            .replace(/^./, function (c) { return c.toUpperCase(); });
    }

    /* --------------------------------------------------------- catalog lookups */

    function metaFor(key) {
        return PARAMS[key] || { label: key };
    }

    function enumListFor(meta) {
        if (!meta || !meta.enum) return null;
        var list = typeof meta.enum === 'string' ? ENUMS[meta.enum] : meta.enum;
        return Array.isArray(list) ? list : null;
    }

    function enumValues(list) {
        return list.map(function (entry) {
            return typeof entry === 'string' ? entry : entry.value;
        });
    }

    function enumLabel(list, value) {
        var match = list.find(function (entry) {
            return (typeof entry === 'string' ? entry : entry.value) === value;
        });
        return match && match.label ? match.label : value;
    }

    function isModeArray(key, value) {
        if (MODE_ARRAY_PARAMS.indexOf(key) === -1) return false;
        if (value === null || value === undefined) return true;
        return Array.isArray(value) && value.every(function (item) {
            return isPlainObject(item) && typeof item.Mode === 'string';
        });
    }

    function isRangeParam(key, value) {
        if (RANGE_PARAMS.indexOf(key) === -1) return false;
        if (value === null || value === undefined) return true;
        return Array.isArray(value) && value.length === 3
            && value.every(function (v) { return typeof v === 'number'; });
    }

    /* ---------------------------------------------------------- value editors */

    /**
     * The single entry point for "draw a control for this value". Every branch is
     * decided by the value's shape first and the catalog second, so an unknown
     * parameter degrades to a JSON box instead of disappearing.
     */
    function renderValue(container, obj, key, path, meta) {
        var value = obj[key];
        var list = enumListFor(meta);

        if (meta.kind === 'formatIds') {
            container.appendChild(renderFormatIds(obj, key, path));
        } else if (meta.kind === 'location') {
            container.appendChild(renderNested(obj, key, path, meta));
        } else if (meta.kind === 'object' || isPlainObject(value)) {
            container.appendChild(renderNested(obj, key, path, meta));
        } else if (isModeArray(key, value)) {
            container.appendChild(renderModeArray(obj, key, path, meta));
        } else if (isRangeParam(key, value)) {
            container.appendChild(renderRange(obj, key, path, meta));
        } else if (meta.kind === 'range') {
            container.appendChild(renderRange(obj, key, path, meta));
        } else if (meta.type === 'stringArray' && (Array.isArray(value) || value === null)) {
            container.appendChild(renderStringArray(obj, key, path, meta));
        } else if (Array.isArray(value) && value.length && value.every(function (v) { return typeof v === 'string'; }) && list) {
            container.appendChild(renderEnumArray(obj, key, path, meta, list));
        } else if (typeof value === 'number') {
            container.appendChild(renderNumber(obj, key, path, meta));
        } else if (typeof value === 'boolean') {
            container.appendChild(renderBoolean(obj, key, path));
        } else if (typeof value === 'string') {
            container.appendChild(renderString(obj, key, path, meta, list));
        } else if (value === null || value === undefined) {
            container.appendChild(renderUnset(obj, key, path, meta, list));
        } else if (Array.isArray(value)) {
            container.appendChild(renderTuple(obj, key, path, meta));
        } else {
            container.appendChild(renderJsonValue(obj, key, path, meta));
        }
    }

    function fieldHead(meta, key, badgeOut) {
        var head = el('div', 'field-head');
        head.appendChild(el('label', 'field-label', meta.label || key));
        if (meta.unit) head.appendChild(el('span', 'field-unit', meta.unit));
        return head;
    }

    function isChanged(path) {
        if (!state.baseline) return false;
        return safeStringify(readAtPath(state.baseline, path)) !== safeStringify(readAtPath(state.template, path));
    }

    /** Read a path such as `BarcodeReaderTaskSettingOptions(0).SectionArray(1)`. */
    function readAtPath(root, path) {
        var parts = String(path).split('.');
        var node = root;
        for (var i = 0; i < parts.length; i++) {
            if (node === null || node === undefined) return undefined;
            var key = parts[i];
            var paren = key.indexOf('(');
            if (paren === -1) {
                node = node[key];
            } else {
                node = node[key.slice(0, paren)];
                var index = key.slice(paren + 1, -1);
                if (index !== '') node = node ? node[Number(index)] : undefined;
            }
        }
        return node;
    }

    /* --- number ------------------------------------------------------------- */

    function renderNumber(obj, key, path, meta) {
        var row = el('div', 'control-row');
        var input = el('input', 'form-input');
        input.type = 'number';
        if (meta.min !== undefined) input.min = meta.min;
        if (meta.max !== undefined) input.max = meta.max;
        if (meta.step !== undefined) input.step = meta.step;
        input.value = fmtNumber(obj[key]);
        input.addEventListener('input', function () {
            var raw = input.value.trim();
            if (raw === '') return;
            var next = Number(raw);
            if (!isFinite(next)) return;
            if (meta.min !== undefined && next < meta.min) next = meta.min;
            if (meta.max !== undefined && next > meta.max) next = meta.max;
            obj[key] = next;
            commit(path);
        });
        input.addEventListener('blur', function () {
            input.value = fmtNumber(obj[key]);
        });
        row.appendChild(input);
        if (meta.min !== undefined || meta.max !== undefined) {
            row.appendChild(el('span', 'field-range',
                (meta.min !== undefined ? fmtNumber(meta.min) : '-\u221e') + ' \u2013 '
                + (meta.max !== undefined ? fmtNumber(meta.max) : '\u221e')));
        }
        return row;
    }

    /* --- boolean ------------------------------------------------------------ */

    function renderBoolean(obj, key, path) {
        var row = el('div', 'control-row');
        var label = el('label', 'switch');
        var input = el('input');
        input.type = 'checkbox';
        input.checked = !!obj[key];
        input.addEventListener('change', function () {
            obj[key] = input.checked ? 1 : 0;
            commit(path);
            refreshField(path);
        });
        label.appendChild(input);
        label.appendChild(el('span', 'switch-text', obj[key] ? 'on (1)' : 'off (0)'));
        row.appendChild(label);
        return row;
    }

    /* --- string ------------------------------------------------------------- */

    function renderString(obj, key, path, meta, list) {
        var row = el('div', 'control-row');
        if (list) {
            var values = enumValues(list);
            var select = el('select', 'form-select');
            if (values.indexOf(obj[key]) === -1) {
                var current = el('option', null, (obj[key] === '' ? '(empty)' : obj[key]) + '  \u2014 current');
                current.value = obj[key];
                select.appendChild(current);
            }
            values.forEach(function (value) {
                var option = el('option', null, enumLabel(list, value));
                option.value = value;
                option.title = value;
                select.appendChild(option);
            });
            select.value = obj[key];
            select.addEventListener('change', function () {
                obj[key] = select.value;
                commit(path);
                refreshField(path);
            });
            row.appendChild(select);
            if (obj[key]) row.appendChild(el('code', 'field-code', obj[key]));
            return row;
        }

        var input = el('input', 'form-input');
        input.type = 'text';
        input.value = obj[key];
        input.placeholder = meta.placeholder || '';
        input.addEventListener('input', function () {
            obj[key] = input.value;
            commit(path);
        });
        row.appendChild(input);
        return row;
    }

    /* --- array of enum strings --------------------------------------------- */

    function renderEnumArray(obj, key, path, meta, list) {
        var values = enumValues(list);
        var extras = obj[key].filter(function (v) { return values.indexOf(v) === -1; });
        var all = values.concat(extras);

        var box = el('div', 'chip-box');
        all.forEach(function (value) {
            var on = obj[key].indexOf(value) !== -1;
            var chip = el('button', 'chip' + (on ? ' chip-on' : '') + (extras.indexOf(value) !== -1 ? ' chip-extra' : ''));
            chip.type = 'button';
            chip.title = enumLabel(list, value) + '  (' + value + ')';
            chip.appendChild(el('span', 'chip-text', enumLabel(list, value)));
            chip.addEventListener('click', function () {
                var next = obj[key].slice();
                var at = next.indexOf(value);
                if (at === -1) next.push(value); else next.splice(at, 1);
                obj[key] = next;
                commit(path);
                refreshField(path);
            });
            box.appendChild(chip);
        });

        var tools = el('div', 'chip-tools');
        var allButton = el('button', 'btn btn-sm btn-secondary', 'All');
        allButton.type = 'button';
        allButton.addEventListener('click', function () {
            obj[key] = values.slice();
            commit(path);
            refreshField(path);
        });
        var noneButton = el('button', 'btn btn-sm btn-secondary', 'None');
        noneButton.type = 'button';
        noneButton.addEventListener('click', function () {
            obj[key] = [];
            commit(path);
            refreshField(path);
        });
        tools.appendChild(allButton);
        tools.appendChild(noneButton);
        tools.appendChild(el('span', 'hint', obj[key].length + ' of ' + values.length + ' selected'));

        var wrap = el('div', 'enum-array');
        wrap.appendChild(box);
        wrap.appendChild(tools);
        return wrap;
    }

    /* --- array of plain strings, with suggestions -------------------------- */

    function renderStringArray(obj, key, path, meta) {
        var wrap = el('div', 'string-array');
        var value = obj[key];
        var suggestions = meta.suggest && ENUMS[meta.suggest] ? enumValues(ENUMS[meta.suggest]) : [];
        var listId = 'dl_' + (meta.suggest || key);

        if (!document.getElementById(listId) && suggestions.length) {
            var dataList = el('datalist');
            dataList.id = listId;
            suggestions.forEach(function (item) {
                var option = el('option');
                option.value = item;
                dataList.appendChild(option);
            });
            document.body.appendChild(dataList);
        }

        if (value === null || value === undefined) {
            wrap.appendChild(el('code', 'field-code', 'null'));
            var setButton = el('button', 'btn btn-sm btn-secondary', 'Set');
            setButton.type = 'button';
            setButton.addEventListener('click', function () {
                obj[key] = [];
                commit(path);
                refreshField(path);
            });
            wrap.appendChild(setButton);
            if (meta.help) wrap.appendChild(el('span', 'hint', meta.help));
            return wrap;
        }

        var input = el('input', 'form-input');
        input.type = 'text';
        if (suggestions.length) input.setAttribute('list', listId);
        input.placeholder = 'comma separated, or empty for every value';
        input.value = value.join(', ');
        input.addEventListener('change', function () {
            obj[key] = input.value.split(',').map(function (part) {
                return part.trim();
            }).filter(function (part) { return part !== ''; });
            commit(path);
            refreshField(path);
        });
        wrap.appendChild(input);

        if (suggestions.length) {
            var tools = el('div', 'chip-tools');
            suggestions.forEach(function (item) {
                var chip = el('button', 'chip' + (value.indexOf(item) !== -1 ? ' chip-on' : ''), item);
                chip.type = 'button';
                chip.addEventListener('click', function () {
                    var next = obj[key].slice();
                    var at = next.indexOf(item);
                    if (at === -1) next.push(item); else next.splice(at, 1);
                    obj[key] = next;
                    commit(path);
                    refreshField(path);
                });
                tools.appendChild(chip);
            });
            wrap.appendChild(tools);
        }
        return wrap;
    }

    /* --- [min, max, step] --------------------------------------------------- */

    function renderRange(obj, key, path, meta) {
        var wrap = el('div', 'range-row');
        var value = obj[key];
        var enabled = Array.isArray(value) && value.length === 3;
        var names = meta.parts || ['min', 'max', 'step'];

        for (var i = 0; i < 3; i++) {
            (function (index) {
                var input = el('input', 'form-input range-input');
                input.type = 'number';
                input.placeholder = names[index];
                input.title = names[index];
                input.disabled = !enabled;
                input.value = enabled ? fmtNumber(value[index]) : '';
                input.addEventListener('input', function () {
                    if (!Array.isArray(obj[key]) || obj[key].length !== 3) return;
                    var raw = input.value.trim();
                    if (raw === '') return;
                    var next = Number(raw);
                    if (!isFinite(next)) return;
                    obj[key][index] = next;
                    commit(path);
                });
                wrap.appendChild(input);
            })(i);
        }

        var label = el('label', 'switch');
        var toggle = el('input');
        toggle.type = 'checkbox';
        toggle.checked = enabled;
        toggle.addEventListener('change', function () {
            obj[key] = toggle.checked ? (meta.defaultRange || [0, 0, 1]).slice() : null;
            commit(path);
            refreshField(path);
        });
        label.appendChild(toggle);
        label.appendChild(el('span', 'switch-text', enabled ? 'active' : 'off'));
        wrap.appendChild(label);
        return wrap;
    }

    /* --- a plain numeric tuple --------------------------------------------- */

    function pointLabels(key, length) {
        if (/Point$/.test(key) && length === 4) return ['x', 'y', 'x %', 'y %'];
        var names = [];
        for (var i = 0; i < length; i++) names.push('item ' + i);
        return names;
    }

    function renderTuple(obj, key, path, meta) {
        var wrap = el('div', 'tuple-wrap');
        var value = obj[key];

        if (value.every(function (v) { return typeof v === 'number'; })) {
            var labels = meta.parts || pointLabels(key, value.length);
            var row = el('div', 'tuple-row');
            value.forEach(function (_, index) {
                var cell = el('input', 'form-input tuple-input');
                cell.type = 'number';
                cell.title = labels[index] || ('item ' + index);
                cell.placeholder = labels[index] || '';
                cell.value = fmtNumber(value[index]);
                cell.addEventListener('input', function () {
                    var raw = cell.value.trim();
                    if (raw === '') return;
                    var next = Number(raw);
                    if (!isFinite(next)) return;
                    value[index] = next;
                    commit(path);
                });
                row.appendChild(cell);
            });
            wrap.appendChild(row);
            if (meta.help) wrap.appendChild(el('p', 'field-help', meta.help));
            return wrap;
        }

        return renderJsonValue(obj, key, path, meta);
    }

    /* --- null --------------------------------------------------------------- */

    function renderUnset(obj, key, path, meta, list) {
        var wrap = el('div', 'unset-row');
        wrap.appendChild(el('code', 'field-code', 'null'));
        var setButton = el('button', 'btn btn-sm btn-secondary', 'Set a value');
        setButton.type = 'button';
        setButton.addEventListener('click', function () {
            obj[key] = suggestedValue(meta, list);
            commit(path);
            refreshField(path);
        });
        wrap.appendChild(setButton);
        if (meta.type === 'array' || (meta.type === 'stringArray')) {
            var arrayButton = el('button', 'btn btn-sm btn-secondary', 'Start an empty array');
            arrayButton.type = 'button';
            arrayButton.addEventListener('click', function () {
                obj[key] = [];
                commit(path);
                refreshField(path);
            });
            wrap.appendChild(arrayButton);
        }
        return wrap;
    }

    function suggestedValue(meta, list) {
        if (meta.kind === 'range') return (meta.defaultRange || [0, 0, 1]).slice();
        if (meta.type === 'stringArray' || meta.type === 'array') return [];
        if (list && list.length) return enumValues(list)[0];
        if (meta.valueType === 'string') return '';
        return 0;
    }

    /* --- nested objects ---------------------------------------------------- */

    /*
     * Sibling values decide whether some nested fields mean anything: EdgeIndex is
     * only read when AxisType is AT_EDGE, and RotationAngle only when it is
     * AT_ROTATION_OTHER_AXIS. Those fields are greyed out rather than hidden or
     * rewritten, so the document round-trips byte for byte.
     */
    var NESTED_GATES = {
        ReferenceXAxis: function (obj) {
            return {
                EdgeIndex: obj.AxisType === 'AT_EDGE',
                RotationAngle: obj.AxisType === 'AT_ROTATION_OTHER_AXIS',
                LengthReference: obj.AxisType === 'AT_MIDPOINT_EDGE' || obj.AxisType === 'AT_EDGE'
            };
        },
        ReferenceYAxis: function (obj) {
            return {
                EdgeIndex: obj.AxisType === 'AT_EDGE',
                RotationAngle: obj.AxisType === 'AT_ROTATION_OTHER_AXIS',
                LengthReference: obj.AxisType === 'AT_MIDPOINT_EDGE' || obj.AxisType === 'AT_EDGE'
            };
        }
    };

    function renderNested(obj, key, path, meta) {
        var value = obj[key];
        var wrap = el('div', 'nested');
        var gate = NESTED_GATES[key] ? NESTED_GATES[key](value) : null;

        Object.keys(value).forEach(function (childKey) {
            var childMeta = metaFor(childKey);
            var child = el('div', 'field field-nested');
            child.appendChild(el('label', 'field-label', childMeta.label || childKey));

            if (gate && gate[childKey] === false) child.classList.add('field-gated');
            if (gate && gate[childKey] === false && childMeta.help === undefined) {
                child.title = 'Not used at this axis type. The value is kept as-is on export.';
            }

            renderValue(child, value, childKey, path + '.' + childKey, childMeta);
            if (childMeta.help) child.appendChild(el('p', 'field-help', childMeta.help));
            if (gate && gate[childKey] === false) {
                Array.prototype.forEach.call(child.querySelectorAll('input, select'), function (node) {
                    node.disabled = true;
                });
            }
            wrap.appendChild(child);
        });
        return wrap;
    }

    /* --- the format list --------------------------------------------------- */

    /*
     * The set of formats is read from the SDK's own enumeration, so a format added
     * in a future build still appears. The catalog only supplies the ordering and
     * the friendly labels.
     */
    function formatChips() {
        var table = (window.Dynamsoft && Dynamsoft.DBR && Dynamsoft.DBR.EnumBarcodeFormat) || null;
        var known = {};
        var ordered = [];

        if (table) {
            Object.keys(table).filter(function (name) {
                return /^BF_/.test(name);
            }).forEach(function (name) {
                known[name] = true;
            });
        }

        (CATALOG.FORMAT_BITS || []).forEach(function (pair) {
            if (known[pair[0]]) {
                known[pair[0]] = false;
                ordered.push({ value: pair[0], label: pair[1], composite: false });
            }
        });

        if (table) {
            Object.keys(table).filter(function (name) {
                return known[name] === true || (known[name] === false && !ordered.some(function (o) {
                    return o.value === name;
                }));
            }).forEach(function (name) {
                if (ordered.some(function (o) { return o.value === name; })) return;
                ordered.push({ value: name, label: name, composite: false });
            });
        }

        return ordered;
    }

    var FORMAT_CHIP_CACHE = null;

    function renderFormatIds(obj, key, path) {
        if (!FORMAT_CHIP_CACHE) FORMAT_CHIP_CACHE = formatChips();
        var chips = FORMAT_CHIP_CACHE;
        var current = Array.isArray(obj[key]) ? obj[key] : [];
        var wrap = el('div', 'enum-array');

        var composites = chips.filter(function (chip) {
            return (CATALOG.COMPOSITE_FORMATS || []).some(function (pair) { return pair[0] === chip.value; });
        });
        var individuals = chips.filter(function (chip) {
            return !(CATALOG.COMPOSITE_FORMATS || []).some(function (pair) { return pair[0] === chip.value; });
        });

        var box = el('div', 'chip-box');
        [[composites, 'group'], [individuals, 'symbology']].forEach(function (group) {
            if (!group[0].length) return;
            var heading = el('div', 'chip-group-head', group[1] === 'group'
                ? 'Groups and masks' : 'Individual symbologies');
            box.appendChild(heading);
            group[0].forEach(function (chip) {
                var on = current.indexOf(chip.value) !== -1;
                var button = el('button', 'chip' + (on ? ' chip-on' : '') + (group[1] === 'group' ? ' chip-group' : ''));
                button.type = 'button';
                button.title = chip.label + '  (' + chip.value + ')';
                button.appendChild(el('span', 'chip-text', chip.label));
                button.addEventListener('click', function () {
                    var next = obj[key].slice();
                    var at = next.indexOf(chip.value);
                    if (at === -1) next.push(chip.value); else next.splice(at, 1);
                    obj[key] = next;
                    commit(path);
                    refreshField(path);
                });
                box.appendChild(button);
            });
        });
        wrap.appendChild(box);

        var tools = el('div', 'chip-tools');
        var allButton = el('button', 'btn btn-sm btn-secondary', 'Select every format');
        allButton.type = 'button';
        allButton.addEventListener('click', function () {
            obj[key] = ['BF_ALL'];
            commit(path);
            refreshField(path);
        });
        var presetButton = el('button', 'btn btn-sm btn-secondary', 'Back to the preset list');
        presetButton.type = 'button';
        presetButton.addEventListener('click', function () {
            obj[key] = ['BF_DEFAULT'];
            commit(path);
            refreshField(path);
        });
        var noneButton = el('button', 'btn btn-sm btn-secondary', 'Clear');
        noneButton.type = 'button';
        noneButton.addEventListener('click', function () {
            obj[key] = [];
            commit(path);
            refreshField(path);
        });
        tools.appendChild(allButton);
        tools.appendChild(presetButton);
        tools.appendChild(noneButton);
        tools.appendChild(el('span', 'hint', current.length + ' entry(ies) in the list'));
        wrap.appendChild(tools);
        void individuals;
        return wrap;
    }

    /* --- fallback: raw JSON ------------------------------------------------- */

    function renderJsonValue(obj, key, path, meta) {
        var wrap = el('div', 'json-value');
        var area = el('textarea', 'form-input json-input');
        area.rows = 4;
        area.spellcheck = false;
        area.value = safeStringify(obj[key], true);
        var status = el('p', 'hint', 'Edited as JSON: this value\u2019s shape is not one the catalog models.');

        function apply() {
            try {
                obj[key] = JSON.parse(area.value);
                status.textContent = 'Applied.';
                status.className = 'hint hint-ok';
                commit(path);
            } catch (ex) {
                status.textContent = 'Not valid JSON, nothing applied: ' + ex.message;
                status.className = 'hint hint-bad';
            }
        }

        area.addEventListener('blur', apply);
        area.addEventListener('keydown', function (event) {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                apply();
            }
        });

        wrap.appendChild(area);
        wrap.appendChild(status);
        void meta;
        return wrap;
    }

    /* ------------------------------------------------------- mode list editor */

    function relevantSubparams(key, mode) {
        var table = MODE_SUBPARAMS[key];
        if (!table) return null;
        return table[mode] || table['*'] || [];
    }

    function renderModeArray(obj, key, path, meta) {
        var wrap = el('div', 'mode-array');
        var list = enumListFor(meta);
        var entries = Array.isArray(obj[key]) ? obj[key] : null;

        var head = el('div', 'mode-array-head');
        head.appendChild(el('span', 'mode-count', entries
            ? entries.length + (entries.length === 1 ? ' mode' : ' modes')
            : 'SDK default (null)'));

        var tools = el('div', 'mode-array-tools');
        if (entries) {
            var addButton = el('button', 'btn btn-sm btn-accent', 'Add a mode');
            addButton.type = 'button';
            addButton.addEventListener('click', function () {
                obj[key].push(defaultModeEntry(key, list ? enumValues(list)[0] : ''));
                commit(path);
                refreshField(path);
            });
            tools.appendChild(addButton);

            var defaultButton = el('button', 'btn btn-sm btn-secondary', 'Use the SDK default');
            defaultButton.type = 'button';
            defaultButton.addEventListener('click', function () {
                obj[key] = null;
                commit(path);
                refreshField(path);
            });
            tools.appendChild(defaultButton);
        } else {
            var startButton = el('button', 'btn btn-sm btn-secondary', 'Start a list');
            startButton.type = 'button';
            startButton.addEventListener('click', function () {
                obj[key] = [];
                commit(path);
                refreshField(path);
            });
            tools.appendChild(startButton);
        }

        var showAllLabel = el('label', 'switch');
        var showAll = el('input');
        showAll.type = 'checkbox';
        showAllLabel.appendChild(showAll);
        showAllLabel.appendChild(el('span', 'switch-text', 'every sub-parameter'));
        tools.appendChild(showAllLabel);

        head.appendChild(tools);
        wrap.appendChild(head);

        if (!entries) {
            wrap.appendChild(el('p', 'hint', 'At its default the engine chooses its own list for the '
                + 'formats in play, which is a perfectly good answer.'));
            return wrap;
        }
        if (!entries.length) {
            wrap.appendChild(el('p', 'hint hint-bad', 'An empty list switches this stage off entirely.'));
        }

        showAll.addEventListener('change', function () {
            wrap.dataset.showAll = showAll.checked ? '1' : '';
            refreshField(path);
        });
        var showEverything = wrap.dataset.showAll === '1';
        showAll.checked = showEverything;

        entries.forEach(function (entry, index) {
            wrap.appendChild(renderModeEntry(obj, key, path, entry, index, showEverything));
        });

        return wrap;
    }

    function defaultModeEntry(key, mode) {
        var entry = MODE_ENTRY_TEMPLATE[key] ? deepClone(MODE_ENTRY_TEMPLATE[key]) : {};
        entry.Mode = mode;
        return entry;
    }

    function renderModeEntry(obj, key, path, entry, index, showEverything) {
        var list = enumListFor(metaFor(key));
        var card = el('div', 'mode-entry');

        var top = el('div', 'mode-entry-top');
        top.appendChild(el('span', 'mode-index', '#' + (index + 1)));

        var modeSelect;
        if (list) {
            modeSelect = el('select', 'form-select mode-select');
            var values = enumValues(list);
            if (values.indexOf(entry.Mode) === -1) {
                var current = el('option', null, entry.Mode + '  \u2014 current');
                current.value = entry.Mode;
                modeSelect.appendChild(current);
            }
            values.forEach(function (value) {
                var option = el('option', null, enumLabel(list, value));
                option.value = value;
                option.title = value;
                modeSelect.appendChild(option);
            });
            modeSelect.value = entry.Mode;
            modeSelect.addEventListener('change', function () {
                entry.Mode = modeSelect.value;
                commit(path);
                refreshField(path);
            });
        } else {
            modeSelect = el('input', 'form-input mode-select');
            modeSelect.type = 'text';
            modeSelect.value = entry.Mode;
            modeSelect.addEventListener('change', function () {
                entry.Mode = modeSelect.value;
                commit(path);
            });
        }
        top.appendChild(modeSelect);
        if (entry.Mode) top.appendChild(el('code', 'field-code', entry.Mode));

        var actions = el('div', 'mode-entry-actions');
        actions.appendChild(moveButton('\u2191', 'Move earlier — the engine tries modes in order', index > 0, function () {
            var moved = obj[key].splice(index, 1)[0];
            obj[key].splice(index - 1, 0, moved);
            commit(path);
            refreshField(path);
        }));
        actions.appendChild(moveButton('\u2193', 'Move later', index < obj[key].length - 1, function () {
            var moved = obj[key].splice(index, 1)[0];
            obj[key].splice(index + 1, 0, moved);
            commit(path);
            refreshField(path);
        }));
        actions.appendChild(moveButton('\u2715', 'Remove this mode', true, function () {
            obj[key].splice(index, 1);
            commit(path);
            refreshField(path);
        }, 'icon-remove'));
        top.appendChild(actions);
        card.appendChild(top);

        var relevant = relevantSubparams(key, entry.Mode);
        Object.keys(entry).filter(function (k) { return k !== 'Mode'; }).forEach(function (subKey) {
            var isRelevant = !relevant || relevant.indexOf(subKey) !== -1;
            if (!showEverything && !isRelevant) return;
            card.appendChild(renderSubField(entry, subKey, path, isRelevant));
        });

        return card;
    }

    function moveButton(glyph, title, enabled, handler, extraClass) {
        var button = el('button', 'icon-btn' + (extraClass ? ' ' + extraClass : ''), glyph);
        button.type = 'button';
        button.title = title;
        button.disabled = !enabled;
        button.addEventListener('click', handler);
        return button;
    }

    function renderSubField(entry, subKey, ownerPath, relevant) {
        var meta = metaFor(subKey);
        var field = el('div', 'field field-sub' + (relevant ? ' field-relevant' : ' field-irrelevant'));

        var head = el('div', 'field-head');
        head.appendChild(el('label', 'field-label', meta.label || subKey));
        if (!relevant) head.appendChild(el('span', 'field-tag', 'other modes'));
        field.appendChild(head);

        renderValue(field, entry, subKey, ownerPath + '.' + subKey, meta);
        if (meta.help) field.appendChild(el('p', 'field-help', meta.help));
        return field;
    }

    /* ------------------------------------------------ parameter panel plumbing */

    function renderField(owner, key) {
        var meta = metaFor(key);
        var path = owner.path + '.' + key;
        var wrap = el('div', 'field');
        wrap._path = path;
        if (meta.help) wrap.title = meta.help;

        var head = fieldHead(meta, key);
        var badge = el('span', 'field-changed', 'changed');
        badge.style.display = isChanged(path) ? '' : 'none';
        head.appendChild(badge);
        wrap.appendChild(head);

        renderValue(wrap, owner.obj, key, path, meta);
        if (meta.help) wrap.appendChild(el('p', 'field-help', meta.help));
        return wrap;
    }

    /** Repaint one field in place after a value changed shape. */
    function refreshField(path) {
        var ownerPath = path.slice(0, path.indexOf('.'));
        var rest = path.slice(path.indexOf('.') + 1);
        var owner = state.owners.find(function (o) { return o.path === ownerPath; });

        // Sub-fields live inside a mode entry, which is not an owner: repaint the
        // whole panel for those rather than trying to guess at a node.
        if (!owner || rest.indexOf('.') !== -1) {
            renderParamUI();
            renderJson();
            return;
        }

        var node = state.fieldNodes[path];
        if (node && node.parentNode) {
            var next = renderField(owner, rest);
            node.parentNode.replaceChild(next, node);
            state.fieldNodes[path] = next;
            var badge = next.querySelector('.field-changed');
            if (badge) badge.style.display = isChanged(path) ? '' : 'none';
        }
        renderJson();
        applyParamFilter();
    }

    /** Record a change, repaint its badge, and queue a fresh run. */
    function commit(path) {
        var node = state.fieldNodes[path];
        if (node) {
            var badge = node.querySelector('.field-changed');
            if (badge) badge.style.display = isChanged(path) ? '' : 'none';
        }
        state.changed[path] = isChanged(path);
        updateChangedCount();
        afterChange('parameter change');
    }

    /** The keys of an owner that should actually become controls. */
    function editableKeys(owner) {
        return Object.keys(owner.obj).filter(function (key) {
            return owner.skip.indexOf(key) === -1;
        });
    }

    function changedCount() {
        return state.owners.reduce(function (sum, owner) {
            return sum + editableKeys(owner).filter(function (key) {
                return isChanged(owner.path + '.' + key);
            }).length;
        }, 0);
    }

    /*
     * The parameters the visitor actually moved, for the export.
     *
     * The panel addresses a parameter as `Collection(0).Nested(1).Key` because that is
     * what `readAtPath` parses; a JSON document spells the same place
     * `Collection[0].Nested[1].Key`. The export is meant to be pasted into code, so it
     * is emitted in JSON form. A whole array counts as one change — moving one mode up
     * the DeblurModes list is a change to that list, and reporting the list as it now
     * stands is the only description that can be applied.
     */
    function changedParams() {
        if (!state.baseline) return [];
        var out = [];
        state.owners.forEach(function (owner) {
            editableKeys(owner).forEach(function (key) {
                var path = owner.path + '.' + key;
                if (!isChanged(path)) return;
                out.push({
                    path: path.replace(/\((\d+)\)/g, '[$1]'),
                    before: readAtPath(state.baseline, path),
                    after: readAtPath(state.template, path)
                });
            });
        });
        return out;
    }

    /*
     * The companion file to the full template: what this page was told to do, in the
     * smallest form a person can act on. Without it the only export is a few hundred
     * lines of defaults and the two lines that matter are invisible in it.
     *
     * `howToApply` names the capture step on purpose — `capture(image, name)` looks the
     * template up *by name*, so loading a file whose template is called "ReadSingleBarcode"
     * and then capturing "ReadBarcodes_Default" fails with `[-10036] The template name is
     * invalid`. That cost a round trip while this export was being tested, so the file says
     * which name to pass.
     */
    function changesDocument() {
        var changes = changedParams();
        var basedOn = state.templateName;
        return {
            basedOn: basedOn,
            exportedFrom: 'https://www.dynamsoft.com/codepool/demos/barcode-parameter-tuner/',
            exportedAt: new Date().toISOString(),
            changedParameterCount: changes.length,
            templateFile: basedOn + '.json',
            howToApply: 'Take "' + basedOn + '.json" (downloaded next to this file) and hand it to '
                + 'CaptureVisionRouter.initSettings(), then capture with the same name: '
                + 'capture(image, "' + basedOn + '") \u2014 the second argument is a template name, and '
                + 'the name inside the file is "' + basedOn + '"; passing any other one fails with '
                + '[-10036]. Or set the paths below on your own copy of a template; each value is the '
                + 'complete value of that key, not a partial patch.',
            changes: changes
        };
    }

    function downloadText(filename, text, mime) {
        var blob = new Blob([text], { type: mime || 'application/json' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function copyText(text) {
        return navigator.clipboard.writeText(text);
    }

    function totalParamCount() {
        return state.owners.reduce(function (sum, owner) {
            return sum + editableKeys(owner).length;
        }, 0);
    }

    function updateChangedCount() {
        var changed = changedCount();
        dom['param_count'].textContent = totalParamCount() + ' parameters'
            + (changed ? ' \u00b7 ' + changed + ' changed' : ' \u00b7 nothing changed yet');
        dom['reset_button'].disabled = changed === 0;
        // "Just my changes" is meaningless with nothing changed, and a greyed button
        // that always sits there is worse than one that wakes up when there is something
        // to take away.
        ['changes_download', 'changes_copy'].forEach(function (id) {
            dom[id].disabled = changed === 0;
            dom[id].title = changed
                ? changed + ' changed parameter' + (changed === 1 ? '' : 's')
                    + ' \u2014 exports only what you moved'
                : 'Change a parameter and this exports only what you moved';
        });
        // The way to the export carries the count, so "there is something to take away"
        // is visible from the toolbar instead of only at the bottom of the page.
        dom['export_jump'].textContent = changed
            ? 'Take this template away (' + changed + ' change' + (changed === 1 ? '' : 's') + ') \u2193'
            : 'Take this template away \u2193';
    }

    function renderParamUI() {
        var container = dom['param_groups'];
        clear(container);
        state.fieldNodes = {};

        GROUPS.forEach(function (group) {
            // A stage object with no parameters of its own (SST_LOCALIZE_BARCODES is
            // one) is not a block of controls, so it must not be counted as one or
            // the group badge stops matching what is on screen.
            var owners = state.owners.filter(function (owner) {
                return owner.group === group.id && editableKeys(owner).length > 0;
            });
            if (!owners.length) return;

            var section = el('details', 'param-group');
            section.open = group.open !== false;
            section.dataset.group = group.id;

            var summary = el('summary', 'param-group-summary');
            summary.appendChild(el('span', 'param-group-title', group.title));
            summary.appendChild(el('span', 'param-group-count', String(owners.length)));
            section.appendChild(summary);

            if (group.note) section.appendChild(el('p', 'group-note', group.note));

            owners.forEach(function (owner) {
                var head = el('div', 'owner-head');
                head.appendChild(el('span', 'owner-title', owner.title));
                if (owner.stage) head.appendChild(el('code', 'field-code', owner.stage));
                section.appendChild(head);

                editableKeys(owner).forEach(function (key) {
                    var field = renderField(owner, key);
                    state.fieldNodes[owner.path + '.' + key] = field;
                    section.appendChild(field);
                });
            });

            container.appendChild(section);
        });

        state.changed = {};
        updateChangedCount();
        applyParamFilter();
    }

    /*
     * Filter the parameter panel.
     *
     * A field matches on its label, its path, the value in it, and on the title of the group and the
     * owner it belongs to. That last part is the one that matters: searching "roi" or "region" has to
     * find the region-of-interest group, and no field in it is called that — the points are
     * `FirstPoint`, `SecondPoint` and so on, so a label-and-path search leaves the reader staring at
     * `TargetROIDefOptions`, which is not what they typed.
     *
     * Matches are also *opened*. The region-of-interest group starts collapsed, so the old filter
     * would match three fields, hide everything else and leave the one group it found shut — a search
     * that looks broken however well it matched. The reader's own open/closed choices are remembered
     * and restored when the box is cleared, and the status line reports the count, because "nothing
     * matched" and "the panel is empty" should not look the same.
     */
    function applyParamFilter() {
        var needle = (dom['param_search'].value || '').trim().toLowerCase();
        var onlyChanged = dom['only_changed'].checked;
        var filtering = !!needle || onlyChanged;
        var matchedFields = 0;
        var firstMatch = null;

        // What the reader had open before a filter started opening groups on its own.
        if (filtering && !state.paramFilterOpen) {
            state.paramFilterOpen = {};
            Array.prototype.forEach.call(dom['param_groups'].querySelectorAll('.param-group'), function (section) {
                state.paramFilterOpen[section.dataset.group] = section.open;
            });
        }

        Array.prototype.forEach.call(dom['param_groups'].querySelectorAll('.param-group'), function (section) {
            var group = GROUPS.filter(function (g) { return g.id === section.dataset.group; })[0];
            var groupMatches = !!needle && !!group
                && (group.title + ' ' + (group.note || '')).toLowerCase().indexOf(needle) !== -1;
            var visible = 0;

            Array.prototype.forEach.call(section.querySelectorAll('.field'), function (node) {
                var labelText;
                if (node.classList.contains('field-nested') || node.classList.contains('field-sub')) {
                    labelText = node.textContent;
                } else {
                    var labelNode = node.querySelector('.field-label');
                    labelText = labelNode ? labelNode.textContent : node.textContent;
                }
                var input = node.querySelector('input, select, textarea');
                var path = node._path || '';
                var ownerMatches = false;
                if (needle) {
                    // The owner head is either an ancestor or the sibling block before the field.
                    var head = node.closest('.owner-head');
                    if (!head) {
                        var previous = node.previousElementSibling;
                        while (previous && !previous.classList.contains('owner-head')) {
                            previous = previous.previousElementSibling;
                        }
                        head = previous;
                    }
                    ownerMatches = !!head && head.textContent.toLowerCase().indexOf(needle) !== -1;
                }
                var matchesText = !needle || groupMatches || ownerMatches
                    || labelText.toLowerCase().indexOf(needle) !== -1
                    || path.toLowerCase().indexOf(needle) !== -1
                    || (input && input.value && String(input.value).toLowerCase().indexOf(needle) !== -1);
                var matchesChanged = !onlyChanged || (path && isChanged(path));
                var show = matchesText && matchesChanged;
                node.style.display = show ? '' : 'none';
                if (show) {
                    visible++;
                    matchedFields++;
                    if (!firstMatch) firstMatch = section;
                }
            });

            var hideSection = visible === 0 && filtering;
            section.style.display = hideSection ? 'none' : '';
            if (filtering) {
                // Open what matched, so the result of a search is on screen instead of behind a header.
                section.open = !hideSection;
            } else if (state.paramFilterOpen) {
                section.open = state.paramFilterOpen[section.dataset.group] !== false;
            }
        });

        if (!filtering) {
            state.paramFilterOpen = null;
            dom['param_filter_status'].textContent = '';
            return;
        }
        var typed = dom['param_search'].value.trim();
        dom['param_filter_status'].textContent = matchedFields
            ? matchedFields + (matchedFields === 1 ? ' parameter matches' : ' parameters match')
                + (needle ? ' \u201c' + typed + '\u201d' : '')
                + (onlyChanged ? ' and have been changed' : '')
            : 'No parameter matches ' + (needle ? '\u201c' + typed + '\u201d' : 'this filter')
                + ' \u2014 clear the box to see all of them again.';
        if (firstMatch && dom['param_groups'].scrollHeight > dom['param_groups'].clientHeight) {
            // Only when the list actually scrolls; otherwise this drags the whole page with it.
            firstMatch.scrollIntoView({ block: 'nearest' });
        }
    }

    /* ----------------------------------------------------------- stage strip */

    function stageById(id) {
        return STAGES.find(function (stage) { return stage.id === id; }) || null;
    }

    function locationBox(location) {
        var points = location && location.points;
        if (!points || !points.length) return null;
        var xs = points.map(function (point) { return point.x; });
        var ys = points.map(function (point) { return point.y; });
        var left = Math.min.apply(Math, xs);
        var top = Math.min.apply(Math, ys);
        var right = Math.max.apply(Math, xs);
        var bottom = Math.max.apply(Math, ys);
        return { left: left, top: top, right: right, bottom: bottom,
            width: right - left, height: bottom - top };
    }

    function boxIou(a, b) {
        if (!a || !b) return 0;
        var width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
        var height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        var intersection = width * height;
        var union = a.width * a.height + b.width * b.height - intersection;
        return union > 0 ? intersection / union : 0;
    }

    function localizedMatches() {
        var unit = state.units.localizedBarcodes;
        var candidates = (unit && unit.localizedBarcodes) || [];
        var decoded = barcodeItems(state.lastResult);
        var used = {};
        return candidates.map(function (candidate) {
            var candidateBox = locationBox(candidate.location);
            var bestIndex = -1;
            var bestScore = 0;
            decoded.forEach(function (item, index) {
                if (used[index]) return;
                var score = boxIou(candidateBox, locationBox(item.location));
                if (score > bestScore) {
                    bestScore = score;
                    bestIndex = index;
                }
            });
            if (bestScore >= 0.2) {
                used[bestIndex] = true;
                return bestIndex;
            }
            return -1;
        });
    }

    function renderDiagnosis() {
        var box = dom['diagnosis_summary'];
        clear(box);
        var candidatesUnit = state.units.candidateBarcodeZones;
        var localizedUnit = state.units.localizedBarcodes;
        var candidates = candidatesUnit && candidatesUnit.candidateBarcodeZones
            ? candidatesUnit.candidateBarcodeZones.length : 0;
        var localized = localizedUnit && localizedUnit.localizedBarcodes
            ? localizedUnit.localizedBarcodes.length : 0;
        var decoded = barcodeItems(state.lastResult).length;
        var matches = localizedMatches();
        var confirmed = matches.filter(function (index) { return index >= 0; }).length;
        var unconfirmed = Math.max(0, localized - confirmed);
        var expected = state.expected ? state.expected.length : null;
        var title;
        var advice;
        var tone = 'diagnosis-neutral';

        if (!state.lastResult) {
            title = 'Run the image to locate the bottleneck';
            advice = 'Read the pipeline left to right. Change one parameter family, run again, and compare the first stage whose evidence changed.';
        } else if (!candidates) {
            title = 'Bottleneck: localization never found a candidate';
            advice = 'Inspect Binary image first. If the modules are already broken there, test grayscale enhancement or binarization. If they are intact, test LocalizationModes.';
            tone = 'diagnosis-warn';
        } else if (!localized) {
            title = 'Bottleneck: candidates were rejected during localization';
            advice = 'The binary image produced ' + candidates + ' candidate zone' + (candidates === 1 ? '' : 's')
                + ', but none survived. Test one LocalizationModes change before touching DeblurModes.';
            tone = 'diagnosis-warn';
        } else if (unconfirmed) {
            title = 'Bottleneck: decoding did not confirm ' + unconfirmed + ' localized candidate'
                + (unconfirmed === 1 ? '' : 's');
            advice = 'Open Localized candidates to separate real symbols from false positives. For a real rejected symbol, scope BarcodeFormatIds first, then test BarcodeScaleModes or DeblurModes one family at a time.';
            tone = 'diagnosis-warn';
        } else if (expected !== null && decoded < expected) {
            title = 'Bottleneck: localization missed annotated symbols';
            advice = decoded + ' of ' + expected + ' expected symbols decoded, with no extra localized candidates left to decode. Work backward through localization, binary, and grayscale evidence.';
            tone = 'diagnosis-warn';
        } else {
            title = 'Baseline succeeds: use controlled experiments';
            advice = expected !== null
                ? decoded + ' of ' + expected + ' expected symbols decoded. Change one parameter family and keep it only if accuracy stays intact or the intended hard case improves.'
                : decoded + ' barcode' + (decoded === 1 ? '' : 's') + ' decoded. Without ground truth, treat more results cautiously: a higher count can include false decodes.';
            tone = 'diagnosis-good';
        }

        box.className = 'diagnosis-summary ' + tone;
        box.appendChild(el('strong', 'diagnosis-title', title));
        box.appendChild(el('p', null, advice));
        if (state.lastResult) {
            box.appendChild(el('p', 'diagnosis-counts', candidates + ' candidate zones  \u2192  '
                + localized + ' localized hypotheses  \u2192  ' + decoded + ' decoded'));
        }
    }

    /*
     * The image a stage's coordinates belong to.
     *
     * Two kinds of thing live in the strip. A stage that produces an image owns
     * its own, and a candidate card is the interesting case: that crop *is* the
     * stage, so it is drawn by itself and the numbers on it are the stage's own.
     *
     * A stage that produces *vectors* — localized candidates, decoded barcodes,
     * contours, lines, text zones — reports coordinates in the coordinate space of
     * the image it was run on, which the catalog names in `base`: a full-frame
     * image. The old rule here was "the nearest picture above me", which for the
     * decode stage is a candidate crop — measured 272x114 for a 1200x1600 frame.
     * The overlay is then sized to the crop and the boxes are scaled by
     * 272/1200, so the quads land a quarter of the way in and nowhere near the
     * symbols they name. Hence: the declared base first, and never a crop as the
     * background for a vector stage.
     */
    function backgroundFor(stageId) {
        var index = STAGES.findIndex(function (s) { return s.id === stageId; });
        var stage = index === -1 ? null : STAGES[index];
        if (stageId !== 'final' && index !== -1) {
            var own = state.units[stageId];
            // Only a full-frame image can be a background. A candidate crop is the card's own
            // picture, not the frame: using it here is what made the preview shrink to 272x114
            // and the page move under the reader.
            if (own && own.imageData && !isCandidateStageId(stageId) && !isCropBitmap(own.imageData)) {
                return { stageId: stageId, imageData: own.imageData };
            }
        }
        if (stage && stage.base) {
            var base = state.units[stage.base];
            if (base && base.imageData) return { stageId: stage.base, imageData: base.imageData };
        }
        for (var i = (index === -1 ? STAGES.length : index) - 1; i >= 0; i--) {
            var unit = state.units[STAGES[i].id];
            if (unit && unit.imageData && !isCandidateStageId(STAGES[i].id) && !isCropBitmap(unit.imageData)) {
                return { stageId: STAGES[i].id, imageData: unit.imageData };
            }
        }
        return state.source ? { stageId: 'source', canvas: state.source.canvas } : null;
    }

    function stageSummary(stage) {
        var unit = state.units[stage.id];
        if (!unit) return '';
        switch (stage.count) {
            case 'contours': return unit.contours ? unit.contours.length + ' contours' : '';
            case 'shortLines': return unit.shortLines ? unit.shortLines.length + ' lines' : '';
            case 'lineSegments': return unit.lineSegments ? unit.lineSegments.length + ' segments' : '';
            case 'textZones': return unit.textZones ? unit.textZones.length + ' zones' : '';
            case 'predetectedRegions':
                return unit.predetectedRegions ? unit.predetectedRegions.length + ' regions' : '';
            case 'candidateBarcodeZones':
                return unit.candidateBarcodeZones ? unit.candidateBarcodeZones.length + ' zones' : '';
            case 'localizedBarcodes':
                if (!unit.localizedBarcodes) return '';
                // The second number is the decode section's *first* read, not its result: step 17
                // covers the localization plus the section's first attempt at each hypothesis. The
                // final card reports the union after the refinements, so the gap between the two
                // numbers is what the refinements bought.
                // Hypotheses only: this stage localizes and does not decode. The SDK team confirmed
                // that, and observation agrees — an image whose candidates all read can report
                // barcodes while this stage produced nothing but regions. Which hypotheses were
                // later confirmed belongs in the detail panel (every candidate there carries a
                // decoded / not decoded badge) and in the diagnosis summary; a second number on
                // this card read as this stage's own result, which was wrong.
                return unit.localizedBarcodes.length
                    + (unit.localizedBarcodes.length === 1 ? ' hypothesis' : ' hypotheses');
            case 'decodedBarcodes':
                return unit.decodedBarcodes ? unit.decodedBarcodes.length + ' decoded' : '';
            case 'texture':
                return unit.xSpacing !== undefined ? 'x ' + unit.xSpacing + ' \u00b7 y ' + unit.ySpacing : '';
            case 'image':
                if (!unit.imageData) return '';
                var cropCount = state.arrivals[stage.id] || 0;
                if (isCropBitmap(unit.imageData) && cropCount) {
                    return cropCount + (cropCount === 1 ? ' candidate snapshot' : ' candidate snapshots');
                }
                return (isCropBitmap(unit.imageData) ? 'crop ' : '')
                    + unit.imageData.width + '\u00d7' + unit.imageData.height
                    + ' \u00b7 ' + (PIXEL_FORMAT_NAMES[unit.imageData.format] || 'format ' + unit.imageData.format);
            default: return '';
        }
    }

    function renderStageStrip() {
        var container = dom['stage_strip'];
        renderDiagnosis();
        // Rebuilding the strip replaces every card, so the reader's place in it —
        // the scroll offset, which stage is selected, whether the missing list
        // was open — has to be taken across by hand. A rebuild that silently
        // jumps back to the first card is what makes "look at the last stage"
        // feel broken.
        var prevScroll = container.scrollLeft;
        clear(container);

        var produced = STAGES.filter(function (stage) { return state.units[stage.id]; });
        var missing = STAGES.filter(function (stage) { return !state.units[stage.id]; });

        container.appendChild(finalCard());
        produced.forEach(function (stage) { container.appendChild(stageCard(stage)); });
        container.scrollLeft = prevScroll;

        dom['stage_empty'].style.display = produced.length ? 'none' : '';
        if (!produced.length) {
            dom['stage_empty'].textContent = state.intermediateUnavailable
                ? 'This build did not accept an intermediate result receiver, so no stage can be '
                    + 'reported. The parameter editing, the final results and the JSON export are '
                    + 'unaffected.'
                : 'No intermediate results have arrived yet. Press Run, or open the Run log for the '
                    + 'reason the last attempt reported.';
        }
        dom['stage_empty'].className = produced.length
            ? 'hint'
            : (state.intermediateUnavailable ? 'hint hint-bad' : 'hint');

        // Emptied every time: a later run may produce every stage, and a stale
        // "reported nothing" list would quietly become a lie.
        clear(dom['stage_missing']);
        if (missing.length) {
            var details = el('details', 'stage-missing');
            details.open = state.missingOpen;
            details.appendChild(el('summary', null, missing.length
                + (missing.length === 1 ? ' stage reported nothing' : ' stages reported nothing')));
            var list = el('div', 'stage-missing-list');
            list.appendChild(el('p', 'hint', 'A stage with no entry either found nothing or was not needed '
                + 'for this image — the pipeline skips work it can prove is pointless, for instance region '
                + 'pre-detection under its minimum image dimension. The hint beside each one names the '
                + 'parameter that drives it.'));
            missing.forEach(function (stage) {
                var row = el('div', 'stage-missing-row');
                var button = el('button', 'stage-missing-title', stage.title);
                button.type = 'button';
                button.dataset.stage = stage.id;
                button.addEventListener('click', function () {
                    selectStage(stage.id);
                });
                row.appendChild(button);
                if (!stageInTemplate(stage.stage)) {
                    row.appendChild(el('span', 'hint hint-bad', 'not part of this template \u2014 the '
                        + 'loaded document has no ' + stage.stage + ' stage, so nothing could be reported'));
                } else if (stage.emptyHint) {
                    row.appendChild(el('span', 'hint', stage.emptyHint));
                }
                list.appendChild(row);
            });
            details.appendChild(list);
            details.addEventListener('toggle', function () { state.missingOpen = details.open; });
            // The rows live outside the scroll strip: inside it this block was
            // squeezed to a sliver beside the cards and its text was unreadable.
            dom['stage_missing'].appendChild(details);
        }

        markActiveStageCard();
        renderStageDetail();
    }

    /*
     * Selection alone never needs a rebuild: the cards are already in the DOM
     * and only one class changes. This is also what keeps a click on the last
     * thumbnail from throwing the strip back to the first card.
     *
     * Nothing here touches the scroll position, and nothing needs to: the preview frame is
     * a fixed box (see `setSource`), so changing the stage changes what is drawn inside it
     * and nothing else. The scroll pinning this function used to do was compensating for
     * the panel resizing, and it read as the page jumping around.
     */
    function selectStage(id) {
        state.selectedStage = id;
        markActiveStageCard();
        renderStageDetail();
        renderPreview();
        var card = dom['stage_strip'].querySelector('.stage-card[data-stage="' + id + '"]');
        if (card) revealStageCard(card);
    }

    /* Keep the selected card visible without letting scrollIntoView move the page. */
    function revealStageCard(card) {
        var strip = dom['stage_strip'];
        var left = card.offsetLeft;
        var right = left + card.offsetWidth;
        var visibleLeft = strip.scrollLeft;
        var visibleRight = visibleLeft + strip.clientWidth;
        if (left < visibleLeft) strip.scrollLeft = left;
        else if (right > visibleRight) strip.scrollLeft = right - strip.clientWidth;
    }

    function markActiveStageCard() {
        var cards = dom['stage_strip'].querySelectorAll('.stage-card');
        for (var i = 0; i < cards.length; i++) {
            cards[i].classList.toggle('stage-card-active', cards[i].dataset.stage === state.selectedStage);
        }
        var titles = dom['stage_missing'].querySelectorAll('.stage-missing-title');
        for (var j = 0; j < titles.length; j++) {
            titles[j].classList.toggle('stage-missing-title-active',
                titles[j].dataset.stage === state.selectedStage);
        }
    }

    /*
     * A stage that reported nothing is only interesting if the template actually
     * asks for it. The stock 11.6 template, for one, has no region pre-detection
     * section at all, so that row is a fact about the document rather than a
     * finding about the image — and saying so is the difference between a
     * diagnosis and a red herring.
     */
    function stageInTemplate(stageCode) {
        if (!stageCode) return true;
        return state.owners.some(function (owner) { return owner.stage === stageCode; });
    }

    function stageThumbSource(stage) {
        var unit = stage === 'final' ? null : state.units[stage.id];
        if (unit && unit.imageData) return { imageData: unit.imageData };
        var background = stage === 'final' ? null : backgroundFor(stage.id);
        if (background) return background;
        return state.source ? { canvas: state.source.canvas } : null;
    }

    function stageCard(stage) {
        var selected = state.selectedStage === stage.id;
        var card = el('button', 'stage-card' + (selected ? ' stage-card-active' : ''));
        card.type = 'button';
        card.dataset.stage = stage.id;
        card.title = stage.note || stage.title;

        var thumb = el('div', 'stage-thumb');
        // The step number, so the row reads as a flow: 1..17 run in order, and the three
        // candidate-image cards share 18 because they are one position in the pipeline seen
        // through different refinements. A card is only drawn for a step that produced
        // something, so a gap in the numbers is itself information.
        if (stage.step) {
            var step = el('span', 'stage-step', String(stage.step));
            step.title = 'Pipeline step ' + stage.step;
            thumb.appendChild(step);
        }
        var canvas = el('canvas', 'stage-thumb-canvas');
        var cropGroup = state.unitGroups[stage.id] || [];
        var localizedUnit = stage.id === 'localizedBarcodes' && state.units.localizedBarcodes;
        if (localizedUnit && localizedUnit.localizedBarcodes && localizedUnit.localizedBarcodes.length) {
            drawMontage(canvas, localizedUnit.localizedBarcodes.slice(0, 4).map(function (item) {
                return { canvas: cropLocationCanvas(item.location) };
            }));
        } else if (cropGroup.length > 1) {
            drawMontage(canvas, cropGroup.slice(0, 4).map(function (entry) {
                return { imageData: entry.unit.imageData };
            }));
        } else {
            drawThumbnail(canvas, stageThumbSource(stage));
        }
        thumb.appendChild(canvas);
        card.appendChild(thumb);

        card.appendChild(el('span', 'stage-title', stage.title));
        var summary = stageSummary(stage);
        if (summary) card.appendChild(el('span', 'stage-count', summary));
        if (stage.section) card.appendChild(el('span', 'stage-kind', stage.section));

        card.addEventListener('click', function () {

            selectStage(stage.id);
        });
        return card;
    }

    function finalCard() {
        var count = state.lastResult ? barcodeItems(state.lastResult).length : 0;
        var card = el('button', 'stage-card stage-card-final'
            + (state.selectedStage === 'final' ? ' stage-card-active' : ''));
        card.type = 'button';
        card.dataset.stage = 'final';
        card.title = 'The decoded barcodes, drawn on the image they were found in.';
        var thumb = el('div', 'stage-thumb');
        var canvas = el('canvas', 'stage-thumb-canvas');
        drawThumbnail(canvas, state.source ? { canvas: state.source.canvas } : null);
        thumb.appendChild(canvas);
        card.appendChild(thumb);
        card.appendChild(el('span', 'stage-title', 'Final result'));
        card.appendChild(el('span', 'stage-count', count + (count === 1 ? ' barcode' : ' barcodes')));
        // Labelled so the single card that is this page's own drawing is never
        // mistaken for one more SDK stage.
        card.appendChild(el('span', 'stage-kind', 'drawn by this page'));
        card.addEventListener('click', function () {

            selectStage('final');
        });
        return card;
    }

    /*
     * A crop, as opposed to a page: the decoding stages emit one small patch
     * per candidate barcode, never a full-resolution frame. The cut-off is on
     * the long side and only ever decides how the image is *shown*.
     */
    /*
     * Whether a bitmap is a candidate crop rather than a frame-sized image.
     *
     * This used to be `max(width, height) <= 600`, a guess about the world, and it misfired on the
     * bundled undersized-symbol sample: that frame is 499x453, so *every* stage image — the
     * grayscale, the binary, everything — was under 600 and got judged a crop. The preview then
     * refused to use them as backgrounds and fell back to the colour source, which is why cards 3,
     * 4, 5, 6 and 9 showed a picture that never changed while other images (whose frames are larger)
     * behaved.
     *
     * The frame's own size is the only thing that can answer it: a crop is smaller than the frame it
     * was cut from. The old threshold stays only as the fallback for the window before a source is
     * loaded and the frame size is unknown.
     */
    function isCropBitmap(bitmap) {
        var frameW = state.originalWidth || (state.source && state.source.canvas && state.source.canvas.width) || 0;
        var frameH = state.originalHeight || (state.source && state.source.canvas && state.source.canvas.height) || 0;
        if (!frameW || !frameH) return Math.max(bitmap.width, bitmap.height) <= 600;
        return bitmap.width < frameW || bitmap.height < frameH;
    }

    /*
     * The three decode-section stages whose own image is a candidate, not the frame. Identity is the
     * reliable test here rather than size: a candidate can be upscaled past the frame's dimensions
     * (a 433x231 candidate at x2 against a 441x277 frame), and a frame can be scaled up past a
     * candidate's.
     */
    function isCandidateStageId(stageId) {
        return CANDIDATE_STAGE_IDS.indexOf(stageId) !== -1;
    }

    function drawThumbnail(canvas, source) {
        canvas.width = THUMB_W;
        canvas.height = THUMB_H;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#eeeeee';
        ctx.fillRect(0, 0, THUMB_W, THUMB_H);
        if (!source) return;
        var bitmap = source.imageData ? imageDataToCanvas(source.imageData) : source.canvas;
        if (!bitmap) return;
        var scale = Math.min(THUMB_W / bitmap.width, THUMB_H / bitmap.height);
        var drawW = Math.max(1, Math.round(bitmap.width * scale));
        var drawH = Math.max(1, Math.round(bitmap.height * scale));
        // A per-barcode crop drawn with the browser's default smoothing turns
        // into a grey smear at card size \u2014 bar structure, the whole reason
        // for looking, disappears. Nearest-neighbour keeps it; page-sized
        // images keep the smoothing that stops photo detail from aliasing.
        ctx.imageSmoothingEnabled = !isCropBitmap(bitmap);
        ctx.drawImage(bitmap, Math.round((THUMB_W - drawW) / 2), Math.round((THUMB_H - drawH) / 2), drawW, drawH);
    }

    function drawMontage(canvas, sources) {
        canvas.width = THUMB_W;
        canvas.height = THUMB_H;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#eeeeee';
        ctx.fillRect(0, 0, THUMB_W, THUMB_H);
        var items = sources.filter(function (source) { return source && (source.imageData || source.canvas); });
        if (!items.length) return;
        var columns = items.length === 1 ? 1 : 2;
        var rows = Math.ceil(items.length / columns);
        var gap = 2;
        var cellW = (THUMB_W - gap * (columns - 1)) / columns;
        var cellH = (THUMB_H - gap * (rows - 1)) / rows;
        items.forEach(function (source, index) {
            var bitmap = source.imageData ? imageDataToCanvas(source.imageData) : source.canvas;
            if (!bitmap) return;
            var x = (index % columns) * (cellW + gap);
            var y = Math.floor(index / columns) * (cellH + gap);
            var scale = Math.min(cellW / bitmap.width, cellH / bitmap.height);
            var width = Math.max(1, bitmap.width * scale);
            var height = Math.max(1, bitmap.height * scale);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(bitmap, x + (cellW - width) / 2, y + (cellH - height) / 2, width, height);
        });
    }

    function cropLocationCanvas(location) {
        if (!state.source) return null;
        var box = locationBox(location);
        if (!box || box.width <= 0 || box.height <= 0) return null;
        var padding = Math.max(4, Math.round(Math.max(box.width, box.height) * 0.08));
        var left = clamp(Math.floor(box.left - padding), 0, state.source.width);
        var top = clamp(Math.floor(box.top - padding), 0, state.source.height);
        var right = clamp(Math.ceil(box.right + padding), 0, state.source.width);
        var bottom = clamp(Math.ceil(box.bottom + padding), 0, state.source.height);
        var width = Math.max(1, right - left);
        var height = Math.max(1, bottom - top);
        var canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(state.source.canvas, left, top, width, height, 0, 0, width, height);
        return canvas;
    }

    function renderStageDetail() {
        var box = dom['stage_detail'];
        clear(box);

        var stage = state.selectedStage === 'final' ? null : stageById(state.selectedStage);
        var head = el('div', 'stage-detail-head');
        head.appendChild(el('strong', null, stage ? stage.title : 'Final result'));
        if (stage && stage.stage) {
            var code = el('code', 'field-code', stage.stage);
            code.title = 'The stage id as the template document spells it: SST_ is a stage, ST_ a section.';
            head.appendChild(code);
        }
        box.appendChild(head);

        box.appendChild(el('p', 'group-note', stage
            ? (stage.note || '')
            : 'Every barcode the engine returned for this image, with the confidence, angle and module '
                + 'size it reported. This single card is drawn by the page itself \u2014 the SDK hands '
                + 'over barcodes, not a picture \u2014 while every other card is an image the SDK passed '
                + 'through the pipeline.'));

        if (stage) {
            var info = state.unitInfo[stage.id];
            if (info && (info.taskName || info.targetROIDefName)) {
                box.appendChild(el('p', 'hint', 'task \u201c' + (info.taskName || '?') + '\u201d \u00b7 ROI \u201c'
                    + (info.targetROIDefName || '?') + '\u201d' + (info.isSectionLevelResult ? ' \u00b7 section level' : '')));
            }
            var detail = stageDetailRows(stage);
            if (detail) box.appendChild(detail);
            var evidence = stage.id === 'localizedBarcodes'
                ? renderLocalizedEvidence()
                : renderCropEvidence(stage);
            if (evidence) box.appendChild(evidence);
        } else if (state.lastResult && state.lastResult.errorCode) {
            box.appendChild(el('p', 'hint hint-bad', 'capture() reported [' + state.lastResult.errorCode + '] '
                + state.lastResult.errorString));
        }

        var roiBox = renderRoiReadout();
        if (roiBox) box.appendChild(roiBox);
    }

    function stageDetailRows(stage) {
        var unit = state.units[stage.id];
        if (!unit) return el('p', 'hint', stage.emptyHint || 'This stage produced no result.');
        var list = el('ul', 'detail-list');

        if (stage.id === 'localizedBarcodes' && unit.localizedBarcodes) {
            unit.localizedBarcodes.slice(0, 40).forEach(function (item, i) {
                list.appendChild(el('li', null, '#' + (i + 1) + ' \u00b7 ' + (item.possibleFormatsString || '?')
                    + ' \u00b7 confidence ' + item.confidence + ' \u00b7 angle ' + fmtNumber(item.angle)
                    + '\u00b0 \u00b7 module ' + fmtNumber(item.moduleSize)));
            });
        } else if (stage.id === 'decodedBarcodes' && unit.decodedBarcodes) {
            unit.decodedBarcodes.slice(0, 40).forEach(function (item, i) {
                list.appendChild(el('li', null, '#' + (i + 1) + ' \u00b7 ' + item.formatString + ' \u00b7 ' + item.text));
            });
        } else if (stage.id === 'candidateBarcodeZones' && unit.candidateBarcodeZones) {
            unit.candidateBarcodeZones.slice(0, 40).forEach(function (item, i) {
                list.appendChild(el('li', null, '#' + (i + 1) + ' \u00b7 formats ' + String(item.possibleFormats)));
            });
        } else if (stage.id === 'predetectedRegions' && unit.predetectedRegions) {
            unit.predetectedRegions.slice(0, 40).forEach(function (item, i) {
                list.appendChild(el('li', null, '#' + (i + 1) + ' \u00b7 ' + (item.modeName || '')
                    + (item.labelName ? ' \u00b7 ' + item.labelName : '')));
            });
        } else if (stage.id === 'textureDetection') {
            list.appendChild(el('li', null, 'x spacing ' + unit.xSpacing));
            list.appendChild(el('li', null, 'y spacing ' + unit.ySpacing));
        } else if (unit.imageData) {
            list.appendChild(el('li', null, 'size ' + unit.imageData.width + ' \u00d7 ' + unit.imageData.height));
            if (isCropBitmap(unit.imageData)) {
                var cropCount = state.arrivals[stage.id] || 1;
                list.appendChild(el('li', null, 'a candidate snapshot, not the whole frame \u2014 it is '
                    + 'unconfirmed until the decode stage returns a result'
                    + (cropCount > 1 ? '; ' + cropCount + ' unique snapshots arrived' : '')));
            }
            var formatNote = PIXEL_FORMAT_NOTES[unit.imageData.format];
            list.appendChild(el('li', null, 'pixel format '
                + (PIXEL_FORMAT_NAMES[unit.imageData.format] || unit.imageData.format)
                + (formatNote ? ' \u2014 ' + formatNote : '')));
            list.appendChild(el('li', null, 'stride ' + unit.imageData.stride));
        } else {
            var summary = stageSummary(stage);
            if (summary) list.appendChild(el('li', null, summary));
            if (stage.count === 'image') {
                // An image-shaped stage delivered a unit without pixels \u2014 the
                // thumbnail then falls back to an earlier image, so say so
                // rather than leave the reader guessing what the thumbnail is.
                list.appendChild(el('li', null, 'no image on this stage\u2019s own unit \u2014 it carries '
                    + 'geometry, not pixels; the thumbnail shows the nearest earlier image it refers to'));
            }
        }

        return list.children.length ? list : null;
    }

    function renderLocalizedEvidence() {
        var unit = state.units.localizedBarcodes;
        var items = (unit && unit.localizedBarcodes) || [];
        if (!items.length) return null;
        var matches = localizedMatches();
        var decoded = barcodeItems(state.lastResult);
        var section = el('div', 'candidate-evidence');
        section.appendChild(el('h3', 'candidate-evidence-title', 'Localization evidence'));
        section.appendChild(el('p', 'group-note', 'These are source-image crops of the exact regions localization returned. '
            + 'They are hypotheses, so a non-barcode crop is useful evidence of a false positive, not a rendering error.'));
        var gallery = el('div', 'candidate-gallery');
        items.slice(0, MAX_CROP_UNITS).forEach(function (item, index) {
            var match = matches[index];
            var confirmed = match !== -1;
            var figure = el('figure', 'candidate-item ' + (confirmed ? 'candidate-confirmed' : 'candidate-rejected'));
            var canvas = el('canvas', 'candidate-canvas');
            drawEvidenceCanvas(canvas, cropLocationCanvas(item.location));
            figure.appendChild(canvas);
            var caption = el('figcaption');
            caption.appendChild(el('strong', null, 'L' + (index + 1) + ' \u00b7 '
                + (confirmed ? 'decoded' : 'not decoded')));
            caption.appendChild(el('span', null, confirmed
                ? ((decoded[match] && decoded[match].formatString) || 'confirmed by final result')
                : ((item.possibleFormatsString || 'unknown format') + ' \u00b7 confidence ' + item.confidence)));
            figure.appendChild(caption);
            gallery.appendChild(figure);
        });
        section.appendChild(gallery);
        if (items.length > MAX_CROP_UNITS) {
            section.appendChild(el('p', 'hint', 'Showing the first ' + MAX_CROP_UNITS + ' of ' + items.length + ' localized candidates.'));
        }
        return section;
    }

    function renderCropEvidence(stage) {
        var group = state.unitGroups[stage.id] || [];
        if (!group.length) return null;
        var section = el('div', 'candidate-evidence');
        section.appendChild(el('h3', 'candidate-evidence-title', 'Candidate processing snapshots'));
        section.appendChild(el('p', 'group-note', 'These are intermediate images the decoder tried, not confirmed barcodes. '
            + 'Select one to inspect it above; text or texture here means localization produced a false candidate.'));
        var gallery = el('div', 'candidate-gallery candidate-gallery-selectable');
        var selected = state.selectedCrop[stage.id] || 0;
        group.forEach(function (entry, index) {
            var button = el('button', 'candidate-item candidate-button'
                + (index === selected ? ' candidate-selected' : ''));
            button.type = 'button';
            button.setAttribute('aria-pressed', index === selected ? 'true' : 'false');
            button.setAttribute('aria-label', 'Inspect candidate snapshot ' + (index + 1));
            var canvas = el('canvas', 'candidate-canvas');
            drawEvidenceCanvas(canvas, imageDataToCanvas(entry.unit.imageData));
            button.appendChild(canvas);
            button.appendChild(el('span', 'candidate-button-label', 'Candidate ' + (index + 1)));
            button.addEventListener('click', function () {
                state.selectedCrop[stage.id] = index;
                state.units[stage.id] = entry.unit;
                state.unitInfo[stage.id] = entry.info;
                Array.prototype.forEach.call(gallery.querySelectorAll('.candidate-button'), function (node, nodeIndex) {
                    var active = nodeIndex === index;
                    node.classList.toggle('candidate-selected', active);
                    node.setAttribute('aria-pressed', active ? 'true' : 'false');
                });
                renderPreview();
            });
            gallery.appendChild(button);
        });
        section.appendChild(gallery);
        var total = state.arrivals[stage.id] || group.length;
        if (total > group.length) {
            section.appendChild(el('p', 'hint', 'Showing ' + group.length + ' of ' + total
                + ' unique snapshots to keep the page responsive.'));
        }
        return section;
    }

    function drawEvidenceCanvas(canvas, bitmap) {
        canvas.width = 160;
        canvas.height = 96;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f3f3f3';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (!bitmap) return;
        var scale = Math.min(canvas.width / bitmap.width, canvas.height / bitmap.height);
        var width = Math.max(1, bitmap.width * scale);
        var height = Math.max(1, bitmap.height * scale);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(bitmap, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    }

    function renderRoiReadout() {
        var roi = state.model && state.model.roiDefs && state.model.roiDefs[0];
        var offset = roi && roi.Location && roi.Location.Offset;
        if (!offset) return null;
        var names = ['FirstPoint', 'SecondPoint', 'ThirdPoint', 'FourthPoint'];
        var parts = names.map(function (name) {
            var point = offset[name];
            var label = name.replace('Point', '');
            if (!Array.isArray(point)) return label + ' ?';
            return label + ' (' + fmtNumber(point[0]) + ', ' + fmtNumber(point[1]) + ')';
        });
        var box = el('div', 'roi-readout');
        box.appendChild(el('p', 'hint', 'ROI '
            + (offset.MeasuredByPercentage ? 'in percent of the image' : 'in pixels') + ': ' + parts.join(' \u00b7 ')));
        var quad = roiQuad();
        if (quad && quad.whole) {
            box.appendChild(el('p', 'hint', 'These four points are the whole image, and every stock preset '
                + 'sets them that way: the template is telling the engine to look everywhere, so "show the '
                + 'region of interest" has nothing to outline and looking at it changes nothing. Give the '
                + 'points a smaller region \u2014 they are editable in the Parameters panel under "Region of '
                + 'interest" \u2014 and the toggle marks what is left, while the engine stops spending time '
                + 'outside it. That is the whole point of the parameter, and the fastest way to feel it is to '
                + 'drag one point in and watch the barcode count stay put on this image while the outlines '
                + 'vanish from outside the region.'));
        }
        return box;
    }

    /* -------------------------------------------------------------- rendering */

    var IMAGE_CACHE = new WeakMap();

    /*
     * Turn a unit's DSImageData into a canvas. Written by hand rather than through
     * `CoreModule._toCanvas` because the exported helper is undocumented and a
     * mis-read pixel format would silently shift every overlay.
     */
    function imageDataToCanvas(imageData) {
        if (!imageData || !imageData.bytes) return null;
        var cached = IMAGE_CACHE.get(imageData);
        if (cached) return cached;

        var width = imageData.width;
        var height = imageData.height;
        var bytes = imageData.bytes;
        var stride = imageData.stride || 0;
        // The SDK hands this back as a plain object whose `format` is a STRING
        // ("6" colour, "2" grayscale, "15" binary). Compared with === against
        // the numeric constants below, every branch missed, the function
        // returned null, and every caller silently fell back to the source
        // image — which is why all the intermediate images looked identical.
        var format = Number(imageData.format);

        var canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        var ctx = canvas.getContext('2d');
        var out = ctx.createImageData(width, height);
        var data = out.data;
        var x, y, i, s;

        if (format === 2 && bytes.length >= width * height) {
            var rowStride = stride || width;
            for (y = 0; y < height; y++) {
                s = y * rowStride;
                for (x = 0; x < width; x++) {
                    i = (y * width + x) * 4;
                    data[i] = data[i + 1] = data[i + 2] = bytes[s + x];
                    data[i + 3] = 255;
                }
            }
        } else if ((format === 0 || format === 1) && bytes.length >= Math.ceil(width / 8) * height) {
            var rowBytes = stride || Math.ceil(width / 8);
            var invertBit = format === 1;
            for (y = 0; y < height; y++) {
                s = y * rowBytes;
                for (x = 0; x < width; x++) {
                    var bit = (bytes[s + (x >> 3)] >> (7 - (x & 7))) & 1;
                    var grey = bit ? 255 : 0;
                    if (invertBit) grey = 255 - grey;
                    i = (y * width + x) * 4;
                    data[i] = data[i + 1] = data[i + 2] = grey;
                    data[i + 3] = 255;
                }
            }
        } else if ((format === 13 || format === 15) && bytes.length >= width * height) {
            var invertByte = format === 15;
            var strideByte = stride || width;
            for (y = 0; y < height; y++) {
                s = y * strideByte;
                for (x = 0; x < width; x++) {
                    var level = bytes[s + x] ? 255 : 0;
                    if (invertByte) level = 255 - level;
                    i = (y * width + x) * 4;
                    data[i] = data[i + 1] = data[i + 2] = level;
                    data[i + 3] = 255;
                }
            }
        } else if ((format === 6 || format === 12) && bytes.length >= width * height * 3) {
            // Measured on this build: both "IPF_RGB_888" (6) and "IPF_BGR_888"
            // (12) hand the bytes over as B,G,R \u2014 24 random pixels compared
            // against the source canvas came back with red and blue swapped
            // every single time. Trusting the RGB name at face value would put
            // a blue cast on every colour image shown here.
            var stride3 = stride || width * 3;
            for (y = 0; y < height; y++) {
                s = y * stride3;
                for (x = 0; x < width; x++) {
                    var b0 = bytes[s + x * 3];
                    var b1 = bytes[s + x * 3 + 1];
                    var b2 = bytes[s + x * 3 + 2];
                    i = (y * width + x) * 4;
                    data[i] = b2;
                    data[i + 1] = b1;
                    data[i + 2] = b0;
                    data[i + 3] = 255;
                }
            }
        } else if ((format === 7 || format === 10) && bytes.length >= width * height * 4) {
            // ARGB_8888 is A,R,G,B. ABGR_8888 is A,B,G,R — which is what the SDK
            // produces from canvas pixels, and therefore the common case here.
            var isArgb = format === 7;
            var stride4 = stride || width * 4;
            for (y = 0; y < height; y++) {
                s = y * stride4;
                for (x = 0; x < width; x++) {
                    var p1 = bytes[s + x * 4 + 1];
                    var p2 = bytes[s + x * 4 + 2];
                    var p3 = bytes[s + x * 4 + 3];
                    i = (y * width + x) * 4;
                    data[i] = isArgb ? p1 : p3;
                    data[i + 1] = p2;
                    data[i + 2] = isArgb ? p3 : p1;
                    data[i + 3] = 255;
                }
            }
        } else if (bytes.length >= width * height * 4) {
            var strideFallback = stride || width * 4;
            for (y = 0; y < height; y++) {
                s = y * strideFallback;
                for (x = 0; x < width; x++) {
                    i = (y * width + x) * 4;
                    data[i] = bytes[s + x * 4 + 3];
                    data[i + 1] = bytes[s + x * 4 + 2];
                    data[i + 2] = bytes[s + x * 4 + 1];
                    data[i + 3] = 255;
                }
            }
        } else {
            return null;
        }

        ctx.putImageData(out, 0, 0);
        IMAGE_CACHE.set(imageData, canvas);
        return canvas;
    }

    /*
     * A stage's vectors are drawn over its own coordinate space, scaled by the
     * ratio between that space and the image being shown. The two are equal unless
     * the stage sits after SST_SCALE_IMAGE, which is exactly when the factor is
     * needed.
     */
    function renderPreview() {
        updateRoiHint();
        if (!state.source) return;
        var base = dom['preview_base'];
        var overlay = dom['preview_overlay'];
        var stage = state.selectedStage === 'final' ? null : stageById(state.selectedStage);
        // Declared here, not inside the stage branch: the final view appends it too, and a var
        // assigned only in the other branch arrived there as `undefined` — which is what the caption
        // literally said before this line moved.
        var roiSuffix = '';
        if (state.showRoi) {
            var roiState = roiQuad();
            if (roiState) {
                roiSuffix = roiState.whole
                    ? '  ·  ROI: the whole image, so nothing is excluded'
                    : '  ·  ROI: outside the outline is not looked at';
            }
        }

        var background = stage ? backgroundFor(stage.id) : { stageId: 'source', canvas: state.source.canvas };
        var image = background
            ? (background.imageData ? imageDataToCanvas(background.imageData) : background.canvas)
            : null;
        if (!image) image = state.source.canvas;

        base.width = image.width;
        base.height = image.height;
        var baseCtx = base.getContext('2d');
        baseCtx.clearRect(0, 0, base.width, base.height);
        baseCtx.drawImage(image, 0, 0);

        overlay.width = image.width;
        overlay.height = image.height;
        var ctx = overlay.getContext('2d');
        ctx.clearRect(0, 0, overlay.width, overlay.height);

        var kx = image.width / (state.originalWidth || image.width);
        var ky = image.height / (state.originalHeight || image.height);

        if (stage) {
            drawStageVectors(ctx, stage, kx, ky);
            // The three candidate-image stages hand back a crop with no position in the frame:
            // `IRUT_SCALED_BARCODE_IMAGE` carries pixels and nothing else,
            // `IRUT_COMPLEMENTED_BARCODE_IMAGE`'s `location` is the barcode *inside* the crop,
            // and the crops' aspect ratios do not match any located quad (measured: 2.386 and
            // 1.875 against a nearest 2.200, with ties), so they cannot be matched back either.
            // Rather than swap the whole preview to a 272x114 window and move the page, the
            // frame stays the picture, the located candidates are outlined as the candidate
            // positions, and the crop the decoder worked on is drawn as a labelled magnifier.
            // The magnifier claims a size, not a place.
            if (isCandidateCropStage(stage)) {
                drawLocatedRegions(ctx, kx, ky);
                state.cropAreas = drawCropAreas(ctx, stage, kx, ky);
            }
            // Whether this stage produced anything *this run* is the first thing the
            // caption has to be honest about: a stage can be selected and then fall
            // silent after an edit, and silently showing another stage's image under
            // this stage's name is worse than showing nothing.
            var hasUnit = !!state.units[stage.id];
            var cropGroup = state.unitGroups[stage.id] || [];
            var cropSuffix = cropGroup.length
                ? (function () {
                    var areas = state.cropAreas || { total: cropGroup.length, matched: cropGroup.length };
                    var head = '  \u00b7  ' + cropGroup.length + ' candidate image'
                        + (cropGroup.length === 1 ? '' : 's');
                    // "0 of 2 outlined" would contradict itself, so the unmatched cases say what
                    // actually happened instead of reusing the same sentence with a different number.
                    if (!areas.matched) {
                        return head + '; neither could be matched to a located region, so the frame '
                            + 'shows only the located candidates  \u00b7  the crops are in the gallery below';
                    }
                    if (areas.matched < areas.total) {
                        return head + ' outlined on the frame (' + areas.matched + ' of ' + areas.total
                            + '; the rest could not be matched to a located region), '
                            + ((state.selectedCrop[stage.id] || 0) + 1) + ' selected'
                            + '  \u00b7  the crops are in the gallery below';
                    }
                    return head + ' on the frame, each area identified by its pixel size, '
                        + ((state.selectedCrop[stage.id] || 0) + 1) + ' selected'
                        + '  \u00b7  the crops are in the gallery below';
                })()
                : '';
            var overSuffix = '';
            if (background && background.stageId !== 'source' && background.stageId !== stage.id) {
                overSuffix = hasUnit
                    ? '  \u00b7  over \u201c' + stageTitleOf(background.stageId) + '\u201d'
                    : '  \u00b7  the image below is \u201c' + stageTitleOf(background.stageId) + '\u201d';
            }
            dom['preview_caption'].textContent = stage.title
                + (stage.stage ? '  \u00b7  ' + stage.stage : '')
                + (hasUnit ? '' : '  \u00b7  reported nothing on this run')
                + overSuffix
                + cropSuffix
                + roiSuffix;
        } else {
            drawFinalOverlay(ctx, kx, ky);
            var missed = state.compare ? state.compare.missed : null;
            drawMissedExpected(ctx, kx, ky, missed);
            dom['preview_caption'].textContent = 'Final result  \u00b7  decoded barcodes on the original image'
                + (missed && missed.length
                    ? '  \u00b7  ' + missed.length + ' annotated but not decoded, outlined'
                    : '')
                + roiSuffix;
        }

        if (state.showRoi) drawRoiOverlay(ctx, kx, ky);
    }

    /* Is this stage's own unit a candidate crop rather than the frame? */
    function isCandidateCropStage(stage) {
        var unit = state.units[stage.id];
        return !!(unit && unit.imageData && isCandidateStageId(stage.id));
    }

    /*
     * The located candidates, outlined on the frame. These are the positions the SDK does
     * report, and for the decode-section stages they are the candidates the crops are made
     * from — which is as close to "where did this crop come from" as the data allows.
     */
    function drawLocatedRegions(ctx, kx, ky) {
        var unit = state.units.localizedBarcodes;
        var items = (unit && unit.localizedBarcodes) || [];
        items.forEach(function (item, index) {
            strokeQuad(ctx, item.location, kx, ky, 'rgba(254,142,20,0.55)', 2);
            var points = item.location && item.location.points;
            if (points && points.length) label(ctx, 'L' + (index + 1), points[0].x * kx, points[0].y * ky);
        });
        return items.length;
    }

    /*
     * Where a candidate crop sits on the frame, when the geometry says so unambiguously.
     *
     * The SDK reports no position for these images, but it does not have to: the crop is the
     * located region plus a uniform margin, and the crop's pixel size is enough to identify which
     * region it is. Padding the region by `pad` on all four sides has to reproduce the crop's
     * width and height, and the residual is what the search minimises. Accepted only when the best
     * residual is a pixel or less *and* no second region matches as well, because a box on the
     * frame is a claim about where the crop came from: measured across the bundled samples, the
     * product label matches exactly (272x114 = 250x92 + 11px, 165x88 = 143x65 + 12px), while the
     * healthcare sheet and the dense QR sheet tie two or more regions — those draw no box.
     */
    function matchCropToRegion(crop, regions) {
        var cropW = crop.width, cropH = crop.height;
        var ranked = [];
        regions.forEach(function (region, index) {
            var bw = region.x1 - region.x0, bh = region.y1 - region.y0;
            if (bw <= 0 || bh <= 0) return;
            var best = null;
            for (var pad = 0; pad <= 32; pad++) {
                var rw = bw + pad * 2, rh = bh + pad * 2;
                var residual = Math.abs(rw - cropW) + Math.abs(rh - cropH);
                if (!best || residual < best.residual) best = { pad: pad, rw: rw, rh: rh, residual: residual };
            }
            ranked.push({ index: index, region: region, pad: best.pad, rw: best.rw, rh: best.rh,
                residual: best.residual, scale: cropW !== 0 ? Number((cropW / best.rw).toFixed(3)) : 0 });
        });
        if (!ranked.length) return null;
        ranked.sort(function (a, b) { return a.residual - b.residual; });
        var winner = ranked[0];
        var runnerUp = ranked[1];
        var unambiguous = winner.residual <= 1 && (!runnerUp || runnerUp.residual > winner.residual + 1);
        if (!unambiguous) return null;
        // The crop covers the padded region, so that is the area to outline.
        return {
            index: winner.index, pad: winner.pad, scale: winner.scale,
            x0: winner.region.x0 - winner.pad, y0: winner.region.y0 - winner.pad,
            x1: winner.region.x1 + winner.pad, y1: winner.region.y1 + winner.pad
        };
    }

    function locatedRegions() {
        var unit = state.units.localizedBarcodes;
        return ((unit && unit.localizedBarcodes) || []).map(function (item) {
            var points = (item.location && item.location.points) || [];
            var xs = points.map(function (p) { return p.x; });
            var ys = points.map(function (p) { return p.y; });
            return { item: item, x0: Math.min.apply(null, xs), y0: Math.min.apply(null, ys),
                x1: Math.max.apply(null, xs), y1: Math.max.apply(null, ys) };
        });
    }

    /*
     * Every crop this stage produced, outlined on the frame. No separate picture: the candidate
     * gallery below already shows the crops themselves, and outlining the areas here is what makes
     * the three candidate cards comparable with the rest of the strip — the same frame, another
     * colour. The selected one is drawn solid and labelled; the others stay visible but recede,
     * because a card reading "2 candidate snapshots" over a frame with one box is a miscount to the
     * reader. Returns how many were matched, so the caption can say when one could not be.
     */
    function drawCropAreas(ctx, stage, kx, ky) {
        var group = state.unitGroups[stage.id] || [];
        if (!group.length) return { total: 0, matched: 0 };
        var selected = state.selectedCrop[stage.id] || 0;
        var regions = locatedRegions();
        var matched = 0;
        group.forEach(function (entry, index) {
            if (!entry || !entry.unit.imageData) return;
            var match = matchCropToRegion(entry.unit.imageData, regions);
            if (!match) return;
            matched++;
            var isSelected = index === selected;
            ctx.save();
            ctx.strokeStyle = isSelected ? 'rgba(37,99,235,0.95)' : 'rgba(37,99,235,0.45)';
            ctx.lineWidth = isSelected ? 3 : 2;
            ctx.setLineDash(isSelected ? [10, 5] : [4, 4]);
            ctx.beginPath();
            ctx.moveTo(match.x0 * kx, match.y0 * ky);
            ctx.lineTo(match.x1 * kx, match.y0 * ky);
            ctx.lineTo(match.x1 * kx, match.y1 * ky);
            ctx.lineTo(match.x0 * kx, match.y1 * ky);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
            label(ctx, 'candidate ' + (index + 1) + ' of ' + group.length
                + (isSelected ? ' — this area' : ''), match.x0 * kx, match.y0 * ky);
        });
        return { total: group.length, matched: matched };
    }

    function drawStageVectors(ctx, stage, kx, ky) {
        var unit = state.units[stage.id];
        if (!unit) return;

        if (unit.contours) {
            ctx.strokeStyle = 'rgba(254,142,20,0.75)';
            ctx.lineWidth = Math.max(1, ctx.canvas.width / 900);
            var drawn = 0;
            for (var c = 0; c < unit.contours.length && drawn < MAX_SHAPES_DRAWN; c++) {
                var points = unit.contours[c].points;
                if (!points || points.length < 2) continue;
                ctx.beginPath();
                polyline(ctx, points, kx, ky, true);
                ctx.stroke();
                drawn++;
            }
            if (unit.contours.length > drawn) {
                label(ctx, 'showing ' + drawn + ' of ' + unit.contours.length + ' contours', 8, 8);
            }
        }

        if (unit.shortLines) {
            drawLines(ctx, unit.shortLines, kx, ky, 'rgba(48,104,119,0.9)');
        }
        if (unit.lineSegments) {
            drawLines(ctx, unit.lineSegments, kx, ky, 'rgba(48,104,119,0.9)');
        }
        if (unit.textZones) {
            drawQuads(ctx, unit.textZones.map(function (z) { return z.location; }), kx, ky,
                'rgba(102,102,102,0.9)', false, 'text zone');
        }
        if (unit.predetectedRegions) {
            drawQuads(ctx, unit.predetectedRegions.map(function (r) { return r.location; }), kx, ky,
                'rgba(139,92,246,0.9)', true, 'pre-detected region');
        }
        if (unit.candidateBarcodeZones) {
            drawQuads(ctx, unit.candidateBarcodeZones.map(function (z) { return z.location; }), kx, ky,
                'rgba(8,145,178,0.95)', true, 'candidate zone');
        }
        if (unit.localizedBarcodes) {
            unit.localizedBarcodes.forEach(function (item, index) {
                strokeQuad(ctx, item.location, kx, ky, 'rgba(254,142,20,0.95)', 3);
                var points = item.location && item.location.points;
                if (points && points.length) {
                    label(ctx, 'L' + (index + 1) + ' \u00b7 ' + Math.round(item.confidence),
                        points[0].x * kx, points[0].y * ky);
                }
            });
        }
        if (unit.decodedBarcodes) {
            unit.decodedBarcodes.forEach(function (item, index) {
                strokeQuad(ctx, item.location, kx, ky, 'rgba(22,163,74,0.95)', 3);
                var points = item.location && item.location.points;
                if (points && points.length) {
                    label(ctx, 'D' + (index + 1) + ' \u00b7 ' + item.formatString, points[0].x * kx, points[0].y * ky);
                }
            });
        }
        if (unit.location && !(unit.imageData && isCandidateStageId(stage.id))) {
            strokeQuad(ctx, unit.location, kx, ky, 'rgba(22,163,74,0.95)', 2);
        }
    }

    function drawLines(ctx, lines, kx, ky, colour) {
        ctx.save();
        ctx.strokeStyle = colour;
        ctx.lineWidth = Math.max(1, ctx.canvas.width / 900);
        lines.slice(0, MAX_SHAPES_DRAWN).forEach(function (line) {
            ctx.beginPath();
            ctx.moveTo(line.startPoint.x * kx, line.startPoint.y * ky);
            ctx.lineTo(line.endPoint.x * kx, line.endPoint.y * ky);
            ctx.stroke();
        });
        ctx.restore();
    }

    function drawFinalOverlay(ctx, kx, ky) {
        barcodeItems(state.lastResult).forEach(function (item, index) {
            if (!item.location) return;
            strokeQuad(ctx, item.location, kx, ky, 'rgba(254,142,20,0.98)', 3);
            var points = item.location.points || [];
            if (points.length) {
                label(ctx, '#' + (index + 1) + ' \u00b7 ' + item.formatString, points[0].x * kx, points[0].y * ky);
            }
        });
    }

    /*
     * An annotated barcode the run did not return is the actionable one, so its
     * quad is drawn dashed and labelled. Reading a parameter change is then a
     * matter of watching whether this outline stops being one.
     */
    function drawMissedExpected(ctx, kx, ky, missed) {
        if (!missed || !missed.length) return;
        ctx.save();
        ctx.setLineDash([10, 7]);
        missed.forEach(function (want, index) {
            var quad = {
                points: (want.points || []).map(function (point) {
                    return { x: point[0], y: point[1] };
                })
            };
            if (quad.points.length < 3) return;
            strokeQuad(ctx, quad, kx, ky, 'rgba(48,104,119,0.95)', 2);
            label(ctx, 'expected #' + (index + 1) + ' \u00b7 ' + (want.format || ''),
                quad.points[0].x * kx, quad.points[0].y * ky);
        });
        ctx.restore();
    }

    /*
     * The template's region of interest, in frame coordinates, plus whether it covers the whole
     * frame.
     *
     * Every stock preset sets the ROI to the whole image in percent — (0,0) to (100,100) — so the
     * outline "show the region of interest" draws lands exactly on the frame border and the control
     * looks broken. That is data, not a fault, but a control that appears to do nothing is a fault:
     * the UI now says which of the two it is looking at instead of drawing an invisible rectangle.
     */
    function roiQuad() {
        var roi = state.model && state.model.roiDefs && state.model.roiDefs[0];
        var offset = roi && roi.Location && roi.Location.Offset;
        if (!offset) return null;
        var names = ['FirstPoint', 'SecondPoint', 'ThirdPoint', 'FourthPoint'];
        var frameW = state.originalWidth || 0;
        var frameH = state.originalHeight || 0;
        var percent = !!offset.MeasuredByPercentage;
        var points = names.map(function (name) {
            var point = offset[name];
            if (!Array.isArray(point) || point.length < 2) return null;
            return {
                x: percent ? point[0] / 100 * frameW : point[0],
                y: percent ? point[1] / 100 * frameH : point[1]
            };
        });
        if (points.some(function (p) { return !p; })) return null;
        // Corners at (0,0) and (frame) in either unit mean "the whole image".
        var slack = percent ? 1 : 2;
        var whole = !frameW || !frameH
            ? false
            : Math.abs(points[0].x) <= slack && Math.abs(points[0].y) <= slack
                && Math.abs(points[2].x - frameW) <= slack && Math.abs(points[2].y - frameH) <= slack;
        return { points: points, percent: percent, whole: whole };
    }

    /* The toggle's own caption: what the ROI is, and what the outline should look like. */
    function updateRoiHint() {
        if (!dom['roi_hint']) return;
        var quad = roiQuad();
        if (!quad) { dom['roi_hint'].textContent = ''; return; }
        if (!state.showRoi) {
            dom['roi_hint'].textContent = quad.whole ? 'the whole image' : 'a restricted region';
            return;
        }
        dom['roi_hint'].textContent = quad.whole
            ? 'the whole image \u2014 nothing is excluded, so there is no outline to see'
            : 'outlined \u00b7 the engine looks nowhere else';
    }

    function drawRoiOverlay(ctx, kx, ky) {
        var quad = roiQuad();
        if (!quad || quad.whole) return false;
        // Outside the ROI is cleared away rather than merely outlined: the point of the
        // parameter is what the engine does *not* look at.
        var xs = quad.points.map(function (p) { return p.x * kx; });
        var ys = quad.points.map(function (p) { return p.y * ky; });
        var left = Math.min.apply(null, xs), right = Math.max.apply(null, xs);
        var top = Math.min.apply(null, ys), bottom = Math.max.apply(null, ys);
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.66)';
        ctx.fillRect(0, 0, ctx.canvas.width, top);
        ctx.fillRect(0, bottom, ctx.canvas.width, ctx.canvas.height - bottom);
        ctx.fillRect(0, top, left, bottom - top);
        ctx.fillRect(right, top, ctx.canvas.width - right, bottom - top);
        ctx.setLineDash([9, 6]);
        ctx.strokeStyle = 'rgba(48,104,119,0.95)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        polyline(ctx, quad.points, kx, ky, true);
        ctx.stroke();
        ctx.restore();
        label(ctx, 'region of interest', left, top);
        return true;
    }

    function polyline(ctx, points, kx, ky, close) {
        points.forEach(function (point, index) {
            if (!point) return;
            var x = (point.x !== undefined ? point.x : point[0]) * kx;
            var y = (point.y !== undefined ? point.y : point[1]) * ky;
            if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        if (close) ctx.closePath();
    }

    function strokeQuad(ctx, quad, kx, ky, colour, width) {
        if (!quad || !quad.points || quad.points.length < 3) return;
        ctx.save();
        ctx.strokeStyle = colour;
        ctx.lineWidth = width;
        ctx.beginPath();
        polyline(ctx, quad.points, kx, ky, true);
        ctx.stroke();
        ctx.restore();
    }

    function drawQuads(ctx, quads, kx, ky, colour, dashed, tag) {
        ctx.save();
        if (dashed) ctx.setLineDash([7, 5]);
        ctx.strokeStyle = colour;
        ctx.lineWidth = 2;
        quads.slice(0, MAX_SHAPES_DRAWN).forEach(function (quad, index) {
            if (!quad || !quad.points || quad.points.length < 3) return;
            ctx.beginPath();
            polyline(ctx, quad.points, kx, ky, true);
            ctx.stroke();
            if (index === 0 && tag) {
                label(ctx, tag + (quads.length > 1 ? ' \u00d7' + quads.length : ''),
                    quad.points[0].x * kx, quad.points[0].y * ky);
            }
        });
        ctx.restore();
    }

    function label(ctx, text, x, y) {
        var scale = Math.max(1, ctx.canvas.width / 900);
        var size = Math.round(13 * scale);
        ctx.save();
        ctx.font = '600 ' + size + 'px "Open Sans", sans-serif';
        var width = ctx.measureText(text).width + size;
        var height = size * 1.7;
        var left = clamp(x, 0, Math.max(0, ctx.canvas.width - width));
        var top = clamp(y - height, 0, Math.max(0, ctx.canvas.height - height));
        ctx.fillStyle = 'rgba(50,50,52,0.86)';
        ctx.fillRect(left, top, width, height);
        ctx.fillStyle = '#ffffff';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, left + size / 2, top + height / 2);
        ctx.restore();
    }

    /* ------------------------------------------------------------ ground truth */

    /*
     * The bundled samples carry the dataset's own annotations: every barcode the
     * image is known to contain, with its text and its quad. Checking a run
     * against that turns "nothing decoded" into a measurement — which symbol was
     * missed, and where it sits — which is what a parameter change then has to
     * move. An uploaded image or a camera frame has no annotation, so the block
     * is simply absent for those.
     */
    function loadGroundTruth() {
        if (state.groundTruthPromise) return state.groundTruthPromise;
        state.groundTruthPromise = fetch('samples/annotations.json')
            .then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.json();
            })
            .then(function (document) {
                state.groundTruth = {};
                (document.images || []).forEach(function (entry) {
                    state.groundTruth[entry.file] = entry.barcodes || [];
                });
            })
            .catch(function (ex) {
                state.groundTruth = {};
                console.warn('The ground-truth annotations could not be loaded:', ex);
            });
        return state.groundTruthPromise;
    }

    function expectedFor(name) {
        return (state.groundTruth && state.groundTruth[name]) || null;
    }

    /*
     * Whitespace and case are the only normalisation. A wrong character is a
     * finding, and smoothing it away is how a tuner starts lying.
     */
    function normalizeText(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/\s+/g, ' ').trim().toLowerCase();
    }

    /*
     * Expected and decoded are matched as multisets by text: the same symbol
     * printed twice has to be found twice, and a decoded barcode the annotations
     * do not list is reported separately rather than counted as a success.
     */
    function compareWithExpected(barcodes) {
        var expected = state.expected;
        if (!expected || !expected.length) return null;
        var remaining = barcodes.slice();
        var found = [];
        var missed = [];
        expected.forEach(function (want) {
            var hit = -1;
            for (var i = 0; i < remaining.length; i++) {
                if (normalizeText(remaining[i].text) === normalizeText(want.text)) { hit = i; break; }
            }
            if (hit === -1) {
                missed.push(want);
            } else {
                found.push({ want: want, got: remaining[hit] });
                remaining.splice(hit, 1);
            }
        });
        return { expected: expected, found: found, missed: missed, extra: remaining };
    }

    function truncate(text, limit) {
        var value = String(text === undefined || text === null ? '' : text).replace(/\s+/g, ' ');
        return value.length > limit ? value.slice(0, limit - 1) + '\u2026' : value;
    }

    function groundTruthBlock(compare) {
        var box = el('div', 'truth-block');
        box.appendChild(el('p', 'truth-headline ' + (compare.missed.length ? 'truth-missed' : 'truth-clean'),
            compare.missed.length
                ? (compare.missed.length === 1
                    ? 'One annotated barcode was not decoded'
                    : compare.missed.length + ' of the ' + compare.expected.length
                        + ' annotated barcodes were not decoded')
                : 'Every barcode in the annotations was decoded (' + compare.expected.length + ')'));

        if (compare.missed.length) {
            box.appendChild(el('p', 'hint', 'The missed symbols are outlined on the image above and '
                + 'listed here. Work down the stage strip to find the stage that lost them.'));
            var list = el('div', 'truth-list');
            compare.missed.forEach(function (want) {
                list.appendChild(truthRow('missed', want));
            });
            box.appendChild(list);
        }

        if (compare.extra.length) {
            box.appendChild(el('p', 'hint', compare.extra.length === 1
                ? 'One decoded barcode is not in the annotations — a genuine extra find, or a text mismatch.'
                : compare.extra.length + ' decoded barcodes are not in the annotations — genuine extra '
                    + 'finds, or text mismatches.'));
        }

        if (compare.found.length) {
            var matched = el('details', 'truth-found');
            matched.appendChild(el('summary', null, compare.found.length + ' matched the annotations'));
            compare.found.forEach(function (pair) {
                matched.appendChild(truthRow('found', pair.want));
            });
            box.appendChild(matched);
        }
        return box;
    }

    function truthRow(status, want) {
        var row = el('div', 'truth-row truth-row-' + status);
        row.appendChild(el('span', 'truth-status', status));
        row.appendChild(el('span', 'truth-format', want.format || '?'));
        row.appendChild(el('span', 'truth-text', truncate(want.text, 120) || '(empty)'));
        return row;
    }

    /* -------------------------------------------------------------- the run */

    /*
     * Runs are coalesced, not queued: a slider drag can request a dozen runs, and
     * only the final state is worth computing. At most one run waits behind the one
     * in flight.
     */
    function requestRun(reason) {
        state.runPending = reason || 'parameter change';
        if (state.runActive) return;
        state.runActive = true;
        (async function loop() {
            while (state.runPending !== null) {
                var next = state.runPending;
                state.runPending = null;
                await executeRun(next);
            }
            state.runActive = false;
        })();
    }

    function scheduleRun(delay, reason) {
        if (state._runTimer) clearTimeout(state._runTimer);
        clearChangesPending();
        state._runTimer = setTimeout(function () {
            state._runTimer = null;
            requestRun(reason || 'parameter change');
        }, delay === undefined ? EDIT_DEBOUNCE_MS : delay);
    }

    /**
     * What a change does depends on the auto-run switch. On: coalesce rapid
     * edits into one run a moment later. Off: mark the Run button so it is
     * obvious that the change has not been measured yet.
     */
    function afterChange(reason, delay) {
        if (state.autoRun) {
            scheduleRun(delay, reason);
        } else {
            markChangesPending();
        }
    }

    function markChangesPending() {
        state.changesPending = true;
        dom['run_button'].classList.add('btn-attention');
        dom['auto_run_hint'].textContent = 'changes waiting \u2014 press Run';
    }

    function clearChangesPending() {
        if (!state.changesPending) return;
        state.changesPending = false;
        dom['run_button'].classList.remove('btn-attention');
        dom['auto_run_hint'].textContent = '';
    }

    /*
     * Both action buttons rest on the same three facts — an engine that is up, an
     * image to read, and no capture already running — so they are derived in one
     * place instead of being switched on and off at each call site. The compare
     * button is additionally useless until the SDK's template list has been read
     * (there would be nothing to compare), and it stays quiet for the whole of its
     * own run, which re-enters the capture loop.
     */
    function updateActionButtons(busy) {
        var blocked = !!busy || !state.ready || !state.source;
        dom['run_button'].disabled = blocked;
        dom['compare_button'].disabled = blocked || !state.templates.length || state._comparing;
        // The shutter is only meaningful once an engine can read the frame it takes.
        dom['camera_shoot'].disabled = !state.ready;
    }

    function setRunning(busy, label) {
        dom['preview_status'].textContent = busy ? (label || 'running\u2026') : '';
        dom['preview_status'].classList.toggle('status-busy', !!busy);
        updateActionButtons(busy);
    }

    async function executeRun(reason) {
        if (!state.ready || !state.source || !state.template) return;
        clearChangesPending();
        var token = ++state.runToken;
        setRunning(true, 'running\u2026');
        clearStageEvidence();

        try {
            var info = await state.cvr.initSettings(safeStringify(state.template));
            if (info && info.errorCode) {
                throw new Error('The template was rejected: [' + info.errorCode + '] ' + info.errorString);
            }

            var result = await state.cvr.capture(makeDsImage(state.source.canvas), state.templateName);
            if (token !== state.runToken) return;

            // Intermediate units arrive through their own callbacks. Give the
            // worker's message queue a moment to drain so the first paint of the
            // strip is the whole picture rather than a partial one.
            await settleIntermediate();
            if (token !== state.runToken) return;

            state.lastResult = result;
            var barcodes = barcodeItems(result);
            renderResults(result, barcodes);
            renderStageStrip();
            renderPreview();

            if (result && result.errorCode) {
                logRun('warn', 'capture() reported [' + result.errorCode + '] ' + result.errorString);

            } else if (barcodes.length) {
                logRun('ok', barcodes.length + (barcodes.length === 1 ? ' barcode' : ' barcodes')
                    + ' decoded from \u201c' + state.sourceLabel + '\u201d (' + reason + ').');

            } else {
                logRun('warn', 'No barcode decoded from \u201c' + state.sourceLabel + '\u201d (' + reason + ').');

            }
        } catch (ex) {
            var message = (ex && (ex.message || ex.errorString)) || String(ex);
            logRun('bad', 'Run failed: ' + message);
            renderResults(null, []);
            console.error(ex);
        } finally {
            if (token === state.runToken) {
                setRunning(false);
                renderJson();
            }
        }
    }

    function settleIntermediate() {
        return new Promise(function (resolve) {
            requestAnimationFrame(function () {
                setTimeout(function () {
                    requestAnimationFrame(resolve);
                }, 40);
            });
        });
    }

    function makeDsImage(canvas) {
        var ctx = canvas.getContext('2d', { willReadFrequently: true });
        var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // A fresh buffer every call: capture() detaches the one it is handed, so a
        // reused DSImageData fails on the second run with "ArrayBuffer at index 0
        // is already detached" — which looks like a template problem and is not.
        return {
            bytes: new Uint8Array(imageData.data.buffer, imageData.data.byteOffset, imageData.data.length),
            width: imageData.width,
            height: imageData.height,
            stride: 4 * imageData.width,
            format: IPF_ABGR_8888
        };
    }

    /*
     * capture() puts results in `items`; `barcodeResultItems` exists only on the
     * streaming result a receiver gets. Accept either — reading only the wrong one
     * makes a working decoder look broken.
     */
    function barcodeItems(result) {
        if (!result) return [];
        if (Array.isArray(result.items)) {
            return result.items.filter(function (item) { return item && item.type === CRIT_BARCODE; });
        }
        if (result.decodedBarcodesResult && Array.isArray(result.decodedBarcodesResult.barcodeResultItems)) {
            return result.decodedBarcodesResult.barcodeResultItems;
        }
        return [];
    }

    function renderResults(result, barcodes) {
        var body = dom['result_body'];
        clear(body);

        if (!result) {
            body.appendChild(el('p', 'hint', 'No run has finished yet.'));
            dom['result_summary'].textContent = '';
            return;
        }

        state.compare = compareWithExpected(barcodes);

        dom['result_summary'].textContent = (barcodes.length
            ? barcodes.length + (barcodes.length === 1 ? ' barcode decoded' : ' barcodes decoded')
            : 'nothing decoded')
            + (state.compare
                ? '  \u00b7  ' + state.compare.found.length + ' of ' + state.compare.expected.length
                    + ' expected'
                : '');

        if (state.compare) body.appendChild(groundTruthBlock(state.compare));

        if (!barcodes.length) {
            var empty = el('div', 'empty-result');
            empty.appendChild(el('p', null, 'The engine returned no barcodes for this image with the '
                + 'current template.'));
            empty.appendChild(el('p', 'hint', 'Work down the stage strip: the last stage that produced a '
                + 'result tells you which setting to change. Nothing downstream can recover a barcode '
                + 'localization never found.'));
            body.appendChild(empty);
            return;
        }

        var table = el('table', 'result-table');
        var head = el('thead');
        var headRow = el('tr');
        ['#', 'Format', 'Text', 'Confidence', 'Angle', 'Module', 'Flags', 'Details']
            .forEach(function (name) { headRow.appendChild(el('th', null, name)); });
        head.appendChild(headRow);
        table.appendChild(head);

        var tbody = el('tbody');
        barcodes.forEach(function (item, index) {
            var row = el('tr');
            row.appendChild(el('td', 'num', String(index + 1)));
            row.appendChild(el('td', null, item.formatString || String(item.format)));
            var textCell = el('td', 'text-cell', item.text === '' ? '(empty)' : item.text);
            textCell.title = item.text;
            row.appendChild(textCell);
            row.appendChild(el('td', 'num', String(item.confidence)));
            row.appendChild(el('td', 'num', fmtNumber(item.angle) + '\u00b0'));
            row.appendChild(el('td', 'num', fmtNumber(item.moduleSize)));
            var flags = [];
            if (item.isDPM) flags.push('DPM');
            if (item.isMirrored) flags.push('mirrored');
            if (item.extendedBarcodeResults && item.extendedBarcodeResults.length) {
                flags.push('+' + item.extendedBarcodeResults.length + ' extended');
            }
            row.appendChild(el('td', null, flags.join(', ')));
            row.appendChild(el('td', 'brief-cell', briefDetails(item)));
            tbody.appendChild(row);
        });
        table.appendChild(tbody);
        body.appendChild(table);

        var points = barcodes.map(function (item) {
            var list = (item.location && item.location.points) || [];
            return list.map(function (p) {
                return Math.round(p.x) + ',' + Math.round(p.y);
            }).join('  ');
        }).filter(function (line) { return line !== ''; });
        if (points.length) {
            var box = el('details', 'points-box');
            box.appendChild(el('summary', null, 'Corner coordinates'));
            points.forEach(function (line, index) {
                box.appendChild(el('p', 'hint', '#' + (index + 1) + '  ' + line));
            });
            body.appendChild(box);
        }
    }

    function briefDetails(item) {
        var details = item.details;
        if (!details) return '';
        var parts = [];
        if (details.rows !== undefined && details.columns !== undefined) {
            parts.push(details.rows + '\u00d7' + details.columns);
        }
        if (details.version !== undefined) parts.push('version ' + details.version);
        if (details.errorCorrectionLevel !== undefined) parts.push('EC ' + details.errorCorrectionLevel);
        if (details.startCharsBytes) {
            parts.push('start ' + bytesToText(details.startCharsBytes) + ' / stop ' + bytesToText(details.stopCharsBytes));
        }
        if (details.checkDigitBytes && details.checkDigitBytes.length) {
            parts.push('check digit ' + bytesToText(details.checkDigitBytes));
        }
        if (Array.isArray(details.codewords)) parts.push(details.codewords.length + ' codewords');
        if (typeof details.codewords === 'string') parts.push(details.codewords.length + ' codeword characters');
        return parts.join(' \u00b7 ');
    }

    function bytesToText(bytes) {
        if (!bytes) return '';
        var out = '';
        for (var i = 0; i < bytes.length; i++) {
            var value = bytes[i];
            out += (value >= 32 && value < 127)
                ? String.fromCharCode(value)
                : '\\x' + value.toString(16).padStart(2, '0');
        }
        return out;
    }

    /* ------------------------------------------------------------- JSON panel */

    function renderJson() {
        if (!state.template) return;
        dom['json_editor'].value = safeStringify(state.template, true);
        dom['json_status'].textContent = 'What is applied: '
            + (state.templateIncludesDefaults
                ? 'the preset read back from the SDK with every default expanded.'
                : 'the preset as stored — a parameter sitting at its default is absent until you set it.');
        dom['json_status'].className = 'hint';
    }

    function applyJsonEditor() {
        var parsed;
        try {
            parsed = JSON.parse(dom['json_editor'].value);
        } catch (ex) {
            dom['json_status'].textContent = 'Not valid JSON, nothing applied: ' + ex.message;
            dom['json_status'].className = 'hint hint-bad';
            return;
        }
        state.template = parsed;
        var templates = parsed.CaptureVisionTemplates || [];
        var match = templates.find(function (t) { return t.Name === state.templateName; }) || templates[0];
        if (match && match.Name) {
            state.templateName = match.Name;
            // A pasted document can name a template the SDK never offered, and then
            // the select would silently keep showing the previous one.
            if (!Array.prototype.some.call(dom['template_select'].options, function (option) {
                return option.value === match.Name;
            })) {
                var option = el('option', null, match.Name + '  (from the JSON editor)');
                option.value = match.Name;
                dom['template_select'].appendChild(option);
            }
            dom['template_select'].value = match.Name;
        }
        buildModel();
        renderParamUI();
        renderJson();
        logRun('info', 'The template was replaced from the JSON editor.');

        afterChange('json edit', 0);
    }

    /* ---------------------------------------------------------- input sources */

    function loadImageFile(file, expected) {
        if (!file) return;
        var url = URL.createObjectURL(file);
        var image = new Image();
        image.onload = function () {
            var canvas = document.createElement('canvas');
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            // The context is created once here and read back on every run by
            // makeDsImage, so it has to be created with willReadFrequently — an
            // attribute asked for later on an existing context is ignored, and the
            // browser then warns on every getImageData.
            canvas.getContext('2d', { willReadFrequently: true }).drawImage(image, 0, 0);
            URL.revokeObjectURL(url);
            setSource(canvas, file.name, expected || null);

        };
        image.onerror = function () {
            URL.revokeObjectURL(url);
            logRun('bad', 'That file could not be decoded as an image.');
        };
        image.src = url;
    }

    function setSource(canvas, label, expected) {
        state.source = { canvas: canvas, width: canvas.width, height: canvas.height };
        state.sourceLabel = label;
        // What this image is known to contain, if anything: the annotations for a
        // bundled sample, null for an uploaded file or a camera frame.
        state.expected = expected || null;
        state.compare = null;
        state.originalWidth = canvas.width;
        state.originalHeight = canvas.height;
        state.selectedStage = 'final';
        state.lastResult = null;
        clearStageEvidence();

        dom['source_title'].textContent = label;
        dom['source_meta'].textContent = canvas.width + ' \u00d7 ' + canvas.height;
        // The preview frame takes this image's shape and keeps it for as long as the image
        // is loaded, so walking the pipeline — where each stage returns a differently sized
        // image, down to a 272x114 candidate crop — never resizes the panel and never moves
        // the page. `object-fit: contain` letterboxes each stage inside the frame.
        dom['preview_wrap'].style.aspectRatio = canvas.width + ' / ' + canvas.height;
        dom['preview_base'].width = canvas.width;
        dom['preview_base'].height = canvas.height;
        updateActionButtons(false);

        renderPreview();
        renderStageStrip();
        renderResults(null, []);
        scheduleRun(0, 'new image');
    }

    async function loadSample(name) {
        showLoading('Loading ' + name + '\u2026');
        try {
            var response = await fetch('samples/' + name);
            if (!response.ok) throw new Error('HTTP ' + response.status);
            var blob = await response.blob();
            await loadGroundTruth();
            hideLoading();
            loadImageFile(new File([blob], name, { type: blob.type }), expectedFor(name));
        } catch (ex) {
            hideLoading();
            logRun('bad', 'Could not load the bundled sample ' + name + ': ' + ((ex && ex.message) || ex));
        }
    }

    /*
     * The camera is a viewfinder with a shutter, not a decoding loop.
     *
     * Decoding every frame was the first shape of this control and it is the wrong
     * one for a workbench. Every number on this page is a measurement on one still
     * image; a live feed changes the question between the edit and the run, and a
     * full run is not cheap — capture plus twenty-odd stage renderings — so the
     * page spends its time behind an image the visitor cannot read. A camera frame
     * is also 1920x1080, three times the pixels of the bundled samples.
     *
     * So: opening the camera starts a preview and nothing else, and one explicit
     * press turns the current frame into the image under test. The stream stops
     * with that press — one frame is the whole point, and it keeps the camera light
     * out of the visitor's face while they tune.
     */
    async function toggleCamera() {
        if (state.cameraActive) {
            stopCamera();
            return;
        }
        try {
            var stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
            });
            var video = dom['camera_video'];
            video.srcObject = stream;
            await video.play();
            state.cameraStream = stream;
            state.cameraActive = true;

            dom['camera_toggle'].textContent = 'Close the camera';
            dom['camera_shoot'].hidden = false;
            dom['camera_note'].hidden = false;
            dom['preview_wrap'].classList.add('camera-live');
            dom['preview_caption'].textContent = 'Camera viewfinder \u2014 nothing is decoded until you press '
                + '\u201cTake the photo\u201d.';
            logRun('info', 'Camera opened as a viewfinder. Live frames are not decoded; press '
                + '\u201cTake the photo\u201d to scan one.');

        } catch (ex) {
            logRun('bad', 'Camera access failed: ' + ((ex && ex.message) || ex));
            stopCamera();
        }
    }

    function takePhoto() {
        var video = dom['camera_video'];
        if (!state.cameraActive || !video.videoWidth) {
            logRun('warn', 'The camera has not produced a frame yet \u2014 give the preview a moment and '
                + 'press \u201cTake the photo\u201d again.');
            return;
        }
        var canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0);

        // The frame is copied into the canvas above, so the stream can go now: the
        // run and every later edit work on the still.
        setSource(canvas, 'camera photo');
        stopCamera();
        logRun('info', 'Captured one frame from the camera as the image under test.');
    }

    function stopCamera() {
        var wasActive = state.cameraActive;
        state.cameraActive = false;
        var video = dom['camera_video'];
        if (video) {
            video.pause();
            video.srcObject = null;
        }
        if (state.cameraStream) {
            state.cameraStream.getTracks().forEach(function (track) { track.stop(); });
            state.cameraStream = null;
        }
        dom['camera_toggle'].textContent = 'Use the camera';
        dom['camera_shoot'].hidden = true;
        dom['camera_note'].hidden = true;
        dom['preview_wrap'].classList.remove('camera-live');
        if (wasActive) renderPreview();
    }

    /* ----------------------------------------------------------------- recipes */

    /*
     * Recipes address parameters by the *template collection* they belong to, the
     * way the parameter reference does — but a stage parameter such as
     * GrayscaleEnhancementModes is not a key of ImageParameterOptions, it is a key
     * of one entry of its ApplicableStages. So each collection name is resolved to
     * the owners already discovered by `buildModel()`, which is the only place that
     * knows where a parameter really lives.
     */
    var COLLECTION_GROUPS = {
        CaptureVisionTemplates: ['capture'],
        TargetROIDefOptions: ['roi'],
        ImageParameterOptions: ['pre'],
        BarcodeReaderTaskSettingOptions: ['task', 'pipeline'],
        BarcodeFormatSpecificationOptions: ['format'],
        GlobalParameter: ['global']
    };

    function forEachIn(collectionName, key, fn) {
        var groups = COLLECTION_GROUPS[collectionName];
        if (!groups) return 0;
        var touched = 0;
        state.owners.forEach(function (owner) {
            if (groups.indexOf(owner.group) === -1) return;
            if (key !== null && !(key in owner.obj)) return;
            fn(owner.obj, key === null ? null : owner.obj[key]);
            touched++;
        });
        return touched;
    }

    function recipeContext() {
        var notApplied = [];

        function note(collectionName, key) {
            var label = collectionName + '.' + key;
            if (notApplied.indexOf(label) === -1) notApplied.push(label);
        }

        return {
            setField: function (collectionName, key, value) {
                var count = forEachIn(collectionName, key, function (object) {
                    object[key] = deepClone(value);
                });
                if (!count) note(collectionName, key);
                return count;
            },
            setModeList: function (collectionName, key, modes) {
                var count = forEachIn(collectionName, key, function (object) {
                    object[key] = modes.map(function (mode) {
                        return defaultModeEntry(key, mode);
                    });
                });
                if (!count) note(collectionName, key);
                return count;
            },
            addMode: function (collectionName, key, mode) {
                var count = forEachIn(collectionName, key, function (object) {
                    if (!Array.isArray(object[key])) object[key] = [];
                    var exists = object[key].some(function (entry) { return entry && entry.Mode === mode; });
                    if (!exists) object[key].push(defaultModeEntry(key, mode));
                });
                if (!count) note(collectionName, key);
                return count;
            },
            notApplied: notApplied
        };
    }

    function applyRecipe(recipe) {
        var ctx = recipeContext();
        recipe.apply(ctx);
        buildModel();
        renderParamUI();
        renderJson();
        dom['recipe_help'].textContent = recipe.label + ' \u2014 ' + recipe.help
            + (ctx.notApplied.length ? '  (not present in this template: ' + ctx.notApplied.join(', ') + ')' : '');
        logRun('info', 'Recipe applied: ' + recipe.label);

        // A recipe is applied and measured in the same gesture: the visitor
        // clicked a starting point, not a document to stare at.
        afterChange('recipe ' + recipe.id, 0);
    }

    function renderRecipes() {
        var box = dom['recipe_list'];
        clear(box);
        RECIPES.forEach(function (recipe) {
            var button = el('button', 'recipe-button', recipe.label);
            button.type = 'button';
            button.title = recipe.help;
            button.addEventListener('click', function () { applyRecipe(recipe); });
            box.appendChild(button);
        });
    }

    /* ------------------------------------------------------ template comparison */

    /*
     * The SDK ships several read-barcode templates — Default, SpeedFirst,
     * ReadRateFirst, SingleBarcode, and a few more depending on the build. Which
     * one wins depends entirely on the image, so the only honest way to recommend
     * one is to measure on the image in front of you. Every number in this table
     * comes from the visitor's own picture.
     */
    async function compareTemplates() {
        if (!state.ready || !state.source) return;
        if (!state.templates.length) return;
        if (state._comparing) return;
        state._comparing = true;

        var savedTemplate = deepClone(state.template);
        var savedName = state.templateName;
        // The row for the visitor's own template is measured from what they have
        // edited, not from the preset it started as — otherwise the comparison would
        // quietly answer a different question.
        var candidates = visibleTemplates().map(function (entry) {
            if (entry.name === savedName) {
                return { name: entry.name + ' (your edits)', doc: savedTemplate, captureName: savedName };
            }
            return { name: entry.name, doc: entry.full || entry.sparse, captureName: entry.name };
        });

        var rows = [];
        setRunning(true, 'comparing ' + candidates.length + ' templates\u2026');


        try {
            for (var i = 0; i < candidates.length; i++) {
                var candidate = candidates[i];
                var row = { name: candidate.name, count: null, formats: '', ms: null, note: '' };
                try {
                    var applied = await state.cvr.initSettings(safeStringify(candidate.doc));
                    if (applied && applied.errorCode) {
                        row.note = '[' + applied.errorCode + '] ' + applied.errorString;
                    } else {
                        var startedAt = performance.now();
                        var result = await state.cvr.capture(makeDsImage(state.source.canvas), candidate.captureName);
                        row.ms = performance.now() - startedAt;
                        var items = barcodeItems(result);
                        row.count = items.length;
                        row.formats = items.map(function (item) { return item.formatString; }).join(', ');
                        if (result && result.errorCode) {
                            row.note = '[' + result.errorCode + '] ' + result.errorString;
                        }
                    }
                } catch (ex) {
                    row.note = (ex && (ex.message || ex.errorString)) || String(ex);
                }
                rows.push(row);
                renderCompare(rows, candidates.length);
            }
        } finally {
            // Put the visitor's own template back; a comparison must not silently
            // become the working state.
            try {
                await state.cvr.initSettings(safeStringify(savedTemplate));
            } catch (ex) {
                logRun('warn', 'Could not restore your template after the comparison: '
                    + ((ex && ex.message) || String(ex)));
            }
            state.template = savedTemplate;
            state.templateName = savedName;
            dom['template_select'].value = savedName;
            state._comparing = false;
            updateActionButtons(false);
            dom['compare_status'].textContent = 'Compared ' + candidates.length + ' templates on '
                + '\u201c' + state.sourceLabel + '\u201d, then put your template back.';
            logRun('info', 'Compared ' + candidates.length + ' templates on \u201c' + state.sourceLabel + '\u201d.');

            renderJson();
            requestRun('after the template comparison');
        }
    }

    function renderCompare(rows, total) {
        var body = dom['compare_body'];
        clear(body);

        if (!rows.length) {
            body.appendChild(el('p', 'hint', 'Nothing has been compared yet. The table reports barcodes '
                + 'found, the formats returned, and the time each template took on the image currently '
                + 'loaded.'));
            return;
        }

        var table = el('table', 'result-table');
        var head = el('thead');
        var headRow = el('tr');
        ['Template', 'Barcodes', 'Formats', 'Time', 'Note']
            .forEach(function (name) { headRow.appendChild(el('th', null, name)); });
        head.appendChild(headRow);
        table.appendChild(head);

        var tbody = el('tbody');
        rows.forEach(function (row) {
            var tr = el('tr');
            tr.appendChild(el('td', null, row.name));
            tr.appendChild(el('td', 'num', row.count === null ? '\u2014' : String(row.count)));
            var formats = el('td', 'text-cell', row.formats || '');
            formats.title = row.formats;
            tr.appendChild(formats);
            tr.appendChild(el('td', 'num', row.ms === null ? '' : Math.round(row.ms) + ' ms'));
            tr.appendChild(el('td', 'brief-cell', row.note));
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        body.appendChild(table);

        if (rows.length < total) {
            body.appendChild(el('p', 'hint', 'Running\u2026 ' + rows.length + ' of ' + total + ' done.'));
        } else {
            var best = rows.filter(function (row) { return row.count; })
                .reduce(function (a, b) { return (a && a.count >= b.count) ? a : b; }, null);
            if (best) {
                var tied = rows.filter(function (row) { return row.count === best.count; });
                body.appendChild(el('p', 'hint', tied.length === 1
                    ? 'Most barcodes on this image: ' + best.name + ' with ' + best.count + '.'
                    : 'Tied on this image at ' + best.count + ' barcodes: '
                        + tied.map(function (row) { return row.name; }).join(', ') + '.'));
            }
        }
    }

    /* ---------------------------------------------------------------- resets */

    function resetAll() {
        if (!state.baseline) return;
        state.template = deepClone(state.baseline);
        buildModel();
        renderParamUI();
        renderJson();
        dom['recipe_help'].textContent = '';
        logRun('info', 'Every parameter went back to the loaded preset.');

        afterChange('reset', 0);
    }

    async function changeTemplate(name) {
        if (!state.ready || !name) return;
        stopCamera();
        try {
            await loadTemplateInto(name);
            afterChange('template change', 0);
        } catch (ex) {
            logRun('bad', (ex && ex.message) || String(ex));
        }
    }

    /* ----------------------------------------------------------------- wiring */

    function bindEvents() {
        dom['pick_file'].addEventListener('change', function () {
            // The sample menu describes the bundled images, and a file from disk
            // is not one of them, so stop claiming it is.
            dom['sample_select'].value = '';
            loadImageFile(dom['pick_file'].files && dom['pick_file'].files[0], null);
        });

        dom['sample_select'].addEventListener('change', function () {
            var value = dom['sample_select'].value;
            if (!value) return;
            stopCamera();

            loadSample(value);
        });

        dom['camera_toggle'].addEventListener('click', toggleCamera);
        dom['camera_shoot'].addEventListener('click', takePhoto);
        dom['template_select'].addEventListener('change', function () {
            changeTemplate(dom['template_select'].value);
        });

        dom['run_button'].addEventListener('click', function () {
            // A click means "run now": a run queued by an earlier edit must
            // not fire on top of it, and the waiting hint is answered.
            if (state._runTimer) {
                clearTimeout(state._runTimer);
                state._runTimer = null;
            }
            clearChangesPending();

            feedback.run('Scanning\u2026', function () {
                return requestRun('run button');
            });
        });

        dom['auto_run'].addEventListener('change', function () {
            state.autoRun = dom['auto_run'].checked;

            if (state.autoRun) {
                // Whatever was waiting for the button runs now.
                if (state.changesPending) scheduleRun(0, 'auto-run turned on');
            } else if (state._runTimer) {
                // An edit had a run queued but not started; from here on it
                // waits for the visitor's hand.
                clearTimeout(state._runTimer);
                state._runTimer = null;
                markChangesPending();
            }
        });

        dom['reset_button'].addEventListener('click', resetAll);
        dom['reload_button'].addEventListener('click', function () {
            changeTemplate(state.templateName);
        });
        dom['compare_button'].addEventListener('click', function () {
            feedback.run('Comparing templates\u2026', function () {
                return compareTemplates();
            });
        });

        dom['param_search'].addEventListener('input', debounce(applyParamFilter, 120));
        dom['only_changed'].addEventListener('change', applyParamFilter);

        dom['json_apply'].addEventListener('click', applyJsonEditor);
        dom['json_revert'].addEventListener('click', function () {
            renderJson();
            dom['json_status'].textContent = 'The editor was reverted to the applied template.';
        });
        dom['json_copy'].addEventListener('click', async function () {
            try {
                await copyText(dom['json_editor'].value);
                dom['json_status'].textContent = 'The full template is on the clipboard.';
                dom['json_status'].className = 'hint hint-ok';
            } catch (ex) {
                dom['json_status'].textContent = 'The browser refused the clipboard \u2014 select the text '
                    + 'and copy it by hand.';
                dom['json_status'].className = 'hint hint-bad';
            }

        });
        dom['json_download'].addEventListener('click', function () {
            downloadText(state.templateName + '.json', dom['json_editor'].value);
            dom['json_status'].textContent = 'Downloaded ' + state.templateName + '.json \u2014 load it with '
                + 'initSettings(), then capture with the name it carries: '
                + 'capture(image, \u201c' + state.templateName + '\u201d).';
            dom['json_status'].className = 'hint hint-ok';

        });
        dom['changes_download'].addEventListener('click', function () {
            var doc = changesDocument();
            downloadText(state.templateName + '-changes.json', JSON.stringify(doc, null, 2));
            dom['json_status'].textContent = 'Downloaded ' + doc.changedParameterCount
                + ' changed parameter' + (doc.changedParameterCount === 1 ? '' : 's')
                + ' relative to \u201c' + doc.basedOn + '\u201d.';
            dom['json_status'].className = 'hint hint-ok';

        });
        dom['changes_copy'].addEventListener('click', async function () {
            var doc = changesDocument();
            try {
                await copyText(JSON.stringify(doc, null, 2));
                dom['json_status'].textContent = 'Copied ' + doc.changedParameterCount
                    + ' changed parameter' + (doc.changedParameterCount === 1 ? '' : 's') + '.';
                dom['json_status'].className = 'hint hint-ok';
            } catch (ex) {
                dom['json_status'].textContent = 'The browser refused the clipboard \u2014 use '
                    + '\u201cDownload just my changes\u201d instead.';
                dom['json_status'].className = 'hint hint-bad';
            }

        });

        // The export lives at the bottom of the page, which is the right place for a
        // document nobody wants to scroll past — but it is also the thing a visitor
        // comes back for after a successful run. This is the door.
        dom['export_jump'].addEventListener('click', function () {
            var card = dom['json_card'];
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            card.classList.add('card-highlight');
            setTimeout(function () { card.classList.remove('card-highlight'); }, 1600);
            // Reading order for keyboard and screen-reader users: put the focus where the
            // scroll went, on the button that does the thing they came for.
            dom['json_download'].focus({ preventScroll: true });
            logRun('info', 'The template is exported from \u201cThe template being applied\u201d below: '
                + 'the full document, or just the parameters you changed.');

        });

        dom['roi_toggle'].addEventListener('change', function () {
            state.showRoi = dom['roi_toggle'].checked;
            renderPreview();
        });

        document.addEventListener('paste', function (event) {
            var items = (event.clipboardData && event.clipboardData.items) || [];
            for (var i = 0; i < items.length; i++) {
                if (items[i].type && items[i].type.indexOf('image/') === 0) {
                    var file = items[i].getAsFile();
                    if (file) {
                        loadImageFile(file);
                        return;
                    }
                }
            }
        });
    }

    async function init() {
        cacheDom();
        bindEvents();
        renderRecipes();
        renderRunLog();
        dom['run_button'].disabled = true;
        dom['reset_button'].disabled = true;
        // `updateActionButtons()` owns this one from here on; the HTML attribute
        // only covers the moment before the script runs.
        dom['compare_button'].disabled = true;

        // Load a sample straight away: a blank tuner cannot show its own point, and
        // the engine is already downloading while the image arrives.
        var handoffId = new URLSearchParams(window.location.search).get('imageHandoff');
        var transferredImage = null;
        if (handoffId && window.DemoImageHandoff) {
            try {
                transferredImage = await window.DemoImageHandoff.take(handoffId);
            } catch (ex) {
                logRun('warn', 'Could not receive the analyzer image. Upload it here to continue.');
            }
            var cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete('imageHandoff');
            window.history.replaceState(null, '', cleanUrl);
            if (!transferredImage) {
                logRun('warn', 'The transferred image is unavailable or expired. Upload it here to continue.');
            }
        }
        if (transferredImage) {
            loadImageFile(new File([transferredImage.blob], transferredImage.name,
                { type: transferredImage.blob.type }), null);
        } else {
            await loadSample(ENTRY_SAMPLE);
        }
        await activateDynamsoft();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
