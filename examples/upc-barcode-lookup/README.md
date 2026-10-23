# Free Online UPC Barcode Lookup

Hosted at `https://www.dynamsoft.com/codepool/demos/upc-barcode-lookup/`.

Decodes UPC-A, UPC-E, EAN-13 and EAN-8 with Dynamsoft Barcode Reader (JS), then
runs a local analysis (check digit, UPC-E expansion, GS1 prefix region) and
queries the open product databases — Open Food Facts first, then Open Products
Facts, both CORS-open and keyless. UPCitemdb was the original tool's database
but only sends CORS headers to its own origin, so a browser page cannot use it.

## Layout

- `index.html` — full head set (GTM, JSON-LD WebApplication, og tags, canonical).
  Bump every `?v=` token on any asset change; the site serves 24h caching.
- `app.js` — license selection (Codepool key bound to dynamsoft.com, public
  trial key as the single fallback everywhere else), decoding, analysis,
  lookup, rendering. The bundled sample in `sample-images/ean13-nutella.png`
  is decoded automatically on page load.
- `sample-images/` — real retail barcodes whose products exist in Open Food
  Facts, so every sample demonstrates a successful lookup end to end.

## Self-hosting

The hosted page is free because of the domain-bound Codepool license. Cloning
and serving these files anywhere else activates the SDK trial key instead, and
running your own deployment requires your own Dynamsoft license.
