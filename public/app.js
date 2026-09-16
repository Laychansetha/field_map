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
  let subplots = []; // Array of saved subplots
  let subplotsLayerGroup = null; // Leaflet LayerGroup for rendered subplots
  let isDrawingSubplot = false;
  let drawingMainPlot = null;
  let drawingPoints = []; // Array of [lat, lng]
  let drawingMarkers = []; // Array of L.circleMarker
  let drawingLine = null; // L.polyline (open preview path)
  let drawingClosingLine = null; // L.polyline (closing segment back to first point)
  let drawingPreviewPoly = null; // L.polygon (filled preview)
  let drawingBoundaryRings = []; // [[lat,lng], ...] rings of main plot for containment check
  let mainPlotGuideLayer = null; // highlighted boundary guide while drawing
  let currentSubplotCalc = null; // { ha, m2, pct }
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
  const modalCalcHa = document.getElementById('modal-calc-ha');
  const modalCalcM2 = document.getElementById('modal-calc-m2');
  const modalCalcPct = document.getElementById('modal-calc-pct');
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

  // --- Subplots Local Storage ---
  function loadStoredSubplots() {
    try {
      const data = localStorage.getItem(SUBPLOTS_STORAGE_KEY);
      if (data) {
        subplots = JSON.parse(data);
        console.log(`[Subplots] Loaded ${subplots.length} subplots from storage.`);
      }
    } catch (e) {
      console.warn('[Subplots] Failed to load subplots:', e);
      subplots = [];
    }
  }

  function saveStoredSubplots() {
    try {
      localStorage.setItem(SUBPLOTS_STORAGE_KEY, JSON.stringify(subplots));
    } catch (e) {
      console.error('[Subplots] Failed to save subplots:', e);
      showToast('Error saving subplot to browser storage');
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

    // Layer group for rendered subplots (drawn on top of plots)
    subplotsLayerGroup = L.layerGroup().addTo(map);

    // Map click handler (for subplot drawing)
    map.on('click', (e) => {
      if (isDrawingSubplot) {
        addDrawingPoint(e.latlng);
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
              addDrawingPoint(e.latlng);
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

  // --- Subplot Drawing Workflow (Fullscreen Mode) ---

  function startSubplotDrawing(plot) {
    if (!plot) plot = selectedPlot;
    if (!plot) {
      showToast('Please select a plot first to sketch subplots');
      return;
    }

    drawingMainPlot = plot;
    isDrawingSubplot = true;
    drawingPoints = [];
    clearDrawingArtifacts();

    // Extract main plot boundary rings for containment check
    extractDrawingBoundaryRings(plot);

    // Enter fullscreen drawing mode
    enterFullscreenDrawingMode(plot);

    // Show drawing HUD
    drawingHud.style.display = 'flex';
    drawingTargetLabel.textContent = `${plot.family_id} · Plot ${plot.plot_id}`;
    drawingPointsCount.textContent = 'Tap inside the plot to place points';
    btnUndoPoint.disabled = true;
    btnFinishDrawing.disabled = true;

    showToast('Tap inside the plot boundary to draw a subplot');
  }

  // Extract boundary polygon rings from GeoJSON feature for point-in-poly checks
  function extractDrawingBoundaryRings(plot) {
    drawingBoundaryRings = [];
    const feature = allFeatures.find(f => f.properties && f.properties.id === plot.id);
    if (!feature || !feature.geometry) return;

    const geom = feature.geometry;
    const polys = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
    polys.forEach(poly => {
      poly.forEach(ring => {
        // GeoJSON ring: [lng, lat] -> convert to [lat, lng] for Leaflet
        drawingBoundaryRings.push(ring.map(pt => [pt[1], pt[0]]));
      });
    });
  }

  // Check if [lat, lng] is inside ANY of the main plot's exterior rings
  function isInsideMainPlot(lat, lng) {
    if (drawingBoundaryRings.length === 0) return true; // no boundary = allow anywhere
    // Point-in-polygon ray-casting (check outer rings, not holes)
    for (let ri = 0; ri < drawingBoundaryRings.length; ri++) {
      const ring = drawingBoundaryRings[ri];
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const rLat_i = ring[i][0], rLng_i = ring[i][1];
        const rLat_j = ring[j][0], rLng_j = ring[j][1];
        const intersect = ((rLat_i > lat) !== (rLat_j > lat)) &&
          (lng < (rLng_j - rLng_i) * (lat - rLat_i) / (rLat_j - rLat_i) + rLng_i);
        if (intersect) inside = !inside;
      }
      if (inside) return true;
    }
    return false;
  }

  function enterFullscreenDrawingMode(plot) {
    isFullscreenDrawing = true;
    // Hide top bar and compass to maximise map area
    document.getElementById('top-bar').style.display = 'none';
    plotDrawer.classList.add('closed');
    compassHud.style.display = 'none';
    document.getElementById('map-wrapper').style.flex = '1';
    document.getElementById('app-container').classList.add('drawing-fullscreen');
    document.getElementById('map').classList.add('drawing-active');

    // Zoom to the selected plot with generous padding
    const layer = plotLayersById.get(plot.id);
    if (layer && layer.getBounds) {
      map.flyToBounds(layer.getBounds(), { maxZoom: 19, padding: [60, 60], duration: 0.7 });
    } else if (plot.lat && plot.lng) {
      map.flyTo([plot.lat, plot.lng], 18, { duration: 0.7 });
    }

    // Show the main plot as a bright guide boundary
    showMainPlotGuide(plot);
  }

  function exitFullscreenDrawingMode() {
    isFullscreenDrawing = false;
    document.getElementById('top-bar').style.display = '';
    document.getElementById('app-container').classList.remove('drawing-fullscreen');
    document.getElementById('map').classList.remove('drawing-active');
    drawingHud.style.display = 'none';

    // Remove boundary guide
    if (mainPlotGuideLayer) {
      map.removeLayer(mainPlotGuideLayer);
      mainPlotGuideLayer = null;
    }
  }

  function showMainPlotGuide(plot) {
    if (mainPlotGuideLayer) {
      map.removeLayer(mainPlotGuideLayer);
      mainPlotGuideLayer = null;
    }
    if (drawingBoundaryRings.length === 0) return;

    // The first ring of each polygon is the exterior ring
    // Re-package as Leaflet polygon (outer rings only)
    const latLngs = drawingBoundaryRings.map(ring => ring.map(pt => L.latLng(pt[0], pt[1])));
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

  function addDrawingPoint(latlng) {
    if (!isDrawingSubplot) return;

    const lat = latlng.lat, lng = latlng.lng;

    // --- Boundary restriction: reject points outside the main plot ---
    if (!isInsideMainPlot(lat, lng)) {
      // Flash red on the map to indicate rejection
      flashOutsideBoundary(latlng);
      showToast('⚠️ Tap inside the plot boundary');
      return;
    }

    const pt = [lat, lng];
    drawingPoints.push(pt);

    // Numbered vertex marker
    const num = drawingPoints.length;
    const marker = L.marker(pt, {
      icon: L.divIcon({
        className: 'drawing-vertex-icon',
        html: `<span>${num}</span>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      }),
      interactive: false
    }).addTo(map);
    drawingMarkers.push(marker);

    // Update preview
    updateDrawingPreview();

    const count = drawingPoints.length;
    drawingPointsCount.textContent = `${count} point${count > 1 ? 's' : ''}${count >= 3 ? ' — tap Finish ✓' : ''}`;
    btnUndoPoint.disabled = false;
    btnFinishDrawing.disabled = count < 3;
  }

  function flashOutsideBoundary(latlng) {
    const flash = L.circleMarker([latlng.lat, latlng.lng], {
      radius: 14, color: '#ef4444', weight: 3,
      fillColor: '#ef4444', fillOpacity: 0.4, interactive: false
    }).addTo(map);
    setTimeout(() => map.removeLayer(flash), 600);
  }

  function undoLastDrawingPoint() {
    if (drawingPoints.length === 0) return;
    drawingPoints.pop();
    const lastMarker = drawingMarkers.pop();
    if (lastMarker) map.removeLayer(lastMarker);
    updateDrawingPreview();
    const count = drawingPoints.length;
    drawingPointsCount.textContent = count === 0
      ? 'Tap inside the plot to place points'
      : `${count} point${count > 1 ? 's' : ''}${count >= 3 ? ' — tap Finish ✓' : ''}`;
    btnUndoPoint.disabled = count === 0;
    btnFinishDrawing.disabled = count < 3;
  }

  function updateDrawingPreview() {
    // Remove old preview layers
    if (drawingLine) { map.removeLayer(drawingLine); drawingLine = null; }
    if (drawingClosingLine) { map.removeLayer(drawingClosingLine); drawingClosingLine = null; }
    if (drawingPreviewPoly) { map.removeLayer(drawingPreviewPoly); drawingPreviewPoly = null; }

    if (drawingPoints.length < 2) return;

    // Open path between placed points
    drawingLine = L.polyline(drawingPoints, {
      color: '#00f0ff', weight: 2.5, dashArray: '7, 5', interactive: false
    }).addTo(map);

    // Closing dashed segment back to first point (when 3+)
    if (drawingPoints.length >= 3) {
      drawingClosingLine = L.polyline([drawingPoints[drawingPoints.length - 1], drawingPoints[0]], {
        color: '#00f0ff', weight: 1.5, dashArray: '4, 6', opacity: 0.5, interactive: false
      }).addTo(map);

      // Translucent fill preview polygon
      drawingPreviewPoly = L.polygon(drawingPoints, {
        color: '#00f0ff', weight: 0,
        fillColor: '#00f0ff', fillOpacity: 0.18, interactive: false
      }).addTo(map);
    }
  }

  function cancelSubplotDrawing() {
    isDrawingSubplot = false;
    drawingMainPlot = null;
    drawingBoundaryRings = [];
    clearDrawingArtifacts();
    exitFullscreenDrawingMode();
    plotDrawer.classList.remove('closed');
    showToast('Subplot drawing cancelled');
  }

  function clearDrawingArtifacts() {
    drawingMarkers.forEach(m => map.removeLayer(m));
    drawingMarkers = [];
    if (drawingLine) { map.removeLayer(drawingLine); drawingLine = null; }
    if (drawingClosingLine) { map.removeLayer(drawingClosingLine); drawingClosingLine = null; }
    if (drawingPreviewPoly) { map.removeLayer(drawingPreviewPoly); drawingPreviewPoly = null; }
  }

  function finishSubplotDrawing() {
    if (drawingPoints.length < 3) {
      showToast('Draw at least 3 points to form a polygon');
      return;
    }

    // Calculate Area
    const areaM2 = calculatePolygonAreaM2(drawingPoints);
    const areaHa = roundTo(areaM2 / 10000.0, 3);
    const parentHa = drawingMainPlot.area_ha || 1.0;
    const pct = roundTo((areaHa / parentHa) * 100, 1);

    currentSubplotCalc = { ha: areaHa, m2: Math.round(areaM2), pct: pct };

    // Auto-number subplots: use letter labels A, B, C...
    const existingCount = subplots.filter(s => s.parent_plot_id === drawingMainPlot.id).length;
    const autoLabel = String.fromCharCode(65 + existingCount); // A, B, C ...

    // Populate & open modal
    modalPlotRef.textContent = `Family ${drawingMainPlot.family_id} · Plot ${drawingMainPlot.plot_id} (${drawingMainPlot.village})`;
    modalCalcHa.textContent = `${areaHa} ha`;
    modalCalcM2.textContent = `${Math.round(areaM2).toLocaleString()} m²`;
    modalCalcPct.textContent = `${pct}%`;

    subplotCode.value = `Subplot ${autoLabel}`;
    subplotVariety.value = 'Phka Rumduol';
    customVarietyGroup.style.display = 'none';
    subplotCustomVariety.value = '';
    subplotNotes.value = '';

    subplotModal.style.display = 'flex';
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

    // Ensure polygon is closed (first point === last point)
    const ring = drawingPoints.slice();
    if (
      ring.length > 0 &&
      (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
    ) {
      ring.push(ring[0]);
    }

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
      area_ha: currentSubplotCalc ? currentSubplotCalc.ha : 0,
      area_m2: currentSubplotCalc ? currentSubplotCalc.m2 : 0,
      pct_of_parent: currentSubplotCalc ? currentSubplotCalc.pct : 0,
      coordinates: ring, // [[lat, lng], ...]
      created_at: new Date().toISOString()
    };

    subplots.push(newSubplot);
    saveStoredSubplots();

    // Close modal & exit fullscreen drawing mode
    subplotModal.style.display = 'none';
    isDrawingSubplot = false;
    drawingBoundaryRings = [];
    clearDrawingArtifacts();
    exitFullscreenDrawingMode();

    // Re-render subplots on map and update drawer
    renderAllStoredSubplotsOnMap();
    if (selectedPlot) renderSubplotsListForSelectedPlot();
    plotDrawer.classList.remove('closed');

    showToast(`✅ Saved ${code} (${variety}, ${newSubplot.area_ha} ha)`);
  }

  // --- Render Subplots on Leaflet Map ---
  function renderAllStoredSubplotsOnMap() {
    if (!subplotsLayerGroup) return;
    subplotsLayerGroup.clearLayers();

    subplots.forEach((sp) => {
      const style = getSubplotStyle(sp.variety);
      const poly = L.polygon(sp.coordinates, {
        pane: 'subplotsPane',
        color: style.borderColor,
        weight: 2.5,
        dashArray: '4, 4',
        fillColor: style.fillColor,
        fillOpacity: 0.55
      });

      // Tooltip / Popup on Subplot
      poly.bindTooltip(
        `<b>${escapeHtml(sp.code)}</b> (${escapeHtml(sp.variety)})<br>${sp.area_ha} ha (${sp.pct_of_parent || 0}%)`,
        { className: 'plot-label-tooltip', sticky: true, direction: 'center' }
      );

      poly.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        // Find parent plot if available and select it
        const parentPlot = searchIndex.find((p) => p.id === sp.parent_plot_id);
        if (parentPlot) {
          selectPlot(parentPlot, false);
        }
        showToast(`Subplot ${sp.code}: ${sp.variety} · ${sp.area_ha} ha`);
      });

      subplotsLayerGroup.addLayer(poly);
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
    if (subplots.length === 0) {
      showToast('No subplots have been sketched yet');
      return;
    }

    const features = subplots.map((sp) => {
      // GeoJSON coordinates format is [lon, lat]
      const geojsonRing = sp.coordinates.map((pt) => [roundTo(pt[1], 6), roundTo(pt[0], 6)]);
      return {
        type: 'Feature',
        id: sp.id,
        properties: {
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
        geometry: {
          type: 'Polygon',
          coordinates: [geojsonRing]
        }
      };
    });

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

    showToast(`Exported ${subplots.length} subplots to GeoJSON`);
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

    // Filters
    btnToggleFilters.addEventListener('click', () => {
      filterPanel.classList.toggle('closed');
      btnToggleFilters.classList.toggle('active', !filterPanel.classList.contains('closed'));
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

    // Subplot Drawing Controls
    btnStartDrawing.addEventListener('click', () => startSubplotDrawing(selectedPlot));
    btnUndoPoint.addEventListener('click', undoLastDrawingPoint);
    btnFinishDrawing.addEventListener('click', finishSubplotDrawing);
    btnCancelDrawing.addEventListener('click', cancelSubplotDrawing);

    // Subplot Modal Form
    subplotForm.addEventListener('submit', onSubplotFormSubmit);
    btnCloseModal.addEventListener('click', () => (subplotModal.style.display = 'none'));
    btnCancelModal.addEventListener('click', () => (subplotModal.style.display = 'none'));

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
