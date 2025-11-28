let barcodeScanner;
let currentDoc;
let licenseKey;
let pdfPages = []; // Store all PDF pages
let currentPageIndex = 0;
let pageResults = []; // Store barcode results for each page
let authWindowId = null; // Track Chrome extension window ID
let pollTimer = null;
let engine = 'dynamsoft'; // dynamsoft | zxing
let zxingReader = null;
let pdfWorkerConfigured = false;

const divScanner = document.getElementById("divScanner");
const container = document.getElementById("container");
const resultArea = document.getElementById("result");
const resultContainer = document.querySelector("#results");
const imageContainer = document.getElementById("imageContainer");
const imageCanvas = document.getElementById("imageCanvas");
const pageNavigation = document.getElementById("pageNavigation");
const prevPageBtn = document.getElementById("prevPage");
const nextPageBtn = document.getElementById("nextPage");
const pageInfo = document.getElementById("pageInfo");
const loginButton = document.getElementById("loginButton");
const loginStatus = document.getElementById("loginStatus");
const screenshotBtn = document.getElementById("screenshot");
const settingsPanel = document.getElementById("settingsPanel");
const openSettingsBtn = document.getElementById("openSettings");
const closeSettingsBtn = document.getElementById("closeSettings");
const showFloatingIconToggle = document.getElementById("showFloatingIconToggle");
const userNameElement = document.querySelector(".user-name");
const engineOptions = document.querySelectorAll('input[name="engineOption"]');
const engineHint = document.getElementById('engineHint');

// Settings Panel
openSettingsBtn.addEventListener('click', () => {
    settingsPanel.classList.add('open');
});

closeSettingsBtn.addEventListener('click', () => {
    settingsPanel.classList.remove('open');
});

// Engine selector handling
function applyEngineChoice(choice, skipSave = false) {
    engine = choice;
    if (!skipSave) {
        chrome.storage.local.set({ scannerEngine: engine });
    }

    engineOptions.forEach(option => {
        option.checked = option.value === engine;
    });

    if (engineHint) {
        engineHint.textContent = engine === 'zxing'
            ? 'Uses open-source ZXing-WASM. No login or license required.'
            : 'Uses Dynamsoft SDK. Trial/login or license key required for scanning.';
    }

    if (engine === 'zxing') {
        loginButton.style.display = 'none';
        loginStatus.textContent = 'Using ZXing-WASM (free mode)';
    } else {
        loginButton.style.display = 'inline-flex';
        if (!licenseKey) {
            loginStatus.textContent = 'Get your free 30-day trial license';
        }
    }

    refreshLoginUI();
    if (engine === 'dynamsoft') {
        checkExistingAuth();
    }
}

function refreshLoginUI() {
    if (!loginStatus || !loginButton) return;

    if (engine === 'zxing') {
        loginButton.style.display = 'none';
        loginStatus.textContent = 'Using ZXing-WASM (free mode)';
        return;
    }

    const hasValidLicense = licenseKey && isLicenseValid();

    if (hasValidLicense) {
        loginButton.style.display = 'none';
        if (!loginStatus.textContent.toLowerCase().includes('licensed')) {
            loginStatus.textContent = 'Licensed';
        }
    } else {
        loginButton.style.display = 'inline-flex';
        loginStatus.textContent = 'Get your free 30-day trial license';
    }
}

engineOptions.forEach(option => {
    option.addEventListener('change', (e) => {
        if (e.target.checked) {
            applyEngineChoice(e.target.value);
        }
    });
});

// Help button handler
const helpBtn = document.getElementById('helpBtn');
helpBtn.addEventListener('click', () => {
    window.open('https://www.dynamsoft.com/codepool/chrome-extension-barcode-qr-code-scanner.html', '_blank');
});

// Load floating icon setting and saved engine
chrome.storage.local.get(['showFloatingIcon', 'customLicenseKey', 'scannerEngine'], (result) => {
    showFloatingIconToggle.checked = result.showFloatingIcon !== false;
    if (result.scannerEngine) {
        engine = result.scannerEngine;
    }
    applyEngineChoice(engine, true);

    // Load custom license key if exists
    const licenseKeyInput = document.getElementById('licenseKeyInput');
    const licenseStatus = document.getElementById('licenseStatus');
    if (result.customLicenseKey && licenseKeyInput) {
        licenseKeyInput.value = result.customLicenseKey;
        if (licenseStatus) {
            licenseStatus.textContent = 'Custom license key is set';
            licenseStatus.style.display = 'block';
            licenseStatus.style.background = '#d4edda';
            licenseStatus.style.color = '#155724';
            licenseStatus.style.border = '1px solid #c3e6cb';
        }
    }

});

// Save floating icon setting
showFloatingIconToggle.addEventListener('change', () => {
    const showIcon = showFloatingIconToggle.checked;
    chrome.storage.local.set({ showFloatingIcon: showIcon });
});

// License key management
const licenseKeyInput = document.getElementById('licenseKeyInput');
const saveLicenseBtn = document.getElementById('saveLicenseBtn');
const clearLicenseBtn = document.getElementById('clearLicenseBtn');
const licenseStatus = document.getElementById('licenseStatus');

if (saveLicenseBtn) {
    saveLicenseBtn.addEventListener('click', () => {
        const licenseKey = licenseKeyInput.value.trim();

        if (!licenseKey) {
            licenseStatus.textContent = 'Please enter a license key';
            licenseStatus.style.display = 'block';
            licenseStatus.style.background = '#d1ecf1';
            licenseStatus.style.color = '#0c5460';
            licenseStatus.style.border = '1px solid #bee5eb';
            return;
        }

        chrome.storage.local.set({ customLicenseKey: licenseKey }, () => {
            licenseStatus.textContent = 'Custom license key saved successfully';
            licenseStatus.style.display = 'block';
            licenseStatus.style.background = '#d4edda';
            licenseStatus.style.color = '#155724';
            licenseStatus.style.border = '1px solid #c3e6cb';

            // Reload to apply new license
            setTimeout(() => location.reload(), 1000);
        });
    });
}

if (clearLicenseBtn) {
    clearLicenseBtn.addEventListener('click', () => {
        licenseKeyInput.value = '';

        chrome.storage.local.remove('customLicenseKey', () => {
            licenseStatus.textContent = 'Custom license key cleared. Will use Google auth license.';
            licenseStatus.style.display = 'block';
            licenseStatus.style.background = '#d1ecf1';
            licenseStatus.style.color = '#0c5460';
            licenseStatus.style.border = '1px solid #bee5eb';

            // Reload to apply change
            setTimeout(() => location.reload(), 1000);
        });
    });
}


// Listen for storage changes (e.g., when custom license key is updated)
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.customLicenseKey) {
        // Custom license key was updated
        if (changes.customLicenseKey.newValue) {
            // New license key set
            console.log('Custom license key updated');
            // Reload the page to apply new license
            location.reload();
        } else if (changes.customLicenseKey.oldValue && !changes.customLicenseKey.newValue) {
            // License key was removed
            console.log('Custom license key removed');
            location.reload();
        }
    }
});

// Listen for messages from background script (context menu, etc.)
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === 'decodeImageUrl') {
        decodeImageFromUrl(request.imageUrl);
    } else if (request.action === 'screenshotResult') {
        // Handle screenshot result
        if (request.success && request.dataUrl) {
            try {
                // Convert data URL to blob
                const fetchResponse = await fetch(request.dataUrl);
                const blob = await fetchResponse.blob();

                // Create a File object from the blob
                const file = new File([blob], 'screenshot.png', { type: 'image/png' });

                // Trigger the file input change event with the screenshot file
                const fileInput = document.getElementById('file');
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(file);
                fileInput.files = dataTransfer.files;

                // Trigger the file change event to process the screenshot
                const event = new Event('change', { bubbles: true });
                fileInput.dispatchEvent(event);

            } catch (error) {
                console.error('Error processing screenshot:', error);
                resultArea.value = `Error processing screenshot: ${error.message}`;
                toggleLoading(false);
            }
        } else if (request.cancelled) {
            console.log('Screenshot cancelled:', request.reason);
        } else {
            console.error('Screenshot error:', request.error || request.reason);
            if (request.error) {
                resultArea.value = `Error: ${request.error}`;
            }
        }
    }
});

// Function to decode image from URL (context menu)
async function decodeImageFromUrl(imageUrl) {
    if (engine === 'dynamsoft') {
        const effectiveLicense = await getEffectiveLicenseKey();

        if (!effectiveLicense) {
            alert('⚠️ No valid license. Please login to get a trial license or set a custom license in settings.');
            toggleLoading(false);
            return;
        }

        if (!effectiveLicense.isCustom && !isLicenseValid()) {
            alert('⚠️ Your license has expired. Please login again to renew your trial license or set a custom license in settings.');
            loginStatus.textContent = '⚠️ License expired. Please login again.';
            loginButton.style.display = 'block';
            toggleLoading(false);
            return;
        }
    }

    try {
        toggleLoading(true);

        // Fetch the image
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const file = new File([blob], 'context-menu-image.jpg', { type: blob.type });

        // Trigger the file input with the image
        const fileInput = document.getElementById('file');
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        fileInput.files = dataTransfer.files;

        // Trigger the file change event
        const event = new Event('change', { bubbles: true });
        fileInput.dispatchEvent(event);
    } catch (error) {
        console.error('Error decoding image from URL:', error);
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

async function ensureZXingReady() {
    if (!zxingReader) {
        const module = await import('./libs/zxing-wasm/es/reader/index.js');
        zxingReader = module.readBarcodesFromImageData;
    }

    if (typeof pdfjsLib !== 'undefined' && !pdfWorkerConfigured) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'libs/pdfjs/pdf.worker.min.js';
        pdfWorkerConfigured = true;
    }
}

function normalizeLocationPoints(location) {
    if (!location) return null;

    if (Array.isArray(location)) {
        return location;
    }

    if (location.points && Array.isArray(location.points)) {
        return location.points;
    }

    if (location.topLeft && location.topRight && location.bottomRight && location.bottomLeft) {
        return [location.topLeft, location.topRight, location.bottomRight, location.bottomLeft];
    }

    return null;
}

async function decodeWithZXing(imageSource, maxSymbols = 255) {
    await ensureZXingReady();

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = imageSource.width || imageSource.naturalWidth;
    canvas.height = imageSource.height || imageSource.naturalHeight;
    ctx.drawImage(imageSource, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const results = await zxingReader(imageData, { maxSymbols });
    return {
        items: results.map(result => ({
            text: result.text,
            formatString: result.format,
            location: { points: normalizeLocationPoints(result.position || result.location) }
        }))
    };
}

async function processFileWithZXing(fileToProcess) {
    await ensureZXingReady();

    if (fileToProcess.type !== "application/pdf") {
        const url = URL.createObjectURL(fileToProcess);
        return [{ blob: fileToProcess, url }];
    }

    const arrayBuffer = await fileToProcess.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pageCount = pdf.numPages;
    let pages = [];

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport }).promise;

        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        const url = canvas.toDataURL('image/png');
        pages.push({ blob, url, width: viewport.width, height: viewport.height });
    }

    return pages;
}

// Get cookie from Dynamsoft domain via background script
async function getCookie(name) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(
            { action: 'getCookie', cookieName: name },
            (response) => {
                if (response && response.cookie) {
                    resolve(response.cookie.value);
                } else {
                    resolve(null);
                }
            }
        );
    });
}

// Poll for authentication tokens from Dynamsoft
function startPolling() {
    let pollAttempts = 0;
    const maxAttempts = 300; // 5 minutes at 1 second intervals

    pollTimer = setInterval(async () => {
        pollAttempts++;

        // Check cookies via background script
        const token = await getCookie('DynamsoftToken');
        const user = await getCookie('DynamsoftUser');

        if (token && user) {
            console.log('Authentication detected!', { token, user });
            clearInterval(pollTimer);

            // Close the auth window if we have the windowId
            if (authWindowId) {
                try {
                    chrome.windows.remove(authWindowId);
                } catch (e) {
                    console.log('Could not close auth window');
                }
            }

            // Decode if needed
            const decodedToken = decodeURIComponent(token);
            const decodedUser = decodeURIComponent(user);

            // Request trial license
            requestTrialLicense(decodedToken, decodedUser);
        } else if (pollAttempts >= maxAttempts) {
            // Stop polling after max attempts
            clearInterval(pollTimer);
            loginStatus.textContent = 'Login timeout. Please try again.';
        }
    }, 1000); // Poll every second
}

// Request trial license from Dynamsoft API via background script
async function requestTrialLicense(token, userId) {
    if (engine === "zxing") {
        toggleLoading(false);
        return;
    }
    try {
        toggleLoading(true);
        loginStatus.textContent = 'Getting user info...';

        // First, get user info to retrieve email
        chrome.runtime.sendMessage(
            {
                action: 'getUserInfo',
                token: token,
                userId: userId
            },
            (userInfoResponse) => {
                if (!userInfoResponse.success) {
                    throw new Error(userInfoResponse.error || 'Failed to get user info');
                }

                const email = userInfoResponse.data.email;
                const firstName = userInfoResponse.data.firstName;
                console.log('User email:', email);
                console.log('User first name:', firstName);

                // Update user name in sidebar
                if (firstName && userNameElement) {
                    userNameElement.textContent = firstName;
                }

                loginStatus.textContent = 'Requesting trial license...';

                // Now request trial license with email
                chrome.runtime.sendMessage(
                    {
                        action: 'requestTrialLicense',
                        token: token,
                        userId: userId,
                        email: email
                    },
                    async (response) => {
                        if (response.success && response.data.code === 0 && response.data.data) {
                            // response.data.data is an object, not an array
                            licenseKey = response.data.data.licenseKey;
                            const expirationDate = new Date(response.data.data.expirationDate);
                            const now = new Date();

                            // Check if license is already expired
                            if (expirationDate <= now) {
                                loginStatus.textContent = '⚠️ License expired';
                                alert('Warning: The license has already expired. Please contact support for a new license.');
                                toggleLoading(false);
                                return;
                            }

                            // DON'T store license key - store only expiration date for reference
                            localStorage.setItem('dynamsoft_license_expiry', response.data.data.expirationDate);

                            // Activate SDK automatically
                            await activateSDK(licenseKey);

                            // Calculate days until expiration
                            const daysUntilExpiry = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));
                            loginStatus.textContent = `Licensed (Trial - ${daysUntilExpiry} days left)`;
                            loginButton.style.display = 'none';
                            refreshLoginUI();
                        } else {
                            throw new Error(response.data?.message || response.error || 'Failed to obtain license');
                        }
                    }
                );
            }
        );
    } catch (error) {
        console.error('Error requesting trial license:', error);
        loginStatus.textContent = 'Error obtaining license';
        alert('Failed to obtain trial license. Please try again or contact support.');
        toggleLoading(false);
    }
}

// Activate SDK with license key
async function activateSDK(licenseKey) {
    try {
        toggleLoading(true);
        loginStatus.textContent = 'Activating SDK...';

        Dynamsoft.DDV.Core.license = licenseKey;
        await Dynamsoft.DDV.Core.init();
        currentDoc = Dynamsoft.DDV.documentManager.createDocument({
            name: Date.now().toString(),
            author: "DDV",
        });

        loginStatus.textContent = '✓ SDK Activated';
        toggleLoading(false);
    } catch (error) {
        console.error('Error activating SDK:', error);
        loginStatus.textContent = 'Error activating SDK';
        toggleLoading(false);
        throw error;
    }
}

// Get effective license key (custom key takes priority over Google auth)
async function getEffectiveLicenseKey() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['customLicenseKey'], (result) => {
            if (result.customLicenseKey) {
                // Custom license key exists - use it
                resolve({
                    key: result.customLicenseKey,
                    source: 'custom',
                    isCustom: true
                });
            } else if (licenseKey) {
                // Use Google auth license
                resolve({
                    key: licenseKey,
                    source: 'google-auth',
                    isCustom: false
                });
            } else {
                // No license available
                resolve(null);
            }
        });
    });
}

// Check if license is valid (not expired)
function isLicenseValid() {
    const storedExpiry = localStorage.getItem('dynamsoft_license_expiry');
    if (!storedExpiry) return false;

    const expiryDate = new Date(storedExpiry);
    const now = new Date();
    return expiryDate > now;
}


// Handle Google login
loginButton.addEventListener('click', () => {
    loginStatus.textContent = 'Opening login window...';

    // Open OAuth popup via background script
    chrome.runtime.sendMessage(
        {
            action: 'openAuthPopup',
            redirectUri: 'https://www.dynamsoft.com/'
        },
        (response) => {
            if (response && response.windowId) {
                authWindowId = response.windowId;
                console.log('Auth window opened:', authWindowId);

                // Start polling for cookies
                loginStatus.textContent = 'Please login with Google...';
                startPolling();
            } else {
                loginStatus.textContent = 'Failed to open login window';
            }
        }
    );
});

// Check for existing license on page load
window.addEventListener('load', async () => {
    if (engine === 'zxing') {
        refreshLoginUI();
        return;
    }
    const storedExpiry = localStorage.getItem('dynamsoft_license_expiry');

    if (storedExpiry) {
        const expiryDate = new Date(storedExpiry);
        const now = new Date();

        if (expiryDate > now) {
            // License might still be valid - try to get fresh license with existing auth
            const token = await getCookie('DynamsoftToken');
            const userId = await getCookie('DynamsoftUser');

            if (token && userId) {
                // Re-request license using existing auth tokens
                await requestTrialLicense(decodeURIComponent(token), decodeURIComponent(userId));
                return;
            }
        } else {
            // License expired
            localStorage.removeItem('dynamsoft_license_expiry');
            loginStatus.textContent = '⚠️ License expired. Please login again.';
        }
    }
});

function updatePageNavigation() {
    // Always show navigation, even for single page
    pageNavigation.style.display = "flex";
    pageInfo.textContent = `Page ${currentPageIndex + 1} of ${pdfPages.length}`;
    prevPageBtn.disabled = currentPageIndex === 0;
    nextPageBtn.disabled = currentPageIndex === pdfPages.length - 1;
}

function displayPage(pageIndex) {
    if (pageIndex < 0 || pageIndex >= pdfPages.length) return;

    currentPageIndex = pageIndex;
    const pageData = pdfPages[pageIndex];

    // Display the image
    const ctx = imageCanvas.getContext("2d");
    const img = new Image();

    img.onload = function () {
        imageCanvas.width = img.width;
        imageCanvas.height = img.height;
        ctx.clearRect(0, 0, imageCanvas.width, imageCanvas.height);
        ctx.drawImage(img, 0, 0);

        // Draw barcode boxes if results exist for this page
        if (pageResults[pageIndex] && pageResults[pageIndex].items) {
            pageResults[pageIndex].items.forEach(item => {
                const points = normalizeLocationPoints(item.location && (item.location.points || item.location));
                if (!points || points.length < 4) {
                    return;
                }
                ctx.strokeStyle = engine === 'zxing' ? '#00c774' : '#ff0000';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(points[0].x, points[0].y);
                ctx.lineTo(points[1].x, points[1].y);
                ctx.lineTo(points[2].x, points[2].y);
                ctx.lineTo(points[3].x, points[3].y);
                ctx.closePath();
                ctx.stroke();
            });
        }

        // Update result area with current page results
        displayCurrentPageResults();
    };

    img.src = pageData.url;
    updatePageNavigation();
}

function displayCurrentPageResults() {
    // Always show barcode count instead of page numbers
    const currentPageBarcodeCount = pageResults[currentPageIndex] && pageResults[currentPageIndex].items ? pageResults[currentPageIndex].items.length : 0;

    resultArea.value = `=== Total Barcodes: ${currentPageBarcodeCount} ===\n\n`;

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
    // Unified results display with summary
    resultArea.value = "";
    let totalBarcodes = 0;

    pageResults.forEach((result, index) => {
        if (result && result.items && result.items.length > 0) {
            totalBarcodes += result.items.length;
        }
    });

    // Always show summary header
    if (totalBarcodes === 0) {
        resultArea.value = `📊 Summary: No barcodes found (${pdfPages.length} page${pdfPages.length > 1 ? 's' : ''} scanned)\n\n`;
    } else {
        resultArea.value = `📊 Summary: ${totalBarcodes} barcode${totalBarcodes > 1 ? 's' : ''} found across ${pdfPages.length} page${pdfPages.length > 1 ? 's' : ''}\n\n`;
    }

    // Show detailed results for each page
    pageResults.forEach((result, index) => {
        if (result && result.items && result.items.length > 0) {
            resultArea.value += `=== Page ${index + 1} ===\n`;
            result.items.forEach(item => {
                resultArea.value += "Text: " + item.text + "\n";
                resultArea.value += "Format: " + item.formatString + "\n";
            });
            resultArea.value += "\n";
        }
    });
}

// Page navigation event listeners
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

document.getElementById("scan").addEventListener('click', async () => {
    if (engine === 'zxing') {
        await chrome.tabs.create({ url: chrome.runtime.getURL('scanner.html') });
        return;
    }

    const effectiveLicense = await getEffectiveLicenseKey();

    if (!effectiveLicense) {
        alert('⚠️ No valid license. Please login to get a trial license or set a custom license in settings.');
        return;
    }

    if (!effectiveLicense.isCustom && !isLicenseValid()) {
        alert('⚠️ Your license has expired. Please login again to renew your trial license or set a custom license in settings.');
        loginStatus.textContent = '⚠️ License expired. Please login again.';
        loginButton.style.display = 'block';
        return;
    }

    const tab = await chrome.tabs.create({
        url: chrome.runtime.getURL('scanner.html')
    });

    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
        if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.sendMessage(tabId, {
                action: 'setLicense',
                licenseKey: effectiveLicense.key
            });
            chrome.tabs.onUpdated.removeListener(listener);
        }
    });
});

document.getElementById("file").onchange = async function () {
    const files = Array.from(this.files || []);
    if (!files.length) return;

    // ZXing path (no license required)
    if (engine === 'zxing') {
        try {
            toggleLoading(true);
            pdfPages = [];
            pageResults = [];
            currentPageIndex = 0;
            imageContainer.style.display = "none";

            let fileToProcess = files[0];
            const pages = await processFileWithZXing(fileToProcess);
            pdfPages = pages;
            pageResults = new Array(pages.length);

            for (let i = 0; i < pages.length; i++) {
                const img = document.createElement('img');
                img.src = pages[i].url;
                await new Promise(resolve => img.onload = resolve);
                const result = await decodeWithZXing(img, 255);
                pageResults[i] = result;
            }

            if (pages.length > 0) {
                imageContainer.style.display = "flex";
                displayPage(0);
                displayAllResults();
            }

            toggleLoading(false);
        } catch (error) {
            console.error("Error processing file with ZXing:", error);
            resultArea.value = `Error: ${error.message}`;
            toggleLoading(false);
        }
        return;
    }

    // Dynamsoft path (license required)
    const effectiveLicense = await getEffectiveLicenseKey();

    if (!effectiveLicense) {
        alert('⚠️ No valid license. Please login to get a trial license or set a custom license in settings.');
        return;
    }

    if (!effectiveLicense.isCustom && !isLicenseValid()) {
        alert('⚠️ Your license has expired. Please login again to renew your trial license or set a custom license in settings.');
        loginStatus.textContent = '⚠️ License expired. Please login again.';
        loginButton.style.display = 'block';
        return;
    }

    try {
        if (barcodeScanner) {
            barcodeScanner.dispose();
        }
        barcodeScanner = new Dynamsoft.BarcodeScanner({
            license: effectiveLicense.key,
            scanMode: Dynamsoft.EnumScanMode.SM_MULTI_UNIQUE,
        });
    } catch (error) {
        console.error(error);
    }

    pdfPages = [];
    pageResults = [];
    currentPageIndex = 0;

    imageContainer.style.display = "none";
    if (barcodeScanner) {
        try {
            toggleLoading(true);
            let fileToProcess = files[0];

            // Process the file and get all pages
            let pages = await processFile(fileToProcess);
            pdfPages = pages;
            pageResults = new Array(pages.length);

            // Process each page for barcodes
            for (let i = 0; i < pages.length; i++) {
                try {
                    let result = await barcodeScanner.decode(pages[i].blob);
                    pageResults[i] = result;
                } catch (error) {
                    console.error(`Error processing page ${i + 1}:`, error);
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
            console.error("Error processing file:", error);
            resultArea.value = `Error: ${error.message}`;
            toggleLoading(false);
        }
    } else {
        resultArea.value = "Please activate the scanner first.\n";
    }
};

async function processFile(fileToProcess) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async function (e) {
            try {
                const blob = new Blob([e.target.result], { type: fileToProcess.type });

                if (fileToProcess.type !== "application/pdf") {
                    // Single image file
                    const url = URL.createObjectURL(blob);
                    resolve([{ blob, url }]);
                    return;
                }

                // PDF file - process all pages
                const source = {
                    fileData: blob,
                    renderOptions: {
                        renderAnnotations: "loadAnnotations"
                    }
                };

                currentDoc.deleteAllPages();
                await currentDoc.loadSource([source]);

                const settings = {
                    quality: 100,
                    saveAnnotation: false,
                };

                let pageCount = currentDoc.pages.length;
                let pages = [];

                for (let i = 0; i < pageCount; i++) {
                    const image = await currentDoc.saveToJpeg(i, settings);
                    const url = URL.createObjectURL(image);
                    pages.push({ blob: image, url });
                }

                resolve(pages);

            } catch (error) {
                reject(error);
            }
        };

        reader.onerror = () => {
            reject(new Error("FileReader failed to read the file."));
        };

        reader.readAsArrayBuffer(fileToProcess);
    });
}

// Screenshot button handler
screenshotBtn.addEventListener('click', async () => {
    if (engine === 'dynamsoft') {
        const storedExpiry = localStorage.getItem('dynamsoft_license_expiry');
        if (!licenseKey || !storedExpiry) {
            alert('⚠️ No valid license. Please login to get a trial license first.');
            return;
        }

        const expiryDate = new Date(storedExpiry);
        const now = new Date();
        if (expiryDate <= now) {
            alert('⚠️ Your license has expired. Please login again to renew your trial license.');
            loginStatus.textContent = '⚠️ License expired. Please login again.';
            loginButton.style.display = 'block';
            return;
        }
    }

    try {
        // Get the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        // Inject the screenshot selector script
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['screenshot-selector.js']
        });

    } catch (error) {
        console.error('Screenshot error:', error);
        alert(`Error: ${error.message}. Make sure you're on a regular web page, not chrome:// or extension pages.`);
    }
});

// Drag and drop support
const dropZone = document.body;
const dropZoneElement = document.getElementById('dropZone');

// Handle drag events on both body and drop zone element
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
        // Only remove highlight if we're leaving the body entirely
        if (e.target === dropZone || e.target === dropZoneElement) {
            dropZone.style.outline = '';
            dropZone.style.outlineOffset = '';
            dropZone.style.backgroundColor = '';
            if (dropZoneElement) {
                dropZoneElement.classList.remove('drag-over');
            }
        }
    });

    element.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Remove highlight
        dropZone.style.outline = '';
        dropZone.style.outlineOffset = '';
        dropZone.style.backgroundColor = '';
        if (dropZoneElement) {
            dropZoneElement.classList.remove('drag-over');
        }

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];

            // Check if it's an image or PDF
            const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/bmp', 'application/pdf'];
            if (!validTypes.includes(file.type)) {
                alert('Please drop an image or PDF file');
                return;
            }

            // Trigger the file input with the dropped file
            const fileInput = document.getElementById('file');
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            fileInput.files = dataTransfer.files;

            // Trigger the file change event
            const event = new Event('change', { bubbles: true });
            fileInput.dispatchEvent(event);
        }
    });
});

// Check for existing auth on page load
async function checkExistingAuth() {
    if (engine === 'zxing') {
        return;
    }
    try {
        // First check if there's a custom license key
        const effectiveLicense = await getEffectiveLicenseKey();

        if (effectiveLicense && effectiveLicense.isCustom) {
            // Custom license exists - hide login button and activate SDK
            loginButton.style.display = 'none';
            loginStatus.textContent = 'Using custom license...';
            licenseKey = effectiveLicense.key;

            try {
                await activateSDK(effectiveLicense.key);
                loginStatus.textContent = 'Licensed (Custom License Key)';
            } catch (error) {
                loginStatus.textContent = '❌ Invalid custom license';
                console.error('Error activating custom license:', error);
            }
            return;
        }

        // No custom license, check for Google auth
        const token = await getCookie('DynamsoftToken');
        const userId = await getCookie('DynamsoftUser');

        if (token && userId) {
            // User is already logged in - hide login button and request license
            loginButton.style.display = 'none';
            loginStatus.textContent = 'Restoring session...';

            // Request trial license directly
            await requestTrialLicense(decodeURIComponent(token), decodeURIComponent(userId));
        }
    } catch (error) {
        console.log('No existing auth found:', error);
        loginStatus.textContent = 'Please login to continue';
    }
}
