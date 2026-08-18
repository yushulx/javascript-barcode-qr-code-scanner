#!/usr/bin/env python3
"""Recreate barcode-benchmark-js-report.png in the original HTML-report screenshot style."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


WIDTH = 1249
HEIGHT = 1480
BG = (245, 247, 250)
INK = (23, 32, 51)
MUTED = (96, 112, 138)
LINE = (219, 226, 234)
WHITE = (255, 255, 255)
NAVY = (16, 38, 73)
BLUE = (23, 105, 224)
TEAL = (0, 164, 149)
AMBER = (240, 162, 2)
AMBER_BG = (255, 248, 230)
TABLE_HEAD = (237, 243, 250)


def font(size, bold=False):
    names = ["seguisb.ttf" if bold else "segoeui.ttf", "arialbd.ttf" if bold else "arial.ttf"]
    for name in names:
        path = Path("C:/Windows/Fonts") / name
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius, fill=fill, outline=outline, width=width)


def wrap(draw, text, fnt, max_width):
    words = text.split()
    lines, current = [], ""
    for word in words:
        trial = word if not current else current + " " + word
        if draw.textbbox((0, 0), trial, font=fnt)[2] <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def card(draw, x, y, w, h):
    rounded(draw, (x, y, x + w, y + h), 14, WHITE, LINE, 1)


def main() -> None:
    image = Image.new("RGB", (WIDTH, HEIGHT), BG)
    draw = ImageDraw.Draw(image)

    # Header
    for x in range(WIDTH):
        t = x / (WIDTH - 1)
        if t < 0.62:
            u = t / 0.62
            color = tuple(int(NAVY[i] * (1 - u) + BLUE[i] * u) for i in range(3))
        else:
            u = (t - 0.62) / 0.38
            color = tuple(int(BLUE[i] * (1 - u) + TEAL[i] * u) for i in range(3))
        draw.line((x, 0, x, 198), fill=color)
    title = font(42, True)
    draw.text((52, 52), "zxing-wasm vs. Dynamsoft", font=title, fill=WHITE)
    draw.text((52, 102), "Barcode Reader JavaScript", font=title, fill=WHITE)
    draw.text((52, 158), "BarBeR public dataset decoding benchmark. Exact payload and canonical format are scored. Localization geometry is not scored.", font=font(15), fill=(230, 240, 255))

    y = 222
    # Results
    card(draw, 28, y, WIDTH - 56, 214)
    draw.text((52, y + 22), "Full benchmark results", font=font(24, True), fill=INK)
    results = [
        ("dynamsoft-dbr-js", "90.8%", "7637/8411 exact, mean 127.0 ms"),
        ("zxing-wasm", "70.8%", "5958/8411 exact, mean 121.7 ms"),
    ]
    for i, (name, metric, note) in enumerate(results):
        x = 52 + i * 572
        rounded(draw, (x, y + 68, x + 548, y + 190), 11, WHITE, LINE, 1)
        draw.text((x + 22, y + 82), name, font=font(16, True), fill=INK)
        draw.text((x + 22, y + 112), metric, font=font(40, True), fill=INK)
        draw.text((x + 22, y + 160), note, font=font(14), fill=MUTED)

    y += 236
    # Dataset audit
    card(draw, 28, y, WIDTH - 56, 292)
    draw.text((52, y + 22), "Dataset audit", font=font(24, True), fill=INK)
    audit = [
        ("8,748", "original images"),
        ("9,818", "original annotations"),
        ("853", "images without reliable\nground truth"),
        ("1", "exact duplicate image"),
        ("7,894", "final unique images"),
        ("8,615", "final ground truth\nbarcodes"),
        ("15,788", "decoder records"),
    ]
    for i, (metric, label) in enumerate(audit):
        col, row = i % 5, i // 5
        x = 52 + col * 228
        yy = y + 68 + row * 104
        rounded(draw, (x, yy, x + 214, yy + 92), 11, WHITE, LINE, 1)
        draw.text((x + 16, yy + 10), metric, font=font(28, True), fill=INK)
        for j, line in enumerate(label.split("\n")):
            draw.text((x + 16, yy + 48 + j * 16), line, font=font(13), fill=INK)

    y += 314
    # Method
    card(draw, 28, y, WIDTH - 56, 268)
    draw.text((52, y + 22), "Method and disclosures", font=font(24, True), fill=INK)
    rounded(draw, (52, y + 62, WIDTH - 52, y + 148), 0, AMBER_BG)
    draw.rectangle((52, y + 62, 57, y + 148), fill=AMBER)
    disclosure = (
        "This benchmark compares JavaScript/WASM barcode readers on the public third-party BarBeR dataset. "
        "To make the comparison auditable, the protocol, decoder configurations, environment details, dataset "
        "manifest, HTML report, and per-image raw results are provided. BarBeR's standardized annotations were "
        "generated with assistance from proprietary Datalogic software. Difficult undecodable barcode regions "
        "are excluded from decoding accuracy when no reliable payload is available."
    )
    body = font(13)
    for i, line in enumerate(wrap(draw, disclosure, body, WIDTH - 140)):
        draw.text((70, y + 70 + i * 18), line, font=body, fill=INK)
    method = (
        "Both JavaScript decoders receive the same canvas painted from a single ImageBitmap; the fetch and "
        "bitmap decode stage is recorded separately as image_load_ns. Matching is a location-independent "
        "one-to-one multiset match of canonical format and exact normalized payload. UPC-A/EAN-13 leading "
        "zeros, CODE_39 asterisks, CODE_128 GS1 markers, HTML entities, trailing newlines, and a leading "
        "\\000001 escape are normalized before scoring."
    )
    for i, line in enumerate(wrap(draw, method, body, WIDTH - 120)):
        draw.text((52, y + 160 + i * 18), line, font=body, fill=INK)

    y += 290
    # Per-image
    remaining = HEIGHT - y - 28
    card(draw, 28, y, WIDTH - 56, remaining)
    draw.text((52, y + 22), "Per-image results", font=font(24, True), fill=INK)
    draw.text((52, y + 56), "The interactive table displays up to 500 matching rows. The complete JSONL stream and a complete JSON package are included in the report downloads.", font=font(13), fill=MUTED)
    for i, label in enumerate(["Search image, format, payload", "All decoders", "All outcomes"]):
        x = 52 + i * 210
        rounded(draw, (x, y + 86, x + 196, y + 118), 7, WHITE, (188, 200, 216), 1)
        draw.text((x + 12, y + 93), label, font=font(13), fill=MUTED)
    draw.text((52, y + 132), "Showing 500 of 15,788 matching records", font=font(13), fill=MUTED)

    headers = ["Decoder", "Image", "Source", "Ground truth", "Predictions"]
    widths = [150, 210, 150, 280, 280]
    table_x = 52
    table_y = y + 162
    table_w = sum(widths)
    draw.rectangle((table_x, table_y, table_x + table_w, table_y + 34), fill=TABLE_HEAD)
    cx = table_x
    for head, w in zip(headers, widths):
        draw.text((cx + 10, table_y + 8), head, font=font(13, True), fill=INK)
        cx += w
    rows = [
        ("dynamsoft-dbr-js", "4002644614076-01_N95.jpg", "Muenster.json", "EAN_13: 4002644614076", "EAN_13: 4002644614076"),
        ("zxing-wasm", "4002644614076-01_N95.jpg", "Muenster.json", "EAN_13: 4002644614076", "EAN13: 4002644614076"),
        ("dynamsoft-dbr-js", "4001686221310.jpg", "Deal Kaist.json", "EAN_13: 4001686221310", "EAN_13: 4001686221310"),
        ("zxing-wasm", "4001686221310.jpg", "Deal Kaist.json", "EAN_13: 4001686221310", "EAN13: 4001686221310"),
        ("dynamsoft-dbr-js", "ProductBarcode475.jpg", "InventBar.json", "CODE_39: *9035597*", "CODE_39: 9035597"),
        ("zxing-wasm", "ProductBarcode475.jpg", "InventBar.json", "CODE_39: *9035597*", "Code39: 9035597"),
        ("dynamsoft-dbr-js", "QR-photo_26_0074.jpg", "ZVZ-real.json", "QR_CODE: t=2018...&amp;s=919", "QR_CODE: t=2018...&s=919"),
    ]
    small = font(12)
    for i, row in enumerate(rows):
        ry = table_y + 34 + i * 40
        draw.line((table_x, ry + 39, table_x + table_w, ry + 39), fill=LINE)
        cx = table_x
        for cell, w in zip(row, widths):
            draw.text((cx + 10, ry + 11), cell, font=small, fill=INK)
            cx += w

    targets = [
        Path(r"D:\code\javascript-barcode-qr-code-scanner\examples\benchmark\report\media\benchmark-report.png"),
        Path(r"D:\code\javascript-barcode-qr-code-scanner\examples\benchmark\report\media\barcode-benchmark-js-report.png"),
        Path(r"D:\code\codepool\img\2026\08\barcode-benchmark-js-report.png"),
    ]
    for target in targets:
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target, "PNG", optimize=True)
        print(target)


if __name__ == "__main__":
    main()
