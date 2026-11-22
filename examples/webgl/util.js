// Make sure to set the key before you call any other APIs under Dynamsoft
// You can register for a free 30-day trial here: https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform
Dynamsoft.License.LicenseManager.initLicense("DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==");

// Optional. Used to load wasm resources in advance, reducing latency between
// video playing and barcode decoding.
Dynamsoft.Core.CoreModule.loadWasm();

var barcodereader = null;
var isSDKReady = false;   // CaptureVisionRouter created + configured
var isCameraReady = false; // video metadata loaded, canvas sizes known
var isScanning = false;   // the frame loop is active
var isWebGL = false;      // current mode: true = GPU grayscale, false = canvas color
var isDecodePending = false; // at most ONE capture() in flight (throttling)

var barcode_result = document.getElementById('barcode_result');
var scan_status = document.getElementById('scan_status');
var btWebGL = document.getElementById('bt-webgl');
var btCanvas = document.getElementById('bt-canvas');
btWebGL.disabled = true;
btCanvas.disabled = true;

(async () => {
	try {
		// Create a CaptureVisionRouter instance. In the new Dynamsoft Barcode Reader
		// SDK (v10+), a CaptureVisionRouter coordinates the whole capture pipeline
		// (image source -> barcode decoding -> results), replacing the old
		// BarcodeReader API used in the 9.x SDK.
		barcodereader = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();

		// Use the preset template that prioritizes decoding speed. This is the v10+
		// equivalent of the old `updateRuntimeSettings('speed')` + `deblurLevel = 0`
		// calls in the 9.x SDK.
		let settings = await barcodereader.getSimplifiedSettings('ReadBarcodes_SpeedFirst');
		settings.barcodeSettings.deblurLevel = 0;
		await barcodereader.updateSettings('ReadBarcodes_SpeedFirst', settings);

		isSDKReady = true;
	} catch (ex) {
		console.error('Failed to initialize the barcode SDK:', ex);
		barcode_result.textContent = 'Failed to initialize the barcode SDK: ' + (ex.message || ex);
		return;
	}
	document.getElementById('anim-loading').style.display = 'none';
	updateButtons();
})();

var videoSelect = document.querySelector('select#videoSource');
var videoElement = document.getElementById('videoContainer');
var overlay = document.getElementById('overlay');
var overlayContext = overlay.getContext('2d', { willReadFrequently: true });
var videoPanel = document.getElementById('videoPanel');
var previewPanel = document.getElementById('previewPanel');

var canvas = document.getElementById('pcCanvas');
var ctx = canvas.getContext('2d');

// rolling statistics over the last 30 frames
var buffer_count = 1;
var buffer_total = 0;
var decoding_count = 1;
var decoding_total = 0;

var width, height;

// Off-screen canvases: one WebGL context for grayscale conversion,
// one 2D context used by the "CPU Only" path.
var canvasWebGL = document.createElement('canvas');
var gl = canvasWebGL.getContext("webgl") || canvasWebGL.getContext("experimental-webgl");
if (!gl) {
	// No WebGL support: canvas-only mode.
	btWebGL.style.display = 'none';
	console.warn('WebGL is not available in this browser. Falling back to canvas-only mode.');
}

var canvas2d = document.createElement('canvas');
var ctx2d = canvas2d.getContext('2d', { willReadFrequently: true });

var gray = null;
var buffer = null;
var previewImageData = null;

// Buttons become enabled only when BOTH the SDK and the camera are ready.
// While scanning, both buttons stay enabled so the user can switch modes
// (GPU grayscale vs CPU color) on the fly.
function updateButtons() {
	if (isScanning) {
		btWebGL.disabled = !gl;
		btCanvas.disabled = false;
	} else {
		var ready = isSDKReady && isCameraReady;
		btWebGL.disabled = !ready || !gl;
		btCanvas.disabled = !ready;
	}
	btWebGL.classList.toggle('active', isScanning && isWebGL);
	btCanvas.classList.toggle('active', isScanning && !isWebGL);
}

function clearOverlay() {
	overlayContext.clearRect(0, 0, overlay.width, overlay.height);
	return overlayContext;
}

function drawResult(context, points, text) {
	// In the new (v10+) SDK, a barcode location is an array of corner points
	// `{ points: [{x,y}, {x,y}, {x,y}, {x,y}] }` instead of the old
	// `localizationResult` object with `x1..y4` properties.
	var scale = Math.max((width || 640) / 640, 1);

	context.strokeStyle = '#ff0000';
	context.lineWidth = Math.max(2, Math.round(3 * scale));
	context.beginPath();
	context.moveTo(points[0].x, points[0].y);
	context.lineTo(points[1].x, points[1].y);
	context.lineTo(points[2].x, points[2].y);
	context.lineTo(points[3].x, points[3].y);
	context.closePath();
	context.stroke();

	var fontSize = Math.round(16 * scale);
	context.font = 'bold ' + fontSize + 'px Verdana';
	context.fillStyle = '#ff0000';
	var xs = [points[0].x, points[1].x, points[2].x, points[3].x];
	var ys = [points[0].y, points[1].y, points[2].y, points[3].y];
	var left = Math.min.apply(null, xs);
	var top = Math.min.apply(null, ys);
	// Draw the text above the bounding box (fall back to inside if clipped).
	var textY = top - 8 * scale;
	if (textY < fontSize) {
		textY = top + fontSize + 6 * scale;
	}
	context.fillText(text, left, textY);
}

function resetStats() {
	buffer_count = 1;
	buffer_total = 0;
	decoding_count = 1;
	decoding_total = 0;
}

function setScanStatus(text, active) {
	if (!scan_status) return;
	scan_status.textContent = text || '';
	if (active) {
		scan_status.classList.add('active');
	} else {
		scan_status.classList.remove('active');
	}
}

function startMode(useWebGL) {
	if (!isSDKReady || !isCameraReady) {
		var why = !isSDKReady ? 'SDK is still loading…' : 'Camera is not ready. Allow camera permission or close other apps using it.';
		setScanStatus(why, false);
		return;
	}
	clearOverlay();
	var modeChanged = isWebGL !== useWebGL;
	isWebGL = useWebGL;
	setScanStatus(useWebGL ? 'Scanning (GPU / grayscale)…' : 'Scanning (CPU / color)…', true);
	if (!isScanning) {
		isScanning = true;
		resetStats();
		scanBarcode();
	} else if (modeChanged) {
		resetStats();
	}
	updateButtons();
}

btWebGL.onclick = function () {
	startMode(true);
};

btCanvas.onclick = function () {
	startMode(false);
};

// scan barcode
function scanBarcode() {

	if (!isScanning || !width || !height || videoElement.readyState < 2) {
		// The video stream is not (re)ready yet — retry on the next frame.
		if (isScanning) requestAnimationFrame(scanBarcode);
		return;
	}

	// While a decode is in flight, keep the live preview cheap (drawImage only).
	// Skipping getImageData/readPixels here is what keeps CPU mode from freezing.
	if (isDecodePending) {
		ctx.drawImage(videoElement, 0, 0, width, height);
		requestAnimationFrame(scanBarcode);
		return;
	}

	let start = Date.now();
	let end;

	// Reuse the RGBA backing buffer across frames instead of allocating 1.2 MB
	// per frame (640x480x4). GC pressure was a real cost in the old code.
	if (!buffer || buffer.length !== width * height * 4) {
		buffer = new Uint8Array(width * height * 4);
	}

	if (isWebGL) {
		if (!gray || gray.length !== width * height) {
			gray = new Uint8Array(width * height);
		}

		// Upload the current video frame into the REUSED texture (see
		// uploadVideoFrame): creating a new texture every frame leaks GPU
		// memory and adds significant per-frame allocation cost.
		uploadVideoFrame(videoElement);

		draw();

		gl.readPixels(
			0,
			0,
			gl.drawingBufferWidth,
			gl.drawingBufferHeight,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			buffer
		);

		// Grayscale image (the fragment shader outputs grey in R=G=B)
		let gray_index = 0;
		for (let i = 0; i < width * height * 4; i += 4) {
			gray[gray_index++] = buffer[i];
		}

		end = Date.now();

		// Draw the WebGL readback buffer to the preview canvas (reuse ImageData).
		if (!previewImageData || previewImageData.width !== width || previewImageData.height !== height) {
			previewImageData = ctx.createImageData(width, height);
		}
		previewImageData.data.set(buffer);
		ctx.putImageData(previewImageData, 0, 0);
	}
	else {
		ctx2d.drawImage(videoElement, 0, 0, width, height);
		var imgData2 = ctx2d.getImageData(0, 0, width, height);
		end = Date.now();

		// Show exactly the frame we captured (single copy, no extra drawImage).
		ctx.putImageData(imgData2, 0, 0);

		// CaptureVisionRouter.capture() expects a Uint8Array; ImageData.data is
		// a Uint8ClampedArray, so copy into the reused buffer.
		buffer.set(imgData2.data);
	}

	// rolling average every 30 frames
	buffer_total += (end - start);
	buffer_count += 1;
	if (buffer_count == 31) {
		if (isWebGL) {
			console.log("%c WebGL buffer avg time cost: " + (buffer_total / 30).toFixed(2) + " ms", 'color: green; font-weight: bold;');
		}
		else
			console.log("Canvas buffer avg time cost: " + (buffer_total / 30).toFixed(2) + " ms");
		buffer_count = 1;
		buffer_total = 0;
	}

	// read barcode
	let decoding_start = Date.now();

	// Build the DSImageData for the current mode. Both branches above have
	// already filled `gray` (WebGL) or `buffer` (CPU) for this frame.
	// Snapshot the frame bytes. Preview continues on the next rAF and would
	// otherwise overwrite `gray`/`buffer` while capture() is still running.
	var imageData = isWebGL
		? {
			bytes: gray.slice(0),
			width: width,
			height: height,
			stride: width,
			format: Dynamsoft.Core.EnumImagePixelFormat.IPF_GRAYSCALED
		}
		: {
			bytes: buffer.slice(0),
			width: width,
			height: height,
			stride: width * 4,
			// Canvas ImageData bytes are R,G,B,A in memory, which the v10+ SDK
			// interprets as IPF_ABGR_8888 (32bit ABGR, stored high-to-low).
			format: Dynamsoft.Core.EnumImagePixelFormat.IPF_ABGR_8888
		};

	// capture() may throw synchronously on invalid parameters — a synchronous
	// throw would break out of scanBarcode() and permanently stop the loop,
	// which is exactly how "CPU Only stops responding" happened. Guard it.
	var modeAtCapture = isWebGL;
	isDecodePending = true;
	try {
		barcodereader
			.capture(imageData, 'ReadBarcodes_SpeedFirst')
			.then((result) => {
				isDecodePending = false;
				if (!isScanning || isWebGL !== modeAtCapture) return;

				let decoding_end = Date.now();
				if (modeAtCapture) {
					console.log("%c Grayscale image decoding time cost: " + (decoding_end - decoding_start) + " ms", 'color: green; font-weight: bold;');
				} else {
					console.log("Color image decoding time cost: " + (decoding_end - decoding_start) + " ms");
				}

				decoding_total += (decoding_end - decoding_start);
				decoding_count += 1;
				if (decoding_count == 31) {
					var avgMsg = "Avg decoding time cost: " + (decoding_total / 30).toFixed(2) + " ms";
					if (modeAtCapture) {
						console.log("%c " + avgMsg, 'color: green; font-weight: bold;');
					} else {
						console.log(avgMsg);
					}
					decoding_count = 1;
					decoding_total = 0;
				}
				showResults(result);
			})
			.catch((ex) => {
				isDecodePending = false;
				console.error('Decoding failed:', ex);
			});
	} catch (ex) {
		isDecodePending = false;
		console.error('capture() threw synchronously:', ex);
	}

	// Keep the preview loop running at display refresh rate regardless of how
	// long the async decode takes. (Old code chained the next frame off the
	// decode callback, so one slow decode froze the whole preview.)
	requestAnimationFrame(scanBarcode);

}

function stopScanning(statusText) {
	isScanning = false;
	isDecodePending = false;
	setScanStatus(statusText || '', false);
	btWebGL.classList.remove('active');
	btCanvas.classList.remove('active');
}

/* Camera device enumeration and stream handling.
 * NOTE: must run after all element references (btWebGL, btCanvas, ...) above
 * are initialized, otherwise the "getUserMedia -> gotDevices -> getStream"
 * promise chain reaches `updateButtons()` before they exist. */
console.time('devices');
navigator.mediaDevices.getUserMedia({ video: true })
	// Getting a stream with the default camera first so the user grants
	// permission; device labels are only available afterwards.
	.then(function (dummyStream) {
		dummyStream.getTracks().forEach(function (t) { t.stop(); });
		return navigator.mediaDevices.enumerateDevices();
	})
	.then(gotDevices)
	.then(getStream)
	.catch(handleError);

videoSelect.onchange = getStream;

function gotDevices(deviceInfos) {
	videoSelect.innerHTML = '';
	var cameraCount = 0;
	for (var i = deviceInfos.length - 1; i >= 0; --i) {
		var deviceInfo = deviceInfos[i];
		if (deviceInfo.kind === 'videoinput') {
			var option = document.createElement('option');
			option.value = deviceInfo.deviceId;
			option.text = deviceInfo.label || 'camera ' + (cameraCount + 1);
			videoSelect.appendChild(option);
			cameraCount++;
		}
	}
	if (cameraCount === 0) {
		barcode_result.textContent = 'No camera found on this device.';
	}
}

function getStream() {
	if (window.stream) {
		window.stream.getTracks().forEach(function (track) {
			track.stop();
		});
	}

	var constraints = {
		video: {
			width: { min: 640 },
			height: { min: 480 }
		}
	};
	if (videoSelect.value) {
		constraints.video.deviceId = videoSelect.value;
	}

	// Stop any running scan before switching the camera, so that pending
	// decode callbacks of the old stream are ignored.
	stopScanning();
	isCameraReady = false;
	updateButtons();

	navigator.mediaDevices.getUserMedia(constraints).then(gotStream).catch(handleError);
}

function applyVideoSize(video) {
	if (!video || video.videoWidth === 0 || video.videoHeight === 0) return;
	width = video.videoWidth;
	height = video.videoHeight;
	console.log('video resolution:', width, height);
	canvas.width = width;
	canvas.height = height;
	canvasWebGL.width = width;
	canvasWebGL.height = height;
	canvas2d.width = width;
	canvas2d.height = height;
	overlay.width = width;
	overlay.height = height;

	videoPanel.style.display = 'block';
	previewPanel.style.display = 'block';
	isCameraReady = true;
	updateButtons();
}

function gotStream(stream) {
	window.stream = stream;
	// Attach the handler BEFORE assigning srcObject so we cannot miss
	// loadedmetadata when the browser already has the first frame.
	videoElement.onloadedmetadata = function () {
		applyVideoSize(this);
	};
	videoElement.srcObject = stream;
	videoElement.play().then(function () {
		applyVideoSize(videoElement);
	}).catch(function (err) {
		console.warn('video.play() failed:', err);
	});
}

function handleError(error) {
	console.error('Camera error: ', error);
	var name = error && error.name ? error.name : 'UnknownError';
	var msg;
	switch (name) {
		case 'NotAllowedError':
		case 'PermissionDeniedError':
			msg = 'Camera access was denied. Please allow camera permission for this page.';
			break;
		case 'NotFoundError':
		case 'DevicesNotFoundError':
			msg = 'No camera was found. Please connect a camera and reload the page.';
			break;
		case 'NotReadableError':
		case 'TrackStartError':
			msg = 'The camera is in use by another application (NotReadableError). Close other apps that may be using the camera, then press GPU/CPU button again.';
			break;
		default:
			msg = 'Failed to open the camera: ' + (error && error.message ? error.message : name);
	}
	barcode_result.textContent = msg;
	stopScanning();
	isCameraReady = false;
	updateButtons();
}

function showResults(result) {
	if (!isScanning) return;
	let context = clearOverlay();

	let txts = [];
	try {
		let items = result.items || [];
		let barcodeItems = items.filter((item) => item.type === Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE);
		if (barcodeItems.length > 0) {
			for (var i = 0; i < barcodeItems.length; ++i) {
				txts.push(barcodeItems[i].text);
				if (barcodeItems[i].location && barcodeItems[i].location.points) {
					drawResult(context, barcodeItems[i].location.points, barcodeItems[i].text);
				}
			}
			barcode_result.textContent = txts.join(', ');
		}
		else {
			barcode_result.textContent = "No barcode found";
		}
	} catch (e) {
		console.error(e);
	}
}

/*
 *	WebGL initialization
 *  https://webglfundamentals.org/webgl/lessons/webgl-2d-drawimage.html
 *  https://webglfundamentals.org/webgl/resources/m4.js
 *  https://webglfundamentals.org/webgl/resources/webgl-utils.js
 */

var program = null;
var positionLocation, texcoordLocation;
var matrixLocation, textureLocation, colorFactorLocation;
var positionBuffer, texcoordBuffer;
var videoTexture = null; // created once, reused every frame

if (gl) {
	// setup GLSL program
	program = webglUtils.createProgramFromScripts(gl, ["drawImage-vertex-shader", "drawImage-fragment-shader"]);

	// look up where the vertex data needs to go.
	positionLocation = gl.getAttribLocation(program, "a_position");
	texcoordLocation = gl.getAttribLocation(program, "a_texcoord");

	// lookup uniforms
	matrixLocation = gl.getUniformLocation(program, "u_matrix");
	textureLocation = gl.getUniformLocation(program, "u_texture");
	colorFactorLocation = gl.getUniformLocation(program, "u_colorFactor");

	// Create a buffer.
	positionBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

	// Put a unit quad in the buffer
	var positions = [
		0, 0,
		0, 1,
		1, 0,
		1, 0,
		0, 1,
		1, 1,
	];
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

	// Create a buffer for texture coords
	texcoordBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);

	// Put texcoords in the buffer
	var texcoords = [
		0, 0,
		0, 1,
		1, 0,
		1, 0,
		0, 1,
		1, 1,
	];
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texcoords), gl.STATIC_DRAW);

	// Create the video texture ONCE. Every frame we only re-upload the pixel
	// data with texImage2D (see uploadVideoFrame) — creating a new texture per
	// frame leaks GPU memory and measurably slows down the "GPU" path.
	videoTexture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, videoTexture);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

	// 0 = full grayscale output (u_colorFactor blends color<->grey in the
	// fragment shader; the old code never set it and relied on the default 0).
	gl.useProgram(program);
	gl.uniform1f(colorFactorLocation, 0.0);
}

// Upload the current video frame into the reused texture.
function uploadVideoFrame(video) {
	gl.bindTexture(gl.TEXTURE_2D, videoTexture);
	gl.texImage2D(
		gl.TEXTURE_2D,
		0,
		gl.RGBA,
		gl.RGBA,
		gl.UNSIGNED_BYTE,
		video
	);
}

function draw() {
	// Tell WebGL how to convert from clip space to pixels
	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

	gl.clear(gl.COLOR_BUFFER_BIT);

	drawImage(videoTexture, width, height, 0, 0);
}

// Unlike images, textures do not have a width and height associated
// with them so we'll pass in the width and height of the texture
function drawImage(tex, texWidth, texHeight, dstX, dstY) {
	gl.bindTexture(gl.TEXTURE_2D, tex);
	// https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/pixelStorei
	gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

	// Tell WebGL to use our shader program pair
	gl.useProgram(program);

	// Setup the attributes to pull data from our buffers
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
	gl.enableVertexAttribArray(positionLocation);
	gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
	gl.bindBuffer(gl.ARRAY_BUFFER, texcoordBuffer);
	gl.enableVertexAttribArray(texcoordLocation);
	gl.vertexAttribPointer(texcoordLocation, 2, gl.FLOAT, false, 0, 0);

	// this matrix will convert from pixels to clip space
	var matrix = m4.orthographic(0, gl.canvas.width, gl.canvas.height, 0, -1, 1);

	// this matrix will translate our quad to dstX, dstY
	matrix = m4.translate(matrix, dstX, dstY, 0);

	// this matrix will scale our 1 unit quad
	// from 1 unit to texWidth, texHeight units
	matrix = m4.scale(matrix, texWidth, texHeight, 1);

	// Set the matrix.
	gl.uniformMatrix4fv(matrixLocation, false, matrix);

	// Tell the shader to get the texture from texture unit 0
	gl.uniform1i(textureLocation, 0);

	// draw the quad (2 triangles, 6 vertices)
	gl.drawArrays(gl.TRIANGLES, 0, 6);
}