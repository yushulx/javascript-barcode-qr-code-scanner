/*
 * Parameter catalog for the Barcode Parameter Tuner
 * =================================================
 *
 * This file is *metadata*, not a schema. The editors in `app.js` are driven by the
 * shape of each value in the template the SDK hands back, so a parameter that is
 * missing here still gets a working control. What this file adds is what a value's
 * shape cannot tell you:
 *
 *   ENUMS               which strings are legal for a given field
 *   PARAMS              a label, a range, a unit and a sentence of advice
 *   MODE_SUBPARAMS      which sub-parameters apply to which mode, so the
 *                       twenty-odd fields the SDK serialises on every mode entry
 *                       do not all have to be read at once
 *   STAGES              the pipeline in order, with the callback that delivers
 *                       each stage's intermediate result
 *   GROUPS              how the parameter panel is organised
 *
 * Sources, in the order they were trusted:
 *
 *   1. The SDK's own exported enumerations (`Dynamsoft.DBR.EnumBarcodeFormat`,
 *      `EnumDeblurMode`, `EnumLocalizationMode`) — read from the shipped bundle.
 *   2. The official parameter reference, `parameters/reference/**` in the
 *      `dynamsoft-docs/capture-vision-docs` repository, which is the source the
 *      rendered pages are generated from. Every value list below that is not from
 *      source 1 was verified there.
 *   3. The DCV v3.4.1000 default template dump shipped with the template-optimizer
 *      skill, used for defaults and for the stage order.
 *
 * Where only the binary enumeration knows a value (LM_AUTO, GEM_AUTO, GTM_SKIP,
 * DM_END and friends) it is deliberately left out of the picker: those are enum
 * members, not documented candidate modes, and offering them invites a 10038.
 */
(function () {
    'use strict';

    /* ------------------------------------------------------------------- enums */

    function list(values) {
        return values.map(function (value) {
            return typeof value === 'string' ? { value: value, label: value } : value;
        });
    }

    var INDIVIDUAL_FORMATS = [
        ['BF_CODE_39', 'Code 39'],
        ['BF_CODE_39_EXTENDED', 'Code 39 Extended'],
        ['BF_CODE_93', 'Code 93'],
        ['BF_CODE_128', 'Code 128'],
        ['BF_CODABAR', 'Codabar'],
        ['BF_ITF', 'Interleaved 2 of 5'],
        ['BF_INDUSTRIAL_25', 'Industrial 2 of 5'],
        ['BF_MATRIX_25', 'Matrix 2 of 5'],
        ['BF_CODE_11', 'Code 11'],
        ['BF_CODE_32', 'Code 32'],
        ['BF_MSI_CODE', 'MSI Code'],
        ['BF_EAN_13', 'EAN-13'],
        ['BF_EAN_8', 'EAN-8'],
        ['BF_UPC_A', 'UPC-A'],
        ['BF_UPC_E', 'UPC-E'],
        ['BF_TWO_DIGIT_ADD_ON', '2-digit add-on'],
        ['BF_FIVE_DIGIT_ADD_ON', '5-digit add-on'],
        ['BF_TELEPEN', 'Telepen'],
        ['BF_TELEPEN_NUMERIC', 'Telepen numeric'],
        ['BF_PHARMACODE_ONE_TRACK', 'Pharmacode, one track'],
        ['BF_PHARMACODE_TWO_TRACK', 'Pharmacode, two tracks'],
        ['BF_PATCHCODE', 'Patch code'],
        ['BF_PDF417', 'PDF417'],
        ['BF_MICRO_PDF417', 'MicroPDF417'],
        ['BF_QR_CODE', 'QR Code'],
        ['BF_MICRO_QR', 'Micro QR Code'],
        ['BF_DATAMATRIX', 'Data Matrix'],
        ['BF_AZTEC', 'Aztec Code'],
        ['BF_MAXICODE', 'MaxiCode'],
        ['BF_DOTCODE', 'DotCode'],
        ['BF_GS1_COMPOSITE', 'GS1 Composite'],
        ['BF_GS1_DATABAR_OMNIDIRECTIONAL', 'GS1 DataBar Omnidirectional'],
        ['BF_GS1_DATABAR_TRUNCATED', 'GS1 DataBar Truncated'],
        ['BF_GS1_DATABAR_STACKED', 'GS1 DataBar Stacked'],
        ['BF_GS1_DATABAR_STACKED_OMNIDIRECTIONAL', 'GS1 DataBar Stacked Omnidirectional'],
        ['BF_GS1_DATABAR_EXPANDED', 'GS1 DataBar Expanded'],
        ['BF_GS1_DATABAR_EXPANDED_STACKED', 'GS1 DataBar Expanded Stacked'],
        ['BF_GS1_DATABAR_LIMITED', 'GS1 DataBar Limited'],
        ['BF_USPSINTELLIGENTMAIL', 'USPS Intelligent Mail'],
        ['BF_POSTNET', 'POSTNET'],
        ['BF_PLANET', 'PLANET'],
        ['BF_AUSTRALIANPOST', 'Australian Post'],
        ['BF_RM4SCC', 'RM4SCC'],
        ['BF_KIX', 'KIX'],
        ['BF_NONSTANDARD_BARCODE', 'Non-standard barcode']
    ];

    var COMPOSITE_FORMATS = [
        ['BF_DEFAULT', 'Default preset list — leaves out DotCode, both Pharmacode tracks and the postal formats'],
        ['BF_ALL', 'Every supported format'],
        ['BF_ONED', 'All 1D formats'],
        ['BF_GS1_DATABAR', 'All GS1 DataBar formats'],
        ['BF_POSTALCODE', 'All postal formats'],
        ['BF_PHARMACODE', 'Both Pharmacode tracks']
    ];

    function dataMatrixSizes() {
        var sizes = ['DMS_DEFAULT', 'DMS_ALL', 'DMS_SQUARE', 'DMS_RECTANGLE', 'DMS_DMRE'];
        var n;
        for (n = 10; n <= 144; n++) {
            if ([10, 12, 14, 16, 18, 20, 22, 24, 26, 32, 36, 40, 44, 48, 52, 64, 72, 80, 88, 96, 104, 120, 132, 144].indexOf(n) !== -1) {
                sizes.push('DMS_SQUARE_' + n + '_' + n);
            }
        }
        [[8, 18], [8, 32], [12, 26], [12, 36], [16, 36], [16, 48]].forEach(function (pair) {
            sizes.push('DMS_RECTANGLE_' + pair[0] + '_' + pair[1]);
        });
        [[8, 48], [8, 64], [8, 80], [8, 96], [8, 120], [8, 144], [12, 64], [12, 88], [16, 64],
            [20, 36], [20, 44], [20, 64], [22, 48], [24, 48], [24, 64], [26, 40], [26, 48], [26, 64]
        ].forEach(function (pair) {
            sizes.push('DMS_DMRE_' + pair[0] + '_' + pair[1]);
        });
        return sizes.map(function (value) {
            return { value: value, label: value.replace(/^DMS_/, '').replace(/_/g, ' ').toLowerCase() };
        });
    }

    var ENUMS = {
        /* --- localization and decoding --- */
        localizationMode: [
            { value: 'LM_CONNECTED_BLOCKS', label: 'Connected blocks — general purpose, best first choice' },
            { value: 'LM_SCAN_DIRECTLY', label: 'Scan directly — 1D, interactive' },
            { value: 'LM_STATISTICS', label: 'Statistics — QR Code, Data Matrix' },
            { value: 'LM_LINES', label: 'Lines — 1D, PDF417' },
            { value: 'LM_STATISTICS_MARKS', label: 'Statistics marks — DPM' },
            { value: 'LM_STATISTICS_POSTAL_CODE', label: 'Statistics postal code' },
            { value: 'LM_CENTRE', label: 'From the image centre — cropped captures' },
            { value: 'LM_NEURAL_NETWORK', label: 'Neural network — complex scenes' },
            { value: 'LM_ONED_FAST_SCAN', label: '1D fast scan' },
            { value: 'LM_SKIP', label: 'Skip' }
        ],
        deblurMode: [
            { value: 'DM_BASED_ON_LOC_BIN', label: 'Reuse the localization binary — fastest' },
            { value: 'DM_THRESHOLD_BINARIZATION', label: 'Threshold binarization' },
            { value: 'DM_DIRECT_BINARIZATION', label: 'Direct binarization' },
            { value: 'DM_GRAY_EQUALIZATION', label: 'Grey equalization' },
            { value: 'DM_SMOOTHING', label: 'Smoothing' },
            { value: 'DM_SHARPENING', label: 'Sharpening' },
            { value: 'DM_SHARPENING_SMOOTHING', label: 'Sharpen then smooth' },
            { value: 'DM_MORPHING', label: 'Morphing' },
            { value: 'DM_DEEP_ANALYSIS', label: 'Deep analysis — format aware, slow' },
            { value: 'DM_NEURAL_NETWORK', label: 'Neural network — slowest' },
            { value: 'DM_SKIP', label: 'Skip' }
        ],
        deformationResistingMode: list([
            'DRM_GENERAL', 'DRM_BROAD_WARP', 'DRM_LOCAL_REFERENCE', 'DRM_DEWRINKLE', 'DRM_AUTO', 'DRM_SKIP'
        ]),
        barcodeComplementMode: [
            { value: 'BCM_GENERAL', label: 'Rebuild damaged modules' },
            { value: 'BCM_AUTO', label: 'Choose automatically — documented as not supported yet' },
            { value: 'BCM_SKIP', label: 'Skip' }
        ],
        barcodeScaleMode: [
            { value: 'BSM_LINEAR_INTERPOLATION', label: 'Linear interpolation' },
            { value: 'BSM_AUTO', label: 'Choose automatically' }
        ],
        dpmCodeReadingMode: [
            { value: 'DPMCRM_GENERAL', label: 'General DPM reading' },
            { value: 'DPMCRM_AUTO', label: 'Choose automatically — documented as not supported yet' },
            { value: 'DPMCRM_SKIP', label: 'Skip' }
        ],
        textResultOrderMode: list([
            'TROM_CONFIDENCE', 'TROM_POSITION', 'TROM_FORMAT', 'TROM_SKIP'
        ]),

        /* --- image parameter modes --- */
        grayscaleTransformationMode: [
            { value: 'GTM_ORIGINAL', label: 'Original polarity' },
            { value: 'GTM_INVERTED', label: 'Inverted — light bars on a dark background' },
            { value: 'GTM_AUTO', label: 'Choose automatically' }
        ],
        grayscaleEnhancementMode: [
            { value: 'GEM_GENERAL', label: 'Pass through, no change' },
            { value: 'GEM_GRAY_EQUALIZE', label: 'Histogram equalization' },
            { value: 'GEM_GRAY_SMOOTH', label: 'Gaussian smoothing' },
            { value: 'GEM_SHARPEN_SMOOTH', label: 'Sharpen then smooth' },
            { value: 'GEM_SKIP', label: 'Skip' }
        ],
        binarizationMode: [
            { value: 'BM_LOCAL_BLOCK', label: 'Adaptive local threshold' },
            { value: 'BM_THRESHOLD', label: 'One global threshold' },
            { value: 'BM_AUTO', label: 'Choose automatically' },
            { value: 'BM_SKIP', label: 'Skip' }
        ],
        regionPredetectionMode: list([
            'RPM_SKIP', 'RPM_AUTO', 'RPM_GENERAL', 'RPM_GENERAL_RGB_CONTRAST',
            'RPM_GENERAL_GRAY_CONTRAST', 'RPM_GENERAL_HSV_CONTRAST', 'RPM_GRAY_CONSISTENCY'
        ]),
        textureDetectionMode: [
            { value: 'TDM_GENERAL_WIDTH_CONCENTRATION', label: 'General width concentration' },
            { value: 'TDM_AUTO', label: 'Choose automatically — documented as not supported yet' },
            { value: 'TDM_SKIP', label: 'Skip' }
        ],
        colourConversionMode: list([
            'CICM_HSV', 'CICM_GENERAL', 'CICM_EDGE_ENHANCEMENT', 'CICM_SKIP'
        ]),
        colourChannel: list(['H_CHANNEL', 'S_CHANNEL', 'V_CHANNEL']),

        /* --- plain fields --- */
        morphOperation: list(['Erode', 'Dilate', 'Open', 'Close', 'Auto', 'None']),
        morphShape: list(['Rectangle', 'Cross', 'Ellipse']),
        scaleType: list(['ST_SCALE_DOWN', 'ST_SCALE_UP']),
        referenceEdge: list(['RE_SHORTER_EDGE', 'RE_LONGER_EDGE']),
        mirrorMode: [
            { value: 'MM_NORMAL', label: 'Normal only' },
            { value: 'MM_MIRROR', label: 'Mirrored only' },
            { value: 'MM_BOTH', label: 'Both — slower, but finds a mirrored symbol' }
        ],
        msiCheckDigit: list([
            'MSICCDC_NO_CHECK_DIGIT', 'MSICCDC_MOD_10', 'MSICCDC_MOD_11',
            'MSICCDC_MOD_1010', 'MSICCDC_MOD_1110'
        ]),
        australianPostEncodingTable: list(['C', 'N']),
        code128Subset: [
            { value: '', label: 'Any subset' },
            { value: 'A', label: 'A' },
            { value: 'B', label: 'B' },
            { value: 'C', label: 'C' }
        ],
        partitionMode: [
            { value: 'PM_WHOLE_BARCODE', label: 'Whole barcode' },
            { value: 'PM_ALIGNMENT_PARTITION', label: 'Alignment partition' }
        ],
        dataMatrixSize: dataMatrixSizes(),
        textDetectionMode: [
            { value: 'TTDM_WORD', label: 'Word' },
            { value: 'TTDM_LINE', label: 'Line' },
            { value: 'TTDM_LAYOUT', label: 'Layout — documented as not supported yet' },
            { value: 'TTDM_SKIP', label: 'Skip' }
        ],
        textDirection: list(['HORIZONTAL', 'VERTICAL', 'OBLIQUE', 'UNKNOWN']),
        shortlineDetectionMode: list(['SDM_GENERAL']),
        lineAssemblyMode: list(['LAM_GENERAL']),
        referenceObjectType: list(['ROT_ATOMIC_OBJECT', 'ROT_WHOLE_IMAGE']),
        axisType: list(['AT_MIDPOINT_EDGE', 'AT_EDGE', 'AT_ROTATION_OTHER_AXIS']),
        lengthReference: list(['LR_X', 'LR_Y']),
        standardFormat: [{ value: '', label: 'Not set' }].concat(list(INDIVIDUAL_FORMATS.map(function (pair) {
            return { value: pair[0], label: pair[1] + '  (' + pair[0] + ')' };
        }))),
        barcodeFormatForDpm: list(['BF_DATAMATRIX', 'BF_QR_CODE']),
        modelNameDeblur: list(['OneDDeblur', 'EAN13Decoder', 'Code128Decoder', 'Code39ITFDecoder',
            'DataMatrixQRCodeDeblur', 'PDF417Deblur']),
        modelNameLocalization: list(['OneDLocalization', 'DataMatrixQRCodeLocalization', 'PDF417Localization']),
        deepAnalysisMethod: list(['OneDGeneral', 'TwoDGeneral', 'EAN13Enhanced'])
    };

    /* ------------------------------------------------------------------ params */

    var PARAMS = {
        /* --- capture vision template --- */
        Timeout: {
            label: 'Timeout', unit: 'ms', min: 0, max: 2147483647, step: 1000,
            help: 'How long one image may take before the engine gives up. Raise this first when a dense '
                + 'or badly degraded image returns nothing: 10 s is reachable on a large photo with many '
                + 'modes switched on.'
        },
        MaxParallelTasks: {
            label: 'Max parallel tasks', min: 0, max: 64,
            help: 'Upper bound on tasks processed at once. On a phone, lowering this beats raising it.'
        },
        MinImageCaptureInterval: {
            label: 'Minimum capture interval', unit: 'ms', min: 0, max: 2147483647,
            help: 'Only affects a continuous source such as a camera. 0 starts the next frame as soon as '
                + 'the previous one finishes.'
        },
        OutputOriginalImage: {
            label: 'Output the original image', min: 0, max: 1,
            help: 'Makes the router return the source frame alongside the results.'
        },

        /* --- region of interest --- */
        Location: {
            label: 'Region of interest', kind: 'location',
            help: 'The area the pipeline may look at. Each corner point is [X, Y, X-is-percentage, '
                + 'Y-is-percentage]. With MeasuredByPercentage on and the corners at 0/100, the ROI is '
                + 'the whole image. An ROI that misses the symbol makes every downstream stage look broken.'
        },
        EnableResultsDeduplication: {
            label: 'Deduplicate results', min: 0, max: 1,
            help: 'Drops a decode that repeats a barcode already reported for this ROI.'
        },
        PauseFlag: {
            label: 'Pause this ROI', min: 0, max: 1,
            help: 'Skips this ROI without deleting it — useful for A/B testing two regions.'
        },
        ReferenceObjectType: { label: 'Reference object', enum: 'referenceObjectType' },
        ReferenceObjectOriginIndex: {
            label: 'Reference object origin', min: 0, max: 3,
            help: 'Which vertex of the reference object becomes the coordinate origin.'
        },
        AxisType: { label: 'Axis type', enum: 'axisType' },
        EdgeIndex: {
            label: 'Edge index', min: 0, max: 3,
            help: 'Only used when the axis type is AT_EDGE. The stock template carries 0/1 here, which '
                + 'is ignored — it is preserved on export rather than rewritten.'
        },
        RotationAngle: {
            label: 'Rotation angle', min: 0, max: 180, unit: '°',
            help: 'Only used when the axis type is AT_ROTATION_OTHER_AXIS.'
        },
        LengthReference: { label: 'Length reference', enum: 'lengthReference' },
        MeasuredByPercentage: {
            label: 'Measured in percent', min: 0, max: 1,
            help: 'On means the coordinates are 0-100 of the image; off means pixels.'
        },
        Offset: { label: 'Offset', kind: 'object' },
        ReferenceXAxis: { label: 'Reference X axis', kind: 'object' },
        ReferenceYAxis: { label: 'Reference Y axis', kind: 'object' },

        /* --- task --- */
        ExpectedBarcodesCount: {
            label: 'Expected barcodes', min: 0, max: 2147483647,
            help: 'A speed lever rather than a limit. 0 means "find every barcode"; giving the true '
                + 'number lets the engine stop early. 2147483647 in the stock template is "no limit".'
        },
        BarcodeFormatIds: {
            label: 'Formats this task accepts', kind: 'formatIds',
            help: 'A task-level gate applied on top of each format specification. BF_DEFAULT is the '
                + 'preset list: it leaves out DotCode, both Pharmacode tracks and the postal formats, so '
                + 'a benchmark containing them reports misses that were never asked for.'
        },
        MaxThreadsInOneTask: {
            label: 'Max threads in one task', min: 0, max: 64,
            help: '0 lets the engine decide. Raising it helps on a multi-core desktop and hurts on a '
                + 'phone, where it competes with the camera.'
        },
        TextResultOrderModes: {
            label: 'Result ordering', kind: 'modeArray', enum: 'textResultOrderMode',
            nullMeans: 'null returns results unsorted.',
            help: 'Sorts what is returned. It changes presentation, not what is found.'
        },
        DPMCodeReadingModes: {
            label: 'DPM reading modes', kind: 'modeArray', enum: 'dpmCodeReadingMode',
            entryKeys: ['Mode', 'BarcodeFormat'],
            help: 'Direct Part Marking. Worth trying even on printed Data Matrix crops that behave like '
                + 'etched marks — it has rescued single-code images that standard tuning stalled on. '
                + 'BarcodeFormat here may only be BF_DATAMATRIX or BF_QR_CODE.'
        },

        /* --- image pre-processing --- */
        ImageScaleSetting: {
            label: 'Image scaling', kind: 'object',
            help: 'Large images are downscaled before anything else runs, and a small symbol can vanish '
                + 'in the process. Lower EdgeLengthThreshold to keep more detail; the cost is time.'
        },
        EdgeLengthThreshold: {
            label: 'Edge length threshold', min: 512, max: 2147483647, step: 100,
            help: 'The shorter (or longer) edge above which the image is scaled down. Documented range '
                + 'starts at 512; the stock value is 2300.'
        },
        ScaleType: { label: 'Scale type', enum: 'scaleType' },
        ReferenceEdge: { label: 'Reference edge', enum: 'referenceEdge' },
        ColourConversionModes: {
            label: 'Colour to grayscale', kind: 'modeArray', enum: 'colourConversionMode',
            nullMeans: 'null lets the SDK choose.',
            help: 'How colour is folded into grey. A symbol that separates in only one channel can be '
                + 'recovered by weighting that channel. ReferChannel is documented as applying to '
                + 'CICM_HSV only, although the stock template carries it on CICM_GENERAL too.'
        },
        GrayscaleTransformationModes: {
            label: 'Grayscale transformation', kind: 'modeArray', enum: 'grayscaleTransformationMode',
            nullMeans: 'null uses the SDK default of GTM_ORIGINAL.',
            help: 'Polarity. A light-on-dark symbol is invisible without GTM_INVERTED, and trying both '
                + 'costs a pixel inversion.'
        },
        GrayscaleEnhancementModes: {
            label: 'Grayscale enhancement', kind: 'modeArray', enum: 'grayscaleEnhancementMode',
            nullMeans: 'null uses the SDK default of GEM_GENERAL.',
            help: 'Runs before binarization. GEM_GRAY_EQUALIZE is the one for a low contrast photo; '
                + 'GEM_GRAY_SMOOTH for camera noise.'
        },
        BinarizationModes: {
            label: 'Binarization', kind: 'modeArray', enum: 'binarizationMode',
            nullMeans: 'null uses the SDK default of BM_LOCAL_BLOCK.',
            help: 'Turns grey into black and white, and this is where an unevenly lit photo is usually '
                + 'won or lost: BM_LOCAL_BLOCK adapts to local light, BM_THRESHOLD assumes it is uniform.'
        },
        TextureDetectionModes: {
            label: 'Texture detection', kind: 'modeArray', enum: 'textureDetectionMode',
            nullMeans: 'null uses the SDK default of TDM_GENERAL_WIDTH_CONCENTRATION.',
            help: 'Finds repeating patterns — fabric weave, halftone print — that confuse localization.'
        },
        TextureRemovalStrength: {
            label: 'Texture removal strength', min: 0, max: 9,
            help: 'How hard the texture-removed image is filtered.'
        },
        IfEraseTextZone: {
            label: 'Erase text zones from the binary image', min: 0, max: 1,
            help: 'Removes detected text before localization, so a readable line under a barcode stops '
                + 'competing with it.'
        },
        ShortlineDetectionMode: { label: 'Short line detection', kind: 'object' },
        LineAssemblyMode: { label: 'Line assembly', kind: 'object' },
        TextDetectionMode: {
            label: 'Text detection', kind: 'object',
            help: 'Finds text zones. Raise Sensitivity on faint print; narrow CharHeightRange when the '
                + 'image carries a lot of small print.'
        },

        /* --- pipeline stages --- */
        RegionPredetectionModes: {
            label: 'Region pre-detection', kind: 'modeArray', enum: 'regionPredetectionMode',
            nullMeans: 'null leaves this stage off.',
            help: 'Narrows a large image to regions worth localizing. In practice it does nothing on an '
                + 'ordinary photo, because MinImageDimension is 262144.'
        },
        LocalizationModes: {
            label: 'Localization', kind: 'modeArray', enum: 'localizationMode',
            nullMeans: 'null uses the SDK list: connected blocks, scan directly, statistics, lines.',
            help: 'The stage to inspect first. Everything downstream works only on what is localized '
                + 'here, so an empty localized result points at this list rather than at decoding.'
        },
        DeformationResistingModes: {
            label: 'Deformation resistance', kind: 'modeArray', enum: 'deformationResistingMode',
            nullMeans: 'null uses the SDK default of DRM_SKIP.',
            help: 'For warped, wrinkled or curved surfaces. DRM_GENERAL is the general-purpose one; the '
                + 'specialised modes each carry their own inline binarization and enhancement settings.'
        },
        BarcodeComplementModes: {
            label: 'Barcode complement', kind: 'modeArray', enum: 'barcodeComplementMode',
            nullMeans: 'null uses the SDK default of BCM_SKIP.',
            help: 'Attempts to rebuild damaged or partly covered modules. Cheap enough to leave on.'
        },
        BarcodeScaleModes: {
            label: 'Barcode scaling', kind: 'modeArray', enum: 'barcodeScaleMode',
            nullMeans: 'null uses the SDK default of BSM_AUTO.',
            help: 'Rescales the localized barcode before decoding — the replacement for the old '
                + 'ScaleUpModes, and the lever for a symbol whose modules are one or two pixels wide.'
        },
        DeblurModes: {
            label: 'Deblur', kind: 'modeArray', enum: 'deblurMode',
            nullMeans: 'null does NOT skip deblurring — the SDK substitutes a format-specific default '
                + 'list that already contains most of these modes, so setting the list explicitly mostly '
                + 'buys control over the order.',
            help: 'The engine tries the modes in order and stops at the first that decodes. '
                + 'DM_DEEP_ANALYSIS and DM_NEURAL_NETWORK are the expensive ones and belong last.'
        },
        ReturnBarcodeZoneClarity: {
            label: 'Return barcode zone clarity', min: 0, max: 1,
            help: 'Adds a clarity score per decoded barcode, which matters when ranking a benchmark.'
        },

        /* --- format specification --- */
        BarcodeTextRegExPattern: {
            label: 'Text must match (regex)', type: 'string',
            help: 'Rejects a decode whose text does not match. Useful for excluding a competing label; '
                + 'a wrong pattern silently rejects everything.'
        },
        MinResultConfidence: {
            label: 'Minimum confidence', min: 0, max: 100,
            help: 'Lower it to 10 to accept borderline reads on a hard image; raise it when a benchmark '
                + 'shows wrong values coming back.'
        },
        MinQuietZoneWidth: {
            label: 'Minimum quiet zone', min: 0, max: 2147483647,
            help: 'Modules of clear space required either side of a linear symbol. Lowering it helps a '
                + 'barcode that runs to the edge of a crop, at the cost of false positives.'
        },
        ReturnPartialBarcodeValue: {
            label: 'Return partial values', min: 0, max: 1,
            help: 'Returns what was read from a damaged barcode at lower confidence instead of nothing.'
        },
        RequireStartStopChars: {
            label: 'Require start and stop characters', min: 0, max: 1,
            help: 'Off is more permissive on a cropped 1D symbol; on is safer against false positives.'
        },
        VerifyCheckDigit: {
            label: 'Verify the check digit', min: 0, max: 1,
            help: 'Rejects a 1D decode whose check digit disagrees. Turning it off trades accuracy for '
                + 'read rate.'
        },
        IncludeTrailingCheckDigit: {
            label: 'Include the trailing check digit in the text', min: 0, max: 1
        },
        IncludeImpliedAI01: {
            label: 'Include the implied AI 01', min: 0, max: 1,
            help: 'GS1: prepends the GTIN application identifier when the symbology implies it.'
        },
        EnableAddOnCode: {
            label: 'Enable EAN/UPC add-on codes', min: 0, max: 1,
            help: 'Reads the 2 or 5 digit supplement printed beside an EAN or UPC symbol.'
        },
        EnableQRCodeModel1: { label: 'Enable QR Code Model 1', min: 0, max: 1 },
        'EnableDataMatrixECC000-140': {
            label: 'Enable Data Matrix ECC 000-140', min: 0, max: 1,
            help: 'The older Data Matrix ECC variants, which almost no modern symbol uses.'
        },
        AutoDetectColorInversion: {
            label: 'Auto-detect colour inversion', min: 0, max: 1,
            help: 'New in 11.6.1000 and documented for Data Matrix only so far.'
        },
        FindUnevenModuleBarcode: {
            label: 'Find barcodes with uneven modules', min: 0, max: 1,
            help: 'For a symbol distorted enough that module widths drift across it.'
        },
        HasVerticalQuietZone: { label: 'Expect a vertical quiet zone', min: 0, max: 1 },
        AllModuleDeviation: {
            label: 'Allowed module deviation', min: 0, max: 100,
            help: 'Tolerance on module width variance for 2D symbols.'
        },
        HeadModuleRatio: { label: 'Head module ratio', type: 'string' },
        TailModuleRatio: { label: 'Tail module ratio', type: 'string' },
        Code128Subset: {
            label: 'Code 128 subset', enum: 'code128Subset',
            help: 'A, B or C. The default, an empty string, lets the decoder choose.'
        },
        StandardFormat: {
            label: 'Standard format', enum: 'standardFormat',
            help: 'Names one individual symbology as the standard to apply. Combined values such as '
                + 'BF_ALL and BF_ONED are not legal here.'
        },
        AustralianPostEncodingTable: { label: 'Australian Post encoding table', enum: 'australianPostEncodingTable' },
        PatchCodeSearchingMargins: { label: 'Patch code searching margins', kind: 'object' },
        DataMatrixSizeOptions: {
            label: 'Data Matrix sizes', enum: 'dataMatrixSize',
            help: 'Restrict to the sizes the image actually contains when the symbol type is known.'
        },
        PartitionModes: {
            label: 'Partition modes', enum: 'partitionMode',
            help: 'How a 2D symbol that reaches the edge of the image is treated.'
        },
        BarcodeZoneMinDistanceToImageBorders: {
            label: 'Minimum distance from the image border', min: 0, max: 2147483647
        },
        BaseBarcodeFormatSpecificationName: {
            label: 'Inherit from', type: 'string',
            help: 'Name of another format specification whose settings this one starts from.'
        },
        BaseImageParameterName: { label: 'Inherit from', type: 'string' },

        /* --- global --- */
        IntraOpNumThreads: {
            label: 'Inference threads', min: 0, max: 64,
            help: 'Threads used inside the neural models. 0 lets the runtime decide.'
        },
        MaxTotalImageDimension: {
            label: 'Maximum total image dimension', min: 0, max: 2147483647,
            help: 'A hard cap on image size. 0 disables it.'
        },

        /* --- sub-parameters shared by several mode objects --- */
        Mode: { label: 'Mode' },
        ConfidenceThreshold: {
            label: 'Confidence threshold', min: 0, max: 100,
            help: 'Documented for LM_ONED_FAST_SCAN; the template serialises it on every mode for '
                + 'completeness.'
        },
        IsOneDStacked: { label: 'Is a stacked 1D symbol', min: 0, max: 1 },
        ModuleSize: {
            label: 'Module size', min: 0, max: 2147483647,
            help: 'Expected module width in pixels. 0 means "work it out".'
        },
        ScanDirection: {
            label: 'Scan direction', min: 0, max: 2,
            help: '0 both, 1 vertical, 2 horizontal. Pinning it halves the work when the orientation is '
                + 'known.'
        },
        ScanStride: {
            label: 'Scan stride', min: 0, max: 2147483647,
            help: 'Pixels between scan lines. 0 auto; larger is faster and less thorough.'
        },
        ModelNameArray: {
            label: 'Neural models', type: 'stringArray', suggest: 'modelNameDeblur',
            help: 'Leaving it empty means every model for the mode.'
        },
        Methods: {
            label: 'Deep analysis methods', type: 'stringArray', suggest: 'deepAnalysisMethod',
            help: 'Leaving it empty means all of them.'
        },
        Level: {
            label: 'Level', min: 1, max: 9,
            help: 'Effort. It applies to DRM_GENERAL and to DM_NEURAL_NETWORK, which are the two modes '
                + 'the SDK documents it for.'
        },
        Sensitivity: {
            label: 'Sensitivity', min: 1, max: 9,
            help: 'For GEM_GRAY_EQUALIZE it decides how readily equalization is applied; for '
                + 'TDM/RegionPredetectionModes it is detection strength.'
        },
        SharpenBlockSizeX: { label: 'Sharpen block size X', min: 3, max: 1000 },
        SharpenBlockSizeY: { label: 'Sharpen block size Y', min: 3, max: 1000 },
        SmoothBlockSizeX: { label: 'Smooth block size X', min: 3, max: 1000 },
        SmoothBlockSizeY: { label: 'Smooth block size Y', min: 3, max: 1000 },
        BlockSizeX: {
            label: 'Block size X', min: 0, max: 1000,
            help: 'BM_LOCAL_BLOCK neighbourhood width. 0 auto — roughly the stroke width plus a little.'
        },
        BlockSizeY: { label: 'Block size Y', min: 0, max: 1000 },
        ThresholdCompensation: {
            label: 'Threshold compensation', min: -255, max: 255,
            help: 'Shifts the local threshold. Raising it recovers faint bars on a low contrast surface; '
                + 'too far and noise starts to look like bars.'
        },
        EnableFillBinaryVacancy: { label: 'Fill binary vacancy', min: 0, max: 1 },
        BinarizationThreshold: {
            label: 'Binarization threshold', min: -1, max: 255,
            help: 'BM_THRESHOLD only. -1 derives it from the histogram; otherwise a grey level 0-255.'
        },
        MorphOperation: { label: 'Morphological operation', enum: 'morphOperation' },
        MorphOperationKernelSizeX: { label: 'Morph kernel size X', min: 0, max: 1000 },
        MorphOperationKernelSizeY: { label: 'Morph kernel size Y', min: 0, max: 1000 },
        MorphShape: { label: 'Morph kernel shape', enum: 'morphShape' },
        GrayscaleEnhancementModesIndex: {
            label: 'Grayscale enhancement index', min: -1, max: 2147483647,
            help: 'Links this binarization to one entry of GrayscaleEnhancementModes by array position. '
                + '-1 means it runs independently.'
        },
        ModuleSizeThreshold: {
            label: 'Module size threshold', min: 0, max: 2147483647,
            help: 'Compared with TargetModuleSize: smaller means enlarge, larger means shrink.'
        },
        TargetModuleSize: { label: 'Target module size', min: 0, max: 2147483647 },
        AcuteAngleWithXThreshold: {
            label: 'Acute angle with X', min: -1, max: 90,
            help: 'Only rescale when the symbol sits at least this far off the X axis. -1 removes the '
                + 'restriction.'
        },
        MinImageDimension: {
            label: 'Minimum image dimension', min: 0, max: 2147483647,
            help: 'Region prediction is skipped below this size. The stock 262144 is why that stage stays '
                + 'empty on an ordinary photo.'
        },
        MatchRatio: { label: 'Match ratio', min: 0, max: 100 },
        GrayRange: { label: 'Gray range', min: 0, max: 255 },
        WidthRange: { label: 'Width range', kind: 'range' },
        HeightRange: { label: 'Height range', kind: 'range' },
        AspectRatioRange: { label: 'Aspect ratio range', kind: 'range' },
        RelativeRegions: { label: 'Relative regions', type: 'stringArray' },
        ForeAndBackgroundColours: { label: 'Foreground and background colours', type: 'stringArray' },
        FindAccurateBoundary: { label: 'Find an accurate boundary', min: 0, max: 1 },
        SpatialIndexBlockSize: { label: 'Spatial index block size', min: 0, max: 1000 },
        DetectionModelName: { label: 'Detection model name', type: 'string' },
        BinarizationMode: { label: 'Inline binarization', kind: 'object' },
        GrayscaleEnhancementMode: { label: 'Inline grayscale enhancement', kind: 'object' },
        BinarizationModeIndex: { label: 'Binarization index', min: -1, max: 2147483647 },
        GrayscaleEnhancementModeIndex: { label: 'Grayscale enhancement index', min: -1, max: 2147483647 },
        BarcodeFormat: { label: 'Barcode format', enum: 'barcodeFormatForDpm' },
        RedChannelWeight: { label: 'Red weight', min: -1, max: 255 },
        GreenChannelWeight: { label: 'Green weight', min: -1, max: 255 },
        BlueChannelWeight: { label: 'Blue weight', min: -1, max: 255 },
        ReferChannel: { label: 'Reference channel', enum: 'colourChannel' },
        CharHeightRange: {
            label: 'Character height range', parts: ['min height', 'max height', 'thousandths'],
            help: '[MinHeight, MaxHeight, ByThousandth]. With the third element at 1 the first two are '
                + 'thousandths of the image height in 1..1000; at 0 they are pixels.'
        },
        StringLengthRange: {
            label: 'String length range', parts: ['min length', 'max length', 'unused'],
            help: '[MinLength, MaxLength] — a two element array, not a triplet.'
        },
        MaxSpacingInALine: { label: 'Max spacing in a line', min: -1, max: 2147483647 },
        Direction: { label: 'Direction', enum: 'textDirection' },
        Sentry: { label: 'Sentry', min: 0, max: 1 }
    };

    /*
     * `[min, max, step]` triplets, or null for "no restriction". These all share
     * the same shape; the ones that do not ([CharHeightRange] is
     * min/max/by-thousandths and [StringLengthRange] is a pair) are deliberately
     * absent, so they fall through to the generic tuple editor instead.
     */
    var RANGE_PARAMS = [
        'BarcodeAngleRangeArray', 'BarcodeBytesLengthRangeArray', 'BarcodeHeightRangeArray',
        'BarcodeTextLengthRangeArray', 'BarcodeWidthRangeArray', 'BarcodeZoneBarCountRangeArray',
        'BarcodeZoneWidthToHeightRatioRangeArray', 'ModuleSizeRangeArray',
        'WidthRange', 'HeightRange', 'AspectRatioRange'
    ];

    var MODE_ARRAY_PARAMS = [
        'RegionPredetectionModes', 'LocalizationModes', 'DeformationResistingModes',
        'BarcodeComplementModes', 'BarcodeScaleModes', 'DeblurModes', 'DPMCodeReadingModes',
        'TextResultOrderModes', 'GrayscaleTransformationModes', 'GrayscaleEnhancementModes',
        'BinarizationModes', 'TextureDetectionModes', 'ColourConversionModes'
    ];

    /*
     * Which sub-parameters a mode actually consumes. The SDK serialises every field
     * on every entry, so without this the panel would show six irrelevant numbers
     * beside each mode. `*` is the fallback for a mode that is not listed.
     */
    var MODE_SUBPARAMS = {
        LocalizationModes: {
            '*': ['ModelNameArray'],
            LM_SCAN_DIRECTLY: ['ScanStride', 'ScanDirection', 'IsOneDStacked', 'ModelNameArray'],
            LM_ONED_FAST_SCAN: ['ScanStride', 'ScanDirection', 'ConfidenceThreshold', 'ModelNameArray'],
            LM_CENTRE: ['ModuleSize', 'ModelNameArray'],
            LM_SKIP: [],
            LM_CONNECTED_BLOCKS: ['ModelNameArray'],
            LM_STATISTICS: ['ModelNameArray'],
            LM_LINES: ['ModelNameArray'],
            LM_NEURAL_NETWORK: ['ModelNameArray'],
            LM_STATISTICS_MARKS: ['ModelNameArray'],
            LM_STATISTICS_POSTAL_CODE: ['ModelNameArray']
        },
        DeblurModes: {
            '*': [],
            DM_NEURAL_NETWORK: ['ModelNameArray', 'Level'],
            DM_DEEP_ANALYSIS: ['Methods']
        },
        GrayscaleEnhancementModes: {
            '*': [],
            GEM_GRAY_EQUALIZE: ['Sensitivity'],
            GEM_GRAY_SMOOTH: ['SmoothBlockSizeX', 'SmoothBlockSizeY'],
            GEM_SHARPEN_SMOOTH: ['SharpenBlockSizeX', 'SharpenBlockSizeY', 'SmoothBlockSizeX', 'SmoothBlockSizeY']
        },
        BinarizationModes: {
            '*': ['MorphOperation', 'MorphOperationKernelSizeX', 'MorphOperationKernelSizeY', 'MorphShape',
                'GrayscaleEnhancementModesIndex'],
            BM_LOCAL_BLOCK: ['BlockSizeX', 'BlockSizeY', 'ThresholdCompensation', 'EnableFillBinaryVacancy'],
            BM_THRESHOLD: ['BinarizationThreshold']
        },
        DeformationResistingModes: {
            '*': [],
            DRM_GENERAL: ['Level'],
            DRM_BROAD_WARP: ['GrayscaleEnhancementMode', 'BinarizationMode'],
            DRM_LOCAL_REFERENCE: ['GrayscaleEnhancementMode', 'BinarizationMode'],
            DRM_DEWRINKLE: ['GrayscaleEnhancementMode', 'BinarizationMode']
        },
        BarcodeScaleModes: {
            '*': ['ModuleSizeThreshold', 'TargetModuleSize', 'AcuteAngleWithXThreshold']
        },
        ColourConversionModes: {
            '*': [],
            CICM_HSV: ['ReferChannel'],
            CICM_GENERAL: ['RedChannelWeight', 'GreenChannelWeight', 'BlueChannelWeight'],
            CICM_EDGE_ENHANCEMENT: ['RedChannelWeight', 'GreenChannelWeight', 'BlueChannelWeight']
        },
        RegionPredetectionModes: {
            '*': ['MinImageDimension', 'Sensitivity'],
            RPM_GENERAL: ['MinImageDimension', 'Sensitivity', 'SpatialIndexBlockSize', 'FindAccurateBoundary'],
            RPM_GRAY_CONSISTENCY: ['MinImageDimension', 'Sensitivity', 'GrayRange', 'MatchRatio'],
            RPM_GENERAL_RGB_CONTRAST: ['MinImageDimension', 'Sensitivity', 'ForeAndBackgroundColours'],
            RPM_GENERAL_GRAY_CONTRAST: ['MinImageDimension', 'Sensitivity', 'ForeAndBackgroundColours'],
            RPM_GENERAL_HSV_CONTRAST: ['MinImageDimension', 'Sensitivity', 'ForeAndBackgroundColours']
        },
        TextureDetectionModes: { '*': ['Sensitivity'] },
        TextResultOrderModes: { '*': [] },
        DPMCodeReadingModes: { '*': ['BarcodeFormat'] },
        BarcodeComplementModes: { '*': [] }
    };

    /* Shapes used when a mode entry is added, so a new mode arrives complete. */
    var MODE_ENTRY_TEMPLATE = {
        LocalizationModes: {
            Mode: 'LM_CONNECTED_BLOCKS', ConfidenceThreshold: 60, IsOneDStacked: 0,
            ModelNameArray: null, ModuleSize: 0, ScanDirection: 0, ScanStride: 0
        },
        DeblurModes: { Mode: 'DM_DIRECT_BINARIZATION', ModelNameArray: null, Level: 4, Methods: null },
        BinarizationModes: {
            Mode: 'BM_LOCAL_BLOCK', BinarizationThreshold: -1, BlockSizeX: 0, BlockSizeY: 0,
            EnableFillBinaryVacancy: 1, GrayscaleEnhancementModesIndex: -1, MorphOperation: 'None',
            MorphOperationKernelSizeX: 0, MorphOperationKernelSizeY: 0, MorphShape: 'Rectangle',
            ThresholdCompensation: 10
        },
        GrayscaleEnhancementModes: {
            Mode: 'GEM_GRAY_EQUALIZE', Sensitivity: 5, SharpenBlockSizeX: 3, SharpenBlockSizeY: 3,
            SmoothBlockSizeX: 3, SmoothBlockSizeY: 3
        },
        GrayscaleTransformationModes: { Mode: 'GTM_INVERTED' },
        DeformationResistingModes: {
            Mode: 'DRM_GENERAL', Level: 5,
            GrayscaleEnhancementMode: {
                Mode: 'GEM_GENERAL', Sensitivity: 5, SharpenBlockSizeX: 3, SharpenBlockSizeY: 3,
                SmoothBlockSizeX: 3, SmoothBlockSizeY: 3
            },
            BinarizationMode: {
                Mode: 'BM_LOCAL_BLOCK', BinarizationThreshold: -1, BlockSizeX: 0, BlockSizeY: 0,
                EnableFillBinaryVacancy: 1, GrayscaleEnhancementModesIndex: -1, MorphOperation: 'None',
                MorphOperationKernelSizeX: 0, MorphOperationKernelSizeY: 0, MorphShape: 'Rectangle',
                ThresholdCompensation: 10
            }
        },
        BarcodeComplementModes: { Mode: 'BCM_GENERAL' },
        BarcodeScaleModes: {
            Mode: 'BSM_LINEAR_INTERPOLATION', ModuleSizeThreshold: 4, TargetModuleSize: 6,
            AcuteAngleWithXThreshold: -1
        },
        RegionPredetectionModes: {
            Mode: 'RPM_GENERAL', MinImageDimension: 262144, Sensitivity: 1, SpatialIndexBlockSize: 5,
            FindAccurateBoundary: 0, ModelNameArray: null
        },
        TextureDetectionModes: { Mode: 'TDM_GENERAL_WIDTH_CONCENTRATION', Sensitivity: 5 },
        ColourConversionModes: {
            Mode: 'CICM_GENERAL', RedChannelWeight: -1, GreenChannelWeight: -1, BlueChannelWeight: -1,
            ReferChannel: 'H_CHANNEL'
        },
        TextResultOrderModes: { Mode: 'TROM_CONFIDENCE' },
        DPMCodeReadingModes: { Mode: 'DPMCRM_GENERAL', BarcodeFormat: 'BF_DATAMATRIX' }
    };

    /* ------------------------------------------------------------ the pipeline */

    /*
     * Order is the order the engine runs them in, from the stage list in the DCV
     * v3.4.1000 default template dump. `unitType` maps the unit a callback delivers
     * back to this row, which is what `onTaskResultsReceived` falls back to when the
     * per-stage callback does not fire on a given build. `base` names the image the
     * vector stages are drawn over.
     *
     * `step` is the number shown on the stage thumbnail, and it is the pipeline *step*
     * rather than the stage: the pre-processing stages run in order 1..16, and 17 is the
     * localization — it proposes candidates and decodes nothing. 18 is the decode section: the
     * three image stages it may run on a candidate, and the read that turns them into barcodes.
     *
     * The decode section's stages are numbered in the order the template declares them, which is
     * also the order the work happens in:
     *
     *     18  ST_BARCODE_DECODING: SST_RESIST_DEFORMATION, SST_COMPLEMENT_BARCODE,
     *                              SST_SCALE_BARCODE_IMAGE     (image operations on a candidate)
     *     19  ST_BARCODE_DECODING: SST_DECODE_BARCODES           (the read that produces barcodes)
     *
     * The three image stages reshape a candidate and the decode stage is the only one that reads a
     * barcode out of it. The image stages run when
     * their mode lists and the candidate's own measurements call for them — module size for
     * scaling, deformation for resistance, incompleteness for complement — which the SDK team
     * confirmed and which reproduces here: on a crumpled symbol that already decoded, switching
     * BarcodeScaleModes to BSM_LINEAR_INTERPOLATION with a module-size threshold of 4 produced a
     * candidate image while the decode count stayed at 1. So they are not a response to a failed
     * read, and they are not a retry stage.
     *
     * An earlier version of this file claimed the reverse — read first, refine what came back
     * empty — on the strength of unit *arrival* order. That was wrong: the units are emitted as
     * each candidate finishes processing, so the order shows completion, not the pipeline. Worth
     * remembering before treating emission order as evidence of execution order again.
     *
     * Two cards with the same number are the same step, not two runs of the pipeline. A step the
     * template switches off has no card at all, which is what the "N stages reported nothing"
     * list is.
     */
    var STAGES = [
        {
            id: 'colour', title: 'Input colour image', stage: 'SST_INPUT_COLOR_IMAGE',
            step: 1,
            section: 'Image', callback: 'onColourImageUnitReceived',
            unitType: 'IRUT_COLOUR_IMAGE', count: 'image',
            note: 'The frame as the engine received it, before any processing — raw uncompressed colour, '
                + 'three bytes per pixel. Nothing is inverted here; polarity work first shows up at '
                + '"Transformed grayscale".',
            emptyHint: 'Not every build reports the untouched colour image.'
        },
        {
            id: 'scaledColour', title: 'Scaled image', stage: 'SST_SCALE_IMAGE',
            step: 2,
            section: 'Image', callback: 'onScaledColourImageUnitReceived',
            unitType: 'IRUT_SCALED_COLOUR_IMAGE', count: 'image',
            note: 'Downscaling runs first, and a small symbol can disappear in it. If this is much '
                + 'smaller than the input, lower ImageScaleSetting.EdgeLengthThreshold.',
            emptyHint: 'Nothing was downscaled — the image was already under the threshold.'
        },
        {
            id: 'grayscale', title: 'Grayscale', stage: 'SST_CONVERT_TO_GRAYSCALE',
            step: 3,
            section: 'Image', callback: 'onGrayscaleImageUnitReceived',
            unitType: 'IRUT_GRAYSCALE_IMAGE', count: 'image',
            note: 'Colour is folded into grey here, and a symbol that separates in only one channel can '
                + 'be lost at this step.',
            emptyHint: 'Check ColourConversionModes.'
        },
        {
            id: 'transformedGrayscale', title: 'Transformed grayscale', stage: 'SST_TRANSFORM_GRAYSCALE',
            step: 4,
            section: 'Image', callback: 'onTransformedGrayscaleImageUnitReceived',
            unitType: 'IRUT_TRANSOFORMED_GRAYSCALE_IMAGE', count: 'image',
            note: 'Polarity is applied here. An inverted symbol stays invisible until this stage produces '
                + 'an image that reads the other way round.',
            emptyHint: 'Check GrayscaleTransformationModes.'
        },
        {
            id: 'enhancedGrayscale', title: 'Enhanced grayscale', stage: 'SST_ENHANCE_GRAYSCALE',
            step: 5,
            section: 'Image', callback: 'onEnhancedGrayscaleImageUnitReceived',
            unitType: 'IRUT_ENHANCED_GRAYSCALE_IMAGE', count: 'image',
            note: 'Contrast and noise handling. On a washed-out photo this is where the bars come back.',
            emptyHint: 'Check GrayscaleEnhancementModes — GEM_GENERAL passes the image through unchanged.'
        },
        {
            id: 'binary', title: 'Binary image', stage: 'SST_BINARIZE_IMAGE',
            step: 6,
            section: 'Image', callback: 'onBinaryImageUnitReceived',
            unitType: 'IRUT_BINARY_IMAGE', count: 'image',
            note: 'The image localization actually works on. If the bars are broken or merged here, no '
                + 'localization mode can help.',
            emptyHint: 'Check BinarizationModes.'
        },
        {
            id: 'textureDetection', title: 'Texture detection', stage: 'SST_DETECT_TEXTURE',
            step: 7,
            section: 'Image', callback: 'onTextureDetectionResultUnitReceived',
            unitType: 'IRUT_TEXTURE_DETECTION_RESULT', count: 'texture',
            note: 'Reports the spacing of a repeating background pattern — the measurement the two '
                + 'texture-removal stages work from.',
            emptyHint: 'Nothing periodic was found, or TextureDetectionModes is skipping.'
        },
        {
            id: 'textureRemovedGrayscale', title: 'Texture removed (grey)',
            step: 8,
            stage: 'SST_REMOVE_TEXTURE_FROM_GRAYSCALE',
            section: 'Image', callback: 'onTextureRemovedGrayscaleImageUnitReceived',
            unitType: 'IRUT_TEXTURE_REMOVED_GRAYSCALE_IMAGE', count: 'image',
            base: 'binary',
            note: 'The grey image with the detected repeating pattern suppressed, so a busy background '
                + 'stops competing with the bars.',
            emptyHint: 'Runs only when texture was detected.'
        },
        {
            id: 'textureRemovedBinary', title: 'Texture removed (binary)',
            step: 9,
            stage: 'SST_BINARIZE_TEXTURE_REMOVED_GRAYSCALE',
            section: 'Image', callback: 'onTextureRemovedBinaryImageUnitReceived',
            unitType: 'IRUT_TEXTURE_REMOVED_BINARY_IMAGE', count: 'image',
            note: 'The texture-suppressed image, binarized — what localization sees when a patterned '
                + 'background was in the way.',
            emptyHint: 'Runs only when texture was detected.'
        },
        {
            id: 'contours', title: 'Contours', stage: 'SST_FIND_CONTOURS',
            step: 10,
            section: 'Image', callback: 'onContoursUnitReceived',
            unitType: 'IRUT_CONTOURS', count: 'contours', base: 'binary',
            note: 'Shapes found in the binary image. Connected-block localization is built on these, so '
                + 'a barcode missing from here cannot be found by LM_CONNECTED_BLOCKS.',
            emptyHint: 'No contours at all usually means the binary image is empty or entirely dark.'
        },
        {
            id: 'shortLines', title: 'Short lines', stage: 'SST_DETECT_SHORTLINES',
            step: 11,
            section: 'Image', callback: 'onShortLinesUnitReceived',
            unitType: 'IRUT_SHORT_LINES', count: 'shortLines', base: 'binary',
            note: 'Line segments found by the short-line detector — the raw material for LM_LINES and '
                + 'the 1D scan paths.',
            emptyHint: 'Check ShortlineDetectionMode.'
        },
        {
            id: 'lineSegments', title: 'Assembled lines', stage: 'SST_ASSEMBLE_LINES',
            step: 12,
            section: 'Image', callback: 'onLineSegmentsUnitReceived',
            unitType: 'IRUT_LINE_SEGMENTS', count: 'lineSegments', base: 'binary',
            note: 'What LM_LINES and the 1D scan paths look at.',
            emptyHint: 'Check LineAssemblyMode.'
        },
        {
            id: 'textZones', title: 'Text zones', stage: 'SST_DETECT_TEXT_ZONES',
            step: 13,
            section: 'Image', callback: 'onTextZonesUnitReceived',
            unitType: 'IRUT_TEXT_ZONES', count: 'textZones', base: 'binary',
            note: 'Text found so it can be erased before localization — a readable line under a barcode '
                + 'is a real source of false candidates.',
            emptyHint: 'Check TextDetectionMode.'
        },
        {
            id: 'textRemovedBinary', title: 'Text erased (binary)', stage: 'SST_REMOVE_TEXT_ZONES_FROM_BINARY',
            step: 14,
            section: 'Image', callback: 'onTextRemovedBinaryImageUnitReceived',
            unitType: 'IRUT_TEXT_REMOVED_BINARY_IMAGE', count: 'image', base: 'binary',
            note: 'The binary image with the detected text zones erased, so printed text cannot seed '
                + 'false candidates.',
            emptyHint: 'Check IfEraseTextZone and whether any text zones were found.'
        },
        {
            id: 'predetectedRegions', title: 'Pre-detected regions', stage: 'SST_PREDETECT_REGIONS',
            step: 15,
            section: 'ST_REGION_PREDETECTION', callback: 'onPredetectedRegionsReceived',
            unitType: 'IRUT_PREDETECTED_REGIONS', count: 'predetectedRegions', base: 'binary',
            note: 'Regions worth a closer look. Skipped entirely for images under MinImageDimension, '
                + 'which is why the stock 262144 leaves this empty on an ordinary photo.',
            emptyHint: 'Expected on a small image: RegionPredetectionModes.MinImageDimension is 262144.'
        },
        {
            id: 'candidateBarcodeZones', title: 'Candidate barcode zones',
            step: 16,
            stage: 'SST_LOCALIZE_CANDIDATE_BARCODES',
            section: 'ST_BARCODE_LOCALIZATION', callback: 'onCandidateBarcodeZonesUnitReceived',
            unitType: 'IRUT_CANDIDATE_BARCODE_ZONES', count: 'candidateBarcodeZones', base: 'binary',
            note: 'Areas localization believes may hold a barcode, and the direct output of the '
                + 'LocalizationModes you configured. The accepted format list reaches back this far: '
                + 'measured on the bundled product label, restricting it to QR_CODE dropped this stage '
                + 'from 7 candidates to 1, so narrowing that list is not only a decode-time decision — '
                + 'it decides which candidates are proposed at all.',
            emptyHint: 'Nothing looked like a barcode: add LocalizationModes, and study the binary image '
                + 'above before blaming the decoder.'
        },
        {
            id: 'localizedBarcodes', title: 'Localized candidates', stage: 'SST_LOCALIZE_BARCODES',
            step: 17,
            section: 'ST_BARCODE_LOCALIZATION', callback: 'onLocalizedBarcodesReceived',
            unitType: 'IRUT_LOCALIZED_BARCODES', count: 'localizedBarcodes', base: 'binary',
            note: 'Localization hypotheses, not proof of a barcode. Each region is shown below with its '
                + 'source-image crop and whether the decoder later confirmed or rejected it. A real symbol '
                + 'here that never reaches the final result is a decoding question; a symbol missing here '
                + 'cannot be rescued by any decoding setting. '
                + 'The card counts hypotheses and nothing else, because that is all this stage produces: '
                + 'it does not decode. Which regions were later confirmed is shown below, one badge per '
                + 'candidate (decoded / not decoded) — this page pairs each hypothesis with a decoded '
                + 'barcode whose area overlaps it, IoU at least 0.2 — and the counts under "candidate '
                + 'zones → hypotheses → decoded" in the diagnosis summary. '
                + 'Localization is a batch step: every hypothesis it returns is handed to the decoding '
                + 'section together, and there is no "retry only the one that failed" control — the mode '
                + 'lists in the template are declarative, so the engine tries what the template enables on '
                + 'the candidates it has. To make the decoding section do less, narrow those lists (or the '
                + 'region of interest); to find out which candidate was rejected, look at the crops below. '
                + 'Two things that look like a bigger count are worth knowing here: this stage and '
                + '"Candidate barcode zones" agreeing (7 zones, 7 hypotheses) means the second localization '
                + 'step added nothing new — it does not mean the decoding section is skipped. Every '
                + 'hypothesis still goes through it, and that is where the 6 above were confirmed and the '
                + 'one was not. What *is* skipped is whatever the template switches off: steps with a '
                + 'skipping mode (DRM_SKIP, BCM_SKIP, a missing mode list, IfEraseTextZone = 0) produce no '
                + 'card, which is why the strip has gaps.',
            emptyHint: 'No barcode was localized at all, so this is a localization or binarization '
                + 'problem rather than a format-list one.'
        },
        {
            id: 'scaledBarcodeImage', title: 'Candidate after scaling', stage: 'SST_SCALE_BARCODE_IMAGE',
            step: 18,
            section: 'ST_BARCODE_DECODING', callback: 'onScaledBarcodeImageUnitReceived',
            unitType: 'IRUT_SCALED_BARCODE_IMAGE', count: 'image',
            note: 'A localized candidate after rescaling. It is not a confirmed barcode: text, texture, '
                + 'and other false candidates may appear here. A smeared real symbol points to BarcodeScaleModes. '
                + 'One crop per candidate the decoding section actually had to rescale, so this count is '
                + 'not the localization count above — and it is often zero on an image that simply reads. '
                + 'Measured over the ten bundled samples with the stock template: 4 of them decoded every '
                + 'localized candidate, and 3 of those 4 produced no candidate image at all; the fourth '
                + '(print defects) produced one, because its candidate did go through scaling. Narrowing '
                + 'the format list on one image moves this count with the failures, not with the '
                + 'candidates: 7 localized / 6 decoded / 0 unresolved produced 0 images, 7/6 (1 '
                + 'unresolved) produced 2, 5/3 (2 unresolved) produced 2, 5/2 (3 unresolved) produced 4. '
                + 'So the set is neither "everything" nor "only the ones that failed" — it is the '
                + 'candidates whose images the decode section chose to reshape. '
                + 'The SDK reports no position for these crops, so the preview keeps showing the whole '
                + 'frame: the located candidates are outlined there, and the selected crop’s own area '
                + 'is outlined in blue when its pixel size identifies which region it came from. The crops '
                + 'themselves are in the gallery below. '
                + 'It is an image operation on the candidate, and BarcodeScaleModes decides whether it '
                + 'happens at all — not a retry after a failed read. Measured: on a crumpled symbol that '
                + 'already decoded, switching BarcodeScaleModes to BSM_LINEAR_INTERPOLATION with a module-size '
                + 'threshold of 4 made this image appear while the decode count stayed at 1, and an undersized '
                + 'Data Matrix produced nothing under the same setting because its module size was above the '
                + 'threshold. That is also why an image whose candidates need no reshaping shows none of these.',
            emptyHint: 'BarcodeScaleModes decided no rescaling was needed, or nothing was localized.'
        },
        {
            id: 'deformationResisted', title: 'Candidate after dewarp', stage: 'SST_RESIST_DEFORMATION',
            step: 18,
            section: 'ST_BARCODE_DECODING', callback: 'onDeformationResistedBarcodeImageUnitReceived',
            unitType: 'IRUT_DEFORMATION_RESISTED_BARCODE_IMAGE', count: 'image', base: 'binary',
            note: 'A localized candidate after deformation resistance. It may still be a false candidate; '
                + 'use this view to judge whether a real curved or crumpled symbol became more regular. '
                + 'This unit keeps its image one level down, in `deformationResistedBarcode.imageData`, '
                + 'unlike every other image stage — the page lifts it out so the card, the thumbnail and '
                + 'the candidate gallery work the same way here as on the other two candidate cards. '
                + 'It is an image operation on the candidate, done when DeformationResistingModes says so '
                + 'and not in response to a failed read.',
            emptyHint: 'Expected while DeformationResistingModes is DRM_SKIP.'
        },
        {
            id: 'complementedBarcodeImage', title: 'Candidate after complement', stage: 'SST_COMPLEMENT_BARCODE',
            step: 18,
            section: 'ST_BARCODE_DECODING', callback: 'onComplementedBarcodeImageUnitReceived',
            unitType: 'IRUT_COMPLEMENTED_BARCODE_IMAGE', count: 'image', base: 'binary',
            note: 'A localized candidate after module completion. It is not yet a decoded barcode. A '
                + 'candidate can be text or texture, and a normally printed symbol can look unchanged. '
                + 'The stock template sets BarcodeComplementModes to BCM_SKIP, and the stage still '
                + 'delivers a unit for every candidate that was scaled — an unchanged image handed on, not '
                + 'work done — which is why this count tracks the scaling count above. '
                + 'It is an image operation on the candidate, done when BarcodeComplementModes says so '
                + 'and not in response to a failed read.',
            emptyHint: 'Expected while BarcodeComplementModes is BCM_SKIP.'
        },
        {
            id: 'decodedBarcodes', title: 'Decoded barcodes', stage: 'SST_DECODE_BARCODES',
            step: 19,
            section: 'ST_BARCODE_DECODING', callback: 'onDecodedBarcodesReceived',
            unitType: 'IRUT_DECODED_BARCODES', count: 'decodedBarcodes', base: 'binary',
            note: 'What the decode section read: the last stage of ST_BARCODE_DECODING and the only one '
                + 'that decodes. The stages before it in the section — deformation resistance, complement, '
                + 'scaling — are image operations on the candidate, decided by its own measurements '
                + '(module size and the like) rather than by any read outcome; this stage is what turns '
                + 'the resulting images into barcodes. A real symbol localized above but absent here is a '
                + 'format-scope, scale, deblur, deformation or mirror question.',
            emptyHint: 'Nothing decoded. Compare with "Localized candidates": if that was populated, '
                + 'verify the crop is a real barcode, then test one decode parameter family at a time.'
        }
    ];

    /* -------------------------------------------------------------- panel groups */

    var GROUPS = [
        {
            id: 'capture', title: 'Capture vision template', open: true,
            note: 'The entry point and its time budget.'
        },
        {
            id: 'roi', title: 'Region of interest', open: false,
            note: 'Where in the image the pipeline is allowed to work. Every stock preset puts the four '
                + 'points on the image corners, so a fresh template excludes nothing \u2014 which is why '
                + '\u201cshow the region of interest\u201d draws the frame\u2019s own border and looks like it '
                + 'does nothing. Narrow the points and the engine stops looking outside them: on a large '
                + 'image that is the cheapest speed there is, and unlike most parameters here it changes '
                + 'the work done rather than how hard the engine tries.'
        },
        {
            id: 'pre', title: 'Image pre-processing', open: true,
            note: 'Everything that happens before a barcode is looked for, in order: scale, grayscale, '
                + 'transform, enhance, binarize, texture, contours, lines, text.'
        },
        {
            id: 'task', title: 'Barcode task', open: true,
            note: 'How many barcodes are expected, in which formats, and in what order they come back.'
        },
        {
            id: 'pipeline', title: 'Localization and decoding', open: true,
            note: 'The stages that find a barcode and then read it. The strip under the image shows what '
                + 'each of them produced on the last run.'
        },
        {
            id: 'format', title: 'Format specification', open: false,
            note: 'Per-format acceptance rules: which formats may be returned, how confident the engine '
                + 'must be, and what the text has to look like.'
        },
        {
            id: 'global', title: 'Global parameters', open: false
        }
    ];

    /*
     * Used to order and label the format chips. The set of formats the editor
     * offers is read from `Dynamsoft.DBR.EnumBarcodeFormat` at runtime, so a format
     * added in a future build still shows up — just without a friendly label.
     */
    var FORMAT_BITS = COMPOSITE_FORMATS.concat(INDIVIDUAL_FORMATS);

    window.ParamCatalog = {
        ENUMS: ENUMS,
        PARAMS: PARAMS,
        RANGE_PARAMS: RANGE_PARAMS,
        MODE_ARRAY_PARAMS: MODE_ARRAY_PARAMS,
        MODE_SUBPARAMS: MODE_SUBPARAMS,
        MODE_ENTRY_TEMPLATE: MODE_ENTRY_TEMPLATE,
        STAGES: STAGES,
        GROUPS: GROUPS,
        FORMAT_BITS: FORMAT_BITS,
        INDIVIDUAL_FORMATS: INDIVIDUAL_FORMATS,
        COMPOSITE_FORMATS: COMPOSITE_FORMATS
    };
})();
