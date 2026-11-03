"""
Generate a sample IMEI label image (Code 128 barcode + printed digits)
used to quickly verify both scan modes of the IMEI scanner.

Requires: pip install pillow python-barcode
Usage:    python gen_sample_imei.py [base14digits]
The last check digit is computed automatically with the Luhn algorithm.
"""
import io
import sys

import barcode
from PIL import Image, ImageDraw, ImageFont


def luhn_check_digit(base14):
    """Compute the IMEI check digit so that the full number passes mod-10."""
    total = 0
    for i, ch in enumerate(base14):
        d = int(ch)
        if i % 2 == 1:  # second, fourth, ... digits are doubled
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return str((10 - total % 10) % 10)


def render_code128(text, target_height=72):
    """Render a text-free Code 128 PNG buffer and return the resized PIL image."""
    Code128 = barcode.get_barcode_class("code128")
    buffer = io.BytesIO()
    Code128(
        text,
        writer=barcode.writer.ImageWriter(),
    ).write(buffer, options={
        "write_text": False,
        "module_height": 20,
        "module_width": 1.0,
        "quiet_zone": 2,
        "font_size": 0,
    })
    bc = Image.open(buffer)
    ratio = target_height / bc.height
    return bc.resize((max(1, int(bc.width * ratio)), target_height))


def main():
    base = sys.argv[1] if len(sys.argv) > 1 else "35478906782546"
    assert len(base) == 14 and base.isdigit(), "base must be 14 digits"
    imei = base + luhn_check_digit(base)
    print("IMEI:", imei)

    W, H = 520, 320
    img = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(img)

    font_brand = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 20)
    font_label = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 24)
    font_imei = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 38)
    font_small = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 16)

    # frame like a device back label / sticker
    d.rectangle([1, 1, W - 2, H - 2], outline=(150, 150, 150), width=2)

    d.text((28, 22), "ACME Mobile Devices", fill=(40, 40, 40), font=font_brand)
    d.text((W - 200, 26), "Model: SP-2026", fill=(110, 110, 110), font=font_small)

    d.text((32, 86), "IMEI:", fill=(0, 0, 0), font=font_label)

    # barcode centered below the label row
    bc = render_code128(imei)
    bx = max(30, (W - bc.width) // 2)
    by = 80
    img.paste(bc.convert("RGB"), (bx, by))

    # printed digits under the barcode
    bbox = d.textbbox((0, 0), imei, font=font_imei)
    tw = bbox[2] - bbox[0]
    d.text(((W - tw) // 2, by + bc.height + 26), imei, fill=(0, 0, 0), font=font_imei)

    out = "sample-imei.png"
    img.save(out)
    print("Saved:", out, "| barcode:", bc.size)


if __name__ == "__main__":
    main()
