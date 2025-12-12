import os
import urllib.request
import shutil
import rapidocr_onnxruntime
from pathlib import Path

# Define paths
CURRENT_DIR = Path(__file__).parent
ASSETS_DIR = CURRENT_DIR / "assets"

# Ensure assets directory exists
if not ASSETS_DIR.exists():
    ASSETS_DIR.mkdir(parents=True)

# RapidOCR models from local package
RAPIDOCR_DIR = Path(os.path.dirname(rapidocr_onnxruntime.__file__)) / "models"
OCR_MODELS = {
    "ch_PP-OCRv4_det_infer.onnx": RAPIDOCR_DIR / "ch_PP-OCRv4_det_infer.onnx",
    "ch_PP-OCRv4_rec_infer.onnx": RAPIDOCR_DIR / "ch_PP-OCRv4_rec_infer.onnx"
}

# Face detection model (download)
FACE_MODEL_URL = "https://github.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB/raw/master/models/onnx/version-RFB-320.onnx"
FACE_MODEL_NAME = "version-RFB-320.onnx"

def copy_local_models():
    print("Copying RapidOCR models from local package...")
    for model_name, src_path in OCR_MODELS.items():
        dest_path = ASSETS_DIR / model_name
        if dest_path.exists():
            print(f"ℹ️  File already exists: {model_name}")
            continue
            
        if src_path.exists():
            print(f"Copying {src_path} to {dest_path}...")
            shutil.copy(src_path, dest_path)
            print(f"✅ Copied {model_name}")
        else:
            print(f"❌ Source file not found: {src_path}")

def download_face_model():
    dest_path = ASSETS_DIR / FACE_MODEL_NAME
    if dest_path.exists():
        print(f"ℹ️  File already exists: {FACE_MODEL_NAME}")
        return

    print(f"Downloading {FACE_MODEL_URL} to {dest_path}...")
    try:
        urllib.request.urlretrieve(FACE_MODEL_URL, dest_path)
        print(f"✅ Downloaded {FACE_MODEL_NAME}")
    except Exception as e:
        print(f"❌ Failed to download {FACE_MODEL_URL}: {e}")

if __name__ == "__main__":
    copy_local_models()
    download_face_model()
    print("\nModel setup complete.")
