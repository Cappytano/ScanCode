# ScanCode (ZXing-only)

This build removes Browser BarcodeDetector and jsQR; it uses **ZXing WASM only** for all decoding.

### Included features
- ZXing WASM engine (IIFE) with path override for `zxing_reader.wasm`.
- OCR weight from ROI via Tesseract (with worker and `eng.traineddata.gz`).
- Weight sources: OCR, Bluetooth (BLE Weight Scale Service 0x181D), USB (WebHID). 
- Snapshot vs Auto-log, ROI overlay with drag/resize and word boxes, manual focus slider, import/export CSV+XLSX, optional ZIP with photos.
- PWA (manifest + service worker + icons).

> Serve over HTTPS (or localhost) for camera, BLE, and HID.
