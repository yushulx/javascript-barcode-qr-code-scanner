// ZXing-WASM camera scanner with getUserMedia
import { readBarcodesFromImageData } from './libs/zxing-wasm/es/reader/index.js';

let selectedDeviceId;
let stream;
let isScanning = false;
let animationId = null;

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', async () => {
    const divScanner = document.getElementById('divScanner');
    const resultArea = document.getElementById('result');
    const statusElement = document.getElementById('status');
    const closeBtn = document.getElementById('closeBtn');
    const overlayCanvas = document.getElementById('overlayCanvas');

    // Close button handler
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            stopScanning();
            window.close();
        });
    }

    // Create video element for camera
    const video = document.createElement('video');
    video.id = 'scanner-video';
    video.autoplay = true;
    video.playsInline = true;
    divScanner.appendChild(video);

    try {
        // Get available cameras
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        if (videoDevices.length === 0) {
            statusElement.textContent = 'No cameras found';
            alert('No cameras found. Please connect a camera and try again.');
            return;
        }

        // Use first camera by default
        selectedDeviceId = videoDevices[0].deviceId;

        // Start camera
        statusElement.textContent = 'Starting camera...';
        await startScanning(video, resultArea, statusElement);

    } catch (err) {
        statusElement.textContent = 'Error: ' + err.message;
        alert('Error accessing camera: ' + err.message);
    }
});

function stopScanning() {
    isScanning = false;
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
}

async function startScanning(video, resultArea, statusElement) {
    try {
        // Stop any existing stream
        stopScanning();

        // Get video stream from selected camera
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });

        video.srcObject = stream;
        await video.play();

        statusElement.textContent = '📸 Scanning... Point camera at barcode';
        isScanning = true;
        scanFrame(video, resultArea, statusElement);
    } catch (err) {
        statusElement.textContent = 'Error: ' + err.message;
        alert('Error starting camera: ' + err.message);
    }
}

async function scanFrame(video, resultArea, statusElement) {
    if (!isScanning) return;

    try {
        // Create canvas and get image data from video
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Read barcodes from current video frame
        const results = await readBarcodesFromImageData(imageData, {
            maxSymbols: 1
        });

        // Draw overlay
        const overlayCanvas = document.getElementById('overlayCanvas');
        if (overlayCanvas) {
            const overlayCtx = overlayCanvas.getContext('2d');

            // Get displayed video dimensions
            const displayWidth = video.clientWidth;
            const displayHeight = video.clientHeight;

            // Set overlay canvas to match displayed size
            overlayCanvas.width = displayWidth;
            overlayCanvas.height = displayHeight;
            overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

            if (results.length > 0) {
                // Calculate scale and offset for object-fit: cover
                const videoAspect = video.videoWidth / video.videoHeight;
                const displayAspect = displayWidth / displayHeight;

                let scaleX, scaleY, offsetX = 0, offsetY = 0;

                if (videoAspect > displayAspect) {
                    // Video is wider - crop left/right
                    scaleY = displayHeight / video.videoHeight;
                    scaleX = scaleY;
                    offsetX = (displayWidth - video.videoWidth * scaleX) / 2;
                } else {
                    // Video is taller - crop top/bottom
                    scaleX = displayWidth / video.videoWidth;
                    scaleY = scaleX;
                    offsetY = (displayHeight - video.videoHeight * scaleY) / 2;
                }

                results.forEach(result => {
                    if (result.position) {
                        const points = result.position;
                        const topLeft = points.topLeft;
                        const topRight = points.topRight;
                        const bottomRight = points.bottomRight;
                        const bottomLeft = points.bottomLeft;

                        if (topLeft && topRight && bottomRight && bottomLeft) {
                            overlayCtx.strokeStyle = '#00ff00';
                            overlayCtx.lineWidth = 3;
                            overlayCtx.beginPath();
                            overlayCtx.moveTo(topLeft.x * scaleX + offsetX, topLeft.y * scaleY + offsetY);
                            overlayCtx.lineTo(topRight.x * scaleX + offsetX, topRight.y * scaleY + offsetY);
                            overlayCtx.lineTo(bottomRight.x * scaleX + offsetX, bottomRight.y * scaleY + offsetY);
                            overlayCtx.lineTo(bottomLeft.x * scaleX + offsetX, bottomLeft.y * scaleY + offsetY);
                            overlayCtx.closePath();
                            overlayCtx.stroke();
                        }
                    }
                });
            }
        }

        if (results.length > 0) {
            const result = results[0];
            const text = result.text;
            const format = result.format;

            // Display result
            const timestamp = new Date().toLocaleTimeString();
            const resultText = `[${timestamp}]\nText: ${text}\nFormat: ${format}\n\n`;

            // Prepend new results
            resultArea.value = resultText + resultArea.value;

            statusElement.textContent = `✅ Found ${format} barcode!`;

            // Reset status after 2 seconds
            setTimeout(() => {
                if (isScanning) {
                    statusElement.textContent = '📸 Scanning... Point camera at barcode';
                }
            }, 2000);
        }
    } catch (err) {
        // No barcode found in this frame or error, continue scanning
    }

    // Continue scanning
    if (isScanning) {
        animationId = requestAnimationFrame(() => scanFrame(video, resultArea, statusElement));
    }
}

// Handle page unload
window.addEventListener('beforeunload', () => {
    stopScanning();
});
