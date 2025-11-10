# Package Chrome Extension for Web Store
# This script creates a clean ZIP file ready for Chrome Web Store submission

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Chrome Extension Packaging Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Define output file
$outputFile = "barcode-scanner-extension.zip"

# Files and folders to include
$filesToInclude = @(
    "manifest.json",
    "index.html",
    "scanner.html",
    "app.js",
    "scanner.js",
    "background.js",
    "main.css",
    "icons",
    "libs",
    "README.md"
)

# Check if all required files exist
Write-Host "Checking required files..." -ForegroundColor Yellow
$missingFiles = @()
foreach ($file in $filesToInclude) {
    if (-not (Test-Path $file)) {
        $missingFiles += $file
        Write-Host "  ✗ Missing: $file" -ForegroundColor Red
    }
    else {
        Write-Host "  ✓ Found: $file" -ForegroundColor Green
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "Error: Missing required files!" -ForegroundColor Red
    Write-Host "Please ensure all required files are present." -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "All required files found!" -ForegroundColor Green
Write-Host ""

# Remove old package if exists
if (Test-Path $outputFile) {
    Write-Host "Removing old package..." -ForegroundColor Yellow
    Remove-Item $outputFile -Force
}

# Create ZIP package
Write-Host "Creating package: $outputFile" -ForegroundColor Yellow
try {
    Compress-Archive -Path $filesToInclude -DestinationPath $outputFile -CompressionLevel Optimal -Force
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "✓ Package created successfully!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "File: $outputFile" -ForegroundColor Cyan
    
    # Get file size
    $fileSize = (Get-Item $outputFile).Length / 1MB
    Write-Host "Size: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Review PACKAGING.md for submission instructions" -ForegroundColor White
    Write-Host "2. Go to https://chrome.google.com/webstore/devconsole" -ForegroundColor White
    Write-Host "3. Upload $outputFile" -ForegroundColor White
    Write-Host ""
    
}
catch {
    Write-Host ""
    Write-Host "Error creating package: $_" -ForegroundColor Red
    exit 1
}
