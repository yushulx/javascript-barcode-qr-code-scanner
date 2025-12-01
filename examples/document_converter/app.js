document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('file-input');
    const cameraButton = document.getElementById('camera-button');
    const savePdfButton = document.getElementById('save-pdf-button');
    const saveWordButton = document.getElementById('save-word-button');
    const deletePageButton = document.getElementById('delete-page-button');
    const deleteAllButton = document.getElementById('delete-all-button');
    const thumbnailsPanel = document.getElementById('thumbnails-panel');
    const viewerPanel = document.getElementById('viewer-panel');
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

    let pages = []; // Array of { id, dataUrl, width, height, sourceFile }
    let currentPageIndex = -1;
    let currentZoom = 1.0;
    let draggedThumbnailIndex = -1;

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

    captureBtn.addEventListener('click', () => {
        if (!mediaStream) return;

        const canvas = document.createElement('canvas');
        canvas.width = cameraVideo.videoWidth;
        canvas.height = cameraVideo.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);

        addPage({
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

            addPage({
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
                img.onload = () => {
                    addPage({
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

            addPage({
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

                addPage({
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

    function addPage(pageData) {
        const id = Date.now() + Math.random();
        pages.push({ ...pageData, id });
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
        img.src = page.dataUrl;

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

    deletePageButton.addEventListener('click', () => {
        if (currentPageIndex === -1) return;

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

    deleteAllButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete all pages?')) {
            pages = [];
            currentPageIndex = -1;
            renderAllThumbnails();
            selectPage(-1);
            largeViewContainer.innerHTML = '';
        }
    });

    function renderLargeView() {
        if (currentPageIndex === -1) {
            largeViewContainer.innerHTML = '';
            return;
        }

        const page = pages[currentPageIndex];
        largeViewContainer.innerHTML = '';

        const img = document.createElement('img');
        img.src = page.dataUrl;
        img.style.maxWidth = '100%';
        img.style.boxShadow = '0 0 10px rgba(0,0,0,0.1)';

        largeViewContainer.appendChild(img);
        updateZoom();
    }

    function updateZoom() {
        if (largeViewContainer.firstChild) {
            largeViewContainer.style.transform = `scale(${currentZoom})`;
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

    // --- Saving ---

    savePdfButton.addEventListener('click', () => {
        if (pages.length === 0) {
            alert('No pages to save.');
            return;
        }

        const doc = new jsPDF();

        pages.forEach((page, index) => {
            if (index > 0) doc.addPage();

            // Calculate aspect ratio to fit A4
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const ratio = Math.min(pageWidth / page.width, pageHeight / page.height);

            const w = page.width * ratio;
            const h = page.height * ratio;

            doc.addImage(page.dataUrl, 'JPEG', 0, 0, w, h);
        });

        doc.save('combined_document.pdf');
    });

    saveWordButton.addEventListener('click', () => {
        if (pages.length === 0) {
            alert('No pages to save.');
            return;
        }

        // Create HTML content with images
        let htmlContent = '<!DOCTYPE html><html><head><title>Document</title></head><body>';

        pages.forEach(page => {
            htmlContent += `<p><img src="${page.dataUrl}" style="width: 100%; max-width: 600px;" /></p><br style="page-break-after: always;" />`;
        });

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