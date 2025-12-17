document.addEventListener('DOMContentLoaded', () => {
    // Configure PDF.js worker
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
    }

    const fileInput = document.getElementById('file-input');
    const cameraButton = document.getElementById('camera-button');
    const addPageButton = document.getElementById('add-page-button');
    const savePdfButton = document.getElementById('save-pdf-button');
    const saveWordButton = document.getElementById('save-word-button');
    const deletePageButton = document.getElementById('delete-page-button');
    const deleteAllButton = document.getElementById('delete-all-button');
    const thumbnailsPanel = document.getElementById('thumbnails-panel');
    const viewerPanel = document.getElementById('viewer-panel');
    const scrollWrapper = document.getElementById('scroll-wrapper');
    const largeViewContainer = document.getElementById('large-view-container');
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const infoBtn = document.getElementById('info-btn');
    const zoomControlsGroup = document.querySelector('.zoom-controls');
    const hiddenContainer = document.getElementById('hidden-container');
    const mainContainer = document.querySelector('main');

    // Editor elements
    const imageToolsGroup = document.getElementById('image-tools-group');
    const textToolsGroup = document.getElementById('text-tools-group');
    const saveTextBtn = document.getElementById('save-text-btn');
    const historyGroup = document.getElementById('history-group');
    const rotateBtn = document.getElementById('rotate-btn');
    const cropBtn = document.getElementById('crop-btn');
    const filterBtn = document.getElementById('filter-btn');
    const resizeBtn = document.getElementById('resize-btn');
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');

    // Modals
    const modalOverlay = document.getElementById('modal-overlay');
    const rotateModal = document.getElementById('rotate-modal');
    const cropModal = document.getElementById('crop-modal');
    const filterModal = document.getElementById('filter-modal');
    const resizeModal = document.getElementById('resize-modal');
    const infoModal = document.getElementById('info-modal');
    const loadingOverlay = document.getElementById('loading-overlay');

    // Rotate Controls
    const rotateLeftBtn = document.getElementById('rotate-left');
    const rotateRightBtn = document.getElementById('rotate-right');
    const rotateSlider = document.getElementById('rotate-slider');
    const rotateVal = document.getElementById('rotate-val');
    const rotateApply = document.getElementById('rotate-apply');
    const rotateCancel = document.getElementById('rotate-cancel');

    // Crop Controls
    const cropApply = document.getElementById('crop-apply');
    const cropCancel = document.getElementById('crop-cancel');
    let cropOverlayDiv = null;
    let cropData = { x: 0, y: 0, w: 0, h: 0 };

    // Filter Controls
    const filterType = document.getElementById('filter-type');
    const thresholdContainer = document.getElementById('threshold-container');
    const thresholdSlider = document.getElementById('threshold-slider');
    const thresholdVal = document.getElementById('threshold-val');
    const brightnessSlider = document.getElementById('brightness-slider');
    const brightnessVal = document.getElementById('brightness-val');
    const contrastSlider = document.getElementById('contrast-slider');
    const contrastVal = document.getElementById('contrast-val');
    const filterApply = document.getElementById('filter-apply');
    const filterCancel = document.getElementById('filter-cancel');

    // Resize Controls
    const resizeWidth = document.getElementById('resize-width');
    const resizeHeight = document.getElementById('resize-height');
    const resizeAspect = document.getElementById('resize-aspect');
    const resizeApply = document.getElementById('resize-apply');
    const resizeCancel = document.getElementById('resize-cancel');

    let tempCanvas = null; // For previews
    let currentRotation = 0;

    // Camera elements
    const cameraOverlay = document.getElementById('camera-overlay');
    const cameraVideo = document.getElementById('camera-video');
    const captureBtn = document.getElementById('capture-btn');
    const closeCameraBtn = document.getElementById('close-camera-btn');
    let mediaStream = null;

    // Scanner elements
    const scannerButton = document.getElementById('scanner-button');
    const scannerModal = document.getElementById('scanner-modal');
    const scannerSourceSelect = document.getElementById('scanner-source');
    const refreshScannersBtn = document.getElementById('refresh-scanners');
    const scanResolution = document.getElementById('scan-resolution');
    const scanAdf = document.getElementById('scan-adf');
    const dwtLicense = document.getElementById('dwt-license');
    const scannerScanBtn = document.getElementById('scanner-scan');
    const scannerCancelBtn = document.getElementById('scanner-cancel');
    const linuxToggleBtn = document.getElementById('linux-toggle-btn');
    const linuxLinks = document.getElementById('linux-links');
    const host = 'http://127.0.0.1:18622';

    let pages = []; // Array of { id, width, height, sourceFile, thumbnailDataUrl }
    let currentPageIndex = -1;
    let currentZoom = 1.0;
    let draggedThumbnailIndex = -1;
    let currentObjectUrl = null;

    // --- IndexedDB Setup ---
    const dbName = 'DocScannerDB';
    const storeName = 'images';
    let db;

    function initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(dbName, 1);
            request.onerror = (e) => {
                console.error("IndexedDB error:", e);
                reject(e);
            };
            request.onsuccess = (e) => {
                db = e.target.result;
                resolve(db);
            };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(storeName)) {
                    db.createObjectStore(storeName, { keyPath: 'id' });
                }
            };
        });
    }

    // Initialize DB immediately
    initDB().then(() => {
        loadSavedPages();
    }).catch(console.error);

    function storeImageInDB(data) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            // Ensure originalBlob is preserved if not provided in update
            if (!data.originalBlob) {
                const getReq = store.get(data.id);
                getReq.onsuccess = () => {
                    const existing = getReq.result;
                    if (existing && existing.originalBlob) {
                        data.originalBlob = existing.originalBlob;
                    }
                    const request = store.put(data);
                    request.onsuccess = () => resolve();
                    request.onerror = (e) => reject(e);
                };
                getReq.onerror = (e) => {
                    // If new or error, just put
                    const request = store.put(data);
                    request.onsuccess = () => resolve();
                    request.onerror = (e) => reject(e);
                };
            } else {
                const request = store.put(data);
                request.onsuccess = () => resolve();
                request.onerror = (e) => reject(e);
            }
        });
    }

    function getAllPagesFromDB() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = (e) => resolve(e.target.result);
            request.onerror = (e) => reject(e);
        });
    }

    async function loadSavedPages() {
        try {
            const savedPages = await getAllPagesFromDB();
            if (savedPages && savedPages.length > 0) {
                pages = [];
                for (const page of savedPages) {
                    let thumb = page.thumbnailDataUrl;
                    if (!thumb && page.blob) {
                        // Generate thumbnail if missing (migration for old data)
                        try {
                            const dataUrl = await blobToDataURL(page.blob);
                            thumb = await createThumbnail(dataUrl);
                            // Update DB with new thumbnail
                            page.thumbnailDataUrl = thumb;
                            await storeImageInDB(page);
                        } catch (e) {
                            console.error("Error generating thumbnail for page:", page.id, e);
                            // Fallback to placeholder or skip
                            continue;
                        }
                    }

                    // Migration: Ensure history exists and is valid
                    let historyChanged = false;
                    if (!page.history || !Array.isArray(page.history)) {
                        page.history = [];
                        if (page.originalBlob) {
                            page.history.push(page.originalBlob);
                        }
                        // If blob is present, add it. 
                        // If originalBlob exists, we assume blob is a subsequent edit (or the same).
                        // We push it to ensure we don't lose the current state.
                        if (page.blob) {
                            // If originalBlob exists, we check if it's the same reference.
                            // If they are different objects (which they usually are from DB), we push.
                            // This might create duplicates if no edits were made, but ensures safety.
                            if (!page.originalBlob || page.blob !== page.originalBlob) {
                                page.history.push(page.blob);
                            }
                        }
                        // If history is still empty (shouldn't happen if blob exists), handle it
                        if (page.history.length === 0 && page.blob) {
                            page.history.push(page.blob);
                        }

                        historyChanged = true;
                    }

                    // Ensure historyIndex is valid
                    if (page.historyIndex === undefined || page.historyIndex < 0 || page.historyIndex >= page.history.length) {
                        page.historyIndex = page.history.length - 1;
                        historyChanged = true;
                    }

                    // Save migrated structure back to DB
                    if (historyChanged) {
                        await storeImageInDB(page);
                    }

                    pages.push({
                        id: page.id,
                        width: page.width,
                        height: page.height,
                        sourceFile: page.sourceFile,
                        thumbnailDataUrl: thumb,
                        historyIndex: page.historyIndex,
                        historyLength: page.history.length,
                        htmlContent: page.htmlContent // Restore HTML content
                    });
                }

                renderAllThumbnails();
                if (pages.length > 0) {
                    selectPage(0);
                }
            }
        } catch (err) {
            console.error("Error loading saved pages:", err);
        }
    }

    function getImageFromDB(id) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);
            request.onsuccess = (e) => {
                const result = e.target.result;
                if (result) {
                    if (result.history && result.history.length > 0) {
                        // Ensure index is within bounds
                        let idx = result.historyIndex;
                        if (idx === undefined || idx < 0) idx = 0;
                        if (idx >= result.history.length) idx = result.history.length - 1;
                        resolve(result.history[idx]);
                    } else {
                        resolve(result.blob);
                    }
                } else {
                    resolve(null);
                }
            };
            request.onerror = (e) => reject(e);
        });
    }

    function deleteImageFromDB(id) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
    }

    function clearImageDB() {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
    }

    async function saveImageToDB(id, blob, htmlContent = null) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const getReq = store.get(id);

            getReq.onsuccess = () => {
                let data = getReq.result;
                if (!data) {
                    data = { id: id, history: [], historyIndex: -1 };
                }

                if (htmlContent !== null) {
                    data.htmlContent = htmlContent;
                }

                if (blob) {
                    // If blob is provided, update it. 
                    // Note: History management is usually done before calling this in the main app,
                    // but here we just ensure the record is updated.
                    // For text pages, blob is null.
                }

                const putReq = store.put(data);
                putReq.onsuccess = () => resolve();
                putReq.onerror = (e) => reject(e);
            };
            getReq.onerror = (e) => reject(e);
        });
    }

    function dataURLtoBlob(dataurl) {
        const arr = dataurl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], { type: mime });
    }

    function blobToDataURL(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    function createThumbnail(dataUrl, maxWidth = 300) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ratio = maxWidth / img.width;
                canvas.width = maxWidth;
                canvas.height = img.height * ratio;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 1.0));
            };
            img.src = dataUrl;
        });
    }

    // Initialize PDF.js
    const { jsPDF } = window.jspdf;

    // --- Camera Handling ---

    addPageButton.addEventListener('click', async () => {
        const blankHtml = '<div style="font-family: \'Times New Roman\', Times, serif; font-size: 12pt; line-height: 1.5; color: #000;"></div>';

        // Create a temporary div to generate thumbnail
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = blankHtml;
        tempDiv.style.width = '800px';
        tempDiv.style.minHeight = '1100px';
        tempDiv.style.background = 'white';
        tempDiv.style.padding = '60px';
        tempDiv.style.position = 'absolute';
        tempDiv.style.left = '-9999px';
        document.body.appendChild(tempDiv);

        try {
            const canvas = await html2canvas(tempDiv, {
                scale: 0.2, // Small thumbnail
                logging: false
            });
            const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.7);
            document.body.removeChild(tempDiv);

            const pageData = {
                width: 800,
                height: 1100,
                sourceFile: "New Page",
                htmlContent: blankHtml,
                dataUrl: thumbnailDataUrl // Pass thumbnail as dataUrl for addPage
            };

            await addPage(pageData);
            selectPage(pages.length - 1);
        } catch (err) {
            console.error("Error creating blank page:", err);
            if (tempDiv.parentNode) document.body.removeChild(tempDiv);
        }
    });

    cameraButton.addEventListener('click', async () => {
        try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
            cameraVideo.srcObject = mediaStream;
            cameraOverlay.style.display = 'flex';
        } catch (err) {
            console.error("Error accessing camera:", err);
            alert("Could not access camera. Please ensure you have granted permission.");
        }
    });

    closeCameraBtn.addEventListener('click', stopCamera);

    function stopCamera() {
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            mediaStream = null;
        }
        cameraOverlay.style.display = 'none';
    }

    captureBtn.addEventListener('click', async () => {
        if (!mediaStream) return;

        const canvas = document.createElement('canvas');
        canvas.width = cameraVideo.videoWidth;
        canvas.height = cameraVideo.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);

        await addPage({
            dataUrl: canvas.toDataURL('image/jpeg', 0.9),
            width: canvas.width,
            height: canvas.height,
            sourceFile: `Camera Capture ${new Date().toLocaleTimeString()}`
        });

        // Optional: Flash effect or notification
        const originalBorder = cameraVideo.style.border;
        cameraVideo.style.border = '5px solid #28a745';
        setTimeout(() => {
            cameraVideo.style.border = originalBorder;
        }, 200);

        // Select the new page
        selectPage(pages.length - 1);
    });

    scannerButton.addEventListener('click', () => {
        openModal(scannerModal);
        fetchScanners();
    });

    scannerCancelBtn.addEventListener('click', () => {
        closeModal();
    });

    if (linuxToggleBtn && linuxLinks) {
        linuxToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            linuxLinks.style.display = linuxLinks.style.display === 'none' ? 'block' : 'none';
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (linuxLinks.style.display === 'block' && !linuxToggleBtn.contains(e.target) && !linuxLinks.contains(e.target)) {
                linuxLinks.style.display = 'none';
            }
        });
    }

    refreshScannersBtn.addEventListener('click', fetchScanners);

    async function fetchScanners() {
        try {
            scannerSourceSelect.innerHTML = '<option>Loading...</option>';
            let url = host + '/api/device/scanners';
            let response = await fetch(url);

            if (response.ok) {
                let devices = await response.json();
                scannerSourceSelect.innerHTML = '';

                if (devices.length === 0) {
                    let option = document.createElement("option");
                    option.text = "No scanners found";
                    scannerSourceSelect.add(option);
                    return;
                }

                for (let i = 0; i < devices.length; i++) {
                    let device = devices[i];
                    let option = document.createElement("option");
                    option.text = device['name'];
                    option.value = JSON.stringify(device);
                    scannerSourceSelect.add(option);
                };
            } else {
                scannerSourceSelect.innerHTML = '<option>Error fetching scanners</option>';
            }

        } catch (error) {
            console.error(error);
            scannerSourceSelect.innerHTML = '<option>Service not connected</option>';
            alert("Could not connect to Dynamsoft Service. Please ensure it is installed and running.");
        }
    }

    scannerScanBtn.addEventListener('click', async () => {
        const scanner = scannerSourceSelect.value;
        if (!scanner || scanner.startsWith('No') || scanner.startsWith('Loading') || scanner.startsWith('Service') || scanner.startsWith('Error')) {
            alert("Please select a valid scanner.");
            return;
        }

        const license = dwtLicense.value.trim();
        if (!license) {
            alert("Please enter a valid license.");
            return;
        }

        scannerScanBtn.disabled = true;
        scannerScanBtn.textContent = "Scanning...";

        let parameters = {
            license: license,
            device: JSON.parse(scanner)['device'],
        };

        parameters.config = {
            PixelType: 2,
            Resolution: parseInt(scanResolution.value),
            IfFeederEnabled: scanAdf.checked,
        };

        // REST endpoint to create a scan job
        let url = host + '/api/device/scanners/jobs';

        try {
            let response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(parameters)
            });

            if (response.ok) {
                let job = await response.json();
                let jobId = job.jobuid;

                // Get document data
                let nextUrl = host + '/api/device/scanners/jobs/' + jobId + '/next-page';
                let pageCount = 0;

                while (true) {
                    try {
                        let imgResponse = await fetch(nextUrl);

                        if (imgResponse.status == 200) {
                            const arrayBuffer = await imgResponse.arrayBuffer();
                            const blob = new Blob([arrayBuffer], { type: imgResponse.headers.get('Content-Type') || 'image/jpeg' });

                            // Convert blob to dataURL for addPage
                            const dataUrl = await blobToDataURL(blob);

                            // Get image dimensions (optional, addPage handles it but good to have)
                            // We can just pass dataUrl and let addPage handle it
                            await addPage({
                                dataUrl: dataUrl,
                                sourceFile: `Scan Job ${jobId} - Page ${pageCount + 1}`
                            });

                            pageCount++;
                        }
                        else {
                            break;
                        }

                    } catch (error) {
                        console.error('No more images or error:', error);
                        break;
                    }
                }

                if (pageCount > 0) {
                    closeModal();
                    selectPage(pages.length - 1);
                } else {
                    alert("No pages scanned.");
                }
            } else {
                const errText = await response.text();
                alert("Scan failed: " + errText);
            }

        } catch (error) {
            alert("Error during scan: " + error);
        } finally {
            scannerScanBtn.disabled = false;
            scannerScanBtn.textContent = "Scan Now";
        }
    });

    // --- File Handling ---

    fileInput.addEventListener('change', (event) => {
        handleFiles(Array.from(event.target.files));
        fileInput.value = ''; // Reset input
    });

    // Drag and Drop for Files
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    viewerPanel.addEventListener('dragenter', (e) => {
        // Ignore if dragging thumbnail
        if (draggedThumbnailIndex !== -1) return;

        // Only show overlay if dragging files
        if (e.dataTransfer.types.includes('Files')) {
            viewerPanel.classList.add('drop-zone-active');
        }
    });

    viewerPanel.addEventListener('dragleave', (e) => {
        if (!viewerPanel.contains(e.relatedTarget)) {
            viewerPanel.classList.remove('drop-zone-active');
        }
    });

    viewerPanel.addEventListener('drop', (e) => {
        viewerPanel.classList.remove('drop-zone-active');
        const dt = e.dataTransfer;
        const files = Array.from(dt.files);
        handleFiles(files);
    });

    async function handleFiles(files) {
        if (files.length === 0) return;

        const initialLength = pages.length;

        for (const file of files) {
            const extension = file.name.split('.').pop().toLowerCase();
            try {
                if (extension === 'pdf') {
                    await handlePDF(file);
                } else if (['jpg', 'jpeg', 'png', 'bmp', 'webp'].includes(extension)) {
                    await handleImage(file);
                } else if (['tiff', 'tif'].includes(extension)) {
                    await handleTIFF(file);
                } else if (extension === 'docx') {
                    await handleDOCX(file);
                } else if (extension === 'txt') {
                    await handleTXT(file);
                } else {
                    console.warn(`Unsupported file type: ${file.name}`);
                }
            } catch (err) {
                console.error(`Error processing ${file.name}:`, err);
                alert(`Error processing ${file.name}: ${err.message}`);
            }
        }

        // Select the last page if new pages were added
        if (pages.length > initialLength) {
            selectPage(pages.length - 1);
        } else if (currentPageIndex === -1 && pages.length > 0) {
            selectPage(0);
        }
    }    // --- Handlers ---

    async function handleTIFF(file) {
        if (typeof UTIF === 'undefined') {
            throw new Error('UTIF library not loaded');
        }
        const arrayBuffer = await file.arrayBuffer();
        const ifds = UTIF.decode(arrayBuffer);

        for (const ifd of ifds) {
            UTIF.decodeImage(arrayBuffer, ifd);
            const rgba = UTIF.toRGBA8(ifd);
            const width = ifd.width;
            const height = ifd.height;

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            const imageData = ctx.createImageData(width, height);

            for (let i = 0; i < rgba.length; i++) {
                imageData.data[i] = rgba[i];
            }

            ctx.putImageData(imageData, 0, 0);

            await addPage({
                dataUrl: canvas.toDataURL('image/jpeg', 0.9),
                width: width,
                height: height,
                sourceFile: file.name
            });
        }
    } async function handleImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = async () => {
                    await addPage({
                        dataUrl: e.target.result,
                        width: img.width,
                        height: img.height,
                        sourceFile: file.name
                    });
                    resolve();
                };
                img.onerror = reject;
                img.src = e.target.result;
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    async function handlePDF(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2.0 }); // High quality

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            await addPage({
                dataUrl: canvas.toDataURL('image/jpeg', 0.9),
                width: viewport.width,
                height: viewport.height,
                sourceFile: `${file.name} (Page ${i})`
            });
        }
    }

    async function handleDOCX(file) {
        loadingOverlay.style.display = 'flex';
        try {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
            const html = result.value;

            // Generate thumbnail from the first part of the document
            const tempContainer = document.createElement('div');
            const pageWidth = 800;
            tempContainer.style.width = `${pageWidth}px`;
            tempContainer.style.background = 'white';
            tempContainer.style.padding = '40px';
            tempContainer.style.position = 'absolute';
            tempContainer.style.left = '-9999px';
            tempContainer.innerHTML = html;
            document.body.appendChild(tempContainer);

            let thumbnailDataUrl;
            try {
                // Capture just the top part for thumbnail
                const canvas = await html2canvas(tempContainer, {
                    scale: 0.5,
                    height: 1100, // Approx A4 height
                    windowHeight: 1100,
                    useCORS: true,
                    ignoreElements: (element) => {
                        return element.tagName === 'VIDEO' || element.id === 'camera-overlay';
                    }
                });
                thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.8);
            } catch (e) {
                console.error("Error generating thumbnail:", e);
                // Fallback thumbnail
                thumbnailDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
            } finally {
                document.body.removeChild(tempContainer);
            }

            await addPage({
                dataUrl: thumbnailDataUrl, // Used for thumbnail display
                width: 800,
                height: 1100,
                sourceFile: file.name,
                htmlContent: html // Store the HTML content for editing
            });
        } catch (error) {
            console.error('Error processing DOCX:', error);
            alert('Failed to load DOCX file.');
        } finally {
            loadingOverlay.style.display = 'none';
        }
    }

    async function handleTXT(file) {
        const text = await file.text();
        // Convert newlines to breaks for HTML display
        const html = `<div style="font-family: 'Times New Roman', Times, serif; font-size: 12pt; line-height: 1.5; white-space: pre-wrap;">${text}</div>`;

        // Generate thumbnail
        const tempContainer = document.createElement('div');
        const pageWidth = 800;
        tempContainer.style.width = `${pageWidth}px`;
        tempContainer.style.background = 'white';
        tempContainer.style.padding = '40px';
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.innerHTML = html;
        document.body.appendChild(tempContainer);

        let thumbnailDataUrl;
        try {
            const canvas = await html2canvas(tempContainer, {
                scale: 0.5,
                height: 1100,
                windowHeight: 1100,
                useCORS: true
            });
            thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.8);
        } catch (e) {
            console.error("Error generating thumbnail:", e);
            thumbnailDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
        } finally {
            document.body.removeChild(tempContainer);
        }

        await addPage({
            dataUrl: thumbnailDataUrl,
            width: 800,
            height: 1100,
            sourceFile: file.name,
            htmlContent: html
        });
    }

    // --- Page Management ---

    async function addPage(pageData) {
        const id = Date.now() + Math.random();
        const blob = dataURLtoBlob(pageData.dataUrl);
        const thumbnailDataUrl = await createThumbnail(pageData.dataUrl);

        const pageObject = {
            id,
            blob,
            originalBlob: blob,
            history: [blob],
            historyIndex: 0,
            width: pageData.width,
            height: pageData.height,
            sourceFile: pageData.sourceFile,
            thumbnailDataUrl: thumbnailDataUrl,
            htmlContent: pageData.htmlContent // Store HTML content
        };

        await storeImageInDB(pageObject);

        pages.push({
            id,
            width: pageData.width,
            height: pageData.height,
            sourceFile: pageData.sourceFile,
            thumbnailDataUrl: thumbnailDataUrl,
            historyIndex: 0,
            historyLength: 1,
            htmlContent: pageData.htmlContent // Store HTML content
        });
        renderAllThumbnails();
    }

    function renderAllThumbnails() {
        thumbnailsPanel.innerHTML = '';
        pages.forEach((page, index) => {
            renderThumbnail(page, index);
        });
        // Restore selection highlight
        if (currentPageIndex !== -1 && pages[currentPageIndex]) {
            const thumbnails = thumbnailsPanel.querySelectorAll('.thumbnail');
            if (thumbnails[currentPageIndex]) {
                thumbnails[currentPageIndex].classList.add('active');
            }
        }
    }

    function renderThumbnail(page, index) {
        const div = document.createElement('div');
        div.className = 'thumbnail';
        div.dataset.index = index;
        div.draggable = true;
        div.onclick = () => selectPage(index);

        // Drag events
        div.addEventListener('dragstart', handleDragStart);
        div.addEventListener('dragover', handleDragOver);
        div.addEventListener('drop', handleDrop);
        div.addEventListener('dragend', handleDragEnd);

        const img = document.createElement('img');
        img.id = `thumb-img-${page.id}`; // Add ID for updates
        img.src = page.thumbnailDataUrl; // Use thumbnail

        const num = document.createElement('div');
        num.className = 'thumbnail-number';
        num.textContent = index + 1;

        div.appendChild(img);
        div.appendChild(num);
        thumbnailsPanel.appendChild(div);
    }

    // Thumbnail Drag Handlers
    function handleDragStart(e) {
        draggedThumbnailIndex = parseInt(this.dataset.index);
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    }

    function handleDragOver(e) {
        if (draggedThumbnailIndex === -1) return;

        if (e.preventDefault) {
            e.preventDefault();
        }
        this.classList.add('drag-over');
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    function handleDrop(e) {
        if (draggedThumbnailIndex === -1) return;

        if (e.stopPropagation) {
            e.stopPropagation();
        }

        const targetIndex = parseInt(this.dataset.index);
        if (draggedThumbnailIndex !== targetIndex) {
            // Reorder pages array
            const movedPage = pages.splice(draggedThumbnailIndex, 1)[0];
            pages.splice(targetIndex, 0, movedPage);

            // Select the moved page
            currentPageIndex = targetIndex;

            renderAllThumbnails();
            selectPage(currentPageIndex); // Refresh view
        }
        return false;
    } function handleDragEnd() {
        this.classList.remove('dragging');
        const thumbnails = thumbnailsPanel.querySelectorAll('.thumbnail');
        thumbnails.forEach(t => t.classList.remove('drag-over'));

        draggedThumbnailIndex = -1;
        viewerPanel.classList.remove('drop-zone-active');
    } function selectPage(index) {
        if (pages.length === 0) {
            deleteAllButton.style.display = 'none';
        } else {
            deleteAllButton.style.display = 'inline-block';
        }

        if (index < 0 || index >= pages.length) {
            deletePageButton.style.display = 'none';
            return;
        }

        // Update active state
        const thumbnails = thumbnailsPanel.querySelectorAll('.thumbnail');
        thumbnails.forEach(t => t.classList.remove('active'));
        if (thumbnails[index]) {
            thumbnails[index].classList.add('active');
            thumbnails[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        currentPageIndex = index;
        deletePageButton.style.display = 'inline-block';
        renderLargeView();
        updateUndoRedoButtons();
    }

    deletePageButton.addEventListener('click', async () => {
        if (currentPageIndex === -1) return;

        const pageToDelete = pages[currentPageIndex];
        await deleteImageFromDB(pageToDelete.id);

        pages.splice(currentPageIndex, 1);

        if (pages.length === 0) {
            currentPageIndex = -1;
            largeViewContainer.innerHTML = '';
            deletePageButton.style.display = 'none';
        } else {
            // Select the next page, or the previous one if we deleted the last one
            if (currentPageIndex >= pages.length) {
                currentPageIndex = pages.length - 1;
            }
        }
        renderAllThumbnails();
        selectPage(currentPageIndex);
    });

    deleteAllButton.addEventListener('click', async () => {
        if (confirm('Are you sure you want to delete all pages?')) {
            await clearImageDB();
            pages = [];
            currentPageIndex = -1;
            renderAllThumbnails();
            selectPage(-1);
            largeViewContainer.innerHTML = '';
        }
    });

    async function renderLargeView() {
        if (currentPageIndex === -1) {
            largeViewContainer.innerHTML = '';
            imageToolsGroup.style.display = 'none';
            historyGroup.style.display = 'none';
            if (textToolsGroup) textToolsGroup.style.display = 'none';
            return;
        }

        const page = pages[currentPageIndex];
        largeViewContainer.innerHTML = '';

        // Revoke previous object URL to avoid memory leaks
        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = null;
        }

        if (page.htmlContent) {
            // --- Text Mode ---
            scrollWrapper.style.cursor = 'default';
            imageToolsGroup.style.display = 'none';
            historyGroup.style.display = 'none';
            if (textToolsGroup) textToolsGroup.style.display = 'flex';
            if (zoomControlsGroup) zoomControlsGroup.style.display = 'none';
            if (infoBtn) infoBtn.style.display = 'none';

            const editorDiv = document.createElement('div');
            editorDiv.contentEditable = "true";
            editorDiv.className = "text-editor-page";
            editorDiv.innerHTML = page.htmlContent;
            editorDiv.id = 'text-editor'; // For easy access

            // Basic styling for the editor page to look like a document
            editorDiv.style.width = '800px'; // Fixed width for document feel
            editorDiv.style.minHeight = '1100px';
            editorDiv.style.backgroundColor = 'white';
            editorDiv.style.padding = '60px';
            editorDiv.style.boxShadow = '0 0 10px rgba(0,0,0,0.1)';
            editorDiv.style.margin = '0 auto';
            editorDiv.style.outline = 'none';
            editorDiv.style.fontFamily = "'Times New Roman', Times, serif";
            editorDiv.style.fontSize = "12pt";
            editorDiv.style.lineHeight = "1.5";
            editorDiv.style.color = "#000";
            editorDiv.style.cursor = "text";

            // Reset container style from potential image zoom
            largeViewContainer.style.width = 'auto';
            largeViewContainer.style.transform = 'none';

            // Reset save button state
            if (saveTextBtn) {
                saveTextBtn.disabled = false;
                saveTextBtn.innerHTML = '<i class="fas fa-save"></i>';
                saveTextBtn.classList.remove('btn-success');
                saveTextBtn.classList.add('btn-primary');
            }

            // Re-enable save button on input
            editorDiv.addEventListener('input', () => {
                if (saveTextBtn && saveTextBtn.disabled) {
                    saveTextBtn.disabled = false;
                    saveTextBtn.innerHTML = '<i class="fas fa-save"></i>';
                    saveTextBtn.classList.remove('btn-success');
                    saveTextBtn.classList.add('btn-primary');
                }
            });

            largeViewContainer.appendChild(editorDiv);

        } else {
            // --- Image Mode ---
            scrollWrapper.style.cursor = 'grab';
            imageToolsGroup.style.display = 'flex';
            historyGroup.style.display = 'flex';
            if (textToolsGroup) textToolsGroup.style.display = 'none';
            if (zoomControlsGroup) zoomControlsGroup.style.display = 'flex';
            if (infoBtn) infoBtn.style.display = '';

            try {
                const blob = await getImageFromDB(page.id);
                if (!blob) {
                    largeViewContainer.textContent = "Error loading image.";
                    return;
                }

                currentObjectUrl = URL.createObjectURL(blob);

                const img = document.createElement('img');
                img.src = currentObjectUrl;
                img.style.width = '100%';
                img.style.boxShadow = '0 0 10px rgba(0,0,0,0.1)';
                img.id = 'large-image';

                // Prevent default drag behavior to allow panning
                img.addEventListener('dragstart', (e) => e.preventDefault());

                largeViewContainer.appendChild(img);

                updateZoom();
            } catch (err) {
                console.error("Error rendering large view:", err);
                largeViewContainer.textContent = "Error loading image.";
            }
        }
    } function updateZoom() {
        if (largeViewContainer.firstChild) {
            largeViewContainer.style.width = `${currentZoom * 100}%`;
        }
    }

    // --- Zoom Controls ---
    zoomInBtn.addEventListener('click', () => {
        currentZoom += 0.1;
        updateZoom();
    });

    zoomOutBtn.addEventListener('click', () => {
        if (currentZoom > 0.2) {
            currentZoom -= 0.1;
            updateZoom();
        }
    });

    // --- Text Saving ---
    if (saveTextBtn) {
        saveTextBtn.addEventListener('click', async () => {
            if (currentPageIndex === -1) return;
            const page = pages[currentPageIndex];
            if (!page.htmlContent) return; // Only for text pages

            const editor = document.getElementById('text-editor');
            if (!editor) return;

            // 1. Update in-memory model
            page.htmlContent = editor.innerHTML;

            // Visual feedback - Loading
            const originalHtml = '<i class="fas fa-save"></i>';
            saveTextBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            saveTextBtn.disabled = true;

            try {
                // 2. Update Thumbnail (Snapshot)
                const canvas = await html2canvas(editor, {
                    scale: 0.2, // Low scale for thumbnail
                    useCORS: true,
                    logging: false
                });

                page.thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.7);

                // 3. Update IndexedDB (Save everything including new thumbnail and htmlContent)
                const transaction = db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                const getReq = store.get(page.id);

                getReq.onsuccess = () => {
                    const dbRecord = getReq.result;
                    if (dbRecord) {
                        dbRecord.htmlContent = page.htmlContent;
                        dbRecord.thumbnailDataUrl = page.thumbnailDataUrl;

                        const putReq = store.put(dbRecord);
                        putReq.onsuccess = () => {
                            // Success
                            // Update sidebar thumbnail
                            const thumbImg = document.getElementById(`thumb-img-${page.id}`);
                            if (thumbImg) {
                                thumbImg.src = page.thumbnailDataUrl;
                            }

                            // Visual feedback - Success
                            saveTextBtn.innerHTML = 'Saved';
                            saveTextBtn.classList.remove('btn-primary');
                            saveTextBtn.classList.add('btn-success');

                            setTimeout(() => {
                                saveTextBtn.innerHTML = originalHtml;
                                saveTextBtn.classList.remove('btn-success');
                                saveTextBtn.classList.add('btn-primary');
                                // Keep disabled until input event fires (handled in renderLargeView)
                            }, 1000);
                        };
                        putReq.onerror = (e) => {
                            console.error("Error saving to DB:", e);
                            alert("Failed to save changes.");
                            saveTextBtn.disabled = false;
                            saveTextBtn.innerHTML = originalHtml;
                        };
                    }
                };

            } catch (err) {
                console.error("Error generating thumbnail from text:", err);
                saveTextBtn.disabled = false;
                saveTextBtn.innerHTML = originalHtml;
            }
        });
    }

    // --- Keyboard Shortcuts ---
    document.addEventListener('keydown', (e) => {
        // Ctrl+S to save (if text editor is active)
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (currentPageIndex !== -1 && pages[currentPageIndex].htmlContent) {
                if (saveTextBtn) saveTextBtn.click();
            }
        }

        // Delete key to delete page
        if (e.key === 'Delete') {
            // Check if we are NOT inside the text editor
            const activeEl = document.activeElement;
            const isEditor = activeEl && (activeEl.id === 'text-editor' || activeEl.isContentEditable);

            if (!isEditor) {
                if (currentPageIndex !== -1) {
                    deletePageButton.click();
                }
            }
        }
    });

    // --- Info Button ---
    infoBtn.addEventListener('click', async () => {
        if (currentPageIndex === -1) {
            alert('Please select an image first');
            return;
        }
        try {
            await showImageInfo(currentPageIndex);
        } catch (error) {
            console.error('Error showing image info:', error);
            alert('Error loading image information');
        }
    });

    // --- Panning (Drag to Scroll) ---
    let isPanning = false;
    let startX, startY, initialScrollLeft, initialScrollTop;

    scrollWrapper.addEventListener('mousedown', (e) => {
        isPanning = true;
        scrollWrapper.style.cursor = 'grabbing';
        startX = e.pageX - scrollWrapper.offsetLeft;
        startY = e.pageY - scrollWrapper.offsetTop;
        initialScrollLeft = scrollWrapper.scrollLeft;
        initialScrollTop = scrollWrapper.scrollTop;
    });

    scrollWrapper.addEventListener('mouseleave', () => {
        isPanning = false;
        scrollWrapper.style.cursor = 'grab';
    });

    scrollWrapper.addEventListener('mouseup', () => {
        isPanning = false;
        scrollWrapper.style.cursor = 'grab';
    });

    scrollWrapper.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        e.preventDefault();
        const x = e.pageX - scrollWrapper.offsetLeft;
        const y = e.pageY - scrollWrapper.offsetTop;
        const walkX = (x - startX);
        const walkY = (y - startY);
        scrollWrapper.scrollLeft = initialScrollLeft - walkX;
        scrollWrapper.scrollTop = initialScrollTop - walkY;
    });

    // --- Saving ---

    savePdfButton.addEventListener('click', async () => {
        if (pages.length === 0) {
            alert('No pages to save.');
            return;
        }

        // We use the browser's print functionality because jsPDF requires large custom font files 
        // to support non-Latin characters (like Chinese/Japanese) correctly. 
        // The system print dialog ensures all characters are rendered correctly and remain editable/selectable.

        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);

        let htmlContent = '<!DOCTYPE html><html><head><title>Document</title>';
        htmlContent += `
            <style>
                @page { size: A4; margin: 0; }
                body { margin: 20mm; padding: 0; font-family: Arial, sans-serif; }
                .page-content { width: 100%; word-wrap: break-word; } 
                img { max-width: 100%; } 
                .page-break { page-break-after: always; }
                /* Ensure text is visible and black */
                p, div, span { color: #000; }
            </style>`;
        htmlContent += '</head><body>';

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            if (page.htmlContent) {
                htmlContent += `<div class="page-content">${page.htmlContent}</div>`;
            } else {
                try {
                    const blob = await getImageFromDB(page.id);
                    if (blob) {
                        const dataUrl = await blobToDataURL(blob);
                        htmlContent += `<div class="page-content"><img src="${dataUrl}" /></div>`;
                    }
                } catch (err) {
                    console.error(`Error adding page ${i + 1}:`, err);
                }
            }
            if (i < pages.length - 1) {
                htmlContent += '<div class="page-break"></div>';
            }
        }

        htmlContent += '</body></html>';

        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(htmlContent);
        doc.close();

        // Wait for content (especially images) to load
        iframe.onload = function () {
            try {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
            } catch (e) {
                console.error("Print failed", e);
            } finally {
                // Remove iframe after a delay to ensure print dialog has opened
                setTimeout(() => {
                    document.body.removeChild(iframe);
                }, 1000);
            }
        };
    });

    saveWordButton.addEventListener('click', async () => {
        if (pages.length === 0) {
            alert('No pages to save.');
            return;
        }

        // Create HTML content
        let htmlContent = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Document</title></head><body>';

        for (const page of pages) {
            if (page.htmlContent) {
                htmlContent += page.htmlContent;
                htmlContent += '<br style="page-break-after: always;" />';
            } else {
                try {
                    const blob = await getImageFromDB(page.id);
                    if (blob) {
                        const dataUrl = await blobToDataURL(blob);

                        // Load image to get dimensions and scale it to fit Word page
                        const img = new Image();
                        img.src = dataUrl;
                        await new Promise(resolve => {
                            img.onload = resolve;
                            img.onerror = resolve;
                        });

                        // A4 printable width is roughly 600-650px (at 96dpi) or ~16cm
                        // We constrain it to 600px to be safe
                        const maxWidth = 600;
                        let width = img.width;
                        let height = img.height;

                        if (width > maxWidth) {
                            const ratio = maxWidth / width;
                            width = maxWidth;
                            height = Math.round(height * ratio);
                        }

                        // Use explicit width/height attributes which html-docx-js handles better than CSS
                        htmlContent += `<p><img src="${dataUrl}" width="${width}" height="${height}" /></p><br style="page-break-after: always;" />`;
                    }
                } catch (err) {
                    console.error("Error adding page to Word:", err);
                }
            }
        }

        htmlContent += '</body></html>';

        const converted = htmlDocx.asBlob(htmlContent);
        const link = document.createElement('a');
        link.href = URL.createObjectURL(converted);
        link.download = 'combined_document.docx';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // --- Editor Features ---

    function openModal(modal, blocking = true) {
        modalOverlay.style.display = 'flex';
        modal.style.display = 'block';
        if (!blocking) {
            modalOverlay.classList.add('non-blocking');
        } else {
            modalOverlay.classList.remove('non-blocking');
        }
    }

    function closeModal() {
        modalOverlay.style.display = 'none';
        modalOverlay.classList.remove('non-blocking');
        rotateModal.style.display = 'none';
        cropModal.style.display = 'none';
        filterModal.style.display = 'none';
        resizeModal.style.display = 'none';
        infoModal.style.display = 'none';
        scannerModal.style.display = 'none';

        // Cleanup crop overlay
        if (cropOverlayDiv) {
            cropOverlayDiv.remove();
            cropOverlayDiv = null;
        }

        // Reset temp canvas
        tempCanvas = null;

        // Reset image style
        const img = document.getElementById('large-image');
        if (img) {
            img.style.transform = 'none';
            img.style.filter = 'none';
        }
    }

    // --- Rotate ---
    rotateBtn.addEventListener('click', () => {
        currentRotation = 0;
        rotateSlider.value = 0;
        rotateVal.textContent = 0;
        openModal(rotateModal);
    });

    rotateLeftBtn.addEventListener('click', () => updateRotation(-90));
    rotateRightBtn.addEventListener('click', () => updateRotation(90));
    rotateSlider.addEventListener('input', (e) => {
        currentRotation = parseInt(e.target.value);
        rotateVal.textContent = currentRotation;
        applyRotationPreview();
    });

    function updateRotation(deg) {
        currentRotation = (currentRotation + deg) % 360;
        rotateSlider.value = currentRotation;
        rotateVal.textContent = currentRotation;
        applyRotationPreview();
    }

    function applyRotationPreview() {
        const img = document.getElementById('large-image');
        if (img) img.style.transform = `rotate(${currentRotation}deg)`;
    }

    rotateApply.addEventListener('click', async () => {
        const img = document.getElementById('large-image');
        if (!img) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Calculate new bounding box
        const rad = currentRotation * Math.PI / 180;
        const sin = Math.abs(Math.sin(rad));
        const cos = Math.abs(Math.cos(rad));
        const w = img.naturalWidth;
        const h = img.naturalHeight;

        canvas.width = w * cos + h * sin;
        canvas.height = w * sin + h * cos;

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rad);
        ctx.drawImage(img, -w / 2, -h / 2);

        await saveEditedImage(canvas.toDataURL('image/jpeg', 0.9));
        closeModal();
    });

    rotateCancel.addEventListener('click', closeModal);

    // --- Crop ---
    cropBtn.addEventListener('click', () => {
        const img = document.getElementById('large-image');
        if (!img) return;

        openModal(cropModal, false); // Non-blocking
        initCropOverlay(img);
    });

    function initCropOverlay(img) {
        if (cropOverlayDiv) cropOverlayDiv.remove();

        const rect = img.getBoundingClientRect();
        const containerRect = largeViewContainer.getBoundingClientRect();

        // Initial crop box (80% of image)
        const w = rect.width * 0.8;
        const h = rect.height * 0.8;
        const x = (rect.width - w) / 2;
        const y = (rect.height - h) / 2;

        cropOverlayDiv = document.createElement('div');
        cropOverlayDiv.className = 'crop-overlay';
        cropOverlayDiv.style.width = `${w}px`;
        cropOverlayDiv.style.height = `${h}px`;
        cropOverlayDiv.style.left = `${img.offsetLeft + x}px`;
        cropOverlayDiv.style.top = `${img.offsetTop + y}px`;

        // Dimensions Label
        const dimLabel = document.createElement('div');
        dimLabel.className = 'crop-dimensions';
        // Calculate initial real dimensions
        const scaleX = img.naturalWidth / img.width;
        const scaleY = img.naturalHeight / img.height;
        // Use offsetWidth/Height to include border
        // We need to append first to get offset dimensions, or calculate manually (w + 4)
        // Since we just set style.width = w, and border is 2px * 2 = 4px
        // But w was calculated from rect.width * 0.8. 
        // Let's just append and read.
        cropOverlayDiv.appendChild(dimLabel);
        largeViewContainer.appendChild(cropOverlayDiv);

        const currentW = cropOverlayDiv.offsetWidth;
        const currentH = cropOverlayDiv.offsetHeight;
        dimLabel.innerText = `${Math.round(currentW * scaleX)} x ${Math.round(currentH * scaleY)}`;

        // Handles
        ['tl', 'tr', 'bl', 'br'].forEach(pos => {
            const handle = document.createElement('div');
            handle.className = `crop-handle ${pos}`;
            cropOverlayDiv.appendChild(handle);
        });

        makeDraggableAndResizable(cropOverlayDiv, img);
    }

    function makeDraggableAndResizable(overlay, img) {
        let isDragging = false;
        let isResizing = false;
        let startX, startY, startLeft, startTop, startW, startH;
        let resizeHandle = null;

        overlay.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('crop-handle')) {
                isResizing = true;
                resizeHandle = e.target;
            } else {
                isDragging = true;
            }
            startX = e.clientX;
            startY = e.clientY;
            startLeft = overlay.offsetLeft;
            startTop = overlay.offsetTop;
            startW = overlay.offsetWidth;
            startH = overlay.offsetHeight;
            e.stopPropagation();
            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging && !isResizing) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            if (isDragging) {
                overlay.style.left = `${startLeft + dx}px`;
                overlay.style.top = `${startTop + dy}px`;
            } else if (isResizing) {
                if (resizeHandle.classList.contains('br')) {
                    overlay.style.width = `${startW + dx}px`;
                    overlay.style.height = `${startH + dy}px`;
                } else if (resizeHandle.classList.contains('bl')) {
                    overlay.style.left = `${startLeft + dx}px`;
                    overlay.style.width = `${startW - dx}px`;
                    overlay.style.height = `${startH + dy}px`;
                } else if (resizeHandle.classList.contains('tr')) {
                    overlay.style.top = `${startTop + dy}px`;
                    overlay.style.width = `${startW + dx}px`;
                    overlay.style.height = `${startH - dy}px`;
                } else if (resizeHandle.classList.contains('tl')) {
                    overlay.style.left = `${startLeft + dx}px`;
                    overlay.style.top = `${startTop + dy}px`;
                    overlay.style.width = `${startW - dx}px`;
                    overlay.style.height = `${startH - dy}px`;
                }

                // Update dimensions label
                const dimLabel = overlay.querySelector('.crop-dimensions');
                if (dimLabel) {
                    const scaleX = img.naturalWidth / img.width;
                    const scaleY = img.naturalHeight / img.height;
                    // Use offsetWidth/Height to include border, matching getBoundingClientRect used in cropApply
                    const currentW = overlay.offsetWidth;
                    const currentH = overlay.offsetHeight;
                    dimLabel.innerText = `${Math.round(currentW * scaleX)} x ${Math.round(currentH * scaleY)}`;
                }
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            isResizing = false;
        });
    }

    cropApply.addEventListener('click', async () => {
        const img = document.getElementById('large-image');
        if (!img || !cropOverlayDiv) return;

        // Calculate crop coordinates relative to natural image size
        // We need to account for the displayed size vs natural size
        const displayedW = img.width; // CSS width (100% of container usually, but check computed)
        const displayedH = img.height;
        const naturalW = img.naturalWidth;
        const naturalH = img.naturalHeight;

        const scaleX = naturalW / displayedW;
        const scaleY = naturalH / displayedH;

        // Overlay position relative to image
        const overlayRect = cropOverlayDiv.getBoundingClientRect();
        const imgRect = img.getBoundingClientRect();

        const cropX = (overlayRect.left - imgRect.left) * scaleX;
        const cropY = (overlayRect.top - imgRect.top) * scaleY;
        const cropW = overlayRect.width * scaleX;
        const cropH = overlayRect.height * scaleY;

        const canvas = document.createElement('canvas');
        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext('2d');

        ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        await saveEditedImage(canvas.toDataURL('image/jpeg', 0.9));
        closeModal();
    });

    cropCancel.addEventListener('click', closeModal);

    // --- Filter ---
    filterBtn.addEventListener('click', () => {
        filterType.value = 'none';
        thresholdSlider.value = 128;
        brightnessSlider.value = 0;
        contrastSlider.value = 0;
        thresholdContainer.style.display = 'none';
        openModal(filterModal);
    });

    filterType.addEventListener('change', () => {
        thresholdContainer.style.display = filterType.value === 'blackwhite' ? 'block' : 'none';
        applyFilterPreview();
    });

    [thresholdSlider, brightnessSlider, contrastSlider].forEach(el => {
        el.addEventListener('input', () => {
            document.getElementById(el.id.replace('slider', 'val')).textContent = el.value;
            applyFilterPreview();
        });
    });

    function applyFilterPreview() {
        const img = document.getElementById('large-image');
        if (!img) return;

        let filterString = '';

        // CSS Filters for preview (approximate)
        filterString += `brightness(${100 + parseInt(brightnessSlider.value)}%) `;
        filterString += `contrast(${100 + parseInt(contrastSlider.value)}%) `;

        if (filterType.value === 'grayscale') {
            filterString += 'grayscale(100%) ';
        } else if (filterType.value === 'blackwhite') {
            filterString += 'grayscale(100%) contrast(200%) '; // Approx B&W
        }

        img.style.filter = filterString;
    }

    filterApply.addEventListener('click', async () => {
        const img = document.getElementById('large-image');
        if (!img) return;

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        const brightness = parseInt(brightnessSlider.value);
        const contrast = parseInt(contrastSlider.value);
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

        for (let i = 0; i < data.length; i += 4) {
            // Brightness
            data[i] += brightness;
            data[i + 1] += brightness;
            data[i + 2] += brightness;

            // Contrast
            data[i] = factor * (data[i] - 128) + 128;
            data[i + 1] = factor * (data[i + 1] - 128) + 128;
            data[i + 2] = factor * (data[i + 2] - 128) + 128;

            // Grayscale / B&W
            if (filterType.value !== 'none') {
                const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                if (filterType.value === 'grayscale') {
                    data[i] = avg;
                    data[i + 1] = avg;
                    data[i + 2] = avg;
                } else if (filterType.value === 'blackwhite') {
                    const thresh = parseInt(thresholdSlider.value);
                    const val = avg > thresh ? 255 : 0;
                    data[i] = val;
                    data[i + 1] = val;
                    data[i + 2] = val;
                }
            }
        }

        ctx.putImageData(imageData, 0, 0);
        await saveEditedImage(canvas.toDataURL('image/jpeg', 0.9));
        closeModal();
    });

    filterCancel.addEventListener('click', closeModal);

    // --- Resize ---
    resizeBtn.addEventListener('click', () => {
        const img = document.getElementById('large-image');
        if (!img) return;

        resizeWidth.value = img.naturalWidth;
        resizeHeight.value = img.naturalHeight;
        openModal(resizeModal);
    });

    resizeWidth.addEventListener('input', () => {
        if (resizeAspect.checked) {
            const img = document.getElementById('large-image');
            const ratio = img.naturalHeight / img.naturalWidth;
            resizeHeight.value = Math.round(resizeWidth.value * ratio);
        }
    });

    resizeHeight.addEventListener('input', () => {
        if (resizeAspect.checked) {
            const img = document.getElementById('large-image');
            const ratio = img.naturalWidth / img.naturalHeight;
            resizeWidth.value = Math.round(resizeHeight.value * ratio);
        }
    });

    resizeApply.addEventListener('click', async () => {
        const img = document.getElementById('large-image');
        if (!img) return;

        const w = parseInt(resizeWidth.value);
        const h = parseInt(resizeHeight.value);

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);

        await saveEditedImage(canvas.toDataURL('image/jpeg', 0.9));
        closeModal();
    });

    resizeCancel.addEventListener('click', closeModal);

    // --- Info Modal ---
    const infoOk = document.getElementById('info-ok');

    infoOk.addEventListener('click', closeModal);

    async function showImageInfo(pageIndex) {
        if (pageIndex === -1) {
            return;
        }

        const page = pages[pageIndex];
        const blob = await getImageFromDB(page.id);

        if (!blob) {
            return;
        }

        // Get image dimensions
        const img = new Image();
        const objectUrl = URL.createObjectURL(blob);
        img.src = objectUrl;
        await img.decode();

        // Format file size
        const sizeInBytes = blob.size;
        let sizeString;
        if (sizeInBytes < 1024) {
            sizeString = `${sizeInBytes} bytes`;
        } else if (sizeInBytes < 1024 * 1024) {
            sizeString = `${(sizeInBytes / 1024).toFixed(2)} KB`;
        } else {
            sizeString = `${(sizeInBytes / (1024 * 1024)).toFixed(2)} MB`;
        }

        // Get image type
        const imageType = blob.type || 'Unknown';
        const typeDisplay = imageType.replace('image/', '').toUpperCase();

        // Update modal content
        document.getElementById('info-type').textContent = typeDisplay;
        document.getElementById('info-dimensions').textContent = `${img.naturalWidth} × ${img.naturalHeight} px`;
        document.getElementById('info-size').textContent = sizeString;

        // Clean up
        URL.revokeObjectURL(objectUrl);

        // Show modal
        infoModal.style.display = 'block';
        modalOverlay.style.display = 'flex'; // Ensure flex for centering
    }

    // --- Undo / Redo ---
    undoBtn.addEventListener('click', async () => {
        if (currentPageIndex === -1) return;
        const page = pages[currentPageIndex];
        if (page.historyIndex > 0) {
            await loadHistoryState(page, page.historyIndex - 1);
        }
    });

    redoBtn.addEventListener('click', async () => {
        if (currentPageIndex === -1) return;
        const page = pages[currentPageIndex];
        if (page.historyIndex < page.historyLength - 1) {
            await loadHistoryState(page, page.historyIndex + 1);
        }
    });

    async function loadHistoryState(page, newIndex) {
        // 1. Get the blob from DB (Read-only transaction)
        const blob = await new Promise((resolve, reject) => {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(page.id);
            request.onsuccess = () => {
                const dbPage = request.result;
                if (dbPage && dbPage.history && dbPage.history[newIndex]) {
                    resolve(dbPage.history[newIndex]);
                } else {
                    resolve(null);
                }
            };
            request.onerror = (e) => reject(e);
        });

        if (!blob) return;

        // 2. Process image (Async)
        const dataUrl = await blobToDataURL(blob);
        const thumb = await createThumbnail(dataUrl);

        const img = new Image();
        img.onload = () => {
            // 3. Update DB state (New Read-Write transaction)
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const getReq = store.get(page.id);

            getReq.onsuccess = () => {
                const dbPage = getReq.result;
                if (dbPage) {
                    dbPage.historyIndex = newIndex;
                    dbPage.blob = blob;
                    dbPage.thumbnailDataUrl = thumb;
                    dbPage.width = img.width;
                    dbPage.height = img.height;

                    store.put(dbPage).onsuccess = () => {
                        // Update memory
                        page.historyIndex = newIndex;
                        page.width = img.width;
                        page.height = img.height;
                        page.thumbnailDataUrl = thumb;

                        renderAllThumbnails();
                        renderLargeView();
                        updateUndoRedoButtons();
                    };
                }
            };
        };
        img.src = dataUrl;
    }

    function updateUndoRedoButtons() {
        if (currentPageIndex === -1) {
            undoBtn.disabled = true;
            redoBtn.disabled = true;
            undoBtn.style.opacity = '0.5';
            redoBtn.style.opacity = '0.5';
            return;
        }
        const page = pages[currentPageIndex];
        // Default to 0/1 if undefined
        const idx = page.historyIndex !== undefined ? page.historyIndex : 0;
        const len = page.historyLength !== undefined ? page.historyLength : 1;

        undoBtn.disabled = idx <= 0;
        redoBtn.disabled = idx >= len - 1;

        undoBtn.style.opacity = undoBtn.disabled ? '0.5' : '1';
        redoBtn.style.opacity = redoBtn.disabled ? '0.5' : '1';
    }

    async function saveEditedImage(dataUrl) {
        const page = pages[currentPageIndex];
        const blob = dataURLtoBlob(dataUrl);
        const thumb = await createThumbnail(dataUrl);

        const img = new Image();
        img.onload = async () => {
            page.width = img.width;
            page.height = img.height;
            page.thumbnailDataUrl = thumb;

            // Update history in DB
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const getReq = store.get(page.id);

            getReq.onsuccess = () => {
                const dbPage = getReq.result;
                if (dbPage) {
                    if (!dbPage.history) dbPage.history = [];

                    // Truncate history if we are in the middle
                    let idx = dbPage.historyIndex;
                    if (idx === undefined || idx < 0) idx = dbPage.history.length - 1;

                    if (idx < dbPage.history.length - 1) {
                        dbPage.history = dbPage.history.slice(0, idx + 1);
                    }

                    dbPage.history.push(blob);
                    dbPage.historyIndex = dbPage.history.length - 1;

                    // Update other fields
                    dbPage.width = page.width;
                    dbPage.height = page.height;
                    dbPage.thumbnailDataUrl = thumb;
                    dbPage.blob = blob;

                    const putReq = store.put(dbPage);
                    putReq.onsuccess = () => {
                        // Update memory state
                        page.historyIndex = dbPage.historyIndex;
                        page.historyLength = dbPage.history.length;

                        renderAllThumbnails();
                        renderLargeView();
                        updateUndoRedoButtons();
                    };
                }
            };
        };
        img.src = dataUrl;
    }
});