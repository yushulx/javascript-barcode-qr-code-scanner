# Document Detection Web App (TensorFlow.js)

This project demonstrates a client-side document detection application using a DeepLabV3 MobileNetV3 model running directly in the browser with TensorFlow.js.

## Online Demo
https://yushulx.me/javascript-barcode-qr-code-scanner/examples/DeepLabv3Tensorflow/

## Features

- **Client-Side Inference**: Runs entirely in the browser using TensorFlow.js. No data is sent to a server.
- **DeepLabV3 Architecture**: Utilizes a MobileNetV3-based DeepLabV3 model for efficient semantic segmentation.
- **Multiple Backends**: Supports both WebGPU (fastest, experimental) and WebGL backends for hardware acceleration.
- **Input Sources**:
  - Real-time webcam feed.
  - Image file upload.
- **Performance Metrics**: Displays real-time statistics for preprocessing, inference, and post-processing times, as well as FPS.

## Prerequisites

- A modern web browser (Chrome, Edge, Firefox).
- For WebGPU support, a compatible browser and hardware are required.

## Setup & Usage

1. **Clone the repository** (if applicable) or download the project files.

2. **Serve the application**:
   Due to browser security restrictions (CORS) regarding loading local files (specifically the TensorFlow.js model), you cannot simply open `index.html` directly from the file system. You must serve the directory using a local web server.

   Examples of how to serve the folder:

   **Using Python:**
   ```bash
   # Python 3
   python -m http.server 8000
   ```

   **Using Node.js (http-server):**
   ```bash
   npx http-server .
   ```


3. **Open the application**:
   Navigate to `http://localhost:8000` (or the port provided by your server) in your web browser.

4. **Run Inference**:
   - Select your preferred backend (WebGPU or WebGL).
   - Click **Start Webcam** for real-time detection.
   - Or use **Upload Image** to process a static image.

