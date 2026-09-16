# Ibis Rice Field Plot Navigator 🌾📍

A fast, lightweight, and offline-ready mobile Web Application / Progressive Web App (PWA) specifically designed for Ibis Rice field officers, rangers, and agricultural extension teams working in rural Cambodian conservation landscapes (Siem Pang, Preah Vihear, Lumphat, Prey Lang, Keo Seima, and Vuen Sai).

---

## 🌟 Key Features

* 📱 **Mobile-First & PWA Installable**:
  * Tap **"Add to Home Screen"** in Chrome (Android) or Safari (iOS) to install as a standalone app.
  * **100% Offline Support**: Pre-caches the application shell, Leaflet map engines, and all 6,427 plot geometries and centroids in browser storage. Runs without cellular coverage or internet connection once opened.
* 🔍 **Instant Search**:
  * Unified search bar with real-time autocomplete for **Family ID** (e.g., `SD041`, `CC295`), **Plot number** (e.g., `11`), or **Village name** (e.g., `Sre Andaol`, `Chokchar`).
* 🗂️ **Cascading Hierarchy Filters**:
  * Filter down step-by-step: `Site / Landscape` ➔ `Village` ➔ `Family ID` ➔ `Plot ID`.
* 🗺️ **High-Contrast Field Map**:
  * Bundled local Leaflet with Satellite imagery and OpenStreetMap street/terrain options.
  * Visual plot boundaries with instant fly-to and glowing highlight selection.
* 🚗 **"Drive / Motorbike" Macro-Navigation**:
  * 1-click button opening Google Maps, Apple Maps, or OsmAnd with destination set to the exact plot centroid coordinates.
* 🧭 **"Field Compass" Walking Micro-Navigation (Last-Mile Bund Navigation)**:
  * Designed specifically for walking across rice dykes (bunds) where roads do not exist.
  * Dynamic dashed guidance line drawn between user's live GPS position and the plot boundary.
  * Real-time straight-line distance readout (e.g., `145 m`).
  * Live bearing arrow (`↗ 42° NE`) synchronized with the device's internal magnetic compass.
  * Proximity alert when arriving within 25m of the plot.
* 🌾 **Interactive Subplot Sketching (Field Inspection)**:
  * **Map Popup & Action**: Tap any plot on the map to see its identity, recorded subplots, and tap **"✏️ + Draw Subplot"**.
  * **Touch/Click Sketching**: Tap vertices across the plot to trace the subplot boundary, with **Undo Point** and live preview.
  * **Rice Variety Tagging**: Assign varieties (e.g., *Phka Rumduol*, *Sen Kra-Ob*, *Phka Romdeng*, *Kranhao*, or custom) and inspection notes.
  * **Instant Area Calculation**: Automatically computes the subplot area in hectares (`ha`) and percentage of the parent plot (e.g. `0.65 ha · 45%`).
  * **Multi-Subplot Support**: Sketch up to 8 subplots per main plot with distinct colored fills and dashed boundaries.
  * **Offline Persistence**: Subplots are saved locally in `localStorage`.
  * **Export to GeoJSON**: 1-click export of all inspection subplots to standard GeoJSON for importing into external inspection apps or GIS!
* 📋 **Field Utilities**:
  * 1-click copy of GPS coordinates (e.g., `12.34567, 106.78901`).
  * 1-click export of selected plot to `.kml` file for loading into handheld Garmin GPS or OsmAnd.

---

## 🚀 How to Run

### Option 1: One-Click Windows Launcher
Double-click `start_navigator.bat` in this folder. It will start the local server and automatically open your default web browser at `http://localhost:8080`.

### Option 2: Command Line
```bash
python server.py
```
Then navigate to `http://localhost:8080` in your web browser.

---

## 📱 How Field Teams Can Use It on Their Mobile Phones

1. **Connect Field Phone to Laptop**:
   * Connect the phone and laptop to the same Wi-Fi network, or turn on the laptop's Mobile Hotspot and connect the phone to it.
2. **Find Laptop IP Address**:
   * On Windows, run `ipconfig` in CMD to find your IPv4 Address (e.g., `192.168.1.50`).
3. **Open on Phone**:
   * In Chrome or Safari on the phone, go to: `http://192.168.1.50:8080`.
4. **Install as App (Offline)**:
   * **Android (Chrome)**: Tap the 3 dots menu ➔ **"Install app"** or **"Add to Home screen"**.
   * **iOS (Safari)**: Tap the Share button ➔ **"Add to Home Screen"**.
5. Once added, the field team can take the phone deep into wildlife sanctuaries completely offline!

---

## 🔄 Updating Data in the Future

If you receive an updated `all_ibis_rice_plots.geojson` file in the future, simply run:
```bash
python scripts/prepare_data.py
```
This script will automatically:
* Sanitize all text (strip trailing whitespace, linebreaks `\r\n`, and `#N/A`).
* Calculate exact centroids and bounding boxes for all plots.
* Compute the plot surface area in hectares (`ha`).
* Rebuild the fast search index and optimized GeoJSON in `public/data/`.

---

## 📂 Project Structure

```
ibis_rice_field_plots/
├── all_ibis_rice_plots.geojson      # Original GeoJSON dataset (6,427 plots)
├── start_navigator.bat              # 1-click Windows runner
├── server.py                        # Multi-threaded local Python server
├── scripts/
│   └── prepare_data.py              # Data cleaning and indexing pipeline
├── public/
│   ├── index.html                   # Mobile-first app interface
│   ├── app.css                      # Outdoor high-contrast stylesheet
│   ├── app.js                       # Map, search, cascading filters & compass HUD
│   ├── sw.js                        # Offline Service Worker cache
│   ├── manifest.webmanifest         # PWA configuration
│   ├── data/
│   │   ├── plots.geojson            # Cleaned GeoJSON with centroids & area (ha)
│   │   └── index.json               # Fast hierarchy and search index
│   ├── vendor/                      # Bundled Leaflet JS/CSS (100% offline)
│   └── icons/                       # PWA application icons
└── README.md
```
