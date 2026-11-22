// Auto-inject floating icon on page load if enabled
(function () {
    // Check if user wants to show floating icon
    chrome.storage.local.get(['showFloatingIcon'], (result) => {
        const showIcon = result.showFloatingIcon !== false; // Default to true

        if (showIcon) {
            // Wait a bit for page to fully load
            setTimeout(() => {
                // Check if icon doesn't already exist
                if (!document.getElementById('barcode-floating-icon')) {
                    // Get the icon URL from the extension
                    const iconUrl = chrome.runtime.getURL('icons/icon48.png');

                    // Inject the floating icon with the URL
                    injectFloatingIcon(iconUrl);
                }
            }, 500);
        }
    });

    function injectFloatingIcon(iconUrl) {
        // Create container for icon and close button
        const container = document.createElement('div');
        container.id = 'barcode-floating-icon';
        container.style.cssText = `
            position: fixed;
            top: 50%;
            right: 20px;
            transform: translateY(-50%);
            z-index: 2147483646;
            user-select: none;
            width: 48px;
            height: 48px;
        `;

        // Create floating icon
        const floatingIcon = document.createElement('img');
        floatingIcon.src = iconUrl;
        floatingIcon.title = 'Open Barcode Scanner';
        floatingIcon.draggable = false;
        floatingIcon.style.cssText = `
            width: 48px;
            height: 48px;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            transition: transform 0.2s, box-shadow 0.2s;
            border-radius: 8px;
            display: block;
            position: relative;
            pointer-events: auto;
            -webkit-user-drag: none;
            user-drag: none;
        `;

        // Create close button
        const closeBtn = document.createElement('div');
        closeBtn.innerHTML = '×';
        closeBtn.title = 'Hide floating icon';
        closeBtn.style.cssText = `
            position: absolute;
            top: -8px;
            right: -8px;
            width: 20px;
            height: 20px;
            background: #ff4444;
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
            line-height: 1;
            font-family: Arial, sans-serif;
            transition: all 0.2s;
            z-index: 1;
        `;

        container.appendChild(floatingIcon);
        container.appendChild(closeBtn);

        // Hover effects
        floatingIcon.addEventListener('mouseenter', () => {
            floatingIcon.style.transform = 'scale(1.1)';
            floatingIcon.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4)';
        });

        floatingIcon.addEventListener('mouseleave', () => {
            floatingIcon.style.transform = 'scale(1)';
            floatingIcon.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
        });

        closeBtn.addEventListener('mouseenter', () => {
            closeBtn.style.background = '#ff0000';
            closeBtn.style.transform = 'scale(1.1)';
        });

        closeBtn.addEventListener('mouseleave', () => {
            closeBtn.style.background = '#ff4444';
            closeBtn.style.transform = 'scale(1)';
        });

        // Click to open side panel
        floatingIcon.addEventListener('click', (e) => {
            if (!hasDragged) {
                chrome.runtime.sendMessage({ action: 'openSidePanel' });
            }
        });

        // Close button handler
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            chrome.storage.local.set({ showFloatingIcon: false }, () => {
                container.remove();
            });
        });

        // Make it draggable
        let isDragging = false;
        let hasDragged = false;
        let currentX;
        let currentY;
        let initialX;
        let initialY;
        let xOffset = 0;
        let yOffset = 0;

        container.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        function dragStart(e) {
            if (e.target === closeBtn) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            isDragging = true;
            hasDragged = false;
        }

        function drag(e) {
            if (isDragging) {
                e.preventDefault();
                e.stopPropagation();

                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;

                if (Math.abs(currentX - xOffset) > 5 || Math.abs(currentY - yOffset) > 5) {
                    hasDragged = true;
                }

                xOffset = currentX;
                yOffset = currentY;

                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                const iconSize = 48;

                let newRight = viewportWidth - (e.clientX + iconSize / 2);
                let newTop = e.clientY - iconSize / 2;

                newRight = Math.max(10, Math.min(newRight, viewportWidth - iconSize - 10));
                newTop = Math.max(10, Math.min(newTop, viewportHeight - iconSize - 10));

                container.style.right = newRight + 'px';
                container.style.top = newTop + 'px';
                container.style.transform = 'none';
            }
        }

        function dragEnd(e) {
            if (isDragging) {
                initialX = currentX;
                initialY = currentY;
                isDragging = false;

                setTimeout(() => {
                    hasDragged = false;
                }, 100);
            }
        }

        // Add to page
        document.body.appendChild(container);
    }
})();
