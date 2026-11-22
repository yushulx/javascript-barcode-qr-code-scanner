/*
 * app.js — the interactive structure diagram.
 *
 * The whole page is one idea: encode a symbol, then let the reader inspect the
 * exact part of the module sequence that each structural region owns. Nothing
 * on screen is transcribed by hand — the module counts, the character tables,
 * the check-value arithmetic and the QR block layout are all read back out of
 * the same encoder result that drew the picture, so the explanation can never
 * disagree with the drawing.
 *
 * Structure of this file:
 *   1. Symbology registry and state
 *   2. Small helpers (DOM, formatting)
 *   3. Encoding — one entry point that returns a normalised "symbol" object
 *   4. SVG rendering — linear symbols and the QR grid
 *   5. Interaction — hover, selection, keyboard, module readout
 *   6. Panels — region table, character table, check arithmetic, QR details
 */
(function () {
    'use strict';

    /* ---------------------------------------------------------------------
       1. Symbology registry and state
       --------------------------------------------------------------------- */

    /* The tabs. `kind` drives the layout choice: a linear symbol is read left
       to right along one axis, a grid symbol is read as a matrix. */
    var SYMBOLOGIES = [
        { id: 'ean13', label: 'EAN-13', kind: '1D' },
        { id: 'code128', label: 'Code 128', kind: '1D' },
        { id: 'code39', label: 'Code 39', kind: '1D' },
        { id: 'itf14', label: 'ITF-14', kind: '1D' },
        { id: 'qrcode', label: 'QR Code', kind: '2D' }
    ];

    var state = {
        symbology: 'ean13',
        value: '',
        ecLevel: 'M',
        symbol: null,
        selected: null,
        hovered: null,
        showModuleNumbers: false,
        showHumanReadable: true,
        /* geometry of the current drawing, used by the module readout */
        geometry: null
    };

    var els = {};

    /* ---------------------------------------------------------------------
       2. Small helpers
       --------------------------------------------------------------------- */

    function $(id) {
        return document.getElementById(id);
    }

    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) {
            node.className = className;
        }
        if (text != null) {
            node.textContent = text;
        }
        return node;
    }

    function svgEl(tag, attrs) {
        var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
        if (attrs) {
            for (var key in attrs) {
                if (Object.prototype.hasOwnProperty.call(attrs, key) && attrs[key] != null) {
                    node.setAttribute(key, attrs[key]);
                }
            }
        }
        return node;
    }

    /* Report a UI action to the shared analytics layer when it is present.
       The demos are loaded standalone too, so every call is guarded. */
    function track(name, extra) {
        try {
            if (window.DemoAnalytics && typeof window.DemoAnalytics.action === 'function') {
                window.DemoAnalytics.action(name, extra);
            }
        } catch (e) { /* analytics must never break the page */ }
    }

    function pluralize(count, singular, plural) {
        return count + ' ' + (count === 1 ? singular : (plural || singular + 's'));
    }

    /* A binary pattern with the 1s emphasised, for the character tables. */
    function patternMarkup(pattern) {
        var frag = document.createDocumentFragment();
        for (var i = 0; i < pattern.length; i++) {
            var ch = pattern.charAt(i);
            var span = el('span', ch === '1' ? 'bit-1' : 'bit-0', ch === '1' ? '\u2588' : '\u00b7');
            frag.appendChild(span);
        }
        return frag;
    }

    function patternText(pattern) {
        return pattern;
    }

    /* ---------------------------------------------------------------------
       3. Encoding
       --------------------------------------------------------------------- */

    /* Normalise a linear encoder result into the shape the renderer and the
       panels both consume. The linear encoders already return groups, roles and
       per-character detail; this only adds the derived numbers the UI needs. */
    function buildLinearSymbol(encoded) {
        var modules = encoded.modules;
        var quietLeft = encoded.quietZone.left;
        var quietRight = encoded.quietZone.right;
        var total = quietLeft + modules.length + quietRight;

        return {
            kind: '1D',
            symbology: encoded.symbology,
            symbologyLabel: encoded.symbologyLabel,
            displayText: encoded.displayText,
            payload: encoded.payload,
            notes: encoded.notes || [],
            check: encoded.check || null,
            quietZone: encoded.quietZone,
            humanReadable: encoded.humanReadable || [],
            bearerBar: !!encoded.bearerBar,
            codeSetSequence: encoded.codeSetSequence || null,
            modules: modules,
            groups: encoded.groups,
            /* The quiet zones are regions too: they are the parts of the symbol
               that a reader is most likely to trim off by accident. */
            quietRegions: [
                {
                    id: 'quiet-left',
                    title: 'Quiet zone (left)',
                    role: 'quiet',
                    modulesLabel: quietLeft + ' modules',
                    count: quietLeft,
                    description: 'Blank space before the first bar. The decoder needs it to recognise that the symbol starts here rather than that the print ran out.',
                    detail: 'EAN-13 specifies 11 modules on the left and 7 on the right; Code 128 and Code 39 specify at least 10 on both sides; ITF-14 follows GS1 at 10X. The quiet zone carries no data — but a symbol printed without one is not a smaller symbol, it is a broken one.',
                    stats: { modules: quietLeft + ' of ' + total + ' total', carries: 'nothing' }
                },
                {
                    id: 'quiet-right',
                    title: 'Quiet zone (right)',
                    role: 'quiet',
                    modulesLabel: quietRight + ' modules',
                    count: quietRight,
                    description: 'Blank space after the last bar, marking the end of the symbol.',
                    detail: 'The left and right quiet zones exist for the same reason at opposite ends of the scan line: a decoder works by measuring the distance from the last bar it has seen, so a bar with nothing after it cannot be measured.',
                    stats: { modules: quietRight + ' of ' + total + ' total', carries: 'nothing' }
                }
            ],
            totalModules: total,
            drawnModules: modules.length
        };
    }

    function buildQRSymbol(encoded) {
        var quiet = 4;
        return {
            kind: '2D',
            symbology: 'qrcode',
            symbologyLabel: 'QR Code',
            displayText: encoded.text,
            payload: encoded.text,
            notes: [
                'Version ' + encoded.version + ' (' + encoded.size + ' x ' + encoded.size + ' modules), ' +
                encoded.mode + ' mode, error-correction level ' + encoded.ecLevel + ', mask ' + encoded.mask + '.',
                encoded.summary.dataModules + ' data modules and ' + encoded.summary.ecModules +
                ' error-correction modules — ' + encoded.summary.errorCorrectionPercent.toFixed(1) +
                '% of the data area is redundancy, which is why a QR Code survives damage that would destroy a linear symbol.'
            ],
            check: null,
            quietZone: { left: quiet, right: quiet },
            humanReadable: [],
            bearerBar: false,
            qr: encoded,
            totalModules: encoded.size + quiet * 2,
            drawnModules: encoded.size
        };
    }

    /* ---------------------------------------------------------------------
       4. Rendering — linear symbols
       --------------------------------------------------------------------- */

    var LINEAR = {
        moduleW: 7,        /* px per module along the symbol */
        barH: 120,         /* symbol height in px */
        rulerH: 16,
        hriH: 20,
        bearerInset: 6,
        bearerThickness: 5,
        axisH: 14,
        padX: 6,
        minHeight: 190
    };

    /* Role colour lookup. The authoritative table lives in barcode-1d.js so the
       page and the encoders cannot disagree about what "guard" looks like. */
    var ROLE_INDEX = {};

    function roleMeta(roleId) {
        var roles = (window.Barcode1D && window.Barcode1D.ROLES) || {};
        if (roles[roleId]) {
            return roles[roleId];
        }
        return { id: roleId, label: roleId, description: '', color: '#999999' };
    }

    function colorFor(roleId, index) {
        if (window.Barcode1D && typeof window.Barcode1D.roleColor === 'function') {
            return window.Barcode1D.roleColor(roleId, index || 0);
        }
        return roleMeta(roleId).color;
    }

    function renderLinear(symbol) {
        var svg = clearSvg(els.diagram);

        var modules = symbol.modules;
        var total = symbol.totalModules;
        var quietLeft = symbol.quietZone.left;
        var quietRight = symbol.quietZone.right;

        var mw = LINEAR.moduleW;
        /* A very long symbol (a 40-character Code 128 is 475 modules) would be
           3300 px wide at 7 px per module. Keep the drawing to a sane maximum
           and let the stage scroll instead of shrinking the modules into an
           unreadable smear. */
        var maxWidth = 1180;
        if (total * mw > maxWidth) {
            mw = Math.max(2.2, maxWidth / total);
        }

        var rulerH = state.showModuleNumbers ? LINEAR.rulerH : 0;
        var hriH = state.showHumanReadable && symbol.humanReadable.length ? LINEAR.hriH : 0;
        /* The bearer bar needs room on all four sides: the label goes above it
           rather than below, where it would collide with the human-readable
           digits. */
        var bearerInset = symbol.bearerBar ? LINEAR.bearerInset : 0;
        var bearerLabelH = symbol.bearerBar ? 14 : 0;
        var top = rulerH + bearerLabelH + bearerInset + 4;

        var bodyW = total * mw;
        var width = bodyW + LINEAR.padX * 2;
        var height = top + LINEAR.barH + bearerInset + hriH + LINEAR.axisH + 8;

        var originX = LINEAR.padX;

        svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
        svg.setAttribute('width', width);
        svg.setAttribute('height', height);
        svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');

        /* Hatch pattern for the quiet zones: they are deliberately empty, and
           empty space that is actually part of the specification has to look
           like something rather than like a mistake. */
        var defs = svgEl('defs');
        var pattern = svgEl('pattern', {
            id: 'quietPattern', width: 6, height: 6,
            patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)'
        });
        pattern.appendChild(svgEl('rect', { width: 6, height: 6, fill: '#f7f8fa' }));
        pattern.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: '#e3e6eb', 'stroke-width': 2 }));
        defs.appendChild(pattern);
        svg.appendChild(defs);

        var marks = svgEl('g', { class: 'region-marks' });
        svg.appendChild(marks);

        /* --- the drawable regions, in module order ------------------------ */

        var regions = [];

        /* Quiet zones: drawn as hatched bands at the ends of the axis. */
        regions.push({
            id: 'quiet-left', role: 'quiet', group: null,
            xStart: originX, xEnd: originX + quietLeft * mw,
            meta: symbol.quietRegions[0]
        });

        symbol.groups.forEach(function (group) {
            regions.push({
                id: group.id,
                role: group.role,
                group: group,
                xStart: originX + (quietLeft + group.startModule) * mw,
                xEnd: originX + (quietLeft + group.endModule + 1) * mw,
                meta: group
            });
        });

        regions.push({
            id: 'quiet-right', role: 'quiet', group: null,
            xStart: originX + (quietLeft + modules.length) * mw,
            xEnd: originX + total * mw,
            meta: symbol.quietRegions[1]
        });

        /* --- paint the bars, group by group ------------------------------- */

        var dataIndex = 0;
        regions.forEach(function (region) {
            if (region.role === 'quiet') {
                marks.appendChild(svgEl('rect', {
                    class: 'quiet-hatch',
                    x: region.xStart, y: top,
                    width: Math.max(0, region.xEnd - region.xStart),
                    height: LINEAR.barH
                }));
                marks.appendChild(svgEl('rect', {
                    x: region.xStart, y: top,
                    width: Math.max(0, region.xEnd - region.xStart),
                    height: LINEAR.barH,
                    fill: 'none', stroke: '#e3e6eb', 'stroke-width': 0.75
                }));
                return;
            }

            var group = region.group;
            var colour;
            if (group.role === 'data') {
                dataIndex += 1;
                colour = colorFor('data', dataIndex - 1);
            } else if (group.role === 'pair') {
                colour = colorFor('pair', group.digits ? group.digits[0] : 0);
            } else {
                colour = colorFor(group.role, 0);
            }
            region.colour = colour;

            /* One rect per black run rather than per module: a 95-module
               EAN-13 has ~30 bars, so this keeps the DOM small and the SVG
               readable when a long Code 128 is on screen. */
            var runStart = null;
            for (var i = 0; i < group.modules.length; i++) {
                var black = group.modules[i] === 1;
                if (black && runStart === null) {
                    runStart = i;
                } else if (!black && runStart !== null) {
                    marks.appendChild(svgEl('rect', {
                        x: originX + (quietLeft + group.startModule + runStart) * mw,
                        y: top,
                        width: (i - runStart) * mw,
                        height: LINEAR.barH,
                        fill: colour
                    }));
                    runStart = null;
                }
            }
            if (runStart !== null) {
                marks.appendChild(svgEl('rect', {
                    x: originX + (quietLeft + group.startModule + runStart) * mw,
                    y: top,
                    width: (group.modules.length - runStart) * mw,
                    height: LINEAR.barH,
                    fill: colour
                }));
            }
        });

        /* --- bearer bar -------------------------------------------------- */

        if (symbol.bearerBar) {
            marks.appendChild(svgEl('rect', {
                class: 'bearer-bar',
                x: originX - LINEAR.bearerInset / 2,
                y: top - LINEAR.bearerInset / 2,
                width: bodyW + LINEAR.bearerInset,
                height: LINEAR.barH + LINEAR.bearerInset,
                'stroke-width': LINEAR.bearerThickness
            }));
            var bearerLabel = svgEl('text', {
                class: 'bearer-label',
                x: originX, y: top - LINEAR.bearerInset - 4
            });
            bearerLabel.textContent = 'Bearer bar — not part of the encoded data';
            marks.appendChild(bearerLabel);
        }

        /* --- human-readable text ----------------------------------------- */

        if (hriH) {
            symbol.humanReadable.forEach(function (item) {
                var text = svgEl('text', {
                    class: 'hri-text' + (item.style === 'outside' ? ' hri-text--outside' : ''),
                    x: originX + (quietLeft + (item.startModule + item.endModule + 1) / 2) * mw,
                    y: top + LINEAR.barH + bearerInset + 13
                });
                text.textContent = item.text;
                marks.appendChild(text);
            });
        }

        /* --- module ruler ------------------------------------------------- */

        if (state.showModuleNumbers) {
            for (var m = 0; m < total; m++) {
                /* Label every module when they are wide enough to read,
                   otherwise every fifth, plus the first of each region. */
                var every = mw >= 9 ? 1 : (mw >= 5 ? 5 : 10);
                var isEdge = m === 0 || regions.some(function (r) {
                    return Math.abs(r.xStart - (originX + m * mw)) < 0.5 ||
                        Math.abs(r.xEnd - (originX + (m + 1) * mw)) < 0.5;
                });
                if (m % every !== 0 && !isEdge) {
                    continue;
                }
                var tick = svgEl('text', {
                    class: 'ruler-text',
                    x: originX + (m + 0.5) * mw,
                    y: top - 4,
                    'text-anchor': 'middle'
                });
                tick.textContent = String(m);
                marks.appendChild(tick);
            }
        }

        /* --- axis caption -------------------------------------------------- */

        var axis = svgEl('text', {
            class: 'axis-text',
            x: originX,
            y: height - 2
        });
        axis.textContent = 'module 0 \u2192 module ' + (total - 1) +
            '  \u00b7  ' + total + ' modules, of which ' + modules.length + ' are symbol and ' +
            (quietLeft + quietRight) + ' are quiet zone';
        marks.appendChild(axis);

        /* --- interaction layer -------------------------------------------- */

        var hits = svgEl('g', { class: 'region-hits' });
        svg.appendChild(hits);

        var highlights = svgEl('g', { class: 'region-highlights' });
        svg.appendChild(highlights);

        var outlines = svgEl('g', { class: 'region-outlines' });
        svg.appendChild(outlines);

        state.geometry = {
            kind: '1D',
            originX: originX,
            moduleW: mw,
            quietLeft: quietLeft,
            top: top,
            barH: LINEAR.barH,
            total: total,
            regions: regions
        };

        /* Expose the geometry of the current drawing. It is the page's own
           record of how the picture was laid out, which makes the module
           readout reproducible in a test and inspectable by anyone who
           wonders why a particular bar landed where it did. */
        els.diagramStage.dataset.geometry = JSON.stringify({
            kind: '1D',
            padX: LINEAR.padX,
            moduleW: mw,
            quietLeft: quietLeft,
            quietRight: quietRight,
            symbolModules: modules.length,
            totalModules: total,
            originX: originX
        });

        regions.forEach(function (region, index) {
            var w = Math.max(1, region.xEnd - region.xStart);

            var highlight = svgEl('rect', {
                class: 'region-highlight',
                x: region.xStart, y: top - 2, width: w, height: LINEAR.barH + 4
            });
            highlights.appendChild(highlight);
            region.highlightNode = highlight;

            var outline = svgEl('rect', {
                class: 'region-outline',
                x: region.xStart + 0.5, y: top - 2.5, width: Math.max(0, w - 1), height: LINEAR.barH + 5
            });
            outlines.appendChild(outline);
            region.outlineNode = outline;

            var hit = svgEl('rect', {
                class: 'region-hit',
                x: region.xStart, y: top - 2, width: w, height: LINEAR.barH + 4,
                tabindex: '0',
                role: 'button',
                'aria-label': regionAriaLabel(region, symbol)
            });
            hit.__region = region;
            hits.appendChild(hit);
            region.hitNode = hit;

            hit.addEventListener('mouseenter', function () { hoverRegion(region); });
            hit.addEventListener('mouseleave', function () { hoverRegion(null); });
            hit.addEventListener('focus', function () { hoverRegion(region); });
            hit.addEventListener('blur', function () { hoverRegion(null); });
            hit.addEventListener('click', function () { toggleSelection(region); });
            hit.addEventListener('keydown', function (event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleSelection(region);
                } else if (event.key === 'Escape') {
                    selectRegion(null);
                }
            });
        });

        /* Pointer movement updates the module readout: the point of the ruler
           is to answer "which module is this bar", so it follows the pointer. */
        svg.addEventListener('mousemove', onDiagramPointerMove);
        svg.addEventListener('mouseleave', function () {
            setModuleReadout(null);
        });
        svg.addEventListener('touchstart', onDiagramTouch, { passive: true });

        els.diagramStage.classList.remove('diagram-stage--grid');
    }

    function regionAriaLabel(region, symbol) {
        var meta = region.meta || {};
        var title = meta.title || region.id;
        var count = region.role === 'quiet'
            ? region.meta.count
            : region.group.count;
        return title + ', ' + pluralize(count, 'module') + ', ' +
            (meta.roleLabel || roleMeta(region.role).label);
    }

    /* ---------------------------------------------------------------------
       4b. Rendering — QR Code grid
       --------------------------------------------------------------------- */

    var QR_CELL = 9;

    function renderQR(symbol) {
        var svg = clearSvg(els.diagram);

        var qr = symbol.qr;
        var size = qr.size;
        var quiet = 4;

        /* Keep the grid on whole pixels: a QR module that lands on a fractional
           coordinate renders as a grey seam and makes the module ruler a lie. */
        var cell = QR_CELL;
        var maxSide = 620;
        var side = (size + quiet * 2) * cell;
        if (side > maxSide) {
            cell = Math.max(3, Math.floor(maxSide / (size + quiet * 2)));
            side = (size + quiet * 2) * cell;
        }

        var rulerH = state.showModuleNumbers ? 14 : 0;
        var width = side + 24;
        var height = side + 24 + rulerH + 16;

        svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
        svg.setAttribute('width', width);
        svg.setAttribute('height', height);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

        var originX = 12;
        var originY = 12 + rulerH;

        var marks = svgEl('g', { class: 'region-marks' });
        svg.appendChild(marks);

        /* Quiet zone band, then the light modules of the grid. */
        marks.appendChild(svgEl('rect', {
            class: 'quiet-hatch',
            x: originX, y: originY,
            width: size * cell + quiet * 2 * cell,
            height: size * cell + quiet * 2 * cell
        }));
        marks.appendChild(svgEl('rect', {
            x: originX, y: originY,
            width: size * cell + quiet * 2 * cell,
            height: size * cell + quiet * 2 * cell,
            fill: 'none', stroke: '#e3e6eb', 'stroke-width': 0.75
        }));

        /* Light modules first, then the dark ones — one rect each is fine at
           these sizes and keeps every module independently addressable. */
        var gridX = originX + quiet * cell;
        var gridY = originY + quiet * cell;

        for (var row = 0; row < size; row++) {
            for (var col = 0; col < size; col++) {
                var moduleIndex = qr.moduleColors[row][col];
                var component = moduleIndex >= 0 ? qr.components[moduleIndex] : null;
                var on = qr.matrix[row][col] === 1;

                var fill;
                if (on) {
                    fill = component ? componentColour(component) : '#323234';
                } else {
                    /* A light module still belongs to a region, so it gets a
                       tint of that region's colour rather than pure white —
                       otherwise a data area full of white would look empty. */
                    fill = component ? tintColour(componentColour(component)) : '#ffffff';
                }

                marks.appendChild(svgEl('rect', {
                    x: gridX + col * cell,
                    y: gridY + row * cell,
                    width: cell,
                    height: cell,
                    fill: fill
                }));
            }
        }

        /* Module ruler along the top and left edges. */
        if (state.showModuleNumbers) {
            var every = size > 45 ? 5 : (size > 25 ? 2 : 1);
            for (var i = 0; i < size; i += every) {
                var top = svgEl('text', {
                    class: 'ruler-text',
                    x: gridX + (i + 0.5) * cell,
                    y: originY - 3,
                    'text-anchor': 'middle'
                });
                top.textContent = String(i);
                marks.appendChild(top);

                var left = svgEl('text', {
                    class: 'ruler-text',
                    x: gridX - 3,
                    y: gridY + (i + 0.5) * cell + 2.5,
                    'text-anchor': 'end'
                });
                left.textContent = String(i);
                marks.appendChild(left);
            }
        }

        var caption = svgEl('text', {
            class: 'axis-text',
            x: originX,
            y: height - 3
        });
        caption.textContent = 'Version ' + qr.version + ' \u00b7 ' + size + ' \u00d7 ' + size +
            ' modules \u00b7 level ' + qr.ecLevel + ' \u00b7 mask ' + qr.mask +
            ' \u00b7 4-module quiet zone';
        marks.appendChild(caption);

        /* --- interaction layer: one hit area per component ---------------- */

        var hits = svgEl('g', { class: 'region-hits' });
        var highlights = svgEl('g', { class: 'region-highlights' });
        var outlines = svgEl('g', { class: 'region-outlines' });
        svg.appendChild(hits);
        svg.appendChild(highlights);
        svg.appendChild(outlines);

        var regions = qr.components.map(function (component) {
            var b = component.bounds;
            var region = {
                id: component.id,
                role: component.kind,
                component: component,
                xStart: gridX + b.col * cell,
                yStart: gridY + b.row * cell,
                xEnd: gridX + (b.col + b.cols) * cell,
                yEnd: gridY + (b.row + b.rows) * cell,
                meta: {
                    title: component.label,
                    roleLabel: componentGroupLabel(component),
                    description: component.description,
                    detail: component.detail,
                    stats: {
                        modules: pluralize(component.cells.length, 'module'),
                        kind: componentGroupLabel(component),
                        bounds: 'rows ' + b.row + '-' + (b.row + b.rows - 1) +
                            ', columns ' + b.col + '-' + (b.col + b.cols - 1)
                    }
                }
            };
            return region;
        });

        state.geometry = {
            kind: '2D',
            originX: gridX,
            originY: gridY,
            cell: cell,
            size: size,
            quiet: quiet,
            regions: regions
        };

        regions.forEach(function (region) {
            var w = Math.max(1, region.xEnd - region.xStart);
            var h = Math.max(1, region.yEnd - region.yStart);

            var highlight = svgEl('rect', {
                class: 'region-highlight',
                x: region.xStart, y: region.yStart, width: w, height: h,
                fill: componentColour(region.component)
            });
            highlights.appendChild(highlight);
            region.highlightNode = highlight;

            var outline = svgEl('rect', {
                class: 'region-outline',
                x: region.xStart + 0.5, y: region.yStart + 0.5,
                width: Math.max(0, w - 1), height: Math.max(0, h - 1)
            });
            outlines.appendChild(outline);
            region.outlineNode = outline;

            var hit = svgEl('rect', {
                class: 'region-hit',
                x: region.xStart, y: region.yStart, width: w, height: h,
                tabindex: '0',
                role: 'button',
                'aria-label': region.component.label + ', ' +
                    pluralize(region.component.cells.length, 'module')
            });
            hit.__region = region;
            hits.appendChild(hit);
            region.hitNode = hit;

            hit.addEventListener('mouseenter', function () { hoverRegion(region); });
            hit.addEventListener('mouseleave', function () { hoverRegion(null); });
            hit.addEventListener('focus', function () { hoverRegion(region); });
            hit.addEventListener('blur', function () { hoverRegion(null); });
            hit.addEventListener('click', function () { toggleSelection(region); });
            hit.addEventListener('keydown', function (event) {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleSelection(region);
                } else if (event.key === 'Escape') {
                    selectRegion(null);
                }
            });
        });

        svg.addEventListener('mousemove', onDiagramPointerMove);
        svg.addEventListener('mouseleave', function () {
            setModuleReadout(null);
        });
        svg.addEventListener('touchstart', onDiagramTouch, { passive: true });

        els.diagramStage.classList.add('diagram-stage--grid');
        els.diagramStage.dataset.geometry = JSON.stringify({
            kind: '2D',
            cell: cell,
            size: size,
            quiet: quiet,
            originX: gridX,
            originY: gridY
        });
    }

    /* Colour for a QR component. Function patterns get the shared role
       palette; the many data and error-correction groups cycle through their
       role's blues and a warm grey so neighbouring codewords stay distinct. */
    function componentColour(component) {
        switch (component.kind) {
            case 'fixed': return '#2f6f7e';
            case 'timing': return '#3d8b9c';
            case 'alignment': return '#7a4fbf';
            case 'format': return '#1f7a4d';
            case 'version': return '#2a8f5c';
            case 'dark': return '#323234';
            case 'ec': return colorFor('check', 0);
            case 'data': return colorFor('data', componentIndexWithinKind(component));
            default: return '#2b5d9b';
        }
    }

    var _kindCounters = {};

    /* Data and error-correction groups are per-codeword, so they need a stable
       colour per index rather than one colour per kind. */
    function componentIndexWithinKind(component) {
        var match = /(\d+)/.exec(component.id);
        return match ? parseInt(match[1], 10) : 0;
    }
    function componentGroupLabel(component) {
        switch (component.group) {
            case 'function': return 'Function pattern';
            case 'header': return 'Header';
            case 'data': return 'Data and error correction';
            default: return 'Region';
        }
    }

    function tintColour(hex) {
        /* Blend a colour towards white: light modules should read as "part of
           this region" without competing with the dark ones. */
        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        var mix = function (c) { return Math.round(c + (255 - c) * 0.86); };
        return 'rgb(' + mix(r) + ',' + mix(g) + ',' + mix(b) + ')';
    }

    function clearSvg(svg) {
        while (svg.firstChild) {
            svg.removeChild(svg.firstChild);
        }
        /* Mousemove/leave listeners are bound to the <svg> element itself, so
           they would stack up on every re-render. Swapping in a fresh clone of
           the same element drops them, and the replacement is returned so the
           caller can bind again. */
        var fresh = svg.cloneNode(false);
        svg.parentNode.replaceChild(fresh, svg);
        els.diagram = fresh;
        return fresh;
    }

    /* ---------------------------------------------------------------------
       5. Interaction
       --------------------------------------------------------------------- */

    function hoverRegion(region) {
        state.hovered = region;
        applyRegionClasses();
        if (region) {
            showDetails(region, false);
        } else if (!state.selected) {
            showDetails(null, false);
        }
    }

    function toggleSelection(region) {
        if (state.selected && state.selected.id === region.id) {
            selectRegion(null);
            return;
        }
        selectRegion(region);
        track('structure_region_selected', {
            symbology: state.symbology,
            region: region.id,
            role: region.role
        });
    }

    function selectRegion(region) {
        if (state.selected && state.selected.highlightNode) {
            state.selected.highlightNode.classList.remove('is-selected');
            state.selected.outlineNode.classList.remove('is-selected');
        }
        state.selected = region;
        if (region) {
            region.highlightNode.classList.add('is-selected');
            region.outlineNode.classList.add('is-selected');
            els.detailPanel.classList.add('is-pinned');
            els.clearSelection.hidden = false;
            showDetails(region, true);
            highlightRegionRow(region.id);
            els.detailPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        } else {
            els.detailPanel.classList.remove('is-pinned');
            els.clearSelection.hidden = true;
            highlightRegionRow(null);
            if (!state.hovered) {
                showDetails(null, false);
            } else {
                showDetails(state.hovered, false);
            }
        }
    }

    function applyRegionClasses() {
        var active = state.hovered;
        if (state.geometry) {
            state.geometry.regions.forEach(function (region) {
                if (!region.highlightNode) {
                    return;
                }
                region.highlightNode.classList.toggle('is-hover', active === region);
            });
        }
        els.diagram.classList.toggle('is-dimmed', !!active);
    }

    function onDiagramPointerMove(event) {
        if (!state.geometry || state.geometry.kind !== '1D') {
            return;
        }
        var geometry = state.geometry;
        var rect = els.diagram.getBoundingClientRect();
        var scale = rect.width / els.diagram.viewBox.baseVal.width;
        var x = (event.clientX - rect.left) / scale;
        var module = Math.floor((x - geometry.originX) / geometry.moduleW);
        if (module < 0 || module >= geometry.total) {
            setModuleReadout(null);
            return;
        }
        setModuleReadout(module);
    }

    function onDiagramTouch(event) {
        if (!event.touches || !event.touches.length) {
            return;
        }
        onDiagramPointerMove({ clientX: event.touches[0].clientX });
    }

    /* The module readout answers the question the diagram itself cannot: for
       the pixel under the pointer, which module is it, which region owns it,
       and which character is it part of. */
    function setModuleReadout(moduleIndex) {
        var readout = els.moduleReadout;
        if (moduleIndex == null || !state.geometry || state.geometry.kind !== '1D') {
            var total = state.symbol && state.symbol.kind === '1D'
                ? state.symbol.totalModules + ' modules \u00b7 ' + state.symbol.drawnModules + ' symbol + ' +
                  (state.symbol.quietZone.left + state.symbol.quietZone.right) + ' quiet zone'
                : 'Move the pointer across the symbol to see which module it is.';
            readout.innerHTML = '';
            readout.appendChild(el('span', null, total));
            return;
        }

        var geometry = state.geometry;
        var symbol = state.symbol;

        /* Which region owns this module. Regions are stored in drawing order,
           so the owning region is the one whose module span contains it; the
           quiet zones are matched by position instead of by span. */
        var symbolModule = moduleIndex - geometry.quietLeft;
        var owner = null;
        geometry.regions.forEach(function (candidate) {
            if (candidate.role === 'quiet') {
                if (moduleIndex < geometry.quietLeft && candidate.id === 'quiet-left') {
                    owner = candidate;
                } else if (moduleIndex >= geometry.quietLeft + symbol.drawnModules && candidate.id === 'quiet-right') {
                    owner = candidate;
                }
                return;
            }
            var group = candidate.group;
            if (symbolModule >= group.startModule && symbolModule <= group.endModule) {
                owner = candidate;
            }
        });

        var isBar = owner && owner.role !== 'quiet' && symbolModule >= 0 && symbolModule < symbol.drawnModules
            ? symbol.modules[symbolModule] === 1
            : null;

        readout.innerHTML = '';
        var parts = [
            ['Module', String(moduleIndex)],
            ['Value', isBar == null ? '—' : (isBar ? '1 (bar)' : '0 (space)')],
            ['Region', owner ? (owner.meta.title || owner.id) : '—'],
            ['Role', owner ? (owner.meta.roleLabel || roleMeta(owner.role).label) : '—']
        ];
        if (owner && owner.group && owner.group.characters && owner.group.characters.length) {
            var character = owner.group.characters[0];
            if (character.label && character.label !== '—') {
                parts.push(['Character', '"' + character.label + '"']);
            }
        }
        parts.push(['Position', moduleIndex + ' of ' + geometry.total]);

        parts.forEach(function (pair) {
            var span = el('span');
            span.appendChild(el('b', null, pair[0] + ': '));
            span.appendChild(document.createTextNode(pair[1]));
            readout.appendChild(span);
        });
    }

    /* ---------------------------------------------------------------------
       6. Panels
       --------------------------------------------------------------------- */

    function showDetails(region, pinned) {
        if (!region) {
            els.detailEmpty.hidden = false;
            els.detailBody.hidden = true;
            return;
        }
        var meta = region.meta || {};
        els.detailEmpty.hidden = true;
        els.detailBody.hidden = false;

        var colour = region.role === 'quiet'
            ? '#dfe4ea'
            : (region.component ? componentColour(region.component) : (region.colour || roleMeta(region.role).color));
        els.detailSwatch.style.background = colour;
        els.detailTitle.textContent = meta.title || region.id;
        els.detailRole.textContent = (meta.roleLabel || roleMeta(region.role).label) +
            (pinned ? '  \u00b7  pinned' : '');
        els.detailDescription.textContent = meta.description || '';
        els.detailDetail.textContent = meta.detail || '';

        var stats = meta.stats || {};
        if (!meta.stats) {
            if (region.group) {
                stats = {
                    modules: pluralize(region.group.count, 'module') +
                        '  (' + region.group.startModule + '\u2013' + region.group.endModule + ')',
                    carries: groupCarries(region.group),
                    pattern: region.group.patternLabel || region.group.pattern
                };
            } else {
                stats = { modules: (meta.modulesLabel || ''), carries: 'nothing' };
            }
        }

        els.detailStats.innerHTML = '';
        Object.keys(stats).forEach(function (key) {
            if (!stats[key]) {
                return;
            }
            var wrap = el('div');
            var dt = el('dt', null, key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'));
            var dd = el('dd');
            var value = String(stats[key]);
            dd.textContent = value;
            if (/^[01.\u2588\u00b7\s]+$/.test(value)) {
                dd.className = 'mono';
            }
            wrap.appendChild(dt);
            wrap.appendChild(dd);
            els.detailStats.appendChild(wrap);
        });
    }

    function groupCarries(group) {
        if (group.role === 'check') {
            return 'the check value';
        }
        if (group.kind === 'gap') {
            return 'nothing — it separates characters';
        }
        if (group.role === 'guard' || group.role === 'start' || group.role === 'stop') {
            return 'no payload — structure only';
        }
        var label = group.characters && group.characters.length
            ? group.characters[0].label
            : null;
        if (label && label !== '—') {
            return 'character "' + label + '"';
        }
        /* A group with no per-character detail (an EAN-13 half, an ITF
           region) still has a subject worth naming. */
        return group.title || 'payload';
    }

    /* ---- region table --------------------------------------------------- */

    function renderRegionTable(symbol) {
        var tbody = els.regionRows;
        tbody.innerHTML = '';

        var rows = [];

        if (symbol.kind === '1D') {
            rows.push({
                id: 'quiet-left',
                title: 'Quiet zone (left)',
                roleLabel: 'Quiet zone',
                role: 'quiet',
                count: symbol.quietZone.left,
                description: 'Blank margin before the first bar. Without it the decoder cannot tell where the symbol begins.'
            });
            symbol.groups.forEach(function (group) {
                rows.push({
                    id: group.id,
                    title: group.title,
                    roleLabel: group.roleLabel,
                    role: group.role,
                    count: group.count,
                    description: group.description
                });
            });
            rows.push({
                id: 'quiet-right',
                title: 'Quiet zone (right)',
                roleLabel: 'Quiet zone',
                role: 'quiet',
                count: symbol.quietZone.right,
                description: 'Blank margin after the last bar, so the final bar has something to be measured against.'
            });
        } else {
            symbol.qr.components.forEach(function (component) {
                rows.push({
                    id: component.id,
                    title: component.label,
                    roleLabel: componentGroupLabel(component),
                    role: component.kind,
                    count: component.cells.length,
                    description: component.description
                });
            });
        }

        var dataColourIndex = 0;
        rows.forEach(function (row) {
            var tr = el('tr');
            tr.setAttribute('data-region-id', row.id);

            var nameCell = el('td');
            var chip = el('span', 'region-chip');
            var colour;
            if (row.role === 'data') {
                colour = colorFor('data', dataColourIndex++);
            } else if (row.role === 'pair') {
                colour = colorFor('pair', 0);
            } else {
                colour = colorFor(row.role, 0);
            }
            chip.style.background = colour;
            nameCell.appendChild(chip);
            var link = el('button', 'region-link', row.title);
            link.type = 'button';
            link.addEventListener('click', function () {
                var region = findRegion(row.id);
                if (region) {
                    selectRegion(region);
                    region.hitNode.focus();
                }
            });
            link.addEventListener('mouseenter', function () {
                var region = findRegion(row.id);
                if (region) {
                    hoverRegion(region);
                }
            });
            link.addEventListener('mouseleave', function () {
                hoverRegion(null);
            });
            nameCell.appendChild(link);
            tr.appendChild(nameCell);

            tr.appendChild(el('td', 'region-role', row.roleLabel));
            tr.appendChild(el('td', 'region-modules', String(row.count)));
            tr.appendChild(el('td', null, row.description || ''));
            tbody.appendChild(tr);
        });

        els.regionCaption.textContent = symbol.kind === '1D'
            ? 'Every region of this symbol, in the order the decoder meets them. Modules are counted from the left edge of the first bar, so the quiet zones are listed separately.'
            : 'Every region of this QR Code. A module can belong to exactly one region, which is why the counts add up to the full grid.';
    }

    function findRegion(id) {
        if (!state.geometry) {
            return null;
        }
        for (var i = 0; i < state.geometry.regions.length; i++) {
            if (state.geometry.regions[i].id === id) {
                return state.geometry.regions[i];
            }
        }
        return null;
    }

    function highlightRegionRow(id) {
        var rows = els.regionRows.querySelectorAll('tr');
        for (var i = 0; i < rows.length; i++) {
            rows[i].classList.toggle('is-active', !!id && rows[i].getAttribute('data-region-id') === id);
        }
    }

    /* ---- character table ------------------------------------------------ */

    function renderCharacterTable(symbol) {
        if (symbol.kind === '2D') {
            renderQRCharacterTable(symbol);
            return;
        }

        var head = els.characterHead;
        var tbody = els.characterRows;
        head.innerHTML = '';
        tbody.innerHTML = '';

        var columns, rows;

        if (symbol.symbology === 'ean13') {
            columns = ['Position', 'Digit', 'Table', '7-module pattern', 'Where it sits'];
            rows = [];
            rows.push({
                cells: [
                    '1st',
                    symbol.displayText.charAt(0),
                    'not drawn',
                    '\u2014',
                    'Encoded by the L/G parity choice of the six left-hand digits, printed in the left quiet zone'
                ]
            });
            symbol.groups.forEach(function (group) {
                if (!group.characters) {
                    return;
                }
                group.characters.forEach(function (character, index) {
                    rows.push({
                        cells: [
                            index < 6 ? ('left ' + (index + 1)) : ('right ' + (index - 5)),
                            character.char,
                            character.table,
                            patternNode(character.pattern),
                            index < 6
                                ? 'modules ' + (14 + index * 7) + '\u2013' + (20 + index * 7)
                                : 'modules ' + (61 + (index - 6) * 7) + '\u2013' + (67 + (index - 6) * 7)
                        ]
                    });
                });
            });
        } else if (symbol.symbology === 'code128') {
            columns = ['#', 'Symbol value', 'Character', 'Code set', 'Element widths', '11-module pattern'];
            rows = [];
            var counter = 0;
            symbol.groups.forEach(function (group) {
                if (!group.characters || !group.characters.length) {
                    return;
                }
                group.characters.forEach(function (character) {
                    counter += 1;
                    rows.push({
                        cells: [
                            String(counter),
                            String(character.value),
                            character.label,
                            character.set || '\u2014',
                            character.widths ? character.widths.join(' ') : '\u2014',
                            patternNode(character.pattern)
                        ]
                    });
                });
            });
        } else if (symbol.symbology === 'code39') {
            columns = ['Position', 'Character', 'Nine elements', 'Wide elements', 'Modules at 3:1'];
            rows = [];
            symbol.groups.forEach(function (group) {
                if (!group.characters || !group.characters.length) {
                    return;
                }
                group.characters.forEach(function (character) {
                    rows.push({
                        cells: [
                            group.title,
                            character.label,
                            character.spec ? specMarkup(character.spec) : '\u2014',
                            character.spec ? String(character.spec.split('').filter(function (c) { return c === '1'; }).length) : '\u2014',
                            String(character.pattern.length)
                        ]
                    });
                });
            });
        } else {
            columns = ['Position', 'Digit pair', 'Bar widths (first digit)', 'Space widths (second digit)', 'Modules'];
            rows = [];
            symbol.groups.forEach(function (group) {
                if (group.barWidths == null) {
                    return;
                }
                rows.push({
                    cells: [
                        group.title,
                        group.digits.join(' + '),
                        group.barWidths.join(' ') + '   (' + group.barSpec + ')',
                        group.spaceWidths.join(' ') + '   (' + group.spaceSpec + ')',
                        String(group.count)
                    ]
                });
            });
        }

        var tr = el('tr');
        columns.forEach(function (column) {
            var th = el('th');
            th.scope = 'col';
            th.textContent = column;
            tr.appendChild(th);
        });
        head.appendChild(tr);

        rows.forEach(function (row) {
            var tr2 = el('tr');
            row.cells.forEach(function (cell) {
                var td = el('td');
                if (cell instanceof Node) {
                    td.appendChild(cell);
                } else {
                    td.textContent = cell;
                }
                tr2.appendChild(td);
            });
            tbody.appendChild(tr2);
        });

        els.characterIntro.textContent = characterIntro(symbol);
    }

    function characterIntro(symbol) {
        switch (symbol.symbology) {
            case 'ean13':
                return 'Thirteen digits, twelve of them drawn. The first digit exists only as a choice of parity — it is the reason EAN-13 can carry thirteen digits in twelve character positions.';
            case 'code128':
                return 'Every symbol character is eleven modules: three bars and three spaces whose widths are unique to that value within the code set. The start, stop, code-set switches and the check symbol are all full characters, which is why a Code 128 symbol holds fewer characters than its height suggests.';
            case 'code39':
                return 'Each character is nine elements — five bars and four spaces — of which exactly three are wide in total. The specification fixes which three, and that is what makes the character readable.';
            default:
                return 'Digits are encoded in pairs: the first digit sets the widths of five bars, the second sets the widths of the five spaces between them. That interleaving is why ITF needs an even number of digits.';
        }
    }

    function patternNode(pattern) {
        var span = el('span');
        span.appendChild(patternMarkup(pattern));
        span.title = pattern;
        return span;
    }

    function specMarkup(spec) {
        var span = el('span');
        span.style.fontFamily = 'var(--font-mono)';
        for (var i = 0; i < spec.length; i++) {
            var wide = spec.charAt(i) === '1';
            var node = el('span', wide ? 'bit-1' : 'bit-0', wide ? 'W' : 'n');
            span.appendChild(node);
        }
        return span;
    }

    function renderQRCharacterTable(symbol) {
        var qr = symbol.qr;
        els.characterHead.innerHTML = '';
        els.characterRows.innerHTML = '';

        var columns = ['Stage', 'What happens', 'Numbers'];
        var head = el('tr');
        columns.forEach(function (column) {
            var th = el('th');
            th.scope = 'col';
            th.textContent = column;
            head.appendChild(th);
        });
        els.characterHead.appendChild(head);

        qr.stages.forEach(function (stage) {
            var tr = el('tr');
            tr.appendChild(el('td', null, stage.title));
            tr.appendChild(el('td', null, stage.description));
            tr.appendChild(el('td', 'mono-cell', stage.numbers || ''));
            els.characterRows.appendChild(tr);
        });

        var segmentsRow = el('tr');
        segmentsRow.appendChild(el('td', null, 'Segments'));
        segmentsRow.appendChild(el('td', null, 'How the text was split into modes before encoding.'));
        segmentsRow.appendChild(el('td', 'mono-cell', qr.segments.map(function (segment) {
            return segment.mode + ' \u00d7 ' + segment.charCount + ' chars, ' + segment.bits + ' bits';
        }).join('  |  ')));
        els.characterRows.appendChild(segmentsRow);

        els.characterIntro.textContent =
            'A QR Code is not encoded character by character. The text is first turned into a bit stream, that ' +
            'stream is cut into codewords, error-correction codewords are computed and interleaved with them, and ' +
            'only then are the codewords placed into the grid in the standard zig-zag order and masked. The panels ' +
            'below follow that pipeline.';
    }

    /* ---- check arithmetic ----------------------------------------------- */

    function renderCheck(symbol) {
        var body = els.checkBody;
        body.innerHTML = '';

        if (symbol.kind === '2D') {
            var qr = symbol.qr;
            els.checkHeading.textContent = 'Error correction instead of a check value';
            var p = el('p');
            p.textContent = 'A QR Code does not carry a check digit. It carries whole error-correction codewords, ' +
                'computed with Reed-Solomon coding, which let the decoder not only detect a damaged codeword but ' +
                'reconstruct it — as long as the number of damaged codewords stays inside the budget for the level.';
            body.appendChild(p);

            var list = el('ul', 'steps');
            var items = [
                ['Level ' + qr.ecLevel + ' allocates ' + qr.ecCodewords + ' error-correction codewords against ' +
                qr.dataCodewords + ' data codewords in this symbol.',
                'They are arranged in ' + pluralize(qr.blocks.length, 'block') + ', and the codewords are interleaved ' +
                'across blocks when they are placed — so a scratch that wipes out a contiguous area of the grid ' +
                'damages a few codewords in every block rather than all of the codewords in one.'],
                ['About ' + qr.summary.errorCorrectionPercent.toFixed(1) + '% of the ' +
                (qr.summary.dataModules + qr.summary.ecModules) + ' data-area modules in this symbol are redundancy.',
                'That is the price of damage tolerance, and it is why the same text in a higher error-correction ' +
                'level needs a bigger symbol.'],
                ['The format information repeats the level and the mask, twice.',
                '15 bits each time, BCH-protected and placed at two corners, so the decoder can read them even ' +
                'when one copy is damaged.']
            ];
            items.forEach(function (pair) {
                var li = el('li');
                li.appendChild(el('strong', null, pair[0] + ' '));
                li.appendChild(document.createTextNode(pair[1]));
                list.appendChild(li);
            });
            body.appendChild(list);
            return;
        }

        els.checkHeading.textContent = 'How the check value is computed';

        if (symbol.symbology === 'code128') {
            renderCode128Check(symbol, body);
            return;
        }
        if (symbol.symbology === 'code39') {
            renderCode39Check(symbol, body);
            return;
        }
        renderMod10Check(symbol, body);
    }

    function renderMod10Check(symbol, body) {
        var isEAN = symbol.symbology === 'ean13';
        var payload = isEAN ? symbol.payload : symbol.payload;
        var check = symbol.check;
        if (!check) {
            body.appendChild(el('p', null, 'This symbol carries no check digit — an ITF symbol that is not a ' +
                '14-digit GTIN does not have one.'));
            return;
        }

        var intro = el('p');
        intro.textContent = isEAN
            ? 'The check digit is the thirteenth digit. It is computed from the twelve you supplied, printed as a ' +
            'normal digit, and verified by the decoder.'
            : 'A GTIN-14 ends in a check digit computed from the thirteen digits before it. On a corrugated case this ' +
            'is the only error detection the symbol itself carries, which is one reason ITF-14 stays on shipping ' +
            'cases and GS1-128 is used where a misread would matter more.';
        body.appendChild(intro);

        var payloadDigits = payload;
        var calc = el('div', 'check-calc');

        var weights = [];
        var weight = payloadDigits.length % 2 === 0 ? 1 : 3;
        for (var i = payloadDigits.length - 1; i >= 0; i--) {
            weights[i] = weight;
            weight = weight === 3 ? 1 : 3;
        }

        var strip = el('div', 'weight-strip');
        payloadDigits.split('').forEach(function (digit, index) {
            var cell = el('span', 'weight-cell');
            cell.appendChild(el('span', null, digit));
            cell.appendChild(el('span', null, '\u00d7' + weights[index]));
            strip.appendChild(cell);
        });
        var checkCell = el('span', 'weight-cell is-check');
        checkCell.appendChild(el('span', null, check.value));
        checkCell.appendChild(el('span', null, 'check'));
        strip.appendChild(checkCell);

        var rowDigits = el('div', 'calc-row');
        rowDigits.appendChild(el('span', 'calc-label', 'Digits and weights'));
        rowDigits.appendChild(strip);
        calc.appendChild(rowDigits);

        var sum = 0;
        payloadDigits.split('').forEach(function (digit, index) {
            sum += parseInt(digit, 10) * weights[index];
        });

        var rowSum = el('div', 'calc-row');
        rowSum.appendChild(el('span', 'calc-label', 'Weighted sum'));
        rowSum.appendChild(el('span', 'calc-em', String(sum)));
        calc.appendChild(rowSum);

        var remainder = sum % 10;
        var rowNext = el('div', 'calc-row');
        rowNext.appendChild(el('span', 'calc-label', 'Round up to ten'));
        rowNext.appendChild(el('span', 'calc-em', '10 \u2212 ' + remainder + ' = ' + ((10 - remainder) % 10)));
        calc.appendChild(rowNext);

        var rowCheck = el('div', 'calc-row');
        rowCheck.appendChild(el('span', 'calc-label', 'Check digit'));
        rowCheck.appendChild(el('span', 'calc-em', check.value));
        calc.appendChild(rowCheck);

        var rowFull = el('div', 'calc-row');
        rowFull.appendChild(el('span', 'calc-label', 'Full number'));
        rowFull.appendChild(el('span', 'calc-em', symbol.displayText));
        calc.appendChild(rowFull);

        body.appendChild(calc);

        var note = el('p', 'hint');
        note.textContent = 'Weights run 3 and 1 alternately across the payload; which weight the leftmost digit gets ' +
            'depends on how many digits there are. The decoder repeats this arithmetic and rejects the scan if the ' +
            'printed digit does not match — which catches any single wrong digit, and most combinations of two.';
        body.appendChild(note);
    }

    function renderCode128Check(symbol, body) {
        var groups = symbol.groups;
        var startGroup = groups[0];
        var checkGroup = groups.filter(function (g) { return g.id === 'check'; })[0];
        if (!checkGroup || !checkGroup.characters || !checkGroup.characters.length) {
            return;
        }
        var checkValue = checkGroup.characters[0].value;
        var checksum = checkGroup.checksum;

        var intro = el('p');
        intro.textContent = 'Code 128 does not use a check digit. It appends a complete check symbol: the start ' +
            'character is weighted 1, every following character is weighted by its position, and the sum is taken ' +
            'modulo 103. The result is a normal 11-module character, so the check is as robust as any other ' +
            'character in the symbol.';
        body.appendChild(intro);

        var calc = el('div', 'check-calc');

        var terms = [startGroup.characters[0].value];
        groups.forEach(function (group) {
            if (group.id === 'check' || group.id === 'stop' || group.id === 'start') {
                return;
            }
            if (group.characters && group.characters.length) {
                terms.push(group.characters[0].value);
            }
        });

        var row = el('div', 'calc-row');
        row.appendChild(el('span', 'calc-label', 'Weighted sum'));
        var expression = terms.map(function (value, index) {
            return value + (index === 0 ? '' : '\u00d7' + index);
        }).join(' + ');
        row.appendChild(el('span', 'calc-em', expression));
        calc.appendChild(row);

        var rowTotal = el('div', 'calc-row');
        rowTotal.appendChild(el('span', 'calc-label', 'Sum'));
        rowTotal.appendChild(el('span', 'calc-em', String(checksum)));
        calc.appendChild(rowTotal);

        var rowMod = el('div', 'calc-row');
        rowMod.appendChild(el('span', 'calc-label', 'Modulo 103'));
        rowMod.appendChild(el('span', 'calc-em', checksum + ' mod 103 = ' + checkValue));
        calc.appendChild(rowMod);

        var rowSymbol = el('div', 'calc-row');
        rowSymbol.appendChild(el('span', 'calc-label', 'Check symbol'));
        rowSymbol.appendChild(el('span', 'calc-em', 'value ' + checkValue + '  \u2192  ' +
            checkGroup.characters[0].widths.join('-')));
        calc.appendChild(rowSymbol);

        body.appendChild(calc);

        var note = el('p', 'hint');
        note.textContent = 'The stop character is never included in the sum — it is the one character in the symbol ' +
            'whose value has no checksum role.';
        body.appendChild(note);
    }

    function renderCode39Check(symbol, body) {
        var intro = el('p');
        intro.textContent = 'Code 39 has an optional check character: map every character to its position in the ' +
            '43-character alphabet, add the positions, and take the remainder modulo 43. This symbol ' +
            (symbol.check ? 'carries one.' : 'does not carry one — and neither do most Code 39 symbols in the wild, ' +
                'which is one of the reasons a scanner reports Code 39 reads with less confidence than Code 128.');
        body.appendChild(intro);

        if (symbol.check) {
            var calc = el('div', 'check-calc');
            var alphabet = (window.Barcode1D && window.Barcode1D.tables.code39Alphabet) ||
                '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
            var payload = symbol.payload;
            var sum = 0;
            var terms = [];
            payload.split('').forEach(function (character) {
                var index = alphabet.indexOf(character);
                if (index >= 0) {
                    sum += index;
                    terms.push(index);
                }
            });
            var row = el('div', 'calc-row');
            row.appendChild(el('span', 'calc-label', 'Character values'));
            row.appendChild(el('span', 'calc-em', terms.join(' + ')));
            calc.appendChild(row);
            var rowSum = el('div', 'calc-row');
            rowSum.appendChild(el('span', 'calc-label', 'Sum'));
            rowSum.appendChild(el('span', 'calc-em', sum + ' mod 43 = ' + (sum % 43) +
                '  \u2192  "' + symbol.check.value + '"'));
            calc.appendChild(rowSum);
            body.appendChild(calc);
        }

        var note = el('p', 'hint');
        note.textContent = 'The asterisk is not in the 43-character alphabet because it is reserved as the start ' +
            'and stop character — which is also why a payload cannot contain one.';
        body.appendChild(note);
    }

    /* ---- QR detail panels ----------------------------------------------- */

    function renderQRPanels(symbol) {
        if (symbol.kind !== '2D') {
            els.qrCard.hidden = true;
            return;
        }
        els.qrCard.hidden = false;
        var qr = symbol.qr;

        var stats = [
            ['Version', qr.version + '  (' + qr.size + ' \u00d7 ' + qr.size + ' modules)'],
            ['Error-correction level', qr.ecLevel],
            ['Mask pattern', qr.mask + '  (of 8)'],
            ['Encoding mode', qr.mode],
            ['Data modules', String(qr.summary.dataModules)],
            ['Error-correction modules', String(qr.summary.ecModules)],
            ['Function-pattern modules', String(qr.summary.functionModules)],
            ['Redundancy', qr.summary.errorCorrectionPercent.toFixed(1) + '% of the data area'],
            ['Data capacity at this version and level', qr.summary.dataCapacityBytes + ' bytes']
        ];

        els.qrStats.innerHTML = '';
        stats.forEach(function (pair) {
            var wrap = el('div');
            wrap.appendChild(el('dt', null, pair[0]));
            var dd = el('dd');
            dd.textContent = pair[1];
            wrap.appendChild(dd);
            els.qrStats.appendChild(wrap);
        });

        els.qrBlockRows.innerHTML = '';
        qr.blocks.forEach(function (block) {
            var tr = el('tr');
            tr.appendChild(el('td', null, block.kind === 'data'
                ? 'Data block ' + (block.index + 1)
                : 'EC block ' + ((block.ecBlockIndex != null ? block.ecBlockIndex : block.index) + 1)));
            tr.appendChild(el('td', 'kind', block.kind === 'data' ? 'data' : 'error correction'));
            tr.appendChild(el('td', null, block.kind === 'data'
                ? block.dataCodewords + ' data + ' + block.ecCodewords + ' EC = ' + block.totalCodewords
                : String(block.codewordCount != null ? block.codewordCount : block.ecCodewords)));
            tr.appendChild(el('td', null, 'codeword ' + block.startCodeword));
            els.qrBlockRows.appendChild(tr);
        });
    }

    /* ---- symbology facts strip ------------------------------------------ */

    function renderFacts(symbol) {
        var facts = [];
        if (symbol.kind === '1D') {
            facts = [
                ['Symbol modules', String(symbol.drawnModules)],
                ['Quiet zone', symbol.quietZone.left + ' left, ' + symbol.quietZone.right + ' right'],
                ['Total footprint', String(symbol.totalModules) + ' modules'],
                ['Regions', String(symbol.groups.length + 2)]
            ];
            if (symbol.check) {
                facts.push([symbol.check.label, String(symbol.check.value)]);
            }
        } else {
            var qr = symbol.qr;
            facts = [
                ['Version', String(qr.version)],
                ['Grid', qr.size + ' \u00d7 ' + qr.size],
                ['Level', qr.ecLevel],
                ['Mask', String(qr.mask)],
                ['Regions', String(qr.components.length)]
            ];
        }

        els.symbologyFacts.innerHTML = '';
        facts.forEach(function (pair) {
            var chip = el('span', 'fact-chip');
            chip.appendChild(el('b', null, pair[0]));
            chip.appendChild(document.createTextNode(pair[1]));
            els.symbologyFacts.appendChild(chip);
        });
    }

    /* ---- legend --------------------------------------------------------- */

    function renderLegend(symbol) {
        els.legend.innerHTML = '';
        var counts = {};

        if (symbol.kind === '1D') {
            counts.quiet = symbol.quietZone.left + symbol.quietZone.right;
            symbol.groups.forEach(function (group) {
                counts[group.role] = (counts[group.role] || 0) + group.count;
            });
        } else {
            symbol.qr.components.forEach(function (component) {
                var role = component.kind === 'data' ? 'data' : (component.kind === 'ec' ? 'check' : component.kind);
                counts[role] = (counts[role] || 0) + component.cells.length;
            });
        }

        var ORDER = ['quiet', 'guard', 'start', 'data', 'pair', 'check', 'stop', 'fixed', 'timing', 'alignment', 'format', 'version', 'dark'];
        var SEEN = {};

        ORDER.forEach(function (role) {
            if (!counts[role] || SEEN[role]) {
                return;
            }
            SEEN[role] = true;
            var meta = roleMeta(role);
            var button = el('button', 'legend-item');
            button.type = 'button';
            var swatch = el('span', 'legend-swatch');
            swatch.style.background = colorFor(role, 0);
            button.appendChild(swatch);
            button.appendChild(el('span', null, legendLabel(role, meta)));
            button.appendChild(el('span', 'legend-count', counts[role]));
            button.title = meta.description || '';
            button.addEventListener('mouseenter', function () {
                state.geometry && state.geometry.regions.forEach(function (region) {
                    if (region.role === role && region.highlightNode) {
                        region.highlightNode.classList.add('is-hover');
                    }
                });
            });
            button.addEventListener('mouseleave', function () {
                state.geometry && state.geometry.regions.forEach(function (region) {
                    if (region.highlightNode) {
                        region.highlightNode.classList.remove('is-hover');
                    }
                });
            });
            button.addEventListener('click', function () {
                /* Jump to the first region with this role. */
                var match = null;
                state.geometry && state.geometry.regions.forEach(function (region) {
                    if (!match && region.role === role) {
                        match = region;
                    }
                });
                if (match) {
                    selectRegion(match);
                    if (match.hitNode) {
                        match.hitNode.focus();
                    }
                }
            });
            els.legend.appendChild(button);
        });
    }

    function legendLabel(role, meta) {
        var overrides = {
            quiet: 'Quiet zone',
            guard: 'Guard / fixed pattern',
            start: 'Start character',
            data: 'Data characters',
            pair: 'Digit pairs',
            check: 'Check value',
            stop: 'Stop character',
            fixed: 'Function patterns',
            timing: 'Timing patterns',
            alignment: 'Alignment patterns',
            format: 'Format information',
            version: 'Version information',
            dark: 'Dark module'
        };
        return overrides[role] || meta.label || role;
    }

    /* ---------------------------------------------------------------------
       Wiring
       --------------------------------------------------------------------- */

    function encodeCurrent() {
        var error = null;
        var symbol = null;
        try {
            if (state.symbology === 'qrcode') {
                symbol = buildQRSymbol(window.BarcodeQR.encode(state.value, { ecLevel: state.ecLevel }));
            } else {
                symbol = buildLinearSymbol(window.Barcode1D.encode(state.symbology, state.value));
            }
        } catch (e) {
            error = e;
        }

        els.formError.classList.remove('is-visible');
        if (error) {
            els.formError.textContent = error.message;
            els.formError.classList.add('is-visible');
            els.renderStatus.textContent = '';
            showDetails(null, false);
            return false;
        }

        state.symbol = symbol;
        state.selected = null;
        state.hovered = null;
        els.clearSelection.hidden = true;
        els.detailPanel.classList.remove('is-pinned');
        highlightRegionRow(null);
        /* The panel describes a *region of the previous symbol*, so it has to be
           reset before the new one is drawn — otherwise a stale description
           survives a symbology change and reads as a claim about the symbol on
           screen. */
        showDetails(null, false);

        renderFacts(symbol);
        if (symbol.kind === '2D') {
            renderQR(symbol);
        } else {
            renderLinear(symbol);
        }
        /* The human-readable line is part of EAN-13 and ITF-14 printing but not
           of Code 128 or Code 39, so the toggle is hidden rather than left
           looking like it should do something. */
        els.hriToggleRow.hidden = !(symbol.kind === '1D' && symbol.humanReadable.length > 0);
        renderLegend(symbol);
        renderRegionTable(symbol);
        renderCharacterTable(symbol);
        renderCheck(symbol);
        renderQRPanels(symbol);
        setModuleReadout(null);

        els.renderStatus.textContent = symbol.kind === '1D'
            ? symbol.symbologyLabel + ': ' + pluralize(symbol.drawnModules, 'symbol module') + ' plus ' +
              pluralize(symbol.quietZone.left + symbol.quietZone.right, 'quiet-zone module') + '.'
            : symbol.symbologyLabel + ': version ' + symbol.qr.version + ', ' +
              symbol.qr.size + ' \u00d7 ' + symbol.qr.size + ' modules, level ' + symbol.qr.ecLevel + '.';

        els.renderStatus.classList.remove('is-error');
        return true;
    }

    function selectSymbology(id, options) {
        var previous = state.symbology;
        state.symbology = id;
        var meta = SYMBOLOGIES.filter(function (s) { return s.id === id; })[0];
        var info = (window.Barcode1D && window.Barcode1D.SYMBOLOGIES || []).filter(function (s) {
            return s.id === id;
        })[0];

        Array.prototype.forEach.call(els.symbologyTabs.children, function (button) {
            var isActive = button.getAttribute('data-symbology') === id;
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
            button.tabIndex = isActive ? 0 : -1;
        });

        els.valueLabel.textContent = id === 'qrcode' ? 'Text or URL' : 'Digits or text';
        els.valueHint.textContent = info ? info.hint : '';
        els.valueInput.value = state.value;
        els.valueInput.maxLength = id === 'qrcode' ? 900 : 64;

        if (previous !== id && (!options || options.keepValue !== true)) {
            state.value = info ? info.sample : '';
            els.valueInput.value = state.value;
        }

        encodeCurrent();
        if (previous !== id) {
            track('structure_symbology_changed', { symbology: id });
        }
    }

    function randomValueFor(id) {
        switch (id) {
            case 'ean13':
                return String(Math.floor(Math.random() * 9) + 1) +
                    String(Math.floor(Math.random() * 1e11)).padStart(11, '0');
            case 'code128':
                var samples = ['Codepool-2026', 'INV-004821', 'ABC-123456', 'Order 77-B', 'SKU-99-XXL'];
                return samples[Math.floor(Math.random() * samples.length)];
            case 'code39':
                var c39 = ['CODE-39', 'LOT 4471', 'ABC$123', 'WIDGET-X', 'TEST 99'];
                return c39[Math.floor(Math.random() * c39.length)];
            case 'itf14':
                return String(Math.floor(Math.random() * 9) + 1) +
                    String(Math.floor(Math.random() * 1e11)).padStart(11, '0');
            default:
                var urls = [
                    'https://www.dynamsoft.com/codepool/',
                    'https://www.dynamsoft.com/barcode-reader/overview/',
                    'Barcode structure explainer',
                    'https://www.dynamsoft.com/codepool/demos/'
                ];
                return urls[Math.floor(Math.random() * urls.length)];
        }
    }

    function init() {
        els.diagram = $('diagram');
        els.diagramStage = $('diagramStage');
        els.symbologyTabs = $('symbologyTabs');
        els.valueInput = $('valueInput');
        els.valueLabel = $('valueLabel');
        els.valueHint = $('valueHint');
        els.symbologyFacts = $('symbologyFacts');
        els.formError = $('formError');
        els.renderStatus = $('renderStatus');
        els.legend = $('legend');
        els.moduleReadout = $('moduleReadout');
        els.detailPanel = $('detailPanel');
        els.detailEmpty = $('detailEmpty');
        els.detailBody = $('detailBody');
        els.detailSwatch = $('detailSwatch');
        els.detailTitle = $('detailTitle');
        els.detailRole = $('detailRole');
        els.detailDescription = $('detailDescription');
        els.detailDetail = $('detailDetail');
        els.detailStats = $('detailStats');
        els.regionRows = $('regionRows');
        els.regionCaption = $('regionCaption');
        els.characterHead = $('characterHead');
        els.characterRows = $('characterRows');
        els.characterIntro = $('characterIntro');
        els.checkBody = $('checkBody');
        els.checkHeading = $('checkHeading');
        els.qrCard = $('qrCard');
        els.qrStats = $('qrStats');
        els.qrBlockRows = $('qrBlockRows');
        els.qrEcLevel = $('qrEcLevel');
        els.showModuleNumbers = $('showModuleNumbers');
        els.showHumanReadable = $('showHumanReadable');
        els.hriToggleRow = els.showHumanReadable.closest('.toggle-row');
        els.clearSelection = $('clearSelection');
        els.sampleBtn = $('sampleBtn');

        /* Tabs */
        SYMBOLOGIES.forEach(function (symbology) {
            var button = el('button', 'symbology-tab');
            button.type = 'button';
            button.setAttribute('role', 'tab');
            button.setAttribute('data-symbology', symbology.id);
            button.setAttribute('aria-selected', 'false');
            button.appendChild(el('span', null, symbology.label));
            button.appendChild(el('span', 'tab-kind', symbology.kind));
            button.addEventListener('click', function () {
                selectSymbology(symbology.id);
            });
            button.addEventListener('keydown', function (event) {
                var index = SYMBOLOGIES.map(function (s) { return s.id; }).indexOf(symbology.id);
                var next = null;
                if (event.key === 'ArrowRight') {
                    next = SYMBOLOGIES[(index + 1) % SYMBOLOGIES.length];
                } else if (event.key === 'ArrowLeft') {
                    next = SYMBOLOGIES[(index - 1 + SYMBOLOGIES.length) % SYMBOLOGIES.length];
                }
                if (next) {
                    event.preventDefault();
                    selectSymbology(next.id);
                    els.symbologyTabs.querySelector('[data-symbology="' + next.id + '"]').focus();
                }
            });
            els.symbologyTabs.appendChild(button);
        });

        els.valueInput.addEventListener('input', function () {
            state.value = els.valueInput.value;
            encodeCurrent();
        });

        els.sampleBtn.addEventListener('click', function () {
            state.value = randomValueFor(state.symbology);
            els.valueInput.value = state.value;
            encodeCurrent();
            track('structure_sample_value', { symbology: state.symbology });
        });

        els.qrEcLevel.addEventListener('change', function () {
            state.ecLevel = els.qrEcLevel.value;
            encodeCurrent();
            track('structure_ec_level', { level: state.ecLevel });
        });

        els.showModuleNumbers.addEventListener('change', function () {
            state.showModuleNumbers = els.showModuleNumbers.checked;
            if (state.symbol) {
                if (state.symbol.kind === '2D') {
                    renderQR(state.symbol);
                } else {
                    renderLinear(state.symbol);
                }
                renderLegend(state.symbol);
            }
        });

        els.showHumanReadable.addEventListener('change', function () {
            state.showHumanReadable = els.showHumanReadable.checked;
            if (state.symbol && state.symbol.kind === '1D') {
                renderLinear(state.symbol);
            }
        });

        els.clearSelection.addEventListener('click', function () {
            selectRegion(null);
        });

        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && state.selected) {
                selectRegion(null);
            }
        });

        /* Start on EAN-13 with its sample value. */
        var ean = (window.Barcode1D.SYMBOLOGIES || []).filter(function (s) { return s.id === 'ean13'; })[0];
        state.value = ean ? ean.sample : '5901234123457';
        state.ecLevel = 'M';
        selectSymbology('ean13', { keepValue: true });
        els.valueInput.value = state.value;

        try {
            if (window.DemoAnalytics && typeof window.DemoAnalytics.ready === 'function') {
                window.DemoAnalytics.ready(0);
            }
        } catch (e) { /* analytics is optional */ }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
}());
