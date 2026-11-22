// Screenshot area selector content script
(function () {
    let startX, startY, endX, endY;
    let isSelecting = false;
    let overlay, selectionBox, instructions;

    function init() {
        // Create overlay
        overlay = document.createElement('div');
        overlay.id = 'barcode-screenshot-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 2147483647;
            cursor: crosshair;
        `;

        // Add custom cursor style with bright visible cursor
        const cursorStyle = document.createElement('style');
        cursorStyle.textContent = `
            #barcode-screenshot-overlay {
                cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><line x1="16" y1="0" x2="16" y2="32" stroke="%2300ff00" stroke-width="2"/><line x1="0" y1="16" x2="32" y2="16" stroke="%2300ff00" stroke-width="2"/><circle cx="16" cy="16" r="8" fill="none" stroke="white" stroke-width="2"/><circle cx="16" cy="16" r="8" fill="none" stroke="%2300ff00" stroke-width="1"/></svg>') 16 16, crosshair !important;
            }
            #barcode-screenshot-overlay * {
                cursor: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><line x1="16" y1="0" x2="16" y2="32" stroke="%2300ff00" stroke-width="2"/><line x1="0" y1="16" x2="32" y2="16" stroke="%2300ff00" stroke-width="2"/><circle cx="16" cy="16" r="8" fill="none" stroke="white" stroke-width="2"/><circle cx="16" cy="16" r="8" fill="none" stroke="%2300ff00" stroke-width="1"/></svg>') 16 16, crosshair !important;
            }
        `;
        document.head.appendChild(cursorStyle);

        // Create selection box
        selectionBox = document.createElement('div');
        selectionBox.id = 'barcode-selection-box';
        selectionBox.style.cssText = `
            position: fixed;
            border: 3px solid #00ff00;
            box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.8), 0 0 10px rgba(0, 255, 0, 0.6);
            background: rgba(0, 255, 0, 0.1);
            z-index: 2147483648;
            pointer-events: none;
            display: none;
        `;

        // Create instructions
        instructions = document.createElement('div');
        instructions.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 15px 30px;
            border-radius: 8px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 16px;
            z-index: 2147483649;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        `;
        instructions.innerHTML = '📸 Drag to select area with barcode | Press ESC to cancel';

        document.body.appendChild(overlay);
        document.body.appendChild(selectionBox);
        document.body.appendChild(instructions);

        overlay.addEventListener('mousedown', handleMouseDown);
        overlay.addEventListener('mousemove', handleMouseMove);
        overlay.addEventListener('mouseup', handleMouseUp);
        document.addEventListener('keydown', handleKeyDown);
    }

    function handleMouseDown(e) {
        isSelecting = true;
        startX = e.clientX;
        startY = e.clientY;
        selectionBox.style.display = 'block';
        updateSelectionBox(e.clientX, e.clientY);
    }

    function handleMouseMove(e) {
        if (!isSelecting) return;
        updateSelectionBox(e.clientX, e.clientY);
    }

    function updateSelectionBox(currentX, currentY) {
        endX = currentX;
        endY = currentY;

        const left = Math.min(startX, endX);
        const top = Math.min(startY, endY);
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);

        selectionBox.style.left = left + 'px';
        selectionBox.style.top = top + 'px';
        selectionBox.style.width = width + 'px';
        selectionBox.style.height = height + 'px';
    }

    function handleMouseUp(e) {
        if (!isSelecting) return;
        isSelecting = false;

        const left = Math.min(startX, endX);
        const top = Math.min(startY, endY);
        const width = Math.abs(endX - startX);
        const height = Math.abs(endY - startY);

        // Minimum selection size
        if (width < 20 || height < 20) {
            cleanup();
            chrome.runtime.sendMessage({
                action: 'screenshotCancelled',
                reason: 'Selection too small'
            });
            return;
        }

        // Hide the overlay and selection box before capturing
        overlay.style.display = 'none';
        selectionBox.style.display = 'none';
        instructions.style.display = 'none';

        // Small delay to ensure UI is hidden before capture
        setTimeout(() => {
            // Send selection coordinates to background for capture
            chrome.runtime.sendMessage({
                action: 'captureScreenshot',
                selection: {
                    left: left,
                    top: top,
                    width: width,
                    height: height,
                    devicePixelRatio: window.devicePixelRatio
                }
            });

            cleanup();
        }, 50);
    }

    function handleKeyDown(e) {
        if (e.key === 'Escape') {
            cleanup();
            chrome.runtime.sendMessage({
                action: 'screenshotCancelled',
                reason: 'User cancelled'
            });
        }
    }

    function cleanup() {
        if (overlay) overlay.remove();
        if (selectionBox) selectionBox.remove();
        if (instructions) instructions.remove();
        document.removeEventListener('keydown', handleKeyDown);
    }

    init();
})();
