// Floating icon to reopen side panel
(function () {
    // Check if icon already exists
    if (document.getElementById('barcode-floating-icon')) {
        return;
    }

    // Create floating icon
    const floatingIcon = document.createElement('img');
    floatingIcon.id = 'barcode-floating-icon';
    floatingIcon.src = chrome.runtime.getURL('icons/icon48.png');
    floatingIcon.title = 'Open Barcode Scanner';

    floatingIcon.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 48px;
        height: 48px;
        cursor: pointer;
        z-index: 2147483646;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transition: transform 0.2s, box-shadow 0.2s;
        user-select: none;
        border-radius: 8px;
    `;

    // Hover effects
    floatingIcon.addEventListener('mouseenter', () => {
        floatingIcon.style.transform = 'scale(1.1)';
        floatingIcon.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4)';
    });

    floatingIcon.addEventListener('mouseleave', () => {
        floatingIcon.style.transform = 'scale(1)';
        floatingIcon.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
    });

    // Click to open side panel
    floatingIcon.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'openSidePanel' });
    });

    // Make it draggable
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    floatingIcon.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
        if (e.target === floatingIcon) {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
            isDragging = true;
        }
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;
            xOffset = currentX;
            yOffset = currentY;

            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const iconSize = 60;

            // Keep within viewport bounds
            let newRight = viewportWidth - (e.clientX + iconSize / 2);
            let newBottom = viewportHeight - (e.clientY + iconSize / 2);

            // Clamp values
            newRight = Math.max(10, Math.min(newRight, viewportWidth - iconSize - 10));
            newBottom = Math.max(10, Math.min(newBottom, viewportHeight - iconSize - 10));

            floatingIcon.style.right = newRight + 'px';
            floatingIcon.style.bottom = newBottom + 'px';
        }
    }

    function dragEnd(e) {
        if (isDragging) {
            initialX = currentX;
            initialY = currentY;
            isDragging = false;
        }
    }

    // Add to page
    document.body.appendChild(floatingIcon);
})();
