// Make sure to set the key before you call any other APIs under Dynamsoft.DBR
//You can register for a free 30-day trial here: https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform
Dynamsoft.DBR.BarcodeReader.license = "DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==";

var barcodereader;
var barcode_result = document.getElementById('barcode_result');
(async () => {
	barcodereader = await Dynamsoft.DBR.BarcodeReader.createInstance();
	await barcodereader.updateRuntimeSettings('speed');
	let settings = await barcodereader.getRuntimeSettings();
	settings.deblurLevel = 0;
	barcodereader.updateRuntimeSettings(settings);

	document.getElementById('anim-loading').style.display = 'none';
	btWebGL.disabled = false;
	btCanvas.disabled = false;
})();

var videoSelect = document.querySelector('select#videoSource');
var videoOption = document.getElementById('videoOption');
var btWebGL = document.getElementById('bt-webgl');
btWebGL.disabled = true;
var btCanvas = document.getElementById('bt-canvas');
btCanvas.disabled = true;

var videoElement = document.getElementById('videoContainer');
document.getElementById('videoview').style.display = 'block';
var overlay = document.getElementById('overlay');
var overlayContext = overlay.getContext('2d');

var canvas = document.getElementById('pcCanvas');
var ctx = canvas.getContext('2d');

var count = 1;
var total = 0;

var decoding_count = 1;
var decoding_total = 0;

var width, height;

var isWebGL = false;

// Initialize canvas
var canvasWebGL = document.createElement('canvas');
var gl = canvasWebGL.getContext("webgl") || canvasWebGL.getContext("experimental-webgl");

var canvas2d = document.createElement('canvas');
var ctx2d = canvas2d.getContext('2d');

var gray = null;
var buffer = null;

function clearOverlay() {
	overlayContext.clearRect(0, 0, width, height);
	overlayContext.strokeStyle = '#ff0000';
	overlayContext.lineWidth = 5;
	return overlayContext;
}

function drawResult(context, localization, text) {
	context.beginPath();
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

function run() {
	count = 1;
	total = 0;
	decoding_count = 1;
	decoding_total = 0;
	scanBarcode();
}

btWebGL.onclick = function () {
	clearOverlay();
	btWebGL.disabled = true;
	btCanvas.disabled = false;
	isWebGL = true;
	run();
};

btCanvas.onclick = function () {
	clearOverlay();
	btCanvas.disabled = true;
	btWebGL.disabled = false;
	isWebGL = false;
	run();
};

// scan barcode
function scanBarcode() {

	// let start = window.performance.now();
	let start = Date.now();
	let end;

	buffer = new Uint8Array(width * height * 4);

	if (isWebGL) {
		gray = new Uint8Array(width * height);

		var drawInfo = {
			x: 0,
			y: 0,
			dx: 1,
			dy: 1,
			textureInfo: loadImageAndCreateTextureInfo(videoElement)
		};

		draw(drawInfo);

		gl.readPixels(
			0,
			0,
			gl.drawingBufferWidth,
			gl.drawingBufferHeight,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			buffer
		);
		// end = window.performance.now();
		// end = Date.now();

		// Grayscale image
		let gray_index = 0;
		for (i = 0; i < width * height * 4; i += 4) {
			gray[gray_index++] = buffer[i];
		}

		end = Date.now();

		// Draw WebGL texture to canvas
		var imgData = ctx.createImageData(width, height);
		for (var i = 0; i < buffer.length; i += 4) {
			imgData.data[i] = buffer[i];   //red
			imgData.data[i + 1] = buffer[i + 1]; //green
			imgData.data[i + 2] = buffer[i + 2]; //blue
			imgData.data[i + 3] = buffer[i + 3]; //alpha
		}
		ctx.putImageData(imgData, 0, 0);
	}
	else {
		ctx2d.drawImage(videoElement, 0, 0, width, height);
		buffer = ctx2d.getImageData(0, 0, width, height).data;
		// end = window.performance.now();
		end = Date.now()

		// Draw video frame to canvas
		ctx.drawImage(videoElement, 0, 0);
	}

	if (isWebGL) {
		console.log("%c WebGL buffer time cost: " + (end - start), 'color: green; font-weight: bold;');
	}
	else
		console.log("Canvas buffer time cost: " + (end - start));

	// total += (end - start);
	// count += 1;
	// if (count == 31) {
	// 	if (isWebGL) {
	// 		console.log("%c WebGL buffer time cost: " + total / 30, 'color: green; font-weight: bold;');
	// 	}
	// 	else
	// 		console.log("Canvas buffer time cost: " + total / 30);
	// 	count = 1;
	// 	total = 0;
	// }

	// read barcode
	// let decoding_start = window.performance.now();
	let decoding_start = Date.now();

	if (isWebGL) {
		// console.time("Grayscale Image");
		barcodereader
			.decodeBuffer(
				gray,
				width,
				height,
				width,
				Dynamsoft.DBR.EnumImagePixelFormat.IPF_GrayScaled
			)
			.then((results) => {
				// console.timeEnd("Grayscale Image");
				if (!isWebGL) return;

				// let decoding_end = window.performance.now();
				let decoding_end = Date.now();
				console.log("%c Grayscale image Decoding time cost: " + (decoding_end - decoding_start), 'color: green; font-weight: bold;');
				console.log("");

				decoding_total += (decoding_end - decoding_start);
				decoding_count += 1;
				if (decoding_count == 31) {
					// console.log("%c Average Decoding time cost: " + decoding_total / 30, 'color: green; font-weight: bold;');
					decoding_count = 1;
					decoding_total = 0;
				}
				showResults(results);
			});
	}
	else {
		// console.time("Color Image");
		barcodereader
			.decodeBuffer(
				buffer,
				width,
				height,
				width * 4,
				Dynamsoft.DBR.EnumImagePixelFormat.IPF_ARGB_8888
			)
			.then((results) => {
				// console.timeEnd("Color Image");
				if (isWebGL) return;

				// let decoding_end = window.performance.now();
				let decoding_end = Date.now();
				console.log("Color image decoding time cost: " + (decoding_end - decoding_start));
				console.log("");

				decoding_total += (decoding_end - decoding_start);
				decoding_count += 1;
				if (decoding_count == 31) {
					// console.log("Average Decoding time cost: " + decoding_total / 30);
					decoding_count = 1;
					decoding_total = 0;
				}
				showResults(results);
			});
	}

}

console.time('devices');
navigator.mediaDevices.enumerateDevices().then(gotDevices).then(getStream).catch(handleError);

videoSelect.onchange = getStream;

function gotDevices(deviceInfos) {
	for (var i = deviceInfos.length - 1; i >= 0; --i) {
		var deviceInfo = deviceInfos[i];
		var option = document.createElement('option');
		option.value = deviceInfo.deviceId;
		if (deviceInfo.kind === 'videoinput') {
			option.text = deviceInfo.label || 'camera ' + (videoSelect.length + 1);
			videoSelect.appendChild(option);
		} else {
			console.log('Found one other kind of source/device: ', deviceInfo);
		}
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
			deviceId: videoSelect.value,
			width: { min: 640 },
			height: { min: 480 },
		}
	};

	navigator.mediaDevices.getUserMedia(constraints).then(gotStream).catch(handleError);
}

function gotStream(stream) {
	window.stream = stream;
	videoElement.srcObject = stream;
	videoElement.addEventListener("loadedmetadata", function (e) {
		width = this.videoWidth;
		height = this.videoHeight;
		console.log(width, height);
		canvas.width = width;
		canvas.height = height;
		canvasWebGL.width = width;
		canvasWebGL.height = height;
		canvas2d.width = width;
		canvas2d.height = height;
		overlay.width = width;
		overlay.height = height;

	}, false);
}

function handleError(error) {
	console.log('Error: ', error);
}

function showResults(results) {
	let context = clearOverlay();

	let txts = [];
	try {
		let localization;
		if (results.length > 0) {
			for (var i = 0; i < results.length; ++i) {
				txts.push(results[i].barcodeText);
				localization = results[i].localizationResult;
				drawResult(context, localization, results[i].barcodeText);
			}
			barcode_result.textContent = txts.join(', ');
		}
		else {
			barcode_result.textContent = "No barcode found";
		}

		scanBarcode();
	} catch (e) {
		alert(e);
	}
}

/*
 *	WebGL initialization
 *  https://webglfundamentals.org/webgl/lessons/webgl-2d-drawimage.html
 *  https://webglfundamentals.org/webgl/resources/m4.js
 *  https://webglfundamentals.org/webgl/resources/webgl-utils.js
 */

// setup GLSL program
var program = webglUtils.createProgramFromScripts(gl, ["drawImage-vertex-shader", "drawImage-fragment-shader"]);

// look up where the vertex data needs to go.
var positionLocation = gl.getAttribLocation(program, "a_position");
var texcoordLocation = gl.getAttribLocation(program, "a_texcoord");

// lookup uniforms
var matrixLocation = gl.getUniformLocation(program, "u_matrix");
var textureLocation = gl.getUniformLocation(program, "u_texture");

// Create a buffer.
var positionBuffer = gl.createBuffer();
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
var texcoordBuffer = gl.createBuffer();
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

// creates a texture info { width: w, height: h, texture: tex }
// The texture will start with 1x1 pixels and be updated
// when the image has loaded
function loadImageAndCreateTextureInfo(videoElement) {
	var tex = gl.createTexture();
	var textureInfo = {
		width: width,
		height: height,
		texture: tex,
	};

	gl.bindTexture(gl.TEXTURE_2D, textureInfo.texture);
	gl.texImage2D(
		gl.TEXTURE_2D,
		0,
		gl.RGBA,
		gl.RGBA,
		gl.UNSIGNED_BYTE,
		videoElement
	);

	// let's assume all images are not a power of 2
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

	return textureInfo;
}

function draw(drawInfo) {
	// webglUtils.resizeCanvasToDisplaySize(gl.canvas);

	// Tell WebGL how to convert from clip space to pixels
	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

	gl.clear(gl.COLOR_BUFFER_BIT);

	drawImage(
		drawInfo.textureInfo.texture,
		drawInfo.textureInfo.width,
		drawInfo.textureInfo.height,
		drawInfo.x,
		drawInfo.y);
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