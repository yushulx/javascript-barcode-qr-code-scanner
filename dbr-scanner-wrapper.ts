class DBRWrapper {
    private scanner: Dynamsoft.DBR.BarcodeScanner;
    private videoContainer: HTMLDivElement;
    private cameraSourceElement: HTMLDivElement;
    private cameraViewElement: HTMLDivElement;
    private overlay: HTMLCanvasElement;
    private context: CanvasRenderingContext2D;
    private selectElement: HTMLSelectElement;
    private cameraInfo: any;

    constructor() {
        try {
            this.scanner = null;
            this.videoContainer = null;
            this.cameraSourceElement = null;
            this.cameraViewElement = null;
            this.overlay = null;
            this.context = null;
            this.selectElement = null;
            this.cameraInfo = {};
            this.openCamera = this.openCamera.bind(this);
            this.onCameraReady = this.onCameraReady.bind(this);
        }
        catch (ex) {
            alert(ex.message);
            throw ex;
        }
    }

    async createCustomScanner(callback) {
        this.initCameraSource();
        this.initCameraView();

        await Dynamsoft.DBR.BarcodeScanner.loadWasm();
        this.scanner = await Dynamsoft.DBR.BarcodeScanner.createInstance();
        await this.scanner.updateRuntimeSettings("speed");
        await this.scanner.setUIElement(this.videoContainer);
        let cameras = await this.scanner.getAllCameras();
        this.appendCameraSource(cameras);
        await this.openCamera();
        this.scanner.onFrameRead = results => {
            this.clearOverlay();

            let txts = [];
            let localization;
            if (results.length > 0) {
                for (var i = 0; i < results.length; ++i) {
                    txts.push(results[i].barcodeText);
                    localization = results[i].localizationResult;
                    this.drawOverlay(localization, results[i].barcodeText);
                }

                if (callback) {
                    callback(txts.join(', '));
                }
            }
            else {
                if (callback) {
                    callback("No barcode found");
                }
            }
        };
        this.scanner.onUnduplicatedRead = (txt, result) => { };
        this.scanner.onPlayed = this.onCameraReady;
        return this.scanner;
    }

    async createDefaultScanner(callback) {
        this.scanner = await Dynamsoft.DBR.BarcodeScanner.createInstance();
        await this.scanner.updateRuntimeSettings("speed");
        this.scanner.onFrameRead = results => {
            this.clearOverlay();

            let txts = [];
            let localization;
            if (results.length > 0) {
                for (var i = 0; i < results.length; ++i) {
                    txts.push(results[i].barcodeText);
                    localization = results[i].localizationResult;
                    this.drawOverlay(localization, results[i].barcodeText);
                }
            }
            
            if (callback) {
                callback(results);
            }
        };
        this.scanner.onUnduplicatedRead = (txt, result) => { };
        this.scanner.onPlayed = this.onCameraReady;
        return this.scanner;
    }

    patchOverlay() {
        let containers = document.getElementsByClassName("dce-video-container");

        if (containers == null || containers.length == 0) {
            return;
        }

        // Always select last element.
        let container = document.getElementsByClassName("dce-video-container")[containers.length - 1];
        let lastElement = container.lastElementChild;

        if (lastElement && lastElement.id === "custom-overlay")
            container.removeChild(lastElement);

        this.overlay = document.createElement('canvas');
        this.overlay.id = "custom-overlay";
        this.overlay.style.position = 'absolute';
        this.overlay.style.top = '0';
        this.overlay.style.left = '0';
        // this.overlay.style.zIndex = '2';
        this.overlay.style.width = '100%';
        this.overlay.style.height = '100%';
        this.overlay.style.objectFit = 'contain';
        this.context = this.overlay.getContext('2d');
        container.appendChild(this.overlay);
    }

    appendCameraSource(deviceInfos) {
        for (var i = 0; i < deviceInfos.length; ++i) {
            var deviceInfo = deviceInfos[i];
            var option = document.createElement('option');
            option.value = deviceInfo.deviceId;
            option.text = deviceInfo.label;
            this.cameraInfo[deviceInfo.deviceId] = deviceInfo;
            this.selectElement.appendChild(option);
        }
    }

    initCameraSource() {
        this.cameraSourceElement = document.createElement('div');
        this.selectElement = document.createElement('select');
        this.selectElement.onchange = this.openCamera;
        this.cameraSourceElement.appendChild(this.selectElement);
    }

    onCameraReady() {
        let resolution = this.scanner.getResolution();
        this.updateOverlay(resolution[0], resolution[1]);
    }

    async openCamera() {
        this.clearOverlay();
        let deviceId = this.selectElement.value;
        if (this.scanner) {
            await this.scanner.setCurrentCamera(this.cameraInfo[deviceId]);
        }
    }

    initCameraView() {
        this.cameraViewElement = document.createElement('div');
        this.cameraViewElement.style.position = 'relative';
        this.cameraViewElement.style.width = '100vw';
        this.cameraViewElement.style.height = '100vh';

        this.videoContainer = document.createElement('div');
        this.videoContainer.style.position = 'relative';
        this.videoContainer.style.width = '100%';
        this.videoContainer.style.height = '100%';
        this.videoContainer.style.zIndex = '1';
        this.videoContainer.className = "dce-video-container";
        this.cameraViewElement.appendChild(this.videoContainer);

        this.overlay = document.createElement('canvas');
        this.overlay.style.position = 'absolute';
        this.overlay.style.top = '0';
        this.overlay.style.left = '0';
        this.overlay.style.zIndex = '2';
        this.overlay.style.width = '100%';
        this.overlay.style.height = '100%';
        this.overlay.style.objectFit = 'contain';
        this.context = this.overlay.getContext('2d');

        this.cameraViewElement.appendChild(this.overlay);
    }

    getCameraSource() {
        return this.cameraSourceElement;
    }

    getCameraView() {
        return this.cameraViewElement;
    }

    updateOverlay(width, height) {
        if (this.overlay) {
            this.overlay.width = width;
            this.overlay.height = height;
        }
    }

    clearOverlay() {
        if (this.context) {
            this.context.clearRect(0, 0, this.overlay.width, this.overlay.height);
            this.context.strokeStyle = '#ff0000';
            this.context.lineWidth = 5;
        }
    }

    drawOverlay(localization, text) {
        if (this.context) {
            this.context.beginPath();
            this.context.moveTo(localization.x1, localization.y1);
            this.context.lineTo(localization.x2, localization.y2);
            this.context.lineTo(localization.x3, localization.y3);
            this.context.lineTo(localization.x4, localization.y4);
            this.context.lineTo(localization.x1, localization.y1);
            this.context.stroke();

            this.context.font = '18px Verdana';
            this.context.fillStyle = '#ff0000';
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

            this.context.fillText(text, left, top + 50);
        }
    }

    showOverlay() {
        this.overlay.style.display = 'block';
        document.getElementsByClassName('cvs-scan-region-overlay-0')[0].style.display = 'block';
    }

    hideOverlay() {
        this.overlay.style.display = 'none';
        document.getElementsByClassName('cvs-scan-region-overlay-0')[0].style.display = 'none';
    }

    showCamera() {
        if (this.scanner) {
            this.scanner.show();
        }
    }

    hideCamera() {
        if (this.scanner) {
            this.scanner.hide();
        }
    }

    static createInstance() {
        return new DBRWrapper();
    }

    // Dynamically load Dynamsoft Barcode Reader JS library
    loadDBR(callback) {
        let script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/dynamsoft-javascript-barcode@9.0.0/dist/dbr.js";
        script.onload = function () {
            callback(Dynamsoft);
        };
        document.head.appendChild(script);
    }

    constructView() {
        document.body.appendChild(this.getCameraSource());
        document.body.appendChild(this.getCameraView());
    }
}