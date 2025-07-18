# Dynamsoft Driver License Scanner - Ready to Use

A complete TypeScript-based solution for scanning and processing driver licenses with automatic border detection, correction, and customizable workflows.

https://github.com/user-attachments/assets/2e2576dc-c7e9-4c3a-a17d-8753f0edeb2b

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn
- Modern web browser (Chrome, Edge, Firefox, Safari)

### Installation & Setup

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start development server
npm run serve
```

Open your browser and navigate to: http://localhost:3000/hello-world

## 🔧 Development & Debugging

### **Press F5 to Debug! 🎯**

**Yes, you can press F5 to debug!** The project is fully configured for VS Code debugging:

1. **Press F5** in VS Code
2. Select "Debug with Chrome" 
3. Set breakpoints in your TypeScript files
4. Debug directly in your TypeScript source code!

### Development Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Production build (minified, optimized) |
| `npm run build:dev` | Development build with source maps |
| `npm run build:watch` | Watch mode - rebuilds on file changes |
| `npm run serve` | Start development server (port 3000) |
| `npm run dev` | **Recommended**: Combined watch + serve |

### VS Code Integration

#### 🎯 Debug Configurations (F5)
- **Debug with Chrome** - Full debugging experience
- **Debug Hello World Sample** - Quick sample testing  
- **Debug with Edge** - Alternative browser debugging
- **Attach to Chrome** - Connect to existing Chrome instance

#### 🛠 Tasks (Ctrl+Shift+P → "Tasks: Run Task")
- **Build TypeScript** - One-time build
- **Watch TypeScript** - Auto-rebuild on changes
- **Start Dev Server** - Launch local server
- **Start Development Environment** - Combined setup

### Debugging Features

✅ **Source Maps Enabled** - Debug TypeScript directly  
✅ **Hot Reload** - Automatic rebuilds on save  
✅ **Breakpoint Support** - Set breakpoints in .ts files  
✅ **Enhanced Error Handling** - Detailed error messages  
✅ **Console Logging** - Comprehensive debug output  

### Available URLs

- **Debug Page**: http://localhost:3000/debug *(Enhanced debugging features)*
- **Hello World**: http://localhost:3000/hello-world *(Basic sample)*  
- **Demo**: http://localhost:3000/demo *(Advanced demo)*

## 📁 Project Structure

```
ready_to_use/
├── src/                          # TypeScript source files
│   ├── DriverLicenseScanner.ts   # Main scanner class
│   ├── views/                    # UI view components
│   ├── utils/                    # Utility functions
│   └── build/                    # Build entry points
├── dist/                         # Compiled JavaScript + source maps
│   ├── ddls.bundle.js           # Main bundle
│   ├── ddls.bundle.js.map       # Source map for debugging
│   ├── ddls.ui.html             # Scanner UI template
│   └── ddls.template.json       # Scanner configuration
├── samples/                      # Example implementations
│   ├── debug.html               # Enhanced debug page
│   └── hello-world.html         # Basic usage example
├── .vscode/                     # VS Code configuration
│   ├── launch.json             # Debug configurations
│   └── tasks.json              # Build tasks
├── dev-server/                  # Local development server
├── rollup.config.mjs           # Production build config
├── rollup.dev.config.mjs       # Development build config
└── tsconfig.json               # TypeScript configuration
```

## 🎯 Usage Examples

### Basic Usage

```html
<!DOCTYPE html>
<html>
<head>
    <script src="../dist/ddls.bundle.js"></script>
</head>
<body>
    <script>
        const scanner = new Dynamsoft.DriverLicenseScanner({
            license: "YOUR_LICENSE_KEY",
            workflowConfig: {
                captureFrontImage: true,
                captureBackImage: true,
                readBarcode: true
            }
        });
        
        scanner.launch().then(result => {
            console.log('Scan result:', result);
        });
    </script>
</body>
</html>
```

### TypeScript Usage

```typescript
import DriverLicenseScanner from './src/DriverLicenseScanner';

const scanner = new DriverLicenseScanner({
    license: "YOUR_LICENSE_KEY",
    workflowConfig: {
        captureFrontImage: true,
        captureBackImage: true,
        readBarcode: true
    },
    scannerViewConfig: {
        uiPath: "../dist/ddls.ui.html"
    }
});

// Launch scanner and get results
const result = await scanner.launch();
```

## 🔍 Debugging Workflow

### 1. **One-Click Debug Setup**
```bash
# Start development environment
npm run dev
```
Then press **F5** in VS Code!

### 2. **Manual Development Setup**
```bash
# Terminal 1: Watch for changes
npm run build:watch

# Terminal 2: Start server  
npm run serve
```

### 3. **Setting Breakpoints**
1. Open `src/DriverLicenseScanner.ts` in VS Code
2. Click in the gutter to set breakpoints
3. Press F5 to start debugging
4. Interact with the scanner - breakpoints will be hit!

### 4. **Browser DevTools**
- **Sources tab**: Your TypeScript files are visible
- **Console tab**: Enhanced logging output
- **Network tab**: Check resource loading

## 🛠 Configuration

### Scanner Configuration

```typescript
const config = {
    license: "YOUR_LICENSE_KEY",
    
    // Workflow settings
    workflowConfig: {
        captureFrontImage: true,      // Scan front of license
        captureBackImage: true,       // Scan back of license  
        readBarcode: true,           // Read PDF417 barcode
        barcodeScanSide: "back",     // Which side has barcode
        scanOrder: ["front", "back"] // Scanning sequence
    },
    
    // UI customization
    scannerViewConfig: {
        uiPath: "../dist/ddls.ui.html",
        container: "#scanner-container"
    },
    
    // Result handling
    showResultView: true,
    showVerifyView: true
};
```

### TypeScript Configuration

The project uses optimized TypeScript settings:

```jsonc
{
    "compilerOptions": {
        "target": "es2017",
        "module": "esnext", 
        "sourceMap": true,     // Enable debugging
        "declaration": true,   // Generate .d.ts files
        "outDir": "dist"
    }
}
```

## 🚨 Troubleshooting

### Build Issues

**"dist folder not found"**
```bash
npm run build:dev
```

**TypeScript errors**
```bash
npm install  # Reinstall dependencies
```

### Debugging Issues

**Source maps not working**
1. Ensure you're using `npm run build:dev` (not `npm run build`)
2. Check browser DevTools → Sources → should see TypeScript files
3. Verify `tsconfig.json` has `"sourceMap": true`

**Breakpoints not hitting**
1. Make sure to press F5 to start debugging (not just open browser)
2. Set breakpoints in `.ts` files, not `.js` files
3. Check that VS Code is using the correct workspace folder

**Port conflicts**
```bash
# Change port in dev-server/index.js if needed
let httpPort = 3000;  // Change this line
```



