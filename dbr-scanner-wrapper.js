var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var DBRWrapper = /** @class */ (function () {
    function DBRWrapper() {
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
            this.initCameraSource();
            this.initCameraView();
        }
        catch (ex) {
            alert(ex.message);
            throw ex;
        }
    }
    DBRWrapper.prototype.createCustomScanner = function (callback) {
        return __awaiter(this, void 0, void 0, function () {
            var _a, cameras;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, Dynamsoft.DBR.BarcodeScanner.loadWasm()];
                    case 1:
                        _b.sent();
                        _a = this;
                        return [4 /*yield*/, Dynamsoft.DBR.BarcodeScanner.createInstance()];
                    case 2:
                        _a.scanner = _b.sent();
                        return [4 /*yield*/, this.scanner.updateRuntimeSettings("speed")];
                    case 3:
                        _b.sent();
                        return [4 /*yield*/, this.scanner.setUIElement(this.videoContainer)];
                    case 4:
                        _b.sent();
                        return [4 /*yield*/, this.scanner.getAllCameras()];
                    case 5:
                        cameras = _b.sent();
                        this.appendCameraSource(cameras);
                        return [4 /*yield*/, this.openCamera()];
                    case 6:
                        _b.sent();
                        this.scanner.onFrameRead = function (results) {
                            _this.clearOverlay();
                            var txts = [];
                            var localization;
                            if (results.length > 0) {
                                for (var i = 0; i < results.length; ++i) {
                                    txts.push(results[i].barcodeText);
                                    localization = results[i].localizationResult;
                                    _this.drawOverlay(localization, results[i].barcodeText);
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
                        this.scanner.onUnduplicatedRead = function (txt, result) { };
                        this.scanner.onPlayed = this.onCameraReady;
                        return [2 /*return*/, this.scanner];
                }
            });
        });
    };
    DBRWrapper.prototype.createDefaultScanner = function (callback) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            var _this = this;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = this;
                        return [4 /*yield*/, Dynamsoft.DBR.BarcodeScanner.createInstance()];
                    case 1:
                        _a.scanner = _b.sent();
                        return [4 /*yield*/, this.scanner.updateRuntimeSettings("speed")];
                    case 2:
                        _b.sent();
                        this.scanner.onFrameRead = function (results) {
                            _this.clearOverlay();
                            var txts = [];
                            var localization;
                            if (results.length > 0) {
                                for (var i = 0; i < results.length; ++i) {
                                    txts.push(results[i].barcodeText);
                                    localization = results[i].localizationResult;
                                    _this.drawOverlay(localization, results[i].barcodeText);
                                }
                            }
                            if (callback) {
                                callback(results);
                            }
                        };
                        this.scanner.onUnduplicatedRead = function (txt, result) { };
                        this.scanner.onPlayed = this.onCameraReady;
                        return [2 /*return*/, this.scanner];
                }
            });
        });
    };
    DBRWrapper.prototype.patchOverlay = function () {
        var container = document.getElementsByClassName("dce-video-container")[0];
        this.overlay = document.createElement('canvas');
        this.overlay.style.position = 'absolute';
        this.overlay.style.top = '0';
        this.overlay.style.left = '0';
        // this.overlay.style.zIndex = '2';
        this.overlay.style.width = '100%';
        this.overlay.style.height = '100%';
        this.overlay.style.objectFit = 'contain';
        this.context = this.overlay.getContext('2d');
        container.appendChild(this.overlay);
    };
    DBRWrapper.prototype.appendCameraSource = function (deviceInfos) {
        for (var i = 0; i < deviceInfos.length; ++i) {
            var deviceInfo = deviceInfos[i];
            var option = document.createElement('option');
            option.value = deviceInfo.deviceId;
            option.text = deviceInfo.label;
            this.cameraInfo[deviceInfo.deviceId] = deviceInfo;
            this.selectElement.appendChild(option);
        }
    };
    DBRWrapper.prototype.initCameraSource = function () {
        this.cameraSourceElement = document.createElement('div');
        this.selectElement = document.createElement('select');
        this.selectElement.onchange = this.openCamera;
        this.cameraSourceElement.appendChild(this.selectElement);
    };
    DBRWrapper.prototype.onCameraReady = function () {
        var resolution = this.scanner.getResolution();
        this.updateOverlay(resolution[0], resolution[1]);
    };
    DBRWrapper.prototype.openCamera = function () {
        return __awaiter(this, void 0, void 0, function () {
            var deviceId;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.clearOverlay();
                        deviceId = this.selectElement.value;
                        if (!this.scanner) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.scanner.setCurrentCamera(this.cameraInfo[deviceId])];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    DBRWrapper.prototype.initCameraView = function () {
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
    };
    DBRWrapper.prototype.getCameraSource = function () {
        return this.cameraSourceElement;
    };
    DBRWrapper.prototype.getCameraView = function () {
        return this.cameraViewElement;
    };
    DBRWrapper.prototype.updateOverlay = function (width, height) {
        if (this.overlay) {
            this.overlay.width = width;
            this.overlay.height = height;
        }
    };
    DBRWrapper.prototype.clearOverlay = function () {
        if (this.context) {
            this.context.clearRect(0, 0, this.overlay.width, this.overlay.height);
            this.context.strokeStyle = '#ff0000';
            this.context.lineWidth = 5;
        }
    };
    DBRWrapper.prototype.drawOverlay = function (localization, text) {
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
            var x = [localization.x1, localization.x2, localization.x3, localization.x4];
            var y = [localization.y1, localization.y2, localization.y3, localization.y4];
            x.sort(function (a, b) {
                return a - b;
            });
            y.sort(function (a, b) {
                return b - a;
            });
            var left = x[0];
            var top_1 = y[0];
            this.context.fillText(text, left, top_1 + 50);
        }
    };
    DBRWrapper.prototype.showOverlay = function () {
        this.overlay.style.display = 'block';
        document.getElementsByClassName('cvs-scan-region-overlay-0')[0].style.display = 'block';
    };
    DBRWrapper.prototype.hideOverlay = function () {
        this.overlay.style.display = 'none';
        document.getElementsByClassName('cvs-scan-region-overlay-0')[0].style.display = 'none';
    };
    DBRWrapper.prototype.showCamera = function () {
        if (this.scanner) {
            this.scanner.show();
        }
    };
    DBRWrapper.prototype.hideCamera = function () {
        if (this.scanner) {
            this.scanner.hide();
        }
    };
    DBRWrapper.createInstance = function () {
        return new DBRWrapper();
    };
    // Dynamically load Dynamsoft Barcode Reader JS library
    DBRWrapper.prototype.loadDBR = function (callback) {
        var script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/dynamsoft-javascript-barcode@9.0.0/dist/dbr.js";
        script.onload = function () {
            callback(Dynamsoft);
        };
        document.head.appendChild(script);
    };
    DBRWrapper.prototype.constructView = function () {
        document.body.appendChild(this.getCameraSource());
        document.body.appendChild(this.getCameraView());
    };
    return DBRWrapper;
}());
