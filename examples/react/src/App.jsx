import { useState, useRef, useEffect, useCallback } from 'react';
import { extractMrzInfo } from './utils/mrzUtils';

const DEFAULT_LICENSE =
  'DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==';

// ─── Helper: draw detection outline on canvas ────────────────────────────────
function drawOutline(ctx, points) {
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath();
  ctx.stroke();
}

// ─── Helper: draw editable quad on canvas ────────────────────────────────────
function drawQuad(ctx, canvas, points) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#00ff00';
  ctx.lineWidth = 2;
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, 2 * Math.PI);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.lineTo(points[0].x, points[0].y);
  ctx.stroke();
}

export default function App() {
  // ── UI state ────────────────────────────────────────────────────────────────
  const [licenseKey, setLicenseKey] = useState(DEFAULT_LICENSE);
  const [isSDKReady, setIsSDKReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [inputSource, setInputSource] = useState('file');
  const [scanMode, setScanMode] = useState('barcode');
  const [showImageContainer, setShowImageContainer] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [showSaveButton, setShowSaveButton] = useState(false);
  const [showRectifyView, setShowRectifyView] = useState(false);
  const [detectionResult, setDetectionResult] = useState('');
  const [scanResult, setScanResult] = useState('');
  const [cameraList, setCameraList] = useState([]);
  const [selectedCameraIndex, setSelectedCameraIndex] = useState(0);
  const [rectifiedSrc, setRectifiedSrc] = useState('');
  const [editorImageSrc, setEditorImageSrc] = useState('');
  const [documentRectifiedSrc, setDocumentRectifiedSrc] = useState('');

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const imageFileRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const targetCanvasRef = useRef(null);
  const targetFileRef = useRef(null);
  const rectifiedImageRef = useRef(null);
  const cameraViewContainerRef = useRef(null);
  const pickFileRef = useRef(null);

  // ── SDK / mutable refs (not state – do not trigger re-renders) ───────────────
  const cvrRef = useRef(null);
  const parserRef = useRef(null);
  const cameraEnhancerRef = useRef(null);
  const cameraViewSDKRef = useRef(null);
  const globalPointsRef = useRef(null);
  const resolutionRef = useRef(null);
  const isDetectingRef = useRef(false);
  const isCapturedRef = useRef(false);
  const camerasRef = useRef([]);
  const imgRef = useRef(new Image());
  const scanModeRef = useRef('barcode');

  // Keep scanModeRef in sync with React state
  useEffect(() => {
    scanModeRef.current = scanMode;
  }, [scanMode]);

  // ── Paste handler ────────────────────────────────────────────────────────────
  useEffect(() => {
    const handlePaste = (e) => {
      const items = (e.clipboardData || e.originalEvent.clipboardData).items;
      for (const item of items) {
        if (item.kind === 'file') {
          const blob = item.getAsFile();
          const fr = new FileReader();
          fr.onload = (ev) => loadImage2Canvas(ev.target.result);
          fr.readAsDataURL(blob);
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [isSDKReady, scanMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Drag-over suppressor ─────────────────────────────────────────────────────
  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.match('image.*')) {
      const fr = new FileReader();
      fr.onload = (ev) => loadImage2Canvas(ev.target.result);
      fr.readAsDataURL(file);
    } else {
      alert('Please drop an image file.');
    }
  };

  // ── SDK: Activate ────────────────────────────────────────────────────────────
  const activate = useCallback(async () => {
    const Dynamsoft = window.Dynamsoft;
    if (!Dynamsoft) {
      alert('Dynamsoft SDK is still loading. Please wait a moment.');
      return;
    }
    setIsLoading(true);
    try {
      await Dynamsoft.License.LicenseManager.initLicense(licenseKey, true);
      Dynamsoft.Core.CoreModule.loadWasm(['DBR', 'DLR', 'DDN']);

      parserRef.current = await Dynamsoft.DCP.CodeParser.createInstance();
      await Dynamsoft.DCP.CodeParserModule.loadSpec('MRTD_TD1_ID');
      await Dynamsoft.DCP.CodeParserModule.loadSpec('MRTD_TD2_FRENCH_ID');
      await Dynamsoft.DCP.CodeParserModule.loadSpec('MRTD_TD2_ID');
      await Dynamsoft.DCP.CodeParserModule.loadSpec('MRTD_TD2_VISA');
      await Dynamsoft.DCP.CodeParserModule.loadSpec('MRTD_TD3_PASSPORT');
      await Dynamsoft.DCP.CodeParserModule.loadSpec('MRTD_TD3_VISA');
      await Dynamsoft.CVR.CaptureVisionRouter.appendDLModelBuffer('MRZCharRecognition');
      await Dynamsoft.CVR.CaptureVisionRouter.appendDLModelBuffer('MRZTextLineRecognition');

      cvrRef.current = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();
      cvrRef.current.addResultReceiver({
        onCapturedResultReceived: (result) => showCameraResult(result),
        onOriginalImageResultReceived: () => {},
      });

      setIsSDKReady(true);
    } catch (ex) {
      console.error(ex);
      alert('Activation failed: ' + (ex.message || ex));
    }
    setIsLoading(false);
  }, [licenseKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Image loading ────────────────────────────────────────────────────────────
  const loadImage2Canvas = useCallback(
    (base64Image) => {
      const imageFile = imageFileRef.current;
      const overlayCanvas = overlayCanvasRef.current;

      imageFile.src = base64Image;
      imgRef.current.src = base64Image;
      imgRef.current.onload = async () => {
        const { width, height } = imgRef.current;
        overlayCanvas.width = width;
        overlayCanvas.height = height;
        if (targetCanvasRef.current) {
          targetCanvasRef.current.width = width;
          targetCanvasRef.current.height = height;
        }

        setShowImageContainer(true);

        if (!isSDKReady) {
          alert('Please activate the SDK first.');
          return;
        }
        setIsLoading(true);

        const ctx = overlayCanvas.getContext('2d');
        ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        const mode = scanModeRef.current;

        try {
          if (mode === 'barcode') {
            await cvrRef.current.resetSettings();
            const result = await cvrRef.current.capture(
              imgRef.current.src,
              'ReadBarcodes_Default'
            );
            showFileResult(
              mode,
              ctx,
              result,
              imgRef.current,
              window.Dynamsoft.Core.EnumCapturedResultItemType.CRIT_BARCODE
            );
          } else if (mode === 'mrz') {
            await cvrRef.current.initSettings('./full.json');
            const result = await cvrRef.current.capture(imgRef.current.src, 'ReadMRZ');
            showFileResult(
              mode,
              ctx,
              result,
              imgRef.current,
              window.Dynamsoft.Core.EnumCapturedResultItemType.CRIT_TEXT_LINE
            );
          } else if (mode === 'document') {
            await cvrRef.current.resetSettings();
            const result = await cvrRef.current.capture(
              imgRef.current.src,
              'DetectDocumentBoundaries_Default'
            );
            showFileResult(
              mode,
              ctx,
              result,
              imgRef.current,
              window.Dynamsoft.Core.EnumCapturedResultItemType.CRIT_DETECTED_QUAD
            );
          }
        } catch (ex) {
          console.error(ex);
        }

        setIsLoading(false);
      };
    },
    [isSDKReady] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── File result display ──────────────────────────────────────────────────────
  const showFileResult = useCallback(
    async (mode, ctx, result, imgEl, type) => {
      let output = '';
      const items = result.items;

      if (items.length === 0) {
        setDetectionResult('Nothing found\n');
        return;
      }

      for (const item of items) {
        if (item.type !== type) continue;

        const points = item.location.points;
        globalPointsRef.current = points;
        drawOutline(ctx, points);

        if (mode === 'barcode') {
          output += (item.text || 'Recognition Failed') + '\n\n';
        } else if (mode === 'mrz') {
          const rawText = item.text.replace(/\\n/g, '');
          const parsed = await parserRef.current.parse(rawText);
          output += item.text + '\n\n';
          output += JSON.stringify(extractMrzInfo(parsed), null, 2);
        } else if (mode === 'document') {
          openEditor(imgEl.src);
        }
      }

      setDetectionResult(output || 'Nothing found\n');
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── Camera management ────────────────────────────────────────────────────────
  const initCamera = useCallback(async () => {
    const Dynamsoft = window.Dynamsoft;
    if (!Dynamsoft) return;
    try {
      const cameraView = await Dynamsoft.DCE.CameraView.createInstance();
      cameraViewSDKRef.current = cameraView;
      const ce = await Dynamsoft.DCE.CameraEnhancer.createInstance(cameraView);
      cameraEnhancerRef.current = ce;

      const allCams = await ce.getAllCameras();
      camerasRef.current = allCams;
      setCameraList(allCams.map((c) => c.label));

      if (allCams.length > 0) {
        const uiEl = cameraView.getUIElement();
        if (cameraViewContainerRef.current) {
          cameraViewContainerRef.current.appendChild(uiEl);
          uiEl.shadowRoot
            ?.querySelector('.dce-sel-camera')
            ?.setAttribute('style', 'display:none');
          uiEl.shadowRoot
            ?.querySelector('.dce-sel-resolution')
            ?.setAttribute('style', 'display:none');
        }

        await ce.selectCamera(allCams[0]);
        ce.on('played', () => {
          resolutionRef.current = ce.getResolution();
        });
        ce.setPixelFormat(10);
        await ce.open();
      } else {
        alert('No camera found.');
      }
    } catch (ex) {
      console.error(ex);
    }
  }, []);

  const closeCamera = useCallback(async () => {
    if (cameraEnhancerRef.current) {
      await cameraEnhancerRef.current.close();
    }
  }, []);

  const startScanning = useCallback(async () => {
    if (!isSDKReady) {
      alert('Please activate the SDK first.');
      return;
    }
    if (isDetectingRef.current) return;

    const ce = cameraEnhancerRef.current;
    const cvr = cvrRef.current;
    const mode = scanModeRef.current;

    if (mode === 'mrz') {
      ce.setScanRegion({
        x: 10,
        y: 30,
        width: 80,
        height: 40,
        isMeasuredInPercentage: true,
      });
    } else {
      ce.setScanRegion(null);
    }

    isDetectingRef.current = true;
    cvr.setInput(ce);

    if (mode === 'mrz') {
      await cvr.initSettings('./full.json');
      cvr.startCapturing('ReadMRZ');
    } else if (mode === 'barcode') {
      await cvr.resetSettings();
      cvr.startCapturing('ReadBarcodes_Default');
    } else if (mode === 'document') {
      await cvr.resetSettings();
      const params = await cvr.getSimplifiedSettings('DetectDocumentBoundaries_Default');
      params.outputOriginalImage = true;
      await cvr.updateSettings('DetectDocumentBoundaries_Default', params);
      cvr.startCapturing('DetectDocumentBoundaries_Default');
    }
  }, [isSDKReady]);

  const stopScanning = useCallback(async () => {
    if (!isDetectingRef.current) return;
    isDetectingRef.current = false;
    if (cvrRef.current) await cvrRef.current.stopCapturing();
    if (cameraViewSDKRef.current) cameraViewSDKRef.current.clearAllInnerDrawingItems?.();
  }, []);

  // ── Camera result display ────────────────────────────────────────────────────
  const showCameraResult = useCallback(async (result) => {
    const mode = scanModeRef.current;
    const items = result.items;
    let output = '';

    const typeMap = {
      barcode: window.Dynamsoft?.Core.EnumCapturedResultItemType.CRIT_BARCODE,
      mrz: window.Dynamsoft?.Core.EnumCapturedResultItemType.CRIT_TEXT_LINE,
      document: window.Dynamsoft?.Core.EnumCapturedResultItemType.CRIT_DETECTED_QUAD,
    };
    const type = typeMap[mode];
    const origType =
      window.Dynamsoft?.Core.EnumCapturedResultItemType.CRIT_ORIGINAL_IMAGE;

    if (!items || items.length === 0) {
      setScanResult('Nothing found\n');
      return;
    }

    for (const item of items) {
      if (item.type === type) {
        globalPointsRef.current = item.location.points;
        if (mode === 'barcode') {
          output += (item.text || 'Recognition Failed') + '\n\n';
        } else if (mode === 'mrz') {
          const raw = item.text.replace(/\\n/g, '');
          const parsed = await parserRef.current.parse(raw);
          output += item.text + '\n\n';
          output += JSON.stringify(extractMrzInfo(parsed), null, 2);
        }
      } else if (item.type === origType && mode === 'document') {
        if (isCapturedRef.current) {
          isCapturedRef.current = false;
          await stopScanning();
          const cvs = item.imageData.toCanvas();
          if (targetCanvasRef.current) {
            targetCanvasRef.current.width = resolutionRef.current?.width || cvs.width;
            targetCanvasRef.current.height = resolutionRef.current?.height || cvs.height;
          }
          openEditor(cvs.toDataURL());
        }
      }
    }

    setScanResult(output || 'Nothing found\n');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Input source change ──────────────────────────────────────────────────────
  const handleInputSourceChange = useCallback(
    async (newSource) => {
      if (newSource === 'file') {
        if (cameraEnhancerRef.current) {
          await stopScanning();
          await closeCamera();
          // Unmount camera view UI from the always-rendered container
          if (cameraViewContainerRef.current) {
            cameraViewContainerRef.current.innerHTML = '';
          }
          cameraEnhancerRef.current = null;
          cameraViewSDKRef.current = null;
          setCameraList([]);
        }
        setInputSource('file');
      } else {
        // Flip state FIRST so the camera panel is visible in the DOM
        // before initCamera() tries to append the SDK UI element.
        setInputSource('camera');
        if (!cameraEnhancerRef.current) {
          // Wait one microtask tick to let React flush the state update
          // and render the camera container div into the DOM.
          await new Promise((resolve) => setTimeout(resolve, 0));
          await initCamera();
        }
        await startScanning();
      }
    },
    [stopScanning, closeCamera, initCamera, startScanning]
  );

  // ── Scan mode change ─────────────────────────────────────────────────────────
  const handleScanModeChange = useCallback(
    async (newMode) => {
      setScanMode(newMode);
      scanModeRef.current = newMode;

      if (inputSource === 'camera' && isDetectingRef.current) {
        await stopScanning();
        await startScanning();
      }
    },
    [inputSource, stopScanning, startScanning]
  );

  // ── Camera selection change ───────────────────────────────────────────────────
  const handleCameraChange = useCallback(
    async (idx) => {
      const cams = camerasRef.current;
      if (!cams || cams.length === 0) return;
      const wasDetecting = isDetectingRef.current;
      if (wasDetecting) await stopScanning();
      await cameraEnhancerRef.current.selectCamera(cams[idx]);
      await cameraEnhancerRef.current.open();
      if (wasDetecting) await startScanning();
      setSelectedCameraIndex(idx);
    },
    [stopScanning, startScanning]
  );

  // ── Document editor ───────────────────────────────────────────────────────────
  const openEditor = useCallback((imageDataUrl) => {
    setEditorImageSrc(imageDataUrl);
    setShowRectifyView(false);
    setShowSaveButton(false);
    setShowEditor(true);

    // Attach drag listeners to target canvas after it renders
    setTimeout(() => {
      const canvas = targetCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (globalPointsRef.current) drawQuad(ctx, canvas, globalPointsRef.current);

      const onDown = (e) => updatePoint(e, ctx, canvas);
      canvas.addEventListener('mousedown', onDown);
      canvas.addEventListener('touchstart', onDown);
    }, 100);
  }, []);

  const closeEditor = useCallback(async () => {
    setShowEditor(false);
    if (inputSource === 'camera') await startScanning();
  }, [inputSource, startScanning]);

  const handleEdit = () => {
    setShowRectifyView(false);
    setShowSaveButton(false);
  };

  const handleRectify = useCallback(async () => {
    const pts = globalPointsRef.current;
    if (!pts) return;
    const cvr = cvrRef.current;
    if (!cvr) return;

    try {
      const params = await cvr.getSimplifiedSettings('NormalizeDocument_Default');
      params.roi.points = pts;
      params.roiMeasuredInPercentage = 0;
      await cvr.updateSettings('NormalizeDocument_Default', params);

      const targetImg = targetFileRef.current;
      const result = await cvr.capture(targetImg.src, 'NormalizeDocument_Default');

      for (const item of result.items) {
        if (
          item.type !==
          window.Dynamsoft.Core.EnumCapturedResultItemType.CRIT_ENHANCED_IMAGE
        )
          continue;
        const canvas = await item.toCanvas();
        setRectifiedSrc(canvas.toDataURL());
        setShowRectifyView(true);
        setShowSaveButton(true);
        return;
      }
    } catch (ex) {
      console.error(ex);
    }
  }, []);

  const handleSave = useCallback(() => {
    if (!rectifiedSrc) return;
    const a = document.createElement('a');
    a.href = rectifiedSrc;
    a.download = `document_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [rectifiedSrc]);

  // ── Point dragging on target canvas ──────────────────────────────────────────
  function updatePoint(e, ctx, canvas) {
    const pts = globalPointsRef.current;
    if (!pts) return;

    function getCoords(ev) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.clientWidth / canvas.width;
      const scaleY = canvas.clientHeight / canvas.height;
      let clientX = ev.clientX;
      let clientY = ev.clientY;
      if (ev.touches && ev.touches.length > 0) {
        clientX = ev.touches[0].clientX;
        clientY = ev.touches[0].clientY;
      }
      let mx, my;
      if (scaleX < scaleY) {
        mx = (clientX - rect.left) / scaleX;
        my = (clientY - rect.top - (canvas.clientHeight - canvas.height * scaleX) / 2) / scaleX;
      } else {
        mx = (clientX - rect.left - (canvas.clientWidth - canvas.width * scaleY) / 2) / scaleY;
        my = (clientY - rect.top) / scaleY;
      }
      return { x: Math.round(mx), y: Math.round(my) };
    }

    const delta = 20;
    const coords = getCoords(e);
    for (let i = 0; i < pts.length; i++) {
      if (Math.abs(pts[i].x - coords.x) < delta && Math.abs(pts[i].y - coords.y) < delta) {
        e.preventDefault();
        const drag = (ev) => {
          ev.preventDefault();
          const c = getCoords(ev);
          pts[i].x = c.x;
          pts[i].y = c.y;
          drawQuad(ctx, canvas, pts);
        };
        const release = () => {
          canvas.removeEventListener('mousemove', drag);
          canvas.removeEventListener('mouseup', release);
          canvas.removeEventListener('touchmove', drag);
          canvas.removeEventListener('touchend', release);
        };
        canvas.addEventListener('mousemove', drag);
        canvas.addEventListener('mouseup', release);
        canvas.addEventListener('touchmove', drag);
        canvas.addEventListener('touchend', release);
        break;
      }
    }
  }

  // ── File input change ─────────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fr = new FileReader();
    fr.onload = (ev) => loadImage2Canvas(ev.target.result);
    fr.readAsDataURL(file);
  };

  // ── JSX ───────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Loading overlay */}
      {isLoading && (
        <div className="loading-indicator" style={{ display: 'flex' }}>
          <div className="spinner" />
        </div>
      )}

      <header>
        <h1>📱 Vision Scanner</h1>
        <p className="subtitle">Scan Barcode, Document and Machine-readable Zone (MRZ)</p>
      </header>

      <div className="main-container">
        {/* License card */}
        <div className="card license-card">
          <h2>🔑 Activate SDK</h2>
          <p className="info-text">
            Get a License key from{' '}
            <a
              href="https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform"
              target="_blank"
              rel="noreferrer"
            >
              here
            </a>
          </p>
          <div className="input-group">
            <input
              type="text"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="Enter your license key"
            />
            <button onClick={activate} className="btn-primary">
              Activate
            </button>
          </div>
        </div>

        {/* Controls card */}
        <div className="card controls-card">
          <div className="controls-grid">
            <div className="control-group">
              <label className="control-label">Input Source</label>
              <select
                className="select-modern"
                value={inputSource}
                onChange={(e) => handleInputSourceChange(e.target.value)}
              >
                <option value="file">📁 File</option>
                <option value="camera">📷 Camera</option>
              </select>
            </div>

            <div className="control-group">
              <label className="control-label">Scan Mode</label>
              <div className="mode-selector">
                {['barcode', 'mrz', 'document'].map((m) => (
                  <label key={m} className="radio-card">
                    <input
                      type="radio"
                      name="scanMode"
                      value={m}
                      checked={scanMode === m}
                      onChange={() => handleScanModeChange(m)}
                    />
                    <span className="radio-label">
                      {m === 'barcode' ? '📊 Barcode' : m === 'mrz' ? '🛂 MRZ' : '📄 Document'}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* File scanner – always in DOM; hidden via CSS when camera is active */}
        <div className="card" style={{ display: inputSource === 'file' ? '' : 'none' }}>
          <h2>📂 Image Upload</h2>
            <div className={`view-container${showImageContainer ? ' show-image' : ''}`}>
              {/* Upload area */}
              <div
                className="upload-area"
                onDragOver={onDragOver}
                onDrop={handleDrop}
              >
                <label htmlFor="pick_file" className="file-label">
                  <div className="upload-icon">📤</div>
                  <span>Click to upload or drag &amp; drop an image</span>
                  <input
                    type="file"
                    id="pick_file"
                    accept="image/*"
                    ref={pickFileRef}
                    onChange={handleFileChange}
                  />
                </label>
              </div>

              {/* Image container */}
              <div
                className="image-container"
                onDragOver={onDragOver}
                onDrop={handleDrop}
                onClick={() => pickFileRef.current?.click()}
              >
                <div className="imageview">
                  <img ref={imageFileRef} src="" alt="Preview" />
                  <canvas ref={overlayCanvasRef} className="overlay" />
                </div>
              </div>
            </div>

            <div className="result-container">
              <h3>Results</h3>
              <textarea
                readOnly
                value={detectionResult}
                placeholder="Detection results will appear here..."
              />
            </div>

            {documentRectifiedSrc && (
              <div className="result-container">
                <img src={documentRectifiedSrc} alt="Rectified document" />
              </div>
            )}
        </div>

        {/* Camera scanner – always in DOM so cameraViewContainerRef is always valid */}
        <div className="card" style={{ display: inputSource === 'camera' ? '' : 'none' }}>
          <h2>📹 Live Camera</h2>
            <div className="camera-controls">
              <label className="control-label">Camera Source</label>
              <select
                className="select-modern"
                value={selectedCameraIndex}
                onChange={(e) => handleCameraChange(Number(e.target.value))}
              >
                {cameraList.map((label, i) => (
                  <option key={i} value={i}>
                    {label}
                  </option>
                ))}
              </select>
              {scanMode === 'document' && (
                <button
                  className="btn-capture"
                  style={{ display: 'block' }}
                  onClick={() => {
                    isCapturedRef.current = true;
                  }}
                >
                  📸 Capture Document
                </button>
              )}
            </div>

            <div className="video-wrapper">
              <div id="videoview">
                <div id="camera_view" ref={cameraViewContainerRef} />
              </div>
            </div>

            <div className="result-container">
              <h3>Scan Results</h3>
              <textarea
                readOnly
                value={scanResult}
                placeholder="Scan results will appear here..."
              />
            </div>
        </div>
      </div>

      {/* Document editor modal */}
      {showEditor && (
        <div className="modal" style={{ display: 'block' }}>
          <div className="modal-content">
            <div className="modal-header">
              <h2>📝 Document Editor</h2>
              <button onClick={closeEditor} className="close-btn">
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="editor-controls">
                <button onClick={handleEdit} className="btn-secondary">
                  ✏️ Edit
                </button>
                <button onClick={handleRectify} className="btn-secondary">
                  🔄 Rectify
                </button>
                {showSaveButton && (
                  <button onClick={handleSave} className="btn-primary">
                    💾 Save
                  </button>
                )}
              </div>
              <div className="editor-view">
                {!showRectifyView && (
                  <div className="imageview">
                    <img ref={targetFileRef} src={editorImageSrc} alt="Edit" />
                    <canvas ref={targetCanvasRef} className="overlay" />
                  </div>
                )}
                {showRectifyView && (
                  <div className="imageview">
                    <img ref={rectifiedImageRef} src={rectifiedSrc} alt="Rectified" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
