let barcodeScanner;
let currentDoc;
let licenseKey;
let pdfPages = []; // Store all PDF pages
let currentPageIndex = 0;
let pageResults = []; // Store barcode results for each page
let authWindowId = null; // Track Chrome extension window ID
let pollTimer = null;

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
    // Check if license exists and is valid
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
                console.log('User email:', email);

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

                            console.log('License key obtained:', licenseKey);
                            console.log('Expiration date:', expirationDate);

                            // Check if license is already expired
                            if (expirationDate <= now) {
                                loginStatus.textContent = '⚠️ License expired';
                                alert('Warning: The license has already expired. Please contact support for a new license.');
                                toggleLoading(false);
                                return;
                            }

                            // Store license key in localStorage
                            localStorage.setItem('dynamsoft_license_key', licenseKey);
                            localStorage.setItem('dynamsoft_license_expiry', response.data.data.expirationDate);

                            // Activate SDK automatically
                            await activateSDK(licenseKey);

                            // Calculate days until expiration
                            const daysUntilExpiry = Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24));
                            loginStatus.textContent = `✓ Licensed (Trial - ${daysUntilExpiry} days left)`;
                            loginButton.style.display = 'none';
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
    const storedLicense = localStorage.getItem('dynamsoft_license_key');
    const storedExpiry = localStorage.getItem('dynamsoft_license_expiry');

    if (storedLicense) {
        licenseKey = storedLicense;
        const expiryDate = new Date(storedExpiry);
        const now = new Date();

        if (expiryDate > now) {
            // License is still valid
            try {
                await activateSDK(licenseKey);
                loginButton.style.display = 'none';

                // Show days remaining
                const daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
                loginStatus.textContent = `✓ Licensed (${daysRemaining} days left)`;

                // Warn if less than 3 days remaining
                if (daysRemaining <= 3) {
                    loginStatus.textContent = `⚠️ License expires in ${daysRemaining} days`;
                }
            } catch (error) {
                console.error('Failed to activate with stored license:', error);
                localStorage.removeItem('dynamsoft_license_key');
                localStorage.removeItem('dynamsoft_license_expiry');
                loginStatus.textContent = 'License activation failed. Please login again.';
            }
        } else {
            // License expired
            localStorage.removeItem('dynamsoft_license_key');
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
                let localization = item.location;
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 2;
                let points = localization.points;
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
    // Always show page-specific results with unified format
    resultArea.value = `=== Page ${currentPageIndex + 1} of ${pdfPages.length} ===\n`;
    if (pageResults[currentPageIndex] && pageResults[currentPageIndex].items && pageResults[currentPageIndex].items.length > 0) {
        pageResults[currentPageIndex].items.forEach(item => {
            resultArea.value += "Text: " + item.text + "\n";
            resultArea.value += "Format: " + item.formatString + "\n\n";
        });
    } else {
        resultArea.value += "No barcodes found on this page.\n";
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
    // Check if license exists and is valid
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

    // Camera access doesn't work in extension popups
    // Open scanner in a new tab instead
    chrome.tabs.create({
        url: chrome.runtime.getURL('scanner.html')
    });
});

document.getElementById("file").onchange = async function () {
    // Check if license exists and is valid
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

    try {
        if (barcodeScanner) {
            barcodeScanner.dispose();
        }
        barcodeScanner = new Dynamsoft.BarcodeScanner({
            license: licenseKey,
            scanMode: Dynamsoft.EnumScanMode.ReadBarcodes_ReadRateFirst,
        });
    } catch (error) {
        console.error(error);
    }

    // Reset variables
    pdfPages = [];
    pageResults = [];
    currentPageIndex = 0;

    imageContainer.style.display = "none";
    if (barcodeScanner) {
        const files = Array.from(this.files || []);
        if (files.length) {
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

                // Display the first page
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
        }
    }
    else {
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
    // Check if license exists and is valid
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

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.style.outline = '3px dashed #667eea';
    dropZone.style.outlineOffset = '-10px';
    dropZone.style.backgroundColor = 'rgba(102, 126, 234, 0.05)';
});

dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only remove highlight if we're leaving the body entirely
    if (e.target === dropZone) {
        dropZone.style.outline = '';
        dropZone.style.outlineOffset = '';
        dropZone.style.backgroundColor = '';
    }
});

dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Remove highlight
    dropZone.style.outline = '';
    dropZone.style.outlineOffset = '';
    dropZone.style.backgroundColor = '';

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
