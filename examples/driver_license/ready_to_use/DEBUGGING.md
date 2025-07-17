# Debugging Guide for Driver License Scanner

This guide will help you set up and debug your TypeScript-based Driver License Scanner project easily.

## Quick Start

### 1. **Development Mode (Recommended for Debugging)**

The easiest way to debug your TypeScript code:

```bash
# Start development environment (builds with source maps + starts server)
npm run dev
```

Then open: http://localhost:3000/debug

### 2. **VS Code Debugging (Best Experience)**

1. **Press F5** or go to Run and Debug → "Debug with Chrome"
2. This will automatically:
   - Build your TypeScript with source maps
   - Start the dev server
   - Launch Chrome with debugging enabled
   - Open the debug page

### 3. **Manual Steps**

If you prefer to do it step by step:

```bash
# Build with source maps for debugging
npm run build:dev

# Start the development server
npm run serve
```

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Production build (minified, no source maps) |
| `npm run build:dev` | Development build (with source maps) |
| `npm run build:watch` | Watch mode - automatically rebuilds on changes |
| `npm run serve` | Start the development server |
| `npm run dev` | Combined: watch + serve (recommended) |

## Available URLs

- **Debug Page**: http://localhost:3000/debug (enhanced with debugging features)
- **Hello World**: http://localhost:3000/hello-world (original sample)
- **Demo**: http://localhost:3000/demo (if available)

## VS Code Tasks

Use **Ctrl+Shift+P** → "Tasks: Run Task" to access:

- **Build TypeScript** - One-time build
- **Watch TypeScript** - Auto-rebuild on changes
- **Start Dev Server** - Start the local server
- **Start Development Environment** - Combined watch + server

## Debugging Features

### Source Maps Enabled
- Set breakpoints directly in your TypeScript files
- Step through TypeScript code in DevTools
- View TypeScript variable names and types

### Debug Page Features
- **Test Setup**: Verify everything is working
- **Enhanced Logging**: Detailed console output
- **Error Handling**: Better error messages
- **Breakpoint Support**: `debugger;` statement included

### VS Code Launch Configurations

Available debug configurations (F5):

1. **Debug with Chrome** - Opens debug page in Chrome
2. **Debug Hello World Sample** - Opens original sample
3. **Debug with Edge** - Same as Chrome but with Edge
4. **Attach to Chrome** - Attach to existing Chrome instance

## Best Practices for Debugging

### 1. **Set Breakpoints in TypeScript**
- Open your `.ts` files in VS Code
- Click in the gutter to set breakpoints
- Use F5 to start debugging

### 2. **Use Console Logging**
```typescript
console.log('Debug info:', someVariable);
console.group('Scanner Debug');
console.log('Step 1: Initializing...');
console.groupEnd();
```

### 3. **Browser DevTools**
- **Sources Tab**: See your TypeScript files
- **Console Tab**: View logs and errors
- **Network Tab**: Check for loading issues

### 4. **Watch Mode for Quick Development**
```bash
npm run dev
```
Leave this running - it will automatically rebuild when you change TypeScript files.

## Troubleshooting

### "dist folder not found"
```bash
npm run build:dev
```

### Source maps not working
1. Ensure `tsconfig.json` has `"sourceMap": true`
2. Use `npm run build:dev` instead of `npm run build`
3. Check browser DevTools → Sources → should see TypeScript files

### Port 3000 already in use
- Change `httpPort` in `dev-server/index.js`
- Or kill the process using the port

### TypeScript errors in VS Code
- Check **Problems** panel (Ctrl+Shift+M)
- Ensure all dependencies are installed: `npm install`

## Example Debugging Session

1. **Start development environment**:
   ```bash
   npm run dev
   ```

2. **Open VS Code and press F5** (or Run → "Debug with Chrome")

3. **Set breakpoints** in your TypeScript files (e.g., `DriverLicenseScanner.ts`)

4. **In the browser**, click "Launch Scanner" on the debug page

5. **VS Code will hit your breakpoints** - you can now:
   - Inspect variables
   - Step through code
   - Evaluate expressions
   - Check call stack

## File Structure for Debugging

```
project/
├── src/                    # Your TypeScript source files
│   ├── DriverLicenseScanner.ts
│   └── ...
├── dist/                   # Compiled JavaScript + source maps
│   ├── ddls.bundle.js
│   └── ddls.bundle.js.map  # Source map file
├── samples/
│   ├── debug.html          # Enhanced debug page
│   └── hello-world.html    # Original sample
├── .vscode/
│   ├── launch.json         # Debug configurations
│   └── tasks.json          # Build tasks
└── tsconfig.json           # TypeScript config (source maps enabled)
```

## Tips

- **Use the debug page** (`/debug`) instead of hello-world for better debugging experience
- **Keep `npm run dev` running** while developing for automatic rebuilds
- **Check the browser console** for detailed error messages
- **Use VS Code's integrated terminal** to run commands
- **Set breakpoints in your TypeScript files**, not the compiled JavaScript
