let dropdown = document.getElementById("dropdown");
let barcodeCheckbox = document.getElementById("barcode_checkbox");
let mrzCheckbox = document.getElementById("mrz_checkbox");
let documentCheckbox = document.getElementById("document_checkbox");
let scanButton = document.getElementById('scan_button');
let targetFile = document.getElementById('target_file');
let targetCanvas = document.getElementById('target_canvas');
let rectifiedImage = document.getElementById('rectified_image');
let documentEditor = document.getElementById('document_editor');
let editView = document.getElementById('edit_view');
let rectifyView = document.getElementById('rectify_view');
let cameraSource = document.getElementById('camera_source');
let imageFile = document.getElementById('image_file');
let overlayCanvas = document.getElementById('overlay_canvas');

let normalizer;
let reader;
let recognizer;
let cameraEnhancer;
let isSDKReady = false;
let img = new Image();
let globalPoints;
let cameras;
let resolution;
let isDetecting = false;
let isLooping = false;
let isCaptured = false;

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

function selectChanged() {
    switchProduct(dropdown.value)
}

function capture() {
    isCaptured = true;
}

function loadImage2Canvas(base64Image) {
    imageFile.src = base64Image;
    img.src = base64Image;
    img.onload = function () {
        let width = img.width;
        let height = img.height;

        overlayCanvas.width = width;
        overlayCanvas.height = height;

        targetCanvas.width = width;
        targetCanvas.height = height;

        detect();
    };

}

async function cameraChanged() {
    isDetecting = false;
    while (isLooping) {
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (cameras != null && cameras.length > 0) {
        let index = cameraSource.selectedIndex;
        await openCamera(cameraEnhancer, cameras[index]);
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

function switchProduct(name) {
    if (name === 'file') {
        let divElement = document.getElementById("file_container");
        divElement.style.display = "block";

        divElement = document.getElementById("camera_container");
        divElement.style.display = "none";
    }
    else {
        let divElement = document.getElementById("camera_container");
        divElement.style.display = "block";

        divElement = document.getElementById("file_container");
        divElement.style.display = "none";
    }
}

async function activate() {
    toggleLoading(true);
    let divElement = document.getElementById("license_key");
    let licenseKey = divElement.value == "" ? divElement.placeholder : divElement.value;

    try {
        Dynamsoft.DBR.BarcodeScanner.license = licenseKey;
        Dynamsoft.DDN.DocumentNormalizer.license = licenseKey;
        Dynamsoft.DLR.LabelRecognizer.license = licenseKey;

        await Dynamsoft.DBR.BarcodeReader.loadWasm();
        await Dynamsoft.DLR.LabelRecognizer.loadWasm();
        await Dynamsoft.DDN.DocumentNormalizer.loadWasm();

        reader = await Dynamsoft.DBR.BarcodeReader.createInstance();

        normalizer = await Dynamsoft.DDN.DocumentNormalizer.createInstance();

        recognizer = await Dynamsoft.DLR.LabelRecognizer.createInstance();
        await recognizer.updateRuntimeSettingsFromString("MRZ");

        cameraEnhancer = await Dynamsoft.DCE.CameraEnhancer.createInstance();

        initCamera();

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

async function detect() {
    if (!isSDKReady) {
        alert("Please activate the SDK first.");
        return;
    }
    toggleLoading(true);

    let detection_result = document.getElementById('detection_result');
    detection_result.innerHTML = "";
    let context = overlayCanvas.getContext('2d');
    context.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    try {
        if (barcodeCheckbox.checked) {
            let barcodeResults = await reader.decode(img);
            if (barcodeResults.length > 0) {
                let txts = [];
                for (var i = 0; i < barcodeResults.length; ++i) {
                    txts.push(barcodeResults[i].barcodeText);
                    localization = barcodeResults[i].localizationResult;
                    text = barcodeResults[i].barcodeText;

                    // Draw overlay
                    context.beginPath();
                    context.strokeStyle = '#ff0000';
                    context.lineWidth = 2;
                    context.moveTo(localization.x1, localization.y1);
                    context.lineTo(localization.x2, localization.y2);
                    context.lineTo(localization.x3, localization.y3);
                    context.lineTo(localization.x4, localization.y4);
                    context.lineTo(localization.x1, localization.y1);
                    context.stroke();

                    context.font = '18px Verdana';
                    context.fillStyle = '#ff0000';
                    let x = [localization.x1, localization.x2, localization.x3, localization.x4];
                    let y = [localization.y1, localization.y2, localization.y3, localization.y4];
                    x.sort(function (a, b) {
                        return a - b;
                    });
                    y.sort(function (a, b) {
                        return b - a;
                    });
                    let left = x[0];
                    let top = y[0];

                    context.fillText(text, left, top + 50);
                }
                detection_result.innerHTML += txts.join(', ') + '\n';
            }
        }

        if (mrzCheckbox.checked) {
            let mrzResults = await recognizer.recognize(img);
            let txts = [];
            for (let result of mrzResults) {
                for (let line of result.lineResults) {
                    let text = line.text;
                    let points = line.location.points;
                    // Draw overlay
                    context.beginPath();
                    context.strokeStyle = '#0000ff';
                    context.lineWidth = 2;
                    context.moveTo(points[0].x, points[0].y);
                    context.lineTo(points[1].x, points[1].y);
                    context.lineTo(points[2].x, points[2].y);
                    context.lineTo(points[3].x, points[3].y);
                    context.lineTo(points[0].x, points[0].y);
                    context.stroke();

                    context.font = '18px Verdana';
                    context.fillStyle = '#ff0000';
                    let x = [points[0].x, points[1].x, points[0].x, points[0].x];
                    let y = [points[0].y, points[1].y, points[0].y, points[0].y];
                    x.sort(function (a, b) {
                        return a - b;
                    });
                    y.sort(function (a, b) {
                        return b - a;
                    });
                    let left = x[0];
                    let top = y[0];

                    context.fillText(text, left, top);
                    txts.push(text);
                }
            }

            if (txts.length == 2) {
                detection_result.innerHTML += JSON.stringify(mrzParseTwoLine(txts[0], txts[1])) + '\n';
            }
            else if (txts.length == 3) {
                detection_result.innerHTML += JSON.stringify(mrzParseThreeLine(txts[0], txts[1], txts[2])) + '\n';
            }
        }

        if (documentCheckbox.checked) {
            let documentResults = await normalizer.detectQuad(img);

            if (documentResults.length > 0) {
                let quad = documentResults[0];
                globalPoints = quad.location.points;

                // Start document editor
                openEditor(img.src)

                // Draw overlay
                context.strokeStyle = "#00ff00";
                context.lineWidth = 2;
                for (let i = 0; i < globalPoints.length; i++) {
                    context.beginPath();
                    context.arc(globalPoints[i].x, globalPoints[i].y, 5, 0, 2 * Math.PI);
                    context.stroke();
                }
                context.beginPath();
                context.moveTo(globalPoints[0].x, globalPoints[0].y);
                context.lineTo(globalPoints[1].x, globalPoints[1].y);
                context.lineTo(globalPoints[2].x, globalPoints[2].y);
                context.lineTo(globalPoints[3].x, globalPoints[3].y);
                context.lineTo(globalPoints[0].x, globalPoints[0].y);
                context.stroke();

                let x = [globalPoints[0].x, globalPoints[1].x, globalPoints[0].x, globalPoints[0].x];
                let y = [globalPoints[0].y, globalPoints[1].y, globalPoints[0].y, globalPoints[0].y];
                x.sort(function (a, b) {
                    return a - b;
                });
                y.sort(function (a, b) {
                    return b - a;
                });
                let left = x[0];
                let top = y[0];
                context.font = '18px Verdana';
                context.fillStyle = '#00ff00';
                context.fillText('Detected document', left, top);
            }
        }
        else {
            points = null;
        }
    }
    catch (ex) {
        console.error(ex);
    }

    toggleLoading(false);
}

function openEditor(image) {
    let target_context = targetCanvas.getContext('2d');
    targetCanvas.addEventListener("mousedown", (event) => updatePoint(event, target_context, targetCanvas));
    targetCanvas.addEventListener("touchstart", (event) => updatePoint(event, target_context, targetCanvas));
    drawQuad(target_context, targetCanvas);
    targetFile.src = image;
}

async function edit() {
    editView.style.display = "block";
    rectifyView.style.display = "none";
}

async function rectify() {
    if (!globalPoints) {
        return;
    }
    let final_canvas = await rectifyCanvas(normalizer, targetFile, globalPoints);
    if (final_canvas == null) { return }
    rectifiedImage.src = final_canvas.toDataURL();
    rectifyView.style.display = "block";
    editView.style.display = "none";
}

async function save() {
    let imageUrl = rectifiedImage.src;

    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = 'image';
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
async function rectifyCanvas(normalizer, source, points) {
    if (!Dynamsoft) return;

    try {
        let result = await normalizer.normalize(source, { quad: { points: points } });
        if (result.image) {
            return result.image.toCanvas();
        }
        else {
            return null;
        }
    }
    catch (ex) {
        console.error(ex);
    }
    return null;
}

async function setFilter(normalizer, filter) {
    if (!Dynamsoft) return;

    try {
        let settings = await normalizer.getRuntimeSettings();
        settings.ImageParameterArray[0].BinarizationModes[0].ThresholdCompensation = 10;
        settings.NormalizerParameterArray[0].ColourMode = filter;
        await normalizer.setRuntimeSettings(settings);
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

        let mouseX = e.clientX || e.touches[0].clientX;
        let mouseY = e.clientX || e.touches[0].clientY;
        if (scaleX < scaleY) {
            mouseX = e.clientX - rect.left;
            mouseY = e.clientY - rect.top - (canvas.clientHeight - canvas.height * scaleX) / 2;

            mouseX = mouseX / scaleX;
            mouseY = mouseY / scaleX;
        }
        else {
            mouseX = e.clientX - rect.left - (canvas.clientWidth - canvas.width * scaleY) / 2;
            mouseY = e.clientY - rect.top;

            mouseX = mouseX / scaleY;
            mouseY = mouseY / scaleY;
        }

        return { x: Math.round(mouseX), y: Math.round(mouseY) };
    }

    let delta = 10;
    let coordinates = getCoordinates(e);

    for (let i = 0; i < globalPoints.length; i++) {
        if (Math.abs(globalPoints[i].x - coordinates.x) < delta && Math.abs(globalPoints[i].y - coordinates.y) < delta) {
            canvas.addEventListener("mousemove", dragPoint);
            canvas.addEventListener("mouseup", releasePoint);
            canvas.addEventListener("touchmove", dragPoint);
            canvas.addEventListener("touchend", releasePoint);
            function dragPoint(e) {
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
        context.arc(globalPoints[i].x, globalPoints[i].y, 5, 0, 2 * Math.PI);
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

function scan() {
    if (!isSDKReady) {
        alert("Please activate the SDK first.");
        return;
    }

    if (!isDetecting) {
        scanButton.innerHTML = "Stop";
        isDetecting = true;
        startDetectionLoop();
    }
    else {
        scanButton.innerHTML = "Scan";
        isDetecting = false;
    }
}

async function startDetectionLoop() {
    isLooping = true;
    let scan_result = document.getElementById('scan_result');
    scan_result.innerHTML = "";
    while (isDetecting) {
        let frame = acquireCameraFrame(cameraEnhancer);
        let clearCount = 0;

        try {
            if (barcodeCheckbox.checked) {
                let barcodeResults = await reader.decode(frame);
                clearOverlay(cameraEnhancer);
                clearCount += 1;
                if (barcodeResults.length > 0) {
                    let txts = [];
                    for (var i = 0; i < barcodeResults.length; ++i) {
                        txts.push(barcodeResults[i].barcodeText);
                        localization = barcodeResults[i].localizationResult;
                        text = barcodeResults[i].barcodeText;

                        // Draw overlay
                        drawLine(cameraEnhancer, localization.x1, localization.y1, localization.x2, localization.y2);
                        drawLine(cameraEnhancer, localization.x2, localization.y2, localization.x3, localization.y3);
                        drawLine(cameraEnhancer, localization.x3, localization.y3, localization.x4, localization.y4);
                        drawLine(cameraEnhancer, localization.x4, localization.y4, localization.x1, localization.y1);

                        let x = [localization.x1, localization.x2, localization.x3, localization.x4];
                        let y = [localization.y1, localization.y2, localization.y3, localization.y4];
                        x.sort(function (a, b) {
                            return a - b;
                        });
                        y.sort(function (a, b) {
                            return b - a;
                        });
                        let left = x[0];
                        let top = y[0];

                        drawText(cameraEnhancer, text, left, top + 50);
                    }
                    scan_result.innerHTML += txts.join(', ') + '\n';
                }
            }

            if (mrzCheckbox.checked) {
                let mrzResults = await recognizer.recognize(frame);
                if (clearCount == 0) {
                    clearOverlay(cameraEnhancer);
                    clearCount += 1;
                }

                let txts = [];
                for (let result of mrzResults) {
                    for (let line of result.lineResults) {
                        let text = line.text;
                        let points = line.location.points;
                        // Draw overlay
                        drawLine(cameraEnhancer, points[0].x, points[0].y, points[1].x, points[1].y);
                        drawLine(cameraEnhancer, points[1].x, points[1].y, points[2].x, points[2].y);
                        drawLine(cameraEnhancer, points[2].x, points[2].y, points[3].x, points[3].y);
                        drawLine(cameraEnhancer, points[3].x, points[3].y, points[0].x, points[0].y);

                        let x = [points[0].x, points[1].x, points[0].x, points[0].x];
                        let y = [points[0].y, points[1].y, points[0].y, points[0].y];
                        x.sort(function (a, b) {
                            return a - b;
                        });
                        y.sort(function (a, b) {
                            return b - a;
                        });
                        let left = x[0];
                        let top = y[0];

                        drawText(cameraEnhancer, text, left, top);
                        txts.push(text);
                    }
                }

                if (txts.length == 2) {
                    scan_result.innerHTML += JSON.stringify(mrzParseTwoLine(txts[0], txts[1])) + '\n';
                }
                else if (txts.length == 3) {
                    scan_result.innerHTML += JSON.stringify(mrzParseThreeLine(txts[0], txts[1], txts[2])) + '\n';
                }
            }

            if (documentCheckbox.checked) {
                let documentResults = await normalizer.detectQuad(frame);
                if (clearCount == 0) {
                    clearOverlay(cameraEnhancer);
                    clearCount += 1;
                }

                if (documentResults.length > 0) {
                    let quad = documentResults[0];
                    let points = quad.location.points;

                    if (isCaptured) {
                        isCaptured = false;
                        globalPoints = points;
                        targetCanvas.width = resolution[0];
                        targetCanvas.height = resolution[1];
                        openEditor(frame.toDataURL());
                    }

                    // Draw overlay
                    drawLine(cameraEnhancer, points[0].x, points[0].y, points[1].x, points[1].y);
                    drawLine(cameraEnhancer, points[1].x, points[1].y, points[2].x, points[2].y);
                    drawLine(cameraEnhancer, points[2].x, points[2].y, points[3].x, points[3].y);
                    drawLine(cameraEnhancer, points[3].x, points[3].y, points[0].x, points[0].y);

                    let x = [points[0].x, points[1].x, points[0].x, points[0].x];
                    let y = [points[0].y, points[1].y, points[0].y, points[0].y];
                    x.sort(function (a, b) {
                        return a - b;
                    });
                    y.sort(function (a, b) {
                        return b - a;
                    });
                    let left = x[0];
                    let top = y[0];
                    drawText(cameraEnhancer, 'Detected document', left, top);

                }
            }

            if (clearCount == 0) {
                clearOverlay(cameraEnhancer);
                await new Promise(resolve => setTimeout(resolve, 30));
            }
        }
        catch (ex) {
            console.error(ex);
        }

    }
    clearOverlay(cameraEnhancer);
    isLooping = false;
}

async function getCameras(cameraEnhancer) {
    if (!Dynamsoft) return;

    try {
        return await cameraEnhancer.getAllCameras();
    }
    catch (ex) {
        console.error(ex);
    }
}

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

async function setVideoElement(cameraEnhancer, elementId) {
    if (!Dynamsoft) return;

    try {
        let element = document.getElementById(elementId);
        element.className = "dce-video-container";
        await cameraEnhancer.setUIElement(element);
    }
    catch (ex) {
        console.error(ex);
    }
}

function acquireCameraFrame(cameraEnhancer) {
    if (!Dynamsoft) return;

    try {
        let img = cameraEnhancer.getFrame().toCanvas();
        return img;
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

function clearOverlay(cameraEnhancer) {
    if (!Dynamsoft) return;

    try {
        let drawingLayers = cameraEnhancer.getDrawingLayers();
        if (drawingLayers.length > 0) {
            drawingLayers[0].clearDrawingItems();
        }
        else {
            cameraEnhancer.createDrawingLayer();
        }
    }
    catch (ex) {
        console.error(ex);
    }
}

function drawLine(cameraEnhancer, x1, y1, x2, y2) {
    if (!Dynamsoft) return;

    try {
        let drawingLayers = cameraEnhancer.getDrawingLayers();
        let drawingLayer;
        let drawingItems = new Array(
            new Dynamsoft.DCE.DrawingItem.DT_Line({
                x: x1,
                y: y1
            }, {
                x: x2,
                y: y2
            }, 1)
        )
        if (drawingLayers.length > 0) {
            drawingLayer = drawingLayers[0];
        }
        else {
            drawingLayer = cameraEnhancer.createDrawingLayer();
        }
        drawingLayer.addDrawingItems(drawingItems);
    }
    catch (ex) {
        console.error(ex);
    }
}

function drawText(cameraEnhancer, text, x, y) {
    if (!Dynamsoft) return;

    try {
        let drawingLayers = cameraEnhancer.getDrawingLayers();
        let drawingLayer;
        let drawingItems = new Array(
            new Dynamsoft.DCE.DrawingItem.DT_Text(text, x, y, 1),
        )
        if (drawingLayers.length > 0) {
            drawingLayer = drawingLayers[0];
        }
        else {
            drawingLayer = cameraEnhancer.createDrawingLayer();
        }
        drawingLayer.addDrawingItems(drawingItems);
    }
    catch (ex) {
        console.error(ex);
    }
}

async function initCamera() {
    try {
        cameras = await getCameras(cameraEnhancer);
        if (cameras != null && cameras.length > 0) {
            for (let i = 0; i < cameras.length; i++) {
                let option = document.createElement("option");
                option.text = cameras[i].label;
                cameraSource.add(option);
            }
            await setVideoElement(cameraEnhancer, "camera_view");
            await openCamera(cameraEnhancer, cameras[0]);
        }
        else {
            alert("No camera found.");
        }
    }
    catch (ex) {
        console.error(ex);
    }
}

