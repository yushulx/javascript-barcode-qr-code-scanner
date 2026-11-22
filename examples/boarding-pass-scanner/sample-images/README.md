# Sample images

Seven boarding pass images with known payloads, produced by the
[boarding pass generator](../../boarding-pass-generator/) so that every value below is
exactly what the generator encoded. Use them to check that a scanner returns what the
pass actually says.

All of them are **synthetic test data**, stamped SPECIMEN, and are not travel
documents.

## Expected results

| File | Symbol | Passenger | PNR | Route | Flight | Date | Seat | Seq | BCBP |
|---|---|---|---|---|---|---|---|---|---|
| `printed-pdf417.png` | PDF417 | DOE/JOHN | ABC123 | SEA → SFO | UA 1234 | 18 Sep 2026 | 18A | 42 | v6 |
| `mobile-pdf417.png` | PDF417 | NAKAMURA/AMARA | QM4T7P | LHR → JFK | BA 117 | 18 Sep 2026 | 2A | 17 | v6 |
| `two-leg-pdf417.png` | PDF417 | OKAFOR/OMAR | ZP8K2M | FRA → SIN → SYD | LH 778, LH 822 | 18 Sep 2026 | 32C, 41F | 88 | v6 |
| `barcode-pdf417.png` | PDF417 | SILVA/PRIYA | RT5Y8N | AMS → BCN | DL 2043 | 18 Sep 2026 | 14B | 55 | v7 |
| `barcode-qrcode.png` | QR Code | TANAKA/MEI | WQ3E6R | AMS → BCN | SQ 2043 | 18 Sep 2026 | 25D | 55 | v7 |
| `barcode-datamatrix.png` | Data Matrix | MOREAU/CLARA | LK7H4V | AMS → BCN | AF 2043 | 18 Sep 2026 | 9F | 55 | v7 |
| `barcode-azteccode.png` | Aztec Code | PETROV/JONAS | BN2X9C | AMS → BCN | KL 2043 | 18 Sep 2026 | 31A | 55 | v7 |

The four `barcode-*` images are bare symbols with no pass artwork, which makes them the
simplest check that a raw symbol decodes. The other three are full pass renderings and
test that a scanner finds a symbol inside a larger layout.

## Payloads

### `printed-pdf417.png`

```text
M1DOE/JOHN            EABC123 SEASFOUA 1234 261Y018A0042 147>6181WW6261BUA 001412345600229016            UA UA UA1234567        2PC
```

Carries a baggage tag (`0014123456002`), frequent flyer `UA1234567`, free baggage `2PC`,
check-in source `W`, issue date `6261` and passenger description `1` (male).

### `two-leg-pdf417.png`

```text
M2OKAFOR/OMAR         EZP8K2M FRASINLH 0778 261Y032C0088 13A>60B1KK6261BLH 29220            LH LH LH11223344       2PCZP8K2M SINSYDLH 0822 261Y041F0088 11412220            LH
```

The interesting one: 175 characters, two legs, and the second leg repeats the
35-character mandatory block with its own route, flight, seat and sequence. Note that
the PNR appears on both legs and the `2PC` baggage allowance does **not** — item 118 is
per leg, so leg 2 carries only `LH` in its repeated block.

### `barcode-datamatrix.png`

```text
M1MOREAU/CLARA        ELK7H4V AMSBCNAF 2043 261Y009F0055 13A>70B1WW6261BAF 29057            AF AF AF55443322       2PC
```

Version 7, which is when the standard allowed Data Matrix for a printed pass.

## Regenerating

These are generated, not drawn by hand. Reproduce them from the
[generator](../../boarding-pass-generator/) by entering the values in the table above,
or re-run the generator's own sample-data button for a different set.
