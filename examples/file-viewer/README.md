# File Viewer

A browser-side file inspector and viewer: drop a file and see what it actually
is — size, real type, dimensions, DPI, EXIF, page count, a locally computed
SHA-256 — and then read the content, page by page where the format has pages.

No SDK, no build step, no server. Open `index.html` from a local web server and
it runs.

## Online demo

https://www.dynamsoft.com/codepool/demos/file-viewer/

## Run it

```bash
cd examples/file-viewer
python -m http.server 8000
# open http://localhost:8000/
```

Serving over `http://` matters twice: the sample files are fetched with
`fetch()`, and `crypto.subtle` (used for the SHA-256) is only exposed in a
secure context, which includes `localhost`.

## What it reads

| Family | Formats | What you get |
| --- | --- | --- |
| Images | JPEG, PNG, GIF, WebP, AVIF, BMP, ICO, SVG, HEIC (header only) | Dimensions and megapixels parsed from the header, so HEIC still reports its size when the browser cannot decode it. JPEG and TIFF also get the full EXIF table: camera, lens, exposure, orientation, GPS |
| TIFF | TIF, TIFF | One page per IFD, with compression, bit depth and resolution |
| PDF | PDF | Rendered with pdf.js, page size in points, PDF version from the header, producer and dates from the document info |
| Office | DOCX, XLSX, PPTX | Word sections, spreadsheet sheets (split into 40-row blocks) and presentation slides each become a page |
| Text | TXT, MD, LOG, JSON, XML, CSV, TSV | Encoding detected (UTF-8, UTF-16, GBK, cp1252), line numbers, JSON pretty-printed, CSV/TSV as a table |
| Video / audio | MP4, WebM, MOV, M4V, MP3, WAV, OGG | Duration, resolution, aspect ratio, then the browser's own decoder |
| Raw frames | YUV, NV21, NV12, I420, YV12 | Android camera dumps: pixel format, width, height and row stride are yours to set, and the frame count follows from the file size |
| Anything else | — | Metadata only. The container is reported from its magic bytes and no fake preview is drawn |

## Design notes

**Content beats the extension.** The type is decided from magic bytes first.
A `.jpg` that starts with `%PDF-` is reported as a PDF and the mismatch is
called out in the details panel. DOCX, XLSX and PPTX all begin with the same
`PK\x03\x04`, so the ZIP is opened and the parts decide which one it is. Raw
YUV is the one case where the extension has to win: there is no signature to
read.

**Parsers load on demand.** pdf.js, UTIF, SheetJS, JSZip and docx-preview are
injected the first time a file needs them. Opening a JPEG downloads none of
them; opening a 900 KB spreadsheet does not download a PDF engine.

**Page state is per file, and it means something.** PDF pages, TIFF IFDs, Word
sections, spreadsheet sheets and presentation slides are all real divisions of
the file. Excel rows are additionally split into blocks of 40 so that the page
control is not a no-op on a 10,000-row sheet.

**Raw YUV is the part that earns its keep when debugging.** A frame dumped from
`onPreviewFrame` or an `ImageReader` has no header at all — no width, no height,
no pixel format, no idea whether you have one frame or forty. The viewer guesses
from the file size against common capture sizes, then lets you correct it.
Choosing the wrong 4:2:0 layout does not throw an error; it turns the frame
green and purple, which is exactly the symptom being chased.

## Scope and limitations

- **Office rendering is a reconstruction.** Fonts are substituted, complex
  layouts reflow, and SmartArt or charts arrive as empty frames. Word pages come
  from the document's own section properties and page breaks.
- **Formulas are not recalculated.** Cells are shown as stored; a formula
  without a cached result reads as empty, because there is no spreadsheet engine
  in the page.
- **Video depends on the browser's codecs.** A duration can be read from a MOV
  the browser then refuses to play (HEVC, ProRes).
- **HEIC/HEIF is metadata only.** The header gives the dimensions; the pixels
  are not decoded here.
- **Raw YUV has no metadata.** The first frame is a guess until width and height
  are set, and row padding (stride) has to be typed in when the capture buffer
  has it.
- **Nothing is verified.** The SHA-256 proves the bytes you dropped in are the
  bytes being hashed; it says nothing about where the file came from.
- **Size caps.** PDF over 150 MB, text over 8 MB and Office over 60 MB are
  refused or truncated, with a note in the preview.

## Third-party code

| Library | Used for | Licence |
| --- | --- | --- |
| [pdf.js](https://mozilla.github.io/pdf.js/) | PDF parsing and rendering | Apache-2.0 |
| [UTIF.js](https://github.com/photopea/UTIF.js) | TIFF decoding | MIT |
| [SheetJS](https://sheetjs.com/) | XLSX cell extraction | Apache-2.0 |
| [docx-preview](https://github.com/VolodymyrBaydalka/docxjs) | DOCX → paginated HTML | Apache-2.0 |
| [JSZip](https://stuk.github.io/jszip/) | OOXML containers | MIT |

The EXIF reader, the PPTX renderer and the YUV conversion are in `app.js` with
no dependencies, so every number in the details panel can be traced back to the
bytes being read.

## Sample files

`samples/` holds one example per supported family, all generated by
`_scripts/build_file_viewer_samples.py` in the Codepool repository: a JPEG with
a full EXIF block (including GPS), a three-page TIFF, a four-page PDF, a
three-section DOCX, a two-sheet XLSX, a four-slide PPTX, CSV, JSON, TXT, SVG,
PNG, a two-frame NV21 dump, a short MP4 and a binary blob.
