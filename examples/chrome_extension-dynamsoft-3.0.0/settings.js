// Settings page JavaScript

const showFloatingIconToggle = document.getElementById('showFloatingIcon');
const statusMessage = document.getElementById('statusMessage');
const licenseKeyInput = document.getElementById('licenseKeyInput');
const saveLicenseBtn = document.getElementById('saveLicenseBtn');
const clearLicenseBtn = document.getElementById('clearLicenseBtn');
const licenseStatus = document.getElementById('licenseStatus');
const engineRadios = document.querySelectorAll('input[name=\"engineOption\"]');

// Load current settings
chrome.storage.local.get(['showFloatingIcon', 'customLicenseKey', 'scannerEngine'], (result) => {
    showFloatingIconToggle.checked = result.showFloatingIcon !== false; // Default to true

    // Load custom license key if exists
    if (result.customLicenseKey) {
        licenseKeyInput.value = result.customLicenseKey;
        showLicenseStatus('Custom license key is set', 'active');
    }

    const engineValue = result.scannerEngine || 'dynamsoft';
    engineRadios.forEach(radio => {
        radio.checked = radio.value === engineValue;
    });
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

engineRadios.forEach(radio => {
    radio.addEventListener('change', () => {
        if (!radio.checked) return;

        chrome.storage.local.set({ scannerEngine: radio.value }, () => {
            statusMessage.textContent = radio.value === 'zxing'
                ? 'Using ZXing-WASM (no login needed).'
                : 'Using Dynamsoft engine (login or license required).';
            statusMessage.className = 'status-message success';
            statusMessage.style.display = 'block';

            setTimeout(() => {
                statusMessage.style.display = 'none';
            }, 3000);
        });
    });
});

// Save custom license key
saveLicenseBtn.addEventListener('click', () => {
    const licenseKey = licenseKeyInput.value.trim();

    if (!licenseKey) {
        showLicenseStatus('Please enter a license key', 'info');
        return;
    }

    // Save to chrome storage
    chrome.storage.local.set({ customLicenseKey: licenseKey }, () => {
        showLicenseStatus('✓ Custom license key saved successfully', 'active');

        // Show status message
        statusMessage.textContent = '✓ License key saved. It will be used when you scan barcodes.';
        statusMessage.className = 'status-message success';
        statusMessage.style.display = 'block';

        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 3000);
    });
});

// Clear custom license key
clearLicenseBtn.addEventListener('click', () => {
    licenseKeyInput.value = '';

    chrome.storage.local.remove('customLicenseKey', () => {
        showLicenseStatus('Custom license key cleared. Will use Google auth license.', 'info');

        // Show status message
        statusMessage.textContent = '✓ License key cleared. Google auth license will be used.';
        statusMessage.className = 'status-message success';
        statusMessage.style.display = 'block';

        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 3000);
    });
});

// Helper function to show license status
function showLicenseStatus(message, type) {
    licenseStatus.textContent = message;
    licenseStatus.className = 'license-status ' + type;
    licenseStatus.style.display = 'block';
}
