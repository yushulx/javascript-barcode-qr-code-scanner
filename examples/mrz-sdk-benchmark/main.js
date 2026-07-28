// main.js - Core application logic for MRZ Benchmark web app.
// Handles SDK initialization, image loading, benchmark execution, and results display.

// ─── Global State ───────────────────────────────────────────────────────────────

const state = {
  dynamsoft: { activated: false, cvr: null, parser: null, version: null },
  scanbot: { activated: false, sdk: null, mrzEngine: null, version: null, SDK: null },
  images: [],          // { file, name, key, dataUrl, truth }
  groundTruth: null,   // Map<key, mrzString>
  benchmarkResults: null,
  running: false,
};

const VENDOR_META = {
  dynamsoft: { id: 'dynamsoft', name: 'Dynamsoft', color: '#fe8e14' },
  scanbot: { id: 'scanbot', name: 'Scanbot', color: '#0fb5ae' },
};

// Default license keys
const DEFAULT_DYNAMSOFT_LICENSE = 'DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==';
const DEFAULT_SCANBOT_LICENSE =
  "pifvdWYP/6m4fgRiDnWGzuRqzeEiQl" +
  "nL52G2KTUoZ1RBb/5wWGPp7VUjDLQ6" +
  "iZuvwwogf80LjZl61A+j+9uTaLWPca" +
  "ZxJJRHtQuNnZx5/6GQx6kAoS9PcGhu" +
  "Hq9P5tT7PvPJiO2vf/A2Z7uVPLchl8" +
  "WzUJI8QSY01VVZOWuxbPDMIRJ8fgYW" +
  "4rGJHe2ZZFsAdL4Q2NYLJ6b81BLfL9" +
  "yLVYpY3nG+FmL4dT9yCiZVr0aHATNA" +
  "035adb6Kl9ei2sxe9fFdDwJrgojXcf" +
  "8RpCcygkehJkUuI5GaEc0B7VGr3VnY" +
  "66EI34RfbQH8gJejocob/kV1hkfjAm" +
  "C8Jip4HQvTPw==\nU2NhbmJvdFNESw" +
  "psb2NhbGhvc3QKMTc4NTg4Nzk5OQo4" +
  "Mzg4NjA3Cjg=\n";

const SCANBOT_CDN_ENGINE = 'https://cdn.jsdelivr.net/npm/scanbot-web-sdk@8/bundle/bin/complete/';

// Embedded MRZ template for CaptureVisionRouter (avoids fetch dependency for file:// usage)
const MRZ_TEMPLATE_JSON = JSON.stringify({
  "CaptureVisionModelOptions": [
    { "Name": "MRZCharRecognition", "DirectoryPath": "", "MaxModelInstances": 4 },
    { "Name": "MRZTextLineRecognition", "DirectoryPath": "", "MaxModelInstances": 1 }
  ],
  "CaptureVisionTemplates": [
    { "ImageROIProcessingNameArray": ["roi-mrz"], "Name": "ReadMRZ", "SemanticProcessingNameArray": ["sp-mrz"], "Timeout": 1000000 }
  ],
  "CodeParserTaskSettingOptions": [
    { "CodeSpecifications": ["MRTD_TD3_PASSPORT","MRTD_TD2_VISA","MRTD_TD3_VISA","MRTD_TD1_ID","MRTD_TD2_ID"], "Name": "dcp-mrz" }
  ],
  "ImageParameterOptions": [
    {
      "ApplicableStages": [
        { "Stage": "SST_INPUT_COLOR_IMAGE" },
        { "Stage": "SST_SCALE_IMAGE" },
        { "Stage": "SST_CONVERT_TO_GRAYSCALE" },
        { "Stage": "SST_TRANSFORM_GRAYSCALE" },
        { "Stage": "SST_ENHANCE_GRAYSCALE" },
        { "BinarizationModes": [{ "EnableFillBinaryVacancy": 0, "Mode": "BM_LOCAL_BLOCK", "ThresholdCompensation": 21 }], "Stage": "SST_BINARIZE_IMAGE" },
        { "Stage": "SST_DETECT_TEXTURE", "TextureDetectionModes": [{ "Mode": "TDM_GENERAL_WIDTH_CONCENTRATION", "Sensitivity": 8 }] },
        { "Stage": "SST_REMOVE_TEXTURE_FROM_GRAYSCALE" },
        { "Stage": "SST_BINARIZE_TEXTURE_REMOVED_GRAYSCALE" },
        { "Stage": "SST_FIND_CONTOURS" },
        { "Stage": "SST_DETECT_SHORTLINES" },
        { "Stage": "SST_ASSEMBLE_LINES" },
        { "Stage": "SST_DETECT_TEXT_ZONES", "TextDetectionMode": { "CharHeightRange": [5,1000,1], "Direction": "HORIZONTAL", "Mode": "TTDM_LINE", "Sensitivity": 7 } },
        { "Stage": "SST_REMOVE_TEXT_ZONES_FROM_BINARY" }
      ],
      "Name": "ip-mrz"
    }
  ],
  "LabelRecognizerTaskSettingOptions": [
    {
      "Name": "task-mrz",
      "SectionArray": [
        { "ImageParameterName": "ip-mrz", "Section": "ST_REGION_PREDETECTION", "StageArray": [{ "Stage": "SST_PREDETECT_REGIONS" }] },
        { "ImageParameterName": "ip-mrz", "Section": "ST_TEXT_LINE_LOCALIZATION", "StageArray": [{ "Stage": "SST_LOCALIZE_TEXT_LINES" }] },
        { "ImageParameterName": "ip-mrz", "Section": "ST_TEXT_LINE_RECOGNITION", "StageArray": [{ "ConfusableCharactersPath": "ConfusableChars.data", "Stage": "SST_RECOGNIZE_RAW_TEXT_LINES" }, { "Stage": "SST_ASSEMBLE_TEXT_LINES" }] }
      ],
      "TextLineSpecificationNameArray": ["tls-mrz-passport","tls-mrz-visa-td3","tls-mrz-id-td1","tls-mrz-id-td2","tls-mrz-visa-td2"]
    }
  ],
  "SemanticProcessingOptions": [
    { "Name": "sp-mrz", "ReferenceObjectFilter": { "ReferenceTargetROIDefNameArray": ["roi-mrz"] }, "TaskSettingNameArray": ["dcp-mrz"] }
  ],
  "TargetROIDefOptions": [
    { "Name": "roi-mrz", "TaskSettingNameArray": ["task-mrz"] }
  ],
  "TextLineSpecificationOptions": [
    { "BaseTextLineSpecificationName": "tls-base", "ConcatResults": 1, "ConcatSeparator": "\\n", "Name": "tls-mrz-passport", "StringLengthRange": [44,44], "SubGroups": [
      { "BaseTextLineSpecificationName": "tls-base", "StringLengthRange": [44,44], "StringRegExPattern": "(P[A-Z<][A-Z<]{3}[A-Z<]{39}){(44)}" },
      { "BaseTextLineSpecificationName": "tls-base", "StringLengthRange": [44,44], "StringRegExPattern": "([A-Z0-9<]{9}[0-9][A-Z<]{3}[0-9]{2}[(01-12)][(01-31)][0-9][MF<][0-9]{2}[(01-12)][(01-31)][0-9][A-Z0-9<]{14}[0-9<][0-9]){(44)}" }
    ]},
    { "BaseTextLineSpecificationName": "tls-base", "ConcatResults": 1, "ConcatSeparator": "\\n", "Name": "tls-mrz-visa-td3", "StringLengthRange": [44,44], "SubGroups": [
      { "BaseTextLineSpecificationName": "tls-base", "StringLengthRange": [44,44], "StringRegExPattern": "(V[A-Z<][A-Z<]{3}[A-Z<]{39}){(44)}" },
      { "BaseTextLineSpecificationName": "tls-base", "StringLengthRange": [44,44], "StringRegExPattern": "([A-Z0-9<]{9}[0-9][A-Z<]{3}[0-9]{2}[(01-12)][(01-31)][0-9][MF<][0-9]{2}[(01-12)][(01-31)][0-9][A-Z0-9<]{14}[A-Z0-9<]{2}){(44)}" }
    ]},
    { "BaseTextLineSpecificationName": "tls-base", "ConcatResults": 1, "ConcatSeparator": "\\n", "Name": "tls-mrz-visa-td2", "StringLengthRange": [36,36], "SubGroups": [
      { "BaseTextLineSpecificationName": "tls-base", "StringLengthRange": [36,36], "StringRegExPattern": "(V[A-Z<][A-Z<]{3}[A-Z<]{31}){(36)}" },
      { "BaseTextLineSpecificationName": "tls-base", "StringLengthRange": [36,36], "StringRegExPattern": "([A-Z0-9<]{9}[0-9][A-Z<]{3}[0-9]{2}[(01-12)][(01-31)][0-9][MF<][0-9]{2}[(01-12)][(01-31)][0-9][A-Z0-9<]{8}){(36)}" }
    ]},
    { "BaseTextLineSpecificationName": "tls-base", "ConcatResults": 1, "ConcatSeparator": "\\n", "Name": "tls-mrz-id-td2", "StringLengthRange": [36,36], "SubGroups": [
      { "BaseTextLineSpecificationName": "tls-base", "StringLengthRange": [36,36], "StringRegExPattern": "([ACI][A-Z<][A-Z<]{3}[A-Z<]{31}){(36)}" },
      { "BaseTextLineSpecificationName": "tls-base", "StringLengthRange": [36,36], "StringRegExPattern": "([A-Z0-9<]{9}[0-9][A-Z<]{3}[0-9]{2}[(01-12)][(01-31)][0-9][MF<][0-9]{2}[(01-12)][(01-31)][0-9][A-Z0-9<]{8}){(36)}" }
    ]},
    { "BaseTextLineSpecificationName": "tls-base", "ConcatResults": 1, "ConcatSeparator": "\\n", "Name": "tls-mrz-id-td1", "StringLengthRange": [30,30], "SubGroups": [
      { "BaseTextLineSpecificationName": "tls-base", "StringLengthRange": [30,30], "StringRegExPattern": "([ACI][A-Z<][A-Z<]{3}[A-Z0-9<]{9}[0-9][A-Z0-9<]{15}){(30)}" },
      { "BaseTextLineSpecificationName": "tls-base", "StringLengthRange": [30,30], "StringRegExPattern": "([0-9]{2}[(01-12)][(01-31)][0-9][MF<][0-9]{2}[(01-12)][(01-31)][0-9][A-Z<]{3}[A-Z0-9<]{11}[0-9]){(30)}" },
      { "BaseTextLineSpecificationName": "tls-base", "StringLengthRange": [30,30], "StringRegExPattern": "([A-Z<]{30}){(30)}" }
    ]},
    {
      "BinarizationModes": [{ "BlockSizeX": 30, "BlockSizeY": 30, "EnableFillBinaryVacancy": 0, "Mode": "BM_LOCAL_BLOCK", "ThresholdCompensation": 15 }],
      "CharHeightRange": [5,1000,1],
      "CharacterModelName": "MRZCharRecognition",
      "TextLineRecModelName": "MRZTextLineRecognition",
      "ConfusableCharactersCorrection": { "ConfusableCharacters": [["0","O"],["1","I"],["5","S"]], "FontNameArray": ["OCR_B"] },
      "Name": "tls-base"
    }
  ]
});

// ─── DOM References ─────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const dom = {
  loadingOverlay: $('loading_overlay'),
  loadingText: $('loading_text'),
  settingsModal: $('settings_modal'),
  uploadZone: $('upload_zone'),
  fileInput: $('file_input'),
  imageInfo: $('image_info'),
  imageCount: $('image_count'),
  gtInput: $('gt_input'),
  gtStatus: $('gt_status'),
  gtClearBtn: $('gt_clear_btn'),
  chkDynamsoft: $('chk_dynamsoft'),
  chkScanbot: $('chk_scanbot'),
  runsSelect: $('runs_select'),
  limitInput: $('limit_input'),
  btnRun: $('btn_run'),
  btnExport: $('btn_export'),
  progressSection: $('progress_section'),
  progressLabel: $('progress_label'),
  progressPct: $('progress_pct'),
  progressBar: $('progress_bar'),
  resultsSection: $('results_section'),
  summaryCards: $('summary_cards'),
  comparisonChart: $('comparison_chart'),
  detailTable: $('detail_table'),
};

// ─── Initialization ─────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  setupUploadZone();
  setupGroundTruthInput();
  restoreLicenses();
  updateRunButton();
});

// ─── Settings Modal ─────────────────────────────────────────────────────────────

function openSettings() {
  dom.settingsModal.classList.remove('hidden');
}

function closeSettings() {
  dom.settingsModal.classList.add('hidden');
}

dom.settingsModal.addEventListener('click', (e) => {
  if (e.target === dom.settingsModal) closeSettings();
});

// ─── License Management ─────────────────────────────────────────────────────────

function saveLicense(sdk, key) {
  try { localStorage.setItem(`mrzBenchmark_${sdk}_license`, key); } catch (_) {}
}

function loadLicense(sdk) {
  try { return localStorage.getItem(`mrzBenchmark_${sdk}_license`) || ''; } catch (_) { return ''; }
}

function restoreLicenses() {
  const dKey = loadLicense('dynamsoft');
  const sKey = loadLicense('scanbot');
  if (dKey) $('license_dynamsoft').value = dKey;
  // Clean up corrupted Scanbot key from localStorage (newlines were stripped)
  if (sKey && sKey === DEFAULT_SCANBOT_LICENSE.replace(/\n/g, '')) {
    try { localStorage.removeItem('mrzBenchmark_scanbot_license'); } catch (_) {}
  } else if (sKey) {
    $('license_scanbot').value = sKey;
  }
  // Note: DEFAULT_SCANBOT_LICENSE contains \n characters that <input> would strip.
  // We use the JS constant directly in activateScanbot() when input is empty.
  if (!$('license_scanbot').value) {
    $('license_scanbot').placeholder = 'Default license will be used (leave empty)';
  }
}

function updateBadge(sdk, active) {
  const badge = $(`badge_${sdk}`);
  badge.textContent = active ? 'Activated' : 'Not Activated';
  badge.className = `badge ${active ? 'badge-active' : 'badge-inactive'}`;
}

// ─── SDK Activation ─────────────────────────────────────────────────────────────

async function activateDynamsoft() {
  const input = $('license_dynamsoft');
  const license = input.value.trim() || input.placeholder;
  if (!license) { alert('Please enter a Dynamsoft license key.'); return; }

  showLoading('Initializing Dynamsoft Capture Vision...');
  try {
    // Step 1: Initialize license
    await Dynamsoft.License.LicenseManager.initLicense(license, true);

    // Step 2: Preload WASM modules for label recognition and document normalization
    Dynamsoft.Core.CoreModule.loadWasm(["DLR", "DDN"]);

    // Step 3: Create CodeParser instance for parsing MRZ into structured data
    const parser = await Dynamsoft.DCP.CodeParser.createInstance();

    // Step 4: Load MRZ document specifications
    await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD1_ID");
    await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD2_FRENCH_ID");
    await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD2_ID");
    await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD2_VISA");
    await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD3_PASSPORT");
    await Dynamsoft.DCP.CodeParserModule.loadSpec("MRTD_TD3_VISA");

    // Step 5: Load deep-learning model buffers for MRZ recognition
    await Dynamsoft.CVR.CaptureVisionRouter.appendDLModelBuffer("MRZCharRecognition");
    await Dynamsoft.CVR.CaptureVisionRouter.appendDLModelBuffer("MRZTextLineRecognition");

    // Step 6: Create CaptureVisionRouter instance
    const cvr = await Dynamsoft.CVR.CaptureVisionRouter.createInstance();

    // Step 7: Load MRZ template settings (embedded to avoid fetch dependency)
    await cvr.initSettings(MRZ_TEMPLATE_JSON);

    state.dynamsoft.cvr = cvr;
    state.dynamsoft.parser = parser;
    state.dynamsoft.activated = true;

    // Extract version
    try {
      state.dynamsoft.version = Dynamsoft.Core.CoreModule.Version || null;
    } catch (_) {}

    saveLicense('dynamsoft', license);
    updateBadge('dynamsoft', true);
    dom.chkDynamsoft.disabled = false;
    dom.chkDynamsoft.checked = true;
    updateRunButton();
  } catch (err) {
    alert(`Dynamsoft activation failed: ${err.message || err}`);
    console.error(err);
  } finally {
    hideLoading();
  }
}

async function activateScanbot() {
  // The default license contains \n characters that <input type="text"> strips.
  // Detect corrupted default (from localStorage or DOM) by comparing against
  // the flattened version, and use the proper constant with intact newlines.
  const inputValue = $('license_scanbot').value;
  const flattenedDefault = DEFAULT_SCANBOT_LICENSE.replace(/\n/g, '');
  const license = (!inputValue || inputValue === flattenedDefault)
    ? DEFAULT_SCANBOT_LICENSE
    : inputValue;

  showLoading('Initializing Scanbot Web SDK...');
  try {
    const SDK = window.ScanbotSDK;
    if (!SDK) throw new Error('Scanbot SDK script not loaded.');

    const isolated = typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : false;

    const sdk = await SDK.initialize({
      licenseKey: license || '',
      enginePath: SCANBOT_CDN_ENGINE,
      allowThreads: isolated,
    });

    const mrzEngine = await sdk.createMrzScannerEngine({
      enableDetection: true,
      incompleteResultHandling: 'ACCEPT',
    });

    state.scanbot.SDK = SDK;
    state.scanbot.sdk = sdk;
    state.scanbot.mrzEngine = mrzEngine;
    state.scanbot.activated = true;

    try { state.scanbot.version = sdk.version || null; } catch (_) {}

    // Only persist custom keys; the default is always available as a JS constant
    if (license !== DEFAULT_SCANBOT_LICENSE) saveLicense('scanbot', license);
    updateBadge('scanbot', true);
    dom.chkScanbot.disabled = false;
    dom.chkScanbot.checked = true;
    updateRunButton();
  } catch (err) {
    alert(`Scanbot activation failed: ${err.message || err}`);
    console.error(err);
  } finally {
    hideLoading();
  }
}

// ─── Image Loading ──────────────────────────────────────────────────────────────

const IMAGE_EXT_RE = /\.(jpg|jpeg|png|bmp|tif|tiff|webp)$/i;

function setupUploadZone() {
  dom.uploadZone.addEventListener('click', () => dom.fileInput.click());
  dom.fileInput.addEventListener('change', (e) => {
    handleFileList(Array.from(e.target.files));
    e.target.value = '';
  });

  dom.uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dom.uploadZone.classList.add('drag-over');
  });
  dom.uploadZone.addEventListener('dragleave', () => {
    dom.uploadZone.classList.remove('drag-over');
  });
  dom.uploadZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dom.uploadZone.classList.remove('drag-over');
    await handleDrop(e);
  });

  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => e.preventDefault());
}

// Handle drop — supports both files and folders via webkitGetAsEntry
async function handleDrop(e) {
  const items = e.dataTransfer.items;
  if (!items || !items.length) return;

  const entries = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
    if (entry) entries.push(entry);
  }

  // If any entry is a directory, use recursive traversal
  if (entries.some(en => en.isDirectory)) {
    showLoading('Scanning folder...');
    const files = [];
    for (const entry of entries) {
      await traverseEntry(entry, '', files);
    }
    hideLoading();
    await handleFileList(files);
  } else {
    // Plain file drop
    handleFileList(Array.from(e.dataTransfer.files));
  }
}

// Recursively collect image files from a directory entry
function traverseEntry(entry, parentPath, out) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      if (IMAGE_EXT_RE.test(entry.name)) {
        entry.file(f => {
          f._relativePath = parentPath ? parentPath + '/' + f.name : f.name;
          out.push(f);
          resolve();
        }, () => resolve());
      } else {
        resolve();
      }
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const readBatch = () => {
        reader.readEntries(async (batch) => {
          if (!batch.length) { resolve(); return; }
          for (const child of batch) {
            const childPath = parentPath ? parentPath + '/' + entry.name : entry.name;
            await traverseEntry(child, childPath, out);
          }
          readBatch(); // readEntries returns max 100 per call
        }, () => resolve());
      };
      readBatch();
    } else {
      resolve();
    }
  });
}

async function handleFileList(fileArray) {
  const files = fileArray.filter(f => IMAGE_EXT_RE.test(f.name));
  if (!files.length) return;

  showLoading(`Loading ${files.length} image(s)...`);
  const newImages = [];

  for (const file of files) {
    try {
      const dataUrl = await readFileAsDataUrl(file);
      // Use relative path if available (folder drop), otherwise just filename
      const relPath = file._relativePath || file.webkitRelativePath || file.name;
      const key = buildKey(relPath);
      newImages.push({ file, name: file.name, key, dataUrl, truth: null });
    } catch (_) {}
  }

  state.images = state.images.concat(newImages);
  applyGroundTruth();
  filterByGroundTruth();
  updateImageInfo();
  updateRunButton();
  hideLoading();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Build a matching key from a relative path: last two segments, lowercase, no extension
// e.g. "midv-500-passport/CA/ca01_01.jpg" → "ca/ca01_01"
function buildKey(relPath) {
  const normalized = relPath.toLowerCase().replace(/\\/g, '/');
  const parts = normalized.split('/');
  const keyParts = parts.length >= 2 ? parts.slice(-2) : parts;
  return keyParts.join('/').replace(/\.[^.]+$/, '');
}

function clearImages() {
  state.images = [];
  state.benchmarkResults = null;
  updateImageInfo();
  dom.resultsSection.classList.add('hidden');
  dom.btnExport.classList.add('hidden');
  updateRunButton();
}

function updateImageInfo() {
  const count = state.images.length;
  if (count > 0) {
    dom.imageInfo.classList.remove('hidden');
    const matched = state.images.filter(img => img.truth).length;
    const suffix = state.groundTruth ? ` (${matched} matched ground truth)` : '';
    dom.imageCount.textContent = `${count} image(s) loaded${suffix}`;
  } else {
    dom.imageInfo.classList.add('hidden');
  }
}

// Auto-filter: when ground truth is loaded, keep only images that have a match
function filterByGroundTruth() {
  if (!state.groundTruth || !state.images.length) return;
  const before = state.images.length;
  state.images = state.images.filter(img => img.truth);
  if (state.images.length < before) {
    console.log(`Filtered ${before} → ${state.images.length} images (matched ground truth)`);
  }
}

// ─── Ground Truth ───────────────────────────────────────────────────────────────

function setupGroundTruthInput() {
  dom.gtInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    parseGroundTruth(text);
    e.target.value = '';
  });
}

function parseGroundTruth(csvText) {
  const map = new Map();
  const lines = csvText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('"imagepath"')) continue;
    const match = trimmed.match(/^"([^"]+)","(.+)"$/);
    if (match) {
      const path = match[1].toLowerCase().replace(/\\/g, '/');
      const mrz = match[2].replace(/#/g, '\n');
      const parts = path.split('/');
      const key = parts.length >= 2
        ? parts.slice(-2).join('/').replace(/\.[^.]+$/, '')
        : path.replace(/\.[^.]+$/, '');
      map.set(key, mrz);
    }
  }

  if (map.size === 0) {
    alert('No valid entries found in CSV. Expected format: "imagepath","MRZ#line2"');
    return;
  }

  state.groundTruth = map;
  dom.gtStatus.textContent = `${map.size} entries loaded`;
  dom.gtStatus.classList.add('loaded');
  dom.gtClearBtn.classList.remove('hidden');
  applyGroundTruth();
  filterByGroundTruth();
  updateImageInfo();
  updateRunButton();
}

function clearGroundTruth() {
  state.groundTruth = null;
  dom.gtStatus.textContent = 'No ground truth loaded';
  dom.gtStatus.classList.remove('loaded');
  dom.gtClearBtn.classList.add('hidden');
  for (const img of state.images) img.truth = null;
}

function applyGroundTruth() {
  if (!state.groundTruth) return;
  for (const img of state.images) {
    const truth = state.groundTruth.get(img.key) || findTruthBySuffix(img.key);
    img.truth = truth || null;
  }
}

function findTruthBySuffix(key) {
  if (!state.groundTruth) return null;
  const filename = key.split('/').pop();
  for (const [k, v] of state.groundTruth) {
    if (k.endsWith('/' + filename) || k === filename) return v;
  }
  return null;
}

// ─── Benchmark Execution ────────────────────────────────────────────────────────

function getSelectedVendors() {
  const vendors = [];
  if (dom.chkDynamsoft.checked && state.dynamsoft.activated) vendors.push('dynamsoft');
  if (dom.chkScanbot.checked && state.scanbot.activated) vendors.push('scanbot');
  return vendors;
}

function updateRunButton() {
  const vendors = getSelectedVendors();
  dom.btnRun.disabled = vendors.length === 0 || state.images.length === 0 || state.running;
}

dom.chkDynamsoft.addEventListener('change', updateRunButton);
dom.chkScanbot.addEventListener('change', updateRunButton);

async function runBenchmark() {
  const vendorIds = getSelectedVendors();
  if (!vendorIds.length || !state.images.length) return;

  const runs = parseInt(dom.runsSelect.value, 10) || 1;
  const limit = parseInt(dom.limitInput.value, 10) || state.images.length;
  const images = state.images.slice(0, limit);
  const hasGroundTruth = images.some(img => img.truth);

  state.running = true;
  state.benchmarkResults = null;
  dom.btnRun.disabled = true;
  dom.btnExport.classList.add('hidden');
  dom.resultsSection.classList.add('hidden');
  dom.progressSection.classList.remove('hidden');

  const startedAt = new Date().toISOString();
  const vendors = [];

  try {
    for (const vendorId of vendorIds) {
      const meta = VENDOR_META[vendorId];
      const results = [];
      const total = images.length;

      for (let i = 0; i < total; i++) {
        const img = images[i];
        updateProgress(vendorId, i, total);

        let best = null;
        for (let r = 0; r < runs; r++) {
          const result = await decodeImage(vendorId, img.dataUrl);
          if (!best || (result.scanMs < best.scanMs)) {
            best = result;
          }
        }

        // Compute match rate if ground truth available
        let matchRate = 0;
        let exactMatch = false;
        if (img.truth && best.mrzText) {
          matchRate = computeMatchRate(best.mrzText, img.truth);
          exactMatch = matchRate >= 0.99999;
        }

        results.push({
          success: best.success,
          mrzText: best.mrzText,
          fields: best.fields,
          scanMs: best.scanMs,
          imageDecodeMs: best.imageDecodeMs,
          totalMs: best.totalMs,
          match_rate: matchRate,
          exact_match: exactMatch,
        });

        // Yield to UI
        if (i % 5 === 0) await sleep(0);
      }

      const summary = buildSummary(results, images);
      const version = vendorId === 'dynamsoft' ? state.dynamsoft.version : state.scanbot.version;
      vendors.push({ ...meta, results, summary, version });
    }

    const finishedAt = new Date().toISOString();
    state.benchmarkResults = { vendors, images, hasGroundTruth, startedAt, finishedAt, runs };

    renderResults(state.benchmarkResults);
    dom.btnExport.classList.remove('hidden');
  } catch (err) {
    alert(`Benchmark error: ${err.message || err}`);
    console.error(err);
  } finally {
    state.running = false;
    dom.btnRun.disabled = false;
    dom.progressSection.classList.add('hidden');
    updateRunButton();
  }
}

async function decodeImage(vendorId, dataUrl) {
  if (vendorId === 'dynamsoft') return decodeDynamsoft(dataUrl);
  if (vendorId === 'scanbot') return decodeScanbot(dataUrl);
  throw new Error(`Unknown vendor: ${vendorId}`);
}

// ─── Dynamsoft Decode (CaptureVisionRouter API) ─────────────────────────────────

async function decodeDynamsoft(dataUrl) {
  const { cvr, parser } = state.dynamsoft;
  if (!cvr) throw new Error('Dynamsoft CVR not initialized.');

  // Measure image decode time
  const img = new Image();
  img.src = dataUrl;
  const decStart = performance.now();
  await img.decode();
  const imageDecodeMs = performance.now() - decStart;

  // Capture with ReadMRZ template
  const scanStart = performance.now();
  const result = await cvr.capture(dataUrl, "ReadMRZ");
  const scanMs = performance.now() - scanStart;

  // Extract MRZ text from result items (filter by TEXT_LINE type)
  let mrzText = null;
  let success = false;
  let fields = emptyFields();

  const items = result && result.items ? result.items : [];
  const textLineType = Dynamsoft.Core.EnumCapturedResultItemType.CRIT_TEXT_LINE;

  for (const item of items) {
    if (item.type === textLineType && item.text) {
      mrzText = item.text.replace(/\\n/g, '\n');
      success = true;
      break;
    }
  }

  // Parse MRZ text into structured fields using CodeParser
  if (success && mrzText && parser) {
    try {
      const parseText = mrzText.replace(/\n/g, '');
      const parseResult = await parser.parse(parseText);
      if (parseResult) {
        fields = extractMrzFields(parseResult);
      }
    } catch (_) {
      // Parsing failed but recognition succeeded - keep raw text
    }
  }

  return { success, mrzText, fields, imageDecodeMs, scanMs, totalMs: imageDecodeMs + scanMs };
}

function extractMrzFields(parseResult) {
  const getVal = (name) => {
    try { return parseResult.getFieldValue(name) || null; } catch (_) { return null; }
  };

  const docCode = getVal('documentCode');
  const docNumber = docCode === 'P'
    ? (getVal('passportNumber') || getVal('documentNumber'))
    : getVal('documentNumber');

  // Build date from components
  const buildDate = (yField, mField, dField, isExpiry) => {
    let year = getVal(yField);
    const month = getVal(mField);
    const day = getVal(dField);
    if (!year) return null;
    const yy = parseInt(year, 10);
    if (isNaN(yy)) return null;
    if (isExpiry) {
      year = yy >= 60 ? '19' + year : '20' + year;
    } else {
      year = yy > (new Date().getFullYear() % 100) ? '19' + year : '20' + year;
    }
    if (!month) return year;
    if (!day) return `${year}-${month}`;
    return `${year}-${month}-${day}`;
  };

  const sex = getVal('sex');

  return {
    documentNumber: docNumber,
    surname: getVal('primaryIdentifier'),
    givenNames: getVal('secondaryIdentifier'),
    nationality: getVal('nationality'),
    issuingState: getVal('issuingState'),
    sex: sex ? sex.toUpperCase() : null,
    dateOfBirth: buildDate('birthYear', 'birthMonth', 'birthDay', false),
    dateOfExpiry: buildDate('expiryYear', 'expiryMonth', 'expiryDay', true),
  };
}

// ─── Scanbot Decode ─────────────────────────────────────────────────────────────

async function decodeScanbot(dataUrl) {
  const { SDK, mrzEngine } = state.scanbot;
  if (!mrzEngine) throw new Error('Scanbot MRZ engine not initialized.');

  const ImageClass =
    (SDK.Config && SDK.Config.Image) || SDK.Image || (SDK.Core && SDK.Core.Image);
  if (!ImageClass) throw new Error('Scanbot Image class not found.');

  const decStart = performance.now();
  let image;
  if (typeof ImageClass.fromUrl === 'function') {
    image = await ImageClass.fromUrl(dataUrl);
  } else {
    const resp = await fetch(dataUrl);
    const bytes = new Uint8Array(await resp.arrayBuffer());
    image = ImageClass.fromEncodedBinaryData(bytes);
  }
  const imageDecodeMs = performance.now() - decStart;

  try { await mrzEngine.clearResult(); } catch (_) {}

  const scanStart = performance.now();
  const response = await mrzEngine.run(image);
  const scanMs = performance.now() - scanStart;

  const result = response && response.result ? response.result : response;
  const mrzText = (result && result.rawMRZ) || null;
  const document = result ? result.document : null;

  // Extract fields by walking the document tree
  const byName = {};
  (function walk(doc) {
    if (!doc) return;
    for (const f of doc.fields || []) {
      const name = f && f.type && f.type.name;
      if (name && !(name in byName)) byName[name] = f;
    }
    for (const c of doc.children || []) walk(c);
  })(document);

  const textOf = (f) =>
    f && f.value && typeof f.value.text === 'string' && f.value.text.length ? f.value.text : null;
  const parsedOf = (f, type) => {
    if (!f || !Array.isArray(f.parsedData)) return null;
    const p = f.parsedData.find(x => x && x.type === type);
    return p && p.value ? p.value : null;
  };
  const isoDate = (f, isExpiry) => {
    const parsed = parsedOf(f, 'ISO_DATE');
    if (parsed) return parsed;
    const raw = textOf(f);
    if (!raw) return null;
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== 6) return null;
    const yy = parseInt(digits.slice(0, 2), 10);
    const mm = digits.slice(2, 4);
    const dd = digits.slice(4, 6);
    const pivot = new Date().getFullYear() % 100;
    const year = isExpiry ? 2000 + yy : yy <= pivot ? 2000 + yy : 1900 + yy;
    return `${year}-${mm}-${dd}`;
  };

  const fields = {
    documentNumber: textOf(byName['DocumentNumber']),
    surname: textOf(byName['Surname']),
    givenNames: textOf(byName['GivenNames']),
    nationality: textOf(byName['Nationality']),
    issuingState: textOf(byName['IssuingAuthority']),
    sex: textOf(byName['Gender']) || parsedOf(byName['Gender'], 'GENDER'),
    dateOfBirth: isoDate(byName['BirthDate'], false),
    dateOfExpiry: isoDate(byName['ExpiryDate'], true),
  };

  const hasData = !!mrzText || Object.values(fields).some(v => v !== null && v !== undefined && v !== '');
  const success = !!((result && result.success === true) || (document && hasData));

  return { success, mrzText, fields, imageDecodeMs, scanMs, totalMs: imageDecodeMs + scanMs };
}

// ─── Metrics Computation ────────────────────────────────────────────────────────

function computeMatchRate(recognized, truth) {
  const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9<\n]/g, '').replace(/\n/g, '');
  const a = norm(recognized);
  const b = norm(truth);
  if (!a.length && !b.length) return 1.0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1.0;
  let matches = 0;
  for (let i = 0; i < maxLen; i++) {
    if (a[i] === b[i]) matches++;
  }
  return matches / maxLen;
}

function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

function buildSummary(results, images) {
  const total = results.length;
  const successCount = results.filter(r => r.success).length;
  const exactCount = results.filter(r => r.exact_match).length;
  const times = results.map(r => r.scanMs).sort((a, b) => a - b);
  const matchRates = results.map(r => r.match_rate);

  const avgMs = times.reduce((s, t) => s + t, 0) / (total || 1);
  const avgMatch = matchRates.reduce((s, r) => s + r, 0) / (total || 1);
  const totalWall = results.reduce((s, r) => s + r.totalMs, 0);

  return {
    total_images: total,
    success_count: successCount,
    exact_count: exactCount,
    exact_accuracy: exactCount / (total || 1),
    success_rate: successCount / (total || 1),
    average_match_rate: avgMatch,
    avg_ms: avgMs,
    min_ms: times.length ? times[0] : 0,
    max_ms: times.length ? times[times.length - 1] : 0,
    p50_ms: quantile(times, 0.5),
    p95_ms: quantile(times, 0.95),
    p99_ms: quantile(times, 0.99),
    total_wall_ms: totalWall,
  };
}

// ─── Results Rendering ──────────────────────────────────────────────────────────

function renderResults(data) {
  const { vendors, images, hasGroundTruth } = data;
  dom.resultsSection.classList.remove('hidden');

  // Summary cards
  let cardsHtml = '';
  for (const vendor of vendors) {
    const s = vendor.summary;
    cardsHtml += `<div class="vendor-card" style="--vendor-color:${vendor.color}">
      <div class="vendor-card-title">${vendor.name}${vendor.version ? ` <span style="font-size:0.75rem;color:var(--text-secondary)">(${vendor.version})</span>` : ''}</div>
      <div class="metric-grid">
        ${hasGroundTruth ? `<div class="metric-item"><div class="metric-label">Exact Accuracy</div><div class="metric-value">${(s.exact_accuracy * 100).toFixed(2)}%</div><div class="metric-sub">${s.exact_count}/${s.total_images}</div></div>` : ''}
        <div class="metric-item"><div class="metric-label">Success Rate</div><div class="metric-value">${(s.success_rate * 100).toFixed(2)}%</div><div class="metric-sub">${s.success_count}/${s.total_images}</div></div>
        ${hasGroundTruth ? `<div class="metric-item"><div class="metric-label">Avg Match Rate</div><div class="metric-value">${(s.average_match_rate * 100).toFixed(2)}%</div></div>` : ''}
        <div class="metric-item"><div class="metric-label">Avg Time</div><div class="metric-value">${s.avg_ms.toFixed(1)} ms</div><div class="metric-sub">P50: ${s.p50_ms.toFixed(0)} | P95: ${s.p95_ms.toFixed(0)} ms</div></div>
        <div class="metric-item"><div class="metric-label">Min / Max</div><div class="metric-value">${s.min_ms.toFixed(0)} ms</div><div class="metric-sub">Max: ${s.max_ms.toFixed(0)} ms</div></div>
        <div class="metric-item"><div class="metric-label">Total Elapsed</div><div class="metric-value">${(s.total_wall_ms / 1000).toFixed(1)}s</div></div>
      </div>
    </div>`;
  }
  dom.summaryCards.innerHTML = cardsHtml;

  // Comparison chart (only when 2 vendors)
  if (vendors.length > 1) {
    dom.comparisonChart.classList.remove('hidden');
    let chartHtml = '<div class="chart-title">Vendor Comparison</div><div class="bar-chart">';
    const metrics = [];
    if (hasGroundTruth) {
      metrics.push({ label: 'Accuracy', key: 'exact_accuracy', fmt: v => (v * 100).toFixed(1) + '%' });
      metrics.push({ label: 'Match Rate', key: 'average_match_rate', fmt: v => (v * 100).toFixed(1) + '%' });
    }
    metrics.push({ label: 'Avg Time', key: 'avg_ms', fmt: v => v.toFixed(0) + ' ms', invert: true });

    for (const m of metrics) {
      chartHtml += `<div style="margin-bottom:12px"><div style="font-size:0.8rem;font-weight:600;margin-bottom:6px">${m.label}</div>`;
      const values = vendors.map(v => v.summary[m.key]);
      const maxVal = Math.max(...values) || 1;
      for (let i = 0; i < vendors.length; i++) {
        const v = vendors[i];
        const val = v.summary[m.key];
        const pctW = (val / maxVal) * 100;
        chartHtml += `<div class="bar-row">
          <span class="bar-label" style="color:${v.color}">${v.name}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${pctW}%;background:${v.color}">${m.fmt(val)}</div></div>
        </div>`;
      }
      chartHtml += '</div>';
    }
    chartHtml += '</div>';
    dom.comparisonChart.innerHTML = chartHtml;
  } else {
    dom.comparisonChart.classList.add('hidden');
  }

  renderDetailTable(data);
}

function renderDetailTable(data) {
  const { vendors, images, hasGroundTruth } = data;
  const isComparison = vendors.length > 1;

  let html = '<table class="detail-table"><thead><tr>';
  html += '<th>#</th><th>Image</th>';

  if (isComparison) {
    for (const v of vendors) {
      html += `<th style="color:${v.color}">${v.name}</th>`;
      if (hasGroundTruth) html += `<th style="color:${v.color}">Match</th>`;
      html += `<th style="color:${v.color}">Time</th>`;
    }
  } else {
    html += '<th>Status</th>';
    if (hasGroundTruth) html += '<th>Match</th>';
    html += '<th>Time</th><th>Recognized MRZ</th>';
    if (hasGroundTruth) html += '<th>Ground Truth</th>';
  }
  html += '</tr></thead><tbody>';

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    html += `<tr><td>${i + 1}</td><td class="img-path">${escHtml(img.key)}</td>`;

    if (isComparison) {
      for (const v of vendors) {
        const r = v.results[i];
        if (!r) { html += '<td>-</td>'; if (hasGroundTruth) html += '<td>-</td>'; html += '<td>-</td>'; continue; }
        html += `<td>${tagHtml(r.exact_match, r.success)}</td>`;
        if (hasGroundTruth) html += `<td>${(r.match_rate * 100).toFixed(1)}% ${matchBarHtml(r.match_rate)}</td>`;
        html += `<td>${r.scanMs.toFixed(0)} ms</td>`;
      }
    } else {
      const r = vendors[0].results[i];
      html += `<td>${tagHtml(r.exact_match, r.success)}</td>`;
      if (hasGroundTruth) html += `<td>${(r.match_rate * 100).toFixed(1)}% ${matchBarHtml(r.match_rate)}</td>`;
      html += `<td>${r.scanMs.toFixed(0)} ms</td>`;
      const recognized = r.mrzText || '';
      html += `<td class="mrz-text" title="${escHtml(recognized)}">${escHtml(recognized.slice(0, 64))}${recognized.length > 64 ? '...' : ''}</td>`;
      if (hasGroundTruth) {
        const truth = img.truth || '';
        html += `<td class="mrz-text" title="${escHtml(truth)}">${escHtml(truth.slice(0, 64))}${truth.length > 64 ? '...' : ''}</td>`;
      }
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  dom.detailTable.innerHTML = html;
}

// ─── Report Export ──────────────────────────────────────────────────────────────

function exportReport() {
  if (!state.benchmarkResults) return;
  const html = ReportGenerator.generate(state.benchmarkResults);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const vendorNames = state.benchmarkResults.vendors.map(v => v.id).join('_vs_');
  a.download = `mrz_benchmark_${vendorNames}_${Date.now()}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function emptyFields() {
  return {
    documentNumber: null, surname: null, givenNames: null,
    nationality: null, issuingState: null, sex: null,
    dateOfBirth: null, dateOfExpiry: null,
  };
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function tagHtml(exact, success) {
  if (exact) return '<span class="tag tag-pass">PASS</span>';
  if (success) return '<span class="tag tag-miss">MISS</span>';
  return '<span class="tag tag-fail">FAIL</span>';
}

function matchBarHtml(rate) {
  const color = rate >= 0.9 ? '#10b981' : rate >= 0.6 ? '#f59e0b' : '#ef4444';
  return `<span class="match-bar"><span class="match-bar-fill" style="width:${Math.round(rate * 100)}%;background:${color}"></span></span>`;
}

function showLoading(text) {
  dom.loadingText.textContent = text || 'Loading...';
  dom.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  dom.loadingOverlay.classList.add('hidden');
}

function updateProgress(vendorId, current, total) {
  const pctVal = Math.round((current / total) * 100);
  dom.progressLabel.textContent = `${VENDOR_META[vendorId].name}: ${current + 1}/${total}`;
  dom.progressPct.textContent = `${pctVal}%`;
  dom.progressBar.style.width = `${pctVal}%`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
