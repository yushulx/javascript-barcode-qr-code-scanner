/**
 * PaddleOCR Processor using ONNX Runtime Web
 * Uses PP-OCRv4 small/mobile models for efficient web inference
 * - Detection: ch_PP-OCRv4_det.onnx (~4.7MB)
 * - Recognition: ch_PP-OCRv4_rec.onnx (~10.8MB)
 */

class OCRProcessor {
    constructor() {
        this.detSession = null;
        this.recSession = null;
        this.isInitialized = false;

        // PP-OCRv4 character dictionary (simplified for common chars)
        // Full dictionary should be loaded from ppocr_keys_v1.txt
        this.characters = null;
    }

    async init() {
        try {
            const options = {
                executionProviders: ['webgpu', 'wasm'],
                graphOptimizationLevel: 'all'
            };

            console.log("Loading PaddleOCR models...");

            // Load detection model
            try {
                this.detSession = await ort.InferenceSession.create('./assets/ch_PP-OCRv4_det.onnx', options);
                console.log("✅ Detection model loaded");
            } catch (e) {
                console.error("❌ Failed to load detection model:", e);
                return;
            }

            // Load recognition model
            try {
                this.recSession = await ort.InferenceSession.create('./assets/ch_PP-OCRv4_rec.onnx', options);
                console.log("✅ Recognition model loaded");
            } catch (e) {
                console.error("❌ Failed to load recognition model:", e);
                return;
            }

            // Load character dictionary
            try {
                const response = await fetch('./assets/ppocr_keys_v1.txt');
                const text = await response.text();
                this.characters = ['blank', ...text.split('\n').filter(c => c.length > 0), ' '];
                console.log(`✅ Loaded ${this.characters.length} characters`);
            } catch (e) {
                console.warn("⚠️ Could not load character dictionary, using default");
                this.characters = this.getDefaultCharacters();
            }

            this.isInitialized = true;
            console.log("✅ PaddleOCR initialized successfully");

        } catch (e) {
            console.error("Failed to initialize OCR processor:", e);
        }
    }

    getDefaultCharacters() {
        // Basic alphanumeric + common symbols
        const chars = ['blank'];
        // Numbers
        for (let i = 0; i <= 9; i++) chars.push(String(i));
        // Uppercase letters
        for (let i = 65; i <= 90; i++) chars.push(String.fromCharCode(i));
        // Lowercase letters
        for (let i = 97; i <= 122; i++) chars.push(String.fromCharCode(i));
        // Common symbols
        chars.push(...'<>/-., '.split(''));
        return chars;
    }

    async run(imageElement, ocrResultsDiv, canvasOverlay, mrzZone = null) {
        if (!this.isInitialized) {
            ocrResultsDiv.textContent = "OCR not initialized. Models may be missing.";
            return [];
        }

        try {
            // Step 1: Detect text regions
            let boxes = await this.detectText(imageElement);

            // Step 2: Filter out boxes that overlap with MRZ zone (Dynamsoft handles MRZ)
            if (mrzZone) {
                boxes = boxes.filter(box => !this.overlapsWithMrz(box, mrzZone));
            }

            // Step 3: Recognize text in each non-MRZ region
            const results = [];
            for (const box of boxes) {
                const text = await this.recognizeText(imageElement, box);
                if (text && text.trim().length > 0) {
                    results.push({ box, text });
                }
            }

            // Step 4: Draw overlays for non-MRZ regions and display results
            this.drawOverlays(canvasOverlay, results);
            this.displayResults(ocrResultsDiv, results);

            return results;

        } catch (e) {
            console.error("OCR processing error:", e);
            ocrResultsDiv.textContent = "OCR Error: " + e.message;
            return [];
        }
    }

    overlapsWithMrz(box, mrzZone) {
        // Check if box overlaps with MRZ zone (with some margin)
        const margin = 20;
        const mrzLeft = mrzZone.x - margin;
        const mrzRight = mrzZone.x + mrzZone.width + margin;
        const mrzTop = mrzZone.y - margin;
        const mrzBottom = mrzZone.y + mrzZone.height + margin;

        const boxRight = box.x + box.width;
        const boxBottom = box.y + box.height;

        // Check for overlap
        return !(box.x > mrzRight || boxRight < mrzLeft ||
            box.y > mrzBottom || boxBottom < mrzTop);
    }

    async detectText(imageElement) {
        // PP-OCRv4 detection expects dynamic input size (divisible by 32)
        const maxSide = 960;
        let targetW = imageElement.naturalWidth;
        let targetH = imageElement.naturalHeight;

        // Scale to max side
        const ratio = Math.min(maxSide / targetW, maxSide / targetH, 1.0);
        targetW = Math.round(targetW * ratio);
        targetH = Math.round(targetH * ratio);

        // Make divisible by 32
        targetW = Math.ceil(targetW / 32) * 32;
        targetH = Math.ceil(targetH / 32) * 32;

        // Create preprocessed image
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, targetW, targetH);

        // Draw image scaled
        const drawW = imageElement.naturalWidth * ratio;
        const drawH = imageElement.naturalHeight * ratio;
        ctx.drawImage(imageElement, 0, 0, drawW, drawH);

        const imageData = ctx.getImageData(0, 0, targetW, targetH);
        const pixels = imageData.data;

        // Normalize: (pixel / 255 - mean) / std
        const mean = [0.485, 0.456, 0.406];
        const std = [0.229, 0.224, 0.225];
        const input = new Float32Array(3 * targetH * targetW);

        for (let h = 0; h < targetH; h++) {
            for (let w = 0; w < targetW; w++) {
                const idx = h * targetW + w;
                const pixelIdx = idx * 4;
                input[idx] = ((pixels[pixelIdx] / 255) - mean[0]) / std[0];
                input[targetH * targetW + idx] = ((pixels[pixelIdx + 1] / 255) - mean[1]) / std[1];
                input[2 * targetH * targetW + idx] = ((pixels[pixelIdx + 2] / 255) - mean[2]) / std[2];
            }
        }

        const inputTensor = new ort.Tensor('float32', input, [1, 3, targetH, targetW]);
        const feeds = { x: inputTensor };

        const results = await this.detSession.run(feeds);
        const output = results[Object.keys(results)[0]];

        // Post-process detection output to get bounding boxes
        const boxes = this.postProcessDetection(output, targetW, targetH,
            imageElement.naturalWidth, imageElement.naturalHeight, ratio);

        return boxes;
    }

    postProcessDetection(output, inputW, inputH, origW, origH, ratio) {
        const data = output.data;
        const h = output.dims[2];
        const w = output.dims[3];

        // Convert probability map to binary mask
        const threshold = 0.3;
        const mask = new Uint8Array(h * w);
        for (let i = 0; i < h * w; i++) {
            mask[i] = data[i] > threshold ? 255 : 0;
        }

        // Find contours (simplified connected component analysis)
        const boxes = this.findContours(mask, w, h, origW, origH, ratio);
        return boxes;
    }

    findContours(mask, w, h, origW, origH, ratio) {
        const visited = new Uint8Array(w * h);
        const boxes = [];
        const minArea = 100;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = y * w + x;
                if (mask[idx] === 255 && !visited[idx]) {
                    // BFS to find connected region
                    const region = [];
                    const queue = [[x, y]];
                    visited[idx] = 1;

                    while (queue.length > 0) {
                        const [cx, cy] = queue.shift();
                        region.push([cx, cy]);

                        // Check 4-neighbors
                        const neighbors = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
                        for (const [nx, ny] of neighbors) {
                            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                                const nidx = ny * w + nx;
                                if (mask[nidx] === 255 && !visited[nidx]) {
                                    visited[nidx] = 1;
                                    queue.push([nx, ny]);
                                }
                            }
                        }
                    }

                    if (region.length >= minArea) {
                        // Get bounding box
                        let minX = w, maxX = 0, minY = h, maxY = 0;
                        for (const [px, py] of region) {
                            minX = Math.min(minX, px);
                            maxX = Math.max(maxX, px);
                            minY = Math.min(minY, py);
                            maxY = Math.max(maxY, py);
                        }

                        // Scale back to original image coordinates
                        const box = {
                            x: Math.round(minX / ratio),
                            y: Math.round(minY / ratio),
                            width: Math.round((maxX - minX) / ratio),
                            height: Math.round((maxY - minY) / ratio)
                        };

                        // Expand box slightly
                        const pad = 5;
                        box.x = Math.max(0, box.x - pad);
                        box.y = Math.max(0, box.y - pad);
                        box.width = Math.min(origW - box.x, box.width + 2 * pad);
                        box.height = Math.min(origH - box.y, box.height + 2 * pad);

                        if (box.width > 10 && box.height > 5) {
                            boxes.push(box);
                        }
                    }
                }
            }
        }

        // Sort boxes top-to-bottom, left-to-right
        boxes.sort((a, b) => {
            if (Math.abs(a.y - b.y) < 20) return a.x - b.x;
            return a.y - b.y;
        });

        return boxes;
    }

    async recognizeText(imageElement, box) {
        // PP-OCRv4 recognition expects height of 48, width variable
        const targetH = 48;
        const aspectRatio = box.width / box.height;
        const targetW = Math.max(48, Math.min(320, Math.round(targetH * aspectRatio)));

        // Crop and resize the text region
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, targetW, targetH);

        // Draw cropped region
        ctx.drawImage(imageElement,
            box.x, box.y, box.width, box.height,
            0, 0, targetW, targetH);

        const imageData = ctx.getImageData(0, 0, targetW, targetH);
        const pixels = imageData.data;

        // Normalize: (pixel / 255 - 0.5) / 0.5
        const input = new Float32Array(3 * targetH * targetW);
        for (let h = 0; h < targetH; h++) {
            for (let w = 0; w < targetW; w++) {
                const idx = h * targetW + w;
                const pixelIdx = idx * 4;
                input[idx] = ((pixels[pixelIdx] / 255) - 0.5) / 0.5;
                input[targetH * targetW + idx] = ((pixels[pixelIdx + 1] / 255) - 0.5) / 0.5;
                input[2 * targetH * targetW + idx] = ((pixels[pixelIdx + 2] / 255) - 0.5) / 0.5;
            }
        }

        const inputTensor = new ort.Tensor('float32', input, [1, 3, targetH, targetW]);
        const feeds = { x: inputTensor };

        const results = await this.recSession.run(feeds);
        const output = results[Object.keys(results)[0]];

        // Decode output using CTC
        const text = this.ctcDecode(output);
        return text;
    }

    ctcDecode(output) {
        const data = output.data;
        const seqLen = output.dims[1];
        const numClasses = output.dims[2];

        let result = '';
        let lastIdx = 0;

        for (let t = 0; t < seqLen; t++) {
            // Find max probability index for this timestep
            let maxIdx = 0;
            let maxVal = data[t * numClasses];
            for (let c = 1; c < numClasses; c++) {
                const val = data[t * numClasses + c];
                if (val > maxVal) {
                    maxVal = val;
                    maxIdx = c;
                }
            }

            // CTC: skip blanks and repeated characters
            if (maxIdx !== 0 && maxIdx !== lastIdx) {
                if (maxIdx < this.characters.length) {
                    result += this.characters[maxIdx];
                }
            }
            lastIdx = maxIdx;
        }

        return result;
    }

    drawOverlays(canvas, results) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        // Draw detection boxes in cyan with numbers
        ctx.strokeStyle = '#00ffff';
        ctx.lineWidth = 2;
        ctx.font = 'bold 16px Arial';

        for (let i = 0; i < results.length; i++) {
            const box = results[i].box;
            const num = i + 1;

            // Draw box
            ctx.strokeRect(box.x, box.y, box.width, box.height);

            // Draw number circle
            const circleRadius = 12;
            const circleX = box.x - circleRadius;
            const circleY = box.y - circleRadius;

            ctx.fillStyle = '#00ffff';
            ctx.beginPath();
            ctx.arc(box.x, box.y, circleRadius, 0, Math.PI * 2);
            ctx.fill();

            // Draw number text
            ctx.fillStyle = '#000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(num.toString(), box.x, box.y);
        }

        // Reset text alignment
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
    }

    displayResults(ocrResultsDiv, results) {
        if (results.length === 0) {
            ocrResultsDiv.textContent = "No text detected.";
            return;
        }

        let html = '<div class="ocr-lines">';
        for (let i = 0; i < results.length; i++) {
            const num = i + 1;
            html += `<div class="ocr-line"><span class="ocr-num">${num}.</span> ${this.escapeHtml(results[i].text)}</div>`;
        }
        html += '</div>';
        ocrResultsDiv.innerHTML = html;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize and export
const ocrProcessor = new OCRProcessor();

window.initOCR = async function () {
    await ocrProcessor.init();
};

window.runOCR = async function (imageElement, ocrResultsDiv, canvasOverlay, mrzZone = null) {
    return await ocrProcessor.run(imageElement, ocrResultsDiv, canvasOverlay, mrzZone);
};
