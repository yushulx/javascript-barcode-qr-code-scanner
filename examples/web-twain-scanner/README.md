# Web TWAIN document scanner

Static Codepool demo using Dynamic Web TWAIN 19.5.0. Connect is explicit; SDK and local-service initialization happen only when the visitor clicks it. Uses the same domain-bound Codepool demo license as the other demos on `dynamsoft.com` and its subdomains. Other hosts use the SDK public trial license and report a `license_fallback` analytics event. Self-hosted production integrations need their own Web TWAIN license.

The visitor needs a desktop browser, Dynamic Web TWAIN local service and a scanner driver for acquisition. Image import, rotation and export require the local service but do not require scanner hardware. No upload endpoint is configured. SDK licensing and shared demo analytics use network services; documents are not sent to them.

Features: refresh devices, resolution and color settings, feeder/duplex/driver UI options, a synchronized SDK thumbnail strip and current-page preview, rotation/deletion, PDF/TIFF all-page export and PNG current-page export. PDF import is intentionally not offered because it needs the separate rasterizer add-on.

Visitors without hardware can download prebuilt virtual-scanner installers for Windows, macOS and Linux from the `yushulx/virtual-scanner` v1.0.7 release, linked in the setup panel. Every package bundles 11 sample images: flatbed scans cycle through them one picture per job and an ADF job returns the whole set as one multi-page document, so scanning works right after installation. Platform setup guides and a refresh/select/scan checklist are visible alongside the device picker. Virtual devices still require the local Web TWAIN service.

Desktop panels have equal heights; the preview viewer flexes to fill the space between one compact grouped toolbar and the export/status controls. Narrow screens stack the panels and allow horizontal scrolling of the single toolbar. Instructions are available through Help. Virtual-scanner setup is collapsed initially and opens when no scanner is found. The preview offers zoom in/out, fit-to-window and actual size, a percentage readout, and drag-to-pan through the SDK viewer; zoom changes display scale only, not exported image resolution.

Run the mocked integration checks with `node _scripts/test_web_twain_scanner.cjs`. Hardware acceptance: install the service, connect a real TWAIN/WIA/ICA/SANE scanner, test flatbed and supported feeder/duplex options, cancel a scan, disconnect/reconnect, and open each downloaded format. These hardware checks cannot be established by mocked tests.
