let dropdown = document.getElementById("dropdown");
let barcodeCheckbox = document.getElementById("barcode_checkbox");
let mrzCheckbox = document.getElementById("mrz_checkbox");
let documentCheckbox = document.getElementById("document_checkbox");
let captureButton = document.getElementById('capture_button');
let saveButton = document.getElementById('save_button');
let targetFile = document.getElementById('target_file');
let targetCanvas = document.getElementById('target_canvas');
let rectifiedImage = document.getElementById('rectified_image');
let documentEditor = document.getElementById('document_editor');
let editView = document.getElementById('edit_view');
let rectifyView = document.getElementById('rectify_view');
let cameraSource = document.getElementById('camera_source');
let imageFile = document.getElementById('image_file');
let overlayCanvas = document.getElementById('overlay_canvas');
let uploadArea = document.getElementById('upload_area');
let viewContainer = document.getElementById('view_container');
let imageContainer = document.getElementById('image_container');

let cvr;
let reader;
let cameraEnhancer;
let isSDKReady = false;
let img = new Image();
let globalPoints;
let cameras;
let resolution;
let isDetecting = false;
let isCaptured = false;
let parser;

uploadArea.addEventListener('dragover', function (event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
}, false);

uploadArea.addEventListener('dragenter', function (event) {
    event.preventDefault();
    uploadArea.classList.add('drag-over');
}, false);

uploadArea.addEventListener('dragleave', function (event) {
    event.preventDefault();
    // Only remove if leaving the upload area itself, not child elements
    if (event.target === uploadArea) {
        uploadArea.classList.remove('drag-over');
    }
}, false);

uploadArea.addEventListener('drop', function (event) {
    event.preventDefault();
    uploadArea.classList.remove('drag-over');
    if (event.dataTransfer.files.length > 0) {
        let file = event.dataTransfer.files[0];
        if (file.type.match('image.*')) {
            let reader = new FileReader();
            reader.onload = function (e) {
                loadImage2Canvas(e.target.result);
            };
            reader.readAsDataURL(file);
        } else {
            alert("Please drop an image file.");
        }
    }
}, false);

// Add drag-drop and click functionality to image-container
imageContainer.addEventListener('dragover', function (event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
}, false);

imageContainer.addEventListener('dragenter', function (event) {
    event.preventDefault();
    imageContainer.classList.add('drag-over');
}, false);

imageContainer.addEventListener('dragleave', function (event) {
    event.preventDefault();
    if (event.target === imageContainer || event.target.closest('.image-container') === null) {
        imageContainer.classList.remove('drag-over');
    }
}, false);

imageContainer.addEventListener('drop', function (event) {
    event.preventDefault();
    imageContainer.classList.remove('drag-over');
    if (event.dataTransfer.files.length > 0) {
        let file = event.dataTransfer.files[0];
        if (file.type.match('image.*')) {
            let reader = new FileReader();
            reader.onload = function (e) {
                loadImage2Canvas(e.target.result);
            };
            reader.readAsDataURL(file);
        } else {
            alert("Please drop an image file.");
        }
    }
}, false);

imageContainer.addEventListener('click', function (event) {
    // Trigger file input when clicking on image container
    document.getElementById('pick_file').click();
});

function showUploadArea() {
    viewContainer.classList.remove('show-image');
    // Clear the image
    imageFile.src = 'default.png';
    let context = overlayCanvas.getContext('2d');
    context.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    document.getElementById('detection_result').innerHTML = '';
}

async function selectChanged() {
    if (dropdown.value === 'file') {
        if (cameraEnhancer != null) {
            await stopScanning();
            await closeCamera(cameraEnhancer);
        }
        let divElement = document.getElementById("file_container");
        divElement.style.display = "block";

        divElement = document.getElementById("camera_container");
        divElement.style.display = "none";
    }
    else {
        if (cameraEnhancer == null) {
            await initCamera();
        }
        let divElement = document.getElementById("camera_container");
        divElement.style.display = "block";

        divElement = document.getElementById("file_container");
        divElement.style.display = "none";

        await cameraChanged();
        // Auto-start scanning in camera mode
        await startScanning();
    }
}

function capture() {
    isCaptured = true;
}

const form = document.getElementById('modeSelector');

form.addEventListener('change', async (e) => {
    if (e.target.name === 'scanMode') {
        // Show/hide capture button based on mode
        if (e.target.value === "document") {
            captureButton.style.display = "block";
        }
        else {
            captureButton.style.display = "none";
        }

        // Restart scanning if in camera mode
        if (dropdown.value === 'camera' && isDetecting) {
            await stopScanning();
            await startScanning();
        }
    }
});

function loadImage2Canvas(base64Image) {
    imageFile.src = base64Image;
    img.src = base64Image;
    img.onload = async function () {
        let width = img.width;
        let height = img.height;

        overlayCanvas.width = width;
        overlayCanvas.height = height;

        targetCanvas.width = width;
        targetCanvas.height = height;

        // Switch to image view
        viewContainer.classList.add('show-image');

        if (!isSDKReady) {
            alert("Please activate the SDK first.");
            return;
        }
        toggleLoading(true);

        let selectedMode = document.querySelector('input[name="scanMode"]:checked').value;

        let context = overlayCanvas.getContext('2d');
        context.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        try {
            if (selectedMode == "barcode") {
                await cvr.resetSettings();
                cvr.capture(img.src, "ReadBarcodes_Default").then((result) => {
                    showFileResult(selectedMode, context, result, img, Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE);
                });
            }
            else if (selectedMode == "mrz") {
                await cvr.initSettings("./full.json");
                cvr.capture(img.src, "ReadMRZ").then((result) => {
                    showFileResult(selectedMode, context, result, img, Dynamsoft.Core.EnumCapturedResultItemType.CRIT_TEXT_LINE);
                });
            }
            else if (selectedMode == "document") {
                await cvr.resetSettings();
                cvr.capture(img.src, "DetectDocumentBoundaries_Default").then((result) => {
                    showFileResult(selectedMode, context, result, img, Dynamsoft.Core.EnumCapturedResultItemType.CRIT_DETECTED_QUAD);
                });
            }
        }
        catch (ex) {
            console.error(ex);
        }

        toggleLoading(false);
    };
}

async function showFileResult(selectedMode, context, result, img, type) {
    let parseResults = '';
    let detection_result = document.getElementById('detection_result');
    detection_result.innerHTML = "";
    let txts = [];
    let items = result.items;
    if (items.length > 0) {
        for (var i = 0; i < items.length; ++i) {

            if (items[i].type !== type) {
                continue;
            }

            let item = items[i];
            txts.push(item.text);
            localization = item.location;

            context.strokeStyle = '#ff0000';
            context.lineWidth = 2;

            let points = localization.points;
            globalPoints = points;
            context.beginPath();
            context.moveTo(points[0].x, points[0].y);
            context.lineTo(points[1].x, points[1].y);
            context.lineTo(points[2].x, points[2].y);
            context.lineTo(points[3].x, points[3].y);
            context.closePath();
            context.stroke();

            if (selectedMode == "barcode") {
                if (txts.length > 0) {
                    detection_result.innerHTML += txts.join('\n') + '\n\n';
                }
                else {
                    detection_result.innerHTML += "Recognition Failed\n";
                }
            }
            else if (selectedMode == "mrz") {
                if (txts.length > 0) {
                    detection_result.innerHTML += txts.join('') + '\n\n';
                    let newText = item.text.replace(/\\n/g, '');
                    parseResults = await parser.parse(newText);
                    detection_result.innerHTML += JSON.stringify(extractMrzInfo(parseResults));
                }
                else {
                    detection_result.innerHTML += "Recognition Failed\n";
                }

            }
            else if (selectedMode == "document") {
                openEditor(img.src);
            }


        }
    }
    else {
        detection_result.innerHTML += "Nothing found\n";
    }
}

document.addEventListener('paste', (event) => {
    const items = (event.clipboardData || event.originalEvent.clipboardData).items;

    for (index in items) {
        const item = items[index];
        if (item.kind === 'file') {
            const blob = item.getAsFile();
            const reader = new FileReader();
            reader.onload = (event) => {
                loadImage2Canvas(event.target.result);
            };
            reader.readAsDataURL(blob);
        }
    }
});

async function activate() {
    toggleLoading(true);
    let divElement = document.getElementById("license_key");
    let licenseKey = divElement.value == "" ? divElement.placeholder : divElement.value;

    try {
        await Dynamsoft.License.LicenseManager.initLicense(
            licenseKey,
            true
        );

        Dynamsoft.Core.CoreModule.loadWasm(["DBR", "DLR", "DDN"]);

        parser = await Dynamsoft.DCP.CodeParser.createInstance();

        await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD1_ID");
        await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD2_FRENCH_ID");
        await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD2_ID");
        await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD2_VISA");
        await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD3_PASSPORT");
        await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD3_VISA");
        // await Dynamsoft.CVR.CaptureVisionRouter.appendModelBuffer("MRZCharRecognition");
        // await Dynamsoft.CVR.CaptureVisionRouter.appendModelBuffer("MRZTextLineRecognition");

        cvr = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();

        cvr.addResultReceiver({
            onCapturedResultReceived: (result) => {

                showCameraResult(result);
            },

            onOriginalImageResultReceived: (imageData) => {
                // Handle original image if needed
                // console.log(imageData);
            }
        });

        isSDKReady = true;
    }
    catch (ex) {
        console.error(ex);
    }

    toggleLoading(false);
}

function toggleLoading(isLoading) {
    if (isLoading) {
        document.getElementById("loading-indicator").style.display = "flex";
    }
    else {
        document.getElementById("loading-indicator").style.display = "none";
    }
}

document.getElementById("pick_file").addEventListener("change", function () {
    let currentFile = this.files[0];
    if (currentFile == null) {
        return;
    }
    var fr = new FileReader();
    fr.onload = function () {
        loadImage2Canvas(fr.result);
    }
    fr.readAsDataURL(currentFile);
});

function openEditor(image) {
    let target_context = targetCanvas.getContext('2d');
    targetCanvas.addEventListener("mousedown", (event) => updatePoint(event, target_context, targetCanvas));
    targetCanvas.addEventListener("touchstart", (event) => updatePoint(event, target_context, targetCanvas));
    drawQuad(target_context, targetCanvas);
    targetFile.src = image;

    // Show modal and hide save button initially
    documentEditor.style.display = "block";
    saveButton.style.display = "none";
    edit();
}

async function closeEditor() {
    documentEditor.style.display = "none";
    if (dropdown.value === 'camera') {
        await startScanning();
    }
}

async function edit() {
    editView.style.display = "block";
    rectifyView.style.display = "none";
    saveButton.style.display = "none";
}

async function rectify() {
    if (!globalPoints) {
        return;
    }
    let final_canvas = await rectifyCanvas(targetFile, globalPoints);
    if (final_canvas == null) { return }
    rectifiedImage.src = final_canvas.toDataURL();
    rectifyView.style.display = "block";
    editView.style.display = "none";
    saveButton.style.display = "block";
}

async function save() {
    let imageUrl = rectifiedImage.src;

    // Generate filename based on timestamp
    const timestamp = new Date().getTime();
    const filename = `document_${timestamp}.png`;

    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function checkChanged() {
    if (documentCheckbox.checked) {
        documentEditor.style.display = "block";
    }
    else {
        documentEditor.style.display = "none";
    }
}
async function rectifyCanvas(source, points) {
    if (!Dynamsoft) return;

    try {
        let params = await cvr.getSimplifiedSettings("NormalizeDocument_Default");
        params.roi.points = points;
        params.roiMeasuredInPercentage = 0;
        await cvr.updateSettings("NormalizeDocument_Default", params);

        const result = await cvr.capture(source, "NormalizeDocument_Default");

        for (let item of result.items) {
            if (item.type !== Dynamsoft.Core.EnumCapturedResultItemType.CRIT_ENHANCED_IMAGE) {
                continue;
            }

            let image = await item.toCanvas();
            return image;
        }

        return null;
    }
    catch (ex) {
        console.error(ex);
    }
    return null;
}

function updatePoint(e, context, canvas) {
    if (!globalPoints) {
        return;
    }

    function getCoordinates(e) {
        let rect = canvas.getBoundingClientRect();

        let scaleX = canvas.clientWidth / canvas.width;
        let scaleY = canvas.clientHeight / canvas.height;

        let clientX = e.clientX;
        let clientY = e.clientY;

        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        }

        let mouseX = clientX;
        let mouseY = clientY;

        if (scaleX < scaleY) {
            mouseX = clientX - rect.left;
            mouseY = clientY - rect.top - (canvas.clientHeight - canvas.height * scaleX) / 2;

            mouseX = mouseX / scaleX;
            mouseY = mouseY / scaleX;
        }
        else {
            mouseX = clientX - rect.left - (canvas.clientWidth - canvas.width * scaleY) / 2;
            mouseY = clientY - rect.top;

            mouseX = mouseX / scaleY;
            mouseY = mouseY / scaleY;
        }

        return { x: Math.round(mouseX), y: Math.round(mouseY) };
    }

    let delta = 20;
    let coordinates = getCoordinates(e);

    for (let i = 0; i < globalPoints.length; i++) {
        if (Math.abs(globalPoints[i].x - coordinates.x) < delta && Math.abs(globalPoints[i].y - coordinates.y) < delta) {
            e.preventDefault();
            canvas.addEventListener("mousemove", dragPoint);
            canvas.addEventListener("mouseup", releasePoint);
            canvas.addEventListener("touchmove", dragPoint);
            canvas.addEventListener("touchend", releasePoint);
            function dragPoint(e) {
                e.preventDefault();
                coordinates = getCoordinates(e);
                globalPoints[i].x = coordinates.x;
                globalPoints[i].y = coordinates.y;
                drawQuad(context, canvas);
            }
            function releasePoint() {
                canvas.removeEventListener("mousemove", dragPoint);
                canvas.removeEventListener("mouseup", releasePoint);
                canvas.removeEventListener("touchmove", dragPoint);
                canvas.removeEventListener("touchend", releasePoint);
            }
            break;
        }
    }
}

function drawQuad(context, canvas) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#00ff00";
    context.lineWidth = 2;
    for (let i = 0; i < globalPoints.length; i++) {
        context.beginPath();
        context.arc(globalPoints[i].x, globalPoints[i].y, 10, 0, 2 * Math.PI);
        context.stroke();
    }
    context.beginPath();
    context.moveTo(globalPoints[0].x, globalPoints[0].y);
    context.lineTo(globalPoints[1].x, globalPoints[1].y);
    context.lineTo(globalPoints[2].x, globalPoints[2].y);
    context.lineTo(globalPoints[3].x, globalPoints[3].y);
    context.lineTo(globalPoints[0].x, globalPoints[0].y);
    context.stroke();
}

async function startScanning() {
    if (!isSDKReady) {
        alert("Please activate the SDK first.");
        return;
    }

    if (isDetecting) {
        return; // Already scanning
    }

    let selectedMode = document.querySelector('input[name="scanMode"]:checked').value;

    if (selectedMode == "mrz") {
        let scanRegion = {
            x: 10,
            y: 30,
            width: 80,
            height: 40,
            isMeasuredInPercentage: true
        };
        cameraEnhancer.setScanRegion(scanRegion);
    }
    else {
        cameraEnhancer.setScanRegion(null);
    }

    isDetecting = true;
    cvr.setInput(cameraEnhancer);

    if (selectedMode == "mrz") {
        await cvr.initSettings("./full.json");
        cvr.startCapturing("ReadMRZ");
    }
    else if (selectedMode == "barcode") {
        await cvr.resetSettings();
        cvr.startCapturing("ReadBarcodes_Default");
    }
    else if (selectedMode == "document") {
        await cvr.resetSettings();
        let params = await cvr.getSimplifiedSettings("DetectDocumentBoundaries_Default");
        params.outputOriginalImage = true;
        // params.documentSettings.colourMode = 1; // Color
        await cvr.updateSettings("DetectDocumentBoundaries_Default", params);
        cvr.startCapturing("DetectDocumentBoundaries_Default");
    }
}

async function stopScanning() {
    if (!isDetecting) {
        return; // Not scanning
    }

    isDetecting = false;

    if (cvr != null) {
        await cvr.stopCapturing();
    }

    if (cameraView) {
        cameraView.clearAllInnerDrawingItems();
    }
}

function clearOverlay(cameraEnhancer) {
    if (!Dynamsoft) return;

    try {
        let drawingLayers = cameraEnhancer.cameraView.getAllDrawingLayers();
        if (drawingLayers.length > 0) {
            drawingLayers[0].clearDrawingItems();
        }
        else {
            cameraEnhancer.cameraView.createDrawingLayer();
        }
    }
    catch (ex) {
        console.error(ex);
    }
}

////////////////////////////////////////////////////////////////
// Camera management functions
////////////////////////////////////////////////////////////////
async function openCamera(cameraEnhancer, cameraInfo) {
    if (!Dynamsoft) return;

    try {
        await cameraEnhancer.selectCamera(cameraInfo);
        cameraEnhancer.on("played", function () {
            resolution = cameraEnhancer.getResolution();
        });
        cameraEnhancer.setPixelFormat(10);
        await cameraEnhancer.open();
    }
    catch (ex) {
        console.error(ex);
    }
}

async function closeCamera(cameraEnhancer) {
    if (!Dynamsoft) return;

    try {
        await cameraEnhancer.close();
    }
    catch (ex) {
        console.error(ex);
    }
}

async function setResolution(cameraEnhancer, width, height) {
    if (!Dynamsoft) return;

    try {
        await cameraEnhancer.setResolution(width, height);
    }
    catch (ex) {
        console.error(ex);
    }
}

async function initCamera() {
    if (!Dynamsoft) return;

    try {
        cameraView = await Dynamsoft.DCE.CameraView.createInstance();
        cameraEnhancer = await Dynamsoft.DCE.CameraEnhancer.createInstance(cameraView);
        cameras = await cameraEnhancer.getAllCameras();
        if (cameras != null && cameras.length > 0) {
            for (let i = 0; i < cameras.length; i++) {
                let option = document.createElement("option");
                option.text = cameras[i].label;
                cameraSource.add(option);
            }

            try {
                let uiElement = document.getElementById("camera_view");
                uiElement.append(cameraView.getUIElement());

                cameraView.getUIElement().shadowRoot?.querySelector('.dce-sel-camera')?.setAttribute('style', 'display: none');
                cameraView.getUIElement().shadowRoot?.querySelector('.dce-sel-resolution')?.setAttribute('style', 'display: none');
            }
            catch (ex) {
                console.error(ex);
            }

        }

        else {
            alert("No camera found.");
        }

        cameraChanged();
    }
    catch (ex) {
        console.error(ex);
    }
}

async function cameraChanged() {
    if (cameras != null && cameras.length > 0) {
        let wasDetecting = isDetecting;

        // Stop scanning if active
        if (wasDetecting) {
            await stopScanning();
        }

        let index = cameraSource.selectedIndex;
        await openCamera(cameraEnhancer, cameras[index]);

        // Restart scanning if it was active
        if (wasDetecting) {
            await startScanning();
        }
    }
}

// Show camera result in the UI
async function showCameraResult(result) {
    let selectedMode = document.querySelector('input[name="scanMode"]:checked').value;
    let items = result.items;
    let scan_result = document.getElementById('scan_result');
    scan_result.innerHTML = "";
    let txts = [];

    // clearOverlay(cameraEnhancer);

    let type;
    if (selectedMode == "barcode") {
        type = Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE;
    }
    else if (selectedMode == "mrz") {
        type = Dynamsoft.Core.EnumCapturedResultItemType.CRIT_TEXT_LINE;
    }
    else if (selectedMode == "document") {
        type = Dynamsoft.Core.EnumCapturedResultItemType.CRIT_DETECTED_QUAD
    }

    if (items != null && items.length > 0) {
        for (var i = 0; i < items.length; ++i) {
            let item = items[i];
            if (items[i].type === type) {
                txts.push(item.text);
                globalPoints = item.location.points;

                if (selectedMode == "barcode") {
                    if (txts.length > 0) {
                        scan_result.innerHTML += txts.join('\n') + '\n\n';
                    }
                    else {
                        scan_result.innerHTML += "Recognition Failed\n";
                    }
                }
                else if (selectedMode == "mrz") {
                    if (txts.length > 0) {
                        scan_result.innerHTML += txts.join('\n') + '\n\n';
                        parseResults = await parser.parse(item.text);
                        scan_result.innerHTML += JSON.stringify(extractMrzInfo(parseResults));
                    }
                    else {
                        scan_result.innerHTML += "Recognition Failed\n";
                    }

                }
                else if (selectedMode == "document") {
                    // console.log(item);
                }
            }
            else if (items[i].type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_ORIGINAL_IMAGE) {
                if (selectedMode == "document") {
                    if (isCaptured) {
                        isCaptured = false;
                        await stopScanning();
                        targetCanvas.width = resolution.width;
                        targetCanvas.height = resolution.height;
                        openEditor(item.imageData.toCanvas().toDataURL());
                    }
                }
            }
        }

    }
    else {
        scan_result.innerHTML += "Nothing found\n";
    }
}

// Extract MRZ information from the result
function extractMrzInfo(result) {
    const parseResultInfo = {};
    let type = result.getFieldValue("documentCode");
    parseResultInfo['Document Type'] = JSON.parse(result.jsonString).CodeType;
    let nation = result.getFieldValue("issuingState");
    parseResultInfo['Issuing State'] = nation;
    let surName = result.getFieldValue("primaryIdentifier");
    parseResultInfo['Surname'] = surName;
    let givenName = result.getFieldValue("secondaryIdentifier");
    parseResultInfo['Given Name'] = givenName;
    let passportNumber = type === "P" ? result.getFieldValue("passportNumber") : result.getFieldValue("documentNumber");
    parseResultInfo['Passport Number'] = passportNumber;
    let nationality = result.getFieldValue("nationality");
    parseResultInfo['Nationality'] = nationality;
    let gender = result.getFieldValue("sex");
    parseResultInfo["Gender"] = gender;
    let birthYear = result.getFieldValue("birthYear");
    let birthMonth = result.getFieldValue("birthMonth");
    let birthDay = result.getFieldValue("birthDay");
    if (parseInt(birthYear) > (new Date().getFullYear() % 100)) {
        birthYear = "19" + birthYear;
    } else {
        birthYear = "20" + birthYear;
    }
    parseResultInfo['Date of Birth (YYYY-MM-DD)'] = birthYear + "-" + birthMonth + "-" + birthDay;
    let expiryYear = result.getFieldValue("expiryYear");
    let expiryMonth = result.getFieldValue("expiryMonth");
    let expiryDay = result.getFieldValue("expiryDay");
    if (parseInt(expiryYear) >= 60) {
        expiryYear = "19" + expiryYear;
    } else {
        expiryYear = "20" + expiryYear;
    }
    parseResultInfo["Date of Expiry (YYYY-MM-DD)"] = expiryYear + "-" + expiryMonth + "-" + expiryDay;
    return parseResultInfo;
}