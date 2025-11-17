// ZXing-WASM based barcode scanner (open-source, no license required)
import { readBarcodesFromImageData } from './libs/zxing-wasm/es/reader/index.js';

// Configure PDF.js worker
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdfjs/pdf.worker.min.js';
}

let pdfPages = []; // Store all PDF pages
let currentPageIndex = 0;
let pageResults = []; // Store barcode results for each page

const divScanner = document.getElementById("divScanner");
const container = document.getElementById("container");
const resultArea = document.getElementById("result");
const imageContainer = document.getElementById("imageContainer");
const imageCanvas = document.getElementById("imageCanvas");
const pageNavigation = document.getElementById("pageNavigation");
const prevPageBtn = document.getElementById("prevPage");
const nextPageBtn = document.getElementById("nextPage");
const pageInfo = document.getElementById("pageInfo");
const screenshotBtn = document.getElementById("screenshot");
const settingsPanel = document.getElementById("settingsPanel");
const openSettingsBtn = document.getElementById("openSettings");
const closeSettingsBtn = document.getElementById("closeSettings");
const showFloatingIconToggle = document.getElementById("showFloatingIconToggle");
const statusMessage = document.getElementById("statusMessage");

// Settings Panel
openSettingsBtn.addEventListener('click', () => {
    settingsPanel.classList.add('open');
});

closeSettingsBtn.addEventListener('click', () => {
    settingsPanel.classList.remove('open');
});

// Load floating icon setting
chrome.storage.local.get(['showFloatingIcon'], (result) => {
    showFloatingIconToggle.checked = result.showFloatingIcon !== false;
});

// Save floating icon setting
showFloatingIconToggle.addEventListener('change', () => {
    const showIcon = showFloatingIconToggle.checked;
    chrome.storage.local.set({ showFloatingIcon: showIcon });
});

// Listen for messages from background script (context menu, screenshot)
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === 'decodeImageUrl') {
        decodeImageFromUrl(request.imageUrl);
    } else if (request.action === 'screenshotResult') {
        if (request.success && request.dataUrl) {
            try {
                const fetchResponse = await fetch(request.dataUrl);
                const blob = await fetchResponse.blob();
                const file = new File([blob], 'screenshot.png', { type: 'image/png' });

                const fileInput = document.getElementById('file');
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                fileInput.files = dataTransfer.files;

                const event = new Event('change', { bubbles: true });
                fileInput.dispatchEvent(event);
            } catch (error) {
                resultArea.value = `Error processing screenshot: ${error.message}`;
                toggleLoading(false);
            }
        } else if (request.cancelled) {
            // Screenshot cancelled
        } else {
            if (request.error) {
                resultArea.value = `Error: ${request.error}`;
            }
        }
    }
});

// Function to decode image from URL (context menu)
async function decodeImageFromUrl(imageUrl) {
    try {
        toggleLoading(true);

        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], 'context-menu-image.jpg', { type: blob.type });

        const fileInput = document.getElementById('file');
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;

        const event = new Event('change', { bubbles: true });
        fileInput.dispatchEvent(event);
    } catch (error) {
        resultArea.value = `Error: ${error.message}`;
        toggleLoading(false);
    }
}

function toggleLoading(isLoading) {
    if (isLoading) {
        document.getElementById("loading-indicator").style.display = "flex";
    } else {
        document.getElementById("loading-indicator").style.display = "none";
    }
}

// Decode image using ZXing-WASM
async function decodeImage(imageSource) {
    try {
        // Get image data from canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = imageSource.width || imageSource.naturalWidth;
        canvas.height = imageSource.height || imageSource.naturalHeight;
        ctx.drawImage(imageSource, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        const results = await readBarcodesFromImageData(imageData, {
            maxSymbols: 1
        });

        if (results.length > 0) {
            return {
                items: results.map(result => ({
                    text: result.text,
                    formatString: result.format,
                    location: result.position
                }))
            };
        }
        return { items: [] };
    } catch (error) {
        return { items: [] };
    }
}

// Decode multiple barcodes from image
async function decodeMultipleBarcodes(imageSource) {
    try {
        // Get image data from canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = imageSource.width || imageSource.naturalWidth;
        canvas.height = imageSource.height || imageSource.naturalHeight;
        ctx.drawImage(imageSource, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        // Read all barcodes from the image
        const results = await readBarcodesFromImageData(imageData, {
            maxSymbols: 255  // Find all barcodes
        });

        if (results.length > 0) {
            return {
                items: results.map(result => ({
                    text: result.text,
                    formatString: result.format,
                    location: result.position
                }))
            };
        }
        return { items: [] };
    } catch (error) {
        return { items: [] };
    }
}

function displayPage(pageIndex) {
    currentPageIndex = pageIndex;

    const ctx = imageCanvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
        imageCanvas.width = img.width;
        imageCanvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // Draw barcode overlays
        drawBarcodeOverlay();
    };
    img.src = pdfPages[pageIndex].url;

    pageInfo.textContent = `Page ${pageIndex + 1} of ${pdfPages.length}`;
    prevPageBtn.disabled = pageIndex === 0;
    nextPageBtn.disabled = pageIndex === pdfPages.length - 1;

    displayCurrentPageResults();
}

function drawBarcodeOverlay() {
    const ctx = imageCanvas.getContext('2d');
    const currentResults = pageResults[currentPageIndex];

    if (!currentResults || !currentResults.items) return;

    currentResults.items.forEach((item, index) => {
        if (!item.location) return;

        const points = item.location;
        if (!points || points.length < 2) return;

        // Draw bounding box
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 3;
        ctx.beginPath();

        // Get corner points (zxing-wasm returns topLeft, topRight, bottomRight, bottomLeft)
        const topLeft = points.topLeft || points[0];
        const topRight = points.topRight || points[1];
        const bottomRight = points.bottomRight || points[2];
        const bottomLeft = points.bottomLeft || points[3];

        if (topLeft && topRight && bottomRight && bottomLeft) {
            ctx.moveTo(topLeft.x, topLeft.y);
            ctx.lineTo(topRight.x, topRight.y);
            ctx.lineTo(bottomRight.x, bottomRight.y);
            ctx.lineTo(bottomLeft.x, bottomLeft.y);
            ctx.closePath();
            ctx.stroke();

            // Draw label background
            const text = `${index + 1}: ${item.formatString}`;
            ctx.font = '16px Arial';
            const textMetrics = ctx.measureText(text);
            const textWidth = textMetrics.width;
            const textHeight = 20;

            ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
            ctx.fillRect(topLeft.x, topLeft.y - textHeight - 5, textWidth + 10, textHeight + 5);

            // Draw label text
            ctx.fillStyle = '#000';
            ctx.fillText(text, topLeft.x + 5, topLeft.y - 8);
        }
    });
}

function displayCurrentPageResults() {
    const currentPageBarcodeCount = pageResults[currentPageIndex] && pageResults[currentPageIndex].items ? pageResults[currentPageIndex].items.length : 0;

    // Show current page barcode count in the format
    if (pdfPages.length > 1) {
        resultArea.value = `📊 Page ${currentPageIndex + 1}: ${currentPageBarcodeCount} barcode${currentPageBarcodeCount !== 1 ? 's' : ''} found\n\n`;
    } else {
        resultArea.value = `📊 Total: ${currentPageBarcodeCount} barcode${currentPageBarcodeCount !== 1 ? 's' : ''} found\n\n`;
    }

    if (pageResults[currentPageIndex] && pageResults[currentPageIndex].items && pageResults[currentPageIndex].items.length > 0) {
        pageResults[currentPageIndex].items.forEach(item => {
            resultArea.value += "Text: " + item.text + "\n";
            resultArea.value += "Format: " + item.formatString + "\n\n";
        });
    } else {
        resultArea.value += "No barcodes found.\n";
    }
}

function displayAllResults() {
    // For initial load, just show the first page
    displayCurrentPageResults();
}

prevPageBtn.addEventListener('click', () => {
    if (currentPageIndex > 0) {
        displayPage(currentPageIndex - 1);
    }
});

nextPageBtn.addEventListener('click', () => {
    if (currentPageIndex < pdfPages.length - 1) {
        displayPage(currentPageIndex + 1);
    }
});

// Camera scan button
document.getElementById("scan").addEventListener('click', async () => {
    chrome.tabs.create({
        url: chrome.runtime.getURL('scanner.html')
    });
});

// File upload handler
document.getElementById("file").onchange = async function () {
    try {
        pdfPages = [];
        pageResults = [];
        currentPageIndex = 0;

        imageContainer.style.display = "none";
        const files = Array.from(this.files || []);
        if (files.length) {
            try {
                toggleLoading(true);
                let fileToProcess = files[0];

                let pages = await processFile(fileToProcess);
                pdfPages = pages;
                pageResults = new Array(pages.length);

                for (let i = 0; i < pages.length; i++) {
                    try {
                        const img = document.createElement('img');
                        img.src = pages[i].url;
                        await new Promise(resolve => img.onload = resolve);

                        let result = await decodeMultipleBarcodes(img);
                        pageResults[i] = result;
                    } catch (error) {
                        pageResults[i] = { items: [] };
                    }
                }

                if (pages.length > 0) {
                    imageContainer.style.display = "flex";
                    displayPage(0);
                    displayAllResults();
                }

                toggleLoading(false);
            } catch (error) {
                resultArea.value = `Error: ${error.message}`;
                toggleLoading(false);
            }
        }
    } catch (error) {
        resultArea.value = `Error: ${error.message}`;
        toggleLoading(false);
    }
};

async function processFile(fileToProcess) {
    return new Promise(async (resolve, reject) => {
        try {
            if (fileToProcess.type !== "application/pdf") {
                // Single image file
                const url = URL.createObjectURL(fileToProcess);
                resolve([{ blob: fileToProcess, url }]);
                return;
            }

            // PDF file - convert each page to image using PDF.js
            const arrayBuffer = await fileToProcess.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            const pageCount = pdf.numPages;
            let pages = [];

            for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
                const page = await pdf.getPage(pageNum);
                const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better quality

                // Create canvas for rendering
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                // Render PDF page to canvas
                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;

                // Convert canvas to blob
                const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
                const url = canvas.toDataURL('image/png');

                pages.push({ blob, url, width: viewport.width, height: viewport.height });
            }

            resolve(pages);
        } catch (error) {
            reject(error);
        }
    });
}

// Screenshot button handler
screenshotBtn.addEventListener('click', async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['screenshot-selector.js']
        });
    } catch (error) {
        alert(`Error: ${error.message}. Make sure you're on a regular web page, not chrome:// or extension pages.`);
    }
});

// Drag and drop support
const dropZone = document.body;
const dropZoneElement = document.getElementById('dropZone');

[dropZone, dropZoneElement].forEach(element => {
    element.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.outline = '3px dashed #667eea';
        dropZone.style.outlineOffset = '-10px';
        dropZone.style.backgroundColor = 'rgba(102, 126, 234, 0.05)';
        if (dropZoneElement) {
            dropZoneElement.classList.add('drag-over');
        }
    });

    element.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.target === dropZone || e.target === dropZoneElement) {
            dropZone.style.outline = 'none';
            dropZone.style.backgroundColor = 'transparent';
            if (dropZoneElement) {
                dropZoneElement.classList.remove('drag-over');
            }
        }
    });

    element.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.style.outline = 'none';
        dropZone.style.backgroundColor = 'transparent';
        if (dropZoneElement) {
            dropZoneElement.classList.remove('drag-over');
        }

        toggleLoading(true);

        // Check for files first (local file system drops)
        const files = e.dataTransfer.files;

        if (files.length > 0) {
            const file = files[0];

            const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/bmp', 'image/webp', 'application/pdf'];
            if (!validTypes.includes(file.type)) {
                alert('Please drop an image or PDF file. Detected type: ' + file.type);
                toggleLoading(false);
                return;
            }

            const fileInput = document.getElementById('file');
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;

            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            return;
        }

        // Handle web image drops - check all possible data types
        const types = e.dataTransfer.types;

        // Try different data formats that browsers use for images
        let imageUrl = null;

        // Check for URL formats
        if (types.includes('text/uri-list')) {
            imageUrl = e.dataTransfer.getData('text/uri-list');
        } else if (types.includes('text/plain')) {
            imageUrl = e.dataTransfer.getData('text/plain');
        } else if (types.includes('text/html')) {
            // Extract image src from HTML
            const html = e.dataTransfer.getData('text/html');
            const match = html.match(/<img[^>]+src="([^"]+)"/i) || html.match(/<img[^>]+src='([^']+)'/i);
            if (match) {
                imageUrl = match[1];
            }
        }

        if (imageUrl) {
            imageUrl = imageUrl.trim().split('\n')[0]; // Take first line if multiple URLs
            await decodeImageFromUrl(imageUrl);
        } else {
            alert('Please drop an image or PDF file. No valid image data detected.');
            toggleLoading(false);
        }
    });
});

// Initialize
if (statusMessage) {
    statusMessage.textContent = '📷 100% Free • No Login Required • Open Source';
}
