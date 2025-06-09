let activateButton = document.getElementById("activate-button");
let loadingIndicator = document.getElementById("loading-indicator");
let container = document.getElementById("container");

activateButton.onclick = async () => {
    loadingIndicator.style.display = "flex";
    let inputText = document.getElementById("inputText").value;
    let text = inputText.trim();
    let placeHolder = document.getElementById("inputText").placeholder;
    let license = text.length === 0 ? placeHolder : text;

    try {
        Dynamsoft.License.LicenseManager.initLicense(license);
        Dynamsoft.Core.CoreModule.loadWasm(["cvr", "dbr", "dlr",]);
        await Dynamsoft.CVR.CaptureVisionRouter.appendModelBuffer("LetterCharRecognition");
        let router = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();

        let view = await Dynamsoft.DCE.CameraView.createInstance();
        let cameraEnhancer = await Dynamsoft.DCE.CameraEnhancer.createInstance(view);

        document.querySelector("#cameraViewContainer").append(view.getUIElement());
        router.setInput(cameraEnhancer);

        const resultsContainer = document.querySelector("#results");
        const resultReceiver = new Dynamsoft.CVR.CapturedResultReceiver();

        resultReceiver.onCapturedResultReceived = (result) => {
            if (result.items.length == 0) {
                resultsContainer.textContent = '';
            }
        }

        resultReceiver.onDecodedBarcodesReceived = (result) => {

            if (result.barcodeResultItems.length > 0) {
                for (let item of result.barcodeResultItems) {
                    resultsContainer.textContent += `Barcode Type: ${item.formatString}, Value: ${item.text}\n\n`;
                }
            }
        }

        resultReceiver.onRecognizedTextLinesReceived = (result) => {

            if (result.textLineResultItems.length > 0) {
                for (let item of result.textLineResultItems) {
                    resultsContainer.textContent += `Text: ${item.text}\n`;
                }
            }
        };
        router.addResultReceiver(resultReceiver);

        let filter = new Dynamsoft.Utility.MultiFrameResultCrossFilter();
        filter.enableResultCrossVerification(Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE | Dynamsoft.Core.EnumCapturedResultItemType.CRIT_TEXT_LINE, true);
        filter.enableResultDeduplication(Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE | Dynamsoft.Core.EnumCapturedResultItemType.CRIT_TEXT_LINE, true);
        await router.addResultFilter(filter);
        await router.initSettings("./template.json");

        await cameraEnhancer.open();
        await router.startCapturing("ReadBarcode&AccompanyText");
        loadingIndicator.style.display = "none";
        container.style.display = "block";
    }
    catch (ex) {
        alert(ex.message);
        loadingIndicator.style.display = "none";
    }
}


