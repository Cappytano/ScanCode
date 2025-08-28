# ScanCode

Fast, reliable barcode + OCR scanner for Windows 11 (Chrome/Edge/Firefox) with robust fallbacks, real-time overlays, logging, and import/export.

## New (requested) features
- **Weight Source dropdown**: choose **OCR**, **Bluetooth (BLE Weight Scale Service)**, or **USB HID scale**.
- **Connect Scale** button to pair/connect depending on source.
- **Test Engines** button: checks BarcodeDetector / ZXing / jsQR availability and camera readiness.
- **Test OCR** button: loads OCR engine and verifies with a synthetic sample, reporting parse status.
- **Show OCR Box** toggle: hide/show the adjustable ROI overlay.

See `README.md` from the previous build for full specs.


## Vendor bundle
This package includes vendor files placed in `/vendor` and pre-wired in `index.html`:
- ZXing WASM IIFE + `zxing_reader.wasm`
- jsQR
- Tesseract + worker + core wasm loader + `eng.traineddata.gz`
- SheetJS (XLSX) and JSZip

> If ZXing still fails to find the wasm, verify that `vendor/zxing_reader.wasm` is accessible over HTTPS and not blocked by CSP.
