/**
 * Identity Document Face & Border Detection Processor
 *
 *
 * A single cvr.capture() call yields MRZ text, document border, and portrait
 * zone – exactly as in the Python reference implementation.
 */
class FaceProcessor {
    constructor() {
        this.isInitialized = false;
        this.cvr = null;
        this.irm = null;
        this.irr = null;

        // Collected intermediate results keyed by image hash id
        this._units = {};
    }

    _getUnitStorageKey(result) {
        if (!result) return 'latest';
        if (typeof result.getOriginalImageHashId === 'function') {
            return result.getOriginalImageHashId();
        }
        return result.originalImageHashId ?? result.imageHashId ?? result.hashId ?? 'latest';
    }

    _storeUnit(slot, result) {
        const id = this._getUnitStorageKey(result);
        if (!this._units[id]) this._units[id] = {};
        this._units[id][slot] = result;
    }

    _getIdentityProcessor() {
        return Dynamsoft.IdentityUtility?.IdentityProcessor ?? null;
    }

    async findPortraitZoneForCapturedResult(capturedResult) {
        const identityProcessor = this._getIdentityProcessor();
        if (typeof identityProcessor?.findPortraitZone !== 'function') {
            return null;
        }

        try {
            return await identityProcessor.findPortraitZone();
        } catch (e) {
            console.warn('IdentityProcessor.findPortraitZone() failed:', e);
            return null;
        }
    }

    /**
     * Returns { width, height } for either an <img> or <video> element.
     */
    _getSourceDimensions(source) {
        if (source instanceof HTMLVideoElement) {
            return { width: source.videoWidth, height: source.videoHeight };
        }
        if (source instanceof HTMLCanvasElement) {
            return { width: source.width, height: source.height };
        }
        return { width: source.naturalWidth, height: source.naturalHeight };
    }

    _clampPoints(points, imgW, imgH) {
        return points.map(p => ({
            x: Math.max(0, Math.min(p.x, imgW)),
            y: Math.max(0, Math.min(p.y, imgH))
        }));
    }

    _drawQuad(points, canvasOverlay, label, dashed = false, color = 'red') {
        const overlayCtx = canvasOverlay.getContext('2d', { willReadFrequently: true });

        overlayCtx.save();
        overlayCtx.strokeStyle = color;
        overlayCtx.lineWidth = 3;
        overlayCtx.setLineDash(dashed ? [8, 4] : []);
        overlayCtx.beginPath();
        overlayCtx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            overlayCtx.lineTo(points[i].x, points[i].y);
        }
        overlayCtx.closePath();
        overlayCtx.stroke();
        overlayCtx.setLineDash([]);

        const labelX = Math.min(...points.map(p => p.x));
        const labelY = Math.min(...points.map(p => p.y));
        overlayCtx.fillStyle = color;
        overlayCtx.font = '14px Arial';
        overlayCtx.fillText(label, labelX, labelY - 5);
        overlayCtx.restore();
    }

    _lerpPoint(start, end, ratio) {
        return {
            x: start.x + (end.x - start.x) * ratio,
            y: start.y + (end.y - start.y) * ratio
        };
    }

    _interpolateQuadPoint(quadPoints, xRatio, yRatio) {
        const top = this._lerpPoint(quadPoints[0], quadPoints[1], xRatio);
        const bottom = this._lerpPoint(quadPoints[3], quadPoints[2], xRatio);
        return this._lerpPoint(top, bottom, yRatio);
    }

    _buildPortraitQuadFromDocumentQuad(docQuad) {
        const leftRatio = 0.03;
        const topRatio = 0.12;
        const widthRatio = 0.35;
        const heightRatio = 0.45;

        return [
            this._interpolateQuadPoint(docQuad, leftRatio, topRatio),
            this._interpolateQuadPoint(docQuad, leftRatio + widthRatio, topRatio),
            this._interpolateQuadPoint(docQuad, leftRatio + widthRatio, topRatio + heightRatio),
            this._interpolateQuadPoint(docQuad, leftRatio, topRatio + heightRatio)
        ];
    }

    _renderSourceToCanvas(sourceImage) {
        const { width, height } = this._getSourceDimensions(sourceImage);
        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = width;
        sourceCanvas.height = height;
        const sourceCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
        sourceCtx.drawImage(sourceImage, 0, 0, width, height);
        return sourceCanvas;
    }

    _rotatePoint(point, center, angle, offset) {
        const dx = point.x - center.x;
        const dy = point.y - center.y;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        return {
            x: dx * cos - dy * sin + offset.x,
            y: dx * sin + dy * cos + offset.y
        };
    }

    _extractQuadCrop(sourceImage, points) {
        const { width: imgW, height: imgH } = this._getSourceDimensions(sourceImage);
        if (!imgW || !imgH) {
            return null;
        }

        const sourceCanvas = this._renderSourceToCanvas(sourceImage);
        if (!sourceCanvas.width || !sourceCanvas.height) {
            return null;
        }

        const angle = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
        const diagonal = Math.ceil(Math.hypot(imgW, imgH));
        if (!diagonal) {
            return null;
        }

        const rotatedCanvas = document.createElement('canvas');
        rotatedCanvas.width = diagonal;
        rotatedCanvas.height = diagonal;

        const rotatedCtx = rotatedCanvas.getContext('2d', { willReadFrequently: true });
        rotatedCtx.translate(diagonal / 2, diagonal / 2);
        rotatedCtx.rotate(-angle);
        rotatedCtx.drawImage(sourceCanvas, -imgW / 2, -imgH / 2);
        rotatedCtx.setTransform(1, 0, 0, 1, 0, 0);

        const sourceCenter = { x: imgW / 2, y: imgH / 2 };
        const targetCenter = { x: diagonal / 2, y: diagonal / 2 };
        const uprightPoints = points.map(point => this._rotatePoint(point, sourceCenter, -angle, targetCenter));

        const padding = 4;
        const xs = uprightPoints.map(point => point.x);
        const ys = uprightPoints.map(point => point.y);
        const sx = Math.max(0, Math.min(...xs) - padding);
        const sy = Math.max(0, Math.min(...ys) - padding);
        const sw = Math.min(rotatedCanvas.width - sx, Math.max(...xs) - Math.min(...xs) + padding * 2);
        const sh = Math.min(rotatedCanvas.height - sy, Math.max(...ys) - Math.min(...ys) + padding * 2);
        if (sw <= 0 || sh <= 0) {
            return null;
        }

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = Math.max(1, Math.ceil(sw));
        cropCanvas.height = Math.max(1, Math.ceil(sh));
        const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
        cropCtx.drawImage(rotatedCanvas, sx, sy, sw, sh, 0, 0, cropCanvas.width, cropCanvas.height);

        return {
            cropCanvas,
            cropRect: { x: sx, y: sy, width: sw, height: sh },
            cropScale: { x: sw / cropCanvas.width, y: sh / cropCanvas.height },
            angle,
            sourceCenter: { x: imgW / 2, y: imgH / 2 },
            targetCenter: { x: diagonal / 2, y: diagonal / 2 }
        };
    }

    _drawPortraitQuadCrop(sourceImage, points, faceCanvas) {
        const extraction = this._extractQuadCrop(sourceImage, points);
        if (!extraction) {
            return false;
        }

        this._drawCroppedPortrait(
            extraction.cropCanvas,
            0,
            0,
            extraction.cropCanvas.width,
            extraction.cropCanvas.height,
            faceCanvas
        );
        return true;
    }

    _clearFaceCanvas(faceCanvas) {
        const ctx = faceCanvas.getContext('2d', { willReadFrequently: true });
        ctx.clearRect(0, 0, faceCanvas.width, faceCanvas.height);
    }

    /**
     * Wire the CaptureVisionRouter and register an IntermediateResultReceiver
     * to collect intermediate processing units needed by IdentityProcessor.
     */
    async setCVR(cvrInstance) {
        if (!cvrInstance) return;

        this.cvr = cvrInstance;
        this.irm = this.cvr.getIntermediateResultManager();

        // Create and register the intermediate result receiver
        this.irr = new Dynamsoft.CVR.IntermediateResultReceiver();

        this.irr.onDetectedQuadsReceived = (result, info) => {
            if (info.isSectionLevelResult) {
                this._storeUnit('detectedQuadsUnit', result);
            }
        };

        this.irr.onDeskewedImageReceived = (result, info) => {
            if (info.isSectionLevelResult) {
                this._storeUnit('deskewedImageUnit', result);
            }
        };

        this.irr.onLocalizedTextLinesReceived = (result, info) => {
            if (info.isSectionLevelResult) {
                this._storeUnit('localizedTextLinesUnit', result);
            }
        };

        this.irr.onRecognizedTextLinesReceived = (result, info) => {
            if (info.isSectionLevelResult) {
                this._storeUnit('recognizedTextLinesUnit', result);
            }
        };

        this.irr.onScaledColourImageUnitReceived = (result) => {
            this._storeUnit('scaledColourImageUnit', result);
        };

        await this.irm.addResultReceiver(this.irr);

        this.isInitialized = true;
        console.log('✅ FaceProcessor ready (IntermediateResultReceiver + IdentityProcessor)');
    }

    /**
     * Clear stored intermediate results before a new capture.
     */
    clearIntermediateResults() {
        this._units = {};
    }

    /**
     * After cvr.capture("ReadPassportAndId") completes, call this to extract
     * the portrait zone using IdentityProcessor.findPortraitZone() and draw
     * the document border + portrait overlay.
     *
     * @param {CapturedResult} capturedResult – the result from cvr.capture()
     * @param {HTMLImageElement} imageElement – the source image element
     * @param {HTMLCanvasElement} faceCanvas – canvas for cropped portrait
     * @param {HTMLCanvasElement} canvasOverlay – overlay canvas for annotations
     */
    async processCapturedResult(capturedResult, imageElement, faceCanvas, canvasOverlay) {
        if (!this.isInitialized) {
            this._clearFaceCanvas(faceCanvas);
            return;
        }

        let detectedQuad = null;
        let portraitZone = null;

        try {
            // 1. Extract detected document border from captured result items
            if (capturedResult && capturedResult.items) {
                for (const item of capturedResult.items) {
                    if (item.type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_DETECTED_QUAD) {
                        detectedQuad = item;
                        break;
                    }
                }
            }

            // 2. Find portrait zone using the same unit group assembly as the Python reference.
            portraitZone = await this.findPortraitZoneForCapturedResult(capturedResult);

            // 3. Draw document border
            if (detectedQuad) {
                const { width: srcW, height: srcH } = this._getSourceDimensions(imageElement);
                this.drawDocumentBorder(detectedQuad, canvasOverlay, srcW, srcH);
            }

            // 4. Draw portrait zone and crop
            if (portraitZone) {
                this.drawAndCropPortrait(portraitZone, imageElement, faceCanvas, canvasOverlay);
            } else {
                this._clearFaceCanvas(faceCanvas);
            }

        } catch (e) {
            console.error('FaceProcessor error:', e);
            this._clearFaceCanvas(faceCanvas);
        }
    }

    /**
     * Draw the detected document border quadrilateral on the overlay (cyan dashed).
     */
    drawDocumentBorder(quadItem, canvasOverlay, imgW, imgH) {
        const loc = quadItem.location;
        if (!loc || !loc.points || loc.points.length < 4) return;

        const clamped = this._clampPoints(loc.points, imgW, imgH);
        this._drawQuad(clamped, canvasOverlay, 'Document Border', true);

        console.log(
            `✅ Document border: [${clamped.map(p => `(${Math.round(p.x)},${Math.round(p.y)})`).join(', ')}]`
        );
    }

    /**
     * Draw and crop the portrait zone returned by IdentityProcessor.
     */
    drawAndCropPortrait(portraitZone, sourceImage, faceCanvas, canvasOverlay) {
        const pts = portraitZone.points;
        if (!pts || pts.length < 4) return;

        const { width: imgW, height: imgH } = this._getSourceDimensions(sourceImage);

        const clamped = this._clampPoints(pts, imgW, imgH);

        this._drawQuad(clamped, canvasOverlay, 'Portrait (Identity)', false, '#0070f3');
        if (!this._drawPortraitQuadCrop(sourceImage, clamped, faceCanvas)) {
            this._clearFaceCanvas(faceCanvas);
            return;
        }

        const xs = clamped.map(p => p.x);
        const ys = clamped.map(p => p.y);

        console.log(
            `✅ Portrait (Identity): [${clamped.map(p => `(${Math.round(p.x)},${Math.round(p.y)})`).join(', ')}] bbox ${Math.round(Math.min(...xs))},${Math.round(Math.min(...ys))} ${Math.round(Math.max(...xs) - Math.min(...xs))}×${Math.round(Math.max(...ys) - Math.min(...ys))}`
        );
    }

    /**
     * Common helper: draw a cropped region onto the face canvas preserving aspect ratio.
     */
    _drawCroppedPortrait(sourceImage, sx, sy, sw, sh, faceCanvas) {
        const ctx = faceCanvas.getContext('2d', { willReadFrequently: true });
        ctx.clearRect(0, 0, faceCanvas.width, faceCanvas.height);

        if (sw <= 0 || sh <= 0) return;

        const srcAspect = sw / sh;
        const dstAspect = faceCanvas.width / faceCanvas.height;
        let dw, dh, dx, dy;

        if (srcAspect > dstAspect) {
            dw = faceCanvas.width;
            dh = dw / srcAspect;
            dx = 0;
            dy = (faceCanvas.height - dh) / 2;
        } else {
            dh = faceCanvas.height;
            dw = dh * srcAspect;
            dx = (faceCanvas.width - dw) / 2;
            dy = 0;
        }

        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, faceCanvas.width, faceCanvas.height);
        ctx.drawImage(sourceImage, sx, sy, sw, sh, dx, dy, dw, dh);
    }

}

// Global singleton
const faceProcessor = new FaceProcessor();

window.initFaceDetection = function () {
    console.log('FaceProcessor ready (Dynamsoft portrait if available, otherwise document-quad fallback)');
};

window.runFaceDetection = async function (imageElement, faceCanvas, canvasOverlay) {
    await faceProcessor.run(imageElement, faceCanvas, canvasOverlay);
};
