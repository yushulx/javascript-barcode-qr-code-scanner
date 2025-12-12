/**
 * Face Detection Processor using face-api.js
 * Uses SSD MobileNet V1 for accurate face detection (similar quality to MTCNN)
 */

class FaceProcessor {
    constructor() {
        this.isInitialized = false;
        this.modelsPath = './assets/face-api-models';
    }

    async init() {
        try {
            // Wait for face-api.js to be loaded
            if (typeof faceapi === 'undefined') {
                console.warn("⚠️ face-api.js not loaded yet, waiting...");
                await this.waitForFaceApi();
            }

            console.log("Loading face-api.js models...");

            // Load SSD MobileNet V1 face detector (most accurate)
            await faceapi.nets.ssdMobilenetv1.loadFromUri(this.modelsPath);
            console.log("✅ SSD MobileNet V1 face detector loaded");

            this.isInitialized = true;
            console.log("✅ Face detection initialized successfully");

        } catch (e) {
            console.error("Failed to initialize face processor:", e);
            console.warn("⚠️ Face detection will use fallback position estimation");
            this.isInitialized = false;
        }
    }

    async waitForFaceApi(timeout = 5000) {
        const start = Date.now();
        while (typeof faceapi === 'undefined') {
            if (Date.now() - start > timeout) {
                throw new Error("face-api.js failed to load");
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    async run(imageElement, faceCanvas, canvasOverlay) {
        if (!this.isInitialized) {
            this.simulateFaceDetection(imageElement, faceCanvas, canvasOverlay);
            return;
        }

        try {
            await this.runFaceDetection(imageElement, faceCanvas, canvasOverlay);
        } catch (e) {
            console.error("Face detection error:", e);
            this.simulateFaceDetection(imageElement, faceCanvas, canvasOverlay);
        }
    }

    async runFaceDetection(imageElement, faceCanvas, canvasOverlay) {
        // Detect faces using SSD MobileNet V1
        const detections = await faceapi.detectAllFaces(
            imageElement,
            new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 })
        );

        if (detections.length > 0) {
            // Get the largest face (most likely the passport photo)
            let bestDetection = detections[0];
            let maxArea = 0;

            for (const det of detections) {
                const area = det.box.width * det.box.height;
                if (area > maxArea) {
                    maxArea = area;
                    bestDetection = det;
                }
            }

            const box = bestDetection.box;
            const score = bestDetection.score;

            // Get coordinates
            let x = box.x;
            let y = box.y;
            let w = box.width;
            let h = box.height;

            // Add small margin (5%) for better framing - similar to MTCNN margin
            const margin = 0.05;
            const marginX = w * margin;
            const marginY = h * margin;

            x = Math.max(0, x - marginX);
            y = Math.max(0, y - marginY);
            w = Math.min(imageElement.naturalWidth - x, w + marginX * 2);
            h = Math.min(imageElement.naturalHeight - y, h + marginY * 2);

            // Draw face box on overlay (magenta)
            const overlayCtx = canvasOverlay.getContext('2d', { willReadFrequently: true });
            overlayCtx.strokeStyle = '#ff00ff';
            overlayCtx.lineWidth = 3;
            overlayCtx.strokeRect(x, y, w, h);
            overlayCtx.fillStyle = '#ff00ff';
            overlayCtx.font = '14px Arial';
            overlayCtx.fillText(`Face (${Math.round(score * 100)}%)`, x, y - 5);

            // Crop to face canvas with aspect ratio preserved
            const faceCtx = faceCanvas.getContext('2d', { willReadFrequently: true });
            faceCtx.clearRect(0, 0, faceCanvas.width, faceCanvas.height);

            // Calculate destination dimensions to fit while preserving aspect ratio
            const srcAspect = w / h;
            const dstAspect = faceCanvas.width / faceCanvas.height;
            let dw, dh, dx, dy;

            if (srcAspect > dstAspect) {
                // Source is wider - fit to width
                dw = faceCanvas.width;
                dh = dw / srcAspect;
                dx = 0;
                dy = (faceCanvas.height - dh) / 2;
            } else {
                // Source is taller - fit to height
                dh = faceCanvas.height;
                dw = dh * srcAspect;
                dx = (faceCanvas.width - dw) / 2;
                dy = 0;
            }

            // Fill background
            faceCtx.fillStyle = '#1a1a2e';
            faceCtx.fillRect(0, 0, faceCanvas.width, faceCanvas.height);

            // Draw face image centered and fitted
            faceCtx.drawImage(imageElement, x, y, w, h, dx, dy, dw, dh);

            console.log(`✅ Face detected with ${Math.round(score * 100)}% confidence`);
            return;
        }

        // No face detected - use simulated position
        console.log("No face detected, using estimated position");
        this.simulateFaceDetection(imageElement, faceCanvas, canvasOverlay);
    }

    simulateFaceDetection(image, canvas, canvasOverlay) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const w = image.naturalWidth;
        const h = image.naturalHeight;

        // Passport face is typically in the upper-left area
        const faceWidth = w * 0.35;
        const faceHeight = h * 0.45;
        const sx = w * 0.05;
        const sy = h * 0.15;

        // Draw estimated face region on overlay (yellow dashed)
        const overlayCtx = canvasOverlay.getContext('2d', { willReadFrequently: true });
        overlayCtx.strokeStyle = '#ffff00';
        overlayCtx.lineWidth = 2;
        overlayCtx.setLineDash([5, 5]);
        overlayCtx.strokeRect(sx, sy, faceWidth, faceHeight);
        overlayCtx.setLineDash([]);
        overlayCtx.fillStyle = '#ffff00';
        overlayCtx.font = '14px Arial';
        overlayCtx.fillText('Face (estimated)', sx, sy - 5);

        // Crop estimated region with aspect ratio preserved
        const srcAspect = faceWidth / faceHeight;
        const dstAspect = canvas.width / canvas.height;
        let dw, dh, dx, dy;

        if (srcAspect > dstAspect) {
            dw = canvas.width;
            dh = dw / srcAspect;
            dx = 0;
            dy = (canvas.height - dh) / 2;
        } else {
            dh = canvas.height;
            dw = dh * srcAspect;
            dx = (canvas.width - dw) / 2;
            dy = 0;
        }

        // Fill background
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw face image centered and fitted
        ctx.drawImage(image, sx, sy, faceWidth, faceHeight, dx, dy, dw, dh);
    }
}

// Initialize and export
const faceProcessor = new FaceProcessor();

window.initFaceDetection = async function () {
    await faceProcessor.init();
};

window.runFaceDetection = async function (imageElement, faceCanvas, canvasOverlay) {
    await faceProcessor.run(imageElement, faceCanvas, canvasOverlay);
};