/**
 * IBIS RICE PLOT NAVIGATOR - FIELD PWA APPLICATION
 * Supports offline search, plot selection, driving directions,
 * live GPS compass navigation, and interactive subplot sketching for field inspections.
 */

(function () {
  'use strict';

  // --- State Variables ---
  let map = null;
  let satelliteLayer = null;
  let osmLayer = null;
  let currentBasemap = 'sat';

  let plotsGeojson = null;
  let geojsonLayer = null;
  let searchIndex = [];
  let hierarchy = {};
  let plotLayersById = new Map(); // id -> L.Polygon

  let selectedPlot = null;
  let selectedLayer = null;
  let userLocation = null; // { lat, lng, accuracy, heading }
  let userMarker = null;
  let userAccuracyCircle = null;
  let navGuideLine = null;

  let isWalkingMode = false;
  let watchPositionId = null;
  let deviceHeading = null; // phone magnetic compass heading

  // --- Subplot Inspection State ---
  const SUBPLOTS_STORAGE_KEY = 'ibis_inspection_subplots_v1';
  const DIVISION_LINES_STORAGE_KEY = 'ibis_plot_division_lines_v1';
  let subplots = []; // Array of saved subplots
  let divisionLines = {}; // { [plotId]: [ [[lat,lng], ...], ... ] }
  let subplotsLayerGroup = null; // Leaflet LayerGroup for rendered subplots
  let divisionLinesLayerGroup = null; // Leaflet LayerGroup for division lines
  let isDrawingSubplot = false;
  let drawingMainPlot = null;
  let drawingMode = 'line'; // 'line' | 'label'
  let isMouseDownDrawing = false;
  let currentStrokePoints = [];
  let tempStrokeLayer = null;
  let pendingClickPoint = null;
  let pendingClickMarker = null;
  let pendingSubplotLatLng = null;
  let drawingUndoStack = []; // [{ type: 'line', lineData, layers }, { type: 'subplot', subplot, marker }]
  let drawingSessionLayers = []; // layers created in current drawing session
  let drawingBoundaryRings = []; // [[lat,lng], ...] rings of main plot for containment check
  let mainPlotGuideLayer = null; // highlighted boundary guide while drawing
  let isFullscreenDrawing = false; // whether header is hidden
  let sessionBackup = null; // snapshot before current drawing session

  // --- DOM Elements ---
  const quickSearchInput = document.getElementById('quick-search');
  const btnClearSearch = document.getElementById('btn-clear-search');
  const searchSuggestions = document.getElementById('search-suggestions');

  const btnToggleFilters = document.getElementById('btn-toggle-filters');
  const filterPanel = document.getElementById('filter-panel');
  const filterSite = document.getElementById('filter-site');
  const filterVillage = document.getElementById('filter-village');
  const filterFamily = document.getElementById('filter-family');
  const filterPlot = document.getElementById('filter-plot');
  const btnResetFilters = document.getElementById('btn-reset-filters');
  const btnApplyFilters = document.getElementById('btn-apply-filters');
  const filterStatusText = document.getElementById('filter-status-text');

  const btnMyLocation = document.getElementById('btn-my-location');
  const btnLayerToggle = document.getElementById('btn-layer-toggle');
  const layerLabel = document.getElementById('layer-label');
  const btnFitPlots = document.getElementById('btn-fit-plots');

  const compassHud = document.getElementById('compass-hud');
  const hudTargetName = document.getElementById('hud-target-name');
  const hudDistance = document.getElementById('hud-distance');
  const hudBearing = document.getElementById('hud-bearing');
  const compassArrow = document.getElementById('compass-arrow');
  const hudGpsAccuracy = document.getElementById('hud-gps-accuracy');
  const btnCloseCompass = document.getElementById('btn-close-compass');

  const plotDrawer = document.getElementById('plot-drawer');
  const drawerToggle = document.getElementById('drawer-toggle');
  const drawerEmptyState = document.getElementById('drawer-empty-state');
  const drawerPlotInfo = document.getElementById('drawer-plot-info');

  const cardSite = document.getElementById('card-site');
  const cardFamily = document.getElementById('card-family');
  const cardPlot = document.getElementById('card-plot');
  const cardArea = document.getElementById('card-area');
  const cardVillage = document.getElementById('card-village');
  const cardCommune = document.getElementById('card-commune');
  const cardYear = document.getElementById('card-year');
  const cardCoords = document.getElementById('card-coords');

  const btnDriveDirections = document.getElementById('btn-drive-directions');
  const btnStartCompass = document.getElementById('btn-start-compass');
  const btnCopyCoords = document.getElementById('btn-copy-coords');
  const btnExportKml = document.getElementById('btn-export-kml');

  // Subplot Elements
  const drawingHud = document.getElementById('drawing-hud');
  const drawingTargetLabel = document.getElementById('drawing-target-label');
  const drawingPointsCount = document.getElementById('drawing-points-count');
  const btnModeDrawLine = document.getElementById('btn-mode-draw-line');
  const btnModeAddLabel = document.getElementById('btn-mode-add-label');
  const btnUndoPoint = document.getElementById('btn-undo-point');
  const btnClearLines = document.getElementById('btn-clear-lines');
  const btnFinishDrawing = document.getElementById('btn-finish-drawing');
  const btnCancelDrawing = document.getElementById('btn-cancel-drawing');
  const btnStartDrawing = document.getElementById('btn-start-drawing');
  const subplotsList = document.getElementById('subplots-list');
  const subplotsCountBadge = document.getElementById('subplots-count-badge');
  const btnExportSubplots = document.getElementById('btn-export-subplots');

  // Subplot Modal Elements
  const subplotModal = document.getElementById('subplot-modal');
  const subplotForm = document.getElementById('subplot-form');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnCancelModal = document.getElementById('btn-cancel-modal');
  const btnSaveSubplot = document.getElementById('btn-save-subplot');
  const modalPlotRef = document.getElementById('modal-plot-ref');
  const subplotAreaHa = document.getElementById('subplot-area-ha');
  const subplotAreaPct = document.getElementById('subplot-area-pct');
  const subplotCode = document.getElementById('subplot-code');
  const subplotVariety = document.getElementById('subplot-variety');
  const customVarietyGroup = document.getElementById('custom-variety-group');
  const subplotCustomVariety = document.getElementById('subplot-custom-variety');
  const subplotNotes = document.getElementById('subplot-notes');

  // Allocation tracker elements
  const btnClosePlotDrawer = document.getElementById('btn-close-plot-drawer');
  const drawerAllocTracker = document.getElementById('drawer-alloc-tracker');
  const drawerAllocBadge = document.getElementById('drawer-alloc-badge');
  const drawerAllocFill = document.getElementById('drawer-alloc-fill');

  const subplotAllocBanner = document.getElementById('subplot-alloc-banner');
  const allocMainHa = document.getElementById('alloc-main-ha');
  const allocRemainingPct = document.getElementById('alloc-remaining-pct');
  const allocRemainingHa = document.getElementById('alloc-remaining-ha');
  const allocMeterUsed = document.getElementById('alloc-meter-used');
  const allocMeterCurrent = document.getElementById('alloc-meter-current');
  const allocWarning = document.getElementById('alloc-warning');

  const toast = document.getElementById('toast');
  const offlineBadge = document.getElementById('offline-badge');

  // --- Initialize App ---
  document.addEventListener('DOMContentLoaded', () => {
    initServiceWorker();
    loadStoredSubplots();
    loadICSStores();
    initMap();
    initOrientationListener();
    loadPlotData();
    bindEvents();
    initDrawerTabs();
    initSignaturePad();
    initProgressiveDisclosure();
  });

  // --- Service Worker (Offline Support) ---
  function initServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('sw.js')
        .then((reg) => {
          console.log('[SW] Registered successfully:', reg.scope);
          updateOnlineStatus();
        })
        .catch((err) => {
          console.warn('[SW] Registration failed:', err);
        });
    }

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
  }

  function updateOnlineStatus() {
    if (navigator.onLine) {
      offlineBadge.innerHTML = '<span class="status-dot"></span> Online & Cached';
      offlineBadge.style.color = '#4ade80';
    } else {
      offlineBadge.innerHTML = '<span class="status-dot"></span> Offline Mode';
      offlineBadge.style.color = '#f59e0b';
      showToast('Running completely offline from local cache');
    }
  }

  // --- Subplots & Division Lines Local Storage ---
  function loadStoredSubplots() {
    try {
      const data = localStorage.getItem(SUBPLOTS_STORAGE_KEY);
      if (data) {
        subplots = JSON.parse(data);
        console.log(`[Subplots] Loaded ${subplots.length} subplots from storage.`);
      }
      const linesData = localStorage.getItem(DIVISION_LINES_STORAGE_KEY);
      if (linesData) {
        divisionLines = JSON.parse(linesData);
        console.log(`[Subplots] Loaded division lines from storage.`);
      }
    } catch (e) {
      console.warn('[Subplots] Failed to load subplots or division lines:', e);
      subplots = [];
      divisionLines = {};
    }
  }

  function saveStoredSubplots() {
    try {
      localStorage.setItem(SUBPLOTS_STORAGE_KEY, JSON.stringify(subplots));
      localStorage.setItem(DIVISION_LINES_STORAGE_KEY, JSON.stringify(divisionLines));
    } catch (e) {
      console.error('[Subplots] Failed to save subplots or division lines:', e);
      showToast('Error saving data to browser storage');
    }
  }

  // --- Viewport-based lazy rendering state ---
  let allFeatures = []; // All GeoJSON features, kept in memory
  let renderedIds = new Set(); // IDs of currently rendered features
  let renderThrottle = null;

  // --- Map Initialization ---
  function initMap() {
    map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
      maxZoom: 19,
      minZoom: 6
      // No preferCanvas - use default SVG renderer for reliability
    }).setView([13.7, 105.8], 8);

    // Position zoom buttons in bottom-right corner so they never overlap the left drawer or top search
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Custom pane for subplots to always render above main plot polygons
    map.createPane('subplotsPane');
    map.getPane('subplotsPane').style.zIndex = 450;

    // Satellite basemap (ESRI World Imagery)
    satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 19, opacity: 1 }
    ).addTo(map);

    // Street / Terrain basemap (OpenStreetMap)
    osmLayer = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { maxZoom: 19 }
    );

    // Layer groups for rendered subplots and separation lines
    divisionLinesLayerGroup = L.layerGroup().addTo(map);
    subplotsLayerGroup = L.layerGroup().addTo(map);

    // Map drawing handlers (mouse + touch)
    map.on('mousedown', (e) => {
      if (isDrawingSubplot && drawingMode === 'line') {
        handleMapDrawPointerDown(e.latlng);
      }
    });

    map.on('mousemove', (e) => {
      if (isDrawingSubplot && drawingMode === 'line' && isMouseDownDrawing) {
        handleMapDrawPointerMove(e.latlng);
      }
    });

    map.on('mouseup', () => {
      if (isDrawingSubplot && drawingMode === 'line' && isMouseDownDrawing) {
        handleMapDrawPointerUp();
      }
    });

    map.on('click', (e) => {
      if (isDrawingSubplot) {
        handleDrawingClick(e.latlng);
      }
    });

    // Touch events on map container for mobile field devices
    const mapEl = document.getElementById('map');
    mapEl.addEventListener('touchstart', (e) => {
      if (isDrawingSubplot && drawingMode === 'line' && e.touches.length === 1) {
        const touch = e.touches[0];
        const point = map.mouseEventToContainerPoint(touch);
        const latlng = map.containerPointToLatLng(point);
        if (isInsideMainPlot(latlng.lat, latlng.lng)) {
          e.preventDefault();
          handleMapDrawPointerDown(latlng);
        }
      }
    }, { passive: false });

    mapEl.addEventListener('touchmove', (e) => {
      if (isDrawingSubplot && drawingMode === 'line' && isMouseDownDrawing && e.touches.length === 1) {
        e.preventDefault();
        const touch = e.touches[0];
        const point = map.mouseEventToContainerPoint(touch);
        const latlng = map.containerPointToLatLng(point);
        handleMapDrawPointerMove(latlng);
      }
    }, { passive: false });

    mapEl.addEventListener('touchend', () => {
      if (isDrawingSubplot && drawingMode === 'line' && isMouseDownDrawing) {
        handleMapDrawPointerUp();
      }
    });

    // Re-render visible plots & subplots on map move/zoom
    map.on('moveend', () => {
      throttledRenderVisiblePlots();
      renderAllStoredSubplotsOnMap();
    });
    map.on('zoomend', () => {
      throttledRenderVisiblePlots();
      renderAllStoredSubplotsOnMap();
    });

    renderAllStoredSubplotsOnMap();
  }

  // --- Load Plot Data ---
  async function loadPlotData() {
    showToast('Loading plot data...');

    try {
      // 1. Fetch search index & hierarchy first (small file, loads fast)
      const indexResp = await fetch('data/index.json');
      if (!indexResp.ok) throw new Error(`HTTP ${indexResp.status} loading index.json`);
      const indexData = await indexResp.json();
      searchIndex = indexData.plots || [];
      hierarchy = indexData.hierarchy || {};

      populateSiteFilter();
      filterStatusText.textContent = `${searchIndex.length.toLocaleString()} plots ready`;

      // 2. Fetch GeoJSON geometries (large file)
      const geoResp = await fetch('data/plots.geojson');
      if (!geoResp.ok) throw new Error(`HTTP ${geoResp.status} loading plots.geojson`);
      plotsGeojson = await geoResp.json();

      // Store all features for viewport-based rendering
      allFeatures = plotsGeojson.features || [];
      console.log(`[Data] Loaded ${allFeatures.length} plot features`);

      // Initial render: all plots (first load at country-level zoom)
      renderGeoJsonLayer(plotsGeojson);
      showToast(`${searchIndex.length.toLocaleString()} plots loaded`);
    } catch (err) {
      console.error('Error loading plot data:', err);
      showToast(`Error loading plots: ${err.message}`);
    }
  }

  // --- Render Plots on Map ---
  function renderGeoJsonLayer(geojson) {
    if (geojsonLayer) {
      map.removeLayer(geojsonLayer);
      plotLayersById.clear();
      renderedIds.clear();
    }

    if (!geojson || !geojson.features || geojson.features.length === 0) {
      console.warn('[Render] No features to render');
      return;
    }

    try {
      geojsonLayer = L.geoJSON(geojson, {
        style: () => ({
          color: '#E4A834',
          weight: 1.5,
          fillColor: '#22c55e',
          fillOpacity: 0.35,
          smoothFactor: 1.5
        }),
        onEachFeature: (feature, layer) => {
          const p = feature.properties;
          if (p && p.id !== undefined) {
            plotLayersById.set(p.id, layer);
            renderedIds.add(p.id);
          }

          // Click on plot polygon
          layer.on('click', (e) => {
            if (isDrawingSubplot) {
              handleDrawingClick(e.latlng);
              return;
            }
            L.DomEvent.stopPropagation(e);
            if (p) {
              // Sync with searchIndex to get full plot object
              const fullPlot = searchIndex.find(s => s.id === p.id) || p;
              selectPlot(fullPlot);
              openPlotMapPopup(fullPlot, layer, e.latlng);
            }
          });

          // Tooltip on hover
          if (p) {
            layer.bindTooltip(
              `<b>${p.family_id}</b> · Plot ${p.plot_id}<br><small>${p.village}</small>`,
              { className: 'plot-label-tooltip', direction: 'top', sticky: true }
            );
          }
        }
      }).addTo(map);

      console.log(`[Render] Rendered ${geojson.features.length} plots on map`);
    } catch (err) {
      console.error('[Render] GeoJSON layer error:', err);
      showToast('Error rendering plots on map');
    }
  }

  // --- Viewport-based rendering for performance ---
  function throttledRenderVisiblePlots() {
    // Only activate viewport filtering at higher zoom levels
    const zoom = map.getZoom();
    if (zoom < 12 || allFeatures.length === 0) return;

    clearTimeout(renderThrottle);
    renderThrottle = setTimeout(() => {
      renderVisiblePlots();
    }, 300);
  }

  function renderVisiblePlots() {
    if (!map || allFeatures.length === 0) return;
    const zoom = map.getZoom();
    // At low zoom, render all (overview mode)
    if (zoom < 12) return;

    const bounds = map.getBounds().pad(0.5); // 50% buffer around viewport

    const visibleFeatures = allFeatures.filter(f => {
      const bbox = f.properties && f.properties.bbox;
      if (!bbox) return true; // Include if no bbox
      // bbox stored as [minLat, minLng, maxLat, maxLng]
      const [minLat, minLng, maxLat, maxLng] = bbox;
      return bounds.intersects([[minLat, minLng], [maxLat, maxLng]]);
    });

    const newGeojson = { type: 'FeatureCollection', features: visibleFeatures };
    renderGeoJsonLayer(newGeojson);
  }

  // --- Interactive Plot Map Popup ---
  function openPlotMapPopup(plotProps, layer, latlng) {
    const plotSubplots = subplots.filter((s) => s.parent_plot_id === plotProps.id);
    const subplotsCount = plotSubplots.length;

    let subplotsSummary = `${subplotsCount} subplots sketched`;
    if (subplotsCount > 0) {
      const varieties = [...new Set(plotSubplots.map((s) => s.variety))].join(', ');
      subplotsSummary = `<b>${subplotsCount} subplots:</b> ${escapeHtml(varieties)}`;
    }

    const popupHtml = `
      <div class="plot-popup-content">
        <div class="popup-title">Family ${escapeHtml(plotProps.family_id)} · Plot ${escapeHtml(plotProps.plot_id)}</div>
        <div class="popup-meta"><b>${plotProps.area_ha || 0} ha</b> · ${escapeHtml(plotProps.village)}, ${escapeHtml(plotProps.site)}</div>
        <div class="popup-meta">${subplotsSummary}</div>
        <button class="popup-draw-btn" id="popup-draw-btn-${plotProps.id}" onclick="window.ibisStartSubplotDrawing && window.ibisStartSubplotDrawing(${plotProps.id})">
          ✏️ + Draw Subplot
        </button>
      </div>
    `;

    const popup = L.popup({
      offset: [0, -10],
      className: 'ibis-plot-popup'
    })
      .setLatLng(latlng || [plotProps.lat, plotProps.lng])
      .setContent(popupHtml)
      .openOn(map);

    setTimeout(() => {
      const drawBtn = document.getElementById(`popup-draw-btn-${plotProps.id}`);
      if (drawBtn) {
        drawBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          map.closePopup();
          startSubplotDrawing(plotProps);
        });
      }
    }, 50);
  }

  // Expose for inline popup button
  window.ibisStartSubplotDrawing = function (plotId) {
    map.closePopup();
    let plot = searchIndex.find((p) => p.id === plotId);
    if (!plot && selectedPlot && selectedPlot.id === plotId) plot = selectedPlot;
    if (plot) startSubplotDrawing(plot);
  };

  // --- Plot Selection & Drawer Display ---
  function selectPlot(plotProps, shouldFly = true) {
    selectedPlot = plotProps;
    renderAllStoredSubplotsOnMap();

    // Reset previous layer highlight
    if (selectedLayer) {
      try {
        selectedLayer.setStyle({
          color: '#E4A834',
          weight: 1.5,
          fillColor: '#22c55e',
          fillOpacity: 0.35
        });
      } catch(e) { /* layer may have been removed */ }
      selectedLayer = null;
    }

    // Helper to apply highlight to a layer
    function highlightLayer(lyr) {
      selectedLayer = lyr;
      selectedLayer.setStyle({
        color: '#00f0ff',
        weight: 3.5,
        fillColor: '#ffdd00',
        fillOpacity: 0.65
      });
      selectedLayer.bringToFront();
    }

    // Try to highlight existing layer
    const existingLayer = plotLayersById.get(plotProps.id);
    if (existingLayer) {
      highlightLayer(existingLayer);
      if (shouldFly) {
        if (existingLayer.getBounds) {
          map.flyToBounds(existingLayer.getBounds(), { maxZoom: 17, duration: 1.2, padding: [60, 60] });
        } else {
          map.flyTo([plotProps.lat, plotProps.lng], 16, { duration: 1.2 });
        }
      }
    } else if (shouldFly && plotProps.lat && plotProps.lng) {
      // Plot layer not yet rendered - fly to location and re-highlight after render
      map.flyTo([plotProps.lat, plotProps.lng], 16, { duration: 1.2 });

      // After flying, ensure the plot is rendered and highlighted
      const onMoveEnd = () => {
        map.off('moveend', onMoveEnd);
        // Ensure this plot's feature is in the rendered layer
        const feature = allFeatures.find(f => f.properties && f.properties.id === plotProps.id);
        if (feature && !plotLayersById.has(plotProps.id)) {
          // Add just this one feature to render
          const singleFeature = { type: 'FeatureCollection', features: [feature] };
          try {
            const tmpLayer = L.geoJSON(singleFeature, {
              style: () => ({
                color: '#00f0ff',
                weight: 3.5,
                fillColor: '#ffdd00',
                fillOpacity: 0.65,
                smoothFactor: 1.5
              })
            }).addTo(map);
            // Track as selected layer so it gets reset on next selection
            selectedLayer = { setStyle: () => {}, getBounds: () => tmpLayer.getBounds() };
          } catch(e) { console.warn('Could not render single plot:', e); }
        } else {
          const lyr = plotLayersById.get(plotProps.id);
          if (lyr) highlightLayer(lyr);
        }
      };
      map.on('moveend', onMoveEnd);
    }

    // Populate bottom card
    drawerEmptyState.style.display = 'none';
    drawerPlotInfo.style.display = 'flex';

    cardSite.textContent = `${plotProps.site} · ${plotProps.commune || 'Cambodia'}`;
    cardFamily.textContent = plotProps.family_id;
    cardPlot.textContent = plotProps.plot_id;
    cardArea.textContent = plotProps.area_ha ? plotProps.area_ha.toFixed(2) : '0.00';
    cardVillage.textContent = plotProps.village;
    cardCommune.textContent = plotProps.commune || 'N/A';
    cardYear.textContent = plotProps.year_join || 'N/A';
    cardCoords.textContent = `${plotProps.lat.toFixed(5)}, ${plotProps.lng.toFixed(5)}`;

    // Update subplots list in drawer
    renderSubplotsListForSelectedPlot();

    // Load ICS 2026 inspection workflow data for this plot & farmer
    loadICSInspectionForSelectedPlot();

    // Open drawer
    plotDrawer.classList.remove('closed');

    // If walking compass is active, update target
    if (isWalkingMode) {
      updateCompassHUD();
    }
  }

  // --- Subplot Separation & Labeling Workflow (Fullscreen Mode) ---

  // Segment-Segment Intersection (coordinates in [lat, lng])
  function getSegmentIntersection(p1, p2, p3, p4) {
    const x1 = p1[1], y1 = p1[0]; // lng, lat
    const x2 = p2[1], y2 = p2[0];
    const x3 = p3[1], y3 = p3[0];
    const x4 = p4[1], y4 = p4[0];

    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if (Math.abs(denom) < 1e-12) return null; // Parallel or collinear

    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

    if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
      const intLat = y1 + ua * (y2 - y1);
      const intLng = x1 + ua * (x2 - x1);
      return [intLat, intLng, ua];
    }
    return null;
  }

  // Clip polyline coordinates so they strictly stay inside main plot boundary
  function clipPolylineToMainPlot(rawPoints) {
    if (!rawPoints || rawPoints.length < 2) return null;
    if (!drawingBoundaryRings || drawingBoundaryRings.length === 0) return rawPoints;

    const validSegments = [];

    for (let i = 0; i < rawPoints.length - 1; i++) {
      const p1 = rawPoints[i];
      const p2 = rawPoints[i + 1];

      // Find all boundary intersection t values along (p1 -> p2)
      const cuts = [0, 1];

      for (let r = 0; r < drawingBoundaryRings.length; r++) {
        const ring = drawingBoundaryRings[r];
        for (let j = 0; j < ring.length - 1; j++) {
          const r1 = ring[j];
          const r2 = ring[j + 1];
          const hit = getSegmentIntersection(p1, p2, r1, r2);
          if (hit && hit[2] > 0.0001 && hit[2] < 0.9999) {
            cuts.push(hit[2]);
          }
        }
      }

      cuts.sort((a, b) => a - b);

      // Deduplicate cuts
      const uniqueCuts = [];
      for (let c = 0; c < cuts.length; c++) {
        if (c === 0 || Math.abs(cuts[c] - cuts[c - 1]) > 0.0001) {
          uniqueCuts.push(cuts[c]);
        }
      }

      // Check each sub-interval
      for (let c = 0; c < uniqueCuts.length - 1; c++) {
        const t1 = uniqueCuts[c];
        const t2 = uniqueCuts[c + 1];
        const midT = (t1 + t2) / 2;
        const midLat = p1[0] + midT * (p2[0] - p1[0]);
        const midLng = p1[1] + midT * (p2[1] - p1[1]);

        if (isInsideMainPlot(midLat, midLng)) {
          const segPt1 = [p1[0] + t1 * (p2[0] - p1[0]), p1[1] + t1 * (p2[1] - p1[1])];
          const segPt2 = [p1[0] + t2 * (p2[0] - p1[0]), p1[1] + t2 * (p2[1] - p1[1])];
          validSegments.push([segPt1, segPt2]);
        }
      }
    }

    if (validSegments.length === 0) return null;

    // Stitch connected segments into continuous paths
    const paths = [];
    let currentPath = [validSegments[0][0], validSegments[0][1]];

    for (let s = 1; s < validSegments.length; s++) {
      const prevEnd = currentPath[currentPath.length - 1];
      const segStart = validSegments[s][0];
      const segEnd = validSegments[s][1];

      const dist = Math.hypot(prevEnd[0] - segStart[0], prevEnd[1] - segStart[1]);
      if (dist < 0.00005) {
        currentPath.push(segEnd);
      } else {
        paths.push(currentPath);
        currentPath = [segStart, segEnd];
      }
    }
    paths.push(currentPath);

    // Return the longest valid continuous stroke inside the plot
    paths.sort((a, b) => b.length - a.length);
    return paths[0];
  }

  function startSubplotDrawing(plot) {
    if (!plot) plot = selectedPlot;
    if (!plot) {
      showToast('Please select a plot first to separate subplots');
      return;
    }

    drawingMainPlot = plot;
    isDrawingSubplot = true;
    drawingUndoStack = [];
    drawingSessionLayers = [];
    pendingClickPoint = null;
    if (pendingClickMarker) { map.removeLayer(pendingClickMarker); pendingClickMarker = null; }
    if (tempStrokeLayer) { map.removeLayer(tempStrokeLayer); tempStrokeLayer = null; }

    // Snapshot state before session begins so Cancel can completely discard any changes
    sessionBackup = {
      plotId: plot.id,
      divisionLines: JSON.parse(JSON.stringify(divisionLines[plot.id] || [])),
      subplots: JSON.parse(JSON.stringify(subplots))
    };

    // Extract main plot boundary rings
    extractDrawingBoundaryRings(plot);

    // Enter fullscreen drawing mode
    enterFullscreenDrawingMode(plot);

    // Show drawing HUD
    drawingHud.style.display = 'flex';
    drawingTargetLabel.textContent = `${plot.family_id} · Plot ${plot.plot_id}`;

    // Set mode to 'line' by default
    setDrawingMode('line');

    // Render existing division lines and subplots for this plot
    renderCurrentPlotDrawingSessionLayers(plot);

    updateDrawingStatusText();
    showToast('Freely draw lines across the plot to divide subplots');
  }

  // Extract boundary polygon rings from GeoJSON feature for containment checks
  function extractDrawingBoundaryRings(plot) {
    drawingBoundaryRings = [];
    const feature = allFeatures.find((f) => f.properties && f.properties.id === plot.id);
    if (!feature || !feature.geometry) return;

    const geom = feature.geometry;
    const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
    polys.forEach((poly) => {
      poly.forEach((ring) => {
        // GeoJSON ring: [lng, lat] -> convert to [lat, lng] for Leaflet
        drawingBoundaryRings.push(ring.map((pt) => [pt[1], pt[0]]));
      });
    });
  }

  // Check if [lat, lng] is inside ANY of the main plot's exterior rings
  function isInsideMainPlot(lat, lng) {
    if (!drawingBoundaryRings || drawingBoundaryRings.length === 0) return true;
    for (let ri = 0; ri < drawingBoundaryRings.length; ri++) {
      const ring = drawingBoundaryRings[ri];
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const rLat_i = ring[i][0], rLng_i = ring[i][1];
        const rLat_j = ring[j][0], rLng_j = ring[j][1];
        const intersect =
          rLat_i > lat !== rLat_j > lat &&
          lng < ((rLng_j - rLng_i) * (lat - rLat_i)) / (rLat_j - rLat_i) + rLng_i;
        if (intersect) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  }

  function enterFullscreenDrawingMode(plot) {
    isFullscreenDrawing = true;
    document.getElementById('top-bar').style.display = 'none';
    plotDrawer.classList.add('closed');
    compassHud.style.display = 'none';
    document.getElementById('map-wrapper').style.flex = '1';
    document.getElementById('app-container').classList.add('drawing-fullscreen');
    document.getElementById('map').classList.add('drawing-active');

    // Zoom to selected plot with generous padding
    const layer = plotLayersById.get(plot.id);
    if (layer && layer.getBounds) {
      map.flyToBounds(layer.getBounds(), { maxZoom: 19, padding: [60, 60], duration: 0.7 });
    } else if (plot.lat && plot.lng) {
      map.flyTo([plot.lat, plot.lng], 18, { duration: 0.7 });
    }

    showMainPlotGuide(plot);
  }

  function exitFullscreenDrawingMode() {
    isFullscreenDrawing = false;
    document.getElementById('top-bar').style.display = '';
    document.getElementById('app-container').classList.remove('drawing-fullscreen');
    document.getElementById('map').classList.remove('drawing-active');
    drawingHud.style.display = 'none';

    if (mainPlotGuideLayer) {
      map.removeLayer(mainPlotGuideLayer);
      mainPlotGuideLayer = null;
    }

    // Clean up temporary drawing session layers
    drawingSessionLayers.forEach((l) => map.removeLayer(l));
    drawingSessionLayers = [];

    if (tempStrokeLayer) { map.removeLayer(tempStrokeLayer); tempStrokeLayer = null; }
    if (pendingClickMarker) { map.removeLayer(pendingClickMarker); pendingClickMarker = null; }
    pendingClickPoint = null;
    isMouseDownDrawing = false;
    map.dragging.enable();
    isDrawingSubplot = false;
  }

  function showMainPlotGuide(plot) {
    if (mainPlotGuideLayer) {
      map.removeLayer(mainPlotGuideLayer);
      mainPlotGuideLayer = null;
    }
    if (drawingBoundaryRings.length === 0) return;

    const latLngs = drawingBoundaryRings.map((ring) => ring.map((pt) => L.latLng(pt[0], pt[1])));
    mainPlotGuideLayer = L.polygon(latLngs, {
      color: '#00ffcc',
      weight: 3,
      dashArray: '10, 6',
      fillOpacity: 0.07,
      fillColor: '#00ffcc',
      interactive: false,
      pane: 'subplotsPane'
    }).addTo(map);
  }

  function flashOutsideBoundary(latlng) {
    const flash = L.circleMarker([latlng.lat, latlng.lng], {
      radius: 14,
      color: '#ef4444',
      weight: 3,
      fillColor: '#ef4444',
      fillOpacity: 0.45,
      interactive: false
    }).addTo(map);
    setTimeout(() => map.removeLayer(flash), 600);
  }

  function setDrawingMode(mode) {
    drawingMode = mode;
    if (pendingClickMarker) {
      map.removeLayer(pendingClickMarker);
      pendingClickMarker = null;
    }
    pendingClickPoint = null;

    if (mode === 'line') {
      btnModeDrawLine.classList.add('active');
      btnModeAddLabel.classList.remove('active');
      map.getContainer().classList.add('drawing-active');
      updateDrawingStatusText();
    } else {
      btnModeDrawLine.classList.remove('active');
      btnModeAddLabel.classList.add('active');
      map.getContainer().classList.remove('drawing-active');
      drawingPointsCount.textContent = 'Tap inside any section on the map to add subplot details';
    }
  }

  function renderCurrentPlotDrawingSessionLayers(plot) {
    // Render existing division lines for this plot
    const lines = divisionLines[plot.id] || [];
    lines.forEach((lineCoords) => {
      renderSingleDivisionLine(lineCoords, true);
    });

    // Render existing subplots for this plot as draggable badges
    const plotSubplots = subplots.filter((s) => s.parent_plot_id === plot.id);
    plotSubplots.forEach((sp) => {
      renderSingleSubplotBadge(sp, true);
    });
  }

  function renderSingleDivisionLine(lineCoords, isDrawingSession = false) {
    const glow = L.polyline(lineCoords, {
      color: '#00f0ff',
      weight: 6,
      opacity: 0.45,
      lineCap: 'round',
      interactive: false,
      pane: 'subplotsPane'
    }).addTo(map);

    const bund = L.polyline(lineCoords, {
      color: '#facc15', // agricultural golden ridge
      weight: 3,
      dashArray: '6, 5',
      lineCap: 'round',
      interactive: false,
      pane: 'subplotsPane'
    }).addTo(map);

    if (isDrawingSession) {
      drawingSessionLayers.push(glow, bund);
    } else if (divisionLinesLayerGroup) {
      divisionLinesLayerGroup.addLayer(glow);
      divisionLinesLayerGroup.addLayer(bund);
    }

    return [glow, bund];
  }

  function createSubplotBadgeIcon(sp) {
    const style = getSubplotStyle(sp.variety);
    const html = `
      <div class="subplot-map-badge-wrap">
        <div class="subplot-map-badge ${style.class}">
          <div class="sp-line-top">
            <span class="sp-code">${escapeHtml(sp.code)}</span>
            <span class="sp-variety">${escapeHtml(sp.variety)}</span>
          </div>
          <div class="sp-line-bottom">
            <span class="sp-area">${sp.area_ha || 0} ha</span>
          </div>
        </div>
      </div>
    `;
    return L.divIcon({
      className: 'custom-subplot-divicon',
      html: html,
      iconSize: [110, 36],
      iconAnchor: [55, 18]
    });
  }

  function renderSingleSubplotBadge(sp, isDrawingSession = false) {
    const lat = sp.lat || (sp.coordinates && sp.coordinates[0] ? sp.coordinates[0][0] : 0);
    const lng = sp.lng || (sp.coordinates && sp.coordinates[0] ? sp.coordinates[0][1] : 0);
    if (!lat || !lng) return null;

    const marker = L.marker([lat, lng], {
      icon: createSubplotBadgeIcon(sp),
      draggable: isDrawingSession,
      pane: 'subplotsPane'
    });

    if (isDrawingSession) {
      marker.on('dragend', (e) => {
        const newPos = e.target.getLatLng();
        if (isInsideMainPlot(newPos.lat, newPos.lng)) {
          sp.lat = roundTo(newPos.lat, 6);
          sp.lng = roundTo(newPos.lng, 6);
          saveStoredSubplots();
          showToast(`Repositioned ${sp.code}`);
        } else {
          marker.setLatLng([sp.lat, sp.lng]);
          showToast('⚠️ Keep label inside the plot boundary');
        }
      });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (confirm(`Delete "${sp.code}" (${sp.variety})?`)) {
          deleteSubplot(sp.id);
          map.removeLayer(marker);
          updateDrawingStatusText();
        }
      });

      marker.addTo(map);
      drawingSessionLayers.push(marker);
    } else {
      marker.bindTooltip(
        `<b>${escapeHtml(sp.code)}</b> · ${escapeHtml(sp.variety)}<br>${sp.area_ha} ha (${sp.pct_of_parent || 0}%)<br>${escapeHtml(sp.notes || '')}`,
        { className: 'plot-label-tooltip', sticky: true, direction: 'top' }
      );
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        const parentPlot = searchIndex.find((p) => p.id === sp.parent_plot_id);
        if (parentPlot) {
          selectPlot(parentPlot, false);
        }
        showToast(`${sp.code}: ${sp.variety} · ${sp.area_ha} ha`);
      });
      if (subplotsLayerGroup) {
        subplotsLayerGroup.addLayer(marker);
      }
    }

    return marker;
  }

  // Pointer & Drag Handlers for Freehand Dividing Lines
  function handleMapDrawPointerDown(latlng) {
    if (!isDrawingSubplot || drawingMode !== 'line') return;
    isMouseDownDrawing = true;
    currentStrokePoints = [[latlng.lat, latlng.lng]];
    map.dragging.disable();
  }

  function handleMapDrawPointerMove(latlng) {
    if (!isMouseDownDrawing || !isDrawingSubplot || drawingMode !== 'line') return;
    const lastPt = currentStrokePoints[currentStrokePoints.length - 1];
    const dist = Math.hypot(latlng.lat - lastPt[0], latlng.lng - lastPt[1]);
    if (dist > 0.00003) {
      currentStrokePoints.push([latlng.lat, latlng.lng]);
      updateStrokePreview();
    }
  }

  function handleMapDrawPointerUp() {
    if (!isMouseDownDrawing) return;
    isMouseDownDrawing = false;
    map.dragging.enable();

    if (currentStrokePoints.length >= 2) {
      commitDrawnLine(currentStrokePoints);
    }
    clearStrokePreview();
  }

  function updateStrokePreview() {
    if (tempStrokeLayer) {
      map.removeLayer(tempStrokeLayer);
    }
    if (currentStrokePoints.length >= 2) {
      tempStrokeLayer = L.polyline(currentStrokePoints, {
        color: '#facc15',
        weight: 3.5,
        dashArray: '6, 5',
        opacity: 0.85,
        interactive: false,
        pane: 'subplotsPane'
      }).addTo(map);
    }
  }

  function clearStrokePreview() {
    if (tempStrokeLayer) {
      map.removeLayer(tempStrokeLayer);
      tempStrokeLayer = null;
    }
    currentStrokePoints = [];
  }

  function commitDrawnLine(rawPoints) {
    const clipped = clipPolylineToMainPlot(rawPoints);
    if (!clipped || clipped.length < 2) {
      flashOutsideBoundary({ lat: rawPoints[0][0], lng: rawPoints[0][1] });
      showToast('⚠️ Line must cross inside the plot boundary');
      return;
    }

    if (!divisionLines[drawingMainPlot.id]) {
      divisionLines[drawingMainPlot.id] = [];
    }
    divisionLines[drawingMainPlot.id].push(clipped);

    const layers = renderSingleDivisionLine(clipped, true);

    drawingUndoStack.push({
      type: 'line',
      lineData: clipped,
      layers: layers,
      plotId: drawingMainPlot.id
    });

    if (pendingClickMarker) {
      map.removeLayer(pendingClickMarker);
      pendingClickMarker = null;
    }
    pendingClickPoint = null;

    btnUndoPoint.disabled = false;
    btnFinishDrawing.disabled = false;

    updateDrawingStatusText();
    showToast('Line added! Tap "+ Add Subplot" to label sections, or draw another line.');
  }

  function handleDrawingClick(latlng) {
    if (!isDrawingSubplot) return;

    if (drawingMode === 'label') {
      // User tapped in label mode -> add subplot info
      if (!isInsideMainPlot(latlng.lat, latlng.lng)) {
        flashOutsideBoundary(latlng);
        showToast('⚠️ Tap inside a subplot section within the boundary');
        return;
      }
      openAddSubplotModal(latlng);
    } else if (drawingMode === 'line') {
      // Tap-tap straight bund fallback (click point A then point B across plot)
      if (!isInsideMainPlot(latlng.lat, latlng.lng)) {
        flashOutsideBoundary(latlng);
        showToast('⚠️ Tap inside the plot boundary');
        return;
      }

      if (!pendingClickPoint) {
        pendingClickPoint = [latlng.lat, latlng.lng];
        pendingClickMarker = L.circleMarker([latlng.lat, latlng.lng], {
          radius: 6,
          color: '#facc15',
          fillColor: '#facc15',
          fillOpacity: 0.9,
          pane: 'subplotsPane'
        }).addTo(map);
        drawingPointsCount.textContent = 'Tap second point across the plot to complete dividing line';
      } else {
        commitDrawnLine([pendingClickPoint, [latlng.lat, latlng.lng]]);
      }
    }
  }

  let currentModalRemainingPct = 100;
  let currentModalRemainingHa = 1.0;
  let currentModalUsedPct = 0;
  let currentModalParentHa = 1.0;

  function validateSubplotAllocation() {
    if (!drawingMainPlot) return;
    const parentHa = currentModalParentHa;
    const remainingPct = currentModalRemainingPct;
    const remainingHa = currentModalRemainingHa;
    const usedPct = currentModalUsedPct;

    const pct = parseFloat(subplotAreaPct.value);
    const ha = parseFloat(subplotAreaHa.value);

    if (isNaN(pct) || pct <= 0 || isNaN(ha) || ha <= 0) {
      if (allocWarning) allocWarning.style.display = 'none';
      if (btnSaveSubplot) btnSaveSubplot.disabled = true;
      if (allocMeterCurrent) allocMeterCurrent.style.width = '0%';
      return;
    }

    const currentTotalPct = roundTo(usedPct + pct, 1);

    if (pct > (remainingPct + 0.05)) {
      if (allocWarning) {
        allocWarning.style.display = 'block';
        allocWarning.className = 'alloc-warning error';
        allocWarning.innerHTML = `❌ <b>Exceeds 100%!</b> Maximum available is <b>${remainingPct}%</b> (${remainingHa} ha). Total subplots cannot exceed the main plot area.`;
      }
      subplotAreaPct.style.borderColor = '#ef4444';
      subplotAreaHa.style.borderColor = '#ef4444';
      if (btnSaveSubplot) btnSaveSubplot.disabled = true;
      if (allocMeterCurrent) {
        allocMeterCurrent.style.width = `${Math.min(100 - usedPct, remainingPct)}%`;
        allocMeterCurrent.style.background = '#ef4444';
      }
    } else {
      subplotAreaPct.style.borderColor = '';
      subplotAreaHa.style.borderColor = '';
      if (btnSaveSubplot) btnSaveSubplot.disabled = false;
      if (allocMeterCurrent) {
        allocMeterCurrent.style.width = `${Math.min(100 - usedPct, pct)}%`;
        allocMeterCurrent.style.background = 'linear-gradient(90deg, #facc15, #eab308)';
      }

      const afterRemaining = Math.max(0, roundTo(remainingPct - pct, 1));
      if (allocWarning) {
        allocWarning.style.display = 'block';
        if (afterRemaining <= 0.05) {
          allocWarning.className = 'alloc-warning success';
          allocWarning.innerHTML = `✅ <b>Exactly 100% allocated</b> (${parentHa} ha total). Perfect!`;
        } else {
          allocWarning.className = 'alloc-warning info';
          allocWarning.innerHTML = `ℹ️ Total will be <b>${currentTotalPct}%</b> · Leaves <b>${afterRemaining}%</b> (${roundTo((afterRemaining / 100) * parentHa, 2)} ha) unallocated.`;
        }
      }
    }
  }

  function openAddSubplotModal(latlng) {
    pendingSubplotLatLng = [latlng.lat, latlng.lng];

    const plotSubplots = subplots.filter((s) => s.parent_plot_id === drawingMainPlot.id);
    const parentHa = drawingMainPlot.area_ha || 1.0;
    const usedPct = roundTo(plotSubplots.reduce((acc, s) => acc + (parseFloat(s.pct_of_parent) || 0), 0), 1);
    const remainingPct = Math.max(0, roundTo(100 - usedPct, 1));
    const usedHa = roundTo(plotSubplots.reduce((acc, s) => acc + (parseFloat(s.area_ha) || 0), 0), 2);
    const remainingHa = Math.max(0, roundTo((remainingPct / 100) * parentHa, 2));

    if (remainingPct <= 0.05 || remainingHa <= 0.005) {
      showToast(`⚠️ Plot ${drawingMainPlot.plot_id} is already 100% allocated (${parentHa} ha across ${plotSubplots.length} subplots). Delete or adjust a subplot to reallocate.`);
      return;
    }

    currentModalParentHa = parentHa;
    currentModalUsedPct = usedPct;
    currentModalRemainingPct = remainingPct;
    currentModalRemainingHa = remainingHa;

    modalPlotRef.textContent = `Family ${drawingMainPlot.family_id} · Plot ${drawingMainPlot.plot_id} (${drawingMainPlot.village})`;

    // Banner stats
    if (allocMainHa) allocMainHa.textContent = `${parentHa.toFixed(2)} ha`;
    if (allocRemainingPct) allocRemainingPct.textContent = `${remainingPct}%`;
    if (allocRemainingHa) allocRemainingHa.textContent = `${remainingHa.toFixed(2)} ha`;
    if (allocMeterUsed) allocMeterUsed.style.width = `${Math.min(100, usedPct)}%`;

    // Default to full remaining allocation so it naturally sums to 100%
    subplotAreaPct.value = remainingPct;
    subplotAreaHa.value = remainingHa;

    // Do not prefill default name - use placeholder as requested
    subplotCode.value = '';
    subplotCode.placeholder = 'Please enter subplot name';
    subplotVariety.value = 'Phka Rumduol';
    customVarietyGroup.style.display = 'none';
    subplotCustomVariety.value = '';
    subplotNotes.value = '';

    validateSubplotAllocation();

    subplotModal.style.display = 'flex';
    setTimeout(() => subplotCode.focus(), 80);
  }

  function updateDrawingStatusText() {
    if (!drawingMainPlot) return;
    const lines = divisionLines[drawingMainPlot.id] || [];
    const plotSubplots = subplots.filter((s) => s.parent_plot_id === drawingMainPlot.id);
    const totalAllocatedPct = roundTo(
      plotSubplots.reduce((acc, s) => acc + (parseFloat(s.pct_of_parent) || 0), 0),
      1
    );

    if (drawingMode === 'label') {
      if (totalAllocatedPct >= 99.5) {
        drawingPointsCount.textContent = `✓ 100% allocated (${plotSubplots.length} subplots). Tap "Done" to save.`;
      } else {
        drawingPointsCount.textContent = `Allocated: ${totalAllocatedPct}% (${roundTo(100 - totalAllocatedPct, 1)}% unallocated). Tap section to label.`;
      }
    } else {
      if (lines.length === 0) {
        drawingPointsCount.textContent = 'Freely draw a line across the plot to divide subplots';
      } else {
        drawingPointsCount.textContent = `${lines.length} separation line${lines.length > 1 ? 's' : ''} · ${plotSubplots.length} labeled (${totalAllocatedPct}%). Tap "+ Add Subplot" or Done.`;
      }
    }

    btnUndoPoint.disabled = drawingUndoStack.length === 0;
    btnFinishDrawing.disabled = (lines.length === 0 && plotSubplots.length === 0);
  }

  function undoLastAction() {
    if (drawingUndoStack.length === 0) return;
    const item = drawingUndoStack.pop();

    if (item.type === 'line') {
      if (divisionLines[item.plotId]) {
        const idx = divisionLines[item.plotId].lastIndexOf(item.lineData);
        if (idx !== -1) divisionLines[item.plotId].splice(idx, 1);
      }
      if (item.layers) {
        item.layers.forEach((l) => map.removeLayer(l));
      }
      showToast('Undid separation line');
    } else if (item.type === 'subplot') {
      subplots = subplots.filter((s) => s.id !== item.subplot.id);
      if (item.marker) {
        map.removeLayer(item.marker);
      }
      showToast(`Undid ${item.subplot.code}`);
    }

    updateDrawingStatusText();
  }

  function finishSubplotDrawing() {
    if (!drawingMainPlot) return;
    const plotSubplots = subplots.filter((s) => s.parent_plot_id === drawingMainPlot.id);
    const parentHa = drawingMainPlot.area_ha || 1.0;

    // Subplots must total 100% of the main plot
    if (plotSubplots.length > 0) {
      const totalPct = roundTo(
        plotSubplots.reduce((acc, s) => acc + (parseFloat(s.pct_of_parent) || 0), 0),
        1
      );

      if (totalPct < 99.0) {
        const remainingPct = roundTo(100 - totalPct, 1);
        const remainingHa = roundTo((remainingPct / 100) * parentHa, 2);
        alert(
          `⚠️ Total subplots must equal 100% of the main plot area.\n\n` +
          `Current subplots total: ${totalPct}%\n` +
          `Remaining unallocated: ${remainingPct}% (${remainingHa} ha).\n\n` +
          `Please tap "+ Add Subplot" to assign the remaining parcel before finishing.`
        );
        return;
      }

      if (totalPct > 101.0) {
        alert(
          `⚠️ Total subplots exceed 100% (${totalPct}%).\n\n` +
          `Please adjust or delete subplots so the total equals 100%.`
        );
        return;
      }

      // If minor decimal rounding discrepancy, adjust the last subplot so it sums exactly to 100.0%
      if (Math.abs(totalPct - 100) > 0.001) {
        const otherPcts = roundTo(
          plotSubplots.slice(0, -1).reduce((acc, s) => acc + (parseFloat(s.pct_of_parent) || 0), 0),
          1
        );
        const lastSp = plotSubplots[plotSubplots.length - 1];
        lastSp.pct_of_parent = roundTo(100 - otherPcts, 1);
        lastSp.area_ha = roundTo((lastSp.pct_of_parent / 100) * parentHa, 2);
        lastSp.area_m2 = Math.round(lastSp.area_ha * 10000);
      }
    }

    // Commit all changes made in this session
    sessionBackup = null;
    saveStoredSubplots();
    exitFullscreenDrawingMode();
    renderAllStoredSubplotsOnMap();
    if (selectedPlot) {
      renderSubplotsListForSelectedPlot();
      plotDrawer.classList.remove('closed');
    }
    showToast(`✅ Saved subplots for Plot ${drawingMainPlot ? drawingMainPlot.plot_id : ''} (100% allocated)`);
  }

  function cancelSubplotDrawing() {
    // Completely discard all unsaved changes from the current session
    if (sessionBackup) {
      if (sessionBackup.divisionLines && sessionBackup.divisionLines.length > 0) {
        divisionLines[sessionBackup.plotId] = JSON.parse(JSON.stringify(sessionBackup.divisionLines));
      } else {
        delete divisionLines[sessionBackup.plotId];
      }
      subplots = JSON.parse(JSON.stringify(sessionBackup.subplots));
      sessionBackup = null;
      saveStoredSubplots();
    }

    if (pendingClickMarker) {
      map.removeLayer(pendingClickMarker);
      pendingClickMarker = null;
    }
    if (tempStrokeLayer) {
      map.removeLayer(tempStrokeLayer);
      tempStrokeLayer = null;
    }
    pendingClickPoint = null;
    isMouseDownDrawing = false;
    currentStrokePoints = [];

    drawingSessionLayers.forEach((l) => map.removeLayer(l));
    drawingSessionLayers = [];
    drawingUndoStack = [];

    exitFullscreenDrawingMode();
    renderAllStoredSubplotsOnMap();
    if (selectedPlot) {
      renderSubplotsListForSelectedPlot();
      plotDrawer.classList.remove('closed');
    }
    showToast('Drawing cancelled — unsaved changes discarded');
  }

  function clearCurrentPlotDivisionLines() {
    if (!drawingMainPlot) return;
    if (confirm(`Clear all dividing lines for Plot ${drawingMainPlot.plot_id}?`)) {
      delete divisionLines[drawingMainPlot.id];
      drawingSessionLayers = drawingSessionLayers.filter((layer) => {
        if (layer instanceof L.Polyline && !(layer instanceof L.Polygon)) {
          map.removeLayer(layer);
          return false;
        }
        return true;
      });
      drawingUndoStack = drawingUndoStack.filter((item) => item.type !== 'line');
      updateDrawingStatusText();
      showToast('Dividing lines cleared');
    }
  }

  function onSubplotFormSubmit(e) {
    e.preventDefault();

    const code = subplotCode.value.trim() || 'Subplot';
    let variety = subplotVariety.value;
    if (variety === 'Other') {
      const customVal = subplotCustomVariety.value.trim();
      variety = customVal ? customVal : 'Other';
    }

    const notes = subplotNotes.value.trim();
    const currentPlot = drawingMainPlot || selectedPlot;
    const parentHa = (currentPlot && currentPlot.area_ha) ? currentPlot.area_ha : 1;

    const pct = parseFloat(subplotAreaPct.value) || 0;
    const areaHa = parseFloat(subplotAreaHa.value) || roundTo((pct / 100) * parentHa, 2);

    if (pct <= 0) {
      alert('⚠️ Please enter a percentage greater than 0%.');
      return;
    }

    // Extended ICS 2026 fields
    const seedSource = document.getElementById('sp-seed-source') ? document.getElementById('sp-seed-source').value : 'Own saved';
    const seedKg = parseFloat(document.getElementById('sp-seed-kg')?.value) || 0;
    const plantingDate = document.getElementById('sp-planting-date')?.value || '';
    const plantingMethod = document.getElementById('sp-planting-method')?.value || 'Direct seeding';
    const fertApplied = document.getElementById('sp-fertilizer-toggle')?.value === 'yes';
    const fertTypes = getChipValues('#sp-fertilizer-chips');
    const fertQty = parseFloat(document.getElementById('sp-fertilizer-qty')?.value) || 0;
    const fertDate = document.getElementById('sp-fertilizer-date')?.value || '';
    const protApplied = document.getElementById('sp-protection-toggle')?.value === 'yes';
    const protAction = document.getElementById('sp-protection-action')?.value.trim() || '';
    const protQty = parseFloat(document.getElementById('sp-protection-qty')?.value) || 0;
    const protDate = document.getElementById('sp-protection-date')?.value || '';
    const expYield = parseFloat(document.getElementById('sp-expected-yield')?.value) || 0;
    const expSale = parseFloat(document.getElementById('sp-expected-sale')?.value) || 0;

    // Case 1: Updating an existing subplot (from drawer "Inspect" action)
    if (editingSubplotInstance) {
      editingSubplotInstance.code = code;
      editingSubplotInstance.variety = variety;
      editingSubplotInstance.notes = notes;
      editingSubplotInstance.pct_of_parent = pct;
      editingSubplotInstance.area_ha = areaHa;
      editingSubplotInstance.area_m2 = Math.round(areaHa * 10000);
      editingSubplotInstance.seed_source = seedSource;
      editingSubplotInstance.seed_kg = seedKg;
      editingSubplotInstance.planting_date = plantingDate;
      editingSubplotInstance.planting_method = plantingMethod;
      editingSubplotInstance.fertilizer_applied = fertApplied;
      editingSubplotInstance.fertilizer_types = fertTypes;
      editingSubplotInstance.fertilizer_qty = fertQty;
      editingSubplotInstance.fertilizer_date = fertDate;
      editingSubplotInstance.crop_protection_applied = protApplied;
      editingSubplotInstance.protection_action = protAction;
      editingSubplotInstance.protection_qty = protQty;
      editingSubplotInstance.protection_date = protDate;
      editingSubplotInstance.expected_production_kg = expYield;
      editingSubplotInstance.expected_sale_kg = expSale;
      editingSubplotInstance.inspected = true;
      editingSubplotInstance.updated_at = new Date().toISOString();

      saveStoredSubplots();
      renderAllStoredSubplotsOnMap();
      renderSubplotsListForSelectedPlot();
      subplotModal.style.display = 'none';
      editingSubplotInstance = null;
      showToast(`Saved inspection: ${code} (${variety})`);
      return;
    }

    // Case 2: Adding a new subplot (during drawing session)
    if (!drawingMainPlot) {
      showToast('⚠️ No active plot drawing session');
      return;
    }

    const plotSubplots = subplots.filter((s) => s.parent_plot_id === drawingMainPlot.id);
    const usedPct = roundTo(plotSubplots.reduce((acc, s) => acc + (parseFloat(s.pct_of_parent) || 0), 0), 1);
    const remainingPct = Math.max(0, roundTo(100 - usedPct, 1));

    if (pct > (remainingPct + 0.1)) {
      alert(`⚠️ Cannot add subplot: ${pct}% exceeds the available remaining allocation (${remainingPct}%). Total subplots cannot exceed 100%.`);
      return;
    }

    const lat = pendingSubplotLatLng ? pendingSubplotLatLng[0] : drawingMainPlot.lat;
    const lng = pendingSubplotLatLng ? pendingSubplotLatLng[1] : drawingMainPlot.lng;

    const newSubplot = {
      id: 'sp_' + Date.now(),
      parent_plot_id: drawingMainPlot.id,
      parent_family_id: drawingMainPlot.family_id,
      parent_plot_num: drawingMainPlot.plot_id,
      parent_village: drawingMainPlot.village,
      parent_site: drawingMainPlot.site,
      parent_area_ha: drawingMainPlot.area_ha,
      code: code,
      variety: variety,
      notes: notes,
      area_ha: areaHa,
      area_m2: Math.round(areaHa * 10000),
      pct_of_parent: pct,
      lat: roundTo(lat, 6),
      lng: roundTo(lng, 6),
      coordinates: [[roundTo(lat, 6), roundTo(lng, 6)]],
      seed_source: seedSource,
      seed_kg: seedKg,
      planting_date: plantingDate,
      planting_method: plantingMethod,
      fertilizer_applied: fertApplied,
      fertilizer_types: fertTypes,
      fertilizer_qty: fertQty,
      fertilizer_date: fertDate,
      crop_protection_applied: protApplied,
      protection_action: protAction,
      protection_qty: protQty,
      protection_date: protDate,
      expected_production_kg: expYield,
      expected_sale_kg: expSale,
      inspected: true,
      created_at: new Date().toISOString()
    };

    subplots.push(newSubplot);

    // Create badge marker on map
    const badgeMarker = renderSingleSubplotBadge(newSubplot, true);

    drawingUndoStack.push({
      type: 'subplot',
      subplot: newSubplot,
      marker: badgeMarker
    });

    subplotModal.style.display = 'none';
    updateDrawingStatusText();
    showToast(`Added ${code}: ${variety} (${pct}%, ${areaHa} ha)`);
  }

  // --- Render Subplots on Leaflet Map ---
  function renderAllStoredSubplotsOnMap() {
    if (subplotsLayerGroup) subplotsLayerGroup.clearLayers();
    if (divisionLinesLayerGroup) divisionLinesLayerGroup.clearLayers();

    // Subplots & division lines should ONLY appear when zoomed in close (zoom >= 15)
    // to the selected plot, or during an active drawing session.
    // This keeps the wider map clean and uncluttered when viewing multiple plots.
    const currentZoom = map ? map.getZoom() : 0;
    const isCloseZoom = currentZoom >= 15;

    const activePlot = isFullscreenDrawing ? drawingMainPlot : (isCloseZoom ? selectedPlot : null);
    if (!activePlot) {
      return;
    }

    const targetPlotId = activePlot.id;

    // Render division lines for the active plot only
    const plotLines = divisionLines[targetPlotId] || [];
    plotLines.forEach((lineCoords) => {
      renderSingleDivisionLine(lineCoords, false);
    });

    // Render subplots (polygons if any, plus badge markers) for the active plot only
    subplots.forEach((sp) => {
      if (sp.parent_plot_id !== targetPlotId) return;

      if (sp.coordinates && sp.coordinates.length >= 3) {
        const style = getSubplotStyle(sp.variety);
        const poly = L.polygon(sp.coordinates, {
          pane: 'subplotsPane',
          color: style.borderColor,
          weight: 2,
          dashArray: '4, 4',
          fillColor: style.fillColor,
          fillOpacity: 0.35
        });
        poly.bindTooltip(
          `<b>${escapeHtml(sp.code)}</b> (${escapeHtml(sp.variety)})<br>${sp.area_ha} ha`,
          { className: 'plot-label-tooltip', sticky: true, direction: 'center' }
        );
        subplotsLayerGroup.addLayer(poly);
      }

      renderSingleSubplotBadge(sp, false);
    });
  }

  function getSubplotStyle(variety) {
    const v = (variety || '').toLowerCase();
    if (v.includes('rumduol')) {
      return { borderColor: '#e4a834', fillColor: '#facc15', class: 'variety-rumduol' };
    } else if (v.includes('red') || v.includes('jasmine')) {
      return { borderColor: '#dc2626', fillColor: '#ef4444', class: 'variety-redjasmine' };
    } else if (v.includes('local')) {
      return { borderColor: '#16a34a', fillColor: '#22c55e', class: 'variety-local' };
    } else if (v.includes('sticky')) {
      return { borderColor: '#d97706', fillColor: '#f59e0b', class: 'variety-stickyrice' };
    } else if (v.includes('fallow')) {
      return { borderColor: '#64748b', fillColor: '#94a3b8', class: 'variety-fallow' };
    }
    return { borderColor: '#0891b2', fillColor: '#06b6d4', class: 'variety-other' };
  }

  // --- Render Subplots in Bottom Sheet Drawer ---
  function renderSubplotsListForSelectedPlot() {
    if (!selectedPlot) {
      subplotsCountBadge.textContent = '0';
      subplotsList.innerHTML = '<div class="subplots-empty">Select a plot to view subplots.</div>';
      if (drawerAllocTracker) drawerAllocTracker.style.display = 'none';
      return;
    }

    const plotSubplots = subplots.filter((s) => s.parent_plot_id === selectedPlot.id);
    const plotLines = divisionLines[selectedPlot.id] || [];
    const parentHa = selectedPlot.area_ha || 1.0;
    subplotsCountBadge.textContent = plotSubplots.length.toString();

    // Allocation progress tracker
    if (drawerAllocTracker) {
      if (plotSubplots.length > 0) {
        drawerAllocTracker.style.display = 'flex';
        const totalPct = roundTo(
          plotSubplots.reduce((acc, s) => acc + (parseFloat(s.pct_of_parent) || 0), 0),
          1
        );
        const isComplete = totalPct >= 99.5;

        if (isComplete) {
          drawerAllocBadge.textContent = `✓ 100% (${parentHa.toFixed(2)} ha)`;
          drawerAllocBadge.className = 'tracker-badge complete';
          drawerAllocFill.style.width = '100%';
          drawerAllocFill.className = 'tracker-fill complete';
        } else {
          drawerAllocBadge.textContent = `${totalPct}% (${roundTo(100 - totalPct, 1)}% remaining)`;
          drawerAllocBadge.className = 'tracker-badge pending';
          drawerAllocFill.style.width = `${Math.min(100, totalPct)}%`;
          drawerAllocFill.className = 'tracker-fill';
        }
      } else {
        drawerAllocTracker.style.display = 'none';
      }
    }

    if (plotSubplots.length === 0 && plotLines.length === 0) {
      subplotsList.innerHTML = `
        <div class="subplots-empty">
          No subplots sketched yet. Tap <b>"+ Draw Subplot"</b> to sketch rice variety parcels for Plot ${escapeHtml(selectedPlot.plot_id)}.
        </div>
      `;
      return;
    }

    subplotsList.innerHTML = '';
    const frag = document.createDocumentFragment();

    // If dividing lines exist on this plot, show a banner with clear option
    if (plotLines.length > 0) {
      const linesBanner = document.createElement('div');
      linesBanner.style.cssText =
        'display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:rgba(250,204,21,0.12);border:1px solid rgba(250,204,21,0.3);border-radius:var(--radius-sm);font-size:0.8rem;color:#facc15;margin-bottom:8px;';
      linesBanner.innerHTML = `
        <span>🌾 <b>${plotLines.length}</b> Dividing Line${plotLines.length > 1 ? 's' : ''}</span>
        <button id="btn-drawer-clear-lines" style="background:transparent;border:none;color:#f87171;font-size:0.75rem;cursor:pointer;font-weight:700;display:flex;align-items:center;gap:3px;">
          ✕ Clear Lines
        </button>
      `;
      linesBanner.querySelector('#btn-drawer-clear-lines').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Remove all dividing lines for Plot ${selectedPlot.plot_id}?`)) {
          delete divisionLines[selectedPlot.id];
          saveStoredSubplots();
          renderAllStoredSubplotsOnMap();
          renderSubplotsListForSelectedPlot();
          showToast('Dividing lines removed');
        }
      });
      frag.appendChild(linesBanner);
    }

    plotSubplots.forEach((sp) => {
      const style = getSubplotStyle(sp.variety);
      const card = document.createElement('div');
      card.className = 'subplot-card-item';
      card.style.borderLeftColor = style.borderColor;

      const badges = buildSubplotCardBadges(sp);

      card.innerHTML = `
        <div class="subplot-card-info">
          <div class="subplot-card-header">
            <span class="subplot-card-code">${escapeHtml(sp.code)}</span>
            <span class="variety-tag ${style.class}">${escapeHtml(sp.variety)}</span>
            ${badges}
          </div>
          <div class="subplot-card-meta">
            <b>${sp.area_ha} ha</b> (${sp.pct_of_parent || 0}% of main plot)
            ${sp.notes ? ` · <span style="font-style: italic; color: var(--text-muted);">${escapeHtml(sp.notes)}</span>` : ''}
          </div>
        </div>
        <div class="subplot-card-actions">
          <button class="sp-inspect-btn" title="Record subplot inspection" data-sp-id="${escapeHtml(sp.id)}">Inspect</button>
          <button class="sp-harvest-btn" title="Record harvest" data-sp-id="${escapeHtml(sp.id)}">Harvest</button>
          <button class="subplot-action-btn delete-btn" title="Delete this subplot" aria-label="Delete subplot">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;

      // Zoom to subplot on card click
      card.addEventListener('click', (e) => {
        if (e.target.closest('.delete-btn') || e.target.closest('.sp-inspect-btn') || e.target.closest('.sp-harvest-btn')) return;
        const poly = L.polygon(sp.coordinates);
        map.flyToBounds(poly.getBounds(), { maxZoom: 18, duration: 1.0, padding: [80, 80] });
      });

      // Inspect button
      card.querySelector('.sp-inspect-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openSubplotInspectionModal(sp);
      });

      // Harvest button
      card.querySelector('.sp-harvest-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openHarvestModal(sp);
      });

      // Delete subplot
      const delBtn = card.querySelector('.delete-btn');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Delete "${sp.code}" (${sp.variety})?`)) {
          deleteSubplot(sp.id);
        }
      });

      frag.appendChild(card);
    });

    subplotsList.appendChild(frag);
  }

  function deleteSubplot(subplotId) {
    subplots = subplots.filter((s) => s.id !== subplotId);
    saveStoredSubplots();
    renderAllStoredSubplotsOnMap();
    renderSubplotsListForSelectedPlot();
    showToast('Subplot deleted');
  }

  // --- Export Subplots as GeoJSON ---
  function exportSubplotsGeoJSON() {
    const features = [];

    // Subplot features
    subplots.forEach((sp) => {
      const isPoly = sp.coordinates && sp.coordinates.length >= 3;
      const geom = isPoly
        ? {
            type: 'Polygon',
            coordinates: [sp.coordinates.map((pt) => [roundTo(pt[1], 6), roundTo(pt[0], 6)])]
          }
        : {
            type: 'Point',
            coordinates: [roundTo(sp.lng, 6), roundTo(sp.lat, 6)]
          };

      features.push({
        type: 'Feature',
        id: sp.id,
        properties: {
          feature_type: 'subplot',
          subplot_code: sp.code,
          rice_variety: sp.variety,
          area_ha: sp.area_ha,
          area_m2: sp.area_m2,
          pct_of_main_plot: sp.pct_of_parent,
          parent_family_id: sp.parent_family_id,
          parent_plot_id: sp.parent_plot_num,
          parent_village: sp.parent_village,
          parent_site: sp.parent_site,
          inspection_notes: sp.notes || '',
          created_at: sp.created_at
        },
        geometry: geom
      });
    });

    // Division Line features
    Object.keys(divisionLines).forEach((plotId) => {
      const lines = divisionLines[plotId] || [];
      lines.forEach((line, idx) => {
        features.push({
          type: 'Feature',
          properties: {
            feature_type: 'division_bund',
            parent_plot_id: parseInt(plotId, 10),
            line_number: idx + 1
          },
          geometry: {
            type: 'LineString',
            coordinates: line.map((pt) => [roundTo(pt[1], 6), roundTo(pt[0], 6)])
          }
        });
      });
    });

    if (features.length === 0) {
      showToast('No subplots or division lines have been sketched yet');
      return;
    }

    const geojson = {
      type: 'FeatureCollection',
      features: features
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ibis_rice_inspection_subplots_${new Date().toISOString().slice(0, 10)}.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Exported ${features.length} inspection features to GeoJSON`);
  }

  // --- Event Bindings ---
  function bindEvents() {
    // Quick Search Input
    quickSearchInput.addEventListener('input', handleQuickSearch);
    quickSearchInput.addEventListener('focus', () => {
      if (quickSearchInput.value.trim().length > 0) {
        searchSuggestions.style.display = 'block';
      }
    });

    btnClearSearch.addEventListener('click', () => {
      quickSearchInput.value = '';
      btnClearSearch.style.display = 'none';
      searchSuggestions.style.display = 'none';
      quickSearchInput.focus();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) {
        searchSuggestions.style.display = 'none';
      }
    });

    // Filter toggle and controls
    btnToggleFilters.addEventListener('click', () => {
      const isClosed = filterPanel.classList.toggle('closed');
      btnToggleFilters.classList.toggle('active', !isClosed);
    });

    filterSite.addEventListener('change', onSiteChanged);
    filterVillage.addEventListener('change', onVillageChanged);
    filterFamily.addEventListener('change', onFamilyChanged);
    filterPlot.addEventListener('change', onPlotChanged);

    btnResetFilters.addEventListener('click', resetFilters);
    btnApplyFilters.addEventListener('click', applyFilters);

    // Landscape Quick Chips
    document.querySelectorAll('.site-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const site = btn.getAttribute('data-site');
        document.querySelectorAll('.site-chip').forEach((c) => c.classList.remove('active'));
        btn.classList.add('active');
        filterSite.value = site;
        onSiteChanged();
        applyFilters();
        showToast(`Zoomed to ${site}`);
      });
    });

    // Basemap toggle
    btnLayerToggle.addEventListener('click', toggleBasemap);

    // Zoom to visible plots
    btnFitPlots.addEventListener('click', () => {
      if (selectedLayer && selectedLayer.getBounds) {
        map.flyToBounds(selectedLayer.getBounds(), { padding: [60, 60] });
      } else if (geojsonLayer) {
        map.flyToBounds(geojsonLayer.getBounds(), { padding: [30, 30] });
      }
    });

    // My Location
    btnMyLocation.addEventListener('click', centerOnUserLocation);

    // Drawer handle & Close button
    drawerToggle.addEventListener('click', () => {
      plotDrawer.classList.toggle('closed');
    });
    if (btnClosePlotDrawer) {
      btnClosePlotDrawer.addEventListener('click', (e) => {
        e.stopPropagation();
        plotDrawer.classList.add('closed');
      });
    }

    // Navigation buttons
    if (btnDriveDirections) {
      btnDriveDirections.addEventListener('click', launchDrivingDirections);
    }
    btnStartCompass.addEventListener('click', startWalkingCompassMode);
    btnCloseCompass.addEventListener('click', stopWalkingCompassMode);

    // Subplot Drawing & Separation Controls
    btnStartDrawing.addEventListener('click', () => startSubplotDrawing(selectedPlot));
    btnModeDrawLine.addEventListener('click', () => setDrawingMode('line'));
    btnModeAddLabel.addEventListener('click', () => setDrawingMode('label'));
    btnUndoPoint.addEventListener('click', undoLastAction);
    if (btnClearLines) {
      btnClearLines.addEventListener('click', clearCurrentPlotDivisionLines);
    }
    btnFinishDrawing.addEventListener('click', finishSubplotDrawing);
    btnCancelDrawing.addEventListener('click', cancelSubplotDrawing);

    // Subplot Modal Form
    subplotForm.addEventListener('submit', onSubplotFormSubmit);
    btnCloseModal.addEventListener('click', () => {
      subplotModal.style.display = 'none';
      editingSubplotInstance = null;
    });
    btnCancelModal.addEventListener('click', () => {
      subplotModal.style.display = 'none';
      editingSubplotInstance = null;
    });

    // Two-way synchronization between Subplot % and Area (ha)
    subplotAreaPct.addEventListener('input', () => {
      const pct = parseFloat(subplotAreaPct.value);
      const parentHa = (drawingMainPlot && drawingMainPlot.area_ha) ? drawingMainPlot.area_ha : 1;
      if (!isNaN(pct) && pct > 0 && parentHa > 0) {
        subplotAreaHa.value = roundTo((pct / 100) * parentHa, 2);
      } else if (isNaN(pct) || pct <= 0) {
        subplotAreaHa.value = '';
      }
      validateSubplotAllocation();
    });

    subplotAreaHa.addEventListener('input', () => {
      const ha = parseFloat(subplotAreaHa.value);
      const parentHa = (drawingMainPlot && drawingMainPlot.area_ha) ? drawingMainPlot.area_ha : 1;
      if (!isNaN(ha) && ha > 0 && parentHa > 0) {
        subplotAreaPct.value = roundTo((ha / parentHa) * 100, 1);
      } else if (isNaN(ha) || ha <= 0) {
        subplotAreaPct.value = '';
      }
      validateSubplotAllocation();
    });

    subplotVariety.addEventListener('change', () => {
      customVarietyGroup.style.display = subplotVariety.value === 'Other' ? 'flex' : 'none';
      if (subplotVariety.value === 'Other') {
        subplotCustomVariety.focus();
      }
    });

    // Export Subplots
    btnExportSubplots.addEventListener('click', exportSubplotsGeoJSON);

    // Copy Coordinates & Export Plot KML
    btnCopyCoords.addEventListener('click', () => {
      if (!selectedPlot) return;
      const text = `${selectedPlot.lat.toFixed(6)}, ${selectedPlot.lng.toFixed(6)}`;
      navigator.clipboard.writeText(text).then(() => {
        showToast(`Copied: ${text}`);
      });
    });

    btnExportKml.addEventListener('click', exportPlotKML);

    // ICS 2026 Export Buttons
    const btnExportIcsCsv = document.getElementById('btn-export-ics-csv');
    if (btnExportIcsCsv) btnExportIcsCsv.addEventListener('click', exportICSCsv);

    const btnExportIcsJson = document.getElementById('btn-export-ics-json');
    if (btnExportIcsJson) btnExportIcsJson.addEventListener('click', exportICSJson);

    const btnExportFullGeo = document.getElementById('btn-export-full-geojson');
    if (btnExportFullGeo) btnExportFullGeo.addEventListener('click', exportFullGeoJSON);

    const btnExportAll = document.getElementById('btn-export-all');
    if (btnExportAll) {
      btnExportAll.addEventListener('click', () => {
        if (selectedPlot) {
          plotDrawer.classList.remove('closed');
          switchDrawerTab('tab-confirm');
        } else {
          exportICSCsv();
        }
      });
    }
  }

  // --- Quick Search Autocomplete ---
  function handleQuickSearch() {
    const rawQuery = quickSearchInput.value.trim();
    if (!rawQuery) {
      btnClearSearch.style.display = 'none';
      searchSuggestions.style.display = 'none';
      return;
    }

    btnClearSearch.style.display = 'flex';
    const q = rawQuery.toLowerCase();

    const matches = [];
    for (let i = 0; i < searchIndex.length && matches.length < 20; i++) {
      const p = searchIndex[i];
      const matchFamily = p.family_id.toLowerCase().includes(q);
      const matchPlot = p.plot_id.toLowerCase().includes(q);
      const matchVillage = p.village.toLowerCase().includes(q);

      if (matchFamily || matchPlot || matchVillage) {
        matches.push(p);
      }
    }

    renderSearchSuggestions(matches, q);
  }

  function renderSearchSuggestions(matches, query) {
    searchSuggestions.innerHTML = '';
    if (matches.length === 0) {
      searchSuggestions.innerHTML = `
        <div class="suggestion-item" style="cursor: default; color: var(--text-muted);">
          No plots found matching "${escapeHtml(query)}"
        </div>`;
      searchSuggestions.style.display = 'block';
      return;
    }

    const frag = document.createDocumentFragment();
    matches.forEach((p) => {
      const item = document.createElement('div');
      item.className = 'suggestion-item';

      const familyHighlight = highlightMatch(p.family_id, query);
      const plotHighlight = highlightMatch(p.plot_id, query);
      const villageHighlight = highlightMatch(p.village, query);

      item.innerHTML = `
        <div class="suggestion-main">
          <span class="suggestion-title">Family ${familyHighlight} · Plot ${plotHighlight}</span>
          <span class="suggestion-subtitle">${villageHighlight}, ${p.site} (${p.area_ha || 0} ha)</span>
        </div>
        <span class="suggestion-tag">Plot ${escapeHtml(p.plot_id)}</span>
      `;

      item.addEventListener('click', () => {
        searchSuggestions.style.display = 'none';
        quickSearchInput.value = `${p.family_id} (Plot ${p.plot_id})`;
        selectPlot(p, true);
      });

      frag.appendChild(item);
    });

    searchSuggestions.appendChild(frag);
    searchSuggestions.style.display = 'block';
  }

  function highlightMatch(text, query) {
    if (!text) return '';
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return escapeHtml(text);
    const before = escapeHtml(text.slice(0, idx));
    const match = escapeHtml(text.slice(idx, idx + query.length));
    const after = escapeHtml(text.slice(idx + query.length));
    return `${before}<mark>${match}</mark>${after}`;
  }

  // --- Cascading Filters Logic ---
  function populateSiteFilter() {
    filterSite.innerHTML = '<option value="">All Sites (6,427 plots)</option>';
    const sites = Object.keys(hierarchy).sort();
    sites.forEach((site) => {
      let plotCount = 0;
      for (const vil in hierarchy[site]) {
        for (const fam in hierarchy[site][vil]) {
          plotCount += hierarchy[site][vil][fam].length;
        }
      }
      const opt = document.createElement('option');
      opt.value = site;
      opt.textContent = `${site} (${plotCount} plots)`;
      filterSite.appendChild(opt);
    });
  }

  function onSiteChanged() {
    const site = filterSite.value;
    filterVillage.innerHTML = '<option value="">All Villages</option>';
    filterFamily.innerHTML = '<option value="">All Families</option>';
    filterPlot.innerHTML = '<option value="">All Plots</option>';

    if (!site) {
      filterVillage.disabled = true;
      filterFamily.disabled = true;
      filterPlot.disabled = true;
      filterStatusText.textContent = `${searchIndex.length.toLocaleString()} plots available`;
      return;
    }

    filterVillage.disabled = false;
    filterFamily.disabled = true;
    filterPlot.disabled = true;

    const villages = Object.keys(hierarchy[site] || {}).sort();
    villages.forEach((vil) => {
      let plotCount = 0;
      for (const fam in hierarchy[site][vil]) {
        plotCount += hierarchy[site][vil][fam].length;
      }
      const opt = document.createElement('option');
      opt.value = vil;
      opt.textContent = `${vil} (${plotCount})`;
      filterVillage.appendChild(opt);
    });

    filterStatusText.textContent = `${villages.length} villages in ${site}`;
  }

  function onVillageChanged() {
    const site = filterSite.value;
    const village = filterVillage.value;
    filterFamily.innerHTML = '<option value="">All Families</option>';
    filterPlot.innerHTML = '<option value="">All Plots</option>';

    if (!village) {
      filterFamily.disabled = true;
      filterPlot.disabled = true;
      return;
    }

    filterFamily.disabled = false;
    filterPlot.disabled = true;

    const families = Object.keys(hierarchy[site][village] || {}).sort();
    families.forEach((fam) => {
      const count = hierarchy[site][village][fam].length;
      const opt = document.createElement('option');
      opt.value = fam;
      opt.textContent = `${fam} (${count} plot${count > 1 ? 's' : ''})`;
      filterFamily.appendChild(opt);
    });

    filterStatusText.textContent = `${families.length} families in ${village}`;
  }

  function onFamilyChanged() {
    const site = filterSite.value;
    const village = filterVillage.value;
    const family = filterFamily.value;
    filterPlot.innerHTML = '<option value="">All Plots</option>';

    if (!family) {
      filterPlot.disabled = true;
      return;
    }

    filterPlot.disabled = false;
    const plots = hierarchy[site][village][family] || [];
    plots.forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `Plot ${p.plot_id} (${p.area_ha || 0} ha)`;
      filterPlot.appendChild(opt);
    });

    filterStatusText.textContent = `${plots.length} plot(s) for family ${family}`;
  }

  function onPlotChanged() {
    const plotIdx = filterPlot.value;
    if (plotIdx !== '') {
      const p = searchIndex[parseInt(plotIdx, 10)];
      if (p) {
        selectPlot(p, true);
      }
    }
  }

  function resetFilters() {
    filterSite.value = '';
    onSiteChanged();
    if (selectedLayer) {
      selectedLayer.setStyle({
        color: '#E4A834',
        weight: 1.5,
        fillColor: '#22c55e',
        fillOpacity: 0.35
      });
      selectedLayer = null;
    }
    selectedPlot = null;
    plotDrawer.classList.add('closed');
    map.setView([13.7, 105.8], 8);
    showToast('Filters reset');
  }

  function applyFilters() {
    const site = filterSite.value;
    const village = filterVillage.value;
    const family = filterFamily.value;
    const plotId = filterPlot.value;

    if (plotId !== '') {
      const p = searchIndex[parseInt(plotId, 10)];
      if (p) selectPlot(p, true);
      filterPanel.classList.add('closed');
      btnToggleFilters.classList.remove('active');
      return;
    }

    const matchingPlots = searchIndex.filter((p) => {
      if (site && p.site !== site) return false;
      if (village && p.village !== village) return false;
      if (family && p.family_id !== family) return false;
      return true;
    });

    if (matchingPlots.length === 0) {
      showToast('No plots match the selected filter');
      return;
    }

    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    matchingPlots.forEach((p) => {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
    });

    map.flyToBounds([[minLat, minLng], [maxLat, maxLng]], { padding: [50, 50], duration: 1.2 });
    showToast(`Zoomed to ${matchingPlots.length} visible plots`);

    filterPanel.classList.add('closed');
    btnToggleFilters.classList.remove('active');
  }

  // --- Basemap Switcher ---
  function toggleBasemap() {
    if (currentBasemap === 'sat') {
      map.removeLayer(satelliteLayer);
      osmLayer.addTo(map);
      currentBasemap = 'osm';
      layerLabel.textContent = 'Map';
      showToast('Switched to Street / Terrain map');
    } else {
      map.removeLayer(osmLayer);
      satelliteLayer.addTo(map);
      currentBasemap = 'sat';
      layerLabel.textContent = 'Sat';
      showToast('Switched to Satellite imagery');
    }
  }

  // --- Driving Directions ---
  function launchDrivingDirections() {
    if (!selectedPlot) {
      showToast('Please select a plot first');
      return;
    }

    const lat = selectedPlot.lat;
    const lng = selectedPlot.lng;
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    window.open(googleMapsUrl, '_blank');
  }

  // --- Field Walking Compass Mode ---
  function startWalkingCompassMode() {
    if (!selectedPlot) {
      showToast('Select a plot first to start walking navigation');
      return;
    }

    isWalkingMode = true;
    compassHud.style.display = 'block';
    hudTargetName.textContent = `${selectedPlot.family_id} (Plot ${selectedPlot.plot_id}) · ${selectedPlot.village}`;

    if ('geolocation' in navigator) {
      hudGpsAccuracy.textContent = 'Acquiring GPS fix...';
      watchPositionId = navigator.geolocation.watchPosition(
        onGpsLocationUpdate,
        onGpsLocationError,
        {
          enableHighAccuracy: true,
          maximumAge: 2000,
          timeout: 10000
        }
      );
    } else {
      hudGpsAccuracy.textContent = 'Geolocation not supported on this device';
      showToast('Geolocation is not supported by your browser');
    }

    showToast('Field Compass Walk started');
  }

  function stopWalkingCompassMode() {
    isWalkingMode = false;
    compassHud.style.display = 'none';

    if (watchPositionId !== null) {
      navigator.geolocation.clearWatch(watchPositionId);
      watchPositionId = null;
    }

    if (navGuideLine) {
      map.removeLayer(navGuideLine);
      navGuideLine = null;
    }

    showToast('Walking navigation stopped');
  }

  function onGpsLocationUpdate(pos) {
    const crd = pos.coords;
    userLocation = {
      lat: crd.latitude,
      lng: crd.longitude,
      accuracy: crd.accuracy,
      heading: crd.heading
    };

    updateUserMarkerOnMap();
    updateCompassHUD();
  }

  function onGpsLocationError(err) {
    console.warn('[GPS] Error:', err);
    hudGpsAccuracy.textContent = `GPS error: ${err.message}`;
  }

  function updateUserMarkerOnMap() {
    if (!userLocation) return;
    const latLng = [userLocation.lat, userLocation.lng];

    if (!userMarker) {
      const customIcon = L.divIcon({
        className: 'user-gps-marker',
        html: '<div class="gps-pulse-ring"></div><div class="gps-pulse-dot"></div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      userMarker = L.marker(latLng, { icon: customIcon, zIndexOffset: 1000 }).addTo(map);
      userAccuracyCircle = L.circle(latLng, {
        radius: userLocation.accuracy,
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.15,
        weight: 1
      }).addTo(map);
    } else {
      userMarker.setLatLng(latLng);
      userAccuracyCircle.setLatLng(latLng);
      userAccuracyCircle.setRadius(userLocation.accuracy);
    }
  }

  function centerOnUserLocation() {
    if (!('geolocation' in navigator)) {
      showToast('Geolocation not supported');
      return;
    }

    showToast('Locating your position...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onGpsLocationUpdate(pos);
        map.flyTo([pos.coords.latitude, pos.coords.longitude], 16, { duration: 1.0 });
        showToast(`GPS accuracy: ±${Math.round(pos.coords.accuracy)}m`);
      },
      (err) => {
        showToast(`Location error: ${err.message}`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function updateCompassHUD() {
    if (!selectedPlot || !userLocation) return;

    const uLat = userLocation.lat;
    const uLng = userLocation.lng;
    const tLat = selectedPlot.lat;
    const tLng = selectedPlot.lng;

    const distMeters = calculateHaversineDistance(uLat, uLng, tLat, tLng);
    const bearingDeg = calculateBearing(uLat, uLng, tLat, tLng);

    if (distMeters >= 1000) {
      hudDistance.textContent = `${(distMeters / 1000).toFixed(2)} km`;
    } else {
      hudDistance.textContent = `${Math.round(distMeters)} m`;
    }

    const cardinal = getCardinalDirection(bearingDeg);
    hudBearing.textContent = `${Math.round(bearingDeg)}° ${cardinal}`;
    hudGpsAccuracy.textContent = `GPS Accuracy: ±${Math.round(userLocation.accuracy)}m`;

    const effectiveAngle = deviceHeading !== null ? bearingDeg - deviceHeading : bearingDeg;
    compassArrow.style.transform = `rotate(${effectiveAngle}deg)`;

    if (distMeters <= 25) {
      hudDistance.style.color = '#22c55e';
      showToast('🎯 You have arrived at the plot!');
    } else {
      hudDistance.style.color = '#ffffff';
    }

    if (!navGuideLine) {
      navGuideLine = L.polyline([[uLat, uLng], [tLat, tLng]], {
        color: '#E4A834',
        weight: 3,
        dashArray: '6, 8',
        opacity: 0.9
      }).addTo(map);
    } else {
      navGuideLine.setLatLngs([[uLat, uLng], [tLat, tLng]]);
    }
  }

  function initOrientationListener() {
    if (window.DeviceOrientationEvent) {
      window.addEventListener('deviceorientation', (event) => {
        if (event.webkitCompassHeading) {
          deviceHeading = event.webkitCompassHeading;
        } else if (event.alpha !== null) {
          deviceHeading = 360 - event.alpha;
        }
        if (isWalkingMode) {
          updateCompassHUD();
        }
      }, true);
    }
  }

  // --- Geometry & Math Utilities ---
  function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function calculateBearing(lat1, lon1, lat2, lon2) {
    const phi1 = lat1 * Math.PI / 180;
    const phi2 = lat2 * Math.PI / 180;
    const deltaLambda = (lon2 - lon1) * Math.PI / 180;

    const y = Math.sin(deltaLambda) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) -
              Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
    const theta = Math.atan2(y, x);
    return (theta * 180 / Math.PI + 360) % 360;
  }

  function getCardinalDirection(angle) {
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'N'];
    return directions[Math.round(angle / 45) % 8];
  }

  function calculatePolygonAreaM2(points) {
    if (!points || points.length < 3) return 0;
    const R = 6378137.0; // Earth radius
    let total = 0.0;
    const n = points.length;

    for (let i = 0; i < n; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % n];
      const lat1 = (p1[0] * Math.PI) / 180;
      const lat2 = (p2[0] * Math.PI) / 180;
      const lon1 = (p1[1] * Math.PI) / 180;
      const lon2 = (p2[1] * Math.PI) / 180;

      total += (lon2 - lon1) * (2.0 + Math.sin(lat1) + Math.sin(lat2));
    }
    return Math.abs((total * (R * R)) / 2.0);
  }

  function roundTo(val, dec) {
    const factor = Math.pow(10, dec);
    return Math.round(val * factor) / factor;
  }

  // --- Export Single Plot KML ---
  function exportPlotKML() {
    if (!selectedPlot) {
      showToast('Please select a plot first to export');
      return;
    }

    const p = selectedPlot;
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Placemark>
    <name>Ibis Rice - ${escapeXml(p.family_id)} Plot ${escapeXml(p.plot_id)}</name>
    <description><![CDATA[
      <b>Site:</b> ${escapeXml(p.site)}<br/>
      <b>Village:</b> ${escapeXml(p.village)}<br/>
      <b>Commune:</b> ${escapeXml(p.commune)}<br/>
      <b>Area:</b> ${p.area_ha} ha<br/>
      <b>Year:</b> ${p.year_join}<br/>
      <b>Coordinates:</b> ${p.lat}, ${p.lng}
    ]]></description>
    <Point>
      <coordinates>${p.lng},${p.lat},0</coordinates>
    </Point>
  </Placemark>
</kml>`;

    const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ibis_Rice_${p.family_id}_Plot_${p.plot_id}.kml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast(`Downloaded KML: Plot ${p.plot_id}`);
  }

  // --- Helpers ---
  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }

  function escapeXml(str) {
    return escapeHtml(str);
  }

  let toastTimeout = null;
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2800);
  }

  // ==========================================================
  //  ICS 2026 INSPECTION WORKFLOW ENGINE (5 STAGES)
  //  Farmer -> Parcel -> Subplot -> Harvest -> Confirmation
  // ==========================================================

  const FARMERS_STORE_KEY   = 'ibis_farmers_v2';
  const ICS_INSPECTIONS_KEY = 'ibis_ics_2026_inspections_v2';
  const SESSION_STORE_KEY   = 'ibis_session_v1';

  let farmersStore   = {}; // { [family_id]: farmerRecord }
  let icsInspections = {}; // { [plot_db_id]: inspectionRecord }
  let sessionState   = { inspectorName: '', seasonYear: new Date().getFullYear() };
  let editingSubplotInstance = null; // Subplot object currently open in subplotModal for inspection

  function loadICSStores() {
    try {
      farmersStore   = JSON.parse(localStorage.getItem(FARMERS_STORE_KEY) || '{}');
      icsInspections = JSON.parse(localStorage.getItem(ICS_INSPECTIONS_KEY) || '{}');
      const sess     = JSON.parse(localStorage.getItem(SESSION_STORE_KEY) || '{}');
      if (sess.inspectorName) sessionState.inspectorName = sess.inspectorName;
      if (sess.seasonYear)    sessionState.seasonYear    = sess.seasonYear;
    } catch (e) {
      console.warn('[ICSStores] Load error:', e);
    }
  }

  function saveICSStores() {
    try {
      localStorage.setItem(FARMERS_STORE_KEY,   JSON.stringify(farmersStore));
      localStorage.setItem(ICS_INSPECTIONS_KEY, JSON.stringify(icsInspections));
      localStorage.setItem(SESSION_STORE_KEY,   JSON.stringify(sessionState));
    } catch (e) {
      console.error('[ICSStores] Save error:', e);
      showToast('Error saving ICS records');
    }
  }

  // --- Drawer 5-Stage Tab Navigation ---
  let activeDrawerTab = 'tab-farmer';

  function initDrawerTabs() {
    document.querySelectorAll('.drawer-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        switchDrawerTab(tabId);
      });
    });

    // Stepper buttons
    const btnNextParcel = document.getElementById('btn-next-to-parcel');
    if (btnNextParcel) {
      btnNextParcel.addEventListener('click', () => {
        saveCurrentFarmerForm();
        switchDrawerTab('tab-parcel');
      });
    }

    const btnBackFarmer = document.getElementById('btn-back-to-farmer');
    if (btnBackFarmer) {
      btnBackFarmer.addEventListener('click', () => switchDrawerTab('tab-farmer'));
    }

    const btnNextSubplots = document.getElementById('btn-next-to-subplots');
    if (btnNextSubplots) {
      btnNextSubplots.addEventListener('click', () => {
        saveCurrentPlotBaselineForm();
        switchDrawerTab('tab-subplots');
      });
    }

    const btnBackParcel = document.getElementById('btn-back-to-parcel');
    if (btnBackParcel) {
      btnBackParcel.addEventListener('click', () => switchDrawerTab('tab-parcel'));
    }

    const btnNextHarvest = document.getElementById('btn-next-to-harvest');
    if (btnNextHarvest) {
      btnNextHarvest.addEventListener('click', () => switchDrawerTab('tab-harvest'));
    }

    const btnBackSubplots = document.getElementById('btn-back-to-subplots');
    if (btnBackSubplots) {
      btnBackSubplots.addEventListener('click', () => switchDrawerTab('tab-subplots'));
    }

    const btnNextConfirm = document.getElementById('btn-next-to-confirm');
    if (btnNextConfirm) {
      btnNextConfirm.addEventListener('click', () => {
        saveCurrentHarvestForm();
        switchDrawerTab('tab-confirm');
      });
    }

    const btnBackHarvest = document.getElementById('btn-back-to-harvest');
    if (btnBackHarvest) {
      btnBackHarvest.addEventListener('click', () => switchDrawerTab('tab-harvest'));
    }

    const btnSaveAll = document.getElementById('btn-save-complete-inspection');
    if (btnSaveAll) {
      btnSaveAll.addEventListener('click', saveCompleteRecord);
    }
  }

  function switchDrawerTab(tabId) {
    activeDrawerTab = tabId;
    document.querySelectorAll('.drawer-tab-btn').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.drawer-tab-panel').forEach((p) => {
      p.classList.toggle('active', p.id === tabId);
    });
  }

  // --- Digital Signature Pad ---
  let sigCanvas = null;
  let sigCtx = null;
  let isSigDrawing = false;
  let sigHasContent = false;

  function initSignaturePad() {
    sigCanvas = document.getElementById('signature-canvas');
    if (!sigCanvas) return;
    sigCtx = sigCanvas.getContext('2d');
    sigCtx.lineWidth = 2.2;
    sigCtx.lineCap = 'round';
    sigCtx.lineJoin = 'round';
    sigCtx.strokeStyle = '#0284c7';

    function getCanvasPos(e) {
      const rect = sigCanvas.getBoundingClientRect();
      const scaleX = sigCanvas.width / rect.width;
      const scaleY = sigCanvas.height / rect.height;
      if (e.touches && e.touches.length > 0) {
        return [
          (e.touches[0].clientX - rect.left) * scaleX,
          (e.touches[0].clientY - rect.top) * scaleY
        ];
      }
      return [
        (e.clientX - rect.left) * scaleX,
        (e.clientY - rect.top) * scaleY
      ];
    }

    function startSig(e) {
      isSigDrawing = true;
      const [x, y] = getCanvasPos(e);
      sigCtx.beginPath();
      sigCtx.moveTo(x, y);
    }

    function moveSig(e) {
      if (!isSigDrawing) return;
      if (e.cancelable) e.preventDefault();
      const [x, y] = getCanvasPos(e);
      sigCtx.lineTo(x, y);
      sigCtx.stroke();
      sigHasContent = true;
    }

    function stopSig() {
      isSigDrawing = false;
    }

    sigCanvas.addEventListener('mousedown', startSig);
    sigCanvas.addEventListener('mousemove', moveSig);
    window.addEventListener('mouseup', stopSig);

    sigCanvas.addEventListener('touchstart', startSig, { passive: false });
    sigCanvas.addEventListener('touchmove', moveSig, { passive: false });
    sigCanvas.addEventListener('touchend', stopSig);

    const btnClearSig = document.getElementById('btn-clear-signature');
    if (btnClearSig) {
      btnClearSig.addEventListener('click', clearSignature);
    }
  }

  function clearSignature() {
    if (!sigCanvas || !sigCtx) return;
    sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
    sigHasContent = false;
  }

  function getSignatureDataUrl() {
    if (!sigCanvas || !sigHasContent) return '';
    return sigCanvas.toDataURL('image/png');
  }

  function loadSignatureFromDataUrl(dataUrl) {
    clearSignature();
    if (!dataUrl || !sigCtx) return;
    const img = new Image();
    img.onload = () => {
      sigCtx.drawImage(img, 0, 0);
      sigHasContent = true;
    };
    img.src = dataUrl;
  }

  // --- Progressive Disclosure & Conditional Fields ---
  function initProgressiveDisclosure() {
    // Stage 1: Farmer compliance
    const selCompliant = document.getElementById('f-compliant');
    const blockNC = document.getElementById('nc-details-block');
    const badgeCompliance = document.getElementById('badge-farmer-compliance');
    if (selCompliant) {
      selCompliant.addEventListener('change', () => {
        const val = selCompliant.value;
        if (blockNC) blockNC.style.display = val === '2' ? 'block' : 'none';
        if (badgeCompliance) {
          if (val === '1') {
            badgeCompliance.textContent = 'Compliant';
            badgeCompliance.className = 'badge status-pill status-approved';
          } else if (val === '2') {
            badgeCompliance.textContent = 'Infringement';
            badgeCompliance.className = 'badge status-pill status-danger';
          } else {
            badgeCompliance.textContent = 'Resigned';
            badgeCompliance.className = 'badge status-pill status-warn';
          }
        }
      });
    }

    // Stage 1: Interviewee is head
    const selIsHead = document.getElementById('f-is-head-interviewee');
    const blockIntervieweeOther = document.getElementById('interviewee-other-row');
    if (selIsHead) {
      selIsHead.addEventListener('change', () => {
        if (blockIntervieweeOther) {
          blockIntervieweeOther.style.display = selIsHead.value === '2' ? 'flex' : 'none';
        }
      });
    }

    // Stage 2: Contamination risk
    const selContam = document.getElementById('p-contamination');
    const blockContam = document.getElementById('p-contamination-block');
    if (selContam) {
      selContam.addEventListener('change', () => {
        if (blockContam) blockContam.style.display = selContam.value === '1' ? 'block' : 'none';
      });
    }

    // Stage 2: Prohibited chemical history
    const selProhibited = document.getElementById('p-last-prohibited');
    const blockProhibited = document.getElementById('p-prohibited-details');
    if (selProhibited) {
      selProhibited.addEventListener('change', () => {
        if (blockProhibited) blockProhibited.style.display = selProhibited.value === '1' ? 'block' : 'none';
      });
    }

    // Stage 2: Other crop / intercropping
    const selOtherCrop = document.getElementById('p-other-crop');
    const blockOtherCrop = document.getElementById('p-other-crop-details');
    if (selOtherCrop) {
      selOtherCrop.addEventListener('change', () => {
        if (blockOtherCrop) blockOtherCrop.style.display = selOtherCrop.value === '1' ? 'flex' : 'none';
      });
    }

    // Stage 2: Mass balance collapsible
    const toggleMass = document.getElementById('p-mass-balance-toggle');
    const contentMass = document.getElementById('p-mass-balance-content');
    const chevMass = document.getElementById('p-mass-chevron');
    if (toggleMass && contentMass) {
      toggleMass.addEventListener('click', () => {
        const isOpen = contentMass.style.display !== 'none';
        contentMass.style.display = isOpen ? 'none' : 'block';
        if (chevMass) chevMass.textContent = isOpen ? '▼' : '▲';
      });
    }

    // Stage 4: Threshing complete
    const selHComplete = document.getElementById('h-complete');
    const blockHIncomplete = document.getElementById('h-incomplete-block');
    const blockHComplete = document.getElementById('h-complete-block');
    const badgeThreshing = document.getElementById('badge-threshing-status');
    if (selHComplete) {
      selHComplete.addEventListener('change', () => {
        const isDone = selHComplete.value === '1';
        if (blockHIncomplete) blockHIncomplete.style.display = isDone ? 'none' : 'block';
        if (blockHComplete) blockHComplete.style.display = isDone ? 'block' : 'none';
        if (badgeThreshing) {
          badgeThreshing.textContent = isDone ? 'Completed' : 'Pending';
          badgeThreshing.className = 'badge status-pill ' + (isDone ? 'status-approved' : 'status-warn');
        }
      });
    }

    // Stage 4: Threshing method -> machine flush block
    const selHMethod = document.getElementById('h-method');
    const blockHMachine = document.getElementById('h-machine-block');
    if (selHMethod) {
      selHMethod.addEventListener('change', () => {
        const isMachine = selHMethod.value === '2' || selHMethod.value === '3';
        if (blockHMachine) blockHMachine.style.display = isMachine ? 'flex' : 'none';
      });
    }

    // Stage 4: Threshing mass balance
    ['h-actual-kg', 'h-sale-kg', 'h-consume-kg', 'h-seed-kg'].forEach((id) => {
      const inp = document.getElementById(id);
      if (inp) inp.addEventListener('input', updateHarvestMassBalance);
    });

    // Stage 4: Payment type
    const selHPay = document.getElementById('h-payment-type');
    const lblHPay = document.getElementById('h-payment-label');
    if (selHPay && lblHPay) {
      selHPay.addEventListener('change', () => {
        lblHPay.textContent = selHPay.value === '2' ? 'Amount in Paddy (kg)' : 'Amount in Riel (KHR)';
      });
    }

    // Stage 5: Chamkar
    const selChamkar = document.getElementById('c-have-chamkar');
    const blockChamkar = document.getElementById('c-chamkar-block');
    if (selChamkar) {
      selChamkar.addEventListener('change', () => {
        if (blockChamkar) blockChamkar.style.display = selChamkar.value === '1' ? 'block' : 'none';
      });
    }

    // Stage 5: Rice barn chambers
    const selBarn = document.getElementById('c-rice-barn');
    const grpChambers = document.getElementById('c-chambers-group');
    if (selBarn) {
      selBarn.addEventListener('change', () => {
        if (grpChambers) grpChambers.style.display = selBarn.value === '1' ? 'block' : 'none';
      });
    }

    // Subplot Modal: Fertilizer toggle
    const selSpFert = document.getElementById('sp-fertilizer-toggle');
    const blockSpFert = document.getElementById('sp-fertilizer-block');
    if (selSpFert) {
      selSpFert.addEventListener('change', () => {
        if (blockSpFert) blockSpFert.style.display = selSpFert.value === 'yes' ? 'block' : 'none';
      });
    }

    // Subplot Modal: Crop protection toggle
    const selSpProt = document.getElementById('sp-protection-toggle');
    const blockSpProt = document.getElementById('sp-protection-block');
    if (selSpProt) {
      selSpProt.addEventListener('change', () => {
        if (blockSpProt) blockSpProt.style.display = selSpProt.value === 'yes' ? 'block' : 'none';
      });
    }

    // Subplot Modal: Collapsible Extended Section
    const toggleSpExt = document.getElementById('sp-extended-toggle');
    const contentSpExt = document.getElementById('sp-extended-content');
    if (toggleSpExt && contentSpExt) {
      toggleSpExt.addEventListener('click', () => {
        const isOpen = contentSpExt.style.display !== 'none';
        contentSpExt.style.display = isOpen ? 'none' : 'block';
        toggleSpExt.classList.toggle('active', !isOpen);
      });
    }
  }

  function updateHarvestMassBalance() {
    const actual = parseFloat(document.getElementById('h-actual-kg')?.value) || 0;
    const sale = parseFloat(document.getElementById('h-sale-kg')?.value) || 0;
    const consume = parseFloat(document.getElementById('h-consume-kg')?.value) || 0;
    const seed = parseFloat(document.getElementById('h-seed-kg')?.value) || 0;
    const allocated = sale + consume + seed;
    const balance = actual - allocated;

    const elSum = document.getElementById('h-alloc-sum');
    const elBal = document.getElementById('h-alloc-balance');
    const rowBal = document.getElementById('h-balance-row');

    if (elSum) elSum.textContent = `${allocated.toLocaleString()} kg`;
    if (elBal) elBal.textContent = `${balance.toLocaleString()} kg`;
    if (rowBal) {
      if (actual > 0 && Math.abs(balance) < 1) {
        rowBal.className = 'disposition-total-row balanced';
      } else if (balance < 0) {
        rowBal.className = 'disposition-total-row over-budget';
      } else {
        rowBal.className = 'disposition-total-row';
      }
    }
  }

  // --- Load Inspection for Selected Plot ---
  function loadICSInspectionForSelectedPlot() {
    if (!selectedPlot) return;
    const plotDbId = selectedPlot.id;
    const familyId = selectedPlot.family_id;

    // Header labels
    const dispFamily = document.getElementById('f-family-display');
    if (dispFamily) dispFamily.textContent = `Family ${familyId}`;
    const dispPlot = document.getElementById('p-plot-display');
    if (dispPlot) dispPlot.textContent = `Plot ${selectedPlot.plot_id} · ${selectedPlot.village || ''}`;

    // 1. Farmer Baseline
    const farmer = farmersStore[familyId] || {};
    setVal('f-head-name', farmer.hoh_name || selectedPlot.farmer_name || '');
    setVal('f-gender', farmer.hoh_sex || (selectedPlot.sex === 'F' ? '2' : '1'));
    setVal('f-is-head-interviewee', farmer.is_head_interviewee || '1');
    setVal('f-ethnicity', farmer.ethnicity || '1');
    setVal('f-interviewee-name', farmer.interviewee_name || '');
    setVal('f-interviewee-gender', farmer.interviewee_gender || '1');
    setVal('f-status', farmer.status || '1');
    setVal('f-labor-mf', farmer.labor_mf || '3');
    setVal('f-members', farmer.members_count || 4);
    setVal('f-females', farmer.females_count || 2);
    setVal('f-school', farmer.school_count || 2);
    setVal('f-toilet', farmer.has_toilet || '1');
    setVal('f-disable', farmer.has_disabled || '2');
    setVal('f-cattle', farmer.cattle_count || 0);
    setVal('f-buffalo', farmer.buffalo_count || 0);
    setVal('f-other-animals', farmer.other_animals_count || 0);

    setChipValues('#f-trainings', farmer.trainings || ['1']);
    setChipValues('#f-records', farmer.records || ['map', 'book']);

    // 2. Plot Inspection
    const insp = icsInspections[plotDbId] || {};
    setVal('f-compliant', insp.farmer_compliant || '1');
    setChipValues('#f-nc-types', insp.nc_types || []);
    setVal('f-nc-remark', insp.nc_remark || '');
    setVal('f-nc-date', insp.nc_date || '');
    setVal('f-nc-status', insp.nc_status || 'Organic');

    // Stage 2: Parcel Baseline
    setVal('p-inspection-date', insp.inspection_date || new Date().toISOString().slice(0, 10));
    setVal('p-area-ha', insp.area_ha || (selectedPlot.area_ha ? selectedPlot.area_ha.toFixed(2) : '1.00'));
    setVal('p-land-situation', insp.land_situation || '1');
    setVal('p-irrigation', insp.irrigation || '1');
    setVal('p-contamination', insp.contamination || '2');
    setVal('p-avoid-method', insp.avoid_method || '');
    setVal('p-last-prohibited', insp.last_prohibited || '2');
    setChipValues('#p-prohibited-chips', insp.prohibited_inputs || []);
    setVal('p-prohibited-date', insp.prohibited_date || '');
    setVal('p-other-crop', insp.other_crop || '2');
    setVal('p-crop-name', insp.crop_name || '');
    setVal('p-crop-status', insp.crop_status || 'Before');

    setVal('p-exp-last-year', insp.exp_last_year || '');
    setVal('p-actual-last-year', insp.actual_last_year || '');
    setVal('p-sold-ircc', insp.sold_ircc || '');
    setVal('p-seed-kept', insp.seed_kept || '');
    setVal('p-consumed', insp.consumed || '');

    // Stage 4: Harvest & Threshing
    setVal('h-complete', insp.harvest_complete || '1');
    setVal('h-reason-no', insp.harvest_reason_no || 'Not mature');
    setVal('h-date', insp.harvest_date || '');
    setVal('h-method', insp.harvest_method || '3');
    setVal('h-owner', insp.machine_owner || '');
    setVal('h-flush', insp.flush_qty || '0');
    setVal('h-dry-loc', insp.dry_loc || '1');
    setVal('h-diff-plots', insp.diff_plots || '1');
    setVal('h-actual-kg', insp.actual_kg || '');
    setVal('h-sale-kg', insp.sale_kg || '');
    setVal('h-consume-kg', insp.consume_kg || '');
    setVal('h-seed-kg', insp.seed_kg || '');
    setVal('h-payment-type', insp.payment_type || '1');
    setVal('h-payment-amount', insp.payment_amount || '');

    // Stage 5: Chamkar, Barn & Confirmations
    setVal('c-have-chamkar', insp.have_chamkar || '2');
    setVal('c-chamkar-num', insp.chamkar_num || 1);
    setVal('c-chamkar-area', insp.chamkar_area || '');
    setChipValues('#c-chamkar-crops', insp.chamkar_crops || []);
    setVal('c-rice-barn', insp.has_rice_barn || '1');
    setVal('c-chambers', insp.barn_chambers || 1);
    setVal('c-barn-clean', insp.barn_clean || '1');
    setVal('c-barn-chemicals', insp.barn_free_chemicals || '1');
    setVal('c-clear-forest', insp.cleared_forest || '2');
    setVal('c-expand-land', insp.expanded_land || '2');
    setVal('c-burn-straw', insp.burned_straw || '2');
    setVal('c-firebreak', insp.firebreak_kept || '1');
    setVal('c-certified-status', insp.certified_status || '1');
    setVal('c-conclusion-notes', insp.conclusion_notes || '');
    setVal('c-inspector-name', insp.inspector_name || sessionState.inspectorName || '');
    setVal('c-irpg-name', insp.irpg_name || '');

    // Signature
    loadSignatureFromDataUrl(insp.signature_data || '');

    // Refresh conditional blocks
    const trigger = (elId) => {
      const el = document.getElementById(elId);
      if (el) el.dispatchEvent(new Event('change'));
    };
    trigger('f-compliant');
    trigger('f-is-head-interviewee');
    trigger('p-contamination');
    trigger('p-last-prohibited');
    trigger('p-other-crop');
    trigger('h-complete');
    trigger('h-method');
    trigger('h-payment-type');
    trigger('c-have-chamkar');
    trigger('c-rice-barn');
    updateHarvestMassBalance();
  }

  function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val !== undefined && val !== null ? val : '';
  }

  function setChipValues(containerSelector, arrValues) {
    const container = document.querySelector(containerSelector);
    if (!container || !Array.isArray(arrValues)) return;
    container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = arrValues.includes(cb.value);
    });
  }

  function getChipValues(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return [];
    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value);
  }

  // --- Form Auto-Save Handlers ---
  function saveCurrentFarmerForm() {
    if (!selectedPlot) return;
    const fid = selectedPlot.family_id;
    farmersStore[fid] = {
      family_id: fid,
      hoh_name: document.getElementById('f-head-name')?.value.trim() || '',
      hoh_sex: document.getElementById('f-gender')?.value || '1',
      is_head_interviewee: document.getElementById('f-is-head-interviewee')?.value || '1',
      ethnicity: document.getElementById('f-ethnicity')?.value || '1',
      interviewee_name: document.getElementById('f-interviewee-name')?.value.trim() || '',
      interviewee_gender: document.getElementById('f-interviewee-gender')?.value || '1',
      status: document.getElementById('f-status')?.value || '1',
      labor_mf: document.getElementById('f-labor-mf')?.value || '3',
      members_count: parseInt(document.getElementById('f-members')?.value, 10) || 4,
      females_count: parseInt(document.getElementById('f-females')?.value, 10) || 2,
      school_count: parseInt(document.getElementById('f-school')?.value, 10) || 2,
      has_toilet: document.getElementById('f-toilet')?.value || '1',
      has_disabled: document.getElementById('f-disable')?.value || '2',
      cattle_count: parseInt(document.getElementById('f-cattle')?.value, 10) || 0,
      buffalo_count: parseInt(document.getElementById('f-buffalo')?.value, 10) || 0,
      other_animals_count: parseInt(document.getElementById('f-other-animals')?.value, 10) || 0,
      trainings: getChipValues('#f-trainings'),
      records: getChipValues('#f-records'),
      updated_at: new Date().toISOString()
    };
    saveICSStores();
  }

  function saveCurrentPlotBaselineForm() {
    if (!selectedPlot) return;
    const key = selectedPlot.id;
    const existing = icsInspections[key] || {};
    icsInspections[key] = {
      ...existing,
      plot_db_id: selectedPlot.id,
      family_id: selectedPlot.family_id,
      plot_id: selectedPlot.plot_id,
      inspection_date: document.getElementById('p-inspection-date')?.value || '',
      area_ha: parseFloat(document.getElementById('p-area-ha')?.value) || selectedPlot.area_ha || 0,
      land_situation: document.getElementById('p-land-situation')?.value || '1',
      irrigation: document.getElementById('p-irrigation')?.value || '1',
      contamination: document.getElementById('p-contamination')?.value || '2',
      avoid_method: document.getElementById('p-avoid-method')?.value.trim() || '',
      last_prohibited: document.getElementById('p-last-prohibited')?.value || '2',
      prohibited_inputs: getChipValues('#p-prohibited-chips'),
      prohibited_date: document.getElementById('p-prohibited-date')?.value || '',
      other_crop: document.getElementById('p-other-crop')?.value || '2',
      crop_name: document.getElementById('p-crop-name')?.value.trim() || '',
      crop_status: document.getElementById('p-crop-status')?.value || 'Before',
      exp_last_year: parseFloat(document.getElementById('p-exp-last-year')?.value) || 0,
      actual_last_year: parseFloat(document.getElementById('p-actual-last-year')?.value) || 0,
      sold_ircc: parseFloat(document.getElementById('p-sold-ircc')?.value) || 0,
      seed_kept: parseFloat(document.getElementById('p-seed-kept')?.value) || 0,
      consumed: parseFloat(document.getElementById('p-consumed')?.value) || 0,
      updated_at: new Date().toISOString()
    };
    saveICSStores();
  }

  function saveCurrentHarvestForm() {
    if (!selectedPlot) return;
    const key = selectedPlot.id;
    const existing = icsInspections[key] || {};
    icsInspections[key] = {
      ...existing,
      harvest_complete: document.getElementById('h-complete')?.value || '1',
      harvest_reason_no: document.getElementById('h-reason-no')?.value || '',
      harvest_date: document.getElementById('h-date')?.value || '',
      harvest_method: document.getElementById('h-method')?.value || '3',
      machine_owner: document.getElementById('h-owner')?.value.trim() || '',
      flush_qty: parseFloat(document.getElementById('h-flush')?.value) || 0,
      dry_loc: document.getElementById('h-dry-loc')?.value || '1',
      diff_plots: document.getElementById('h-diff-plots')?.value || '1',
      actual_kg: parseFloat(document.getElementById('h-actual-kg')?.value) || 0,
      sale_kg: parseFloat(document.getElementById('h-sale-kg')?.value) || 0,
      consume_kg: parseFloat(document.getElementById('h-consume-kg')?.value) || 0,
      seed_kg: parseFloat(document.getElementById('h-seed-kg')?.value) || 0,
      payment_type: document.getElementById('h-payment-type')?.value || '1',
      payment_amount: parseFloat(document.getElementById('h-payment-amount')?.value) || 0,
      updated_at: new Date().toISOString()
    };
    saveICSStores();
  }

  function saveCompleteRecord() {
    if (!selectedPlot) {
      showToast('⚠️ Please select a plot on the map first');
      return;
    }

    saveCurrentFarmerForm();
    saveCurrentPlotBaselineForm();
    saveCurrentHarvestForm();

    const key = selectedPlot.id;
    const inspector = document.getElementById('c-inspector-name')?.value.trim() || '';
    if (inspector) {
      sessionState.inspectorName = inspector;
    }

    const sigData = getSignatureDataUrl();

    icsInspections[key] = {
      ...icsInspections[key],
      farmer_compliant: document.getElementById('f-compliant')?.value || '1',
      nc_types: getChipValues('#f-nc-types'),
      nc_remark: document.getElementById('f-nc-remark')?.value.trim() || '',
      nc_date: document.getElementById('f-nc-date')?.value || '',
      nc_status: document.getElementById('f-nc-status')?.value || 'Organic',
      have_chamkar: document.getElementById('c-have-chamkar')?.value || '2',
      chamkar_num: parseInt(document.getElementById('c-chamkar-num')?.value, 10) || 1,
      chamkar_area: parseFloat(document.getElementById('c-chamkar-area')?.value) || 0,
      chamkar_crops: getChipValues('#c-chamkar-crops'),
      has_rice_barn: document.getElementById('c-rice-barn')?.value || '1',
      barn_chambers: parseInt(document.getElementById('c-chambers')?.value, 10) || 1,
      barn_clean: document.getElementById('c-barn-clean')?.value || '1',
      barn_free_chemicals: document.getElementById('c-barn-chemicals')?.value || '1',
      cleared_forest: document.getElementById('c-clear-forest')?.value || '2',
      expanded_land: document.getElementById('c-expand-land')?.value || '2',
      burned_straw: document.getElementById('c-burn-straw')?.value || '2',
      firebreak_kept: document.getElementById('c-firebreak')?.value || '1',
      certified_status: document.getElementById('c-certified-status')?.value || '1',
      conclusion_notes: document.getElementById('c-conclusion-notes')?.value.trim() || '',
      inspector_name: inspector,
      irpg_name: document.getElementById('c-irpg-name')?.value.trim() || '',
      signature_data: sigData,
      is_completed: true,
      completed_at: new Date().toISOString()
    };

    saveICSStores();
    renderSubplotsListForSelectedPlot();
    showToast(`✅ Saved complete ICS 2026 record for Plot ${selectedPlot.plot_id}`);
  }

  // --- Subplot Card Actions & Inspection Modal ---
  function openSubplotInspectionModal(sp) {
    editingSubplotInstance = sp;
    modalPlotRef.textContent = `Family ${sp.parent_family_id} · Plot ${sp.parent_plot_num} · ${sp.code}`;

    subplotCode.value = sp.code || '';
    subplotVariety.value = ['Phka Rumduol', 'Red Jasmine', 'Local Variety', 'Sticky Rice', 'Other', 'Fallow'].includes(sp.variety)
      ? sp.variety
      : 'Other';
    if (subplotVariety.value === 'Other') {
      customVarietyGroup.style.display = 'block';
      subplotCustomVariety.value = sp.variety || '';
    } else {
      customVarietyGroup.style.display = 'none';
      subplotCustomVariety.value = '';
    }

    subplotAreaPct.value = sp.pct_of_parent || '';
    subplotAreaHa.value = sp.area_ha || '';
    subplotNotes.value = sp.notes || '';

    // Allocation banner stats
    const parentHa = sp.parent_area_ha || (selectedPlot ? selectedPlot.area_ha : 1.0);
    currentModalParentHa = parentHa;
    const otherSubplots = subplots.filter((s) => s.parent_plot_id === sp.parent_plot_id && s.id !== sp.id);
    const otherUsedPct = roundTo(otherSubplots.reduce((acc, s) => acc + (parseFloat(s.pct_of_parent) || 0), 0), 1);
    currentModalUsedPct = otherUsedPct;
    currentModalRemainingPct = Math.max(0, roundTo(100 - otherUsedPct, 1));
    currentModalRemainingHa = Math.max(0, roundTo((currentModalRemainingPct / 100) * parentHa, 2));

    if (allocMainHa) allocMainHa.textContent = `${parentHa.toFixed(2)} ha`;
    if (allocRemainingPct) allocRemainingPct.textContent = `${currentModalRemainingPct}%`;
    if (allocRemainingHa) allocRemainingHa.textContent = `${currentModalRemainingHa.toFixed(2)} ha`;
    if (allocMeterUsed) allocMeterUsed.style.width = `${Math.min(100, otherUsedPct)}%`;

    // Extended ICS 2026 fields
    setVal('sp-seed-source', sp.seed_source || 'Own saved');
    setVal('sp-seed-kg', sp.seed_kg || '');
    setVal('sp-planting-date', sp.planting_date || '');
    setVal('sp-planting-method', sp.planting_method || 'Direct seeding');
    setVal('sp-fertilizer-toggle', sp.fertilizer_applied ? 'yes' : 'no');
    const spFertBlock = document.getElementById('sp-fertilizer-block');
    if (spFertBlock) spFertBlock.style.display = sp.fertilizer_applied ? 'block' : 'none';
    setChipValues('#sp-fertilizer-chips', sp.fertilizer_types || []);
    setVal('sp-fertilizer-qty', sp.fertilizer_qty || '');
    setVal('sp-fertilizer-date', sp.fertilizer_date || '');

    setVal('sp-protection-toggle', sp.crop_protection_applied ? 'yes' : 'no');
    const spProtBlock = document.getElementById('sp-protection-block');
    if (spProtBlock) spProtBlock.style.display = sp.crop_protection_applied ? 'block' : 'none';
    setVal('sp-protection-action', sp.protection_action || '');
    setVal('sp-protection-qty', sp.protection_qty || '');
    setVal('sp-protection-date', sp.protection_date || '');

    setVal('sp-expected-yield', sp.expected_production_kg || '');
    setVal('sp-expected-sale', sp.expected_sale_kg || '');

    validateSubplotAllocation();
    subplotModal.style.display = 'flex';
  }

  function openHarvestModal(sp) {
    switchDrawerTab('tab-harvest');
    const hActual = document.getElementById('h-actual-kg');
    if (hActual) {
      hActual.focus();
      hActual.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    showToast(`🌾 Switched to Harvest & Threshing tab for ${sp.code}`);
  }

  function buildSubplotCardBadges(sp) {
    let badges = '';
    if (sp.inspected || sp.seed_source || sp.fertilizer_applied) {
      badges += `<span class="insp-badge insp-badge-done">✓ Inspected</span>`;
    }
    const insp = icsInspections[sp.parent_plot_id];
    if (insp && insp.harvest_complete === '1' && insp.actual_kg > 0) {
      badges += `<span class="insp-badge insp-badge-harvest">🌾 Harvested</span>`;
    }
    return badges;
  }

  // --- Export ICS 2026 CSV (Flat View) ---
  function exportICSCsv() {
    const rows = [];
    rows.push([
      'season_year', 'site', 'village', 'commune', 'family_id', 'farmer_name', 'gender', 'ethnicity',
      'interviewee_head', 'interviewee_name', 'farmer_status', 'compliance_status', 'members_count', 'children_school',
      'toilet', 'disability', 'livestock_cow', 'livestock_buffalo',
      'plot_id', 'plot_area_ha', 'land_situation', 'irrigation', 'contamination_risk', 'mitigation_method',
      'prohibited_used_3yr', 'prohibited_types', 'intercrop_present', 'intercrop_name',
      'exp_last_yr_kg', 'actual_last_yr_kg', 'sold_ircc_last_yr_kg',
      'subplot_id', 'subplot_name', 'variety', 'subplot_pct', 'subplot_ha',
      'seed_source', 'seed_kg', 'planting_date', 'planting_method',
      'fert_applied', 'fert_types', 'fert_qty_kg', 'crop_protection_applied', 'protection_action',
      'expected_harvest_kg', 'expected_sale_kg',
      'thresh_complete', 'thresh_date', 'thresh_method', 'machine_contractor', 'organic_flush_kg',
      'drying_location', 'separate_threshing', 'actual_harvest_kg', 'for_sale_kg', 'household_kg', 'seed_kept_kg',
      'thresh_payment_mode', 'thresh_payment_amount',
      'has_chamkar', 'chamkar_num', 'chamkar_area_ha', 'chamkar_crops',
      'has_rice_barn', 'barn_chambers', 'barn_clean', 'barn_free_chemicals',
      'forest_cleared', 'boundary_expanded', 'burned_straw', 'firebreak_kept',
      'final_recommendation', 'inspector_name', 'village_rep', 'has_signature', 'export_timestamp'
    ].join(','));

    const season = sessionState.seasonYear;

    subplots.forEach((sp) => {
      const fid = sp.parent_family_id;
      const f = farmersStore[fid] || {};
      const insp = icsInspections[sp.parent_plot_id] || {};
      const plotMeta = allFeatures.find((ft) => ft.properties && ft.properties.id === sp.parent_plot_id);
      const commune = plotMeta ? (plotMeta.properties.commune || '') : '';

      const row = [
        season,
        csvQ(sp.parent_site), csvQ(sp.parent_village), csvQ(commune),
        csvQ(fid), csvQ(f.hoh_name || ''), csvQ(f.hoh_sex || '1'), csvQ(f.ethnicity || '1'),
        csvQ(f.is_head_interviewee || '1'), csvQ(f.interviewee_name || ''), csvQ(f.status || '1'),
        csvQ(insp.farmer_compliant || '1'), f.members_count || 4, f.school_count || 2,
        csvQ(f.has_toilet || '1'), csvQ(f.has_disabled || '2'), f.cattle_count || 0, f.buffalo_count || 0,
        csvQ(sp.parent_plot_num), sp.parent_area_ha || '', csvQ(insp.land_situation || '1'), csvQ(insp.irrigation || '1'),
        csvQ(insp.contamination || '2'), csvQ(insp.avoid_method || ''),
        csvQ(insp.last_prohibited || '2'), csvQ((insp.prohibited_inputs || []).join('; ')),
        csvQ(insp.other_crop || '2'), csvQ(insp.crop_name || ''),
        insp.exp_last_year || '', insp.actual_last_year || '', insp.sold_ircc || '',
        csvQ(sp.id), csvQ(sp.code), csvQ(sp.variety), sp.pct_of_parent || '', sp.area_ha || '',
        csvQ(sp.seed_source || 'Own saved'), sp.seed_kg || '', csvQ(sp.planting_date || ''), csvQ(sp.planting_method || 'Direct seeding'),
        sp.fertilizer_applied ? 'Yes' : 'No', csvQ((sp.fertilizer_types || []).join('; ')), sp.fertilizer_qty || '',
        sp.crop_protection_applied ? 'Yes' : 'No', csvQ(sp.protection_action || ''),
        sp.expected_production_kg || '', sp.expected_sale_kg || '',
        csvQ(insp.harvest_complete || '1'), csvQ(insp.harvest_date || ''), csvQ(insp.harvest_method || '3'),
        csvQ(insp.machine_owner || ''), insp.flush_qty || 0, csvQ(insp.dry_loc || '1'), csvQ(insp.diff_plots || '1'),
        insp.actual_kg || '', insp.sale_kg || '', insp.consume_kg || '', insp.seed_kg || '',
        csvQ(insp.payment_type || '1'), insp.payment_amount || '',
        csvQ(insp.have_chamkar || '2'), insp.chamkar_num || '', insp.chamkar_area || '', csvQ((insp.chamkar_crops || []).join('; ')),
        csvQ(insp.has_rice_barn || '1'), insp.barn_chambers || '', csvQ(insp.barn_clean || '1'), csvQ(insp.barn_free_chemicals || '1'),
        csvQ(insp.cleared_forest || '2'), csvQ(insp.expanded_land || '2'), csvQ(insp.burned_straw || '2'), csvQ(insp.firebreak_kept || '1'),
        csvQ(insp.certified_status || '1'), csvQ(insp.inspector_name || sessionState.inspectorName), csvQ(insp.irpg_name || ''),
        insp.signature_data ? 'Yes' : 'No',
        new Date().toISOString()
      ];
      rows.push(row.join(','));
    });

    if (rows.length <= 1) {
      showToast('⚠️ No subplots sketched yet to export.');
      return;
    }

    const csv = rows.join('\r\n');
    downloadBlob(csv, `ibis_ics_2026_report_${season}_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
    showToast(`✅ Exported ${rows.length - 1} subplot inspection rows to CSV`);
  }

  // --- Export SurveySolutions JSON Format ---
  function exportICSJson() {
    const season = sessionState.seasonYear;
    const output = [];

    // Group by family
    const familyIds = Array.from(new Set(subplots.map((s) => s.parent_family_id)));
    familyIds.forEach((fid) => {
      const f = farmersStore[fid] || {};
      const familySubplots = subplots.filter((s) => s.parent_family_id === fid);
      const parentPlotIds = Array.from(new Set(familySubplots.map((s) => s.parent_plot_id)));

      const parcels = parentPlotIds.map((pId) => {
        const insp = icsInspections[pId] || {};
        const pSubplots = familySubplots.filter((s) => s.parent_plot_id === pId);

        return {
          plot_id: pSubplots[0] ? pSubplots[0].parent_plot_num : '',
          plot_db_id: pId,
          inspection_date: insp.inspection_date || '',
          area_ha: insp.area_ha || (pSubplots[0] ? pSubplots[0].parent_area_ha : 0),
          land_situation: insp.land_situation || '1',
          irrigation: insp.irrigation || '1',
          contamination_risk: insp.contamination || '2',
          mitigation: insp.avoid_method || '',
          prohibited_used_3yr: insp.last_prohibited || '2',
          prohibited_inputs: insp.prohibited_inputs || [],
          other_crops: insp.other_crop || '2',
          crop_name: insp.crop_name || '',
          mass_balance_last_season: {
            exp_kg: insp.exp_last_year || 0,
            actual_kg: insp.actual_last_year || 0,
            sold_ircc_kg: insp.sold_ircc || 0,
            seed_kept_kg: insp.seed_kept || 0,
            consumed_kg: insp.consumed || 0
          },
          subplots: pSubplots.map((sp) => ({
            subplot_id: sp.id,
            subplot_name: sp.code,
            variety: sp.variety,
            percentage_of_plot: sp.pct_of_parent,
            area_ha: sp.area_ha,
            coordinates: sp.coordinates,
            seed_source: sp.seed_source || 'Own saved',
            seed_kg: sp.seed_kg || 0,
            planting_date: sp.planting_date || '',
            planting_method: sp.planting_method || 'Direct seeding',
            fertilizer_applied: !!sp.fertilizer_applied,
            fertilizer_types: sp.fertilizer_types || [],
            fertilizer_qty_kg: sp.fertilizer_qty || 0,
            protection_applied: !!sp.crop_protection_applied,
            protection_method: sp.protection_action || '',
            protection_qty: sp.protection_qty || 0,
            expected_production_kg: sp.expected_production_kg || 0,
            expected_sale_kg: sp.expected_sale_kg || 0,
            notes: sp.notes || ''
          })),
          threshing_record: {
            complete: insp.harvest_complete || '1',
            reason_incomplete: insp.harvest_reason_no || '',
            threshing_date: insp.harvest_date || '',
            method: insp.harvest_method || '3',
            machine_contractor: insp.machine_owner || '',
            organic_flush_kg: insp.flush_qty || 0,
            drying_location: insp.dry_loc || '1',
            separate_subplots: insp.diff_plots || '1',
            actual_harvest_kg: insp.actual_kg || 0,
            for_sale_kg: insp.sale_kg || 0,
            household_kg: insp.consume_kg || 0,
            seed_kept_kg: insp.seed_kg || 0,
            payment_type: insp.payment_type || '1',
            payment_amount: insp.payment_amount || 0
          },
          post_harvest_and_chamkar: {
            has_chamkar: insp.have_chamkar || '2',
            chamkar_num: insp.chamkar_num || 0,
            chamkar_area_ha: insp.chamkar_area || 0,
            chamkar_crops: insp.chamkar_crops || [],
            has_rice_barn: insp.has_rice_barn || '1',
            barn_chambers: insp.barn_chambers || 1,
            barn_clean: insp.barn_clean || '1',
            barn_free_chemicals: insp.barn_free_chemicals || '1'
          },
          environmental_standards: {
            forest_cleared: insp.cleared_forest || '2',
            boundary_expanded: insp.expanded_land || '2',
            burned_straw: insp.burned_straw || '2',
            firebreak_kept: insp.firebreak_kept || '1'
          },
          confirmation: {
            certified_recommendation: insp.certified_status || '1',
            conclusion_notes: insp.conclusion_notes || '',
            inspector_name: insp.inspector_name || sessionState.inspectorName,
            village_rep: insp.irpg_name || '',
            has_signature: !!insp.signature_data,
            completed_at: insp.completed_at || ''
          }
        };
      });

      output.push({
        family_id: fid,
        season_year: season,
        farmer_profile: {
          head_name: f.hoh_name || '',
          head_gender: f.hoh_sex || '1',
          is_head_interviewee: f.is_head_interviewee || '1',
          ethnicity: f.ethnicity || '1',
          interviewee_name: f.interviewee_name || '',
          interviewee_gender: f.interviewee_gender || '1',
          status: f.status || '1',
          labor_mf: f.labor_mf || '3',
          members_count: f.members_count || 4,
          females_count: f.females_count || 2,
          school_count: f.school_count || 2,
          has_toilet: f.has_toilet || '1',
          has_disabled: f.has_disabled || '2',
          cattle_count: f.cattle_count || 0,
          buffalo_count: f.buffalo_count || 0,
          other_animals_count: f.other_animals_count || 0,
          trainings_attended: f.trainings || [],
          records_kept: f.records || []
        },
        parcels: parcels
      });
    });

    if (output.length === 0) {
      showToast('⚠️ No inspection records to export.');
      return;
    }

    const jsonStr = JSON.stringify(output, null, 2);
    downloadBlob(jsonStr, `survey_solutions_ics_2026_${season}_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
    showToast(`✅ Exported ${output.length} SurveySolutions household record(s)`);
  }

  // --- Export Full GeoJSON ---
  function exportFullGeoJSON() {
    const season = sessionState.seasonYear;
    const features = subplots.map((sp) => {
      const fid = sp.parent_family_id;
      const f = farmersStore[fid] || {};
      const insp = icsInspections[sp.parent_plot_id] || {};
      const isPoly = sp.coordinates && sp.coordinates.length >= 3;
      const geom = isPoly
        ? { type: 'Polygon', coordinates: [sp.coordinates.map((pt) => [roundTo(pt[1], 6), roundTo(pt[0], 6)])] }
        : { type: 'Point', coordinates: [roundTo(sp.lng, 6), roundTo(sp.lat, 6)] };

      return {
        type: 'Feature',
        id: sp.id,
        properties: {
          // Subplot
          subplot_id: sp.id,
          subplot_name: sp.code,
          variety: sp.variety,
          pct_of_parent: sp.pct_of_parent,
          area_ha: sp.area_ha,
          seed_source: sp.seed_source || 'Own saved',
          seed_kg: sp.seed_kg || 0,
          planting_date: sp.planting_date || '',
          planting_method: sp.planting_method || 'Direct seeding',
          fertilizer_applied: !!sp.fertilizer_applied,
          fertilizer_types: sp.fertilizer_types || [],
          fertilizer_qty_kg: sp.fertilizer_qty || 0,
          protection_applied: !!sp.crop_protection_applied,
          protection_action: sp.protection_action || '',
          expected_production_kg: sp.expected_production_kg || 0,
          expected_sale_kg: sp.expected_sale_kg || 0,
          notes: sp.notes || '',
          // Parent Plot & Farmer
          family_id: fid,
          plot_id: sp.parent_plot_num,
          plot_db_id: sp.parent_plot_id,
          site: sp.parent_site,
          village: sp.parent_village,
          farmer_name: f.hoh_name || '',
          farmer_status: f.status || '1',
          compliance_status: insp.farmer_compliant || '1',
          land_situation: insp.land_situation || '1',
          irrigation: insp.irrigation || '1',
          contamination_risk: insp.contamination || '2',
          // Harvest
          thresh_complete: insp.harvest_complete || '1',
          actual_harvest_kg: insp.actual_kg || 0,
          for_sale_kg: insp.sale_kg || 0,
          household_kg: insp.consume_kg || 0,
          seed_kept_kg: insp.seed_kg || 0,
          // Outcome
          certified_recommendation: insp.certified_status || '1',
          inspector_name: insp.inspector_name || sessionState.inspectorName,
          village_rep: insp.irpg_name || '',
          has_signature: !!insp.signature_data,
          season_year: season,
          export_date: new Date().toISOString()
        },
        geometry: geom
      };
    });

    if (!features.length) {
      showToast('⚠️ No subplot features to export.');
      return;
    }

    downloadBlob(
      JSON.stringify({ type: 'FeatureCollection', features }, null, 2),
      `ibis_full_ics_2026_${season}_${new Date().toISOString().slice(0, 10)}.geojson`,
      'application/geo+json'
    );
    showToast(`✅ Exported ${features.length} GeoJSON features`);
  }

  function csvQ(val) {
    if (val === null || val === undefined || val === '') return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

})();

