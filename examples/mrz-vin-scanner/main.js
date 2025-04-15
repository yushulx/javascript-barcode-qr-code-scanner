let dropdown = document.getElementById("dropdown");
let scanButton = document.getElementById('scan_button');
let cameraSource = document.getElementById('camera_source');
let imageFile = document.getElementById('image_file');
let overlayCanvas = document.getElementById('overlay_canvas');

let mrzRouter;
let vinRouter;
let parser;
let cameraEnhancer;
let isSDKReady = false;
let img = new Image();
let cameras;
let resolution;
let isDetecting = false;
let cameraView;

// Event listeners
overlayCanvas.addEventListener('dragover', function (event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
}, false);

overlayCanvas.addEventListener('drop', function (event) {
    event.preventDefault();
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

// Dropdown change event
function selectChanged() {
    if (dropdown.value === 'file') {
        if (cameraEnhancer != null) {
            closeCamera(cameraEnhancer);

            if (mrzRouter != null) {
                mrzRouter.stopCapturing();
            }

            if (vinRouter != null) {
                vinRouter.stopCapturing();
            }

            scanButton.innerHTML = "Scan";
            isDetecting = false;
        }
        let divElement = document.getElementById("file_container");
        divElement.style.display = "block";

        divElement = document.getElementById("camera_container");
        divElement.style.display = "none";
    }
    else {
        if (cameraEnhancer == null) {
            initCamera();
        }
        let divElement = document.getElementById("camera_container");
        divElement.style.display = "block";

        divElement = document.getElementById("file_container");
        divElement.style.display = "none";

        cameraChanged();
    }
}

// Load image to canvas for recognition
function loadImage2Canvas(base64Image) {
    imageFile.src = base64Image;
    img.src = base64Image;
    img.onload = function () {
        let width = img.width;
        let height = img.height;

        overlayCanvas.width = width;
        overlayCanvas.height = height;

        if (!isSDKReady) {
            alert("Please activate the SDK first.");
            return;
        }
        toggleLoading(true);

        let selectedMode = document.querySelector('input[name="scanMode"]:checked').value;

        let context = overlayCanvas.getContext('2d');
        context.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        try {
            if (selectedMode == "mrz") {
                mrzRouter.capture(img.src, "ReadMRZ").then((result) => {
                    showFileResult(selectedMode, context, result);
                });
            }
            else if (selectedMode == "vin") {

                vinRouter.capture(img.src, "ReadVINText").then((result) => {
                    showFileResult(selectedMode, context, result);
                });
            }
        }
        catch (ex) {
            console.error(ex);
        }

        toggleLoading(false);
    };

}

// Show camera result in the UI
async function showCameraResult(result) {
    let selectedMode = document.querySelector('input[name="scanMode"]:checked').value;
    let items = result.items;
    let scan_result = document.getElementById('scan_result');

    if (items != null && items.length > 0) {
        let item = items[0];
        let parseResults = await parser.parse(item.text);

        if (selectedMode == "mrz") {
            scan_result.innerHTML = JSON.stringify(extractMrzInfo(parseResults));
        }
        else if (selectedMode == "vin") {

            scan_result.innerHTML = JSON.stringify(extractVinInfo(parseResults));
        }
    }
}

// Init SDK
async function activate() {
    toggleLoading(true);
    let divElement = document.getElementById("license_key");
    let licenseKey = divElement.value == "" ? divElement.placeholder : divElement.value;

    try {
        await Dynamsoft.License.LicenseManager.initLicense(
            licenseKey,
            true
        );

        Dynamsoft.Core.CoreModule.loadWasm(["DLR"]);

        parser = await Dynamsoft.DCP.CodeParser.createInstance();

        // Load VIN and MRZ models
        await Dynamsoft.DCP.CodeParserModule.loadSpec("VIN");
        await Dynamsoft.DLR.LabelRecognizerModule.loadRecognitionData("VIN");

        await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD1_ID");
        await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD2_FRENCH_ID");
        await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD2_ID");
        await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD2_VISA");
        await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD3_PASSPORT");
        await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD3_VISA");
        await Dynamsoft.DLR.LabelRecognizerModule.loadRecognitionData("MRZ");

        mrzRouter = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();
        await mrzRouter.initSettings("./mrz.json");
        mrzRouter.addResultReceiver({
            onCapturedResultReceived: (result) => {
                showCameraResult(result);
            },
        });
        vinRouter = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();
        await vinRouter.initSettings("./vin.json");
        vinRouter.addResultReceiver({
            onCapturedResultReceived: (result) => {
                showCameraResult(result);
            },
        });

        isSDKReady = true;
    }
    catch (ex) {
        console.error(ex);
    }

    toggleLoading(false);
}

// Toggle loading indicator
function toggleLoading(isLoading) {
    if (isLoading) {
        document.getElementById("loading-indicator").style.display = "flex";
    }
    else {
        document.getElementById("loading-indicator").style.display = "none";
    }
}

// Show file result in the UI
async function showFileResult(selectedMode, context, result) {
    let parseResults = '';
    let detection_result = document.getElementById('detection_result');
    detection_result.innerHTML = "";
    let txts = [];
    let items = result.items;
    if (items.length > 0) {
        for (var i = 0; i < items.length; ++i) {

            if (items[i].type !== Dynamsoft.Core.EnumCapturedResultItemType.CRIT_TEXT_LINE) {
                continue;
            }

            let item = items[i];
            parseResults = await parser.parse(item.text);

            txts.push(item.text);
            localization = item.location;

            context.strokeStyle = '#ff0000';
            context.lineWidth = 2;

            let points = localization.points;

            context.beginPath();
            context.moveTo(points[0].x, points[0].y);
            context.lineTo(points[1].x, points[1].y);
            context.lineTo(points[2].x, points[2].y);
            context.lineTo(points[3].x, points[3].y);
            context.closePath();
            context.stroke();
        }
    }

    if (txts.length > 0) {
        detection_result.innerHTML += txts.join('\n') + '\n\n';
        if (selectedMode == "mrz") {
            detection_result.innerHTML += JSON.stringify(extractMrzInfo(parseResults));
        }
        else if (selectedMode == "vin") {

            detection_result.innerHTML += JSON.stringify(extractVinInfo(parseResults));
        }

    }
    else {
        detection_result.innerHTML += "Recognition Failed\n";
    }
}

// Trigger MRZ and VIN recognition
async function scan() {
    if (!isSDKReady) {
        alert("Please activate the SDK first.");
        return;
    }

    let selectedMode = document.querySelector('input[name="scanMode"]:checked').value;

    if (!isDetecting) {
        scanButton.innerHTML = "Stop";
        isDetecting = true;

        if (selectedMode == "mrz") {
            mrzRouter.setInput(cameraEnhancer);
            mrzRouter.startCapturing("ReadMRZ");
        }
        else if (selectedMode == "vin") {
            vinRouter.setInput(cameraEnhancer);
            vinRouter.startCapturing("ReadVINText");
        }
    }
    else {
        scanButton.innerHTML = "Scan";
        isDetecting = false;

        if (selectedMode == "mrz") {
            mrzRouter.stopCapturing();
        }
        else if (selectedMode == "vin") {
            vinRouter.stopCapturing();
        }

        cameraView.clearAllInnerDrawingItems();
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
        let scanRegion = {
            x: 10,
            y: 30,
            width: 80,
            height: 40,
            isMeasuredInPercentage: true
        };
        cameraEnhancer.setScanRegion(scanRegion);

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
    }
    catch (ex) {
        console.error(ex);
    }
}

async function cameraChanged() {
    if (cameras != null && cameras.length > 0) {
        let index = cameraSource.selectedIndex;
        await openCamera(cameraEnhancer, cameras[index]);
    }
}

// Extract MRZ and VIN information from the result
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

function extractVinInfo(result) {
    const parseResultInfo = {};

    let wmi = result.getFieldValue("wmi");
    parseResultInfo['WMI'] = wmi;

    let region = result.getFieldValue("region");
    parseResultInfo['Region'] = region;

    let vds = result.getFieldValue("vds");
    parseResultInfo['VDS'] = vds;

    let checkDigit = result.getFieldValue("checkDigit");
    parseResultInfo['Check Digit'] = checkDigit;

    let modelYear = result.getFieldValue("modelYear");
    parseResultInfo['Model Year'] = modelYear;

    let plantCode = result.getFieldValue("plantCode");
    parseResultInfo['Manufacturer plant'] = plantCode;

    let serialNumber = result.getFieldValue("serialNumber");
    parseResultInfo['Serial Number'] = serialNumber;

    return parseResultInfo;
}