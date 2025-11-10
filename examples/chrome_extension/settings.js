// Settings page JavaScript

const showFloatingIconToggle = document.getElementById('showFloatingIcon');
const statusMessage = document.getElementById('statusMessage');

// Load current settings
chrome.storage.local.get(['showFloatingIcon'], (result) => {
    showFloatingIconToggle.checked = result.showFloatingIcon !== false; // Default to true
});

// Save settings when changed
showFloatingIconToggle.addEventListener('change', () => {
    const showIcon = showFloatingIconToggle.checked;

    chrome.storage.local.set({ showFloatingIcon: showIcon }, () => {
        // Show success message
        statusMessage.textContent = showIcon
            ? '✓ Floating icon will appear when you open the scanner'
            : '✓ Floating icon will be hidden';
        statusMessage.className = 'status-message success';
        statusMessage.style.display = 'block';

        // Hide message after 3 seconds
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 3000);
    });
});
