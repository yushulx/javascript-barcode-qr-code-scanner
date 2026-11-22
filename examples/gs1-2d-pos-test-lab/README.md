# GS1 2D Retail POS Test Lab

A single-canvas 2D checkout game for EAN-13 and GS1 Digital Link QR codes. A
package moves along a conveyor into a scanner; the POS terminal shows the reads,
the normalized GTIN and the rule behind every cart decision.

The lesson is the one that breaks during a GS1 2D rollout: **de-duplicate reads
from one package presentation, never de-duplicate a GTIN across the basket**.

[Hosted demo](https://www.dynamsoft.com/codepool/demos/gs1-2d-pos-test-lab/)

## What it demonstrates

- **Level 1:** EAN-13 alone produces one cart unit.
- **Level 2:** a GS1 Digital Link QR alone resolves the same GTIN.
- **Level 3:** matching EAN-13 and QR reads from one package produce one logical
  checkout acknowledgement.
- **Level 4:** two separate packages with the same GTIN produce two units. A
  permanent GTIN cache would wrongly block the second one.
- **Level 5:** two different valid GTINs on one package produce `needs review`,
  not a silent choice.
- **Free sandbox:** cycle product, carrier, QR payload and fixture data on the
  canvas.
- **Real Decode:** render the label to an image and submit the actual pixels to
  Dynamsoft Capture Vision Router. A failed read remains `NO_RESULT`.

The package's EAN-13 and QR are real rendered symbols. Prices come from a local
synthetic catalog; they are not encoded in the barcode.

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell, Canvas element and accessible controls |
| `canvas-renderer.js` | All game scenery, typography, animation and hit regions |
| `app.js` | State machine, pointer/keyboard input, scenarios, reports |
| `pos-engine.js` | Pure GTIN normalization, Digital Link parsing and presentation rules |
| `fixtures.js` / `fixtures.json` | Synthetic catalog and five-scenario oracle |
| `barcode-renderer.js` | EAN-13 and QR rendering with bwip-js |
| `sdk-decoder.js` | Lazy Dynamsoft Capture Vision image decoder |
| `test-pos-engine.cjs` | 18 domain/static checks |
| `test-sdk-decoder.cjs` | SDK adapter contract test with a mocked router |

## Run locally

From this directory:

```bash
python -m http.server 8000
```

Open `http://localhost:8000/`. Simulation needs no SDK license. Real Decode
lazy-loads `dynamsoft-capture-vision-bundle@3.6.5000`; outside `dynamsoft.com`
it falls back to the public trial key, and a trial failure is reported in the
interface instead of being converted to a successful scan.

## Controls

- Click **Scan Item**, press <kbd>Space</kbd>, or drag the pack into the scanner.
- <kbd>1</kbd>–<kbd>5</kbd>: guided levels.
- <kbd>R</kbd>: repeat the same presentation (deliberately no second unit).
- <kbd>G</kbd>/<kbd>B</kbd>/<kbd>D</kbd>: Guided / Sandbox / SDK mode.
- <kbd>M</kbd>: reduced motion. <kbd>?</kbd>: reopen the briefing.

The Canvas is keyboard focusable and screen-reader controls mirror every canvas
action. Its accessible label reports the current level, cart and last POS
decision.

## Tests

```bash
node test-pos-engine.cjs
node test-sdk-decoder.cjs
```

The adapter test uses a mocked router to verify result mapping and empty-result
handling. Live SDK verification requires a valid licensed deployment.

## Limits

This is a teaching simulator, not GS1 certification, a print-quality verifier or
a production POS grouping algorithm. The browser knows package identity only
because the simulation supplies presentation IDs. A real camera deployment needs
explicit trigger, spatial, timing, operator and hardware design.

## Licensing

Dynamsoft Capture Vision requires a license. Get a
[30-day free trial](https://www.dynamsoft.com/customer/license/trialLicense/?product=dcv&package=cross-platform).
The simulation and barcode renderer themselves use no SDK and need no key.

## Related examples

- [GS1 Barcode Scanner](../gs1-barcode-scanner/)
- [GS1 Barcode Generator](../gs1-generator/)
