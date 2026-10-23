# Barcode Structure Diagram

An interactive, annotated structure diagram of five barcode symbologies. Hover
or tab through any region of a symbol and the page tells you what that region
is, how many modules it occupies and what would break if it were missing — then
type any value and watch it become a module sequence, live.

**Live demo:** https://www.dynamsoft.com/codepool/demos/barcode-structure/

The page is a self-contained explainer. It has no CDN, no image files, no
barcode library and no build step: the symbols are encoded in the browser by
`barcode-1d.js` and `barcode-qr.js`, which ship with the page.

## Why this exists

"How does a barcode work" is a question with a large, stable search volume, and
the answers are almost all prose next to a static picture. A picture cannot show
that EAN-13's 13th digit is carried by the *parity* of the other six, or that
Code 128's check value is a full 11-module character rather than a digit. A
diagram whose regions can be interrogated, next to the actual module sequence,
can.

The second half of the idea is that the explanation is generated rather than
transcribed. Every count, pattern and arithmetic step shown on the page is read
back out of the encoder result that drew the picture, so the two cannot drift
apart: if the encoder is wrong, the page is visibly wrong with it.

## What is in the directory

| File | What it is |
|---|---|
| `index.html` | The page: markup, metadata, JSON-LD (`WebApplication` + `FAQPage`) |
| `styles.css` | Styles. Follows the Dynamsoft style guide; adds the diagram and panel components |
| `app.js` | Diagram rendering, interaction, the region/character/check panels |
| `barcode-1d.js` | Linear encoders (EAN-13, Code 128, Code 39, ITF-14) that return the module sequence **and its structure** |
| `barcode-qr.js` | QR Code encoder (ISO/IEC 18004) that returns the module matrix **and every structural region** |
| `thumbnail.png` | Card image for `demos/index.html` |
| `_tests/` | Everything that proves the above works — see below |
| `_research/` | The verified fact sheet the page copy was written from, with sources |

## The data model

Both encoders return the same shape, which is what makes one renderer able to
draw every symbology:

- **`modules`** — the black/white module sequence (1D) or `matrix` (2D).
- **`groups` / `components`** — the structural regions, each carrying the
  modules it owns, a title, a role, a one-sentence description and a longer
  explanation.
- **`ROLES`** — the symbology-independent vocabulary (quiet zone, guard, start,
  data, check, stop, pair, bearer). One colour per role, shared by every
  symbology, so "teal means a guard pattern" holds across the whole page.

`app.js` never hard-codes a module count. It asks the encoded artifact.

## Running it

Any static server will do, because the page has no build step:

```sh
python -m http.server 4173
# then open http://127.0.0.1:4173/demos/barcode-structure/
```

## Tests

Every check below runs from the repository root.

```sh
# QR encoder: ISO/IEC 18004 vectors, an independent decoder in the test file,
# 160 version/level symbols compared against python-qrcode
node --test demos/barcode-structure/_tests/barcode-qr.test.cjs

# 1D encoders: module-for-module against bwip-js where the reference agrees,
# and against the published symbology tables everywhere else
node demos/barcode-structure/_tests/crosscheck-bwip.cjs

# The page itself, in headless Chrome: sweeps all five symbologies, exercises
# selection, keyboard, the error path, the QR level switch and the module
# readout, and fails on any console error from the page's own files
node demos/barcode-structure/_tests/verify-browser.cjs

# Regenerate the card image from the live page
node demos/barcode-structure/_tests/make-thumbnail.cjs
```

`verify-browser.cjs` and `make-thumbnail.cjs` need a static server running and a
Chrome or Edge binary (`CHROME_PATH` overrides discovery). `crosscheck-bwip.cjs`
fetches bwip-js to a scratch directory outside the demo — the demo itself stays
dependency-free — and still runs its published-table checks without it.

## Where the encoders disagree with the reference, and why

These are findings from the verification, not caveats bolted on afterwards. Each
one is asserted explicitly in `crosscheck-bwip.cjs` so that a future change
cannot quietly paper over it.

1. **bwip-js's `interleaved2of5` encodes a different number from the one it was
   given.** Six digits come back as four digit pairs; fourteen digits as eight.
   The element stream is a valid symbol, but it is not the value that was
   supplied, so it cannot be a reference for a GS1 ITF-14. ITF is therefore
   verified by decoding the encoder's output back through the published
   wide-position table — the same table a real decoder uses.

2. **bwip-js computes a different EAN-13 check digit on some payloads.** For
   `400638133393` it wants 1; both published ways of writing the GS1 weighting
   (3,1,3… from the left, or 1,3,1… from the right) give 7, and the two agree on
   every even-length payload. The module comparison runs on the codes where the
   check digit is not in dispute, and the disagreement is recorded as its own
   assertion.

3. **The two encoders pick different Code 128 code sets** for
   `ABC123456789`. Both are legal — the standard does not prescribe a selection
   algorithm — and the encoder's choice is one symbol character shorter. The
   test asserts the properties that matter (where the switch happens, that it
   pays off) rather than comparing modules.

## Scope

This is an explainer, not a certified encoder. It implements the parts of each
symbology that make its structure visible and checkable: the module patterns,
the character tables, the check-value arithmetic and the QR placement rules. It
does not implement UPC/EAN add-ons, the Code 128 FNC1–4 function characters for
GS1 application identifiers, Code 39 full-ASCII escapes, or QR modes beyond
numeric, alphanumeric and byte.

The wide:narrow ratio for Code 39 and ITF is drawn at 3:1 because a module grid
can only draw whole modules; both symbologies permit a range, so another tool's
symbol for the same value may be narrower and is equally correct.

## Licence

Same as the rest of the repository. The page runs entirely client side and needs
no license key; reading real symbols with a camera or an image is what the
[online barcode scanner](https://www.dynamsoft.com/codepool/demos/barcode-scanner/) is for.
