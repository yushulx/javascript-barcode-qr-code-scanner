/*
 * File Viewer — Codepool demo.
 *
 * One page, no build step, no SDK. Every parser is loaded on demand:
 *
 *   pdf.js        PDF rendering (Apache-2.0)
 *   UTIF.js       multi-page TIFF decode (MIT)
 *   JSZip         OOXML container access (MIT)
 *   docx-preview  DOCX → paginated HTML (Apache-2.0)
 *   SheetJS       XLSX → cells (Apache-2.0)
 *
 * XLSX, PPTX rendering and the EXIF reader are the only in-house parts; the
 * EXIF reader is deliberately dependency-free so the numbers in the details
 * panel can be traced back to the bytes in this file.
 *
 * Nothing here uploads anything. There is no fetch() of user data, no
 * analytics payload carrying file content, and no server render path.
 */
(function () {
    'use strict';

    var noop = function () { };
    var A = window.DemoAnalytics || {
        action: noop, track: noop, error: noop, ready: noop, start: noop, success: noop, fail: noop
    };

    /* ------------------------------------------------------------------ */
    /* Constants                                                           */
    /* ------------------------------------------------------------------ */

    var MAX_PDF_BYTES = 150 * 1024 * 1024;
    var MAX_TEXT_BYTES = 8 * 1024 * 1024;
    var MAX_OFFICE_BYTES = 60 * 1024 * 1024;
    var MAX_HASH_BYTES = 64 * 1024 * 1024;

    /* Cache key for the bundled samples. Keep it in step with the ?v= on
       app.js in index.html and bump both when the files in samples/ change: a
       404 that was cached before a deploy must not outlive the fix. (It did
       once — IIS had no .yuv MIME mapping, and browsers held the 404 even after
       the mapping was added.) */
    var ASSET_V = '20261022e';
    var TEXT_LINE_CAP = 8000;
    var CSV_ROWS_PER_PAGE = 50;
    var XLSX_ROWS_PER_PAGE = 40;

    /* EMU per CSS pixel at 96 dpi: 914400 / 96. */
    var EMU_PX = 9525;

    /* ------------------------------------------------------------------ */
    /* DOM                                                                 */
    /* ------------------------------------------------------------------ */

    var el = {
        dropzone: document.getElementById('dropzone'),
        dropCard: document.getElementById('drop-card'),
        input: document.getElementById('file-input'),
        sampleRow: document.getElementById('sample-row'),
        workspace: document.getElementById('workspace'),
        fileList: document.getElementById('file-list'),
        fileCount: document.getElementById('file-count'),
        clearAll: document.getElementById('clear-all'),
        stage: document.getElementById('stage'),
        foot: document.getElementById('preview-foot'),
        badge: document.getElementById('tb-badge'),
        name: document.getElementById('tb-name'),
        pager: document.getElementById('tb-pager'),
        pagePrev: document.getElementById('page-prev'),
        pageNext: document.getElementById('page-next'),
        pageIndicator: document.getElementById('page-indicator'),
        zoomGroup: document.getElementById('tb-zoom'),
        zoomOut: document.getElementById('zoom-out'),
        zoomIn: document.getElementById('zoom-in'),
        zoomFit: document.getElementById('zoom-fit'),
        zoomIndicator: document.getElementById('zoom-indicator'),
        rotate: document.getElementById('rotate'),
        infoBody: document.getElementById('info-body'),
        infoKind: document.getElementById('info-kind'),
        pageDrop: document.getElementById('page-drop'),
        scanPanel: document.getElementById('scan-panel'),
        scanBody: document.getElementById('scan-body'),
        scanClose: document.getElementById('scan-close'),
        scanCopy: document.getElementById('scan-copy-result'),
        scanSavePng: document.getElementById('scan-save-png'),
        scanSaveJson: document.getElementById('scan-save-json')
    };

    /* ------------------------------------------------------------------ */
    /* State                                                               */
    /* ------------------------------------------------------------------ */

    var entries = [];
    var active = null;
    var viewer = null;
    var seq = 0;
    var zoom = 1;
    var rotation = 0;
    var renderToken = 0;
    var dragDepth = 0;
    var objectUrls = [];

    /* ------------------------------------------------------------------ */
    /* Small helpers                                                       */
    /* ------------------------------------------------------------------ */

    function node(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) { n.className = cls; }
        if (text != null) { n.textContent = text; }
        return n;
    }

    function fmtInt(n) {
        return Number(n).toLocaleString('en-US');
    }

    function fmtBytes(n) {
        if (n < 1024) { return n + ' B'; }
        if (n < 1024 * 1024) { return (n / 1024).toFixed(n < 10240 ? 2 : 1) + ' KB'; }
        if (n < 1024 * 1024 * 1024) { return (n / 1048576).toFixed(2) + ' MB'; }
        return (n / 1073741824).toFixed(2) + ' GB';
    }

    function fmtDate(ms) {
        if (!ms) { return '—'; }
        var d = new Date(ms);
        if (isNaN(d.getTime())) { return '—'; }
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' }) +
            ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    function fmtDuration(seconds) {
        if (!isFinite(seconds)) { return '—'; }
        var m = Math.floor(seconds / 60);
        var s = seconds - m * 60;
        return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
    }

    function hex(bytes, start, count) {
        var out = [];
        for (var i = 0; i < count; i++) {
            var b = bytes[start + i];
            if (b === undefined) { break; }
            out.push(('0' + b.toString(16)).slice(-2).toUpperCase());
        }
        return out.join(' ');
    }

    function ascii(bytes, start, count) {
        var s = '';
        for (var i = 0; i < count; i++) {
            s += String.fromCharCode(bytes[start + i] || 0);
        }
        return s;
    }

    function basename(name) {
        return name.length > 34 ? name.slice(0, 16) + '…' + name.slice(-15) : name;
    }

    function extOf(name) {
        var i = name.lastIndexOf('.');
        return i > 0 ? name.slice(i + 1).toLowerCase() : '';
    }

    var scriptCache = {};

    function loadScript(src) {
        if (scriptCache[src]) { return scriptCache[src]; }
        scriptCache[src] = new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = function () { resolve(); };
            s.onerror = function () { reject(new Error('Could not load ' + src)); };
            document.head.appendChild(s);
        });
        return scriptCache[src];
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /* ------------------------------------------------------------------ */
    /* Format sniffing                                                     */
    /* ------------------------------------------------------------------ */

    var TEXT_EXT = /^(txt|text|md|markdown|log|csv|tsv|json|jsonl|xml|yml|yaml|ini|cfg|conf|srt|vtt|js|mjs|cjs|ts|tsx|jsx|css|scss|html?|sql|py|java|kt|kts|gradle|c|cc|cpp|h|hpp|cs|go|rs|rb|php|sh|bat|ps1|toml|properties)$/;
    var IMAGE_EXT = /^(jpe?g|png|gif|webp|avif|bmp|ico|svg|heic|heif|jfif|jxl)$/;
    var YUV_EXT = /^(yuv|nv21|nv12|i420|yv12|yuy2|uyvy|yuv420|raw)$/;
    var VIDEO_EXT = /^(mp4|m4v|mov|webm|ogv|mkv|avi|3gp)$/;
    var AUDIO_EXT = /^(mp3|wav|ogg|oga|m4a|aac|flac|opus)$/;

    var MIME_BY_EXT = {
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
        webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', ico: 'image/x-icon',
        svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff',
        pdf: 'application/pdf',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
        mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg'
    };

    function be32(b, o) { return (b[o] << 24 >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]; }
    function be16(b, o) { return (b[o] << 8) | b[o + 1]; }
    function le32(b, o) { return b[o] + (b[o + 1] << 8) + (b[o + 2] << 16) + (b[o + 3] << 24 >>> 0); }

    /*
     * Decide what a file is. Content wins over the extension: a .jpg that
     * starts with %PDF- is reported as a PDF, with the mismatch called out in
     * the details panel. Raw YUV is the one case that must go the other way —
     * it has no signature at all — so its extension is the only evidence.
     */
    function sniff(bytes, name, mime) {
        var ext = extOf(name);
        var out = { kind: 'binary', format: 'Unknown binary', mime: mime || MIME_BY_EXT[ext] || 'application/octet-stream', expected: ext, mismatch: false };

        function hit(kind, format, family) {
            out.kind = kind;
            out.format = format;
            out.family = family;
            return out;
        }

        var len = bytes.length;

        if (len >= 4 && ascii(bytes, 0, 4) === '%PDF') {
            return hit('pdf', 'PDF document', 'pdf');
        }
        if (len >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
            return hit('image', 'JPEG image', 'image');
        }
        if (len >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 3) === 'PNG') {
            return hit('image', 'PNG image', 'image');
        }
        if (len >= 6 && ascii(bytes, 0, 3) === 'GIF') {
            return hit('image', 'GIF image', 'image');
        }
        if (len >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4D) {
            return hit('image', 'BMP image', 'image');
        }
        if (len >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
            return hit('image', 'WebP image', 'image');
        }
        if (len >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WAVE') {
            return hit('audio', 'WAV audio', 'media');
        }
        if (len >= 4 && ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 42 && bytes[3] === 0) ||
            (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0 && bytes[3] === 42))) {
            return hit('tiff', 'TIFF image', 'image');
        }
        if (len >= 12 && ascii(bytes, 4, 4) === 'ftyp') {
            var brand = ascii(bytes, 8, 4);
            if (brand === 'heic' || brand === 'heix' || brand === 'mif1' || brand === 'msf1' || brand === 'heim') {
                return hit('image', 'HEIC image', 'image');
            }
            if (brand === 'avif' || brand === 'avis') {
                return hit('image', 'AVIF image', 'image');
            }
            if (brand === 'qt  ') {
                return hit('video', 'QuickTime movie', 'media');
            }
            return hit('video', 'MP4 video', 'media');
        }
        if (len >= 4 && bytes[0] === 0x1A && bytes[1] === 0x45 && bytes[2] === 0xDF && bytes[3] === 0xA3) {
            return hit('video', 'Matroska / WebM video', 'media');
        }
        if (len >= 4 && ascii(bytes, 0, 4) === 'OggS') {
            return hit('audio', 'Ogg audio', 'media');
        }
        if (len >= 3 && (ascii(bytes, 0, 3) === 'ID3' || (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0))) {
            return hit('audio', 'MP3 audio', 'media');
        }
        if (len >= 4 && ascii(bytes, 0, 4) === 'fLaC') {
            return hit('audio', 'FLAC audio', 'media');
        }
        if (len >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4B && (bytes[2] === 3 || bytes[2] === 5)) {
            out.kind = 'zip';
            out.format = 'ZIP container';
            out.family = 'binary';
            return out;
        }
        if (len >= 8 && bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0) {
            return hit('binary', 'Legacy Office file (OLE2 compound)', 'binary');
        }
        if (len >= 4 && bytes[0] === 0x7F && ascii(bytes, 1, 3) === 'ELF') {
            return hit('binary', 'Executable (ELF)', 'binary');
        }
        if (len >= 16 && ascii(bytes, 0, 15) === 'SQLite format 3') {
            return hit('binary', 'SQLite 3 database', 'binary');
        }
        if (len >= 4 && ascii(bytes, 0, 4) === 'Rar!') {
            return hit('binary', 'RAR archive', 'binary');
        }
        if (len >= 6 && ascii(bytes, 0, 6) === '7z\xBC\xAF\x27\x1C') {
            return hit('binary', '7-Zip archive', 'binary');
        }
        if (len >= 2 && bytes[0] === 0x1F && bytes[1] === 0x8B) {
            return hit('binary', 'GZip archive', 'binary');
        }

        /* No signature. Fall back to the name, then to a printable-text test. */
        if (YUV_EXT.test(ext)) {
            return hit('yuv', 'Raw YUV frame data', 'image');
        }
        if (ext === 'svg' || (mime === 'image/svg+xml')) {
            return hit('image', 'SVG image', 'image');
        }
        if (ext === 'csv' || ext === 'tsv' || mime === 'text/csv' || mime === 'text/tab-separated-values') {
            return hit('csv', ext === 'tsv' ? 'TSV text' : 'CSV text', 'text');
        }
        if (ext === 'json' || ext === 'jsonl' || mime === 'application/json') {
            return hit('json', 'JSON text', 'text');
        }
        if (IMAGE_EXT.test(ext)) {
            return hit('image', ext.toUpperCase() + ' image', 'image');
        }
        if (ext === 'docx' || ext === 'dotx') { return hit('docx', 'Word document', 'office'); }
        if (ext === 'xlsx' || ext === 'xlsm') { return hit('xlsx', 'Excel workbook', 'office'); }
        if (ext === 'pptx' || ext === 'ppsx') { return hit('pptx', 'PowerPoint presentation', 'office'); }
        if (VIDEO_EXT.test(ext)) { return hit('video', ext.toUpperCase() + ' video', 'media'); }
        if (AUDIO_EXT.test(ext)) { return hit('audio', ext.toUpperCase() + ' audio', 'media'); }
        if (TEXT_EXT.test(ext) || /^text\//.test(mime || '')) {
            return hit('text', 'Plain text', 'text');
        }

        /* Last resort: does it look like text? A NUL in the first 512 bytes is
           the cheapest reliable "this is not a text file" signal. */
        var sample = Math.min(len, 512);
        var printable = 0;
        var nul = false;
        for (var i = 0; i < sample; i++) {
            var b = bytes[i];
            if (b === 0) { nul = true; break; }
            if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) || b >= 160) { printable++; }
        }
        if (!nul && sample > 0 && printable / sample > 0.92) {
            return hit('text', 'Plain text', 'text');
        }

        return out;
    }

    /* ------------------------------------------------------------------ */
    /* EXIF / TIFF metadata                                                */
    /* ------------------------------------------------------------------ */

    var TAGS = {
        0x010E: 'Image description', 0x010F: 'Make', 0x0110: 'Model', 0x0112: 'Orientation',
        0x011A: 'X resolution', 0x011B: 'Y resolution', 0x0128: 'Resolution unit',
        0x0131: 'Software', 0x0132: 'Date modified', 0x013B: 'Artist', 0x013E: 'White point',
        0x013F: 'Primary chromaticities', 0x0211: 'YCbCr coefficients', 0x0213: 'YCbCr position',
        0x8298: 'Copyright', 0x829A: 'Exposure time', 0x829D: 'F-number',
        0x8822: 'Exposure program', 0x8827: 'ISO speed', 0x8830: 'Sensitivity type',
        0x9000: 'EXIF version', 0x9003: 'Date taken', 0x9004: 'Date digitised',
        0x9010: 'Offset time', 0x9011: 'Offset time (original)', 0x9101: 'Components config',
        0x9201: 'Shutter speed', 0x9202: 'Aperture', 0x9203: 'Brightness', 0x9204: 'Exposure bias',
        0x9205: 'Max aperture', 0x9206: 'Subject distance', 0x9207: 'Metering mode',
        0x9208: 'Light source', 0x9209: 'Flash', 0x920A: 'Focal length',
        0x9214: 'Subject area', 0x927C: 'Maker note', 0x9286: 'User comment',
        0x9290: 'Sub-second time', 0x9291: 'Sub-second time (original)', 0x9292: 'Sub-second time (digitised)',
        0xA000: 'Flashpix version', 0xA001: 'Colour space', 0xA002: 'Pixel X dimension',
        0xA003: 'Pixel Y dimension', 0xA004: 'Related sound file', 0xA20E: 'Focal plane X resolution',
        0xA20F: 'Focal plane Y resolution', 0xA210: 'Focal plane resolution unit',
        0xA217: 'Sensing method', 0xA300: 'File source', 0xA301: 'Scene type',
        0xA401: 'Custom rendered', 0xA402: 'Exposure mode', 0xA403: 'White balance',
        0xA404: 'Digital zoom ratio', 0xA405: 'Focal length (35 mm)', 0xA406: 'Scene capture type',
        0xA407: 'Gain control', 0xA408: 'Contrast', 0xA409: 'Saturation', 0xA40A: 'Sharpness',
        0xA40C: 'Subject distance range', 0xA420: 'Image unique ID', 0xA430: 'Owner name',
        0xA431: 'Body serial number', 0xA432: 'Lens specification', 0xA433: 'Lens make',
        0xA434: 'Lens model', 0xA435: 'Lens serial number'
    };

    var GPS_TAGS = {
        0x0000: 'GPS version', 0x0001: 'Latitude ref', 0x0002: 'Latitude', 0x0003: 'Longitude ref',
        0x0004: 'Longitude', 0x0005: 'Altitude ref', 0x0006: 'Altitude', 0x0007: 'GPS time',
        0x0008: 'Satellites', 0x0009: 'Status', 0x000A: 'Measurement mode', 0x000B: 'DOP',
        0x000C: 'Speed ref', 0x000D: 'Speed', 0x0010: 'Direction ref', 0x0011: 'Direction',
        0x001D: 'GPS date', 0x001F: 'Position error'
    };

    /* Tags that are offsets, blobs or pure plumbing — noise in a viewer. */
    var TAGS_SKIP = {
        0x0100: 1, 0x0101: 1, 0x0102: 1, 0x0103: 1, 0x0106: 1, 0x0111: 1, 0x0115: 1, 0x0116: 1,
        0x0117: 1, 0x011C: 1, 0x0201: 1, 0x0202: 1, 0x8769: 1, 0x8825: 1, 0xA005: 1, 0x927C: 1,
        0x9286: 1, 0x010D: 1, 0x0142: 1, 0x0143: 1, 0x0144: 1, 0x0145: 1, 0x014A: 1, 0x0152: 1
    };

    var TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

    var LOOKUPS = {
        0x0112: ['', 'Normal', 'Mirror horizontal', 'Rotate 180', 'Mirror vertical',
            'Mirror horizontal + rotate 270', 'Rotate 90 CW', 'Mirror horizontal + rotate 90',
            'Rotate 270 CW'],
        0x0128: { 1: 'None', 2: 'inch', 3: 'cm' },
        0x8822: { 0: 'Not defined', 1: 'Manual', 2: 'Program AE', 3: 'Aperture priority',
            4: 'Shutter priority', 5: 'Creative program', 6: 'Action program', 7: 'Portrait',
            8: 'Landscape' },
        0x9207: { 0: 'Unknown', 1: 'Average', 2: 'Centre-weighted', 3: 'Spot', 4: 'Multi-spot',
            5: 'Pattern', 6: 'Partial' },
        0xA001: { 1: 'sRGB', 2: 'Adobe RGB', 65535: 'Uncalibrated' },
        0xA402: { 0: 'Auto', 1: 'Manual', 2: 'Auto bracket' },
        0xA403: { 0: 'Auto', 1: 'Manual' },
        0xA406: { 0: 'Standard', 1: 'Landscape', 2: 'Portrait', 3: 'Night' },
        0xA217: { 1: 'Not defined', 2: 'One-chip colour area', 3: 'Two-chip colour area',
            4: 'Three-chip colour area', 5: 'Colour sequential area', 7: 'Trilinear', 8: 'Colour sequential linear' }
    };

    var TAG_ORDER = [
        0x010F, 0x0110, 0xA434, 0xA433, 0xA432, 0xA431, 0xA435, 0xA430,
        0x9003, 0x9004, 0x9011, 0x9291, 0x0132, 0x9010, 0x0131, 0x010E,
        0x829A, 0x829D, 0x8827, 0x8830, 0x9204, 0x920A, 0xA405, 0x9207, 0x9209,
        0x9208, 0x8822, 0x9201, 0x9202, 0x9205, 0x9206, 0xA402, 0xA403, 0xA406,
        0xA408, 0xA409, 0xA40A, 0xA300, 0xA301, 0xA217,
        0xA001, 0x0112, 0xA002, 0xA003, 0x011A, 0x011B, 0x0128, 0x0213,
        0x013B, 0x8298, 0xA420, 0x9000, 0xA000
    ];

    function orderIndex(tag) {
        var i = TAG_ORDER.indexOf(tag);
        return i < 0 ? 900 + tag : i;
    }

    function readExif(bytes) {
        /* JPEG: walk the marker chain to APP1. */
        if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
            var i = 2;
            while (i < bytes.length - 4) {
                if (bytes[i] !== 0xFF) { i++; continue; }
                var marker = bytes[i + 1];
                if (marker === 0xD8 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) {
                    i += 2;
                    continue;
                }
                if (marker === 0xDA) { break; }          /* start of scan */
                var size = be16(bytes, i + 2);
                if (size < 2) { break; }
                if (marker === 0xE1 && ascii(bytes, i + 4, 4) === 'Exif') {
                    return parseTiffBlocks(bytes, i + 10);
                }
                i += 2 + size;
            }
            return null;
        }
        if ((bytes[0] === 0x49 && bytes[1] === 0x49) || (bytes[0] === 0x4D && bytes[1] === 0x4D)) {
            return parseTiffBlocks(bytes, 0);
        }
        return null;
    }

    function parseTiffBlocks(bytes, base) {
        var little = bytes[base] === 0x49;
        if (!little && bytes[base] !== 0x4D) { return null; }
        if (readU16(bytes, base + 2, little) !== 42) { return null; }

        var groups = [];
        var ifd0Offset = readU32(bytes, base + 4, little);
        var ifd0 = readIfd(bytes, base, ifd0Offset, little);
        groups.push({ name: 'Image', tags: ifd0.tags, geo: ifd0.geo });

        var exifIfd = ifd0.ptrs[0x8769];
        if (exifIfd) {
            groups.push({
                name: 'Capture',
                tags: readIfd(bytes, base, exifIfd, little).tags,
                geo: null
            });
        }
        var gpsIfd = ifd0.ptrs[0x8825];
        if (gpsIfd) {
            var g = readIfd(bytes, base, gpsIfd, little);
            var geo = null;
            if (g.geo) {
                var lat = gpsCoordinate(g.geo[0x0002], findTag(g.tags, 0x0001));
                var lon = gpsCoordinate(g.geo[0x0004], findTag(g.tags, 0x0003));
                if (lat != null && lon != null) { geo = { lat: lat, lon: lon }; }
            }
            groups.push({ name: 'GPS', tags: g.tags, geo: geo, isGps: true });
        }
        return { groups: groups, little: little };
    }

    function readU16(b, o, little) {
        return little ? (b[o] | (b[o + 1] << 8)) : ((b[o] << 8) | b[o + 1]);
    }

    function readU32(b, o, little) {
        return little
            ? (b[o] + (b[o + 1] << 8) + (b[o + 2] << 16) + (b[o + 3] << 24 >>> 0))
            : ((b[o] << 24 >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]);
    }

    function readIfd(bytes, base, offset, little) {
        var out = { tags: [], ptrs: {}, geo: null };
        if (!offset || base + offset + 2 > bytes.length) { return out; }
        var count = readU16(bytes, base + offset, little);
        var dir = base + offset + 2;

        for (var n = 0; n < count; n++) {
            var p = dir + n * 12;
            if (p + 12 > bytes.length) { break; }
            var tag = readU16(bytes, p, little);
            var type = readU16(bytes, p + 2, little);
            var n2 = readU32(bytes, p + 4, little);
            var size = TYPE_SIZE[type];
            if (!size || n2 > 4096) { continue; }

            var total = size * n2;
            var valuePos = total <= 4 ? p + 8 : base + readU32(bytes, p + 8, little);
            if (valuePos + total > bytes.length) { continue; }

            if (tag === 0x8769 || tag === 0x8825) {
                out.ptrs[tag] = readU32(bytes, p + 8, little);
                continue;
            }
            if (TAGS_SKIP[tag]) { continue; }

            var value = readTyped(bytes, valuePos, type, n2, little);
            if (value == null) { continue; }

            if (tag === 0x0002 || tag === 0x0004) {
                /* GPS lat/long: store raw degrees/minutes/seconds, format later. */
                out.geo = out.geo || {};
                out.geo[tag] = value;
                continue;
            }

            out.tags.push({ tag: tag, type: type, value: value, count: n2 });
        }

        /* Sort: curated order first, then tag number — a metadata table is read,
           not scanned, so the important rows belong at the top. */
        out.tags.sort(function (a, b) { return orderIndex(a.tag) - orderIndex(b.tag); });
        return out;
    }

    function readTyped(bytes, pos, type, count, little) {
        var i, v;
        switch (type) {
            case 1: case 6: case 7:
                if (count > 64) { return { bytes: count }; }
                var arr = [];
                for (i = 0; i < count; i++) { arr.push(bytes[pos + i]); }
                return arr;
            case 2:
                var s = '';
                for (i = 0; i < count; i++) {
                    var c = bytes[pos + i];
                    if (c === 0) { break; }
                    s += String.fromCharCode(c);
                }
                return s.trim();
            case 3:
                if (count === 1) { return readU16(bytes, pos, little); }
                v = [];
                for (i = 0; i < count; i++) { v.push(readU16(bytes, pos + i * 2, little)); }
                return v;
            case 8:
                if (count === 1) {
                    var ss = readU16(bytes, pos, little);
                    return ss > 0x7FFF ? ss - 0x10000 : ss;
                }
                v = [];
                for (i = 0; i < count; i++) {
                    var t = readU16(bytes, pos + i * 2, little);
                    v.push(t > 0x7FFF ? t - 0x10000 : t);
                }
                return v;
            case 4:
                if (count === 1) { return readU32(bytes, pos, little); }
                v = [];
                for (i = 0; i < count; i++) { v.push(readU32(bytes, pos + i * 4, little)); }
                return v;
            case 5:
                v = [];
                for (i = 0; i < count; i++) {
                    var num = readU32(bytes, pos + i * 8, little);
                    var den = readU32(bytes, pos + i * 8 + 4, little);
                    v.push(den ? num / den : 0);
                }
                return count === 1 ? v[0] : v;
            case 9:
                if (count === 1) {
                    var sv = readU32(bytes, pos, little);
                    return sv > 0x7FFFFFFF ? sv - 0x100000000 : sv;
                }
                v = [];
                for (i = 0; i < count; i++) {
                    var u = readU32(bytes, pos + i * 4, little);
                    v.push(u > 0x7FFFFFFF ? u - 0x100000000 : u);
                }
                return v;
            case 10:
                v = [];
                for (i = 0; i < count; i++) {
                    var sn = readU32(bytes, pos + i * 8, little);
                    var sd = readU32(bytes, pos + i * 8 + 4, little);
                    if (sn > 0x7FFFFFFF) { sn -= 0x100000000; }
                    v.push(sd ? sn / sd : 0);
                }
                return count === 1 ? v[0] : v;
            default:
                return null;
        }
    }

    /* A rational tag is a number when the writer used RATIONAL, but some
       writers (Pillow among them) emit a two-element SHORT/LONG array instead.
       Accept both rather than showing "0, 1, 0, 250" for an exposure time. */
    function ratio(raw) {
        if (typeof raw === 'number') { return raw; }
        if (Array.isArray(raw) && raw.length >= 2 && typeof raw[0] === 'number') {
            return raw[1] ? raw[0] / raw[1] : raw[0];
        }
        return null;
    }

    function formatTagValue(tag, raw, isGps) {
        var look = LOOKUPS[tag];
        if (look) {
            if (Array.isArray(look) && typeof raw === 'number') { return look[raw] || String(raw); }
            if (!Array.isArray(look) && typeof raw === 'number') { return look[raw] || String(raw); }
        }
        var r = ratio(raw);
        switch (tag) {
            case 0x829A:
                if (r == null || !r) { return String(raw); }
                return r >= 1 ? r.toFixed(1) + ' s' : '1/' + Math.round(1 / r) + ' s';
            case 0x829D:
                return r == null ? String(raw) : 'f/' + (Math.round(r * 10) / 10);
            case 0x920A:
            case 0xA405:
                return r == null ? String(raw) : (Math.round(r * 10) / 10) + ' mm';
            case 0x9204:
                return r == null ? String(raw) : (r > 0 ? '+' : '') + r.toFixed(2) + ' EV';
            case 0x8827:
                return 'ISO ' + raw;
            case 0x9209:
                return flashText(raw);
            case 0x011A: case 0x011B:
                return r == null ? String(raw) : Math.round(r) + ' dpi';
            case 0x9202: case 0x9205:
                return r == null ? String(raw) : 'f/' + (Math.round(Math.pow(2, r / 2) * 10) / 10);
            case 0xA432:
                return Array.isArray(raw) ? raw.map(function (n) { return Math.round(n); }).join('–') + ' mm' : String(raw);
            case 0x9003: case 0x9004: case 0x0132:
                return String(raw).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
            case 0x001D:
                return String(raw).replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
            case 0x0006:
                return r == null ? String(raw) : (Math.round(r * 10) / 10) + ' m';
            default:
                break;
        }
        if (Array.isArray(raw)) {
            return raw.length > 8 ? raw.slice(0, 8).join(', ') + '…' : raw.join(', ');
        }
        if (raw && typeof raw === 'object' && raw.bytes) { return '(' + raw.bytes + ' bytes)'; }
        return String(raw);
    }

    function flashText(v) {
        if (typeof v !== 'number') { return String(v); }
        var fired = (v & 1) === 1;
        var mode = {
            0x00: 'no flash', 0x01: 'fired', 0x05: 'fired, return light not detected',
            0x07: 'fired, return light detected', 0x09: 'fired, compulsory',
            0x0D: 'fired, compulsory, return light not detected',
            0x0F: 'fired, compulsory, return light detected',
            0x10: 'did not fire, compulsory off', 0x14: 'off, did not fire, return light not detected',
            0x18: 'auto, did not fire', 0x19: 'auto, fired', 0x1D: 'auto, fired, return light not detected',
            0x1F: 'auto, fired, return light detected', 0x20: 'no flash function'
        }[v];
        return mode || (fired ? 'fired' : 'did not fire') + ' (0x' + v.toString(16) + ')';
    }

    function gpsCoordinate(value, ref) {
        if (!Array.isArray(value) || value.length < 3) { return null; }
        var deg = value[0] + value[1] / 60 + value[2] / 3600;
        if (ref === 'S' || ref === 'W') { deg = -deg; }
        return deg;
    }

    /* ------------------------------------------------------------------ */
    /* Image header parsing (works even when the browser cannot decode)    */
    /* ------------------------------------------------------------------ */

    function imageSize(bytes) {
        var w, h, i;
        if (bytes[0] === 0x89 && bytes[1] === 0x50) {
            return { w: be32(bytes, 16), h: be32(bytes, 20) };
        }
        if (ascii(bytes, 0, 3) === 'GIF') {
            return { w: bytes[6] | (bytes[7] << 8), h: bytes[8] | (bytes[9] << 8) };
        }
        if (bytes[0] === 0x42 && bytes[1] === 0x4D) {
            return { w: le32(bytes, 18), h: Math.abs(le32(bytes, 22)) };
        }
        if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
            var chunk = ascii(bytes, 12, 4);
            if (chunk === 'VP8X') {
                return { w: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)), h: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) };
            }
            if (chunk === 'VP8L') {
                var b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
                return { w: 1 + (((b1 & 0x3F) << 8) | b0), h: 1 + (((b3 & 0xF) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6)) };
            }
            if (chunk === 'VP8 ') {
                return { w: (bytes[26] | (bytes[27] << 8)) & 0x3FFF, h: (bytes[28] | (bytes[29] << 8)) & 0x3FFF };
            }
        }
        if (bytes[0] === 0xFF && bytes[1] === 0xD8) {
            i = 2;
            while (i < bytes.length - 9) {
                if (bytes[i] !== 0xFF) { i++; continue; }
                var m = bytes[i + 1];
                if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
                var len = be16(bytes, i + 2);
                if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
                    return { w: be16(bytes, i + 7), h: be16(bytes, i + 5), progressive: m === 0xC2 || m === 0xC6 || m === 0xCA };
                }
                i += 2 + len;
            }
        }
        /* ISO-BMFF (HEIC / AVIF): the 'ispe' box carries the display size. */
        if (ascii(bytes, 4, 4) === 'ftyp') {
            var marker = [0x69, 0x73, 0x70, 0x65]; /* 'ispe' */
            for (i = 0; i < Math.min(bytes.length - 16, 200000); i++) {
                if (bytes[i] === marker[0] && bytes[i + 1] === marker[1] &&
                    bytes[i + 2] === marker[2] && bytes[i + 3] === marker[3]) {
                    return { w: be32(bytes, i + 8), h: be32(bytes, i + 12) };
                }
            }
        }
        return null;
    }

    /* TIFF/EXIF orientation (tag 0x0112) as a canvas transform. Browsers do this
       for <img> by themselves; TIFF decoding and the PPTX renderer do not, so
       both go through here.

         1 none            5 mirror + quarter turn
         2 mirror X        6 quarter turn (the phone was held sideways)
         3 180°            7 mirror + quarter turn
         4 mirror Y        8 quarter turn the other way                        */
    function orientCanvas(src, orient) {
        if (!orient || orient < 2 || orient > 8) { return src; }
        var w = src.width;
        var h = src.height;
        var swap = orient >= 5;
        var out = document.createElement('canvas');
        out.width = swap ? h : w;
        out.height = swap ? w : h;
        var ctx = out.getContext('2d');
        switch (orient) {
            case 2: ctx.setTransform(-1, 0, 0, 1, w, 0); break;
            case 3: ctx.setTransform(-1, 0, 0, -1, w, h); break;
            case 4: ctx.setTransform(1, 0, 0, -1, 0, h); break;
            case 5: ctx.setTransform(0, 1, 1, 0, 0, 0); break;
            case 6: ctx.setTransform(0, 1, -1, 0, h, 0); break;
            case 7: ctx.setTransform(0, -1, -1, 0, h, w); break;
            case 8: ctx.setTransform(0, -1, 1, 0, 0, w); break;
        }
        ctx.drawImage(src, 0, 0);
        return out;
    }

    /* ------------------------------------------------------------------ */
    /* File queue                                                          */
    /* ------------------------------------------------------------------ */

    function addFiles(list) {
        var added = [];
        for (var i = 0; i < list.length; i++) {
            var file = list[i];
            if (!file || typeof file.size !== 'number') { continue; }
            var entry = {
                id: ++seq,
                file: file,
                name: file.name || ('clipboard-' + seq + '.png'),
                size: file.size,
                ext: extOf(file.name || ''),
                mime: file.type || '',
                kind: null,
                family: 'binary',
                buffer: null,
                inspected: false,
                info: null,
                meta: {},
                hash: null,
                pages: 1,
                yuv: null
            };
            entries.push(entry);
            added.push(entry);
        }
        if (!added.length) { return; }
        renderFileList();
        el.workspace.hidden = false;
        el.dropCard.classList.add('is-compact');
        select(added[0]);
        A.action('files_added', { count: added.length });
    }

    function select(entry) {
        if (active === entry) { return; }
        active = entry;
        zoom = 1;
        rotation = 0;
        /* Results belong to the file they were read from, not to the next one. */
        if (el.scanPanel && !el.scanPanel.hidden) { closePanel(); }
        renderFileList();
        updateToolbar();
        inspect(entry);
    }

    function renderFileList() {
        el.fileList.innerHTML = '';
        el.fileCount.textContent = String(entries.length);
        if (!entries.length) {
            var li = node('li');
            li.appendChild(node('div', 'empty-list', 'No files yet.'));
            el.fileList.appendChild(li);
            return;
        }
        entries.forEach(function (entry) {
            var li = document.createElement('li');
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'file-item';
            btn.setAttribute('aria-current', entry === active ? 'true' : 'false');

            var badge = node('span', 'badge', (entry.ext || 'bin').slice(0, 4));
            badge.setAttribute('data-family', entry.family || 'binary');

            var box = node('span');
            box.appendChild(node('span', 'fname', entry.name));
            var meta = [entry.info ? entry.info.label : 'Reading…', fmtBytes(entry.size)];
            if (entry.pages > 1) { meta.splice(1, 0, entry.pages + ' pages'); }
            box.appendChild(node('span', 'fmeta', meta.join(' · ')));

            btn.appendChild(badge);
            btn.appendChild(box);
            btn.addEventListener('click', function () { select(entry); });
            li.appendChild(btn);
            el.fileList.appendChild(li);
        });
    }

    function updateToolbar() {
        if (!active) { return; }
        el.name.textContent = active.name;
        el.name.title = active.name;
        el.badge.textContent = (active.ext || 'bin').slice(0, 4);
        el.badge.setAttribute('data-family', active.family || 'binary');
        updatePager();
    }

    function updatePager() {
        var pages = viewer ? viewer.pages : 1;
        var page = viewer ? viewer.page : 1;
        el.pageIndicator.textContent = page + ' / ' + pages;
        el.pagePrev.disabled = page <= 1;
        el.pageNext.disabled = page >= pages;
        el.pager.classList.toggle('is-hidden', pages <= 1 && !(viewer && viewer.alwaysPager));
        updateZoomReadout();
    }

    function updateZoomReadout() {
        var pct = viewer && viewer.effectiveZoom ? Math.round(viewer.effectiveZoom() * 100) : Math.round(zoom * 100);
        el.zoomIndicator.textContent = pct + '%';
        el.zoomGroup.classList.toggle('is-hidden', !(viewer && viewer.zoomable));
        el.rotate.style.display = viewer && viewer.rotatable ? '' : 'none';
    }

    /* ------------------------------------------------------------------ */
    /* Stage plumbing                                                      */
    /* ------------------------------------------------------------------ */

    function clearStage() {
        el.stage.innerHTML = '';
        el.stage.scrollTop = 0;
        el.stage.scrollLeft = 0;
        el.stage.classList.remove('is-plain');
        el.stage.classList.remove('is-flush');
        el.foot.innerHTML = '';
    }

    function setBusy(on, label) {
        var existing = el.stage.querySelector('.stage-spinner');
        if (existing) { existing.remove(); }
        if (!on) { return; }
        var box = node('div', 'stage-spinner');
        box.appendChild(node('div', 'spinner'));
        box.appendChild(node('span', null, label || 'Working…'));
        el.stage.appendChild(box);
    }

    function stageNote(title, body, tone) {
        var box = node('div', 'stage-note');
        if (tone === 'warn') { box.style.borderLeftColor = '#b3261e'; }
        var h = node('strong', null, title);
        box.appendChild(h);
        box.appendChild(document.createTextNode(' ' + body));
        return box;
    }

    function setFoot(parts) {
        el.foot.innerHTML = '';
        parts.forEach(function (p, i) {
            if (i) { el.foot.appendChild(node('span', 'sep', '·')); }
            el.foot.appendChild(node('span', null, p));
        });
    }

    function makeRotor(media) {
        var rotor = node('div', 'stage-rotor');
        rotor.appendChild(media);
        return {
            node: rotor,
            apply: function (w, h, deg) {
                media.style.width = w + 'px';
                media.style.height = h + 'px';
                media.style.transform = deg ? 'rotate(' + deg + 'deg)' : '';
                var swap = Math.abs(deg % 180) === 90;
                rotor.style.width = (swap ? h : w) + 'px';
                rotor.style.height = (swap ? w : h) + 'px';
            }
        };
    }

    function stageInner() {
        var center = node('div', 'stage-center');
        el.stage.appendChild(center);
        return center;
    }

    /* ------------------------------------------------------------------ */
    /* Inspect: read bytes, classify, describe, render                      */
    /* ------------------------------------------------------------------ */

    function inspect(entry) {
        var token = ++renderToken;
        clearStage();
        setBusy(true, 'Reading ' + basename(entry.name) + '…');
        el.infoBody.innerHTML = '<p class="info-empty">Reading…</p>';
        el.infoKind.textContent = '…';

        readBytes(entry).then(function (bytes) {
            if (token !== renderToken) { return; }
            var sniffed = sniff(bytes, entry.name, entry.mime);
            entry.kind = sniffed.kind;
            entry.family = sniffed.family || 'binary';
            entry.format = sniffed.format;
            entry.mismatch = extOf(entry.name) !== '' && !extensionMatches(entry.ext, sniffed.kind);

            return resolveContainer(entry, bytes).then(function (resolved) {
                if (token !== renderToken) { return; }
                entry.kind = resolved.kind;
                entry.family = resolved.family;
                entry.format = resolved.format;
                entry.pages = 1;
                return renderEntry(entry, bytes, token);
            });
        }).catch(function (err) {
            if (token !== renderToken) { return; }
            clearStage();
            el.stage.appendChild(stageNote('Could not open this file.',
                (err && err.message) || 'Unknown error.', 'warn'));
            el.infoBody.innerHTML = '<p class="info-empty">' + esc((err && err.message) || 'Unknown error') + '</p>';
            A.error('open_failed', (err && err.message) || 'unknown');
        });
    }

    function extensionMatches(ext, kind) {
        if (!ext) { return true; }
        var map = {
            image: /^(jpe?g|png|gif|webp|avif|bmp|ico|svg|heic|heif|jfif|jxl)$/,
            tiff: /^(tif|tiff)$/,
            pdf: /^pdf$/,
            docx: /^(docx|dotx)$/,
            xlsx: /^(xlsx|xlsm)$/,
            pptx: /^(pptx|ppsx)$/,
            text: TEXT_EXT, json: TEXT_EXT, csv: /^(csv|tsv)$/,
            video: VIDEO_EXT, audio: AUDIO_EXT,
            yuv: YUV_EXT
        };
        var re = map[kind];
        if (!re) { return true; }
        return re.test(ext);
    }

    function readBytes(entry) {
        if (entry.buffer) { return Promise.resolve(entry.buffer); }
        var file = entry.file;
        /* Media goes straight to an object URL: holding 400 MB in RAM just to
           read a duration is pointless. A 64-byte header is enough to sniff;
           under the hash cap the full buffer is still read so the SHA-256 can
           be shown. */
        var isMedia = /\.(mp4|m4v|mov|webm|ogv|mkv|avi|3gp|mp3|wav|ogg|m4a|flac|opus)$/i.test(entry.name);
        if (isMedia && file.size > MAX_HASH_BYTES) {
            return file.slice(0, 64).arrayBuffer().then(function (head) {
                entry.buffer = new Uint8Array(head);
                return entry.buffer;
            });
        }
        return file.arrayBuffer().then(function (buf) {
            entry.buffer = new Uint8Array(buf);
            return entry.buffer;
        });
    }

    /* A ZIP container has to be opened before it can be named: DOCX, XLSX and
       PPTX all start with PK\x03\x04 and are told apart by their parts. */
    function resolveContainer(entry, bytes) {
        if (entry.kind !== 'zip') {
            return Promise.resolve({ kind: entry.kind, family: entry.family, format: entry.format });
        }
        return loadScript('lib/jszip.min.js').then(function () {
            return window.JSZip.loadAsync(bytes);
        }).then(function (zip) {
            if (zip.file('word/document.xml')) {
                return { kind: 'docx', family: 'office', format: 'Word document (DOCX)' };
            }
            if (zip.file('xl/workbook.xml')) {
                return { kind: 'xlsx', family: 'office', format: 'Excel workbook (XLSX)' };
            }
            if (zip.file('ppt/presentation.xml')) {
                return { kind: 'pptx', family: 'office', format: 'PowerPoint presentation (PPTX)' };
            }
            var names = Object.keys(zip.files);
            return {
                kind: 'binary',
                family: 'binary',
                format: 'ZIP archive (' + names.length + ' entries)'
            };
        }).catch(function () {
            return { kind: 'binary', family: 'binary', format: 'ZIP container' };
        });
    }

    function renderEntry(entry, bytes, token) {
        var promise;
        switch (entry.kind) {
            case 'image': promise = viewImage(entry, bytes, token); break;
            case 'tiff': promise = viewTiff(entry, bytes, token); break;
            case 'pdf': promise = viewPdf(entry, bytes, token); break;
            case 'yuv': promise = viewYuv(entry, bytes, token); break;
            case 'json': promise = viewText(entry, bytes, token, true); break;
            case 'text': promise = viewText(entry, bytes, token, false); break;
            case 'csv': promise = viewCsv(entry, bytes, token); break;
            case 'docx': promise = viewDocx(entry, bytes, token); break;
            case 'xlsx': promise = viewXlsx(entry, bytes, token); break;
            case 'pptx': promise = viewPptx(entry, bytes, token); break;
            case 'video': promise = viewMedia(entry, token, 'video'); break;
            case 'audio': promise = viewMedia(entry, token, 'audio'); break;
            default: promise = viewBinary(entry, bytes, token); break;
        }
        return promise.then(function (result) {
            if (token !== renderToken) { return; }
            setBusy(false);
            entry.pages = result.pages || 1;
            viewer = result;
            viewer.page = viewer.page || 1;
            if (result.afterRender) { result.afterRender(); }
            updateToolbar();
            buildInfo(entry);
            renderFileList();
            startHash(entry);
        });
    }

    /* ------------------------------------------------------------------ */
    /* Details panel                                                       */
    /* ------------------------------------------------------------------ */

    function kv(key, value, cls) {
        var row = node('div', 'kv');
        row.appendChild(node('span', 'k', key));
        var v = node('span', 'v' + (cls ? ' ' + cls : ''));
        v.innerHTML = value;
        row.appendChild(v);
        return row;
    }

    function infoSection(title) {
        var sec = node('div', 'info-section');
        sec.appendChild(node('h3', null, title));
        return sec;
    }

    function buildInfo(entry) {
        var info = entry.info = entry.info || {};
        info.label = entry.format;
        var body = el.infoBody;
        body.innerHTML = '';
        el.infoKind.textContent = (entry.ext || 'bin').toUpperCase();

        /* --- File --- */
        var sec = infoSection('File');
        sec.appendChild(kv('Name', esc(entry.name)));
        sec.appendChild(kv('Type', esc(entry.format)));
        sec.appendChild(kv('MIME', '<span class="value-mono">' + esc(entry.mime || 'unknown') + '</span>'));
        sec.appendChild(kv('Size', fmtBytes(entry.size) + '<br><span class="is-sub">' + fmtInt(entry.size) + ' bytes</span>'));
        sec.appendChild(kv('Modified', fmtDate(entry.file.lastModified)));
        sec.appendChild(kv('SHA-256', '<span class="value-mono" id="hash-value">computing…</span>'));
        body.appendChild(sec);

        if (entry.mismatch) {
            var warn = node('div', 'warn-inline',
                'The extension .' + entry.ext + ' does not match the content, which is ' + entry.format +
                '. The viewer trusts the bytes.');
            body.appendChild(warn);
        }

        (info.sections || []).forEach(function (s) {
            var ss = infoSection(s.title);
            s.rows.forEach(function (r) {
                ss.appendChild(kv(r[0], r[1], r[2]));
            });
            body.appendChild(ss);
        });

        (info.exif || []).forEach(function (group) {
            var gs = infoSection('EXIF · ' + group.name);
            if (group.geo && group.geo.lat != null && group.geo.lon != null) {
                gs.appendChild(kv('Coordinates',
                    group.geo.lat.toFixed(6) + ', ' + group.geo.lon.toFixed(6), 'value-mono'));
            }
            var table = node('table', 'exif-table');
            group.tags.forEach(function (t) {
                if (!t.text) {
                    t.text = formatTagValue(t.tag, t.value, group.isGps);
                }
                var tr = document.createElement('tr');
                var td1 = node('td', 'tag', TAGS[t.tag] || GPS_TAGS[t.tag] || ('Tag 0x' + t.tag.toString(16).toUpperCase()));
                var td2 = node('td', 'val');
                td2.appendChild(document.createTextNode(t.text));
                var raw = node('span', 'raw', '0x' + ('0000' + t.tag.toString(16).toUpperCase()).slice(-4));
                td2.appendChild(raw);
                tr.appendChild(td1);
                tr.appendChild(td2);
                table.appendChild(tr);
            });
            gs.appendChild(table);
            body.appendChild(gs);
        });

        (info.notes || []).forEach(function (n) {
            var p = node('p', 'info-empty');
            p.textContent = n;
            body.appendChild(p);
        });

        if (entry.hash) {
            var hv = document.getElementById('hash-value');
            if (hv) { hv.textContent = entry.hash; }
        }
    }

    function startHash(entry) {
        if (entry.hash) { return; }
        if (!window.crypto || !window.crypto.subtle || !window.isSecureContext) {
            var elh = document.getElementById('hash-value');
            if (elh) { elh.textContent = 'unavailable — needs https or localhost'; }
            return;
        }
        if (entry.size > MAX_HASH_BYTES) {
            var big = document.getElementById('hash-value');
            if (big) { big.textContent = 'skipped — file is over 64 MB'; }
            return;
        }
        if (!entry.buffer || entry.buffer.byteLength !== entry.size) {
            var self = document.getElementById('hash-value');
            if (self) { self.textContent = 'skipped — not fully read'; }
            return;
        }
        window.crypto.subtle.digest('SHA-256', entry.buffer).then(function (digest) {
            var bytes = new Uint8Array(digest);
            var hexStr = '';
            for (var i = 0; i < bytes.length; i++) {
                hexStr += ('0' + bytes[i].toString(16)).slice(-2);
            }
            entry.hash = hexStr;
            var target = document.getElementById('hash-value');
            if (target) { target.textContent = hexStr; }
        }).catch(function () {
            var t = document.getElementById('hash-value');
            if (t) { t.textContent = 'unavailable'; }
        });
    }

    /* ------------------------------------------------------------------ */
    /* Viewer: image                                                       */
    /* ------------------------------------------------------------------ */

    function viewImage(entry, bytes, token) {
        var dims = imageSize(bytes);
        var exif = null;
        try {
            exif = (bytes[0] === 0xFF && bytes[1] === 0xD8) ? readExif(bytes) : null;
        } catch (e) {
            exif = null;   /* a malformed APP1 segment must not hide the pixels */
        }
        var sections = [];

        /*
         * EXIF Orientation (0x0112) says how the *stored* pixels have to be
         * turned before they look right. Browsers already apply it to <img>,
         * so the layout must use the rotated size: a 4032x3024 buffer tagged 6
         * displays as 3024x4032, and a box sized from the buffer would stretch
         * the picture. Values 5-8 swap the axes; 2, 3 and 4 only mirror or turn
         * it, so the size is unchanged.
         */
        var ifd = (exif && exif.groups[0]) ? exif.groups[0].tags : null;
        var hasOrient = false;
        var orient = 1;
        if (ifd) {
            var rawOrient = findTag(ifd, 0x0112);
            if (typeof rawOrient === 'number') {
                hasOrient = true;
                if (rawOrient >= 1 && rawOrient <= 8) { orient = rawOrient; }
            }
        }
        var quarter = orient >= 5;
        var dispW = dims ? (quarter ? dims.h : dims.w) : 0;
        var dispH = dims ? (quarter ? dims.w : dims.h) : 0;

        var rows = [];
        if (dims) {
            rows.push(['Dimensions', dispW + ' × ' + dispH + ' px']);
            rows.push(['Megapixels', (dispW * dispH / 1e6).toFixed(2) + ' MP']);
            rows.push(['Aspect ratio', aspect(dispW, dispH)]);
            if (quarter) {
                rows.push(['Stored pixels', dims.w + ' × ' + dims.h + ' px, rotated by EXIF']);
            }
        }
        if (dims && dims.progressive) { rows.push(['Encoding', 'Progressive JPEG']); }
        rows.push(['Extension', '.' + entry.ext]);
        if (ifd) {
            var xres = findTag(ifd, 0x011A);
            var unit = findTag(ifd, 0x0128);
            if (xres != null) {
                rows.push(['Resolution', Math.round(xres) + ' ' + (unit && unit.value === 3 ? 'px/cm' : 'dpi')]);
            }
            if (hasOrient) {
                rows.push(['Orientation', (LOOKUPS[0x0112][orient] || String(orient)) + ' (' + orient + ')']);
            }
        }
        sections.push({ title: 'Image', rows: rows });

        entry.info = {
            sections: sections,
            exif: exif ? exif.groups.map(function (g) {
                return { name: g.name, tags: g.tags, geo: g.geo };
            }) : [],
            notes: []
        };

        var url = URL.createObjectURL(entry.file);
        objectUrls.push(url);
        var img = new Image();
        img.alt = entry.name;
        img.decoding = 'async';

        var rotor = makeRotor(img);
        var center = stageInner();
        center.appendChild(rotor.node);

        var natW = dispW;
        var natH = dispH;

        var view = {
            pages: 1,
            page: 1,
            zoomable: true,
            rotatable: true,
            effectiveZoom: function () {
                return fitScale * zoom;
            },
            setZoom: function () { paint(); },
            rotate: function () {
                rotation = (rotation + 90) % 360;
                paint();
            }
        };

        var fitScale = 1;

        function paint() {
            if (!natW || !natH) { return; }
            var avail = Math.max(el.stage.clientWidth - 56, 120);
            var fit = Math.min(1, avail / natW);
            fitScale = fit;
            rotor.apply(Math.round(natW * fit * zoom), Math.round(natH * fit * zoom), rotation);
            updateZoomReadout();
        }

        return new Promise(function (resolve, reject) {
            img.onload = function () {
                /* naturalWidth is the *oriented* size in every current browser,
                   so it agrees with dispW/dispH computed above. Only an image
                   with no readable header (SVG without width/height) lands here
                   empty. */
                natW = natW || img.naturalWidth;
                natH = natH || img.naturalHeight;
                paint();
                setFoot([
                    natW + ' × ' + natH + ' px',
                    fmtBytes(entry.size),
                    (entry.info.exif.length ? entry.info.exif.reduce(function (a, g) { return a + g.tags.length; }, 0) + ' EXIF tags' : 'no EXIF block')
                ]);
                window.addEventListener('resize', function () {
                    if (img.isConnected) { paint(); }
                });
                resolve(view);
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                rotor.node.remove();
                var note = stageNote(
                    entry.format + ' cannot be decoded by this browser.',
                    'The header was still parsed, so the dimensions and metadata in the details panel are ' +
                    'the real ones. Convert the file to JPEG, PNG or WebP to see the pixels.');
                el.stage.appendChild(note);
                setFoot(['no preview', fmtBytes(entry.size)]);
                resolve({ pages: 1, page: 1, zoomable: false, rotatable: false, alwaysPager: false });
            };
            img.src = url;
        });
    }

    /* ------------------------------------------------------------------ */
    /* Viewer: TIFF                                                        */
    /* ------------------------------------------------------------------ */

    function viewTiff(entry, bytes, token) {
        return loadScript('lib/UTIF.js').then(function () {
            var ifds = window.UTIF.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
            if (!ifds || !ifds.length) { throw new Error('No image directory found in this TIFF'); }

            var first = ifds[0];
            var comp = compressionName(first['t259']);
            /* UTIF keeps SHORT tags as arrays, so 274 arrives as [6]. */
            var rawOrient = first['t274'];
            if (Array.isArray(rawOrient)) { rawOrient = rawOrient[0]; }
            var orient = (typeof rawOrient === 'number' && rawOrient >= 1 && rawOrient <= 8)
                ? rawOrient : 1;
            var quarter = orient >= 5;
            /* UTIF only fills ifd.width/height during decodeImage, which runs
               when the first page is painted — after this panel is built. Read
               256/257 directly so the details are right on the first pass. */
            var w0 = first.width || (first['t256'] && first['t256'][0]) || 0;
            var h0 = first.height || (first['t257'] && first['t257'][0]) || 0;
            var rows = [
                ['Dimensions', (quarter ? h0 : w0) + ' × ' + (quarter ? w0 : h0) + ' px'],
                ['Pages', String(ifds.length)],
                ['Compression', comp],
                ['Bits per sample', String(first['t258'] || '—')],
                ['Samples per pixel', String(first['t277'] || '—')],
                ['Photometric', photometricName(first['t262'])]
            ];
            if (orient > 1) {
                rows.push(['Orientation', (LOOKUPS[0x0112][orient] || String(orient)) + ' (' + orient + ')']);
                rows.push(['Stored pixels', w0 + ' × ' + h0 + ' px']);
            }
            var dpiX = first['t282'];
            if (typeof dpiX === 'number') {
                rows.push(['Resolution', Math.round(dpiX) + ' dpi']);
            }
            var exif = null;
            try { exif = readExif(bytes); } catch (e) { exif = null; }
            if (exif) {
                rows.push(['EXIF', exif.groups.reduce(function (a, g) { return a + g.tags.length; }, 0) + ' tags']);
            }

            entry.info = {
                sections: [{ title: 'TIFF', rows: rows }],
                exif: exif ? exif.groups.map(function (g) {
                    return { name: g.name, tags: g.tags, geo: g.geo };
                }) : [],
                notes: comp === 'Unsupported' ? ['This compression scheme is not implemented by the bundled decoder.'] : []
            };

            var canvas = node('canvas', 'page-canvas');
            var rotor = makeRotor(canvas);
            var center = stageInner();
            center.appendChild(rotor.node);

            var cache = {};
            var fitScale = 1;

            function frame(n) {
                if (!cache[n]) {
                    var ifd = ifds[n - 1];
                    window.UTIF.decodeImage(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), ifd);
                    cache[n] = {
                        w: ifd.width || (ifd['t256'] && ifd['t256'][0]),
                        h: ifd.height || (ifd['t257'] && ifd['t257'][0]),
                        rgba: window.UTIF.toRGBA8(ifd)
                    };
                }
                return cache[n];
            }

            function paint() {
                var n = view.page;
                var f = frame(n);
                var src = document.createElement('canvas');
                src.width = f.w;
                src.height = f.h;
                src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(f.rgba), f.w, f.h), 0, 0);

                /* UTIF hands back the stored buffer and ignores orientation, so a
                   scan tagged 6 arrives sideways. Turn the pixels once per frame
                   instead of layering a CSS transform on top of the page fit. */
                var out = orientCanvas(src, orient);
                canvas.width = out.width;
                canvas.height = out.height;
                canvas.getContext('2d').drawImage(out, 0, 0);

                var avail = Math.max(el.stage.clientWidth - 56, 120);
                fitScale = Math.min(1, avail / out.width);
                rotor.apply(Math.round(out.width * fitScale * zoom), Math.round(out.height * fitScale * zoom), rotation);
                updateZoomReadout();
            }

            var view = {
                pages: ifds.length,
                page: 1,
                zoomable: true,
                rotatable: true,
                effectiveZoom: function () { return fitScale * zoom; },
                show: function (n) { view.page = n; paint(); },
                setZoom: function () { paint(); },
                rotate: function () { rotation = (rotation + 90) % 360; paint(); }
            };

            paint();
            var f0 = frame(1);
            setFoot([f0.w + ' × ' + f0.h + ' px', ifds.length + ' pages', comp, fmtBytes(entry.size)]);
            window.addEventListener('resize', function () {
                if (viewer === view) { paint(); }
            });
            return view;
        });
    }

    function compressionName(code) {
        return ({
            1: 'None', 2: 'CCITT RLE', 3: 'CCITT G3', 4: 'CCITT G4', 5: 'LZW',
            6: 'JPEG (old)', 7: 'JPEG', 8: 'Deflate', 32773: 'PackBits',
            32946: 'Deflate', 34712: 'JPEG 2000'
        })[code] || (code ? 'Unsupported (' + code + ')' : '—');
    }

    function photometricName(code) {
        return ({
            0: 'White is zero', 1: 'Black is zero', 2: 'RGB', 3: 'Palette',
            5: 'CMYK', 6: 'YCbCr', 8: 'CIELab'
        })[code] || '—';
    }

    /* ------------------------------------------------------------------ */
    /* Viewer: PDF                                                         */
    /* ------------------------------------------------------------------ */

    function viewPdf(entry, bytes, token) {
        if (entry.size > MAX_PDF_BYTES) {
            throw new Error('PDF is larger than the 150 MB the viewer will hold in memory.');
        }
        return loadScript('lib/pdf.min.js').then(function () {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
            return window.pdfjsLib.getDocument({
                data: bytes.slice(),
                isEvalSupported: false,
                disableAutoFetch: true
            }).promise;
        }).then(function (doc) {
            var canvas = node('canvas', 'page-canvas');
            var center = stageInner();
            center.appendChild(canvas);
            var fitScale = 1;
            var current = null;

            var view = {
                pages: doc.numPages,
                page: 1,
                zoomable: true,
                rotatable: false,
                effectiveZoom: function () { return fitScale * zoom; },
                setZoom: function () { paint(); },
                show: function (n) { view.page = n; paint(); }
            };

            /* pdf.js owns a canvas per render task; two overlapping renders on
               the same canvas throw. Every zoom click is therefore queued
               behind the previous one instead of racing it. */
            var chain = Promise.resolve();

            function paint() {
                chain = chain.then(doPaint, doPaint);
                return chain;
            }

            function doPaint() {
                var n = view.page;
                return doc.getPage(n).then(function (page) {
                    current = page;
                    var base = page.getViewport({ scale: 1 });
                    var avail = Math.max(el.stage.clientWidth - 56, 200);
                    fitScale = avail / base.width;
                    var dpr = Math.min(window.devicePixelRatio || 1, 2);
                    var vp = page.getViewport({ scale: fitScale * zoom * dpr });

                    canvas.width = Math.floor(vp.width);
                    canvas.height = Math.floor(vp.height);
                    canvas.style.width = Math.floor(vp.width / dpr) + 'px';
                    canvas.style.height = Math.floor(vp.height / dpr) + 'px';

                    var ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
                        updateZoomReadout();
                        var foot = [
                            base.width + ' × ' + Math.round(base.height) + ' pt',
                            'page ' + n + ' of ' + doc.numPages,
                            fmtBytes(entry.size)
                        ];
                        setFoot(foot);
                    });
                });
            }

            /* Metadata is optional and must never block the first page. */
            var metaPromise = doc.getMetadata().catch(function () { return null; });

            return paint().then(function () {
                return metaPromise;
            }).then(function (meta) {
                var rows = [];
                if (current) {
                    var vp = current.getViewport({ scale: 1 });
                    rows.push(['Page size', Math.round(vp.width) + ' × ' + Math.round(vp.height) + ' pt' +
                        ' (' + paperName(vp.width, vp.height) + ')']);
                    rows.push(['Pages', String(doc.numPages)]);
                }
                rows.push(['PDF version', pdfVersion(bytes)]);
                if (meta && meta.info) {
                    var info = meta.info;
                    if (info.Title) { rows.push(['Title', esc(info.Title)]); }
                    if (info.Author) { rows.push(['Author', esc(info.Author)]); }
                    if (info.Subject) { rows.push(['Subject', esc(info.Subject)]); }
                    if (info.Producer) { rows.push(['Producer', esc(info.Producer)]); }
                    if (info.Creator) { rows.push(['Creator', esc(info.Creator)]); }
                    if (info.CreationDate) { rows.push(['Created', pdfDate(info.CreationDate)]); }
                    if (info.ModDate) { rows.push(['Modified', pdfDate(info.ModDate)]); }
                }
                var existing = entry.info && entry.info.sections ? entry.info.sections : [];
                entry.info = {
                    sections: [{ title: 'Document', rows: rows }].concat(existing),
                    exif: [],
                    notes: []
                };
                return view;
            }).catch(function (err) {
                /* A metadata failure must not take the rendered page with it. */
                if (canvas.width) { return view; }
                throw err;
            });
        });
    }

    /* The header line is authoritative; pdf.js reports its own library version,
       not the document's. */
    function pdfVersion(bytes) {
        var head = ascii(bytes, 0, 8);
        var m = /^%PDF-(\d+\.\d+)/.exec(head);
        return m ? m[1] : '—';
    }

    function paperName(w, h) {        var portrait = h >= w;
        var a = Math.min(w, h);
        var b = Math.max(w, h);
        var known = [[612, 792, 'Letter'], [595, 842, 'A4'], [612, 1008, 'Legal'], [522, 756, 'Executive']];
        for (var i = 0; i < known.length; i++) {
            if (Math.abs(known[i][0] - a) < 4 && Math.abs(known[i][1] - b) < 4) {
                return known[i][2] + (portrait ? '' : ' landscape');
            }
        }
        return 'custom';
    }

    function pdfDate(s) {
        var m = /^D:(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?/.exec(String(s));
        if (!m) { return String(s); }
        return m[1] + '-' + m[2] + '-' + m[3] + (m[4] ? ' ' + m[4] + ':' + (m[5] || '00') : '');
    }

    /* ------------------------------------------------------------------ */
    /* Viewer: text / JSON                                                 */
    /* ------------------------------------------------------------------ */

    function decodeText(buffer) {
        var b = buffer;
        if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) {
            return { text: new TextDecoder('utf-8').decode(b.subarray(3)), encoding: 'UTF-8 (BOM)' };
        }
        if (b[0] === 0xFF && b[1] === 0xFE) {
            return { text: new TextDecoder('utf-16le').decode(b.subarray(2)), encoding: 'UTF-16 LE' };
        }
        if (b[0] === 0xFE && b[1] === 0xFF) {
            return { text: new TextDecoder('utf-16be').decode(b.subarray(2)), encoding: 'UTF-16 BE' };
        }
        try {
            return { text: new TextDecoder('utf-8', { fatal: true }).decode(b), encoding: 'UTF-8' };
        } catch (e) { /* not UTF-8 */ }
        try {
            return { text: new TextDecoder('gbk').decode(b), encoding: 'GBK' };
        } catch (e) { /* not GBK */ }
        return { text: new TextDecoder('windows-1252').decode(b), encoding: 'Windows-1252' };
    }

    function viewText(entry, bytes, token, isJson) {
        var tooBig = entry.size > MAX_TEXT_BYTES;
        var slice = tooBig ? bytes.subarray(0, MAX_TEXT_BYTES) : bytes;
        var decoded = decodeText(slice);
        var text = decoded.text;
        var lines = text.split(/\r\n|\r|\n/);
        var shown = Math.min(lines.length, TEXT_LINE_CAP);

        var jsonNote = null;
        if (isJson) {
            try {
                text = JSON.stringify(JSON.parse(text), null, 2);
                lines = text.split('\n');
                shown = Math.min(lines.length, TEXT_LINE_CAP);
            } catch (e) {
                jsonNote = 'Not valid JSON: ' + e.message;
            }
        }

        var host = node('div', 'text-host');
        el.stage.classList.add('is-flush');
        var bar = node('div', 'text-bar');
        bar.appendChild(node('span', null, decoded.encoding + ' · ' + fmtInt(lines.length) + ' lines'));
        var wrapBtn = node('button', 'btn btn-quiet btn-small', 'Wrap');
        wrapBtn.type = 'button';
        wrapBtn.style.marginLeft = 'auto';
        bar.appendChild(wrapBtn);
        host.appendChild(bar);

        var scroller = node('div', 'text-scroll');
        var pre = node('div', 'text-view');
        pre.style.setProperty('--text-zoom', '1');
        for (var i = 0; i < shown; i++) {
            var row = node('div', 'tl');
            row.appendChild(node('span', 'ln', String(i + 1)));
            row.appendChild(node('span', 'tx', lines[i] === '' ? ' ' : lines[i]));
            pre.appendChild(row);
        }
        scroller.appendChild(pre);
        host.appendChild(scroller);
        stageInner().appendChild(host);

        wrapBtn.addEventListener('click', function () {
            pre.classList.toggle('is-wrapped');
            wrapBtn.textContent = pre.classList.contains('is-wrapped') ? 'No wrap' : 'Wrap';
        });

        var chars = text.length;
        var words = text.trim() ? text.trim().split(/\s+/).length : 0;
        var rows = [
            ['Encoding', decoded.encoding],
            ['Lines', fmtInt(lines.length)],
            ['Characters', fmtInt(chars)],
            ['Words', fmtInt(words)]
        ];
        if (isJson) {
            rows.push(['JSON', jsonNote ? 'invalid' : 'valid']);
        }

        entry.info = {
            sections: [{ title: isJson ? 'JSON' : 'Text', rows: rows }],
            exif: [],
            notes: [
                tooBig ? 'Showing the first ' + fmtBytes(MAX_TEXT_BYTES) + ' of ' + fmtBytes(entry.size) + '.' : null,
                shown < lines.length ? 'Showing the first ' + fmtInt(shown) + ' lines of ' + fmtInt(lines.length) + '.' : null,
                jsonNote
            ].filter(Boolean)
        };

        setFoot([decoded.encoding, fmtInt(lines.length) + ' lines', fmtBytes(entry.size)]);

        return Promise.resolve({
            pages: 1,
            page: 1,
            zoomable: true,
            rotatable: false,
            effectiveZoom: function () { return zoom; },
            setZoom: function () {
                pre.style.setProperty('--text-zoom', String(zoom));
                updateZoomReadout();
            }
        });
    }

    /* ------------------------------------------------------------------ */
    /* Viewer: CSV / TSV                                                   */
    /* ------------------------------------------------------------------ */

    function parseCsv(text) {
        var firstLine = text.slice(0, text.indexOf('\n') < 0 ? text.length : text.indexOf('\n'));
        var counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
        var inQuotes = false;
        for (var i = 0; i < firstLine.length; i++) {
            var ch = firstLine[i];
            if (ch === '"') { inQuotes = !inQuotes; }
            else if (!inQuotes && counts[ch] !== undefined) { counts[ch]++; }
        }
        var delimiter = ',';
        Object.keys(counts).forEach(function (d) { if (counts[d] > counts[delimiter]) { delimiter = d; } });

        var rows = [];
        var row = [];
        var field = '';
        inQuotes = false;
        for (i = 0; i < text.length; i++) {
            ch = text[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (text[i + 1] === '"') { field += '"'; i++; }
                    else { inQuotes = false; }
                } else { field += ch; }
            } else if (ch === '"') {
                inQuotes = true;
            } else if (ch === delimiter) {
                row.push(field); field = '';
            } else if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && text[i + 1] === '\n') { i++; }
                row.push(field); field = '';
                rows.push(row); row = [];
            } else {
                field += ch;
            }
        }
        if (field !== '' || row.length) { row.push(field); rows.push(row); }
        return { rows: rows, delimiter: delimiter };
    }

    function viewCsv(entry, bytes, token) {
        var decoded = decodeText(bytes);
        var parsed = parseCsv(decoded.text);
        var rows = parsed.rows.filter(function (r) {
            return r.length > 1 || (r.length === 1 && r[0] !== '');
        });
        var header = rows[0] || [];
        var body = rows.slice(1);
        var cols = Math.max.apply(null, rows.map(function (r) { return r.length; }).concat([0]));
        var pageSize = CSV_ROWS_PER_PAGE;
        var pages = Math.max(1, Math.ceil(body.length / pageSize));

        var host = node('div', 'table-host');
        el.stage.classList.add('is-flush');
        var bar = node('div', 'table-bar');
        var barLabel = node('span', null, '');
        bar.appendChild(barLabel);
        var delimName = { ',': 'comma', ';': 'semicolon', '\t': 'tab', '|': 'pipe' }[parsed.delimiter] || parsed.delimiter;
        bar.appendChild(node('span', null, 'separated by ' + delimName));
        host.appendChild(bar);

        var scroller = node('div', 'table-scroll');
        host.appendChild(scroller);
        stageInner().appendChild(host);

        var view = {
            pages: pages,
            page: 1,
            zoomable: false,
            rotatable: false,
            show: function (n) {
                view.page = n;
                paint();
            }
        };

        function paint() {
            var start = (view.page - 1) * pageSize;
            var slice = body.slice(start, start + pageSize);
            scroller.innerHTML = '';
            var table = node('table', 'sheet-table');
            var thead = document.createElement('thead');
            var trh = document.createElement('tr');
            trh.appendChild(node('th', 'row-head', '#'));
            for (var c = 0; c < cols; c++) {
                trh.appendChild(node('th', null, header[c] != null ? header[c] : ''));
            }
            thead.appendChild(trh);
            table.appendChild(thead);
            var tbody = document.createElement('tbody');
            slice.forEach(function (r, i) {
                var tr = document.createElement('tr');
                tr.appendChild(node('td', 'row-head', String(start + i + 1)));
                for (var c2 = 0; c2 < cols; c2++) {
                    var value = r[c2] != null ? r[c2] : '';
                    var cell = node('td', null, value);
                    if (String(value).length > 28) { cell.title = String(value); }
                    tr.appendChild(cell);
                }
                tbody.appendChild(tr);
            });
            table.appendChild(tbody);
            scroller.appendChild(table);
            barLabel.textContent = 'Rows ' + (start + 1) + '–' + Math.min(start + pageSize, body.length) +
                ' of ' + fmtInt(body.length);
            setFoot([fmtInt(rows.length) + ' rows', cols + ' columns', decoded.encoding]);
        }

        paint();

        entry.info = {
            sections: [{
                title: 'Table', rows: [
                    ['Rows', fmtInt(rows.length) + ' (1 header + ' + fmtInt(body.length) + ' data)'],
                    ['Columns', String(cols)],
                    ['Delimiter', parsed.delimiter === '\t' ? 'tab' : '“' + parsed.delimiter + '”'],
                    ['Encoding', decoded.encoding]
                ]
            }],
            exif: [],
            notes: []
        };
        return Promise.resolve(view);
    }

    /* ------------------------------------------------------------------ */
    /* Viewer: DOCX                                                        */
    /* ------------------------------------------------------------------ */

    function viewDocx(entry, bytes, token) {
        if (entry.size > MAX_OFFICE_BYTES) {
            throw new Error('Office documents over 60 MB are not opened in this demo.');
        }
        return Promise.all([loadScript('lib/jszip.min.js'), loadScript('lib/docx-preview.min.js')])
            .then(function () {
                var host = node('div', 'doc-host');
                stageInner().appendChild(host);
                return window.docx.renderAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), host, null, {
                    className: 'docx',
                    inWrapper: true,
                    breakPages: true,
                    ignoreWidth: false,
                    /* Honouring the section page height keeps every page the same
                       size, which is what a page indicator implies. The flip side
                       is that a page overflows rather than growing — for a viewer
                       that is the honest trade. */
                    ignoreHeight: false,
                    ignoreFonts: false,
                    useBase64URL: true,
                    renderHeaders: true,
                    renderFooters: true,
                    experimental: true
                }).then(function () { return host; });
            })
            .then(function (host) {
                var sections = host.querySelectorAll('section.docx');
                var pages = sections.length || 1;
                var fitScale = 1;
                var pageW = sections.length ? sections[0].offsetWidth : 816;

                function applyZoom() {
                    var avail = Math.max(el.stage.clientWidth - 48, 200);
                    fitScale = Math.min(1, avail / pageW);
                    host.style.zoom = String(fitScale * zoom);
                    /* Last page, short page: without slack below the document the
                       browser cannot scroll it to the top, and "page 3" would sit
                       half off screen. */
                    host.style.paddingBottom = Math.max(0, el.stage.clientHeight - 80) + 'px';
                    updateZoomReadout();
                }

                var view = {
                    pages: pages,
                    page: 1,
                    zoomable: true,
                    rotatable: false,
                    effectiveZoom: function () { return fitScale * zoom; },
                    setZoom: applyZoom,
                    show: function (n) {
                        view.page = n;
                        if (sections.length) {
                            var target = sections[Math.min(n, sections.length) - 1];
                            var r = target.getBoundingClientRect();
                            var s = el.stage.getBoundingClientRect();
                            el.stage.scrollTo({
                                top: el.stage.scrollTop + (r.top - s.top) - 8,
                                behavior: 'smooth'
                            });
                        }
                    }
                };

                applyZoom();

                var words = (host.innerText || '').trim().split(/\s+/).filter(Boolean).length;
                var rows = [
                    ['Pages', String(pages)],
                    ['Page size', Math.round(pageW) + ' × ' + (sections.length ? Math.round(sections[0].offsetHeight) : 0) + ' px'],
                    ['Words (rendered)', fmtInt(words)]
                ];
                return readCoreProps(bytes).then(function (core) {
                    if (core) {
                        ['title', 'creator', 'lastModifiedBy', 'created', 'modified', 'subject'].forEach(function (k) {
                            if (core[k]) { rows.push([k === 'creator' ? 'Author' : k === 'lastModifiedBy' ? 'Last modified by' : k.charAt(0).toUpperCase() + k.slice(1), esc(core[k])]); }
                        });
                    }
                    entry.info = { sections: [{ title: 'DOCX', rows: rows }], exif: [], notes: [] };
                    setFoot([pages + ' pages', Math.round(pageW) + ' px wide', fmtBytes(entry.size)]);
                    window.addEventListener('resize', function () {
                        if (viewer === view) { applyZoom(); }
                    });
                    return view;
                });
            });
    }

    function readCoreProps(bytes) {
        return window.JSZip.loadAsync(bytes).then(function (zip) {
            var f = zip.file('docProps/core.xml');
            if (!f) { return null; }
            return f.async('string').then(function (xml) {
                var doc = new DOMParser().parseFromString(xml, 'application/xml');
                if (doc.getElementsByTagName('parsererror').length) { return null; }
                var out = {};
                ['title', 'creator', 'lastModifiedBy', 'created', 'modified', 'subject'].forEach(function (k) {
                    var n = doc.getElementsByTagNameNS('*', k)[0];
                    if (n && n.textContent) { out[k] = n.textContent.trim(); }
                });
                return out;
            });
        }).catch(function () { return null; });
    }

    /* ------------------------------------------------------------------ */
    /* Viewer: XLSX                                                        */
    /* ------------------------------------------------------------------ */

    function viewXlsx(entry, bytes, token) {
        return loadScript('lib/xlsx.full.min.js').then(function () {
            var wb = window.XLSX.read(bytes, { type: 'array', cellDates: false, cellText: true });
            var pages = [];

            wb.SheetNames.forEach(function (name) {
                var ws = wb.Sheets[name];
                if (!ws || !ws['!ref']) { return; }
                var range = window.XLSX.utils.decode_range(ws['!ref']);
                var all = window.XLSX.utils.sheet_to_json(ws, {
                    header: 1, raw: false, defval: '', blankrows: true
                });
                var headerRow = all[0] || [];
                var bodyRows = all.slice(1);
                var blocks = Math.max(1, Math.ceil(bodyRows.length / XLSX_ROWS_PER_PAGE));
                for (var b = 0; b < blocks; b++) {
                    pages.push({
                        sheet: name,
                        header: headerRow,
                        rows: bodyRows.slice(b * XLSX_ROWS_PER_PAGE, (b + 1) * XLSX_ROWS_PER_PAGE),
                        blockStart: b * XLSX_ROWS_PER_PAGE,
                        startRow: range.s.r + 2 + b * XLSX_ROWS_PER_PAGE,
                        total: bodyRows.length,
                        range: range,
                        merges: ws['!merges'] || []
                    });
                }
            });

            if (!pages.length) { throw new Error('This workbook has no readable cells.'); }

            var host = node('div', 'table-host');
            el.stage.classList.add('is-flush');
            var bar = node('div', 'table-bar');
            var label = node('span', null, '');
            bar.appendChild(label);
            bar.appendChild(node('span', null, wb.SheetNames.length + ' sheet' + (wb.SheetNames.length > 1 ? 's' : '')));
            host.appendChild(bar);
            var scroller = node('div', 'table-scroll');
            host.appendChild(scroller);
            stageInner().appendChild(host);

            var view = {
                pages: pages.length,
                page: 1,
                zoomable: false,
                rotatable: false,
                show: function (n) { view.page = n; paint(); }
            };

            function paint() {
                var p = pages[view.page - 1];
                var cols = Math.max(p.header.length, Math.max.apply(null, p.rows.map(function (r) { return r.length; }).concat([0])));
                if (cols === 0) { cols = 1; }

                var mergeMap = {};
                var covered = {};
                p.merges.forEach(function (m) {
                    /* Merge coordinates are absolute sheet cells; rebase them onto
                       this page's block of body rows and columns. */
                    var sr = m.s.r - (p.range.s.r + 1) - p.blockStart;
                    var er = m.e.r - (p.range.s.r + 1) - p.blockStart;
                    var sc = m.s.c - p.range.s.c;
                    var ec = m.e.c - p.range.s.c;
                    if (sr < 0 || sc < 0 || sr >= p.rows.length || er < sr) { return; }
                    er = Math.min(er, p.rows.length - 1);
                    mergeMap[sr + ':' + sc] = { rowspan: er - sr + 1, colspan: ec - sc + 1 };
                    for (var rr = sr; rr <= er; rr++) {
                        for (var cc = sc; cc <= ec; cc++) {
                            if (rr !== sr || cc !== sc) { covered[rr + ':' + cc] = true; }
                        }
                    }
                });

                scroller.innerHTML = '';
                var table = node('table', 'sheet-table');
                var thead = document.createElement('thead');
                var trh = document.createElement('tr');
                trh.appendChild(node('th', 'row-head', '#'));
                for (var c = 0; c < cols; c++) {
                    trh.appendChild(node('th', null, p.header[c] != null ? String(p.header[c]) : ''));
                }
                thead.appendChild(trh);
                table.appendChild(thead);

                var tbody = document.createElement('tbody');
                p.rows.forEach(function (r, ri) {
                    var tr = document.createElement('tr');
                    tr.appendChild(node('td', 'row-head', String(p.startRow + ri)));
                    for (var ci = 0; ci < cols; ci++) {
                        if (covered[ri + ':' + ci]) { continue; }
                        var cellValue = r[ci] != null ? String(r[ci]) : '';
                        var td = node('td', null, cellValue);
                        if (cellValue.length > 28) { td.title = cellValue; }
                        var span = mergeMap[ri + ':' + ci];
                        if (span) {
                            if (span.rowspan > 1) { td.rowSpan = span.rowspan; }
                            if (span.colspan > 1) { td.colSpan = span.colspan; }
                        }
                        tr.appendChild(td);
                    }
                    tbody.appendChild(tr);
                });
                table.appendChild(tbody);
                scroller.appendChild(table);

                label.textContent = p.sheet + ' · rows ' + p.startRow + '–' +
                    (p.startRow + p.rows.length - 1) + ' of ' + (p.total + 1);
                setFoot([wb.SheetNames.length + ' sheets', fmtBytes(entry.size)]);
            }

            paint();

            var sheetRows = wb.SheetNames.map(function (name) {
                var ws = wb.Sheets[name];
                if (!ws || !ws['!ref']) { return [name, 'empty']; }
                var r = window.XLSX.utils.decode_range(ws['!ref']);
                return [name, window.XLSX.utils.encode_range(r) + ' (' + (r.e.r - r.s.r + 1) + ' × ' + (r.e.c - r.s.c + 1) + ')'];
            });

            entry.info = {
                sections: [{
                    title: 'Workbook',
                    rows: [['Sheets', String(wb.SheetNames.length)]].concat(sheetRows.map(function (s) {
                        return [s[0], s[1], 'value-mono'];
                    }))
                }],
                exif: [],
                notes: ['Rows are split into blocks of ' + XLSX_ROWS_PER_PAGE + ' so the page control stays useful.']
            };
            return view;
        });
    }

    /* ------------------------------------------------------------------ */
    /* Viewer: PPTX                                                        */
    /* ------------------------------------------------------------------ */

    function parseXml(text) {
        var doc = new DOMParser().parseFromString(text, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) {
            throw new Error('Malformed XML in the presentation package');
        }
        return doc;
    }

    function kids(parent, localName) {
        var out = [];
        if (!parent) { return out; }
        for (var i = 0; i < parent.children.length; i++) {
            if (parent.children[i].localName === localName) { out.push(parent.children[i]); }
        }
        return out;
    }

    function kid(parent, localName) {
        return kids(parent, localName)[0] || null;
    }

    function allByLocal(root, localName) {
        var list = root.getElementsByTagNameNS('*', localName);
        return Array.prototype.slice.call(list);
    }

    function relsMap(xml) {
        var map = {};
        if (!xml) { return map; }
        var doc = parseXml(xml);
        allByLocal(doc, 'Relationship').forEach(function (n) {
            map[n.getAttribute('Id')] = n.getAttribute('Target');
        });
        return map;
    }

    function resolvePath(baseFile, target) {
        if (!target) { return null; }
        if (target.charAt(0) === '/') { return target.slice(1); }
        var parts = baseFile.split('/');
        parts.pop();
        target.split('/').forEach(function (seg) {
            if (seg === '..') { parts.pop(); }
            else if (seg !== '.' && seg !== '') { parts.push(seg); }
        });
        return parts.join('/');
    }

    function pptColor(fillNode) {
        if (!fillNode) { return null; }
        var clr = kid(fillNode, 'srgbClr');
        if (clr) { return '#' + clr.getAttribute('val'); }
        var scheme = kid(fillNode, 'schemeClr');
        if (scheme) {
            var map = {
                bg1: '#FFFFFF', lt1: '#FFFFFF', tx1: '#000000', dk1: '#000000',
                bg2: '#EEECE1', lt2: '#EEECE1', tx2: '#1F497D', dk2: '#44546A',
                accent1: '#4472C4', accent2: '#ED7D31', accent3: '#A5A5A5',
                accent4: '#FFC000', accent5: '#5B9BD5', accent6: '#70AD47',
                hlink: '#0563C1', folHlink: '#954F72'
            };
            return map[scheme.getAttribute('val')] || null;
        }
        return null;
    }

    function pptXfrm(node) {
        var pr = kid(node, 'spPr') || kid(node, 'grpSpPr');
        if (!pr) { return null; }
        var xfrm = kid(pr, 'xfrm');
        if (!xfrm) { return null; }
        var off = kid(xfrm, 'off');
        var ext = kid(xfrm, 'ext');
        var chOff = kid(xfrm, 'chOff');
        var chExt = kid(xfrm, 'chExt');
        return {
            x: off ? +off.getAttribute('x') : 0,
            y: off ? +off.getAttribute('y') : 0,
            cx: ext ? +ext.getAttribute('cx') : 0,
            cy: ext ? +ext.getAttribute('cy') : 0,
            chX: chOff ? +chOff.getAttribute('x') : 0,
            chY: chOff ? +chOff.getAttribute('y') : 0,
            chCx: chExt ? +chExt.getAttribute('cx') : 0,
            chCy: chExt ? +chExt.getAttribute('cy') : 0
        };
    }

    function viewPptx(entry, bytes, token) {
        return loadScript('lib/jszip.min.js').then(function () {
            return window.JSZip.loadAsync(bytes);
        }).then(function (zip) {
            var presFile = zip.file('ppt/presentation.xml');
            if (!presFile) { throw new Error('ppt/presentation.xml is missing'); }
            return Promise.all([
                presFile.async('string'),
                zip.file('ppt/_rels/presentation.xml.rels') ?
                    zip.file('ppt/_rels/presentation.xml.rels').async('string') : ''
            ]).then(function (parts) {
                return { zip: zip, presXml: parts[0], relsXml: parts[1] };
            });
        }).then(function (ctx) {
            var doc = parseXml(ctx.presXml);
            var sz = allByLocal(doc, 'sldSz')[0];
            var pageW = sz ? Math.round(+sz.getAttribute('cx') / EMU_PX) : 1280;
            var pageH = sz ? Math.round(+sz.getAttribute('cy') / EMU_PX) : 720;
            var relMap = relsMap(ctx.relsXml);
            var ids = allByLocal(doc, 'sldId').map(function (n) {
                return n.getAttribute('r:id');
            }).filter(Boolean);

            var slides = ids.map(function (id) {
                var path = 'ppt/' + relMap[id];
                return { path: path };
            }).filter(function (s) { return ctx.zip.file(s.path); });

            if (!slides.length) { throw new Error('No slides found in this presentation.'); }

            var host = node('div', 'doc-host');
            var center = stageInner();
            center.appendChild(host);
            var fitScale = 1;
            var built = {};

            function applyZoom() {
                var avail = Math.max(el.stage.clientWidth - 56, 200);
                fitScale = Math.min(1, avail / pageW);
                host.style.zoom = String(fitScale * zoom);
                updateZoomReadout();
            }

            function build(n) {
                if (built[n]) { return built[n]; }
                var slide = slides[n - 1];
                return Promise.all([
                    ctx.zip.file(slide.path).async('string'),
                    (function () {
                        var relPath = slide.path.replace(/([^/]+)$/, '_rels/$1.rels');
                        var f = ctx.zip.file(relPath);
                        return f ? f.async('string') : Promise.resolve('');
                    })()
                ]).then(function (parts) {
                    var page = node('div', 'slide-page');
                    page.style.width = pageW + 'px';
                    page.style.height = pageH + 'px';
                    var sdoc = parseXml(parts[0]);
                    var srels = relsMap(parts[1]);

                    var bg = allByLocal(sdoc, 'bg')[0];
                    if (bg) {
                        var bgPr = kid(bg, 'bgPr');
                        var fill = bgPr ? (kid(bgPr, 'solidFill') || kid(bgPr, 'gradFill')) : null;
                        var c = pptColor(fill);
                        if (c) { page.style.background = c; }
                    }

                    var tree = allByLocal(sdoc, 'spTree')[0];
                    if (!tree) { return page; }

                    var jobs = [];
                    Array.prototype.slice.call(tree.children).forEach(function (child) {
                        var name = child.localName;
                        if (name === 'sp') {
                            var box = shapeBox(child, srels, null);
                            if (box) { page.appendChild(box); }
                        } else if (name === 'pic') {
                            var pic = pictureBox(child);
                            if (pic) {
                                page.appendChild(pic.node);
                                jobs.push(pic.fill(ctx.zip, srels, slide.path));
                            }
                        } else if (name === 'graphicFrame') {
                            var frame = tableBox(child);
                            if (frame) { page.appendChild(frame); }
                        } else if (name === 'grpSp') {
                            var group = pptXfrm(child);
                            Array.prototype.slice.call(child.children).forEach(function (gc) {
                                if (gc.localName === 'sp') {
                                    var gb = shapeBox(gc, srels, group);
                                    if (gb) { page.appendChild(gb); }
                                }
                            });
                        }
                    });

                    return Promise.all(jobs).then(function () { return page; });
                }).then(function (page) {
                    built[n] = page;
                    return page;
                });
            }

            function shapeBox(sp, srels, group) {
                var xf = pptXfrm(sp);
                if (!xf || !xf.cx) { return null; }
                var box = node('div', 'slide-shape');
                place(box, xf, group);
                var pr = kid(sp, 'spPr');
                var fillNode = pr ? (kid(pr, 'solidFill') || kid(pr, 'gradFill')) : null;
                var color = pptColor(fillNode);
                if (color) { box.style.background = color; }

                var geom = allByLocal(sp, 'prstGeom')[0];
                var prst = geom ? geom.getAttribute('prst') : '';
                if (prst === 'ellipse') { box.style.borderRadius = '50%'; }
                else if (prst.indexOf('round') === 0) { box.style.borderRadius = Math.min(18, xf.cy / EMU_PX * 0.2) + 'px'; }

                var body = kid(sp, 'txBody');
                if (body) {
                    applyText(body, box, pageW);
                    box.classList.add('slide-text');
                }
                return box;
            }

            function place(box, xf, group) {
                var x = xf.x, y = xf.y, cx = xf.cx, cy = xf.cy;
                if (group && group.chCx) {
                    var sx = group.cx / group.chCx;
                    var sy = group.cy / group.chCy;
                    x = group.x + (x - group.chX) * sx;
                    y = group.y + (y - group.chY) * sy;
                    cx = cx * sx;
                    cy = cy * sy;
                }
                box.style.left = (x / EMU_PX) + 'px';
                box.style.top = (y / EMU_PX) + 'px';
                box.style.width = (cx / EMU_PX) + 'px';
                box.style.height = (cy / EMU_PX) + 'px';
            }

            function applyText(body, box, slideW) {
                var bodyPr = kid(body, 'bodyPr');
                var anchor = bodyPr ? bodyPr.getAttribute('anchor') : 't';
                box.style.justifyContent = anchor === 'ctr' ? 'center' : anchor === 'b' ? 'flex-end' : 'flex-start';
                box.style.padding = '6px 10px';
                box.style.boxSizing = 'border-box';

                kids(body, 'p').forEach(function (p) {
                    var pel = document.createElement('p');
                    var pPr = kid(p, 'pPr');
                    var algn = pPr ? pPr.getAttribute('algn') : null;
                    if (algn === 'ctr') { pel.style.textAlign = 'center'; }
                    else if (algn === 'r') { pel.style.textAlign = 'right'; }
                    else if (algn === 'just') { pel.style.textAlign = 'justify'; }

                    var bullet = pPr ? (kid(pPr, 'buChar') || kid(pPr, 'buAutoNum')) : null;
                    if (bullet) {
                        pel.style.paddingLeft = '1.1em';
                        pel.style.textIndent = '-1.1em';
                        pel.appendChild(document.createTextNode('• '));
                    }

                    var baseSz = 1800;
                    if (pPr) {
                        var dr = kid(pPr, 'defRPr');
                        if (dr && dr.getAttribute('sz')) { baseSz = +dr.getAttribute('sz'); }
                    }

                    Array.prototype.slice.call(p.children).forEach(function (r) {
                        if (r.localName === 'r' || r.localName === 'fld') {
                            var t = kid(r, 't');
                            if (!t) { return; }
                            var span = document.createElement('span');
                            span.textContent = t.textContent;
                            var rPr = kid(r, 'rPr');
                            var sz = rPr && rPr.getAttribute('sz') ? +rPr.getAttribute('sz') : baseSz;
                            span.style.fontSize = (sz / 100 * 4 / 3) + 'px';
                            if (rPr) {
                                if (rPr.getAttribute('b') === '1') { span.style.fontWeight = '700'; }
                                if (rPr.getAttribute('i') === '1') { span.style.fontStyle = 'italic'; }
                                if (rPr.getAttribute('u') && rPr.getAttribute('u') !== 'none') { span.style.textDecoration = 'underline'; }
                                var c = pptColor(kid(rPr, 'solidFill'));
                                if (c) { span.style.color = c; }
                                var latin = kid(rPr, 'latin');
                                if (latin && latin.getAttribute('typeface')) {
                                    span.style.fontFamily = '"' + latin.getAttribute('typeface') + '", Arial, sans-serif';
                                }
                            }
                            pel.appendChild(span);
                        } else if (r.localName === 'br') {
                            pel.appendChild(document.createElement('br'));
                        }
                    });

                    if (!pel.textContent) { pel.appendChild(document.createTextNode(' ')); }
                    box.appendChild(pel);
                });
            }

            function pictureBox(pic) {
                var xf = pptXfrm(pic);
                if (!xf || !xf.cx) { return null; }
                var box = node('div', 'slide-shape');
                place(box, xf, null);
                box.style.backgroundSize = '100% 100%';
                box.style.backgroundRepeat = 'no-repeat';
                var blip = allByLocal(pic, 'blip')[0];
                var embed = blip ? blip.getAttribute('r:embed') : null;
                return {
                    node: box,
                    fill: function (zip, srels, slidePath) {
                        if (!embed || !srels[embed]) { return Promise.resolve(); }
                        var media = resolvePath(slidePath, srels[embed]);
                        var f = zip.file(media);
                        if (!f) { return Promise.resolve(); }
                        var ext = extOf(media);
                        var mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp' }[ext];
                        if (!mime) { return Promise.resolve(); }
                        return f.async('base64').then(function (b64) {
                            box.style.backgroundImage = 'url(data:' + mime + ';base64,' + b64 + ')';
                        });
                    }
                };
            }

            function tableBox(frame) {
                var xf = kid(frame, 'xfrm');
                if (!xf) { return null; }
                var off = kid(xf, 'off');
                var ext = kid(xf, 'ext');
                var box = node('div', 'slide-shape');
                box.style.left = ((off ? +off.getAttribute('x') : 0) / EMU_PX) + 'px';
                box.style.top = ((off ? +off.getAttribute('y') : 0) / EMU_PX) + 'px';
                box.style.width = ((ext ? +ext.getAttribute('cx') : 4000000) / EMU_PX) + 'px';
                box.style.height = ((ext ? +ext.getAttribute('cy') : 1000000) / EMU_PX) + 'px';

                var tbl = allByLocal(frame, 'tbl')[0];
                if (!tbl) {
                    box.style.border = '1px dashed #bdbdbd';
                    box.style.display = 'flex';
                    box.style.alignItems = 'center';
                    box.style.justifyContent = 'center';
                    box.style.color = '#8a8a8a';
                    box.style.fontSize = '12px';
                    box.textContent = 'chart';
                    return box;
                }

                var table = document.createElement('table');
                kids(tbl, 'tr').forEach(function (tr) {
                    var row = document.createElement('tr');
                    kids(tr, 'tc').forEach(function (tc) {
                        var cell = document.createElement('td');
                        var tcPr = kid(tc, 'tcPr');
                        var fill = tcPr ? kid(tcPr, 'solidFill') : null;
                        var color = pptColor(fill);
                        if (color) { cell.style.background = color; }
                        var body = kid(tc, 'txBody');
                        if (body) {
                            /* The cell stays a table-cell; vertical centring comes
                               from CSS, so the table's layout is untouched. */
                            applyText(body, cell, pageW);
                        }
                        row.appendChild(cell);
                    });
                    table.appendChild(row);
                });
                box.appendChild(table);
                return box;
            }

            var view = {
                pages: slides.length,
                page: 1,
                zoomable: true,
                rotatable: false,
                effectiveZoom: function () { return fitScale * zoom; },
                setZoom: applyZoom,
                show: function (n) {
                    view.page = n;
                    host.innerHTML = '';
                    setBusy(true, 'Rendering slide ' + n + '…');
                    build(n).then(function (page) {
                        host.innerHTML = '';
                        host.appendChild(page);
                        setBusy(false);
                        applyZoom();
                    });
                }
            };

            setFoot([slides.length + ' slides', pageW + ' × ' + pageH + ' px each', fmtBytes(entry.size)]);

            return build(1).then(function (page) {
                host.innerHTML = '';
                host.appendChild(page);
                applyZoom();

                var rows = [
                    ['Slides', String(slides.length)],
                    ['Slide size', (pageW / 96).toFixed(2) + ' × ' + (pageH / 96).toFixed(2) + ' in (' + pageW + ' × ' + pageH + ' px)'],
                    ['Aspect ratio', aspect(pageW, pageH)]
                ];
                return readCoreProps(bytes).then(function (core) {
                    if (core) {
                        if (core.title) { rows.push(['Title', esc(core.title)]); }
                        if (core.creator) { rows.push(['Author', esc(core.creator)]); }
                        if (core.modified) { rows.push(['Modified', esc(core.modified)]); }
                    }
                    entry.info = {
                        sections: [{ title: 'Presentation', rows: rows }],
                        exif: [],
                        notes: ['Slide text is re-flowed from the OOXML shape tree; SmartArt and animations are not rendered.']
                    };
                    window.addEventListener('resize', function () {
                        if (viewer === view) { applyZoom(); }
                    });
                    return view;
                });
            });
        });
    }

    /* ------------------------------------------------------------------ */
    /* Viewer: video / audio                                               */
    /* ------------------------------------------------------------------ */

    function viewMedia(entry, token, kind) {
        var url = URL.createObjectURL(entry.file);
        objectUrls.push(url);
        var host = node('div', 'media-host');
        stageInner().appendChild(host);
        el.stage.classList.add('is-plain');

        var media = document.createElement(kind === 'audio' ? 'audio' : 'video');
        media.controls = true;
        media.preload = 'metadata';
        media.src = url;
        if (kind === 'video') { media.playsInline = true; }
        host.appendChild(media);

        var note = node('div', 'media-note', '');
        host.appendChild(note);

        return new Promise(function (resolve) {
            media.addEventListener('loadedmetadata', function () {
                var w = media.videoWidth || 0;
                var h = media.videoHeight || 0;
                var dur = media.duration;
                var rows = [['Duration', fmtDuration(dur)]];
                if (w && h) {
                    rows.push(['Resolution', w + ' × ' + h + ' px']);
                    rows.push(['Aspect ratio', aspect(w, h)]);
                }
                rows.push(['Container', entry.format]);
                if (entry.mime) { rows.push(['MIME', esc(entry.mime)]); }

                entry.info = { sections: [{ title: kind === 'audio' ? 'Audio' : 'Video', rows: rows }], exif: [], notes: [] };
                if (viewer === view) { buildInfo(entry); renderFileList(); }

                setFoot(kind === 'audio'
                    ? [fmtDuration(dur), fmtBytes(entry.size)]
                    : [w + ' × ' + h, fmtDuration(dur), fmtBytes(entry.size)]);
                resolve(view);
            }, { once: true });

            media.addEventListener('error', function () {
                note.textContent = 'This browser cannot decode ' + entry.format +
                    '. The container was recognised, but no decoder accepted the stream — usually a codec ' +
                    'question (HEVC, ProRes), not a broken file.';
                setFoot(['no preview', fmtBytes(entry.size)]);
                entry.info = {
                    sections: [{ title: kind === 'audio' ? 'Audio' : 'Video', rows: [['Container', entry.format], ['Decoder', 'not available in this browser']] }],
                    exif: [], notes: []
                };
                if (viewer === view) { buildInfo(entry); }
                resolve(view);
            }, { once: true });

            var view = {
                pages: 1,
                page: 1,
                zoomable: false,
                rotatable: false,
                alwaysPager: false
            };
        });
    }

    /* ------------------------------------------------------------------ */
    /* Viewer: raw YUV                                                     */
    /* ------------------------------------------------------------------ */

    var YUV_FORMATS = {
        nv21: { label: 'NV21 — Y + interleaved VU (Android)', ratio: 1.5, group: '420' },
        nv12: { label: 'NV12 — Y + interleaved UV', ratio: 1.5, group: '420' },
        i420: { label: 'I420 — Y + U + V planes', ratio: 1.5, group: '420' },
        yv12: { label: 'YV12 — Y + V + U planes', ratio: 1.5, group: '420' },
        yuy2: { label: 'YUY2 / YUYV — packed 4:2:2', ratio: 2, group: '422' },
        uyvy: { label: 'UYVY — packed 4:2:2', ratio: 2, group: '422' },
        gray: { label: 'Y only — luma', ratio: 1, group: 'mono' }
    };

    function guessYuv(bytes, fmt) {
        var ratio = YUV_FORMATS[fmt].ratio;
        var sizes = [
            [3840, 2160], [2560, 1440], [1920, 1080], [1440, 1080], [1280, 960], [1280, 720],
            [1024, 768], [960, 540], [800, 600], [720, 480], [640, 480], [640, 360],
            [480, 360], [352, 288], [320, 240], [176, 144]
        ];
        for (var i = 0; i < sizes.length; i++) {
            var frame = Math.round(sizes[i][0] * sizes[i][1] * ratio);
            if (bytes.length >= frame && bytes.length % frame === 0) {
                return { w: sizes[i][0], h: sizes[i][1] };
            }
        }
        /* Nothing divides evenly: assume one frame at 4:3 and say so. */
        var px = bytes.length / ratio;
        var w = Math.max(2, Math.round(Math.sqrt(px * 4 / 3) / 2) * 2);
        var h = Math.max(2, Math.round(px / w / 2) * 2);
        return { w: w, h: h };
    }

    function yuvFrameSize(w, h, stride, fmt) {
        var info = YUV_FORMATS[fmt];
        if (info.group === '422') { return stride * h; }
        if (info.group === 'mono') { return stride * h; }
        return Math.round(stride * h * 1.5);
    }

    function yuvToRgba(src, offset, w, h, stride, fmt, dst) {
        var x, y, Y, U, V, idx, cIdx;
        var info = YUV_FORMATS[fmt];

        for (y = 0; y < h; y++) {
            var row = offset + y * stride;
            for (x = 0; x < w; x++) {
                var dy = (y >> 1);
                if (info.group === '422') {
                    var pair = row + (x - (x & 1)) * 2;
                    if (fmt === 'yuy2') {
                        Y = src[pair + (x & 1) * 2];
                        U = src[pair + 1];
                        V = src[pair + 3];
                    } else {
                        U = src[pair];
                        Y = src[pair + 1 + (x & 1) * 2];
                        V = src[pair + 2];
                    }
                } else if (info.group === 'mono') {
                    Y = src[row + x];
                    U = 128;
                    V = 128;
                } else {
                    Y = src[row + x];
                    if (fmt === 'nv21' || fmt === 'nv12') {
                        cIdx = offset + stride * h + dy * stride + (x & ~1);
                        if (fmt === 'nv21') { V = src[cIdx]; U = src[cIdx + 1]; }
                        else { U = src[cIdx]; V = src[cIdx + 1]; }
                    } else {
                        var halfStride = stride >> 1;
                        var plane = halfStride * dy + (x >> 1);
                        if (fmt === 'i420') {
                            U = src[offset + stride * h + plane];
                            V = src[offset + stride * h + halfStride * (h >> 1) + plane];
                        } else {
                            V = src[offset + stride * h + plane];
                            U = src[offset + stride * h + halfStride * (h >> 1) + plane];
                        }
                    }
                }

                var c = Y - 16;
                var d = U - 128;
                var e = V - 128;
                idx = (y * w + x) * 4;
                dst[idx] = (298 * c + 409 * e + 128) >> 8;
                dst[idx + 1] = (298 * c - 100 * d - 208 * e + 128) >> 8;
                dst[idx + 2] = (298 * c + 516 * d + 128) >> 8;
                dst[idx + 3] = 255;
            }
        }
    }

    function viewYuv(entry, bytes, token) {
        var cfg = entry.yuv;
        if (!cfg) {
            var guess = guessYuv(bytes, 'nv21');
            cfg = entry.yuv = { fmt: 'nv21', w: guess.w, h: guess.h, stride: guess.w };
        }

        var host = node('div', 'yuv-host');
        var bar = node('div', 'yuv-bar');

        var fmtSel = document.createElement('select');
        Object.keys(YUV_FORMATS).forEach(function (key) {
            var opt = new Option(YUV_FORMATS[key].label, key);
            fmtSel.appendChild(opt);
        });
        fmtSel.value = cfg.fmt;

        function numInput(value) {
            var input = document.createElement('input');
            input.type = 'number';
            input.min = '2';
            input.step = '2';
            input.value = String(value);
            return input;
        }
        var wIn = numInput(cfg.w);
        var hIn = numInput(cfg.h);
        var sIn = numInput(cfg.stride);

        function field(labelText, control) {
            var label = document.createElement('label');
            label.appendChild(document.createTextNode(labelText));
            label.appendChild(control);
            return label;
        }

        bar.appendChild(field('Format', fmtSel));
        bar.appendChild(field('Width', wIn));
        bar.appendChild(field('Height', hIn));
        bar.appendChild(field('Stride', sIn));
        var readout = node('span', 'yuv-readout', '');
        bar.appendChild(readout);

        var canvas = node('canvas', 'page-canvas');
        var rotor = makeRotor(canvas);
        host.appendChild(bar);
        host.appendChild(rotor.node);
        stageInner().appendChild(host);

        var fitScale = 1;
        var frameBytes = 1;
        var frames = 1;

        var view = {
            pages: 1,
            page: 1,
            zoomable: true,
            rotatable: true,
            alwaysPager: true,
            effectiveZoom: function () { return fitScale * zoom; },
            setZoom: function () { paint(); },
            rotate: function () { rotation = (rotation + 90) % 360; paint(); },
            show: function (n) { view.page = n; paint(); }
        };

        function recompute() {
            cfg.fmt = fmtSel.value;
            cfg.w = Math.max(2, parseInt(wIn.value, 10) || 2);
            cfg.h = Math.max(2, parseInt(hIn.value, 10) || 2);
            cfg.stride = Math.max(cfg.w, parseInt(sIn.value, 10) || cfg.w);
            frameBytes = yuvFrameSize(cfg.w, cfg.h, cfg.stride, cfg.fmt);
            frames = Math.max(1, Math.floor(bytes.length / frameBytes));
            view.pages = frames;
            if (view.page > frames) { view.page = 1; }

            readout.innerHTML = 'frame <b>' + view.page + '</b> of <b>' + fmtInt(frames) + '</b> · ' +
                fmtInt(frameBytes) + ' B/frame · ' + fmtBytes(bytes.length) + ' total' +
                (bytes.length % frameBytes ? ' · <span style="color:#b3261e">' + fmtInt(bytes.length % frameBytes) + ' B trailing</span>' : '');

            entry.info = {
                sections: [{
                    title: 'Raw frame',
                    rows: [
                        ['Pixel format', esc(YUV_FORMATS[cfg.fmt].label)],
                        ['Dimensions', cfg.w + ' × ' + cfg.h + ' px'],
                        ['Row stride', cfg.stride + ' B' + (cfg.stride > cfg.w ? ' (padded)' : '')],
                        ['Frame size', fmtInt(frameBytes) + ' bytes'],
                        ['Frames in file', fmtInt(frames)],
                        ['Sampling', cfg.fmt === 'gray' ? '4:0:0 (luma)' : YUV_FORMATS[cfg.fmt].group === '422' ? '4:2:2' : '4:2:0'],
                        ['Header', 'none — dimensions were inferred']
                    ]
                }],
                exif: [],
                notes: frames === 1 && bytes.length % frameBytes ?
                    ['The file length is not an exact multiple of the frame size. Check the width, height and stride — a mismatch here is the usual cause of diagonal colour tearing.'] : []
            };
            if (viewer === view) { buildInfo(entry); renderFileList(); }
            paint();
        }

        function paint() {
            var w = cfg.w, h = cfg.h;
            var frameBytesNow = frameBytes;
            var offset = (view.page - 1) * frameBytesNow;
            var rgba = new Uint8ClampedArray(w * h * 4);
            var slice = bytes.subarray(offset, offset + frameBytesNow);
            yuvToRgba(slice, 0, w, h, cfg.stride, cfg.fmt, rgba);

            canvas.width = w;
            canvas.height = h;
            var ctx = canvas.getContext('2d');
            ctx.putImageData(new ImageData(rgba, w, h), 0, 0);

            var avail = Math.max(el.stage.clientWidth - 56, 160);
            fitScale = Math.min(1, avail / w);
            rotor.apply(Math.round(w * fitScale * zoom), Math.round(h * fitScale * zoom), rotation);
            if (viewer === view) { updatePager(); }
            updateZoomReadout();
            setFoot([w + ' × ' + h + ' px', YUV_FORMATS[cfg.fmt].group === '422' ? '4:2:2' : cfg.fmt === 'gray' ? 'luma only' : '4:2:0',
                'frame ' + view.page + '/' + frames, fmtBytes(entry.size)]);
        }

        fmtSel.addEventListener('change', recompute);
        [wIn, hIn, sIn].forEach(function (input) {
            input.addEventListener('change', recompute);
        });

        recompute();

        entry.info.notes = entry.info.notes || [];
        return Promise.resolve(view);
    }

    /* ------------------------------------------------------------------ */
    /* Viewer: binary (metadata only)                                       */
    /* ------------------------------------------------------------------ */

    function viewBinary(entry, bytes, token) {
        var sig = hex(bytes, 0, Math.min(12, bytes.length));
        var zeros = 0;
        var sample = Math.min(bytes.length, 4096);
        for (var i = 0; i < sample; i++) { if (bytes[i] === 0) { zeros++; } }

        var host = node('div', 'binary-host');
        var big = node('div', 'big-badge', (entry.ext || 'bin').slice(0, 4));
        host.appendChild(big);
        host.appendChild(node('h3', null, 'No preview for this type'));
        host.appendChild(node('p', null,
            'The viewer read the header and stopped there: a recognised container with no renderer is shown ' +
            'as metadata, never as a fake page of pixels.'));
        stageInner().appendChild(host);

        entry.info = {
            sections: [{
                title: 'Binary',
                rows: [
                    ['Container', esc(entry.format)],
                    ['Signature', '<span class="value-mono">' + sig + '</span>'],
                    ['Zero bytes', (zeros / Math.max(sample, 1) * 100).toFixed(1) + '% of the first ' + fmtBytes(sample)],
                    ['Size', fmtBytes(entry.size)]
                ]
            }],
            exif: [],
            notes: ['Content is not displayed for binary files. This is the format the file claims in its first bytes.']
        };
        setFoot(['metadata only', fmtBytes(entry.size)]);
        return Promise.resolve({ pages: 1, page: 1, zoomable: false, rotatable: false });
    }

    /* ------------------------------------------------------------------ */
    /* Misc formatting                                                     */
    /* ------------------------------------------------------------------ */

    function aspect(w, h) {
        if (!w || !h) { return '—'; }
        var g = gcd(w, h);
        var rw = w / g;
        var rh = h / g;
        if (rw > 40 || rh > 40) {
            return (w / h).toFixed(2) + ':1';
        }
        return rw + ':' + rh;
    }

    function gcd(a, b) {
        while (b) { var t = b; b = a % b; a = t; }
        return a;
    }

    function findTag(tags, tag) {
        for (var i = 0; i < tags.length; i++) {
            if (tags[i].tag === tag) { return tags[i].value; }
        }
        return null;
    }

    /* ------------------------------------------------------------------ */
    /* Barcode scan: right-click menu, region selection, result panel      */
    /* ------------------------------------------------------------------ */

    /* The reader is not part of the page. It is fetched the first time the
       user scans something, which is why every other format keeps working
       with the network switched off. Version pinned to the bundle the other
       Codepool demos load. */
    var DBR_BUNDLE = 'https://cdn.jsdelivr.net/npm/dynamsoft-barcode-reader-bundle@11.6.3200/dist/dbr.bundle.js';

    /* Same two keys as the other hosted Codepool demos: the domain-bound one
       for dynamsoft.com, the trial one everywhere else. Verified by
       demos/_scripts/check-license-keys.js — do not retype by hand. */
    var CODEPOOL_LICENSE_KEY = 'DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAwLTEwMTY0ODQ5MCIsIm1haW5TZXJ2ZXJVUkwiOiJodHRwczovL21sdHMuZHluYW1zb2Z0LmNvbS8iLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMCIsInN0YW5kYnlTZXJ2ZXJVUkwiOiJodHRwczovL3NsdHMuZHluYW1zb2Z0LmNvbS8iLCJjaGVja0NvZGUiOjE0MDA4MDY1Mjl9';
    var TRIAL_LICENSE_KEY = 'DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==';

    var ICONS = {
        scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="8" x2="7" y2="16"/><line x1="10.5" y1="8" x2="10.5" y2="16"/><line x1="13.5" y1="8" x2="13.5" y2="16"/><line x1="17" y1="8" x2="17" y2="16"/></svg>',
        copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
        save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>'
    };

    var menuEl = null;
    var menuRaster = null;
    var scanState = null;
    var dbrLoader = null;
    var dbrPromise = null;
    var dbrReady = false;
    var lastScan = null;
    var toastTimer = null;
    var panelTimer = null;

    function flash(text) {
        var t = document.getElementById('toast');
        if (!t) {
            t = node('div', 'toast');
            t.id = 'toast';
            document.body.appendChild(t);
        }
        t.textContent = text;
        t.classList.add('is-on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { t.classList.remove('is-on'); }, 2400);
    }

    function downloadBlob(blob, name) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text);
        }
        return new Promise(function (resolve, reject) {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.top = '-1000px';
            document.body.appendChild(ta);
            ta.select();
            var ok = false;
            try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            ta.remove();
            if (ok) { resolve(); } else { reject(new Error('copy is not available')); }
        });
    }

    /* Is there a page on screen at all (whatever its type)? Every viewer puts
       its output inside .stage-center, including the HTML ones. */
    function stageReady() {
        return !!el.stage.querySelector('.stage-center');
    }

    /* The page as pixels, when it already is pixels: an image, a rendered PDF /
       TIFF / YUV canvas, or the current frame of a video. Word, Excel,
       PowerPoint and text have no pixel backing store — they are captured with
       html2canvas at scan time instead. */
    function rasterOfStage() {
        var video = el.stage.querySelector('video');
        if (video && video.videoWidth) {
            return { node: video, w: video.videoWidth, h: video.videoHeight, kind: 'video' };
        }
        var img = el.stage.querySelector('.stage-rotor img');
        if (img && img.naturalWidth && img.getBoundingClientRect().width) {
            return { node: img, w: img.naturalWidth, h: img.naturalHeight, kind: 'image' };
        }
        var canvas = el.stage.querySelector('canvas.page-canvas');
        if (canvas && canvas.width && canvas.getBoundingClientRect().width) {
            return { node: canvas, w: canvas.width, h: canvas.height, kind: 'canvas' };
        }
        return null;
    }

    /* Where the picture actually is on screen. For <video> the element box can
       be larger than the frame (object-fit keeps the aspect ratio), and the
       letterbox is not part of the picture — mapping the selection against the
       element box would offset every crop by half the letterbox. */
    function contentRect(target) {
        var box = target.node.getBoundingClientRect();
        if (target.kind !== 'video') {
            return { left: box.left, top: box.top, width: box.width, height: box.height,
                right: box.right, bottom: box.bottom };
        }
        var vw = target.node.videoWidth;
        var vh = target.node.videoHeight;
        if (!vw || !vh) {
            return { left: box.left, top: box.top, width: box.width, height: box.height,
                right: box.right, bottom: box.bottom };
        }
        var scale = Math.min(box.width / vw, box.height / vh);
        var w = vw * scale;
        var h = vh * scale;
        var left = box.left + (box.width - w) / 2;
        var top = box.top + (box.height - h) / 2;
        return { left: left, top: top, width: w, height: h, right: left + w, bottom: top + h };
    }

    function loadHtml2Canvas() {
        if (window.html2canvas) { return Promise.resolve(); }
        return loadScript('lib/html2canvas.min.js');
    }

    /* Rasterise what is on screen. Used for the DOM-rendered formats, and as
       the fallback when a selection reaches outside the picture.

       docx-preview and the PPTX renderer fit the page with CSS `zoom`, which
       html2canvas applies to positions but not to text metrics — the capture
       comes out with letters piled on top of each other. Swapping zoom for an
       equivalent transform inside the clone fixes the metrics and keeps the
       page where it was on screen (origin at the top centre, because the page
       is centred inside the wrapper). */
    function captureStage() {
        return loadHtml2Canvas().then(function () {
            var scale = Math.min(window.devicePixelRatio || 1, 2);
            return window.html2canvas(el.stage, {
                scale: scale,
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true,
                scrollX: 0,
                scrollY: 0,
                windowWidth: document.documentElement.clientWidth,
                windowHeight: document.documentElement.clientHeight,
                onclone: function (doc) {
                    var zoomed = doc.querySelectorAll('.doc-host');
                    for (var i = 0; i < zoomed.length; i++) {
                        var h = zoomed[i];
                        var z = parseFloat(h.style.zoom) || parseFloat(getComputedStyle(h).zoom) || 1;
                        h.style.zoom = '1';
                        h.style.transformOrigin = 'top center';
                        h.style.transform = 'scale(' + z + ')';
                    }
                }
            }).then(function (shot) {
                return { canvas: shot, scale: scale };
            });
        });
    }

    function menuItem(icon, label, sub, primary) {
        var b = node('button', 'ctx-item' + (primary ? ' is-primary' : ''));
        b.type = 'button';
        b.setAttribute('role', 'menuitem');
        var i = node('span', 'ctx-icon');
        i.innerHTML = icon;
        var l = node('span', 'ctx-label');
        l.appendChild(node('span', null, label));
        if (sub) { l.appendChild(node('small', null, sub)); }
        b.appendChild(i);
        b.appendChild(l);
        return b;
    }

    function ensureMenu() {
        if (menuEl) { return menuEl; }
        menuEl = node('div', 'ctx-menu');
        menuEl.hidden = true;
        menuEl.setAttribute('role', 'menu');

        var scanBtn = menuItem(ICONS.scan, 'Scan barcodes here',
            'Drag a box, then read the region', true);
        scanBtn.addEventListener('click', function () { startScan(); });

        var copyBtn = menuItem(ICONS.copy, 'Copy image', 'This page as PNG');
        copyBtn.addEventListener('click', function () { closeMenu(); copyRaster(); });

        var saveBtn = menuItem(ICONS.save, 'Save image', 'This page as PNG');
        saveBtn.addEventListener('click', function () { closeMenu(); saveRaster(); });

        menuEl.appendChild(scanBtn);
        menuEl.appendChild(node('div', 'ctx-sep'));
        menuEl.appendChild(copyBtn);
        menuEl.appendChild(saveBtn);
        document.body.appendChild(menuEl);
        return menuEl;
    }

    function openMenu(x, y) {
        if (!stageReady()) { return; }
        var m = ensureMenu();
        menuRaster = rasterOfStage();
        m.hidden = false;
        var r = m.getBoundingClientRect();
        m.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
        m.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
    }

    function closeMenu() {
        if (menuEl) { menuEl.hidden = true; }
    }

    function rasterCanvas(raster) {
        var c = document.createElement('canvas');
        c.width = raster.w;
        c.height = raster.h;
        c.getContext('2d').drawImage(raster.node, 0, 0);
        return c;
    }

    /* The page as a single PNG: native resolution when it is already pixels,
       otherwise a rasterisation of what is on screen. */
    function pageImage() {
        var raster = menuRaster || rasterOfStage();
        if (raster) {
            var c = document.createElement('canvas');
            c.width = raster.w;
            c.height = raster.h;
            c.getContext('2d').drawImage(raster.node, 0, 0);
            return Promise.resolve(c);
        }
        return captureStage().then(function (shot) { return shot.canvas; });
    }

    function saveRaster() {
        pageImage().then(function (canvas) {
            canvas.toBlob(function (blob) {
                downloadBlob(blob, fileStem(active ? active.name : 'page') + '.png');
            }, 'image/png');
        }).catch(function () {
            flash('Could not render this page');
        });
        A.action('save_page_image', { kind: active ? active.kind : '' });
    }

    function copyRaster() {
        if (!navigator.clipboard || !window.ClipboardItem) {
            flash('This browser cannot copy images — use Save image');
            return;
        }
        pageImage().then(function (canvas) {
            return new Promise(function (resolve) {
                canvas.toBlob(resolve, 'image/png');
            });
        }).then(function (blob) {
            return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        }).then(function () {
            flash('Page copied as PNG');
        }).catch(function () {
            flash('Copy failed — use Save image instead');
        });
        A.action('copy_page_image', { kind: active ? active.kind : '' });
    }

    /* --- region selection -------------------------------------------- */

    function cancelScan() {
        if (!scanState) { return; }
        scanState.layer.remove();
        document.body.style.overflow = '';
        scanState = null;
    }

    function startScan() {
        closeMenu();
        if (!stageReady()) {
            flash('Open a file first');
            return;
        }
        var raster = rasterOfStage();
        cancelScan();
        /* Rotation would make screen→pixel mapping a matrix problem for no
           benefit; the user is about to drag a box, so show the page upright. */
        if (rotation % 360 !== 0) {
            rotation = 0;
            if (viewer && viewer.setZoom) { viewer.setZoom(); }
        }

        var box = el.stage.getBoundingClientRect();
        var layer = node('div', 'scan-layer');
        layer.style.left = box.left + 'px';
        layer.style.top = box.top + 'px';
        layer.style.width = box.width + 'px';
        layer.style.height = box.height + 'px';

        var rect = node('div', 'scan-rect');
        rect.hidden = true;
        ['nw', 'ne', 'sw', 'se'].forEach(function (dir) {
            var h = node('div', 'scan-handle');
            h.setAttribute('data-dir', dir);
            rect.appendChild(h);
        });

        var hint = node('div', 'scan-hint', 'Drag a box around the barcode · Esc to cancel');

        var bar = node('div', 'scan-bar');
        bar.hidden = true;
        var sizeHint = node('span', 'scan-bar-hint', '');
        var cancelBtn = node('button', 'btn btn-secondary', 'Cancel');
        cancelBtn.type = 'button';
        cancelBtn.addEventListener('click', cancelScan);
        var readBtn = node('button', 'btn btn-primary', 'Read barcode');
        readBtn.type = 'button';
        bar.appendChild(sizeHint);
        bar.appendChild(cancelBtn);
        bar.appendChild(readBtn);

        layer.appendChild(rect);
        layer.appendChild(hint);
        layer.appendChild(bar);
        document.body.appendChild(layer);
        document.body.style.overflow = 'hidden';

        scanState = {
            raster: raster,
            box: box,
            layer: layer,
            rect: rect,
            hint: hint,
            bar: bar,
            sizeHint: sizeHint,
            state: { x: 0, y: 0, w: 0, h: 0 },
            drag: null
        };

        readBtn.addEventListener('click', readRegion);
        layer.addEventListener('pointerdown', onScanDown);
        layer.addEventListener('pointermove', onScanMove);
        layer.addEventListener('pointerup', onScanUp);
        layer.addEventListener('pointercancel', onScanUp);
        layer.addEventListener('wheel', function (e) { e.preventDefault(); }, { passive: false });

        A.action('scan_region_start', { kind: active ? active.kind : '' });
    }

    function localPoint(e) {
        var box = scanState.box;
        return { x: e.clientX - box.left, y: e.clientY - box.top };
    }

    function insideSelection(p) {
        var s = scanState.state;
        return p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h;
    }

    function onScanDown(e) {
        if (e.button !== 0 || !scanState) { return; }
        /* The floating Read/Cancel bar sits inside the layer; without this the
           pointerdown would start a new selection and hide the bar before the
           click ever reached the button. */
        if (e.target.closest && e.target.closest('.scan-bar')) { return; }
        var p = localPoint(e);
        var dir = e.target && e.target.getAttribute ? e.target.getAttribute('data-dir') : null;
        var s = scanState;
        s.drag = {
            dir: dir,
            sx: p.x,
            sy: p.y,
            orig: { x: s.state.x, y: s.state.y, w: s.state.w, h: s.state.h },
            mode: dir ? 'resize' : (s.rect.hidden ? 'draw' : (insideSelection(p) ? 'move' : 'draw'))
        };
        if (s.drag.mode === 'draw') {
            s.state = { x: p.x, y: p.y, w: 0, h: 0 };
            s.rect.hidden = false;
            s.bar.hidden = true;
            s.hint.hidden = true;
        }
        try { s.layer.setPointerCapture(e.pointerId); } catch (err) { /* not fatal */ }
        e.preventDefault();
    }

    function onScanMove(e) {
        var s = scanState;
        if (!s || !s.drag) { return; }
        var p = localPoint(e);
        var st = s.state;
        var W = s.box.width;
        var H = s.box.height;

        if (s.drag.mode === 'draw') {
            st.x = Math.max(0, Math.min(s.drag.sx, p.x));
            st.y = Math.max(0, Math.min(s.drag.sy, p.y));
            st.w = Math.min(W - st.x, Math.abs(p.x - s.drag.sx));
            st.h = Math.min(H - st.y, Math.abs(p.y - s.drag.sy));
        } else if (s.drag.mode === 'move') {
            st.x = Math.max(0, Math.min(W - st.w, s.drag.orig.x + (p.x - s.drag.sx)));
            st.y = Math.max(0, Math.min(H - st.h, s.drag.orig.y + (p.y - s.drag.sy)));
        } else if (s.drag.mode === 'resize') {
            var o = s.drag.orig;
            var left = o.x, top = o.y, right = o.x + o.w, bottom = o.y + o.h;
            if (s.drag.dir.indexOf('w') >= 0) { left = Math.max(0, Math.min(p.x, W)); }
            if (s.drag.dir.indexOf('e') >= 0) { right = Math.max(0, Math.min(p.x, W)); }
            if (s.drag.dir.indexOf('n') >= 0) { top = Math.max(0, Math.min(p.y, H)); }
            if (s.drag.dir.indexOf('s') >= 0) { bottom = Math.max(0, Math.min(p.y, H)); }
            st.x = Math.min(left, right);
            st.w = Math.abs(right - left);
            st.y = Math.min(top, bottom);
            st.h = Math.abs(bottom - top);
        }
        paintScan();
    }

    function onScanUp() {
        var s = scanState;
        if (!s || !s.drag) { return; }
        s.drag = null;
        if (s.state.w < 12 || s.state.h < 12) {
            s.rect.hidden = true;
            s.bar.hidden = true;
            s.hint.hidden = false;
            return;
        }
        paintScan();
    }

    function paintScan() {
        var s = scanState;
        if (!s) { return; }
        var st = s.state;
        s.rect.style.left = st.x + 'px';
        s.rect.style.top = st.y + 'px';
        s.rect.style.width = st.w + 'px';
        s.rect.style.height = st.h + 'px';

        /* Show the size in the units that matter: source pixels for a picture,
           screen pixels for a rasterised page. */
        if (s.raster) {
            var cr = contentRect(s.raster);
            var kx = s.raster.w / cr.width;
            var ky = s.raster.h / cr.height;
            s.sizeHint.textContent = Math.round(st.w * kx) + ' × ' + Math.round(st.h * ky) + ' px';
        } else {
            s.sizeHint.textContent = Math.round(st.w) + ' × ' + Math.round(st.h) + ' px on screen';
        }

        var below = st.y + st.h + 54 < s.box.height;
        s.bar.style.left = Math.max(8, Math.min(st.x, s.box.width - 300)) + 'px';
        s.bar.style.top = (below ? st.y + st.h + 10 : Math.max(8, st.y - 54)) + 'px';
        s.bar.hidden = false;
    }

    /* --- decode -------------------------------------------------------- */

    function loadDbr() {
        if (window.Dynamsoft && window.Dynamsoft.License) { return Promise.resolve(); }
        if (dbrLoader) { return dbrLoader; }
        dbrLoader = new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.async = true;
            s.src = DBR_BUNDLE;
            s.onload = function () {
                if (window.Dynamsoft) { resolve(); } else { reject(new Error('The reader did not initialize.')); }
            };
            s.onerror = function () {
                dbrLoader = null;
                reject(new Error('The reader could not be downloaded. Check the network and try again.'));
            };
            document.head.appendChild(s);
        });
        return dbrLoader;
    }

    function reader() {
        if (dbrPromise) { return dbrPromise; }
        dbrPromise = loadDbr().then(function () {
            var host = location.hostname.toLowerCase();
            var bound = host === 'dynamsoft.com' || host.endsWith('.dynamsoft.com');
            var custom = null;
            try {
                custom = new URLSearchParams(location.search).get('license') ||
                    localStorage.getItem('dy-demo-license');
            } catch (e) { custom = null; }
            if (!bound && !custom) {
                A.action('license_fallback', { host: host, secure: window.isSecureContext });
            }
            var key = custom || (bound ? CODEPOOL_LICENSE_KEY : TRIAL_LICENSE_KEY);

            window.Dynamsoft.Core.CoreModule.engineResourcePaths.rootDirectory = 'https://cdn.jsdelivr.net/npm/';
            return window.Dynamsoft.License.LicenseManager.initLicense(key, true).then(function () {
                return window.Dynamsoft.Core.CoreModule.loadWasm(['DBR']);
            }).then(function () {
                return window.Dynamsoft.CVR.CaptureVisionRouter.createInstance();
            });
        }).catch(function (err) {
            dbrPromise = null;
            throw err;
        });
        return dbrPromise;
    }

    function intersectRect(a, b) {
        var left = Math.max(a.left, b.left);
        var top = Math.max(a.top, b.top);
        var right = Math.min(a.left + a.width, b.left + b.width);
        var bottom = Math.min(a.top + a.height, b.top + b.height);
        if (right - left < 4 || bottom - top < 4) { return null; }
        return { left: left, top: top, width: right - left, height: bottom - top };
    }

    /* Crop the selection out of the page. A picture (image, PDF/TIFF/YUV canvas,
       video frame) contributes its own pixels at native resolution; anything
       else — Word, Excel, PowerPoint, text — is rasterised first. */
    function cropSelection(sel, target) {
        if (target) {
            var cr = contentRect(target);
            var inter = intersectRect(sel, cr);
            if (inter) {
                var kx = target.w / cr.width;
                var ky = target.h / cr.height;
                var sx = Math.round((inter.left - cr.left) * kx);
                var sy = Math.round((inter.top - cr.top) * ky);
                var sw = Math.max(1, Math.round(inter.width * kx));
                var sh = Math.max(1, Math.round(inter.height * ky));

                /* A hand-drawn box usually cuts the quiet zone. Widen it a
                   little; the crop is what gets annotated, so the overlay stays
                   honest. */
                var pad = Math.round(Math.min(sw, sh) * 0.06);
                var px = Math.max(0, sx - pad);
                var py = Math.max(0, sy - pad);
                var pw = Math.min(target.w - px, sw + pad * 2);
                var ph = Math.min(target.h - py, sh + pad * 2);

                var crop = document.createElement('canvas');
                crop.width = pw;
                crop.height = ph;
                crop.getContext('2d').drawImage(target.node, px, py, pw, ph, 0, 0, pw, ph);
                return Promise.resolve({ canvas: crop, x: px, y: py, w: pw, h: ph });
            }
        }
        return captureDomRegion(sel);
    }

    function captureDomRegion(sel) {
        var box = el.stage.getBoundingClientRect();
        return captureStage().then(function (shot) {
            /* html2canvas renders the element's *visible* box, so the selection
               maps straight onto the output — no scroll compensation. (Adding
               scrollTop here pushed the crop past the bottom of the image,
               which is how this was found: a blank result on a scrolled page.) */
            var k = shot.scale;
            var x = Math.round((sel.left - box.left) * k);
            var y = Math.round((sel.top - box.top) * k);
            var w = Math.max(1, Math.round(sel.width * k));
            var h = Math.max(1, Math.round(sel.height * k));
            var canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(shot.canvas, x, y, w, h, 0, 0, w, h);
            return { canvas: canvas, x: x, y: y, w: w, h: h };
        });
    }

    function readRegion() {
        if (!scanState) { return; }
        var st = scanState.state;
        var sel = {
            left: scanState.box.left + st.x,
            top: scanState.box.top + st.y,
            width: st.w,
            height: st.h
        };
        var target = scanState.raster;
        var file = active ? active.name : '';
        cancelScan();
        openPanel();
        scanStatus(target ? 'Reading…' : 'Rendering the page…');
        A.start('barcode_scan', target ? 'image' : 'document');

        cropSelection(sel, target).then(function (crop) {
            if (!crop) { throw new Error('The selection is outside the page.'); }
            scanStatus(dbrReady ? 'Reading…' : 'Loading Dynamsoft Barcode Reader… (first run only)');
            return reader().then(function (router) {
                dbrReady = true;
                scanStatus('Reading…');
                var started = performance.now();
                var data = crop.canvas.getContext('2d').getImageData(0, 0, crop.w, crop.h);
                /* capture() may detach its input buffer, so hand it a copy. */
                return router.capture({
                    bytes: new Uint8Array(data.data),
                    width: crop.w,
                    height: crop.h,
                    stride: crop.w * 4,
                    format: 10
                }, 'ReadBarcodes_Default').then(function (result) {
                    if (result.errorCode) {
                        throw new Error('Reader error ' + result.errorCode + ': ' + (result.errorString || 'decode failed'));
                    }
                    var items = (result.items || []).filter(function (i) { return i.type === 2; }).map(function (i) {
                        return {
                            text: i.text || '',
                        format: i.formatString || 'Unknown',
                        points: ((i.location && i.location.points) || []).map(function (p) {
                            return { x: p.x, y: p.y };
                        }),
                        moduleSize: typeof i.moduleSize === 'number' ? i.moduleSize : null,
                        angle: typeof i.angle === 'number' ? i.angle : null
                    };
                });
                return { items: items, ms: Math.round(performance.now() - started) };
                });
            }).then(function (out) {
                lastScan = {
                    file: file,
                    region: { x: crop.x, y: crop.y, width: crop.w, height: crop.h },
                    items: out.items,
                    ms: out.ms,
                    canvas: annotateCrop(crop.canvas, out.items)
                };
                renderScan();
                if (out.items.length) {
                    A.success('barcode_scan', 'image', { barcode_count: out.items.length });
                } else {
                    A.fail('barcode_scan', 'image');
                }
            });
        }).catch(function (err) {
            lastScan = null;
            scanError(err);
            A.error('barcode_scan_failed', (err && err.message) || 'unknown');
        });
    }

    function annotateCrop(crop, items) {
        var k = Math.min(1, 760 / crop.width);
        var out = document.createElement('canvas');
        out.width = Math.max(1, Math.round(crop.width * k));
        out.height = Math.max(1, Math.round(crop.height * k));
        var ctx = out.getContext('2d');
        ctx.drawImage(crop, 0, 0, out.width, out.height);

        var font = Math.max(11, Math.round(out.width / 34));
        ctx.lineWidth = Math.max(2, Math.round(out.width / 260));
        ctx.font = '600 ' + font + 'px "Open Sans", Arial, sans-serif';
        ctx.textBaseline = 'alphabetic';

        items.forEach(function (item, index) {
            var pts = item.points || [];
            if (!pts.length) { return; }
            var xs = pts.map(function (p) { return p.x * k; });
            var ys = pts.map(function (p) { return p.y * k; });
            var minX = Math.min.apply(null, xs);
            var maxX = Math.max.apply(null, xs);
            var minY = Math.min.apply(null, ys);
            var maxY = Math.max.apply(null, ys);

            ctx.strokeStyle = '#fe8e14';
            ctx.fillStyle = 'rgba(254, 142, 20, 0.12)';
            ctx.beginPath();
            xs.forEach(function (x, i) {
                if (i) { ctx.lineTo(x, ys[i]); } else { ctx.moveTo(x, ys[i]); }
            });
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            var label = (index + 1) + '  ' + item.format;
            var textW = ctx.measureText(label).width;
            var boxH = font + 8;
            var labelY = minY - boxH - 2;
            if (labelY < 0) { labelY = minY + 2; }
            var labelX = Math.max(0, Math.min(minX, out.width - textW - 12));
            ctx.fillStyle = 'rgba(22, 22, 24, 0.86)';
            ctx.fillRect(labelX, labelY, textW + 12, boxH);
            ctx.fillStyle = '#fff';
            ctx.fillText(label, labelX + 6, labelY + font + 1);

            item._box = { x: Math.round(minX), y: Math.round(minY), w: Math.round(maxX - minX), h: Math.round(maxY - minY) };
        });
        return out;
    }

    /* --- panel ---------------------------------------------------------- */

    function openPanel() {
        if (!el.scanPanel) { return; }
        clearTimeout(panelTimer);
        el.scanPanel.hidden = false;
        requestAnimationFrame(function () {
            el.scanPanel.classList.add('is-open');
        });
    }

    function closePanel() {
        if (!el.scanPanel) { return; }
        el.scanPanel.classList.remove('is-open');
        panelTimer = setTimeout(function () { el.scanPanel.hidden = true; }, 200);
    }

    function scanStatus(text) {
        el.scanBody.innerHTML = '';
        var row = node('div', 'scan-status');
        row.appendChild(node('div', 'spinner'));
        row.appendChild(node('span', null, text));
        el.scanBody.appendChild(row);
    }

    function scanError(err) {
        el.scanBody.innerHTML = '';
        var box = node('div', 'scan-empty');
        box.appendChild(node('strong', null, 'The reader could not run.'));
        box.appendChild(document.createTextNode(' ' + ((err && err.message) || 'Unknown error') +
            ' The page itself keeps working — only decoding needs the reader.'));
        el.scanBody.appendChild(box);
        setResultActions(false);
    }

    function setResultActions(on) {
        ['scanCopy', 'scanSavePng', 'scanSaveJson'].forEach(function (key) {
            if (el[key]) { el[key].disabled = !on; }
        });
    }

    function renderScan() {
        var s = lastScan;
        el.scanBody.innerHTML = '';
        setResultActions(!!(s && s.items.length));

        if (!s) { return; }

        var figure = document.createElement('figure');
        figure.className = 'scan-figure';
        figure.appendChild(s.canvas);
        var cap = node('figcaption');
        cap.textContent = (s.file || 'page') + ' · region ' + s.region.width + ' × ' + s.region.height +
            ' px at ' + s.region.x + ',' + s.region.y + ' · ' + s.ms + ' ms';
        figure.appendChild(cap);
        el.scanBody.appendChild(figure);

        if (!s.items.length) {
            var empty = node('div', 'scan-empty');
            empty.appendChild(node('strong', null, 'No barcode decoded in this area.'));
            empty.appendChild(document.createTextNode(' Try a tighter box around the symbol, include its ' +
                'quiet zone, and avoid glare. A blurry or very small symbol may need a different capture.'));
            el.scanBody.appendChild(empty);
            return;
        }

        s.items.forEach(function (item, index) {
            var card = node('div', 'scan-result');
            var head = node('div', 'scan-result-head');
            head.appendChild(node('span', 'fmt', item.format));
            head.appendChild(node('span', 'idx', '#' + (index + 1)));
            card.appendChild(head);
            card.appendChild(node('p', 'txt', item.text || '(empty payload)'));
            var meta = [];
            if (item._box) { meta.push(item._box.w + ' × ' + item._box.h + ' px'); }
            if (item.moduleSize) { meta.push('module ' + item.moduleSize.toFixed(1)); }
            if (item.angle) { meta.push('angle ' + Math.round(item.angle) + '°'); }
            if (meta.length) { card.appendChild(node('p', 'meta', meta.join(' · '))); }
            el.scanBody.appendChild(card);
        });
    }

    function scanPayload() {
        if (!lastScan) { return null; }
        return {
            file: lastScan.file,
            region: lastScan.region,
            results: lastScan.items.map(function (item) {
                return {
                    format: item.format,
                    text: item.text,
                    points: item.points,
                    moduleSize: item.moduleSize,
                    angle: item.angle
                };
            })
        };
    }

    function scanJsonText() {
        var payload = scanPayload();
        return payload ? JSON.stringify(payload, null, 2) : '';
    }

    function fileStem(name) {
        var base = name || 'scan';
        var dot = base.lastIndexOf('.');
        return (dot > 0 ? base.slice(0, dot) : base).replace(/[^\w.-]+/g, '-');
    }

    /* ------------------------------------------------------------------ */
    /* Events                                                              */
    /* ------------------------------------------------------------------ */

    /* Context menu inside the preview. Only raster pages offer it: an Office
       document is a DOM tree, and there is no honest pixel crop to decode. */
    /* Context menu for whatever page is open. The selection is a screenshot of
       that area, so the menu no longer cares which format produced it. Links
       inside a document keep the browser's own menu. */
    el.stage.addEventListener('contextmenu', function (e) {
        if (!stageReady()) { return; }
        if (e.target.closest && e.target.closest('a[href]')) { return; }
        e.preventDefault();
        openMenu(e.clientX, e.clientY);
    });

    document.addEventListener('pointerdown', function (e) {
        if (menuEl && !menuEl.hidden && !menuEl.contains(e.target)) { closeMenu(); }
    }, true);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);

    if (el.scanClose) { el.scanClose.addEventListener('click', closePanel); }

    if (el.scanCopy) {
        el.scanCopy.addEventListener('click', function () {
            copyText(scanJsonText()).then(function () {
                flash('Results copied as JSON');
            }).catch(function () {
                flash('Copy failed — download the JSON instead');
            });
        });
    }

    if (el.scanSavePng) {
        el.scanSavePng.addEventListener('click', function () {
            if (!lastScan) { return; }
            lastScan.canvas.toBlob(function (blob) {
                downloadBlob(blob, fileStem(lastScan.file) + '-scan.png');
            }, 'image/png');
        });
    }

    if (el.scanSaveJson) {
        el.scanSaveJson.addEventListener('click', function () {
            if (!lastScan) { return; }
            downloadBlob(new Blob([scanJsonText()], { type: 'application/json' }),
                fileStem(lastScan.file) + '-scan.json');
        });
    }

    el.dropzone.addEventListener('click', function () { el.input.click(); });
    el.dropzone.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            el.input.click();
        }
    });
    el.input.addEventListener('change', function () {
        if (el.input.files && el.input.files.length) {
            addFiles(el.input.files);
            el.input.value = '';
        }
    });

    el.clearAll.addEventListener('click', function () {
        entries.forEach(function (e) { e.buffer = null; });
        entries = [];
        active = null;
        viewer = null;
        lastScan = null;
        closePanel();
        cancelScan();
        closeMenu();
        el.workspace.hidden = true;
        el.dropCard.classList.remove('is-compact');
        clearStage();
        el.stage.appendChild(stageNote('No file selected.',
            'Drop a file anywhere on this page, or use one of the samples above.'));
        el.fileList.innerHTML = '';
        el.infoBody.innerHTML = '<p class="info-empty">Details appear here once a file is opened.</p>';
        el.infoKind.textContent = '—';
        renderFileList();
        A.action('clear_all');
    });

    /* Pager + zoom */
    el.pagePrev.addEventListener('click', function () {
        if (!viewer || viewer.page <= 1) { return; }
        viewer.show(viewer.page - 1);
        updatePager();
    });
    el.pageNext.addEventListener('click', function () {
        if (!viewer || viewer.page >= viewer.pages) { return; }
        viewer.show(viewer.page + 1);
        updatePager();
    });
    el.zoomIn.addEventListener('click', function () {
        zoom = Math.min(4, Math.round(zoom * 1.25 * 100) / 100);
        if (viewer && viewer.setZoom) { viewer.setZoom(); }
        updateZoomReadout();
    });
    el.zoomOut.addEventListener('click', function () {
        zoom = Math.max(0.25, Math.round(zoom / 1.25 * 100) / 100);
        if (viewer && viewer.setZoom) { viewer.setZoom(); }
        updateZoomReadout();
    });
    el.zoomFit.addEventListener('click', function () {
        zoom = 1;
        if (viewer && viewer.setZoom) { viewer.setZoom(); }
        updateZoomReadout();
    });
    el.rotate.addEventListener('click', function () {
        if (viewer && viewer.rotate) { viewer.rotate(); }
    });

    /* Drag and drop, page-wide. A depth counter keeps the overlay from
       flickering as the pointer crosses child elements. */
    window.addEventListener('dragenter', function (e) {
        if (!e.dataTransfer || Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') < 0) { return; }
        e.preventDefault();
        dragDepth++;
        el.pageDrop.classList.add('is-on');
        el.dropzone.classList.add('is-over');
    });
    window.addEventListener('dragover', function (e) {
        if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        }
    });
    window.addEventListener('dragleave', function () {
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) {
            el.pageDrop.classList.remove('is-on');
            el.dropzone.classList.remove('is-over');
        }
    });
    window.addEventListener('drop', function (e) {
        if (!e.dataTransfer) { return; }
        e.preventDefault();
        dragDepth = 0;
        el.pageDrop.classList.remove('is-on');
        el.dropzone.classList.remove('is-over');
        if (e.dataTransfer.files && e.dataTransfer.files.length) {
            addFiles(e.dataTransfer.files);
        }
    });

    /* Ctrl+V: a screenshot on the clipboard becomes a file. */
    window.addEventListener('paste', function (e) {
        if (!e.clipboardData) { return; }
        var files = [];
        for (var i = 0; i < e.clipboardData.items.length; i++) {
            var item = e.clipboardData.items[i];
            if (item.kind === 'file') {
                var f = item.getAsFile();
                if (f) {
                    if (!f.name) {
                        f = new File([f], 'clipboard-' + Date.now() + '.' + (f.type.split('/')[1] || 'png'), { type: f.type });
                    }
                    files.push(f);
                }
            }
        }
        if (files.length) {
            addFiles(files);
            A.action('paste_image');
        }
    });

    /* Samples */
    if (document.location.protocol === 'file:') {
        el.sampleRow.querySelectorAll('.chip').forEach(function (chip) {
            chip.disabled = true;
            chip.title = 'Samples need an http(s) server — run python -m http.server in this folder.';
        });
    }
    el.sampleRow.addEventListener('click', function (e) {
        var chip = e.target.closest ? e.target.closest('.chip') : null;
        if (!chip || chip.disabled) { return; }
        var name = chip.getAttribute('data-sample');
        var label = chip.textContent;
        chip.disabled = true;
        chip.textContent = 'Loading…';
        fetch('samples/' + name + '?v=' + ASSET_V).then(function (r) {
            if (!r.ok) { throw new Error('HTTP ' + r.status); }
            return r.blob();
        }).then(function (blob) {
            var file = new File([blob], name, { type: blob.type || MIME_BY_EXT[extOf(name)] || '' });
            addFiles([file]);
            A.action('sample_load', { sample: name });
        }).catch(function (err) {
            /* Leave the failed chip clickable: the usual cause is a transient
               network or server state, and a reload should not be required. */
            chip.textContent = 'Retry';
            chip.title = name + ' — ' + ((err && err.message) || 'load failed') + '. Click to try again.';
        }).then(function () {
            chip.disabled = false;
            if (chip.textContent === 'Loading…') { chip.textContent = label; }
        });
    });

    /* Keyboard shortcuts that do not fight the browser: -/+ zoom, arrows for
       pages only when the focus is not in a field. */
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            if (menuEl && !menuEl.hidden) { closeMenu(); return; }
            if (scanState) { cancelScan(); return; }
            if (el.scanPanel && !el.scanPanel.hidden) { closePanel(); }
            return;
        }
        if (scanState) { return; }   /* modal-ish: do not page the document behind the box */
        var tag = (e.target && e.target.tagName) || '';
        if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag)) { return; }
        if (e.key === '-' || e.key === '_') { el.zoomOut.click(); }
        else if (e.key === '+' || e.key === '=') { el.zoomIn.click(); }
        else if (e.key === 'ArrowLeft' && viewer && viewer.pages > 1) { el.pagePrev.click(); }
        else if (e.key === 'ArrowRight' && viewer && viewer.pages > 1) { el.pageNext.click(); }
    });

    window.addEventListener('beforeunload', function () {
        objectUrls.forEach(function (u) { URL.revokeObjectURL(u); });
        objectUrls = [];
    });
})();
