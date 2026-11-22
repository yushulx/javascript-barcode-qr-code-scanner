(function () {
  'use strict';
  const VERSION = '19.4.4';
  // Match the hosted/license-fallback convention used by other Codepool demos.
  const CODEPOOL_LICENSE_KEY = 'DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAwLTEwMTY0ODQ5MCIsIm1haW5TZXJ2ZXJVUkwiOiJodHRwczovL21sdHMuZHluYW1zb2Z0LmNvbS8iLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMCIsInN0YW5kYnlTZXJ2ZXJVUkwiOiJodHRwczovL3NsdHMuZHluYW1zb2Z0LmNvbS8iLCJjaGVja0NvZGUiOjE0MDA4MDY1Mjl9';
  const TRIAL_LICENSE_KEY = 'DLS2eyJoYW5kc2hha2VDb2RlIjoiMjAwMDAxLTE2NDk4Mjk3OTI2MzUiLCJvcmdhbml6YXRpb25JRCI6IjIwMDAwMSIsInNlc3Npb25QYXNzd29yZCI6IndTcGR6Vm05WDJrcEQ5YUoifQ==';
  const ids = ['connect', 'scanner', 'resolution', 'color', 'feeder', 'duplex', 'driver-ui', 'scan', 'import', 'previous', 'next', 'rotate', 'delete', 'clear', 'zoom-in', 'zoom-out', 'zoom-fit', 'zoom-original', 'zoom-level', 'virtual-setup', 'format', 'save', 'count', 'status', 'viewer'];
  const ui = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  let object = null;
  let devices = [];
  let busy = false;
  let sdkLoading = null;
  let instanceSequence = 0;
  let instanceId = null;
  const analytics = window.DemoAnalytics || { ready() {}, action() {}, start() {}, success() {}, fail() {} };
  const host = window.location.hostname.toLowerCase();
  const isCodepoolHost = host === 'dynamsoft.com' || host.endsWith('.dynamsoft.com');
  const LICENSE = isCodepoolHost ? CODEPOOL_LICENSE_KEY : TRIAL_LICENSE_KEY;
  if (!isCodepoolHost) {
    console.info('[Web TWAIN Scanner] Using the public trial license outside dynamsoft.com.');
    analytics.action('license_fallback', { host: window.location.hostname });
  }

  function status(message, error = false) {
    ui.status.textContent = message;
    ui.status.dataset.error = String(error);
  }

  function update() {
    const count = object ? object.HowManyImagesInBuffer : 0;
    const index = object ? object.CurrentImageIndexInBuffer : -1;
    ui.count.textContent = count ? `Page ${index + 1} of ${count}` : '0 pages';
    ui.connect.disabled = busy;
    ui.scanner.disabled = busy || !devices.length;
    ui.scan.disabled = busy || !object || !devices.length || ui.scanner.value === '';
    ui.import.disabled = busy || !object;
    ['resolution', 'color', 'feeder', 'duplex', 'driver-ui', 'format'].forEach(id => { ui[id].disabled = busy; });
    ['rotate', 'delete', 'clear', 'save', 'zoom-in', 'zoom-out', 'zoom-fit', 'zoom-original'].forEach(id => { ui[id].disabled = busy || !count; });
    ui['zoom-level'].textContent = count ? `${Math.round(object.Viewer.zoom * 100)}%` : '—';
    ui.previous.disabled = busy || count < 2 || index <= 0;
    ui.next.disabled = busy || count < 2 || index >= count - 1;
    ui.viewer.setAttribute('aria-busy', String(busy));
  }

  async function run(message, task) {
    if (busy) return;
    busy = true;
    status(message);
    update();
    try { await task(); }
    catch (error) {
      const detail = typeof error === 'string' ? error : (error.message || error.string || String(error));
      status(detail + ' Check the local service, scanner driver and license, then retry.', true);
      // Only a category is logged; SDK error strings can contain local paths.
      analytics.fail('document', 'scanner');
    } finally { busy = false; update(); }
  }

  function loadSDK() {
    if (window.Dynamsoft && window.Dynamsoft.DWT) return Promise.resolve();
    if (sdkLoading) return sdkLoading;
    sdkLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => fail(), 45000);
      function fail() {
        clearTimeout(timer);
        script.remove();
        sdkLoading = null;
        reject(new Error('The scanner SDK could not load. Check your network connection.'));
      }
      script.src = `https://cdn.jsdelivr.net/npm/dwt@${VERSION}/dist/dynamsoft.webtwain.min.js`;
      script.onload = () => {
        clearTimeout(timer);
        if (!window.Dynamsoft || !window.Dynamsoft.DWT) { fail(); return; }
        resolve();
      };
      script.onerror = fail;
      document.head.appendChild(script);
    });
    return sdkLoading;
  }

  function createObject() {
    return new Promise((resolve, reject) => {
      const dwt = window.Dynamsoft.DWT;
      const id = `codepoolScanner${++instanceSequence}`;
      instanceId = id;
      let finished = false;
      const timer = setTimeout(() => {
        finished = true;
        dwt.DeleteDWTObject(id);
        reject(new Error('Connection timed out. Install or restart the local service and click Connect again.'));
      }, 45000);
      dwt.ResourcesPath = `https://cdn.jsdelivr.net/npm/dwt@${VERSION}/dist/`;
      dwt.ServiceInstallerLocation = `https://unpkg.com/dwt@${VERSION}/dist/dist/`;
      dwt.ProductKey = LICENSE;
      dwt.AutoLoad = false;
      dwt.Containers = [];
      dwt.UseLocalService = true;
      dwt.CreateDWTObjectEx({ WebTwainId: id }, instance => {
        if (finished) { dwt.DeleteDWTObject(id); return; }
        finished = true;
        clearTimeout(timer);
        resolve(instance);
      }, error => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  function callbackTask(start) {
    return new Promise((resolve, reject) => start(resolve, (code, message) => reject(new Error(message || String(code)))));
  }

  ui.connect.addEventListener('click', () => run('Connecting to the local scanning service…', async () => {
    const start = Date.now();
    await loadSDK();
    if (!object) {
      const instance = await createObject();
      try {
        if (instance.Viewer.bind(ui.viewer) === false) throw new Error('Could not initialize document preview.');
        instance.Viewer.width = '100%';
        instance.Viewer.height = '100%';
        instance.Viewer.singlePageMode = true;
        instance.Viewer.zoomOrigin = { x: 'center', y: 'center' };
        instance.Viewer.cursor = 'pointer';
        instance.Viewer.show();
        const thumbnails = instance.Viewer.createThumbnailViewer({
          location: 'left', size: '26%', columns: 1, rows: 3,
          scrollDirection: 'vertical', pageMargin: 10,
          background: '#f5f5f5', border: '1px solid #ddd',
          allowKeyboardControl: true, allowPageDragging: false,
          selectedPageBorder: '2px solid #fe8e14',
          selectedPageBackground: '#fff3e5'
        });
        thumbnails.show();
        thumbnails.on('click', event => {
          if (busy || !Number.isInteger(event.index) || event.index < 0 || event.index >= instance.HowManyImagesInBuffer) return;
          instance.CurrentImageIndexInBuffer = event.index;
          update();
        });
        thumbnails.on('keydown', () => setTimeout(update, 0));
        instance.Viewer.on('click', () => setTimeout(update, 0));
        instance.Viewer.on('keydown', () => setTimeout(update, 0));
        instance.Viewer.on('pageRendered', update);
        instance.Viewer.on('resize', () => setTimeout(update, 0));
      } catch (error) {
        window.Dynamsoft.DWT.DeleteDWTObject(instanceId);
        throw error;
      }
      object = instance;
      const empty = document.getElementById('empty');
      if (empty) empty.remove();
      analytics.ready(Date.now() - start);
    }
    // Clear stale selections even if enumeration fails after a disconnected device.
    devices = [];
    ui.scanner.replaceChildren();
    devices = await object.GetDevicesAsync(undefined, true);
    ui['virtual-setup'].open = devices.length === 0;
    devices.forEach((device, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = device.displayName || device.name || `Scanner ${index + 1}`;
      ui.scanner.appendChild(option);
    });
    status(devices.length ? `Connected. ${devices.length} scanner(s) available.` : 'Service connected. No scanners found. Install a virtual scanner using the links on the left, then refresh, or import images to try the preview and export tools.');
  }));

  ui.scan.addEventListener('click', () => run('Scanning… Finish or cancel in the scanner dialog.', async () => {
    const device = devices[Number(ui.scanner.value)];
    if (!device) throw new Error('Select a scanner first.');
    const before = object.HowManyImagesInBuffer;
    analytics.start('document', 'scanner');
    await object.SelectDeviceAsync(device);
    await object.AcquireImageAsync({
      IfShowUI: ui['driver-ui'].checked,
      IfCloseSourceAfterAcquire: true,
      IfFeederEnabled: ui.feeder.checked,
      IfDuplexEnabled: ui.feeder.checked && ui.duplex.checked,
      PixelType: Number(ui.color.value),
      Resolution: Number(ui.resolution.value)
    });
    const added = object.HowManyImagesInBuffer - before;
    status(added ? `Scanned ${added} page(s). Review the pages before saving.` : 'No pages added. Load paper and try again.');
    if (added) analytics.success('document', 'scanner', { page_count: added });
  }));

  ui.import.addEventListener('change', () => {
    const files = Array.from(ui.import.files || []);
    if (!files.length) return;
    return run('Adding images…', async () => {
      try {
        for (const file of files) await callbackTask((success, failure) => object.LoadImageFromBinary(file, success, failure));
        status(`Added ${files.length} image file(s).`);
      } finally { ui.import.value = ''; }
    });
  });

  function edit(id, operation) {
    ui[id].addEventListener('click', () => run('Updating pages…', async () => {
      if (operation() === false) throw new Error(object.ErrorString || 'Could not update the page.');
      status('Pages updated.');
    }));
  }
  edit('previous', () => { object.CurrentImageIndexInBuffer -= 1; });
  edit('next', () => { object.CurrentImageIndexInBuffer += 1; });
  edit('rotate', () => object.RotateRight(object.CurrentImageIndexInBuffer));
  edit('delete', () => object.RemoveImage(object.CurrentImageIndexInBuffer));
  edit('clear', () => object.RemoveAllImages());

  function zoom(id, operation) {
    ui[id].addEventListener('click', () => {
      if (busy || !object || !object.HowManyImagesInBuffer) return;
      operation(object.Viewer);
      update();
    });
  }
  zoom('zoom-in', viewer => { viewer.zoom = Math.min(65, viewer.zoom * 1.25); });
  zoom('zoom-out', viewer => { viewer.zoom = Math.max(0.02, viewer.zoom / 1.25); });
  zoom('zoom-fit', viewer => viewer.fitWindow());
  zoom('zoom-original', viewer => { viewer.zoom = 1; });

  ui.save.addEventListener('click', () => run('Preparing your download…', async () => {
    const format = ui.format.value;
    const types = window.Dynamsoft.DWT.EnumDWT_ImageType;
    const type = { pdf: types.IT_PDF, tiff: types.IT_TIF, png: types.IT_PNG }[format];
    const indices = format === 'png' ? [object.CurrentImageIndexInBuffer] : Array.from({ length: object.HowManyImagesInBuffer }, (_, i) => i);
    const blob = await callbackTask((success, failure) => object.ConvertToBlob(indices, type, success, failure));
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `scanned-document.${format === 'tiff' ? 'tif' : format}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    analytics.action('download', { format, page_count: indices.length });
    status('Download prepared. Your documents have not been uploaded.');
  }));
  update();
})();
