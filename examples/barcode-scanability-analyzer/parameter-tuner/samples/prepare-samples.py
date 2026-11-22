"""Build the sample set shipped with the Barcode Parameter Tuner demo.

    python prepare-samples.py [path-to-challenging-images]

The source is Dynamsoft's *Verified Collection* of challenging images: real colour
photographs, each one a different way for a barcode to be hard to read. A curated
subset is copied here, resized for the web, and the dataset's own ground truth
(`annotations.json`) is trimmed to the same subset with the coordinates scaled to
match, so the tuner can report expected-vs-found next to its results.

Why photographs rather than drawn fixtures: a synthetic image that the stock
template reads in full makes every pipeline stage look the same, which teaches
nothing. These images are dark, glaring, shadowed, crumpled, tiny or dense, so the
stage counts actually move when a parameter changes — and some of them are genuinely
missed by the default template, which is the finding the tuner exists to explain.

**This script produces exactly what the page offers, and nothing else.** `SAMPLES` below is
the list the sample picker in `index.html` exposes and the set `annotations.json` covers;
`_data/demos.yml` advertises "ten bundled photographs" and the dataset note in the page
describes them, so the script, the picker, the annotations and both blurbs have to be changed
together. Adding one here means adding an `<option>` there.

Resizing never upscales, so small sources keep their native resolution; the longest side is
capped at 1600 px, which is ample for barcode work at these sizes and keeps the demo directory
small. The set is ~1.5 MB in total.
"""

import json
import os
import sys

from PIL import Image, ImageOps

MAX_SIDE = 1600
JPEG_QUALITY = 82

# The dataset spells a few format names differently in different files (QRCode,
# EAN13, DataMatrix, Code128). They are normalised to the SDK's own enumeration
# names here so the shipped ground truth is consistent with what the reader
# returns and the comparison table can show one spelling per format.
FORMAT_ALIASES = {
    "QRCode": "QR_CODE",
    "EAN13": "EAN_13",
    "DataMatrix": "DATAMATRIX",
    "Code128": "CODE_128",
}

# One image per failure mode, and the order matches the sample picker in index.html.
# The comment is the reason the image earns its place, and the barcode count is what
# the tuner checks its own results against — several of these are genuinely missed by
# the stock template, which is the finding the page exists to explain.
SAMPLES = [
    # The baseline: several symbologies at once, all of them readable.
    ("multiple-symbologies-multiple-barcodes-9.jpg", "six symbols of four symbologies on a product label"),
    # Single hard symbols — the classic reasons a decode is missed.
    ("barcodes-in-low-lights-1.jpg", "one Code 128 in dim light, low contrast"),
    ("barcodes-in-strong-light-1.jpg", "one EAN-13 in harsh light, glare across the bars"),
    ("barcode-with-shadow-4.jpg", "three QR codes under a hard shadow"),
    ("crumpled-barcodes-1.jpg", "one EAN-13 on a crumpled surface, no longer planar"),
    ("tiny-barcodes-1.jpg", "one undersized Data Matrix, module size near the limit"),
    ("poorly-printed-1.jpg", "one EAN-13 with print defects, broken and merged bars"),
    ("off-screen-2.png", "one QR code partly out of frame"),
    # Many symbols — the stage counts visibly move as parameters change.
    ("healthcare-2.jpg", "ten Data Matrix symbols on a sheet of labels"),
    ("single-symbology-multiple-barcodes-2.jpg", "ninety-six QR codes on one dense sheet"),
]


def prepare(source_dir, out_dir):
    annotations_path = os.path.join(source_dir, "annotations.json")
    with open(annotations_path, "r", encoding="utf-8") as handle:
        dataset = json.load(handle)
    index = {entry["file"]: entry for entry in dataset.get("images", [])}

    kept = []
    missing = []
    for name, mode in SAMPLES:
        source_path = os.path.join(source_dir, name)
        if not os.path.isfile(source_path):
            missing.append(name)
            continue

        image = Image.open(source_path)
        image = ImageOps.exif_transpose(image)
        if image.mode in ("RGBA", "LA", "P"):
            image = image.convert("RGBA")
            flat = Image.new("RGB", image.size, (255, 255, 255))
            flat.paste(image, mask=image.split()[-1])
            image = flat
        else:
            image = image.convert("RGB")

        scale = min(1.0, MAX_SIDE / max(image.width, image.height))
        if scale < 1.0:
            size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
            image = image.resize(size, Image.LANCZOS)
        else:
            scale = 1.0

        target_name = os.path.splitext(name)[0] + ".jpg"
        target_path = os.path.join(out_dir, target_name)
        image.save(target_path, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)

        entry = index.get(name)
        barcodes = []
        if entry:
            for barcode in entry.get("barcodes", []):
                points = [[round(x * scale, 1), round(y * scale, 1)]
                          for x, y in barcode.get("points", [])]
                barcodes.append({
                    "text": barcode.get("text", ""),
                    "format": FORMAT_ALIASES.get(barcode.get("format", ""), barcode.get("format", "")),
                    "points": points,
                })
        else:
            missing.append(name + " (no annotation)")

        kept.append({
            "file": target_name,
            "mode": mode,
            "source_size": "%dx%d" % (Image.open(source_path).size[0], Image.open(source_path).size[1]),
            "size": "%dx%d" % image.size,
            "bytes": os.path.getsize(target_path),
            "barcodes": barcodes,
        })

    trimmed = {
        "format": dataset.get("format", "barcode-benchmark/1.0"),
        "dataset": dataset.get("dataset", ""),
        "source": "Dynamsoft challenging-images verified collection",
        "images": [{"file": item["file"], "barcodes": item["barcodes"]} for item in kept],
    }
    with open(os.path.join(out_dir, "annotations.json"), "w", encoding="utf-8") as handle:
        json.dump(trimmed, handle, indent=1)
        handle.write("\n")

    formats = sorted({barcode["format"] for item in kept for barcode in item["barcodes"]})
    for item in kept:
        print("%-48s %-10s -> %-10s %6dKB  %2d barcode(s)  [%s]"
              % (item["file"], item["source_size"], item["size"],
                 item["bytes"] // 1024, len(item["barcodes"]), item["mode"]))
    print("\ntotal bytes: %d KB" % (sum(item["bytes"] for item in kept) // 1024))
    print("formats present: %s" % ", ".join(formats))
    if missing:
        print("NOT INCLUDED: %s" % ", ".join(missing))
    print("%d samples written; the picker in index.html has to list the same %d" % (len(kept), len(kept)))


if __name__ == "__main__":
    source = sys.argv[1] if len(sys.argv) > 1 else r"D:\code\datasets-from-dynamsoft\challenging-images"
    out = os.path.dirname(os.path.abspath(__file__))
    if not os.path.isdir(source):
        print("source directory not found: %s" % source)
        raise SystemExit(1)
    prepare(source, out)
