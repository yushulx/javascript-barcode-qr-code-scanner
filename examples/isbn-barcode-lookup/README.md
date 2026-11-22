# Free Online ISBN Barcode Lookup

Hosted at `https://www.dynamsoft.com/codepool/demos/isbn-barcode-lookup/`.

Decodes the Bookland EAN-13 on a book cover with Dynamsoft Barcode Reader
(JS), then runs a local analysis (ISBN-13 check digit, ISBN-10 mod-11 check
with the X digit, ISBN-10 ↔ ISBN-13 conversion, registration group) and looks
the book up in Open Library (Internet Archive) first and Google Books as
fallback. Open Library's `/isbn/{code}.json` endpoint sends CORS headers
through its redirect chain; its `search.json` endpoint does not, and author
names need one extra request per author.

## Layout

- `index.html` — full head set (GTM, JSON-LD WebApplication, og tags, canonical).
  Bump every `?v=` token on any asset change; the site serves 24h caching.
- `app.js` — license selection (Codepool key bound to dynamsoft.com, public
  trial key as the single fallback everywhere else), decoding, ISBN analysis,
  book lookup, rendering. The bundled sample in
  `sample-images/isbn13-clean-code.png` is decoded automatically on page load.
- `sample-images/` — back-cover barcodes of real books present in Open
  Library, so every sample demonstrates a successful lookup end to end.

A non-book EAN-13 (not starting 978/979) is reported as such and cross-links
to the UPC barcode lookup demo.

## Self-hosting

The hosted page is free because of the domain-bound Codepool license. Cloning
and serving these files anywhere else activates the SDK trial key instead, and
running your own deployment requires your own Dynamsoft license.
