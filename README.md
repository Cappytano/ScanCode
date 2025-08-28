# ScanCode

Fast, reliable barcode + OCR scanner for Windows 11 (Chrome/Edge/Firefox) with robust fallbacks, real‑time overlays, logging, and import/export.

## All‑in‑One: Summary • Change History • Detailed Implementation • Integrated Prompt

**Generated:** 2025‑08‑28 03:04:48Z UTC

---

## Summary

- Multi‑engine decode cascade: **BarcodeDetector → ZXing WASM → jsQR (QR‑only)**.
- OCR (Tesseract) on a user‑defined ROI to capture **weight**; live overlays (green ROI + red word boxes).
- **Auto‑logging** with duplicate suppression + cooldown; **Snapshot** mode when auto‑log is OFF.
- **Logging fields:** value, format, engine, source, date, time, weight (g), photo, count, notes.
- **Import/Export:** CSV and XLSX (Excel cell limit respected); optional ZIP (CSV + photos).
- **PWA‑light:** Manifest + service worker + icons.
- **Manual focus slider** when supported; persistent preferences via `localStorage`.
- ES5‑friendly code, DOMContentLoaded guard, accessible UI.

## Change History (highlights)

- v5.x Foundation → camera preview, permission flow, CSV export, a11y pass.
- v5.2–5.3.x Optimizations, cooldown + dedup, XLSX import, UI pills, PWA fixes.
- v7.0 Engine Expansion to ZXing WASM; standardized vendor file names.
- v7.1.x OCR MVP + ROI overlay + photo snapshot + grams normalization.
- v7.3.x Polish + resilience; tuned cadence; better pills/toasts.
- v7.3.x+ New **manual focus**, **Snapshot mode**, persistent auto‑log.

## Detailed Implementation

See inline comments in `app.js`, `index.html`, and `styles.css`. Key features:
- Permission UI with `navigator.permissions`.
- Enumerate `videoinput` devices after grant; facing preference.
- Manual focus via `MediaTrackCapabilities` + `applyConstraints` (graceful fallback).
- Decode cascade loops with tuned timeouts, downscaling, and polygons for scannable regions.
- OCR worker loader with fallback signatures.
- Global dedup + cooldown + persistent prefs.
- Import/Export with CSV built‑in; XLSX/ZIP only if vendor scripts present.

## Integrated Prompt

The full spec and implementation prompt that guided this build is embedded in the project request and reflected across comments and file structure. See the repository root request for the authoritative text.

## Vendor Checklist (for vendor‑ready build)

Place these files in `/vendor/` if you want non‑native engines/features:

- `vendor/zxing-wasm-reader.iife.js`
- `vendor/zxing_reader.wasm`
- `vendor/jsQR.js`
- `vendor/tesseract.min.js`
- `vendor/worker.min.js`
- `vendor/tesseract-core/tesseract-core.wasm.js`
- `vendor/lang-data/eng.traineddata.gz`
- `vendor/xlsx.full.min.js`
- `vendor/jszip.min.js` (optional)

> **Note:** ScanCode works without vendors if your browser supports `BarcodeDetector`. XLSX/ZIP exports will be unavailable without their respective libraries. The app detects vendors automatically.

## Quick Start

1. Serve locally (HTTPS recommended for camera access). For example:
   ```bash
   npx http-server -S -C cert.pem -K key.pem
   # or: python3 -m http.server 8080
   ```
2. Open `https://localhost:port/` → **Request Permission** → **Start**.
3. Choose camera, adjust **Auto‑logging** and **Snapshot** as desired.
4. Resize the dashed **ROI** to cover the scale readout. Weight is captured after the adjustable *Weight Delay*.

## Deploy

- Any static host (GitHub Pages, Netlify, Cloudflare Pages). Ensure HTTPS to access the camera.

## Accessibility

- Associated labels/titles, button `type="button"`, ARIA live region for toasts, and clear status pills.

## License

MIT
