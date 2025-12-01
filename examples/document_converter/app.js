document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const cameraButton = document.getElementById('camera-button');
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
    const hiddenContainer = document.getElementById('hidden-container');
    const mainContainer = document.querySelector('main');

    // Camera elements
    const cameraOverlay = document.getElementById('camera-overlay');
    const cameraVideo = document.getElementById('camera-video');
    const captureBtn = document.getElementById('capture-btn');
    const closeCameraBtn = document.getElementById('close-camera-btn');
    let mediaStream = null;

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
            const request = store.put(data);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
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

                    pages.push({
                        id: page.id,
                        width: page.width,
                        height: page.height,
                        sourceFile: page.sourceFile,
                        thumbnailDataUrl: thumb
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
            request.onsuccess = (e) => resolve(e.target.result ? e.target.result.blob : null);
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

    function createThumbnail(dataUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ratio = 1;
                canvas.width = img.width * ratio;
                canvas.height = img.height * ratio;
                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 1));
            };
            img.src = dataUrl;
        });
    }

    // Initialize PDF.js
    const { jsPDF } = window.jspdf;

    // --- Camera Handling ---

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
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
        const html = result.value;

        const tempContainer = document.createElement('div');
        const pageWidth = 800;
        tempContainer.style.width = `${pageWidth}px`;
        tempContainer.style.background = 'white';
        tempContainer.style.padding = '40px';
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.innerHTML = html;
        document.body.appendChild(tempContainer);

        try {
            const canvas = await html2canvas(tempContainer, {
                scale: 1.5,
                useCORS: true
            });

            const pageHeight = pageWidth * 1.414; // A4 aspect ratio
            const totalHeight = canvas.height;
            const scaledPageWidth = canvas.width;
            const scaledPageHeight = pageHeight * 1.5;

            let currentY = 0;
            let pageNum = 1;

            while (currentY < totalHeight) {
                const pageCanvas = document.createElement('canvas');
                pageCanvas.width = scaledPageWidth;
                pageCanvas.height = scaledPageHeight;

                const ctx = pageCanvas.getContext('2d');
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

                const heightToDraw = Math.min(scaledPageHeight, totalHeight - currentY);

                ctx.drawImage(
                    canvas,
                    0, currentY, scaledPageWidth, heightToDraw,
                    0, 0, scaledPageWidth, heightToDraw
                );

                await addPage({
                    dataUrl: pageCanvas.toDataURL('image/jpeg', 0.9),
                    width: scaledPageWidth,
                    height: scaledPageHeight,
                    sourceFile: `${file.name} (Page ${pageNum})`
                });

                currentY += scaledPageHeight;
                pageNum++;
            }

        } finally {
            document.body.removeChild(tempContainer);
        }
    }

    // --- Page Management ---

    async function addPage(pageData) {
        const id = Date.now() + Math.random();
        const blob = dataURLtoBlob(pageData.dataUrl);
        const thumbnailDataUrl = await createThumbnail(pageData.dataUrl);

        const pageObject = {
            id,
            blob,
            width: pageData.width,
            height: pageData.height,
            sourceFile: pageData.sourceFile,
            thumbnailDataUrl: thumbnailDataUrl
        };

        await storeImageInDB(pageObject);

        pages.push({
            id,
            width: pageData.width,
            height: pageData.height,
            sourceFile: pageData.sourceFile,
            thumbnailDataUrl: thumbnailDataUrl
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
            return;
        }

        const page = pages[currentPageIndex];
        largeViewContainer.innerHTML = '';

        // Revoke previous object URL to avoid memory leaks
        if (currentObjectUrl) {
            URL.revokeObjectURL(currentObjectUrl);
            currentObjectUrl = null;
        }

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

            // Prevent default drag behavior to allow panning
            img.addEventListener('dragstart', (e) => e.preventDefault());

            largeViewContainer.appendChild(img);
            updateZoom();
        } catch (err) {
            console.error("Error rendering large view:", err);
            largeViewContainer.textContent = "Error loading image.";
        }
    }    function updateZoom() {
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

        const doc = new jsPDF();

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            if (i > 0) doc.addPage();

            // Calculate aspect ratio to fit A4
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const ratio = Math.min(pageWidth / page.width, pageHeight / page.height);

            const w = page.width * ratio;
            const h = page.height * ratio;

            try {
                const blob = await getImageFromDB(page.id);
                if (blob) {
                    const dataUrl = await blobToDataURL(blob);
                    doc.addImage(dataUrl, 'JPEG', 0, 0, w, h);
                }
            } catch (err) {
                console.error(`Error adding page ${i + 1} to PDF:`, err);
            }
        }

        doc.save('combined_document.pdf');
    });

    saveWordButton.addEventListener('click', async () => {
        if (pages.length === 0) {
            alert('No pages to save.');
            return;
        }

        // Create HTML content with images
        let htmlContent = '<!DOCTYPE html><html><head><title>Document</title></head><body>';

        for (const page of pages) {
            try {
                const blob = await getImageFromDB(page.id);
                if (blob) {
                    const dataUrl = await blobToDataURL(blob);
                    htmlContent += `<p><img src="${dataUrl}" style="width: 100%; max-width: 600px;" /></p><br style="page-break-after: always;" />`;
                }
            } catch (err) {
                console.error("Error adding page to Word:", err);
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
});