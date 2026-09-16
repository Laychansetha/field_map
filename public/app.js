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
  const modalPlotRef = document.getElementById('modal-plot-ref');
  const subplotAreaHa = document.getElementById('subplot-area-ha');
  const subplotAreaPct = document.getElementById('subplot-area-pct');
  const subplotCode = document.getElementById('subplot-code');
  const subplotVariety = document.getElementById('subplot-variety');
  const customVarietyGroup = document.getElementById('custom-variety-group');
  const subplotCustomVariety = document.getElementById('subplot-custom-variety');
  const subplotNotes = document.getElementById('subplot-notes');

  const toast = document.getElementById('toast');
  const offlineBadge = document.getElementById('offline-badge');

  // --- Initialize App ---
  document.addEventListener('DOMContentLoaded', () => {
    initServiceWorker();
    loadStoredSubplots();
    initMap();
    initOrientationListener();
    loadPlotData();
    bindEvents();
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
      zoomControl: true,
      attributionControl: false,
      maxZoom: 19,
      minZoom: 6
      // No preferCanvas - use default SVG renderer for reliability
    }).setView([13.7, 105.8], 8);

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

    // Re-render visible plots on map move/zoom
    map.on('moveend', throttledRenderVisiblePlots);
    map.on('zoomend', throttledRenderVisiblePlots);

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
          <span class="sp-icon">🌾</span>
          <span class="sp-code">${escapeHtml(sp.code)}</span>
          <span class="sp-variety">${escapeHtml(sp.variety)}</span>
          <span class="sp-area">${sp.area_ha || 0} ha</span>
        </div>
      </div>
    `;
    return L.divIcon({
      className: 'custom-subplot-divicon',
      html: html,
      iconSize: [160, 32],
      iconAnchor: [80, 16]
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
    saveStoredSubplots();

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

  function openAddSubplotModal(latlng) {
    pendingSubplotLatLng = [latlng.lat, latlng.lng];

    const plotSubplots = subplots.filter((s) => s.parent_plot_id === drawingMainPlot.id);
    const existingCount = plotSubplots.length;
    const autoLabel = String.fromCharCode(65 + existingCount); // A, B, C...

    const parentHa = drawingMainPlot.area_ha || 1.0;
    const usedHa = plotSubplots.reduce((acc, s) => acc + (s.area_ha || 0), 0);
    const remainingHa = Math.max(0, roundTo(parentHa - usedHa, 2));

    const suggestedHa = remainingHa > 0
      ? roundTo(remainingHa > (parentHa / 2) ? (remainingHa / 2) : remainingHa, 2)
      : roundTo(parentHa / (existingCount + 2), 2);

    modalPlotRef.textContent = `Family ${drawingMainPlot.family_id} · Plot ${drawingMainPlot.plot_id} (${drawingMainPlot.village})`;
    subplotCode.value = `Subplot ${autoLabel}`;
    subplotVariety.value = 'Phka Rumduol';
    customVarietyGroup.style.display = 'none';
    subplotCustomVariety.value = '';
    subplotAreaHa.value = suggestedHa;
    subplotAreaPct.value = `${roundTo((suggestedHa / parentHa) * 100, 1)}%`;
    subplotNotes.value = '';

    subplotModal.style.display = 'flex';
    setTimeout(() => subplotCode.focus(), 80);
  }

  function updateDrawingStatusText() {
    if (!drawingMainPlot) return;
    const lines = divisionLines[drawingMainPlot.id] || [];
    const plotSubplots = subplots.filter((s) => s.parent_plot_id === drawingMainPlot.id);

    if (drawingMode === 'label') {
      drawingPointsCount.textContent = 'Tap inside any subplot section to add information & label';
    } else {
      if (lines.length === 0) {
        drawingPointsCount.textContent = 'Freely draw a line across the plot to divide subplots';
      } else {
        drawingPointsCount.textContent = `${lines.length} separation line${lines.length > 1 ? 's' : ''} · ${plotSubplots.length} labeled. Tap "+ Add Subplot" or Done.`;
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

    saveStoredSubplots();
    updateDrawingStatusText();
  }

  function finishSubplotDrawing() {
    saveStoredSubplots();
    exitFullscreenDrawingMode();
    renderAllStoredSubplotsOnMap();
    if (selectedPlot) {
      renderSubplotsListForSelectedPlot();
      plotDrawer.classList.remove('closed');
    }
    showToast(`✅ Saved subplots for Plot ${drawingMainPlot.plot_id}`);
  }

  function cancelSubplotDrawing() {
    exitFullscreenDrawingMode();
    renderAllStoredSubplotsOnMap();
    if (selectedPlot) {
      renderSubplotsListForSelectedPlot();
      plotDrawer.classList.remove('closed');
    }
    showToast('Drawing closed');
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
    const areaHa = parseFloat(subplotAreaHa.value) || 0;
    const parentHa = (drawingMainPlot && drawingMainPlot.area_ha) ? drawingMainPlot.area_ha : 1;
    const pct = parentHa > 0 ? roundTo((areaHa / parentHa) * 100, 1) : 0;

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
      created_at: new Date().toISOString()
    };

    subplots.push(newSubplot);
    saveStoredSubplots();

    // Create badge marker on map
    const badgeMarker = renderSingleSubplotBadge(newSubplot, true);

    drawingUndoStack.push({
      type: 'subplot',
      subplot: newSubplot,
      marker: badgeMarker
    });

    subplotModal.style.display = 'none';
    updateDrawingStatusText();
    showToast(`✅ Saved ${code}: ${variety} (${areaHa} ha)`);
  }

  // --- Render Subplots on Leaflet Map ---
  function renderAllStoredSubplotsOnMap() {
    if (subplotsLayerGroup) subplotsLayerGroup.clearLayers();
    if (divisionLinesLayerGroup) divisionLinesLayerGroup.clearLayers();

    // Render all saved division lines
    Object.keys(divisionLines).forEach((plotId) => {
      const lines = divisionLines[plotId] || [];
      lines.forEach((lineCoords) => {
        renderSingleDivisionLine(lineCoords, false);
      });
    });

    // Render all saved subplots (polygons if any, plus badge markers)
    subplots.forEach((sp) => {
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
    } else if (v.includes('kra-ob') || v.includes('sen kra')) {
      return { borderColor: '#16a34a', fillColor: '#22c55e', class: 'variety-senkraob' };
    } else if (v.includes('romdeng')) {
      return { borderColor: '#9333ea', fillColor: '#a855f7', class: 'variety-romdeng' };
    } else if (v.includes('kranhao')) {
      return { borderColor: '#ea580c', fillColor: '#f97316', class: 'variety-other' };
    } else if (v.includes('dry')) {
      return { borderColor: '#0284c7', fillColor: '#38bdf8', class: 'variety-other' };
    }
    return { borderColor: '#00d2ff', fillColor: '#00f0ff', class: 'variety-other' };
  }

  // --- Render Subplots in Bottom Sheet Drawer ---
  function renderSubplotsListForSelectedPlot() {
    if (!selectedPlot) {
      subplotsCountBadge.textContent = '0';
      subplotsList.innerHTML = '<div class="subplots-empty">Select a plot to view subplots.</div>';
      return;
    }

    const plotSubplots = subplots.filter((s) => s.parent_plot_id === selectedPlot.id);
    subplotsCountBadge.textContent = plotSubplots.length.toString();

    if (plotSubplots.length === 0) {
      subplotsList.innerHTML = `
        <div class="subplots-empty">
          No subplots sketched yet. Tap <b>"+ Draw Subplot"</b> to sketch rice variety parcels for Plot ${escapeHtml(selectedPlot.plot_id)}.
        </div>
      `;
      return;
    }

    subplotsList.innerHTML = '';
    const frag = document.createDocumentFragment();

    plotSubplots.forEach((sp) => {
      const style = getSubplotStyle(sp.variety);
      const card = document.createElement('div');
      card.className = 'subplot-card-item';
      card.style.borderLeftColor = style.borderColor;

      card.innerHTML = `
        <div class="subplot-card-info">
          <div class="subplot-card-header">
            <span class="subplot-card-code">${escapeHtml(sp.code)}</span>
            <span class="variety-tag ${style.class}">${escapeHtml(sp.variety)}</span>
          </div>
          <div class="subplot-card-meta">
            <b>${sp.area_ha} ha</b> (${sp.pct_of_parent || 0}% of main plot)
            ${sp.notes ? ` · <span style="font-style: italic; color: var(--text-muted);">${escapeHtml(sp.notes)}</span>` : ''}
          </div>
        </div>
        <div class="subplot-card-actions">
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
        if (e.target.closest('.delete-btn')) return;
        const poly = L.polygon(sp.coordinates);
        map.flyToBounds(poly.getBounds(), { maxZoom: 18, duration: 1.0, padding: [80, 80] });
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

    // Drawer handle
    drawerToggle.addEventListener('click', () => {
      plotDrawer.classList.toggle('closed');
    });

    // Navigation buttons
    btnDriveDirections.addEventListener('click', launchDrivingDirections);
    btnStartCompass.addEventListener('click', startWalkingCompassMode);
    btnCloseCompass.addEventListener('click', stopWalkingCompassMode);

    // Subplot Drawing & Separation Controls
    btnStartDrawing.addEventListener('click', () => startSubplotDrawing(selectedPlot));
    btnModeDrawLine.addEventListener('click', () => setDrawingMode('line'));
    btnModeAddLabel.addEventListener('click', () => setDrawingMode('label'));
    btnUndoPoint.addEventListener('click', undoLastAction);
    btnFinishDrawing.addEventListener('click', finishSubplotDrawing);
    btnCancelDrawing.addEventListener('click', cancelSubplotDrawing);

    // Subplot Modal Form
    subplotForm.addEventListener('submit', onSubplotFormSubmit);
    btnCloseModal.addEventListener('click', () => (subplotModal.style.display = 'none'));
    btnCancelModal.addEventListener('click', () => (subplotModal.style.display = 'none'));

    // Dynamic % calculation when user edits Area (ha)
    subplotAreaHa.addEventListener('input', () => {
      const val = parseFloat(subplotAreaHa.value);
      const parentHa = (drawingMainPlot && drawingMainPlot.area_ha) ? drawingMainPlot.area_ha : 1;
      if (!isNaN(val) && val >= 0 && parentHa > 0) {
        subplotAreaPct.value = `${((val / parentHa) * 100).toFixed(1)}%`;
      } else {
        subplotAreaPct.value = '';
      }
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

})();
