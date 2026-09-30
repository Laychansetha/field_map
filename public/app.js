/**
 * IBIS RICE PLOT NAVIGATOR - FIELD PWA APPLICATION
 * Supports offline search, plot selection, driving directions,
 * and interactive subplot sketching for field inspections.
 */

(function () {
  'use strict';

  // --- State Variables ---
  let map = null;
  let satelliteLayer = null;
  let googleHybridLayer = null;
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

  // --- Subplot Inspection State ---
  const SUBPLOTS_STORAGE_KEY = 'ibis_inspection_subplots_v1';
  const DIVISION_LINES_STORAGE_KEY = 'ibis_plot_division_lines_v1';

  // --- Automated One-Time Clean Reset Check for Browser Clients ---
  const DB_CLEAN_VERSION = 'clean_fresh_2026_v5';
  if (localStorage.getItem('ibis_clean_reset') !== DB_CLEAN_VERSION) {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith('ibis_') && k !== 'ibis_auth_user') {
        localStorage.removeItem(k);
      }
    });
    localStorage.setItem('ibis_clean_reset', DB_CLEAN_VERSION);
    console.log('[System] All client testing data successfully purged for fresh deployment.');
  }
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
  const btnCloseFilterPanel = document.getElementById('btn-close-filter-panel');
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
  const pInspectionNotes = document.getElementById('p-inspection-notes');

  // Subplot Harvest Modal Elements
  const subplotHarvestModal = document.getElementById('subplot-harvest-modal');
  const subplotHarvestForm = document.getElementById('subplot-harvest-form');
  const btnCloseHarvestModal = document.getElementById('btn-close-harvest-modal');
  const btnCancelHarvestModal = document.getElementById('btn-cancel-harvest-modal');
  let editingHarvestSubplot = null;

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
          try { reg.update(); } catch(e) {}
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
    if (offlineBadge) {
      if (navigator.onLine) {
        offlineBadge.innerHTML = '<span class="status-dot"></span> Online & Cached';
        offlineBadge.style.color = '#4ade80';
      } else {
        offlineBadge.innerHTML = '<span class="status-dot"></span> Offline Mode';
        offlineBadge.style.color = '#f59e0b';
      }
    }
    if (!navigator.onLine) {
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
  let masterFeatures = []; // Unfiltered nationwide GeoJSON features
  let masterSearchIndex = []; // Unfiltered nationwide search index
  let renderedIds = new Set(); // IDs of currently rendered features
  let renderThrottle = null;

  // --- Map Initialization ---
  function initMap() {
    map = L.map('map', {
      preferCanvas: true,
      zoomControl: false,
      attributionControl: false,
      maxZoom: 21,
      minZoom: 6
    }).setView([13.7, 105.8], 8);

    // Position zoom buttons in bottom-right corner so they never overlap the left drawer or top search
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Custom pane for subplots to always render above main plot polygons
    map.createPane('subplotsPane');
    map.getPane('subplotsPane').style.zIndex = 450;

    // Primary Satellite basemap (ESRI World Imagery with maxNativeZoom: 17 to scale up smoothly past level 17)
    satelliteLayer = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      {
        maxNativeZoom: 17,
        maxZoom: 21,
        opacity: 1
      }
    ).addTo(map);

    // High-Resolution Google Hybrid Satellite Layer
    googleHybridLayer = L.tileLayer(
      'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
      {
        maxNativeZoom: 19,
        maxZoom: 21
      }
    );

    // Street / Terrain basemap (OpenStreetMap)
    osmLayer = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxNativeZoom: 18,
        maxZoom: 21
      }
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
      masterSearchIndex = indexData.plots || [];
      searchIndex = masterSearchIndex;
      hierarchy = indexData.hierarchy || {};

      populateSiteFilter();
      renderQuickExploreSanctuaries();
      filterStatusText.textContent = `${searchIndex.length.toLocaleString()} plots ready`;

      // 2. Fetch GeoJSON geometries (large file)
      const geoResp = await fetch('data/plots.geojson');
      if (!geoResp.ok) throw new Error(`HTTP ${geoResp.status} loading plots.geojson`);
      plotsGeojson = await geoResp.json();

      // Store master features for territory-based filtering
      masterFeatures = plotsGeojson.features || [];
      allFeatures = masterFeatures;
      console.log(`[Data] Loaded ${masterFeatures.length} plot features`);

      renderQuickExploreSanctuaries();

      // Initial render: respects any active inspector territory filter
      applyUserTerritoryFilter(true);
      showToast(`${searchIndex.length.toLocaleString()} plots loaded`);
    } catch (err) {
      console.error('Error loading plot data:', err);
      showToast(`Error loading plots: ${err.message}`);
    }
  }

  // --- Annual Inspection & Map Status Color Coding ---
  let currentSeason = '2026';

  function getPlotInspectionStatus(p, season = currentSeason) {
    if (!p) return 'pending';
    const farmerKey = getFarmerKey(p);
    const farmerRecord = farmersStore[farmerKey];

    // 1. Check if complete inspection confirmed for this farmer in current season
    if (farmerRecord && farmerRecord.confirmation && farmerRecord.confirmation.is_completed) {
      const compliance = farmerRecord.farmer_compliant || (farmerRecord.profile ? farmerRecord.profile.compliance_status : null);
      if (compliance === 'Non-Compliance' || compliance === 'Resign' || compliance === '2' || compliance === '3' || compliance === '4') {
        return 'non_compliant';
      }
      return 'completed';
    }

    // 2. Check if subplots have been drawn or baseline started for this plot
    const hasSubplots = subplots && subplots.some(s => s.parent_plot_id === p.id);
    const hasBaseline = farmerRecord && farmerRecord.plots && farmerRecord.plots[p.id];
    if (hasSubplots || hasBaseline || (farmerRecord && farmerRecord.profile)) {
      return 'in_progress';
    }

    return 'pending';
  }

  function isSelectedPlot(p) {
    if (!p || !selectedPlot) return false;
    if (p.id !== undefined && selectedPlot.id !== undefined && String(p.id) === String(selectedPlot.id)) {
      return true;
    }
    if (p.plot_id !== undefined && selectedPlot.plot_id !== undefined && p.family_id !== undefined && selectedPlot.family_id !== undefined) {
      return String(p.family_id) === String(selectedPlot.family_id) && String(p.plot_id) === String(selectedPlot.plot_id);
    }
    return false;
  }

  // --- Sanctuary Site Colors & Metadata System ---
  const SANCTUARY_SITES = {
    'Preah Vihear': {
      name: 'Preah Vihear',
      canonicalName: 'Preah Vihear',
      icon: '🦅',
      color: '#34d399',       // Emerald Green
      fillColor: '#059669',
      bgGlow: 'rgba(52, 211, 153, 0.16)',
      borderColor: 'rgba(52, 211, 153, 0.45)',
      activeBg: 'rgba(52, 211, 153, 0.35)',
      description: 'Preah Vihear Protected Landscape'
    },
    'Preay Lang': {
      name: 'Preay Lang',
      canonicalName: 'Preay Lang',
      altNames: ['preay lang', 'prey lang'],
      icon: '🌳',
      color: '#22d3ee',       // Cyan / Teal
      fillColor: '#0891b2',
      bgGlow: 'rgba(34, 211, 238, 0.16)',
      borderColor: 'rgba(34, 211, 238, 0.45)',
      activeBg: 'rgba(34, 211, 238, 0.35)',
      description: 'Preay Lang Wildlife Sanctuary'
    },
    'Prey Lang': {
      name: 'Preay Lang',
      canonicalName: 'Preay Lang',
      altNames: ['preay lang', 'prey lang'],
      icon: '🌳',
      color: '#22d3ee',
      fillColor: '#0891b2',
      bgGlow: 'rgba(34, 211, 238, 0.16)',
      borderColor: 'rgba(34, 211, 238, 0.45)',
      activeBg: 'rgba(34, 211, 238, 0.35)',
      description: 'Preay Lang Wildlife Sanctuary'
    },
    'Siem Pang': {
      name: 'Siem Pang',
      canonicalName: 'Siem Pang',
      icon: '🦜',
      color: '#fb7185',       // Rose / Coral
      fillColor: '#e11d48',
      bgGlow: 'rgba(251, 113, 133, 0.16)',
      borderColor: 'rgba(251, 113, 133, 0.45)',
      activeBg: 'rgba(251, 113, 133, 0.35)',
      description: 'Siem Pang Wildlife Sanctuary'
    },
    'Veun Sai': {
      name: 'Veun Sai',
      canonicalName: 'Veun Sai',
      altNames: ['veun sai', 'vuen sai'],
      icon: '🌺',
      color: '#c084fc',       // Purple / Amethyst
      fillColor: '#9333ea',
      bgGlow: 'rgba(192, 132, 252, 0.16)',
      borderColor: 'rgba(192, 132, 252, 0.45)',
      activeBg: 'rgba(192, 132, 252, 0.35)',
      description: 'Veun Sai National Park'
    },
    'Vuen Sai': {
      name: 'Veun Sai',
      canonicalName: 'Veun Sai',
      altNames: ['veun sai', 'vuen sai'],
      icon: '🌺',
      color: '#c084fc',
      fillColor: '#9333ea',
      bgGlow: 'rgba(192, 132, 252, 0.16)',
      borderColor: 'rgba(192, 132, 252, 0.45)',
      activeBg: 'rgba(192, 132, 252, 0.35)',
      description: 'Veun Sai National Park'
    },
    'Lumphat': {
      name: 'Lumphat',
      canonicalName: 'Lumphat',
      icon: '🐘',
      color: '#fbbf24',       // Amber / Gold
      fillColor: '#d97706',
      bgGlow: 'rgba(251, 191, 36, 0.16)',
      borderColor: 'rgba(251, 191, 36, 0.45)',
      activeBg: 'rgba(251, 191, 36, 0.35)',
      description: 'Lumphat Wildlife Sanctuary'
    },
    'Keo Seima': {
      name: 'Keo Seima',
      canonicalName: 'Keo Seima',
      icon: '🐒',
      color: '#4ade80',       // Spring Green
      fillColor: '#16a34a',
      bgGlow: 'rgba(74, 222, 128, 0.16)',
      borderColor: 'rgba(74, 222, 128, 0.45)',
      activeBg: 'rgba(74, 222, 128, 0.35)',
      description: 'Keo Seima Wildlife Sanctuary'
    }
  };

  function getSiteConfig(rawSiteName) {
    if (!rawSiteName) return {
      name: 'Conservation Zone',
      canonicalName: 'Conservation Zone',
      icon: '🌿',
      color: '#10b981',
      fillColor: '#059669',
      bgGlow: 'rgba(16, 185, 129, 0.16)',
      borderColor: 'rgba(16, 185, 129, 0.45)',
      activeBg: 'rgba(16, 185, 129, 0.35)'
    };
    const clean = String(rawSiteName).trim();
    if (SANCTUARY_SITES[clean]) return SANCTUARY_SITES[clean];

    const lower = clean.toLowerCase();
    for (const k in SANCTUARY_SITES) {
      if (k.toLowerCase() === lower) return SANCTUARY_SITES[k];
      if (SANCTUARY_SITES[k].altNames && SANCTUARY_SITES[k].altNames.includes(lower)) {
        return SANCTUARY_SITES[k];
      }
    }
    return {
      name: clean,
      canonicalName: clean,
      icon: '🌿',
      color: '#38bdf8',
      fillColor: '#0284c7',
      bgGlow: 'rgba(56, 189, 248, 0.16)',
      borderColor: 'rgba(56, 189, 248, 0.45)',
      activeBg: 'rgba(56, 189, 248, 0.35)'
    };
  }

  function getPlotStyle(p) {
    // Persistent Selection Highlight while Information Panel (drawer) is open
    const isDrawerOpen = plotDrawer && !plotDrawer.classList.contains('closed');
    if (p && selectedPlot && isDrawerOpen && isSelectedPlot(p)) {
      return {
        color: '#00f0ff',       // Cyan highlight border
        weight: 3.5,
        fillColor: '#facc15',   // Bright gold fill
        fillOpacity: 0.65,
        smoothFactor: 1.0
      };
    }

    if (!currentUser) {
      // General Public: Color-coded by Sanctuary Site for clear visual distinction
      const siteConfig = getSiteConfig(p ? (p.site || p.landscape) : null);
      return {
        color: siteConfig.color,          // Distinct site border color
        weight: 1.8,
        fillColor: siteConfig.fillColor,   // Distinct site fill color
        fillOpacity: 0.42,
        smoothFactor: 1.5
      };
    }

    // Authenticated Field Officers & Admin: Inspection workflow status coloring
    const status = getPlotInspectionStatus(p);
    switch (status) {
      case 'completed':
        return {
          color: '#059669',       // Emerald 600
          weight: 2,
          fillColor: '#10b981',   // Emerald 500
          fillOpacity: 0.65,
          smoothFactor: 1.2
        };
      case 'in_progress':
        return {
          color: '#d97706',       // Amber 600
          weight: 2,
          fillColor: '#f59e0b',   // Amber 500
          fillOpacity: 0.55,
          smoothFactor: 1.2
        };
      case 'non_compliant':
        return {
          color: '#b91c1c',       // Red 700
          weight: 2,
          fillColor: '#ef4444',   // Red 500
          fillOpacity: 0.65,
          smoothFactor: 1.2
        };
      case 'pending':
      default:
        return {
          color: '#2563eb',       // Blue 600
          weight: 1.5,
          fillColor: '#3b82f6',   // Blue 500
          fillOpacity: 0.25,
          smoothFactor: 1.5
        };
    }
  }

  function updatePlotVisualStatus(plotId) {
    const layer = plotLayersById.get(plotId);
    if (layer && layer.feature && layer.feature.properties) {
      layer.setStyle(getPlotStyle(layer.feature.properties));
    }
    updateInspectionProgressCounts();
  }

  function refreshAllPlotStyles() {
    plotLayersById.forEach((layer) => {
      if (layer && layer.feature && layer.feature.properties) {
        const p = layer.feature.properties;
        layer.setStyle(getPlotStyle(p));
        // Tooltips on hover: completely removed for general users, only available when clicking on the plot.
        if (currentUser) {
          const status = getPlotInspectionStatus(p);
          let statusBadge = '<span style="color: #60a5fa;">🔵 Pending Inspection</span>';
          if (status === 'completed') statusBadge = '<span style="color: #34d399; font-weight: bold;">🟢 Completed (Inspected)</span>';
          else if (status === 'in_progress') statusBadge = '<span style="color: #fbbf24; font-weight: bold;">🟡 In Progress</span>';
          else if (status === 'non_compliant') statusBadge = '<span style="color: #f87171; font-weight: bold;">🔴 Non-Compliant</span>';

          layer.bindTooltip(
            `<b>${p.family_id}</b> · Plot ${p.plot_id}<br><small>${p.village}</small><br>${statusBadge}`,
            { className: 'plot-label-tooltip', direction: 'top', sticky: true }
          );
        } else if (layer.unbindTooltip) {
          layer.unbindTooltip();
        }
      }
    });
    updateInspectionProgressCounts();
  }

  function updateInspectionProgressCounts() {
    let completed = 0;
    let inProgress = 0;
    let pending = 0;

    if (searchIndex && searchIndex.length > 0) {
      for (let i = 0; i < searchIndex.length; i++) {
        const status = getPlotInspectionStatus(searchIndex[i]);
        if (status === 'completed') completed++;
        else if (status === 'in_progress') inProgress++;
        else pending++;
      }
    }

    const elComp = document.getElementById('count-completed');
    const elProg = document.getElementById('count-inprogress');
    const elPend = document.getElementById('count-pending');
    const elSeasonBadge = document.getElementById('legend-season-badge');

    if (elComp) elComp.textContent = completed.toLocaleString();
    if (elProg) elProg.textContent = inProgress.toLocaleString();
    if (elPend) elPend.textContent = pending.toLocaleString();
    if (elSeasonBadge) elSeasonBadge.textContent = currentSeason;

    // Update Inspector Sidebar KPIs
    const sideComp = document.getElementById('sidebar-kpi-completed');
    const sideProg = document.getElementById('sidebar-kpi-inprogress');
    const sidePend = document.getElementById('sidebar-kpi-pending');
    const sideSeason = document.getElementById('sidebar-kpi-season');

    if (sideComp) sideComp.textContent = completed.toLocaleString();
    if (sideProg) sideProg.textContent = inProgress.toLocaleString();
    if (sidePend) sidePend.textContent = pending.toLocaleString();
    if (sideSeason) sideSeason.textContent = currentSeason;
  }

  // --- Inspector Territory Scoping & Filtering ---
  function isFeatureInTerritory(props, assignedLands, assignedVills) {
    if (!props) return false;
    const site = (props.site || props.landscape || '').trim().toLowerCase();
    const village = (props.village || '').trim().toLowerCase();

    // 1. If assigned specific villages:
    if (assignedVills && assignedVills.length > 0) {
      const matchVill = assignedVills.some(v => {
        if (typeof v === 'string') return v.trim().toLowerCase() === village;
        return v == props.village_id || v == props.villageId;
      });
      if (matchVill) return true;
    }

    // 2. If assigned landscapes:
    if (assignedLands && assignedLands.length > 0) {
      const matchLand = assignedLands.some(l => l.trim().toLowerCase() === site);
      if (matchLand) {
        // If no specific villages were restricted for this user, whole landscape matches!
        if (!assignedVills || assignedVills.length === 0) {
          return true;
        }
      }
    }

    return false;
  }

  function applyUserTerritoryFilter(isInitial = false) {
    if (!masterFeatures || masterFeatures.length === 0) return;

    const territoryBanner = document.getElementById('sidebar-territory-banner');
    const territoryName = document.getElementById('sidebar-territory-name');
    const territoryCount = document.getElementById('sidebar-territory-count');

    const isInspector = currentUser && (currentUser.role === 'inspector' || currentUser.role === 'supervisor');
    const hasTerritory = isInspector && (
      (currentUser.assigned_landscapes && currentUser.assigned_landscapes.length > 0) ||
      (currentUser.assigned_villages && currentUser.assigned_villages.length > 0)
    );

    if (hasTerritory) {
      const lands = currentUser.assigned_landscapes || [];
      const vills = currentUser.assigned_villages || [];

      allFeatures = masterFeatures.filter(f => isFeatureInTerritory(f.properties, lands, vills));
      searchIndex = masterSearchIndex.filter(p => isFeatureInTerritory(p, lands, vills));

      const territoryLabel = lands.join(', ') + (vills.length ? ` (${vills.length} villages)` : '');
      if (territoryName) territoryName.textContent = territoryLabel || 'Assigned Zone';
      if (territoryCount) territoryCount.textContent = `${allFeatures.length.toLocaleString()} Plots`;
      if (territoryBanner) territoryBanner.style.display = 'block';

      renderGeoJsonLayer({ type: 'FeatureCollection', features: allFeatures });
      populateSiteFilter();
      updateInspectionProgressCounts();

      if (geojsonLayer && allFeatures.length > 0 && map) {
        try {
          const b = geojsonLayer.getBounds();
          if (b && b.isValid()) {
            map.fitBounds(b, { padding: [30, 30], maxZoom: 15 });
          }
        } catch (e) {}
      }
      showToast(`📍 Scoped to assigned territory: ${allFeatures.length} plots`);
    } else {
      // Nationwide (Public or Admin)
      allFeatures = masterFeatures;
      searchIndex = masterSearchIndex;

      if (territoryName) territoryName.textContent = 'Nationwide (All Landscapes)';
      if (territoryCount) territoryCount.textContent = `${allFeatures.length.toLocaleString()} Plots`;
      if (territoryBanner) territoryBanner.style.display = currentUser ? 'block' : 'none';

      renderGeoJsonLayer({ type: 'FeatureCollection', features: allFeatures });
      populateSiteFilter();
      updateInspectionProgressCounts();

      if (!isInitial && map && plotsGeojson) {
        try {
          if (btnFitPlots) btnFitPlots.click();
        } catch (e) {}
      }
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
        style: (feature) => getPlotStyle(feature ? feature.properties : null),
        onEachFeature: (feature, layer) => {
          const p = feature.properties;
          if (p && p.id !== undefined) {
            plotLayersById.set(p.id, layer);
            renderedIds.add(p.id);
            if (selectedPlot && isSelectedPlot(p)) {
              selectedLayer = layer;
              setTimeout(() => {
                try { layer.bringToFront(); } catch(e) {}
              }, 10);
            }
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
              selectPlot(fullPlot, true);
            }
          });

          // Tooltip on hover: completely removed for general users (only shown upon clicking/searching the plot).
          // Logged-in inspectors/staff will see inspection status tooltip on hover.
          if (p && currentUser) {
            const status = getPlotInspectionStatus(p);
            let statusBadge = '<span style="color: #60a5fa;">🔵 Pending Inspection</span>';
            if (status === 'completed') statusBadge = '<span style="color: #34d399; font-weight: bold;">🟢 Completed (Inspected)</span>';
            else if (status === 'in_progress') statusBadge = '<span style="color: #fbbf24; font-weight: bold;">🟡 In Progress</span>';
            else if (status === 'non_compliant') statusBadge = '<span style="color: #f87171; font-weight: bold;">🔴 Non-Compliant</span>';

            layer.bindTooltip(
              `<b>${p.family_id}</b> · Plot ${p.plot_id}<br><small>${p.village}</small><br>${statusBadge}`,
              { className: 'plot-label-tooltip', direction: 'top', sticky: true }
            );
          }
        }
      }).addTo(map);

      updateInspectionProgressCounts();
      console.log(`[Render] Rendered ${geojson.features.length} plots on map for Season ${currentSeason}`);
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
      if (selectedPlot && f.properties && isSelectedPlot(f.properties)) return true;
      const bbox = f.properties && f.properties.bbox;
      if (!bbox) return true; // Include if no bbox
      // bbox stored as [minLat, minLng, maxLat, maxLng]
      const [minLat, minLng, maxLat, maxLng] = bbox;
      return bounds.intersects([[minLat, minLng], [maxLat, maxLng]]);
    });

    const newGeojson = { type: 'FeatureCollection', features: visibleFeatures };
    renderGeoJsonLayer(newGeojson);
  }

  // --- Interactive Plot Map Popup (Staff / Field Inspector Only) ---
  function openPlotMapPopup(plotProps, layer, latlng) {
    if (!currentUser) return; // General public users do not have access to drawing/editing subplots

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
      </div>
    `;

    const popup = L.popup({
      offset: [0, -10],
      className: 'ibis-plot-popup'
    })
      .setLatLng(latlng || [plotProps.lat, plotProps.lng])
      .setContent(popupHtml)
      .openOn(map);
  }

  // Expose for inline popup button
  window.ibisStartSubplotDrawing = function (plotId) {
    if (!currentUser) {
      showToast('Inspector login required to sketch subplots');
      return;
    }
    map.closePopup();
    let plot = searchIndex.find((p) => p.id === plotId);
    if (!plot && selectedPlot && selectedPlot.id === plotId) plot = selectedPlot;
    if (plot) startSubplotDrawing(plot);
  };

  // --- Plot Selection & Drawer Display ---
  function selectPlot(plotProps, shouldFly = true) {
    if (!plotProps) return;
    selectedPlot = plotProps;
    if (map) map.closePopup();

    // 1. Immediately open plot drawer
    if (plotDrawer) plotDrawer.classList.remove('closed');
    if (drawerEmptyState) drawerEmptyState.style.display = 'none';
    if (drawerPlotInfo) drawerPlotInfo.style.display = 'flex';

    // 2. Safe coordinate & metadata strings
    const latVal = (plotProps.lat !== undefined && plotProps.lat !== null) ? Number(plotProps.lat) : null;
    const lngVal = (plotProps.lng !== undefined && plotProps.lng !== null) ? Number(plotProps.lng) : null;
    const coordsStr = (latVal !== null && lngVal !== null && !isNaN(latVal) && !isNaN(lngVal))
      ? `${latVal.toFixed(5)}, ${lngVal.toFixed(5)}`
      : 'N/A';

    if (cardSite) cardSite.textContent = `${plotProps.site || ''} · ${plotProps.commune || 'Cambodia'}`;
    if (cardFamily) cardFamily.textContent = plotProps.family_id || '';
    if (cardPlot) cardPlot.textContent = plotProps.plot_id || '';
    if (cardArea) cardArea.textContent = plotProps.area_ha ? Number(plotProps.area_ha).toFixed(2) : '0.00';
    if (cardVillage) cardVillage.textContent = plotProps.village || '';
    if (cardCommune) cardCommune.textContent = plotProps.commune || 'N/A';
    if (cardYear) cardYear.textContent = plotProps.year_join || 'N/A';
    if (cardCoords) cardCoords.textContent = coordsStr;

    // 3. General Public vs Inspector Card & Form Visibility
    const traceOriginCard = document.getElementById('traceability-origin-card');
    const drawerTabBar = document.getElementById('drawer-tab-bar');
    const drawerScrollBody = document.getElementById('drawer-scrollable-body');

    if (currentUser) {
      // Inspector Mode: Show 5-Stage Form and tabs
      if (traceOriginCard) traceOriginCard.style.display = 'none';
      if (drawerTabBar) drawerTabBar.style.display = 'flex';
      if (drawerScrollBody) drawerScrollBody.style.display = 'block';

      loadICSInspectionForSelectedPlot();
      switchDrawerTab(activeDrawerTab || 'tab-farmer');
    } else {
      // General Public Mode: Show Traceability Origin Info card
      if (traceOriginCard) traceOriginCard.style.display = 'block';
      if (drawerTabBar) drawerTabBar.style.display = 'none';
      if (drawerScrollBody) drawerScrollBody.style.display = 'none';
    }
    const traceVillage = document.getElementById('trace-village-name');
    const traceLandscape = document.getElementById('trace-landscape-name');
    const traceCoords = document.getElementById('trace-coords');
    const traceStatusBadge = document.getElementById('traceability-status-badge');

    if (traceVillage) traceVillage.textContent = plotProps.village || 'Community Conservation';
    if (traceLandscape) traceLandscape.textContent = `${plotProps.site || ''} Wildlife Sanctuary`;
    if (traceCoords) traceCoords.textContent = coordsStr;

    const currentPlotStatus = getPlotInspectionStatus(plotProps, currentSeason);
    if (traceStatusBadge) {
      traceStatusBadge.style.display = currentUser ? 'inline-block' : 'none';
      if (currentPlotStatus === 'completed') {
        traceStatusBadge.className = 'origin-status-pill status-pill-completed staff-only';
        traceStatusBadge.textContent = `🟢 Verified Compliant (${currentSeason})`;
      } else {
        traceStatusBadge.className = 'origin-status-pill status-pill-pending staff-only';
        traceStatusBadge.textContent = `🔴 Pending Field Inspection (${currentSeason})`;
      }
    }

    // Populate Production, Harvest & Commercial Traceability metrics
    const tracePlotSize = document.getElementById('trace-plot-size');
    const traceExpectedProd = document.getElementById('trace-expected-prod');
    const traceExpectedRate = document.getElementById('trace-expected-rate');
    const traceExpectedSales = document.getElementById('trace-expected-sales');
    const traceSoldVolume = document.getElementById('trace-sold-volume');
    const traceVarietyBreakdown = document.getElementById('trace-variety-breakdown');

    const areaHa = Number(plotProps.area_ha) || 0;
    const estYieldKg = Math.round(areaHa * 1500);
    const estSalesKg = Math.round(estYieldKg * 0.8);

    if (tracePlotSize) tracePlotSize.textContent = `${areaHa.toFixed(2)} ha`;
    if (traceExpectedProd) traceExpectedProd.textContent = `${estYieldKg.toLocaleString('en-US')} kg`;
    if (traceExpectedRate) traceExpectedRate.textContent = `Est. 1.5 MT/ha`;
    if (traceExpectedSales) traceExpectedSales.textContent = `${estSalesKg.toLocaleString('en-US')} kg`;

    // Fetch actual sales by variety from backend summary endpoint if available
    fetch(`/api/v1/traceability/plot/${encodeURIComponent(plotProps.id)}/summary`)
      .then(res => res.ok ? res.json() : null)
      .then(summaryData => {
        if (summaryData) {
          if (traceSoldVolume) traceSoldVolume.textContent = `${(summaryData.total_actual_sold_kg || 0).toLocaleString('en-US')} kg`;
          if (traceVarietyBreakdown) {
            if (summaryData.actual_sales_by_variety && summaryData.actual_sales_by_variety.length > 0) {
              traceVarietyBreakdown.innerHTML = summaryData.actual_sales_by_variety.map(v => 
                `<span class="variety-item-pill" style="display: inline-block; background: rgba(16, 185, 129, 0.2); border: 1px solid rgba(16, 185, 129, 0.4); color: #6ee7b7; padding: 2px 8px; border-radius: 12px; font-size: 0.78rem; margin-right: 4px; margin-top: 4px;">🌾 ${v.variety_name}: ${v.total_kg.toLocaleString('en-US')} kg</span>`
              ).join('');
            } else {
              traceVarietyBreakdown.innerHTML = `<span class="variety-item-pill" style="display: inline-block; opacity: 0.7; font-size: 0.78rem; color: #94a3b8;">Phka Rumduol: 0 kg (Pending Harvest Delivery)</span>`;
            }
          }
        }
      })
      .catch(() => {
        if (traceSoldVolume) traceSoldVolume.textContent = `0 kg`;
        if (traceVarietyBreakdown) {
          traceVarietyBreakdown.innerHTML = `<span class="variety-item-pill" style="display: inline-block; opacity: 0.7; font-size: 0.78rem; color: #94a3b8;">Phka Rumduol: 0 kg</span>`;
        }
      });

    // Render subplots for selected plot
    renderSubplotsListForSelectedPlot();
    renderAllStoredSubplotsOnMap();

    // Auto-minimize hero discovery card when opening a plot (public)
    const heroCard = document.getElementById('hero-discovery-card');
    if (heroCard) heroCard.classList.add('minimized');

    // Update Inspector Sidebar Selected Plot quick dock
    const sidebarSelectedPlotBox = document.getElementById('sidebar-selected-plot-box');
    const sidebarSelFamily = document.getElementById('sidebar-sel-family');
    const sidebarSelArea = document.getElementById('sidebar-sel-area');
    const sidebarSelMeta = document.getElementById('sidebar-sel-meta');

    if (sidebarSelectedPlotBox) sidebarSelectedPlotBox.style.display = 'block';
    if (sidebarSelFamily) sidebarSelFamily.textContent = `Family ${plotProps.family_id || ''}`;
    if (sidebarSelArea) sidebarSelArea.textContent = `${plotProps.area_ha ? Number(plotProps.area_ha).toFixed(2) : '0.00'} ha`;
    if (sidebarSelMeta) sidebarSelMeta.textContent = `Plot ${plotProps.plot_id || ''} · ${plotProps.village || ''}, ${plotProps.site || ''}`;

    // 5. Update map layer styles to persistent selection highlight
    refreshAllPlotStyles();

    const existingLayer = plotLayersById.get(plotProps.id);
    if (existingLayer) {
      selectedLayer = existingLayer;
      try { existingLayer.bringToFront(); } catch(e) {}
    }

    // 6. Fly to plot on map
    if (shouldFly && map) {
      const paddingOptions = window.innerWidth >= 768
        ? { paddingTopLeft: [480, 50], paddingBottomRight: [50, 50] }
        : { paddingTopLeft: [20, 20], paddingBottomRight: [20, 20] };

      if (existingLayer && existingLayer.getBounds && typeof existingLayer.getBounds === 'function') {
        try {
          map.flyToBounds(existingLayer.getBounds(), {
            maxZoom: 18,
            duration: 1.1,
            ...paddingOptions
          });
        } catch(err) {}
      } else if (latVal !== null && lngVal !== null && !isNaN(latVal) && !isNaN(lngVal)) {
        try {
          map.flyTo([latVal, lngVal], 18, { duration: 1.1 });
        } catch(err) {}
      }
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
            <span class="sp-variety">${escapeHtml(sp.variety === 'Local Variety' && sp.local_variety_name ? sp.local_variety_name : sp.variety)}</span>
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
        `<b>${escapeHtml(sp.code)}</b> · ${escapeHtml(sp.variety === 'Local Variety' && sp.local_variety_name ? `Local: ${sp.local_variety_name}` : sp.variety)}<br>${sp.area_ha} ha (${sp.pct_of_parent || 0}%)<br>${escapeHtml(sp.notes || '')}`,
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

  function getNextSubplotName(parentPlotId) {
    if (!parentPlotId) return 'A';
    const plotSubplots = subplots.filter((s) => s.parent_plot_id === parentPlotId);
    const existingNames = new Set(
      plotSubplots.map((s) => (s.code || '').trim().toUpperCase())
    );
    // 1st tier: A, B, C... Z
    for (let i = 0; i < 26; i++) {
      const letter = String.fromCharCode(65 + i);
      if (!existingNames.has(letter)) {
        return letter;
      }
    }
    // 2nd tier: AA, AB...
    for (let i = 0; i < 26; i++) {
      for (let j = 0; j < 26; j++) {
        const combo = String.fromCharCode(65 + i) + String.fromCharCode(65 + j);
        if (!existingNames.has(combo)) {
          return combo;
        }
      }
    }
    return `Subplot ${plotSubplots.length + 1}`;
  }

  function updateSubplotFormConditionalFields() {
    const variety = subplotVariety ? subplotVariety.value : 'Phka Rumduol';
    const customGroup = document.getElementById('custom-variety-group');
    const extWrapper = document.getElementById('sp-extended-wrapper');

    if (variety === 'Other' || variety === 'Fallow') {
      // Keep only: % of Main Plot, Subplot Area (Hectares), Subplot Name, Rice Variety selector
      if (customGroup) customGroup.style.display = 'none';
      if (extWrapper) extWrapper.style.display = 'none';
    } else if (variety === 'Local Variety') {
      // Keep all existing fields + Exact Local Variety Name text field
      if (customGroup) customGroup.style.display = 'block';
      if (extWrapper) extWrapper.style.display = 'block';
    } else {
      // Phka Rumduol, Red Jasmine, Sticky Rice
      if (customGroup) customGroup.style.display = 'none';
      if (extWrapper) extWrapper.style.display = 'block';
    }
  }

  function resetSubplotModalForm() {
    editingSubplotInstance = null;
    if (subplotCode) {
      subplotCode.value = '';
      subplotCode.placeholder = 'e.g. A';
    }
    if (subplotVariety) {
      subplotVariety.value = 'Phka Rumduol';
    }
    if (subplotCustomVariety) {
      subplotCustomVariety.value = '';
    }
    if (subplotAreaPct) {
      subplotAreaPct.value = '';
    }
    if (subplotAreaHa) {
      subplotAreaHa.value = '';
    }

    setVal('sp-seed-source', '');
    setVal('sp-seed-kg', '');
    setVal('sp-planting-date', '');
    setVal('sp-planting-method', '');
    setVal('sp-fertilizer-toggle', 'no');
    setChipValues('#sp-fertilizer-chips', []);
    setVal('sp-fertilizer-qty', '');
    setVal('sp-fertilizer-date', '');
    setVal('sp-protection-toggle', 'no');
    setVal('sp-protection-action', '');
    setVal('sp-protection-qty', '');
    setVal('sp-protection-date', '');
    setVal('sp-expected-yield', '');
    setVal('sp-expected-sale', '');

    const spFertBlock = document.getElementById('sp-fertilizer-block');
    if (spFertBlock) spFertBlock.style.display = 'none';
    const spProtBlock = document.getElementById('sp-protection-block');
    if (spProtBlock) spProtBlock.style.display = 'none';

    updateSubplotFormConditionalFields();
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

    // Wipe any existing modal fields completely so new subplot starts 100% blank!
    resetSubplotModalForm();
    editingSubplotInstance = null;

    modalPlotRef.textContent = `Family ${drawingMainPlot.family_id} · Plot ${drawingMainPlot.plot_id} (${drawingMainPlot.village})`;

    const spStatusPill = document.getElementById('subplot-modal-status-pill');
    if (spStatusPill) {
      spStatusPill.className = 'sub-status-pill status-blank';
      spStatusPill.textContent = '⚪ New Subplot (Blank)';
    }

    // Banner stats
    if (allocMainHa) allocMainHa.textContent = `${parentHa.toFixed(2)} ha`;
    if (allocRemainingPct) allocRemainingPct.textContent = `${remainingPct}%`;
    if (allocRemainingHa) allocRemainingHa.textContent = `${remainingHa.toFixed(2)} ha`;
    if (allocMeterUsed) allocMeterUsed.style.width = `${Math.min(100, usedPct)}%`;

    // Default to full remaining allocation so it naturally sums to 100%
    subplotAreaPct.value = remainingPct;
    subplotAreaHa.value = remainingHa;

    // Auto-generate subplot name starting from A, B, C, D... based on inspector click to add plots
    const autoName = getNextSubplotName(drawingMainPlot.id);
    subplotCode.value = autoName;
    subplotCode.placeholder = autoName;
    subplotVariety.value = '';
    if (subplotCustomVariety) subplotCustomVariety.value = '';

    updateSubplotFormConditionalFields();
    validateSubplotAllocation();

    subplotModal.style.display = 'flex';
    setTimeout(() => {
      if (subplotCode) {
        subplotCode.focus();
        subplotCode.select();
      }
    }, 80);
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
        drawingPointsCount.textContent = `✓ 100% allocated (${plotSubplots.length} subplot${plotSubplots.length !== 1 ? 's' : ''}) · Tap "Done" to save.`;
      } else {
        drawingPointsCount.textContent = `Allocated: ${totalAllocatedPct}% (${roundTo(100 - totalAllocatedPct, 1)}% unallocated) · Tap section to label.`;
      }
    } else {
      if (lines.length === 0) {
        drawingPointsCount.textContent = 'Freely draw a line across the plot to divide subplots';
      } else {
        drawingPointsCount.textContent = `${lines.length} separation line${lines.length > 1 ? 's' : ''} · ${plotSubplots.length} labeled (${totalAllocatedPct}%) · Tap "+ Add Subplot" or Done.`;
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

    const currentPlot = drawingMainPlot || selectedPlot;
    const autoCodeFallback = getNextSubplotName(currentPlot ? currentPlot.id : null);
    const code = subplotCode.value.trim() || autoCodeFallback;
    const varietyVal = subplotVariety.value;
    let variety = varietyVal;
    let localVarietyName = '';

    if (varietyVal === 'Local Variety') {
      localVarietyName = subplotCustomVariety ? subplotCustomVariety.value.trim() : '';
    }

    const isFallowOrOther = (varietyVal === 'Other' || varietyVal === 'Fallow');
    const parentHa = (currentPlot && currentPlot.area_ha) ? currentPlot.area_ha : 1;

    const pct = parseFloat(subplotAreaPct.value) || 0;
    const areaHa = parseFloat(subplotAreaHa.value) || roundTo((pct / 100) * parentHa, 2);

    if (pct <= 0) {
      alert('⚠️ Please enter a percentage greater than 0%.');
      return;
    }

    // Extended ICS 2026 fields (omitted for Other / Fallow)
    const seedSource = isFallowOrOther ? '' : (document.getElementById('sp-seed-source') ? document.getElementById('sp-seed-source').value : 'Own saved');
    const seedKg = isFallowOrOther ? 0 : (parseFloat(document.getElementById('sp-seed-kg')?.value) || 0);
    const plantingDate = isFallowOrOther ? '' : (document.getElementById('sp-planting-date')?.value || '');
    const plantingMethod = isFallowOrOther ? (varietyVal === 'Fallow' ? 'Fallow' : '') : (document.getElementById('sp-planting-method')?.value || 'Direct seeding');
    const fertApplied = isFallowOrOther ? false : (document.getElementById('sp-fertilizer-toggle')?.value === 'yes');
    const fertTypes = isFallowOrOther ? [] : getChipValues('#sp-fertilizer-chips');
    const fertQty = isFallowOrOther ? 0 : (parseFloat(document.getElementById('sp-fertilizer-qty')?.value) || 0);
    const fertDate = isFallowOrOther ? '' : (document.getElementById('sp-fertilizer-date')?.value || '');
    const protApplied = isFallowOrOther ? false : (document.getElementById('sp-protection-toggle')?.value === 'yes');
    const protAction = isFallowOrOther ? '' : (document.getElementById('sp-protection-action')?.value.trim() || '');
    const protQty = isFallowOrOther ? 0 : (parseFloat(document.getElementById('sp-protection-qty')?.value) || 0);
    const protDate = isFallowOrOther ? '' : (document.getElementById('sp-protection-date')?.value || '');
    const expYield = isFallowOrOther ? 0 : (parseFloat(document.getElementById('sp-expected-yield')?.value) || 0);
    const expSale = isFallowOrOther ? 0 : (parseFloat(document.getElementById('sp-expected-sale')?.value) || 0);

    // Case 1: Updating an existing subplot (from drawer "Inspect" action)
    if (editingSubplotInstance) {
      editingSubplotInstance.code = code;
      editingSubplotInstance.variety = variety;
      editingSubplotInstance.local_variety_name = localVarietyName;
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
      editingSubplotInstance.saved = true;
      editingSubplotInstance.updated_at = new Date().toISOString();

      saveStoredSubplots();
      renderAllStoredSubplotsOnMap();
      renderSubplotsListForSelectedPlot();
      subplotModal.style.display = 'none';
      editingSubplotInstance = null;
      resetSubplotModalForm();
      showToast(`Saved: Subplot ${code} (${localVarietyName ? `${variety}: ${localVarietyName}` : variety})`);
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
      saved: true,
      parent_plot_id: drawingMainPlot.id,
      parent_family_id: drawingMainPlot.family_id,
      parent_plot_num: drawingMainPlot.plot_id,
      parent_village: drawingMainPlot.village,
      parent_site: drawingMainPlot.site,
      parent_area_ha: drawingMainPlot.area_ha,
      code: code,
      variety: variety,
      local_variety_name: localVarietyName,
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
    resetSubplotModalForm();
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
          No subplots sketched yet. Tap <b>"+ Draw Subplot"</b> above to start dividing this parcel on the map.
        </div>
      `;
      updateParcelHarvestSummary();
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
        <div class="subplot-card-content-inline">
          <span class="subplot-card-code">${escapeHtml(sp.code)}</span>
          <span class="variety-tag ${style.class}">${escapeHtml(sp.variety === 'Local Variety' && sp.local_variety_name ? `Local: ${sp.local_variety_name}` : sp.variety)}</span>
          <span class="subplot-area-pill"><b>${sp.area_ha} ha</b> (${sp.pct_of_parent || 0}%)</span>
          ${badges}
        </div>
        <div class="subplot-card-actions">
          <button class="sp-inspect-btn" title="Record subplot inspection details" data-sp-id="${escapeHtml(sp.id)}">Details</button>
          <button class="sp-harvest-btn" title="Record harvest for this subplot" data-sp-id="${escapeHtml(sp.id)}">🌾 Harvest</button>
          <button class="subplot-action-btn delete-btn" title="Delete this subplot" aria-label="Delete subplot">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
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
        openSubplotHarvestModal(sp);
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
    updateParcelHarvestSummary();
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

  let searchDebounceTimer = null;

  // --- Event Bindings ---
  function bindEvents() {
    // Quick Search Input with 120ms debounce for rapid typing
    quickSearchInput.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(handleQuickSearch, 120);
    });
    quickSearchInput.addEventListener('focus', () => {
      if (quickSearchInput.value.trim().length > 0) {
        searchSuggestions.style.display = 'block';
      }
    });

    quickSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const firstItem = searchSuggestions.querySelector('.suggestion-item:not([style*="cursor: default"])');
        if (firstItem) {
          e.preventDefault();
          firstItem.click();
        }
      } else if (e.key === 'Escape') {
        searchSuggestions.style.display = 'none';
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
    if (btnToggleFilters) {
      btnToggleFilters.addEventListener('click', () => {
        populateSiteFilter();
        const isClosed = filterPanel.classList.toggle('closed');
        btnToggleFilters.classList.toggle('active', !isClosed);
      });
    }

    if (btnCloseFilterPanel) {
      btnCloseFilterPanel.addEventListener('click', () => {
        filterPanel.classList.add('closed');
        if (btnToggleFilters) btnToggleFilters.classList.remove('active');
      });
    }

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
      const isClosed = plotDrawer.classList.toggle('closed');
      if (isClosed) {
        selectedPlot = null;
        if (selectedLayer) selectedLayer = null;
        refreshAllPlotStyles();
      } else if (selectedPlot) {
        refreshAllPlotStyles();
      }
    });
    if (btnClosePlotDrawer) {
      btnClosePlotDrawer.addEventListener('click', (e) => {
        e.stopPropagation();
        plotDrawer.classList.add('closed');
        selectedPlot = null;
        if (selectedLayer) selectedLayer = null;
        refreshAllPlotStyles();
      });
    }

    // Subplot Drawing & Separation Controls
    if (btnStartDrawing) {
      btnStartDrawing.addEventListener('click', () => startSubplotDrawing(selectedPlot));
    }
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
      resetSubplotModalForm();
    });
    btnCancelModal.addEventListener('click', () => {
      subplotModal.style.display = 'none';
      resetSubplotModalForm();
    });

    // Subplot Harvest Modal Form
    if (subplotHarvestForm) subplotHarvestForm.addEventListener('submit', onSubplotHarvestSubmit);
    if (btnCloseHarvestModal) {
      btnCloseHarvestModal.addEventListener('click', () => {
        subplotHarvestModal.style.display = 'none';
        resetSubplotHarvestModalForm();
      });
    }
    if (btnCancelHarvestModal) {
      btnCancelHarvestModal.addEventListener('click', () => {
        subplotHarvestModal.style.display = 'none';
        resetSubplotHarvestModalForm();
      });
    }

    // Prevent accidental number changes on mouse wheel scroll
    document.addEventListener('wheel', () => {
      if (document.activeElement && document.activeElement.type === 'number') {
        document.activeElement.blur();
      }
    }, { passive: true });

    // Two-way triggers for subplot harvest form
    ['sh-actual-kg', 'sh-sale-kg', 'sh-consume-kg', 'sh-seed-kg'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', updateSubplotHarvestBalance);
    });

    const selShComplete = document.getElementById('sh-complete');
    if (selShComplete) {
      selShComplete.addEventListener('change', () => {
        const isDone = selShComplete.value === '1';
        const blkInc = document.getElementById('sh-incomplete-block');
        const blkComp = document.getElementById('sh-complete-block');
        if (blkInc) blkInc.style.display = isDone ? 'none' : 'block';
        if (blkComp) blkComp.style.display = isDone ? 'block' : 'none';
      });
    }

    const selShMethod = document.getElementById('sh-method');
    if (selShMethod) {
      selShMethod.addEventListener('change', () => {
        const isMachine = selShMethod.value === '2' || selShMethod.value === '3';
        const blkMachine = document.getElementById('sh-machine-block');
        if (blkMachine) blkMachine.style.display = isMachine ? 'flex' : 'none';
      });
    }

    const selShPay = document.getElementById('sh-payment-type');
    const lblShPay = document.getElementById('sh-payment-label');
    if (selShPay && lblShPay) {
      selShPay.addEventListener('change', () => {
        lblShPay.textContent = selShPay.value === '2' ? 'Payment Amount in Paddy (kg)' : 'Payment Amount in Riel (KHR)';
      });
    }

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
      updateSubplotFormConditionalFields();
      if (subplotVariety.value === 'Local Variety' && subplotCustomVariety) {
        subplotCustomVariety.focus();
      }
    });

    // ICS 2026 Single Excel Report Button (1 export per farmer)
    const btnExportIcsCsv = document.getElementById('btn-export-ics-csv');
    if (btnExportIcsCsv) btnExportIcsCsv.addEventListener('click', exportICSCsv);

    const btnExportAll = document.getElementById('btn-export-all');
    if (btnExportAll) {
      btnExportAll.addEventListener('click', () => {
        if (!currentUser) {
          showToast('Staff sign in required to export internal data');
          return;
        }
        if (selectedPlot) {
          plotDrawer.classList.remove('closed');
          switchDrawerTab('tab-confirm');
        } else {
          exportICSCsv();
        }
      });
    }

    // Active Inspection Season Selector
    const seasonSelector = document.getElementById('season-selector');
    if (seasonSelector) {
      seasonSelector.addEventListener('change', (e) => {
        switchSeason(e.target.value);
      });
    }

    // --- Inspector Collapsible Sidebar Events ---
    const inspectorSidebar = document.getElementById('inspector-sidebar');
    const btnCollapseInspectorSidebar = document.getElementById('btn-collapse-inspector-sidebar');
    const btnFloatingInspectorMenu = document.getElementById('btn-floating-inspector-menu');
    const sidebarSeasonSelect = document.getElementById('sidebar-season-select');
    const btnSidebarMyLocation = document.getElementById('btn-sidebar-my-location');
    const btnSidebarExport = document.getElementById('btn-sidebar-export');
    const btnSidebarFilter = document.getElementById('btn-sidebar-filter');
    const btnSidebarGis = document.getElementById('btn-sidebar-gis');
    const btnSidebarSignout = document.getElementById('btn-sidebar-signout');
    const btnSidebarViewForm = document.getElementById('btn-sidebar-view-form');
    const btnSidebarSketchSubplot = document.getElementById('btn-sidebar-sketch-subplot');

    if (btnCollapseInspectorSidebar) {
      btnCollapseInspectorSidebar.addEventListener('click', () => {
        if (inspectorSidebar) inspectorSidebar.classList.add('collapsed');
        if (btnFloatingInspectorMenu) btnFloatingInspectorMenu.style.display = 'flex';
        setTimeout(() => map && map.invalidateSize(), 350);
      });
    }

    if (btnFloatingInspectorMenu) {
      btnFloatingInspectorMenu.addEventListener('click', () => {
        if (inspectorSidebar) inspectorSidebar.classList.remove('collapsed');
        btnFloatingInspectorMenu.style.display = 'none';
        setTimeout(() => map && map.invalidateSize(), 350);
      });
    }

    if (sidebarSeasonSelect) {
      sidebarSeasonSelect.addEventListener('change', (e) => {
        switchSeason(e.target.value);
      });
    }

    if (btnSidebarMyLocation) {
      btnSidebarMyLocation.addEventListener('click', centerOnUserLocation);
    }

    if (btnSidebarExport) {
      btnSidebarExport.addEventListener('click', () => {
        exportICSCsv();
      });
    }

    if (btnSidebarFilter) {
      btnSidebarFilter.addEventListener('click', () => {
        populateSiteFilter();
        const isClosed = filterPanel.classList.toggle('closed');
        if (btnToggleFilters) btnToggleFilters.classList.toggle('active', !isClosed);
      });
    }

    if (btnSidebarGis) {
      btnSidebarGis.addEventListener('click', openGisModal);
    }

    if (btnSidebarSignout) {
      btnSidebarSignout.addEventListener('click', () => {
        setAuthUser(null);
        showToast('Signed out of field inspector session');
      });
    }

    if (btnSidebarViewForm) {
      btnSidebarViewForm.addEventListener('click', () => {
        if (selectedPlot) {
          plotDrawer.classList.remove('closed');
          switchDrawerTab('tab-farmer');
        } else {
          showToast('Select a plot on the map to open inspection form');
        }
      });
    }

    if (btnSidebarSketchSubplot) {
      btnSidebarSketchSubplot.addEventListener('click', () => {
        if (selectedPlot) {
          startSubplotDrawing(selectedPlot);
        } else {
          showToast('Select a plot first to sketch subplots');
        }
      });
    }

    // Initialize sidebar search
    setupSidebarSearch();
  }

  function switchSeason(newSeason) {
    currentSeason = newSeason;
    const seasonSelector = document.getElementById('season-selector');
    if (seasonSelector) seasonSelector.value = currentSeason;
    const sidebarSeasonSelect = document.getElementById('sidebar-season-select');
    if (sidebarSeasonSelect) sidebarSeasonSelect.value = currentSeason;
    const badge = document.getElementById('legend-season-badge');
    if (badge) badge.textContent = currentSeason;
    const sidebarSeasonInd = document.getElementById('sidebar-kpi-season');
    if (sidebarSeasonInd) sidebarSeasonInd.textContent = currentSeason;
    showToast(`Switched active inspection season to ${currentSeason}`);
    refreshAllPlotStyles();
  }

  // --- Quick Search Autocomplete (5 Dimensions: Site, Village, Family ID, Farmer, Plot Code) ---
  function handleQuickSearch() {
    const rawQuery = quickSearchInput.value.trim();
    if (!rawQuery) {
      btnClearSearch.style.display = 'none';
      searchSuggestions.style.display = 'none';
      return;
    }

    btnClearSearch.style.display = 'flex';
    const q = rawQuery.toLowerCase();
    const cleanQ = q.replace(/^(plot|family|parcel)\s+/i, '').trim();

    // 1. Check Site / Landscape matches
    const siteMatches = [];
    const allSites = Object.keys(hierarchy);
    allSites.forEach((site) => {
      if (site.toLowerCase().includes(q)) {
        let plotCount = 0;
        for (const vil in hierarchy[site]) {
          for (const fam in hierarchy[site][vil]) {
            plotCount += hierarchy[site][vil][fam].length;
          }
        }
        siteMatches.push({ type: 'site', site, count: plotCount });
      }
    });

    // 2. Check Village matches (limit to top 4)
    const villageMatches = [];
    for (const site in hierarchy) {
      for (const vil in hierarchy[site]) {
        if (vil.toLowerCase().includes(q)) {
          let plotCount = 0;
          for (const fam in hierarchy[site][vil]) {
            plotCount += hierarchy[site][vil][fam].length;
          }
          villageMatches.push({ type: 'village', site, village: vil, count: plotCount });
          if (villageMatches.length >= 4) break;
        }
      }
      if (villageMatches.length >= 4) break;
    }

    // 3. Search Plots across Village + Family ID, Family ID, Plot Code, Farmer Name, Village, Site
    const qClean = q.replace(/[+,-]/g, ' ').replace(/\s+/g, ' ').trim();
    const qTokens = qClean.split(' ').filter(Boolean);

    const plotMatches = [];
    for (let i = 0; i < searchIndex.length && plotMatches.length < 30; i++) {
      const p = searchIndex[i];
      const famLower = (p.family_id || '').toLowerCase();
      const plotLower = (p.plot_id || '').toLowerCase();
      const vilLower = (p.village || '').toLowerCase();
      const siteLower = (p.site || '').toLowerCase();
      const combinedCode = `${famLower}-${plotLower}`;
      const vilFam1 = `${vilLower} ${famLower}`;
      const vilFam2 = `${famLower} ${vilLower}`;

      // Farmer name lookup from ICS records (Village + Family ID unique key)
      const farmerRec = getFarmerRecord(p);
      const farmerName = (farmerRec && (farmerRec.hoh_name || farmerRec.interviewee_name)) || p.farmer_name || '';
      const farmerLower = farmerName.toLowerCase();

      let score = 0;
      let matchedBy = '';

      // Check Village + Family ID combination match
      if (vilFam1 === qClean || vilFam2 === qClean) {
        score = 120;
        matchedBy = 'village_family';
      } else if (vilFam1.includes(qClean) || vilFam2.includes(qClean)) {
        score = 110;
        matchedBy = 'village_family';
      } else if (qTokens.length > 1 && qTokens.some(t => vilLower.includes(t)) && qTokens.some(t => famLower.includes(t) || plotLower === t)) {
        score = 105;
        matchedBy = 'village_family';
      } else if (famLower === q || plotLower === q || combinedCode === q) {
        score = 100;
        matchedBy = famLower === q ? 'family' : 'plot';
      } else if (farmerLower && farmerLower === q) {
        score = 95;
        matchedBy = 'farmer';
      } else if (farmerLower && farmerLower.includes(q)) {
        score = 80;
        matchedBy = 'farmer';
      } else if (famLower.includes(q)) {
        score = 70;
        matchedBy = 'family';
      } else if (plotLower === cleanQ || (cleanQ && plotLower.includes(cleanQ)) || combinedCode.includes(q)) {
        score = 65;
        matchedBy = 'plot';
      } else if (vilLower.includes(q)) {
        score = 40;
        matchedBy = 'village';
      } else if (siteLower.includes(q)) {
        score = 20;
        matchedBy = 'site';
      }

      if (score > 0) {
        plotMatches.push({
          type: 'plot',
          plot: p,
          farmerName,
          matchedBy,
          score
        });
      }
    }

    // Sort plot matches by score descending
    plotMatches.sort((a, b) => b.score - a.score);

    renderSearchSuggestions({
      siteMatches,
      villageMatches,
      plotMatches: plotMatches.slice(0, 18),
      query: rawQuery
    });
  }

  function renderSearchSuggestions({ siteMatches, villageMatches, plotMatches, query }) {
    searchSuggestions.innerHTML = '';
    const totalResults = siteMatches.length + villageMatches.length + plotMatches.length;

    if (totalResults === 0) {
      searchSuggestions.innerHTML = `
        <div class="search-empty-state">
          No matching landscapes, villages, plots, or farmers found for "${escapeHtml(query)}"
        </div>
      `;
      searchSuggestions.style.display = 'block';
      return;
    }

    const frag = document.createDocumentFragment();

    // Render Sites
    siteMatches.forEach((sm) => {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      item.innerHTML = `
        <div class="suggestion-main">
          <span class="suggestion-title">📍 Landscape: ${highlightMatch(sm.site, query)}</span>
          <span class="suggestion-subtitle">${sm.count} plots mapped · Click to filter & zoom site</span>
        </div>
        <span class="suggestion-tag tag-site">Site</span>
      `;
      item.addEventListener('click', () => {
        searchSuggestions.style.display = 'none';
        quickSearchInput.value = sm.site;
        filterSite.value = sm.site;
        onSiteChanged();
        applyFilters();
        showToast(`Filtered to ${sm.site}`);
      });
      frag.appendChild(item);
    });

    // Render Villages
    villageMatches.forEach((vm) => {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      item.innerHTML = `
        <div class="suggestion-main">
          <span class="suggestion-title">🏘️ Village: ${highlightMatch(vm.village, query)}</span>
          <span class="suggestion-subtitle">${vm.site} · ${vm.count} plots · Click to filter & zoom village</span>
        </div>
        <span class="suggestion-tag tag-village">Village</span>
      `;
      item.addEventListener('click', () => {
        searchSuggestions.style.display = 'none';
        quickSearchInput.value = `${vm.village}, ${vm.site}`;
        filterSite.value = vm.site;
        onSiteChanged();
        filterVillage.value = vm.village;
        onVillageChanged();
        applyFilters();
        showToast(`Filtered to ${vm.village} in ${vm.site}`);
      });
      frag.appendChild(item);
    });

    // Render Plots
    plotMatches.forEach((pm) => {
      const p = pm.plot;
      const item = document.createElement('div');
      item.className = 'suggestion-item';

      const familyHighlight = highlightMatch(p.family_id, query);
      const plotHighlight = highlightMatch(p.plot_id, query);
      const villageHighlight = highlightMatch(p.village, query);
      const siteHighlight = highlightMatch(p.site, query);

      let titleHtml = '';
      let tagHtml = `<span class="suggestion-tag">Plot ${escapeHtml(p.plot_id)}</span>`;

      if (pm.matchedBy === 'village_family') {
        const farmerSnippet = pm.farmerName ? ` · 🧑‍🌾 ${escapeHtml(pm.farmerName)}` : '';
        titleHtml = `<span class="suggestion-title">🏘️ ${villageHighlight} · Family ${familyHighlight} (Plot ${plotHighlight})${farmerSnippet}</span>`;
        tagHtml = `<span class="suggestion-tag tag-farmer">Village + Family</span>`;
      } else if (pm.matchedBy === 'farmer' && pm.farmerName) {
        const farmerHighlight = highlightMatch(pm.farmerName, query);
        titleHtml = `<span class="suggestion-title">🧑‍🌾 ${farmerHighlight} · Family ${familyHighlight} (Plot ${plotHighlight})</span>`;
        tagHtml = `<span class="suggestion-tag tag-farmer">Farmer</span>`;
      } else {
        const farmerSnippet = pm.farmerName ? ` · 🧑‍🌾 ${escapeHtml(pm.farmerName)}` : '';
        titleHtml = `<span class="suggestion-title">Family ${familyHighlight} · Plot ${plotHighlight}${farmerSnippet}</span>`;
        if (pm.matchedBy === 'village') {
          tagHtml = `<span class="suggestion-tag tag-village">Village</span>`;
        } else if (pm.matchedBy === 'site') {
          tagHtml = `<span class="suggestion-tag tag-site">Site</span>`;
        }
      }

      item.innerHTML = `
        <div class="suggestion-main">
          ${titleHtml}
          <span class="suggestion-subtitle">${villageHighlight}, ${siteHighlight} (${p.area_ha ? p.area_ha.toFixed(2) : 0} ha)</span>
        </div>
        ${tagHtml}
      `;

      item.addEventListener('click', () => {
        searchSuggestions.style.display = 'none';
        const label = `${p.village} · Family ${p.family_id} (Plot ${p.plot_id}${pm.farmerName ? ' - ' + pm.farmerName : ''})`;
        quickSearchInput.value = label;
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

  // --- Inspector Sidebar Dedicated Search Engine ---
  function setupSidebarSearch() {
    const sidebarSearchInput = document.getElementById('sidebar-search-input');
    const btnClearSidebarSearch = document.getElementById('btn-clear-sidebar-search');
    const sidebarSearchSuggestions = document.getElementById('sidebar-search-suggestions');

    if (!sidebarSearchInput || !sidebarSearchSuggestions) return;

    function handleSidebarSearch() {
      const rawQuery = sidebarSearchInput.value.trim();
      if (!rawQuery) {
        if (btnClearSidebarSearch) btnClearSidebarSearch.style.display = 'none';
        sidebarSearchSuggestions.style.display = 'none';
        return;
      }

      if (btnClearSidebarSearch) btnClearSidebarSearch.style.display = 'block';
      const q = rawQuery.toLowerCase();
      const cleanQ = q.replace(/^(plot|family|parcel)\s+/i, '').trim();

      const siteMatches = [];
      const villageMatches = [];
      const plotMatches = [];

      // 1. Sites
      Object.keys(hierarchy).forEach((site) => {
        if (site.toLowerCase().includes(q)) {
          let count = 0;
          for (const vil in hierarchy[site]) {
            for (const fam in hierarchy[site][vil]) count += hierarchy[site][vil][fam].length;
          }
          siteMatches.push({ site, count });
        }
      });

      // 2. Villages
      for (const site in hierarchy) {
        for (const vil in hierarchy[site]) {
          if (vil.toLowerCase().includes(q)) {
            let count = 0;
            for (const fam in hierarchy[site][vil]) count += hierarchy[site][vil][fam].length;
            villageMatches.push({ site, village: vil, count });
            if (villageMatches.length >= 3) break;
          }
        }
        if (villageMatches.length >= 3) break;
      }

      // 3. Plots
      for (let i = 0; i < searchIndex.length && plotMatches.length < 25; i++) {
        const p = searchIndex[i];
        const famLower = (p.family_id || '').toLowerCase();
        const plotLower = (p.plot_id || '').toLowerCase();
        const vilLower = (p.village || '').toLowerCase();
        const siteLower = (p.site || '').toLowerCase();
        const farmerRec = getFarmerRecord(p);
        const farmerName = (farmerRec && (farmerRec.hoh_name || farmerRec.interviewee_name)) || p.farmer_name || '';
        const farmerLower = farmerName.toLowerCase();

        let score = 0;
        if (famLower === q || plotLower === q || `${famLower}-${plotLower}` === q) score = 100;
        else if (farmerLower && farmerLower.includes(q)) score = 85;
        else if (famLower.includes(q)) score = 75;
        else if (plotLower === cleanQ || plotLower.includes(cleanQ)) score = 70;
        else if (vilLower.includes(q)) score = 45;
        else if (siteLower.includes(q)) score = 20;

        if (score > 0) plotMatches.push({ plot: p, farmerName, score });
      }

      plotMatches.sort((a, b) => b.score - a.score);

      sidebarSearchSuggestions.innerHTML = '';
      const total = siteMatches.length + villageMatches.length + plotMatches.length;
      if (total === 0) {
        sidebarSearchSuggestions.innerHTML = `<div style="padding: 10px; font-size: 0.72rem; color: #94a3b8; text-align: center;">No matching plots or villages for "${escapeHtml(rawQuery)}"</div>`;
        sidebarSearchSuggestions.style.display = 'block';
        return;
      }

      const frag = document.createDocumentFragment();

      siteMatches.forEach((sm) => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.innerHTML = `
          <div class="suggestion-main">
            <span class="suggestion-title">📍 Landscape: ${highlightMatch(sm.site, rawQuery)}</span>
            <span class="suggestion-subtitle">${sm.count} plots</span>
          </div>
          <span class="suggestion-tag tag-site">Site</span>
        `;
        item.addEventListener('click', () => {
          sidebarSearchSuggestions.style.display = 'none';
          sidebarSearchInput.value = sm.site;
          filterSite.value = sm.site;
          onSiteChanged();
          applyFilters();
        });
        frag.appendChild(item);
      });

      villageMatches.forEach((vm) => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.innerHTML = `
          <div class="suggestion-main">
            <span class="suggestion-title">🏘️ Village: ${highlightMatch(vm.village, rawQuery)}</span>
            <span class="suggestion-subtitle">${escapeHtml(vm.site)} · ${vm.count} plots</span>
          </div>
          <span class="suggestion-tag tag-village">Village</span>
        `;
        item.addEventListener('click', () => {
          sidebarSearchSuggestions.style.display = 'none';
          sidebarSearchInput.value = `${vm.village}, ${vm.site}`;
          filterSite.value = vm.site;
          onSiteChanged();
          filterVillage.value = vm.village;
          onVillageChanged();
          applyFilters();
        });
        frag.appendChild(item);
      });

      plotMatches.slice(0, 16).forEach((m) => {
        const p = m.plot;
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        const farmerLabel = m.farmerName ? ` · 🧑‍🌾 ${highlightMatch(m.farmerName, rawQuery)}` : '';
        item.innerHTML = `
          <div class="suggestion-main">
            <span class="suggestion-title">Family <b>${highlightMatch(p.family_id, rawQuery)}</b> · Plot ${highlightMatch(p.plot_id, rawQuery)}${farmerLabel}</span>
            <span class="suggestion-subtitle">${escapeHtml(p.village)}, ${escapeHtml(p.site)} · ${p.area_ha ? Number(p.area_ha).toFixed(2) : '0'} ha</span>
          </div>
          <span class="suggestion-tag tag-plot">Plot</span>
        `;
        item.addEventListener('click', () => {
          sidebarSearchSuggestions.style.display = 'none';
          sidebarSearchInput.value = `${p.family_id} · Plot ${p.plot_id}`;
          selectPlot(p, true);
        });
        frag.appendChild(item);
      });

      sidebarSearchSuggestions.appendChild(frag);
      sidebarSearchSuggestions.style.display = 'block';
    }

    sidebarSearchInput.addEventListener('input', handleSidebarSearch);
    sidebarSearchInput.addEventListener('focus', () => {
      if (sidebarSearchInput.value.trim().length > 0) {
        sidebarSearchSuggestions.style.display = 'block';
      }
    });

    sidebarSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const firstItem = sidebarSearchSuggestions.querySelector('.suggestion-item');
        if (firstItem) {
          e.preventDefault();
          firstItem.click();
        }
      } else if (e.key === 'Escape') {
        sidebarSearchSuggestions.style.display = 'none';
      }
    });

    if (btnClearSidebarSearch) {
      btnClearSidebarSearch.addEventListener('click', () => {
        sidebarSearchInput.value = '';
        btnClearSidebarSearch.style.display = 'none';
        sidebarSearchSuggestions.style.display = 'none';
        sidebarSearchInput.focus();
      });
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.sidebar-search-box')) {
        if (sidebarSearchSuggestions) sidebarSearchSuggestions.style.display = 'none';
      }
    });
  }

  // --- Cascading Filters Logic ---
  function populateSiteFilter() {
    if (!filterSite) return;
    const isInspector = currentUser && (currentUser.role === 'inspector' || currentUser.role === 'supervisor');
    const assignedLands = (currentUser && currentUser.assigned_landscapes && currentUser.assigned_landscapes.length > 0)
      ? currentUser.assigned_landscapes
      : [];

    const totalPlots = searchIndex ? searchIndex.length : 6427;
    filterSite.innerHTML = `<option value="">All Sites (${totalPlots.toLocaleString()} plots)</option>`;
    
    let sites = Object.keys(hierarchy).sort().filter(s => {
      if (!s) return false;
      const lower = s.toLowerCase();
      return lower !== 'chhaeb' && lower !== 'unknown site' && lower !== 'unknown';
    });
    if (isInspector && assignedLands.length > 0) {
      sites = sites.filter(s => assignedLands.includes(s));
    }

    sites.forEach((site) => {
      let plotCount = 0;
      if (hierarchy[site]) {
        for (const vil in hierarchy[site]) {
          for (const fam in hierarchy[site][vil]) {
            plotCount += hierarchy[site][vil][fam].length;
          }
        }
      }
      const opt = document.createElement('option');
      opt.value = site;
      opt.textContent = `${site} (${plotCount} plots)`;
      filterSite.appendChild(opt);
    });

    if (isInspector && sites.length === 1) {
      filterSite.value = sites[0];
      onSiteChanged();
    }
  }

  // --- Dynamic Quick Explore Sanctuaries Generator ---
  function renderQuickExploreSanctuaries() {
    const container = document.getElementById('landscape-chips-grid');
    const heroStatSanctuaries = document.getElementById('hero-stat-sanctuaries');
    if (!container) return;

    // Extract unique Site values from the loaded plot data
    const rawSitesSet = new Set();

    if (masterSearchIndex && masterSearchIndex.length > 0) {
      masterSearchIndex.forEach(p => {
        if (p && p.site) rawSitesSet.add(String(p.site).trim());
      });
    }
    if (hierarchy) {
      Object.keys(hierarchy).forEach(s => {
        if (s) rawSitesSet.add(String(s).trim());
      });
    }
    if (masterFeatures && masterFeatures.length > 0) {
      masterFeatures.forEach(f => {
        const s = f.properties && (f.properties.site || f.properties.landscape);
        if (s) rawSitesSet.add(String(s).trim());
      });
    }

    // Exclude "Chhaeb", "Unknown Site", etc.
    const excluded = ['chhaeb', 'unknown site', 'unknown', 'n/a', 'none'];
    const validRawSites = Array.from(rawSitesSet).filter(s => {
      if (!s) return false;
      return !excluded.includes(s.toLowerCase());
    });

    const canonicalOrder = ['Preah Vihear', 'Preay Lang', 'Siem Pang', 'Veun Sai', 'Lumphat', 'Keo Seima'];
    const presentSitesMap = new Map(); // canonicalName -> rawSiteName

    validRawSites.forEach(raw => {
      const cfg = getSiteConfig(raw);
      if (!presentSitesMap.has(cfg.canonicalName)) {
        presentSitesMap.set(cfg.canonicalName, raw);
      }
    });

    const displaySites = [];
    canonicalOrder.forEach(cName => {
      if (presentSitesMap.has(cName)) {
        displaySites.push(presentSitesMap.get(cName));
      } else {
        const cfgFallback = getSiteConfig(cName);
        if (cfgFallback && cfgFallback.name) {
          displaySites.push(cName);
        }
      }
    });

    const finalSites = [];
    displaySites.forEach(s => {
      const cfg = getSiteConfig(s);
      if (!finalSites.some(fs => getSiteConfig(fs).canonicalName === cfg.canonicalName)) {
        finalSites.push(s);
      }
    });

    if (heroStatSanctuaries) {
      heroStatSanctuaries.textContent = finalSites.length.toString();
    }

    container.innerHTML = '';
    const frag = document.createDocumentFragment();

    finalSites.forEach(siteName => {
      const cfg = getSiteConfig(siteName);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'landscape-chip site-color-chip';
      btn.setAttribute('data-landscape', cfg.canonicalName);
      btn.setAttribute('data-site', siteName);
      btn.title = `Fly to ${cfg.description || cfg.canonicalName}`;

      btn.style.setProperty('--site-color', cfg.color);
      btn.style.setProperty('--site-border', cfg.borderColor);
      btn.style.setProperty('--site-glow', cfg.bgGlow);
      btn.style.setProperty('--site-active-bg', cfg.activeBg);

      btn.innerHTML = `<span class="chip-icon">${cfg.icon}</span> ${escapeHtml(cfg.canonicalName)}`;

      btn.addEventListener('click', () => {
        container.querySelectorAll('.landscape-chip').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        flyToSanctuarySite(siteName, cfg);
      });

      frag.appendChild(btn);
    });

    container.appendChild(frag);
  }

  function flyToSanctuarySite(siteName, cfg) {
    const siteKey = (siteName || '').toLowerCase();
    const altKeys = (cfg && cfg.altNames) || [siteKey];
    const canonicalLower = (cfg && cfg.canonicalName || '').toLowerCase();

    // Find all plot features matching this site
    const matchingFeatures = masterFeatures.filter(f => {
      if (!f || !f.properties) return false;
      const s = (f.properties.site || f.properties.landscape || '').trim().toLowerCase();
      return s === siteKey || altKeys.includes(s) || s === canonicalLower;
    });

    if (matchingFeatures.length > 0 && map) {
      try {
        const boundsGroup = L.geoJSON({ type: 'FeatureCollection', features: matchingFeatures });
        const b = boundsGroup.getBounds();
        if (b && b.isValid()) {
          map.flyToBounds(b, { padding: [40, 40], maxZoom: 14, duration: 1.4 });
          showToast(`📍 Exploring ${cfg ? cfg.description || cfg.canonicalName : siteName} (${matchingFeatures.length.toLocaleString()} plots)`);
          return;
        }
      } catch (e) {
        console.warn('Error computing site bounds:', e);
      }
    }

    if (filterSite) {
      filterSite.value = siteName;
      onSiteChanged();
      applyFilters();
    }
    showToast(`Zoomed to ${cfg ? cfg.canonicalName : siteName}`);
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
      if (satelliteLayer && map.hasLayer(satelliteLayer)) map.removeLayer(satelliteLayer);
      if (googleHybridLayer) googleHybridLayer.addTo(map);
      currentBasemap = 'hybrid';
      if (layerLabel) layerLabel.textContent = 'Hybrid';
      showToast('Switched to High-Res Google Hybrid Satellite');
    } else if (currentBasemap === 'hybrid') {
      if (googleHybridLayer && map.hasLayer(googleHybridLayer)) map.removeLayer(googleHybridLayer);
      if (osmLayer) osmLayer.addTo(map);
      currentBasemap = 'osm';
      if (layerLabel) layerLabel.textContent = 'Map';
      showToast('Switched to Street / Terrain map');
    } else {
      if (osmLayer && map.hasLayer(osmLayer)) map.removeLayer(osmLayer);
      if (satelliteLayer) satelliteLayer.addTo(map);
      currentBasemap = 'sat';
      if (layerLabel) layerLabel.textContent = 'Sat';
      showToast('Switched to Esri World Satellite imagery');
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

  // --- GPS Location Updates ---
  function onGpsLocationUpdate(pos) {
    const crd = pos.coords;
    userLocation = {
      lat: crd.latitude,
      lng: crd.longitude,
      accuracy: crd.accuracy
    };

    updateUserMarkerOnMap();
  }

  function onGpsLocationError(err) {
    console.warn('[GPS] Error:', err);
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

  // --- Geometry & Math Utilities ---

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

  let farmersStore   = {}; // { [village__family_id]: farmerRecord }
  let icsInspections = {}; // { [plot_db_id]: inspectionRecord }
  let sessionState   = { inspectorName: '', seasonYear: new Date().getFullYear() };
  let editingSubplotInstance = null; // Subplot object currently open in subplotModal for inspection

  // --- Unique Farmer Key Logic (Village + Family ID) ---
  function makeFarmerKey(village, familyId) {
    const v = (village || '').trim().toLowerCase();
    const f = (familyId || '').trim();
    if (!v) return f;
    return `${v}__${f}`;
  }

  function getFarmerKey(p) {
    if (!p) return '';
    return makeFarmerKey(p.village, p.family_id);
  }

  function getFarmerDisplayLabel(village, familyId) {
    const v = (village || '').trim();
    const f = (familyId || '').trim();
    if (v && f) return `${v} · Family ${f}`;
    return f ? `Family ${f}` : v;
  }

  function getFarmerRecord(p) {
    if (!p) return null;
    const key = getFarmerKey(p);
    return (key && farmersStore[key] && farmersStore[key].saved) ? farmersStore[key] : null;
  }

  function hasFarmerFormData() {
    const name = document.getElementById('f-head-name')?.value.trim();
    const interviewee = document.getElementById('f-interviewee-name')?.value.trim();
    const remark = document.getElementById('f-nc-remark')?.value.trim();
    const members = document.getElementById('f-members')?.value.trim();
    const trainings = getChipValues('#f-trainings');
    return !!(name || interviewee || remark || members || (trainings && trainings.length > 0));
  }

  function hasPlotBaselineFormData() {
    const date = document.getElementById('p-inspection-date')?.value.trim();
    const avoidMethod = document.getElementById('p-avoid-method')?.value.trim();
    const cropName = document.getElementById('p-crop-name')?.value.trim();
    const expLastYear = document.getElementById('p-exp-last-year')?.value.trim();
    const prohibitedChips = getChipValues('#p-prohibited-chips');
    return !!(date || avoidMethod || cropName || expLastYear || (prohibitedChips && prohibitedChips.length > 0));
  }

  function hasPostHarvestFormData() {
    const chamkarNum = document.getElementById('c-chamkar-num')?.value.trim();
    const chamkarArea = document.getElementById('c-chamkar-area')?.value.trim();
    const crops = getChipValues('#c-chamkar-crops');
    const chambers = document.getElementById('c-chambers')?.value.trim();
    return !!(chamkarNum || chamkarArea || (crops && crops.length > 0) || chambers);
  }

  function loadICSStores() {
    try {
      const rawFarmers = JSON.parse(localStorage.getItem(FARMERS_STORE_KEY) || '{}');
      farmersStore = {};
      for (const k in rawFarmers) {
        const rec = rawFarmers[k];
        const key = (rec.village && rec.family_id) ? makeFarmerKey(rec.village, rec.family_id) : k;
        farmersStore[key] = rec;
      }
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
        if (hasFarmerFormData()) {
          saveCurrentFarmerForm();
        }
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
        if (hasPlotBaselineFormData()) {
          saveCurrentPlotBaselineForm();
        }
        switchDrawerTab('tab-subplots');
      });
    }

    const btnBackParcel = document.getElementById('btn-back-to-parcel');
    if (btnBackParcel) {
      btnBackParcel.addEventListener('click', () => switchDrawerTab('tab-parcel'));
    }

    const btnNextPostharvest = document.getElementById('btn-next-to-postharvest');
    if (btnNextPostharvest) {
      btnNextPostharvest.addEventListener('click', () => {
        if (currentInspectionPhase === 'phase_1') {
          // Phase 1: skip Stage 4 Post-Harvest and proceed straight to Phase 1 confirmation!
          switchDrawerTab('tab-confirm');
        } else {
          switchDrawerTab('tab-postharvest');
        }
      });
    }

    const btnBackSubplots = document.getElementById('btn-back-to-subplots');
    if (btnBackSubplots) {
      btnBackSubplots.addEventListener('click', () => switchDrawerTab('tab-subplots'));
    }

    const btnNextConfirm = document.getElementById('btn-next-to-confirm');
    if (btnNextConfirm) {
      btnNextConfirm.addEventListener('click', () => {
        if (hasPostHarvestFormData()) {
          saveCurrentPostHarvestForm();
        }
        switchDrawerTab('tab-confirm');
      });
    }

    const btnBackPostharvest = document.getElementById('btn-back-to-postharvest');
    if (btnBackPostharvest) {
      btnBackPostharvest.addEventListener('click', () => {
        if (currentInspectionPhase === 'phase_1') {
          switchDrawerTab('tab-subplots');
        } else {
          switchDrawerTab('tab-postharvest');
        }
      });
    }

    const btnSaveAll = document.getElementById('btn-save-complete-inspection');
    if (btnSaveAll) {
      btnSaveAll.addEventListener('click', saveCompleteRecord);
    }

    // Phase Switcher Buttons
    const btnP1 = document.getElementById('phase-btn-1');
    const btnP2 = document.getElementById('phase-btn-2');
    const btnP3 = document.getElementById('phase-btn-3');
    if (btnP1) btnP1.addEventListener('click', () => switchInspectionPhase('phase_1'));
    if (btnP2) btnP2.addEventListener('click', () => switchInspectionPhase('phase_2'));
    if (btnP3) btnP3.addEventListener('click', () => switchInspectionPhase('phase_3'));
  }

  // --- Multi-Phase Seasonal Lifecycle Logic ---
  let currentInspectionPhase = 'phase_1';

  function switchInspectionPhase(phaseKey) {
    currentInspectionPhase = phaseKey;
    const btn1 = document.getElementById('phase-btn-1');
    const btn2 = document.getElementById('phase-btn-2');
    const btn3 = document.getElementById('phase-btn-3');
    const badge = document.getElementById('phase-active-badge');
    const btnNextPost = document.getElementById('btn-next-to-postharvest');
    const saveAllBtn = document.getElementById('btn-save-complete-inspection');
    const postTabBtn = document.getElementById('tab-btn-postharvest');

    if (btn1) btn1.classList.toggle('active', phaseKey === 'phase_1');
    if (btn2) btn2.classList.toggle('active', phaseKey === 'phase_2');
    if (btn3) btn3.classList.toggle('active', phaseKey === 'phase_3');

    if (phaseKey === 'phase_1') {
      if (badge) badge.textContent = 'Phase 1: Planting & Growing';
      if (btnNextPost) btnNextPost.textContent = 'Proceed to Phase 1 Sign-Off →';
      if (saveAllBtn) saveAllBtn.innerHTML = '<span>💾 Sign Off Phase 1 Baseline</span>';
      if (postTabBtn) postTabBtn.style.opacity = '0.5';
    } else if (phaseKey === 'phase_2') {
      if (badge) badge.textContent = 'Phase 2: Harvest & Threshing';
      if (btnNextPost) btnNextPost.textContent = 'Next: Post-Harvest →';
      if (saveAllBtn) saveAllBtn.innerHTML = '<span>💾 Save Phase 2 Harvest Record</span>';
      if (postTabBtn) postTabBtn.style.opacity = '1';
    } else if (phaseKey === 'phase_3') {
      if (badge) badge.textContent = 'Phase 3: Post-Harvest & Conservation Audit';
      if (btnNextPost) btnNextPost.textContent = 'Next: Post-Harvest →';
      if (saveAllBtn) saveAllBtn.innerHTML = '<span>💾 Sign Off Final Annual Audit</span>';
      if (postTabBtn) postTabBtn.style.opacity = '1';
    }
  }

  function updatePhaseIndicatorsForSelectedPlot() {
    if (!selectedPlot) return;
    const farmerKey = getFarmerKey(selectedPlot);
    const farmerRecord = farmersStore[farmerKey] || {};
    const phases = farmerRecord.phases || {};

    const btn1 = document.getElementById('phase-btn-1');
    const btn2 = document.getElementById('phase-btn-2');
    const btn3 = document.getElementById('phase-btn-3');
    const ind1 = document.getElementById('phase-1-indicator');
    const ind2 = document.getElementById('phase-2-indicator');
    const ind3 = document.getElementById('phase-3-indicator');

    const p1Done = !!phases.phase_1;
    const p2Done = !!phases.phase_2;
    const p3Done = !!phases.phase_3;

    if (btn1) btn1.classList.toggle('phase-completed', p1Done);
    if (btn2) btn2.classList.toggle('phase-completed', p2Done);
    if (btn3) btn3.classList.toggle('phase-completed', p3Done);

    if (ind1) ind1.textContent = p1Done ? '●' : '○';
    if (ind2) ind2.textContent = p2Done ? '●' : '○';
    if (ind3) ind3.textContent = p3Done ? '●' : '○';

    // Auto-advance to active phase
    if (!p1Done) {
      switchInspectionPhase('phase_1');
    } else if (!p2Done) {
      switchInspectionPhase('phase_2');
    } else {
      switchInspectionPhase('phase_3');
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
    const scrollBody = document.getElementById('drawer-scrollable-body');
    if (scrollBody) {
      scrollBody.scrollTop = 0;
    }
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
    // Stage 1: Farmer compliance (Options: Compliance, Non-Compliance, Resign)
    const selCompliant = document.getElementById('f-compliant');
    const blockNC = document.getElementById('nc-details-block');
    const badgeCompliance = document.getElementById('badge-farmer-compliance');
    if (selCompliant) {
      selCompliant.addEventListener('change', () => {
        const val = selCompliant.value;
        const isNC = val === 'Non-Compliance' || val === 'Resign' || val === '2' || val === '3';
        if (blockNC) blockNC.style.display = isNC ? 'block' : 'none';
        if (badgeCompliance) {
          if (!val) {
            badgeCompliance.style.display = 'none';
            badgeCompliance.textContent = '';
          } else if (val === 'Compliance' || val === '1') {
            badgeCompliance.style.display = 'inline-block';
            badgeCompliance.textContent = 'Compliance';
            badgeCompliance.className = 'badge status-pill status-approved';
          } else if (val === 'Non-Compliance' || val === '2') {
            badgeCompliance.style.display = 'inline-block';
            badgeCompliance.textContent = 'Non-Compliance';
            badgeCompliance.className = 'badge status-pill status-danger';
          } else if (val === 'Resign' || val === '3') {
            badgeCompliance.style.display = 'inline-block';
            badgeCompliance.textContent = 'Resign';
            badgeCompliance.className = 'badge status-pill status-warn';
          } else {
            badgeCompliance.style.display = 'none';
            badgeCompliance.textContent = '';
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
    updateSubplotHarvestBalance();
  }

  function updateSubplotHarvestBalance() {
    const actual = parseFloat(document.getElementById('sh-actual-kg')?.value) || 0;
    const sale = parseFloat(document.getElementById('sh-sale-kg')?.value) || 0;
    const consume = parseFloat(document.getElementById('sh-consume-kg')?.value) || 0;
    const seed = parseFloat(document.getElementById('sh-seed-kg')?.value) || 0;
    const allocated = sale + consume + seed;
    const balance = actual - allocated;

    const elSum = document.getElementById('sh-alloc-sum');
    const elBal = document.getElementById('sh-alloc-balance');
    const rowBal = document.getElementById('sh-balance-row');

    if (elSum) elSum.textContent = `${allocated.toLocaleString()} kg`;
    if (elBal) elBal.textContent = `${balance.toLocaleString()} kg`;
    if (rowBal) {
      if (actual > 0 && Math.abs(balance) < 0.1) {
        rowBal.className = 'disposition-total-row balanced';
      } else if (balance < 0) {
        rowBal.className = 'disposition-total-row over-budget';
      } else {
        rowBal.className = 'disposition-total-row';
      }
    }
  }

  function updateParcelHarvestSummary() {
    const summaryBox = document.getElementById('parcel-harvest-summary');
    if (!selectedPlot || !summaryBox) return;

    const plotSubplots = subplots.filter((s) => s.parent_plot_id === selectedPlot.id);
    if (plotSubplots.length === 0) {
      summaryBox.style.display = 'none';
      return;
    }

    let totalExp = 0;
    let totalAct = 0;
    let totalSale = 0;
    let totalHome = 0;
    let totalSeed = 0;

    plotSubplots.forEach((sp) => {
      totalExp += parseFloat(sp.expected_production_kg) || 0;
      totalSale += parseFloat(sp.expected_sale_kg) || 0;
      if (sp.harvest && sp.harvest.complete === '1') {
        totalAct += parseFloat(sp.harvest.actual_kg) || 0;
        totalHome += parseFloat(sp.harvest.consume_kg) || 0;
        totalSeed += parseFloat(sp.harvest.seed_kg) || 0;
      }
    });

    const setT = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = `${val.toLocaleString()} kg`;
    };

    setT('summary-total-exp', totalExp);
    setT('summary-total-act', totalAct);
    setT('summary-total-sale', totalSale);
    setT('summary-total-home', totalHome);
    setT('summary-total-seed', totalSeed);

    summaryBox.style.display = 'block';
  }

  function checkFieldCompleted(el) {
    if (!el || !el.tagName) return;
    const tag = el.tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') return;
    if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'button' || el.type === 'submit' || el.type === 'hidden') return;

    const val = (el.value !== undefined && el.value !== null) ? String(el.value).trim() : '';
    if (val !== '') {
      el.classList.add('field-completed');
    } else {
      el.classList.remove('field-completed');
    }
  }

  function updateAllFieldsCompletedStatus(container = document) {
    if (!container) return;
    const fields = container.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]), select, textarea');
    fields.forEach(checkFieldCompleted);
  }

  function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) {
      el.value = val !== undefined && val !== null ? val : '';
      checkFieldCompleted(el);
    }
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

  // --- Reset All Inspection Forms for Clean Plot/Subplot Switching ---
  function resetAllInspectionForms() {
    // Stage 1: Farmer Baseline
    setVal('f-compliant', '');
    setChipValues('#f-nc-types', []);
    setVal('f-nc-remark', '');
    setVal('f-nc-date', '');
    setVal('f-nc-status', '');
    setVal('f-head-name', '');
    setVal('f-gender', '');
    setVal('f-is-head-interviewee', '');
    setVal('f-ethnicity', '');
    setVal('f-interviewee-name', '');
    setVal('f-interviewee-gender', '');
    setVal('f-status', '');
    setVal('f-labor-mf', '');
    setVal('f-members', '');
    setVal('f-females', '');
    setVal('f-school', '');
    setVal('f-toilet', '');
    setVal('f-disable', '');
    setVal('f-cattle', '');
    setVal('f-buffalo', '');
    setVal('f-other-animals', '');
    setChipValues('#f-trainings', []);
    setChipValues('#f-records', []);

    // Stage 2: Parcel Baseline
    setVal('p-inspection-date', '');
    setVal('p-area-ha', '');
    setVal('p-land-status', '');
    setVal('p-land-situation', '');
    setVal('p-irrigation', '');
    setVal('p-contamination', '');
    setVal('p-avoid-method', '');
    setVal('p-last-prohibited', '');
    setChipValues('#p-prohibited-chips', []);
    setVal('p-prohibited-date', '');
    setVal('p-other-crop', '');
    setVal('p-crop-name', '');
    setVal('p-crop-plant-date', '');
    setVal('p-crop-harvest-date', '');
    setVal('p-crop-actual-kg', '');
    setVal('p-crop-sold-kg', '');
    setVal('p-exp-last-year', '');
    setVal('p-actual-last-year', '');
    setVal('p-sold-ircc', '');
    setVal('p-seed-kept', '');
    setVal('p-consumed', '');
    setVal('p-inspection-notes', '');

    // Stage 4: Post-Harvest
    setVal('c-have-chamkar', '');
    setVal('c-chamkar-num', '');
    setVal('c-chamkar-area', '');
    setChipValues('#c-chamkar-crops', []);
    setVal('c-rice-barn', '');
    setVal('c-chambers', '');
    setVal('c-barn-clean', '');
    setVal('c-barn-chemicals', '');
    setVal('c-clear-forest', '');
    setVal('c-expand-land', '');
    setVal('c-burn-straw', '');
    setVal('c-firebreak', '');

    // Stage 5: Confirmation
    setVal('c-certified-status', '');
    setVal('c-conclusion-notes', '');
    setVal('c-inspector-name', sessionState.inspectorName || '');
    setVal('c-irpg-name', '');
    loadSignatureFromDataUrl('');

    // Trigger state change updates for conditional blocks
    const trigger = (elId) => {
      const el = document.getElementById(elId);
      if (el) el.dispatchEvent(new Event('change'));
    };
    trigger('f-compliant');
    trigger('f-is-head-interviewee');
    trigger('p-contamination');
    trigger('p-last-prohibited');
    trigger('p-other-crop');
    trigger('c-have-chamkar');
    trigger('c-rice-barn');
  }

  function resetSubplotHarvestModalForm() {
    editingHarvestSubplot = null;
    setVal('sh-complete', '1');
    setVal('sh-reason-no', 'Not mature');
    setVal('sh-date', '');
    setVal('sh-method', '3');
    setVal('sh-owner', '');
    setVal('sh-flush', 0);
    setVal('sh-dry-loc', '1');
    setVal('sh-payment-type', '1');
    setVal('sh-payment-amount', '');
    setVal('sh-actual-kg', '');
    setVal('sh-sale-kg', '');
    setVal('sh-consume-kg', '');
    setVal('sh-seed-kg', '');

    const blkInc = document.getElementById('sh-incomplete-block');
    const blkComp = document.getElementById('sh-complete-block');
    if (blkInc) blkInc.style.display = 'none';
    if (blkComp) blkComp.style.display = 'block';

    const blkMachine = document.getElementById('sh-machine-block');
    if (blkMachine) blkMachine.style.display = 'flex';
  }

  // --- Load Inspection for Selected Plot (Strict Hierarchy) ---
  function loadICSInspectionForSelectedPlot() {
    if (!selectedPlot) return;
    const plotDbId = selectedPlot.id;
    const familyId = selectedPlot.family_id;
    const village = (selectedPlot.village || '').trim();
    const farmerKey = getFarmerKey(selectedPlot);
    const farmerLabel = getFarmerDisplayLabel(village, familyId);

    // 0. RESET ALL FORMS FIRST - NEVER LEAK DATA ACROSS PLOTS
    resetAllInspectionForms();

    // Header labels & Hierarchy Banners
    const dispFamily = document.getElementById('f-family-display');
    if (dispFamily) dispFamily.textContent = farmerLabel;
    const dispPlot = document.getElementById('p-plot-display');
    if (dispPlot) dispPlot.textContent = `Plot ${selectedPlot.plot_id} · ${village}`;

    const setBannerText = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt;
    };
    setBannerText('banner-family-id', farmerLabel);
    setBannerText('banner-plot-id', selectedPlot.plot_id);
    setBannerText('banner-subplots-plot', selectedPlot.plot_id);
    setBannerText('banner-postharvest-family', farmerLabel);
    setBannerText('banner-confirm-family', farmerLabel);

    // Top identity badges in drawer
    const cardVillagePill = document.getElementById('card-village-pill');
    if (cardVillagePill) cardVillagePill.textContent = `Village: ${village || 'N/A'}`;

    const btnExportLabel = document.getElementById('btn-export-ics-csv-label');
    if (btnExportLabel) {
      btnExportLabel.textContent = `Export Farmer Report (.csv) · ${farmerLabel}`;
    }

    // Registered Parcels Switcher for this Farmer (Strictly Village + Family ID)
    const familyParcelsBox = document.getElementById('family-parcels-container');
    const familyParcelsList = document.getElementById('family-parcels-list');
    const familyParcelsCount = document.getElementById('family-parcels-count');

    if (familyParcelsBox && familyParcelsList) {
      const familyPlots = allFeatures.filter(
        (ft) => ft.properties && getFarmerKey(ft.properties) === farmerKey
      );
      if (familyPlots.length > 1) {
        familyParcelsBox.style.display = 'block';
        if (familyParcelsCount) familyParcelsCount.textContent = familyPlots.length.toString();
        const headerTitle = familyParcelsBox.querySelector('.parcels-box-title');
        if (headerTitle) {
          headerTitle.innerHTML = `🗺️ Registered Parcels in ${escapeHtml(village || 'Village')} (<span id="family-parcels-count">${familyPlots.length}</span>):`;
        }
        familyParcelsList.innerHTML = '';
        familyPlots.forEach((ft) => {
          const pProps = ft.properties;
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'family-parcel-chip' + (pProps.id === selectedPlot.id ? ' active-parcel' : '');
          chip.innerHTML = `Plot ${escapeHtml(pProps.plot_id)} <span style="font-weight: normal; opacity: 0.8;">(${pProps.area_ha ? pProps.area_ha.toFixed(2) : '--'} ha)</span>`;
          chip.addEventListener('click', (e) => {
            e.stopPropagation();
            selectPlot(pProps, true);
          });
          familyParcelsList.appendChild(chip);
        });
      } else {
        familyParcelsBox.style.display = 'none';
      }
    }

    // Check saved state for plot & farmer
    const insp = icsInspections[plotDbId];
    const isParcelSaved = !!(insp && insp.saved);
    const farmer = getFarmerRecord(selectedPlot);
    const isFarmerSaved = !!(farmer && farmer.saved);

    // Update Top Sticky Status Pill (Public view shows 'Inspected', Staff view shows internal inspection state)
    const inspectionStatePill = document.getElementById('card-inspection-state-pill');
    if (inspectionStatePill) {
      if (!currentUser) {
        inspectionStatePill.className = 'sub-status-pill status-saved';
        inspectionStatePill.textContent = '🟢 Inspected';
      } else if (isParcelSaved || isFarmerSaved) {
        inspectionStatePill.className = 'sub-status-pill status-saved';
        inspectionStatePill.textContent = '🟢 Saved Inspection Record';
      } else {
        inspectionStatePill.className = 'sub-status-pill status-blank';
        inspectionStatePill.textContent = '⚪ Blank Form (Not Inspected)';
      }
    }

    // Update Phase Milestone Indicators for this plot & farmer
    updatePhaseIndicatorsForSelectedPlot();

    // 1. Stage 1: Farmer Baseline (Recorded once per farmer: Village + Family ID)
    if (isFarmerSaved) {
      let compVal = farmer.farmer_compliant || 'Compliance';
      if (compVal === '1') compVal = 'Compliance';
      else if (compVal === '2') compVal = 'Non-Compliance';
      else if (compVal === '3') compVal = 'Resign';
      setVal('f-compliant', compVal);

      setChipValues('#f-nc-types', farmer.nc_types || []);
      setVal('f-nc-remark', farmer.nc_remark || '');
      setVal('f-nc-date', farmer.nc_date || '');
      setVal('f-nc-status', farmer.nc_status || selectedPlot.organic_status || 'Organic');

      setVal('f-head-name', farmer.hoh_name || '');
      setVal('f-gender', farmer.hoh_sex || '1');
      setVal('f-is-head-interviewee', farmer.is_head_interviewee || '1');
      setVal('f-ethnicity', farmer.ethnicity || '1');
      setVal('f-interviewee-name', farmer.interviewee_name || '');
      setVal('f-interviewee-gender', farmer.interviewee_gender || '1');

      let farmerStatusVal = farmer.status || 'Existing';
      if (['1', '2', '3', '4', '5', 'Organic', 'New_Organic', 'Ibis II', 'Ibis I', 'WF', 'Wildlife Friendly'].includes(farmerStatusVal)) {
        farmerStatusVal = 'Existing';
      }
      setVal('f-status', farmerStatusVal);

      setVal('f-labor-mf', farmer.labor_mf || '');
      setVal('f-members', farmer.members_count !== undefined && farmer.members_count !== null ? farmer.members_count : '');
      setVal('f-females', farmer.females_count !== undefined && farmer.females_count !== null ? farmer.females_count : '');
      setVal('f-school', farmer.school_count !== undefined && farmer.school_count !== null ? farmer.school_count : '');
      setVal('f-toilet', farmer.has_toilet || '1');
      setVal('f-disable', farmer.has_disabled || '2');
      setVal('f-cattle', farmer.cattle_count !== undefined && farmer.cattle_count !== null ? farmer.cattle_count : '');
      setVal('f-buffalo', farmer.buffalo_count !== undefined && farmer.buffalo_count !== null ? farmer.buffalo_count : '');
      setVal('f-other-animals', farmer.other_animals_count !== undefined && farmer.other_animals_count !== null ? farmer.other_animals_count : '');

      let rawTrainings = farmer.trainings || [];
      let normalizedTrainings = rawTrainings.map((t) => {
        if (t === '1') return 'Organic Standard';
        if (t === '2') return 'Fair for Life';
        if (t === '3') return 'Organic Agriculture';
        return t;
      }).filter((t) => ['Organic Standard', 'Organic Agriculture', 'Fair for Life'].includes(t));
      setChipValues('#f-trainings', normalizedTrainings);
      setChipValues('#f-records', farmer.records || []);
    } else {
      // Unsaved plot/farmer: start with a 100% blank form!
      setVal('f-compliant', '');
      setVal('f-head-name', '');
      setVal('f-gender', '');
      setVal('f-status', '');
    }

    // 2. Stage 2: Parcel Baseline (Specific to this physical parcel)
    if (isParcelSaved) {
      setVal('p-inspection-date', insp.inspection_date || '');
      setVal('p-area-ha', insp.area_ha !== undefined ? insp.area_ha : (selectedPlot.area_ha ? selectedPlot.area_ha.toFixed(2) : ''));
      setVal('p-land-status', insp.land_status || selectedPlot.organic_status || '');
      setVal('p-land-situation', insp.land_situation || '1');
      setVal('p-irrigation', insp.irrigation || '1');
      setVal('p-contamination', insp.contamination || '2');
      setVal('p-avoid-method', insp.avoid_method || '');
      setVal('p-last-prohibited', insp.last_prohibited || '2');
      setChipValues('#p-prohibited-chips', insp.prohibited_inputs || []);
      setVal('p-prohibited-date', insp.prohibited_date || '');
      setVal('p-other-crop', insp.other_crop || '2');
      setVal('p-crop-name', insp.crop_name || '');
      setVal('p-crop-plant-date', insp.crop_plant_date || '');
      setVal('p-crop-harvest-date', insp.crop_harvest_date || '');
      setVal('p-crop-actual-kg', insp.crop_actual_kg !== undefined && insp.crop_actual_kg !== null ? insp.crop_actual_kg : '');
      setVal('p-crop-sold-kg', insp.crop_sold_kg !== undefined && insp.crop_sold_kg !== null ? insp.crop_sold_kg : '');
      setVal('p-exp-last-year', insp.exp_last_year !== undefined && insp.exp_last_year !== null ? insp.exp_last_year : '');
      setVal('p-actual-last-year', insp.actual_last_year !== undefined && insp.actual_last_year !== null ? insp.actual_last_year : '');
      setVal('p-sold-ircc', insp.sold_ircc !== undefined && insp.sold_ircc !== null ? insp.sold_ircc : '');
      setVal('p-seed-kept', insp.seed_kept !== undefined && insp.seed_kept !== null ? insp.seed_kept : '');
      setVal('p-consumed', insp.consumed !== undefined && insp.consumed !== null ? insp.consumed : '');
      setVal('p-inspection-notes', insp.inspection_notes || '');
    } else {
      // Blank Form: only physical area and land organic status from GIS layer
      setVal('p-inspection-date', '');
      setVal('p-area-ha', selectedPlot.area_ha ? selectedPlot.area_ha.toFixed(2) : '');
      setVal('p-land-status', selectedPlot.organic_status || '');
      setVal('p-inspection-notes', '');
    }

    // 3. Stage 4: Post-Harvest Inspection (Farmer level, off-season)
    if (isFarmerSaved && farmer.post_harvest && farmer.post_harvest.saved) {
      const postHarvest = farmer.post_harvest;
      setVal('c-have-chamkar', postHarvest.have_chamkar || '2');
      setVal('c-chamkar-num', postHarvest.chamkar_num !== undefined ? postHarvest.chamkar_num : '');
      setVal('c-chamkar-area', postHarvest.chamkar_area || '');
      setChipValues('#c-chamkar-crops', postHarvest.chamkar_crops || []);
      setVal('c-rice-barn', postHarvest.has_rice_barn || '1');
      setVal('c-chambers', postHarvest.barn_chambers !== undefined ? postHarvest.barn_chambers : '');
      setVal('c-barn-clean', postHarvest.barn_clean || '1');
      setVal('c-barn-chemicals', postHarvest.barn_free_chemicals || '1');
      setVal('c-clear-forest', postHarvest.cleared_forest || '2');
      setVal('c-expand-land', postHarvest.expanded_land || '2');
      setVal('c-burn-straw', postHarvest.burned_straw || '2');
      setVal('c-firebreak', postHarvest.firebreak_kept || '1');
    }

    // 4. Stage 5: Confirmation (Farmer level complete sign-off)
    if (isFarmerSaved && farmer.confirmation && farmer.confirmation.saved) {
      const confirmData = farmer.confirmation;
      setVal('c-certified-status', confirmData.certified_status || '1');
      setVal('c-conclusion-notes', confirmData.conclusion_notes || '');
      setVal('c-inspector-name', confirmData.inspector_name || sessionState.inspectorName || '');
      setVal('c-irpg-name', confirmData.irpg_name || '');
      loadSignatureFromDataUrl(confirmData.signature_data || '');
    } else {
      setVal('c-inspector-name', sessionState.inspectorName || '');
      loadSignatureFromDataUrl('');
    }

    // Refresh conditional triggers
    const trigger = (elId) => {
      const el = document.getElementById(elId);
      if (el) el.dispatchEvent(new Event('change'));
    };
    trigger('f-compliant');
    trigger('f-is-head-interviewee');
    trigger('p-contamination');
    trigger('p-last-prohibited');
    trigger('p-other-crop');
    trigger('c-have-chamkar');
    trigger('c-rice-barn');

    updateParcelHarvestSummary();
    updateAllFieldsCompletedStatus();
  }

  // --- Form Auto-Save Handlers (Strict Hierarchy: Village + Family ID) ---
  function saveCurrentFarmerForm() {
    if (!selectedPlot) return;
    const farmerKey = getFarmerKey(selectedPlot);
    const fid = selectedPlot.family_id;
    const village = selectedPlot.village || '';
    const existing = farmersStore[farmerKey] || {};
    farmersStore[farmerKey] = {
      ...existing,
      saved: true,
      farmer_key: farmerKey,
      family_id: fid,
      village: village,
      site: selectedPlot.site || '',
      // Compliance (Options: Compliance, Non-Compliance, Resign)
      farmer_compliant: document.getElementById('f-compliant')?.value || 'Compliance',
      nc_types: getChipValues('#f-nc-types'),
      nc_remark: document.getElementById('f-nc-remark')?.value.trim() || '',
      nc_date: document.getElementById('f-nc-date')?.value || '',
      nc_status: document.getElementById('f-nc-status')?.value || 'Organic',
      // Demographics & profile
      hoh_name: document.getElementById('f-head-name')?.value.trim() || '',
      hoh_sex: document.getElementById('f-gender')?.value || '1',
      is_head_interviewee: document.getElementById('f-is-head-interviewee')?.value || '1',
      ethnicity: document.getElementById('f-ethnicity')?.value || '1',
      interviewee_name: document.getElementById('f-interviewee-name')?.value.trim() || '',
      interviewee_gender: document.getElementById('f-interviewee-gender')?.value || '1',
      status: document.getElementById('f-status')?.value || 'Existing',
      labor_mf: document.getElementById('f-labor-mf')?.value || '',
      members_count: document.getElementById('f-members')?.value !== '' ? parseInt(document.getElementById('f-members')?.value, 10) : null,
      females_count: document.getElementById('f-females')?.value !== '' ? parseInt(document.getElementById('f-females')?.value, 10) : null,
      school_count: document.getElementById('f-school')?.value !== '' ? parseInt(document.getElementById('f-school')?.value, 10) : null,
      has_toilet: document.getElementById('f-toilet')?.value || '1',
      has_disabled: document.getElementById('f-disable')?.value || '2',
      cattle_count: document.getElementById('f-cattle')?.value !== '' ? parseInt(document.getElementById('f-cattle')?.value, 10) : null,
      buffalo_count: document.getElementById('f-buffalo')?.value !== '' ? parseInt(document.getElementById('f-buffalo')?.value, 10) : null,
      other_animals_count: document.getElementById('f-other-animals')?.value !== '' ? parseInt(document.getElementById('f-other-animals')?.value, 10) : null,
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
      saved: true,
      plot_db_id: selectedPlot.id,
      family_id: selectedPlot.family_id,
      village: selectedPlot.village || '',
      farmer_key: getFarmerKey(selectedPlot),
      plot_id: selectedPlot.plot_id,
      inspection_date: document.getElementById('p-inspection-date')?.value || '',
      area_ha: parseFloat(document.getElementById('p-area-ha')?.value) || selectedPlot.area_ha || 0,
      land_status: document.getElementById('p-land-status')?.value || '',
      land_situation: document.getElementById('p-land-situation')?.value || '1',
      irrigation: document.getElementById('p-irrigation')?.value || '1',
      contamination: document.getElementById('p-contamination')?.value || '2',
      avoid_method: document.getElementById('p-avoid-method')?.value.trim() || '',
      last_prohibited: document.getElementById('p-last-prohibited')?.value || '2',
      prohibited_inputs: getChipValues('#p-prohibited-chips'),
      prohibited_date: document.getElementById('p-prohibited-date')?.value || '',
      other_crop: document.getElementById('p-other-crop')?.value || '2',
      crop_name: document.getElementById('p-crop-name')?.value.trim() || '',
      crop_plant_date: document.getElementById('p-crop-plant-date')?.value || '',
      crop_harvest_date: document.getElementById('p-crop-harvest-date')?.value || '',
      crop_actual_kg: document.getElementById('p-crop-actual-kg')?.value !== '' ? parseFloat(document.getElementById('p-crop-actual-kg')?.value) || 0 : '',
      crop_sold_kg: document.getElementById('p-crop-sold-kg')?.value !== '' ? parseFloat(document.getElementById('p-crop-sold-kg')?.value) || 0 : '',
      exp_last_year: document.getElementById('p-exp-last-year')?.value !== '' ? parseFloat(document.getElementById('p-exp-last-year')?.value) || 0 : '',
      actual_last_year: document.getElementById('p-actual-last-year')?.value !== '' ? parseFloat(document.getElementById('p-actual-last-year')?.value) || 0 : '',
      sold_ircc: document.getElementById('p-sold-ircc')?.value !== '' ? parseFloat(document.getElementById('p-sold-ircc')?.value) || 0 : '',
      seed_kept: document.getElementById('p-seed-kept')?.value !== '' ? parseFloat(document.getElementById('p-seed-kept')?.value) || 0 : '',
      consumed: document.getElementById('p-consumed')?.value !== '' ? parseFloat(document.getElementById('p-consumed')?.value) || 0 : '',
      inspection_notes: document.getElementById('p-inspection-notes')?.value.trim() || '',
      updated_at: new Date().toISOString()
    };
    saveICSStores();
  }

  function saveCurrentPostHarvestForm() {
    if (!selectedPlot) return;
    const farmerKey = getFarmerKey(selectedPlot);
    if (!farmersStore[farmerKey]) {
      farmersStore[farmerKey] = {
        farmer_key: farmerKey,
        family_id: selectedPlot.family_id,
        village: selectedPlot.village || '',
        site: selectedPlot.site || ''
      };
    }
    farmersStore[farmerKey].post_harvest = {
      saved: true,
      have_chamkar: document.getElementById('c-have-chamkar')?.value || '2',
      chamkar_num: document.getElementById('c-chamkar-num')?.value !== '' ? parseInt(document.getElementById('c-chamkar-num')?.value, 10) : null,
      chamkar_area: parseFloat(document.getElementById('c-chamkar-area')?.value) || 0,
      chamkar_crops: getChipValues('#c-chamkar-crops'),
      has_rice_barn: document.getElementById('c-rice-barn')?.value || '1',
      barn_chambers: document.getElementById('c-chambers')?.value !== '' ? parseInt(document.getElementById('c-chambers')?.value, 10) : null,
      barn_clean: document.getElementById('c-barn-clean')?.value || '1',
      barn_free_chemicals: document.getElementById('c-barn-chemicals')?.value || '1',
      cleared_forest: document.getElementById('c-clear-forest')?.value || '2',
      expanded_land: document.getElementById('c-expand-land')?.value || '2',
      burned_straw: document.getElementById('c-burn-straw')?.value || '2',
      firebreak_kept: document.getElementById('c-firebreak')?.value || '1',
      updated_at: new Date().toISOString()
    };
    saveICSStores();
  }

  function saveCurrentConfirmationForm() {
    if (!selectedPlot) return;
    const farmerKey = getFarmerKey(selectedPlot);
    if (!farmersStore[farmerKey]) {
      farmersStore[farmerKey] = {
        farmer_key: farmerKey,
        family_id: selectedPlot.family_id,
        village: selectedPlot.village || '',
        site: selectedPlot.site || ''
      };
    }
    const inspector = document.getElementById('c-inspector-name')?.value.trim() || '';
    if (inspector) sessionState.inspectorName = inspector;
    const sigData = getSignatureDataUrl();
    farmersStore[farmerKey].confirmation = {
      saved: true,
      certified_status: document.getElementById('c-certified-status')?.value || '1',
      conclusion_notes: document.getElementById('c-conclusion-notes')?.value.trim() || '',
      inspector_name: inspector,
      irpg_name: document.getElementById('c-irpg-name')?.value.trim() || '',
      signature_data: sigData,
      is_completed: true,
      completed_at: new Date().toISOString()
    };
    saveICSStores();
    if (selectedPlot) {
      updatePlotVisualStatus(selectedPlot.id);
    }
    refreshAllPlotStyles();
  }

  function saveCompleteRecord() {
    if (!selectedPlot) {
      showToast('⚠️ Please select a plot on the map first');
      return;
    }

    saveCurrentFarmerForm();
    saveCurrentPlotBaselineForm();
    if (currentInspectionPhase !== 'phase_1') {
      saveCurrentPostHarvestForm();
    }
    saveCurrentConfirmationForm();

    const farmerKey = getFarmerKey(selectedPlot);
    if (!farmersStore[farmerKey]) {
      farmersStore[farmerKey] = {};
    }
    if (!farmersStore[farmerKey].phases) {
      farmersStore[farmerKey].phases = {};
    }
    farmersStore[farmerKey].phases[currentInspectionPhase] = true;
    farmersStore[farmerKey].phases[`${currentInspectionPhase}_date`] = new Date().toISOString();
    saveICSStores();

    updatePhaseIndicatorsForSelectedPlot();

    const inspectionStatePill = document.getElementById('card-inspection-state-pill');
    if (inspectionStatePill) {
      if (!currentUser) {
        inspectionStatePill.className = 'sub-status-pill status-saved';
        inspectionStatePill.textContent = '🟢 Inspected';
      } else {
        inspectionStatePill.className = 'sub-status-pill status-saved';
        inspectionStatePill.textContent = '🟢 Saved Inspection Record';
      }
    }

    renderSubplotsListForSelectedPlot();
    refreshAllPlotStyles();

    const phaseLabels = {
      phase_1: 'Phase 1: Planting & Growing Baseline',
      phase_2: 'Phase 2: Harvest & Yield',
      phase_3: 'Phase 3: Post-Harvest & Conservation Audit'
    };
    const pLabel = phaseLabels[currentInspectionPhase] || currentInspectionPhase;
    showToast(`✅ Saved ${pLabel} for Family ${selectedPlot.family_id} (Plot ${selectedPlot.plot_id})`);

    // Asynchronously sync to backend database if online and authenticated
    if (currentUser && currentUser.token && navigator.onLine && !currentUser.token.startsWith('fallback-') && !currentUser.token.startsWith('offline-')) {
      const fRecord = farmersStore[farmerKey] || {};
      const inspRecord = icsInspections[selectedPlot.id] || {};
      const phaseEnumMap = {
        phase_1: 'phase_1_planting',
        phase_2: 'phase_2_harvest',
        phase_3: 'phase_3_post_harvest'
      };

      const payload = {
        season_code: currentSeason || "2026",
        farmer_id: fRecord.id || selectedPlot.family_id,
        parcel_id: String(selectedPlot.id),
        inspection_date: inspRecord.inspection_date || new Date().toISOString().slice(0, 10),
        inspection_phase: phaseEnumMap[currentInspectionPhase] || 'phase_1_planting',
        phase_1_completed: !!(fRecord.phases && fRecord.phases.phase_1),
        phase_2_completed: !!(fRecord.phases && fRecord.phases.phase_2),
        phase_3_completed: !!(fRecord.phases && fRecord.phases.phase_3),
        status: currentInspectionPhase === 'phase_3' ? 'completed' : 'in_progress',
        recommendation: (confStore[selectedPlot.id] && confStore[selectedPlot.id].certified_status === '2') ? 'conditional' : 'approved_organic',
        inspector_notes: confStore[selectedPlot.id] ? confStore[selectedPlot.id].conclusion_notes : '',
        farmer_profile: {
          total_members: parseInt(fRecord.members_count) || 1,
          school_age_children: parseInt(fRecord.school_count) || 0,
          has_latrine: fRecord.has_toilet === '1',
          has_disabled_members: fRecord.has_disabled === '1',
          num_cows: parseInt(fRecord.cattle_count) || 0,
          num_buffalos: parseInt(fRecord.buffalo_count) || 0,
          num_pigs: 0,
          has_daily_records_book: (fRecord.farm_records || []).includes('book'),
          trainings_received: fRecord.trainings || []
        }
      };

      fetch('/api/v1/inspections/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser.token}`
        },
        body: JSON.stringify(payload)
      }).then(r => {
        if (r.ok) {
          console.log('[Sync] Inspection successfully synced to backend for plot', selectedPlot.id);
        } else {
          r.json().then(e => console.warn('[Sync] Backend save warning:', e.detail));
        }
      }).catch(err => {
        console.warn('[Sync] Network error while saving to backend:', err);
      });
    }
  }

  function openSubplotInspectionModal(sp) {
    if (!sp) return;
    resetSubplotModalForm();
    editingSubplotInstance = sp;
    modalPlotRef.textContent = `Family ${sp.parent_family_id} · Plot ${sp.parent_plot_num} (${sp.parent_village || ''}) · Subplot ${sp.code}`;

    const spStatusPill = document.getElementById('subplot-modal-status-pill');
    if (spStatusPill) {
      spStatusPill.className = 'sub-status-pill status-saved';
      spStatusPill.textContent = '🟢 Saved Subplot Record';
    }

    subplotCode.value = sp.code || '';
    if (['Phka Rumduol', 'Red Jasmine', 'Local Variety', 'Sticky Rice', 'Other', 'Fallow'].includes(sp.variety)) {
      subplotVariety.value = sp.variety;
    } else if (sp.variety && sp.variety.toLowerCase().includes('local')) {
      subplotVariety.value = 'Local Variety';
    } else {
      subplotVariety.value = 'Other';
    }

    if (subplotVariety.value === 'Local Variety') {
      subplotCustomVariety.value = sp.local_variety_name || (sp.variety.includes('(') ? sp.variety.replace(/.*?\((.*?)\)/, '$1') : (sp.variety !== 'Local Variety' ? sp.variety : ''));
    } else {
      subplotCustomVariety.value = '';
    }

    updateSubplotFormConditionalFields();

    subplotAreaPct.value = sp.pct_of_parent !== undefined && sp.pct_of_parent !== null ? sp.pct_of_parent : '';
    subplotAreaHa.value = sp.area_ha !== undefined && sp.area_ha !== null ? sp.area_ha : '';

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

    // Extended ICS 2026 fields - load only if present in this subplot
    setVal('sp-seed-source', sp.seed_source || 'Own saved');
    setVal('sp-seed-kg', sp.seed_kg !== undefined && sp.seed_kg !== null ? sp.seed_kg : '');
    setVal('sp-planting-date', sp.planting_date || '');
    setVal('sp-planting-method', sp.planting_method || 'Direct seeding');
    setVal('sp-fertilizer-toggle', sp.fertilizer_applied ? 'yes' : 'no');
    const spFertBlock = document.getElementById('sp-fertilizer-block');
    if (spFertBlock) spFertBlock.style.display = sp.fertilizer_applied ? 'block' : 'none';
    setChipValues('#sp-fertilizer-chips', sp.fertilizer_types || []);
    setVal('sp-fertilizer-qty', sp.fertilizer_qty !== undefined && sp.fertilizer_qty !== null ? sp.fertilizer_qty : '');
    setVal('sp-fertilizer-date', sp.fertilizer_date || '');

    setVal('sp-protection-toggle', sp.crop_protection_applied ? 'yes' : 'no');
    const spProtBlock = document.getElementById('sp-protection-block');
    if (spProtBlock) spProtBlock.style.display = sp.crop_protection_applied ? 'block' : 'none';
    setVal('sp-protection-action', sp.protection_action || '');
    setVal('sp-protection-qty', sp.protection_qty !== undefined && sp.protection_qty !== null ? sp.protection_qty : '');
    setVal('sp-protection-date', sp.protection_date || '');

    setVal('sp-expected-yield', sp.expected_production_kg !== undefined && sp.expected_production_kg !== null ? sp.expected_production_kg : '');
    setVal('sp-expected-sale', sp.expected_sale_kg !== undefined && sp.expected_sale_kg !== null ? sp.expected_sale_kg : '');

    validateSubplotAllocation();
    subplotModal.style.display = 'flex';
  }

  // --- Dedicated Subplot Harvest Modal (1 Harvest Record per Subplot) ---
  function openSubplotHarvestModal(sp) {
    if (!sp) return;
    resetSubplotHarvestModalForm();
    editingHarvestSubplot = sp;
    const plotNum = sp.parent_plot_num || (selectedPlot ? selectedPlot.plot_id : '--');
    const famId = sp.parent_family_id || (selectedPlot ? selectedPlot.family_id : '--');
    const village = sp.parent_village || (selectedPlot ? selectedPlot.village : '');

    document.getElementById('harvest-modal-plot-ref').textContent = `Family ${famId} · Plot ${plotNum} (${village}) · Subplot ${sp.code}`;
    document.getElementById('harvest-modal-title').textContent = `🌾 Harvest: Subplot ${sp.code}`;
    document.getElementById('harvest-meta-variety').textContent = sp.variety || 'Rice';
    document.getElementById('harvest-meta-area').textContent = `${sp.area_ha} ha`;
    document.getElementById('harvest-meta-pct').textContent = `${sp.pct_of_parent || 0}%`;
    document.getElementById('harvest-meta-exp').textContent = sp.expected_production_kg ? `${parseFloat(sp.expected_production_kg).toLocaleString()} kg` : '-- kg';

    const h = sp.harvest || {};
    const isHarvestSaved = !!(h && h.saved);
    const hStatusPill = document.getElementById('harvest-modal-status-pill');
    if (hStatusPill) {
      if (isHarvestSaved) {
        hStatusPill.className = 'sub-status-pill status-saved';
        hStatusPill.textContent = '🟢 Saved Harvest Record';
      } else {
        hStatusPill.className = 'sub-status-pill status-blank';
        hStatusPill.textContent = '⚪ Blank Form (Not Harvested)';
      }
    }

    if (isHarvestSaved) {
      setVal('sh-complete', h.complete || '1');
      setVal('sh-reason-no', h.reason_no || 'Not mature');
      setVal('sh-date', h.date || '');
      setVal('sh-method', h.method || '3');
      setVal('sh-owner', h.owner || '');
      setVal('sh-flush', h.flush_qty !== undefined ? h.flush_qty : 0);
      setVal('sh-dry-loc', h.dry_loc || '1');
      setVal('sh-payment-type', h.payment_type || '1');
      setVal('sh-payment-amount', h.payment_amount || '');
      setVal('sh-actual-kg', h.actual_kg !== undefined && h.actual_kg !== null ? h.actual_kg : '');
      setVal('sh-sale-kg', h.sale_kg !== undefined && h.sale_kg !== null ? h.sale_kg : '');
      setVal('sh-consume-kg', h.consume_kg !== undefined && h.consume_kg !== null ? h.consume_kg : '');
      setVal('sh-seed-kg', h.seed_kg !== undefined && h.seed_kg !== null ? h.seed_kg : '');
    }

    // Trigger state changes
    const isDone = (document.getElementById('sh-complete')?.value || '1') === '1';
    const blkInc = document.getElementById('sh-incomplete-block');
    const blkComp = document.getElementById('sh-complete-block');
    if (blkInc) blkInc.style.display = isDone ? 'none' : 'block';
    if (blkComp) blkComp.style.display = isDone ? 'block' : 'none';

    const methodVal = document.getElementById('sh-method')?.value || '3';
    const isMachine = methodVal === '2' || methodVal === '3';
    const blkMachine = document.getElementById('sh-machine-block');
    if (blkMachine) blkMachine.style.display = isMachine ? 'flex' : 'none';

    updateSubplotHarvestBalance();
    subplotHarvestModal.style.display = 'flex';
  }

  function onSubplotHarvestSubmit(e) {
    e.preventDefault();
    if (!editingHarvestSubplot) return;

    const complete = document.getElementById('sh-complete')?.value || '1';
    const actual = parseFloat(document.getElementById('sh-actual-kg')?.value) || 0;
    const sale = parseFloat(document.getElementById('sh-sale-kg')?.value) || 0;
    const consume = parseFloat(document.getElementById('sh-consume-kg')?.value) || 0;
    const seed = parseFloat(document.getElementById('sh-seed-kg')?.value) || 0;

    editingHarvestSubplot.harvest = {
      saved: true,
      complete: complete,
      reason_no: document.getElementById('sh-reason-no')?.value || '',
      date: document.getElementById('sh-date')?.value || '',
      method: document.getElementById('sh-method')?.value || '3',
      owner: document.getElementById('sh-owner')?.value.trim() || '',
      flush_qty: parseFloat(document.getElementById('sh-flush')?.value) || 0,
      dry_loc: document.getElementById('sh-dry-loc')?.value || '1',
      payment_type: document.getElementById('sh-payment-type')?.value || '1',
      payment_amount: parseFloat(document.getElementById('sh-payment-amount')?.value) || 0,
      actual_kg: actual,
      sale_kg: sale,
      consume_kg: consume,
      seed_kg: seed,
      recorded_at: new Date().toISOString()
    };

    // Update in subplots array
    const idx = subplots.findIndex((s) => s.id === editingHarvestSubplot.id);
    if (idx !== -1) {
      subplots[idx] = editingHarvestSubplot;
    }

    saveStoredSubplots();
    renderSubplotsListForSelectedPlot();
    updateParcelHarvestSummary();
    subplotHarvestModal.style.display = 'none';
    resetSubplotHarvestModalForm();
    showToast(`🌾 Saved harvest record for ${editingHarvestSubplot.code} (${actual.toLocaleString()} kg)`);
  }

  function buildSubplotCardBadges(sp) {
    let badges = '';
    if (sp.inspected || sp.seed_source || sp.fertilizer_applied) {
      badges += `<span class="insp-badge insp-badge-done">✓ Inspected</span>`;
    }
    if (sp.harvest && sp.harvest.complete === '1' && sp.harvest.actual_kg > 0) {
      badges += `<span class="insp-badge insp-badge-harvest">🌾 Harvest: ${sp.harvest.actual_kg.toLocaleString()} kg</span>`;
    } else if (sp.harvest && sp.harvest.complete === '2') {
      badges += `<span class="insp-badge insp-badge-pending">⏳ Threshing Pending</span>`;
    } else {
      badges += `<span class="insp-badge insp-badge-pending">⏳ Harvest Pending</span>`;
    }
    return badges;
  }

  // --- Export ICS 2026 CSV (Hierarchy: Farmer -> Parcel -> Subplot -> Harvest) ---
  function exportICSCsv() {
    const targetFarmerKey = selectedPlot ? getFarmerKey(selectedPlot) : null;
    const targetFid = selectedPlot ? selectedPlot.family_id : null;
    const targetVillage = selectedPlot ? (selectedPlot.village || '') : '';
    const season = sessionState.seasonYear;

    // Determine farmer keys to export.
    // If an inspector is viewing a plot, export for that specific farmer (Village + Family ID).
    // Otherwise, export all recorded farmers.
    let farmerKeys = [];
    if (targetFarmerKey) {
      farmerKeys = [targetFarmerKey];
    } else {
      farmerKeys = Array.from(new Set([
        ...Object.keys(farmersStore),
        ...allFeatures.map((ft) => getFarmerKey(ft.properties)).filter(Boolean)
      ]));
    }

    if (farmerKeys.length === 0) {
      showToast('⚠️ No inspection records or farmer selected to export.');
      return;
    }

    const rows = [];
    rows.push([
      'season_year', 'site', 'village', 'commune', 'family_id', 'farmer_name', 'gender', 'ethnicity',
      'interviewee_head', 'interviewee_name', 'farmer_status', 'compliance_status', 'trainings_attended', 'members_count', 'children_school',
      'toilet', 'disability', 'livestock_cow', 'livestock_buffalo',
      'plot_id', 'plot_area_ha', 'land_organic_status', 'land_situation', 'irrigation', 'contamination_risk', 'mitigation_method',
      'prohibited_used_3yr', 'prohibited_types', 'intercrop_present', 'intercrop_name', 'intercrop_plant_date', 'intercrop_harvest_date', 'intercrop_actual_kg', 'intercrop_sold_kg',
      'exp_last_yr_kg', 'actual_last_yr_kg', 'sold_ircc_last_yr_kg',
      'subplot_id', 'subplot_name', 'variety', 'subplot_pct', 'subplot_ha',
      'seed_source', 'seed_kg', 'planting_date', 'planting_method',
      'fert_applied', 'fert_types', 'fert_qty_kg', 'crop_protection_applied', 'protection_action',
      'expected_harvest_kg', 'expected_sale_kg',
      'thresh_complete', 'thresh_date', 'thresh_method', 'machine_contractor', 'organic_flush_kg',
      'drying_location', 'actual_harvest_kg', 'for_sale_kg', 'household_kg', 'seed_kept_kg',
      'thresh_payment_mode', 'thresh_payment_amount',
      'has_chamkar', 'chamkar_num', 'chamkar_area_ha', 'chamkar_crops',
      'has_rice_barn', 'barn_chambers', 'barn_clean', 'barn_free_chemicals',
      'forest_cleared', 'boundary_expanded', 'burned_straw', 'firebreak_kept',
      'final_recommendation', 'inspector_notes', 'inspector_name', 'village_rep', 'has_signature', 'export_timestamp'
    ].join(','));

    farmerKeys.forEach((fKey) => {
      const f = farmersStore[fKey] || {};
      const ph = f.post_harvest || {};
      const conf = f.confirmation || {};

      // Retrieve all registered parcels for this family strictly in the same village
      let parcels = allFeatures
        .filter((ft) => ft.properties && getFarmerKey(ft.properties) === fKey)
        .map((ft) => ft.properties);

      if (parcels.length === 0) {
        if (selectedPlot && getFarmerKey(selectedPlot) === fKey) {
          parcels = [selectedPlot];
        } else {
          const famSubplots = subplots.filter((s) => s.parent_farmer_key === fKey || s.parent_family_id === f.family_id);
          const pMap = {};
          famSubplots.forEach((s) => {
            if (!pMap[s.parent_plot_id]) {
              pMap[s.parent_plot_id] = {
                id: s.parent_plot_id,
                plot_id: s.parent_plot_num,
                area_ha: s.parent_area_ha,
                site: s.parent_site,
                village: s.parent_village,
                family_id: s.parent_family_id
              };
            }
          });
          parcels = Object.values(pMap);
        }
      }

      if (parcels.length === 0) {
        parcels = [{ id: 'N/A', plot_id: 'N/A', area_ha: 0, site: '', village: f.village || '', family_id: f.family_id || '' }];
      }

      parcels.forEach((parcel) => {
        const pId = parcel.id || parcel.plot_id;
        const pNum = parcel.plot_id;
        const insp = icsInspections[pId] || {};
        const pSite = parcel.site || '';
        const pVillage = parcel.village || f.village || '';
        const pCommune = parcel.commune || '';
        const pArea = parcel.area_ha || insp.area_ha || '';
        const fid = parcel.family_id || f.family_id || '';

        // Retrieve all subplots for this parcel
        const pSubplots = subplots.filter(
          (sp) => sp.parent_plot_id === pId || (pNum && String(sp.parent_plot_num) === String(pNum))
        );

        if (pSubplots.length > 0) {
          // Output 1 row per subplot with its harvest record
          pSubplots.forEach((sp) => {
            const h = sp.harvest || {};
            const row = [
              season,
              csvQ(pSite || sp.parent_site), csvQ(pVillage || sp.parent_village), csvQ(pCommune),
              csvQ(fid), csvQ(f.hoh_name || ''), csvQ(f.hoh_sex || '1'), csvQ(f.ethnicity || '1'),
              csvQ(f.is_head_interviewee || '1'), csvQ(f.interviewee_name || ''), csvQ(f.status || 'Existing'),
              csvQ(f.farmer_compliant || 'Compliance'), csvQ((f.trainings || []).join('; ')), f.members_count || 4, f.school_count || 2,
              csvQ(f.has_toilet || '1'), csvQ(f.has_disabled || '2'), f.cattle_count || 0, f.buffalo_count || 0,
              csvQ(pNum), pArea, csvQ(insp.land_status || parcel.organic_status || ''), csvQ(insp.land_situation || '1'), csvQ(insp.irrigation || '1'),
              csvQ(insp.contamination || '2'), csvQ(insp.avoid_method || ''),
              csvQ(insp.last_prohibited || '2'), csvQ((insp.prohibited_inputs || []).join('; ')),
              csvQ(insp.other_crop === '1' ? 'Yes' : 'No'), csvQ(insp.crop_name || ''),
              csvQ(insp.crop_plant_date || ''), csvQ(insp.crop_harvest_date || ''),
              insp.crop_actual_kg !== undefined && insp.crop_actual_kg !== null ? insp.crop_actual_kg : '',
              insp.crop_sold_kg !== undefined && insp.crop_sold_kg !== null ? insp.crop_sold_kg : '',
              insp.exp_last_year || '', insp.actual_last_year || '', insp.sold_ircc || '',
              csvQ(sp.id), csvQ(sp.code), csvQ(sp.variety === 'Local Variety' && sp.local_variety_name ? `Local: ${sp.local_variety_name}` : sp.variety), sp.pct_of_parent || '', sp.area_ha || '',
              csvQ(sp.seed_source || 'Own saved'), sp.seed_kg || '', csvQ(sp.planting_date || ''), csvQ(sp.planting_method || 'Direct seeding'),
              sp.fertilizer_applied ? 'Yes' : 'No', csvQ((sp.fertilizer_types || []).join('; ')), sp.fertilizer_qty || '',
              sp.crop_protection_applied ? 'Yes' : 'No', csvQ(sp.protection_action || ''),
              sp.expected_production_kg || '', sp.expected_sale_kg || '',
              csvQ(h.complete || '1'), csvQ(h.date || ''), csvQ(h.method || '3'),
              csvQ(h.owner || ''), h.flush_qty || 0, csvQ(h.dry_loc || '1'),
              h.actual_kg || '', h.sale_kg || '', h.consume_kg || '', h.seed_kg || '',
              csvQ(h.payment_type || '1'), h.payment_amount || '',
              csvQ(ph.have_chamkar || '2'), ph.chamkar_num || '', ph.chamkar_area || '', csvQ((ph.chamkar_crops || []).join('; ')),
              csvQ(ph.has_rice_barn || '1'), ph.barn_chambers || '', csvQ(ph.barn_clean || '1'), csvQ(ph.barn_free_chemicals || '1'),
              csvQ(ph.cleared_forest || '2'), csvQ(ph.expanded_land || '2'), csvQ(ph.burned_straw || '2'), csvQ(ph.firebreak_kept || '1'),
              csvQ(conf.certified_status || '1'), csvQ(conf.conclusion_notes || ''), csvQ(conf.inspector_name || sessionState.inspectorName), csvQ(conf.irpg_name || ''),
              conf.signature_data ? 'Yes' : 'No',
              new Date().toISOString()
            ];
            rows.push(row.join(','));
          });
        } else {
          // Output 1 row for the parcel baseline (if no subplots drawn yet)
          const row = [
            season,
            csvQ(pSite), csvQ(pVillage), csvQ(pCommune),
            csvQ(fid), csvQ(f.hoh_name || ''), csvQ(f.hoh_sex || '1'), csvQ(f.ethnicity || '1'),
            csvQ(f.is_head_interviewee || '1'), csvQ(f.interviewee_name || ''), csvQ(f.status || 'Existing'),
            csvQ(f.farmer_compliant || 'Compliance'), csvQ((f.trainings || []).join('; ')), f.members_count || 4, f.school_count || 2,
            csvQ(f.has_toilet || '1'), csvQ(f.has_disabled || '2'), f.cattle_count || 0, f.buffalo_count || 0,
            csvQ(pNum), pArea, csvQ(insp.land_status || parcel.organic_status || ''), csvQ(insp.land_situation || '1'), csvQ(insp.irrigation || '1'),
            csvQ(insp.contamination || '2'), csvQ(insp.avoid_method || ''),
            csvQ(insp.last_prohibited || '2'), csvQ((insp.prohibited_inputs || []).join('; ')),
            csvQ(insp.other_crop === '1' ? 'Yes' : 'No'), csvQ(insp.crop_name || ''),
            csvQ(insp.crop_plant_date || ''), csvQ(insp.crop_harvest_date || ''),
            insp.crop_actual_kg !== undefined && insp.crop_actual_kg !== null ? insp.crop_actual_kg : '',
            insp.crop_sold_kg !== undefined && insp.crop_sold_kg !== null ? insp.crop_sold_kg : '',
            insp.exp_last_year || '', insp.actual_last_year || '', insp.sold_ircc || '',
            '', 'Main Plot (Whole)', 'Whole Plot', '100', pArea,
            '', '', '', '',
            'No', '', '', 'No', '',
            '', '',
            '', '', '', '', 0, '', '', '', '', '',
            '', '',
            csvQ(ph.have_chamkar || '2'), ph.chamkar_num || '', ph.chamkar_area || '', csvQ((ph.chamkar_crops || []).join('; ')),
            csvQ(ph.has_rice_barn || '1'), ph.barn_chambers || '', csvQ(ph.barn_clean || '1'), csvQ(ph.barn_free_chemicals || '1'),
            csvQ(ph.cleared_forest || '2'), csvQ(ph.expanded_land || '2'), csvQ(ph.burned_straw || '2'), csvQ(ph.firebreak_kept || '1'),
            csvQ(conf.certified_status || '1'), csvQ(conf.conclusion_notes || ''), csvQ(conf.inspector_name || sessionState.inspectorName), csvQ(conf.irpg_name || ''),
            conf.signature_data ? 'Yes' : 'No',
            new Date().toISOString()
          ];
          rows.push(row.join(','));
        }
      });
    });

    if (rows.length <= 1) {
      showToast('⚠️ No records found to export.');
      return;
    }

    const csv = rows.join('\r\n');
    const filename = (targetVillage && targetFid)
      ? `ibis_inspection_${targetVillage.replace(/[^a-zA-Z0-9_-]/g, '_')}_${targetFid}_${season}_${new Date().toISOString().slice(0, 10)}.csv`
      : `ibis_ics_2026_report_${season}_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadBlob(csv, filename, 'text/csv');
    showToast(`✅ Exported inspection file for ${targetVillage ? targetVillage + ' · ' : ''}Family ${targetFid || 'All'} (${rows.length - 1} record(s))`);
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

  // ==========================================================
  // UNIFIED ROLE-BASED AUTHENTICATION & PROGRESSIVE DISCLOSURE
  // ==========================================================
  let currentUser = null; // null => 'public' (no login) | { role, full_name, email, token, user_id }

  async function initAuthSession() {
    try {
      const stored = localStorage.getItem('ibis_auth_user');
      if (stored) {
        currentUser = JSON.parse(stored);
        if (currentUser && currentUser.token && !currentUser.token.startsWith('fallback-') && !currentUser.token.startsWith('offline-')) {
          // Validate token with backend /me endpoint
          try {
            const resp = await fetch('/api/v1/auth/me', {
              headers: { 'Authorization': `Bearer ${currentUser.token}` }
            });
            if (resp.ok) {
              const freshUser = await resp.json();
              currentUser = {
                ...currentUser,
                full_name: freshUser.full_name || currentUser.full_name,
                role: freshUser.role || currentUser.role,
                assigned_landscapes: freshUser.assigned_landscapes || [],
                assigned_villages: freshUser.assigned_villages || []
              };
              localStorage.setItem('ibis_auth_user', JSON.stringify(currentUser));
            } else if (resp.status === 401 || resp.status === 403) {
              console.warn('[Auth] Stored session expired or invalid. Reverting to public mode.');
              currentUser = null;
              localStorage.removeItem('ibis_auth_user');
            }
          } catch (netErr) {
            console.warn('[Auth] Backend unreachable during session verification, keeping cached session.');
          }
        }
      }
    } catch (e) {
      currentUser = null;
    }
    applyUserTerritoryFilter(true);
    updateAuthUI();
  }

  function updateAuthUI() {
    const role = currentUser ? currentUser.role : 'public';
    document.body.className = `role-${role}`;

    const btnOpenAuth = document.getElementById('btn-open-auth');
    const authBtnLabel = document.getElementById('auth-btn-label');
    const userProfileMenu = document.getElementById('user-profile-menu');
    const userDisplayName = document.getElementById('user-display-name');
    const userDisplayRole = document.getElementById('user-display-role');
    const btnAnnualGis = document.getElementById('btn-annual-gis');
    const menuBtnGis = document.getElementById('menu-btn-gis');
    const btnExportAll = document.getElementById('btn-export-all');

    const drawerTabBar = document.getElementById('drawer-tab-bar');
    const drawerScrollBody = document.getElementById('drawer-scrollable-body');

    const mapStatusLegend = document.getElementById('map-status-legend');
    const seasonSelectorWrapper = document.getElementById('season-selector-wrapper');
    const traceStatusBadge = document.getElementById('traceability-status-badge');
    const traceOriginCard = document.getElementById('traceability-origin-card');

    // Inspector Sidebar Elements
    const inspectorSidebar = document.getElementById('inspector-sidebar');
    const btnFloatingInspectorMenu = document.getElementById('btn-floating-inspector-menu');
    const sidebarOfficerName = document.getElementById('sidebar-officer-name');
    const sidebarOfficerRole = document.getElementById('sidebar-officer-role');
    const sidebarSyncPill = document.getElementById('sidebar-sync-pill');
    const btnSidebarGis = document.getElementById('btn-sidebar-gis');
    const sidebarSeasonSelect = document.getElementById('sidebar-season-select');
    const sidebarSeasonIndicator = document.getElementById('sidebar-kpi-season');

    if (!currentUser) {
      // Public / General User Mode
      if (authBtnLabel) authBtnLabel.textContent = 'Sign In';
      if (btnOpenAuth) {
        btnOpenAuth.title = 'Sign In (Field Staff & Admin)';
        btnOpenAuth.classList.remove('logged-in');
      }
      if (userProfileMenu) userProfileMenu.style.display = 'none';
      if (btnAnnualGis) btnAnnualGis.style.display = 'none';
      if (menuBtnGis) menuBtnGis.style.display = 'none';
      if (btnExportAll) btnExportAll.style.display = 'none';

      // Hide inspection legend & season selector for general users
      if (mapStatusLegend) mapStatusLegend.style.display = 'none';
      if (seasonSelectorWrapper) seasonSelectorWrapper.style.display = 'none';
      if (traceStatusBadge) traceStatusBadge.style.display = 'none';

      // Show Traceability & Origin Card for general public visitors
      if (traceOriginCard) traceOriginCard.style.display = 'block';

      // Hide inspector sidebar and floating menu in public mode
      if (inspectorSidebar) inspectorSidebar.style.display = 'none';
      if (btnFloatingInspectorMenu) btnFloatingInspectorMenu.style.display = 'none';

      // Hide inspection tabs from public view
      if (drawerTabBar) drawerTabBar.style.display = 'none';
      if (drawerScrollBody) drawerScrollBody.style.display = 'none';

      const inspectionStatePill = document.getElementById('card-inspection-state-pill');
      if (inspectionStatePill) {
        inspectionStatePill.className = 'sub-status-pill status-saved';
        inspectionStatePill.textContent = '🟢 Inspected';
      }
    } else {
      // Authenticated Staff / Management Mode
      const displayName = currentUser.full_name || currentUser.email || 'Staff Officer';
      if (authBtnLabel) authBtnLabel.textContent = displayName.split(' ')[0];
      if (btnOpenAuth) {
        btnOpenAuth.title = `Signed in as ${displayName} (${currentUser.role})`;
        btnOpenAuth.classList.add('logged-in');
      }
      if (userDisplayName) userDisplayName.textContent = displayName;
      if (userDisplayRole) {
        userDisplayRole.textContent = currentUser.role === 'admin' ? 'Administrator' : 'Field Inspector';
        userDisplayRole.className = `user-role-badge role-badge-${currentUser.role}`;
      }

      // Show Export Data button for authenticated staff
      if (btnExportAll) btnExportAll.style.display = 'flex';

      // Show inspection legend & season selector for authenticated staff
      if (mapStatusLegend) mapStatusLegend.style.display = 'block';
      if (seasonSelectorWrapper) seasonSelectorWrapper.style.display = 'flex';
      if (traceStatusBadge) traceStatusBadge.style.display = 'inline-block';

      // Hide Traceability & Marketing Card for field inspectors & admins (clean workflow focused)
      if (traceOriginCard) traceOriginCard.style.display = 'none';

      // Unlock Annual GIS Update & Admin Workspace for Admin
      const btnSidebarAdmin = document.getElementById('btn-sidebar-admin-workspace');
      if (currentUser.role === 'admin') {
        if (btnAnnualGis) btnAnnualGis.style.display = 'flex';
        if (menuBtnGis) menuBtnGis.style.display = 'flex';
        if (btnSidebarGis) btnSidebarGis.style.display = 'flex';
        if (btnSidebarAdmin) btnSidebarAdmin.style.display = 'flex';
      } else {
        if (btnAnnualGis) btnAnnualGis.style.display = 'none';
        if (menuBtnGis) menuBtnGis.style.display = 'none';
        if (btnSidebarGis) btnSidebarGis.style.display = 'none';
        if (btnSidebarAdmin) btnSidebarAdmin.style.display = 'none';
      }

      // Show Inspector Sidebar in field inspector mode
      if (inspectorSidebar) {
        inspectorSidebar.style.display = 'flex';
        inspectorSidebar.classList.remove('collapsed');
      }
      if (btnFloatingInspectorMenu) {
        btnFloatingInspectorMenu.style.display = 'none';
        const floatingIcon = document.getElementById('floating-menu-icon');
        if (floatingIcon) {
          floatingIcon.textContent = '☰';
        }
        btnFloatingInspectorMenu.title = currentUser.role === 'admin' ? 'Expand System Administration Panel' : 'Expand Inspector Tools Panel';
      }
      if (sidebarOfficerName) {
        let cleanName = displayName;
        if (cleanName.includes('IRCC System Administrator') || cleanName.includes('IRCC Administrator') || cleanName.includes('IRCC System Administration')) {
          cleanName = 'System Administrator';
        }
        sidebarOfficerName.textContent = cleanName;
      }
      if (sidebarOfficerRole) {
        sidebarOfficerRole.textContent = currentUser.role === 'admin' ? 'Administrator' : 'Field Inspector';
      }
      if (sidebarSyncPill) {
        sidebarSyncPill.textContent = navigator.onLine ? '🟢 Online' : '🟡 Offline Mode';
      }
      if (sidebarSeasonSelect) {
        sidebarSeasonSelect.value = currentSeason;
      }
      if (sidebarSeasonIndicator) {
        sidebarSeasonIndicator.textContent = currentSeason;
      }

      // Sync Current Plot dock in sidebar with selectedPlot state
      const sidebarSelectedPlotBox = document.getElementById('sidebar-selected-plot-box');
      if (sidebarSelectedPlotBox) {
        sidebarSelectedPlotBox.style.display = selectedPlot ? 'block' : 'none';
      }

      // Show inspection editor tabs
      if (drawerTabBar) drawerTabBar.style.display = 'flex';
      if (drawerScrollBody) drawerScrollBody.style.display = 'block';
    }

    // Refresh plot styles on map (public organic green vs staff inspection status colors)
    refreshAllPlotStyles();

    // Ensure Leaflet resizes properly to the newly available screen
    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 150);
  }

  function setAuthUser(userObj) {
    const isLogout = !userObj;
    currentUser = userObj;
    try {
      if (userObj) {
        localStorage.setItem('ibis_auth_user', JSON.stringify(userObj));
      } else {
        localStorage.removeItem('ibis_auth_user');
      }
    } catch(e) {}

    // Immediately close authentication modal & clear inputs on any sign-in / sign-out
    if (modalAuth) modalAuth.style.display = 'none';
    if (authPinInput) authPinInput.value = '';
    if (authPasswordInput) authPasswordInput.value = '';

    // ALWAYS start with a clean, unselected plot state on login / user change / logout
    if (plotDrawer) plotDrawer.classList.add('closed');
    const modalAdminWorkspace = document.getElementById('modal-admin-workspace');
    if (modalAdminWorkspace) modalAdminWorkspace.style.display = 'none';
    const modalAdminGis = document.getElementById('modal-admin-gis');
    if (modalAdminGis) modalAdminGis.style.display = 'none';
    if (subplotModal) subplotModal.style.display = 'none';
    if (subplotHarvestModal) subplotHarvestModal.style.display = 'none';

    // Cancel drawing session if active
    if (isDrawingSubplot) {
      cancelSubplotDrawing();
    }

    // Unselect active plot & clear highlights completely FIRST
    selectedLayer = null;
    selectedPlot = null;
    resetAllInspectionForms();

    // Reset all filter panel dropdowns & search inputs on logout
    if (isLogout) {
      if (quickSearchInput) quickSearchInput.value = '';
      const sidebarSearchInput = document.getElementById('sidebar-search-input');
      if (sidebarSearchInput) sidebarSearchInput.value = '';
      if (searchSuggestions) searchSuggestions.style.display = 'none';

      if (filterSite) {
        filterSite.value = '';
        try { onSiteChanged(); } catch (e) {}
      }
      if (filterPanel) filterPanel.classList.add('closed');
      if (btnToggleFilters) btnToggleFilters.classList.remove('active');
    }

    // Hide sidebar Current Plot dock on login / logout
    const sidebarSelectedPlotBox = document.getElementById('sidebar-selected-plot-box');
    if (sidebarSelectedPlotBox) sidebarSelectedPlotBox.style.display = 'none';

    // Apply territory filter (restores all 6,427 plots when currentUser is null)
    applyUserTerritoryFilter(true);
    updateAuthUI();

    // Immediately adjust Leaflet size and smoothly reset map camera to full nationwide bounds
    if (isLogout && map) {
      map.invalidateSize();
      if (geojsonLayer && typeof geojsonLayer.getBounds === 'function') {
        try {
          const bounds = geojsonLayer.getBounds();
          if (bounds && bounds.isValid()) {
            map.flyToBounds(bounds, { padding: [30, 30], maxZoom: 14, duration: 0.5 });
          } else {
            map.setView([13.7, 105.8], 8, { animate: false });
          }
        } catch (e) {
          map.setView([13.7, 105.8], 8, { animate: false });
        }
      } else {
        map.setView([13.7, 105.8], 8, { animate: false });
      }
      showToast('🚪 Signed out. General User view restored.');
    }
  }

  // --- Auth Modal & Handlers ---
  const modalAuth = document.getElementById('modal-auth');
  const btnOpenAuth = document.getElementById('btn-open-auth');
  const userProfileMenu = document.getElementById('user-profile-menu');
  const btnCloseAuthModal = document.getElementById('btn-close-auth-modal');
  const btnCancelAuthPin = document.getElementById('btn-cancel-auth-pin');
  const btnCancelAuthPwd = document.getElementById('btn-cancel-auth-pwd');

  const tabBtnPin = document.getElementById('tab-btn-pin');
  const tabBtnPwd = document.getElementById('tab-btn-pwd');
  const formAuthPin = document.getElementById('form-auth-pin');
  const formAuthPwd = document.getElementById('form-auth-pwd');
  const authPinInput = document.getElementById('auth-pin-input');
  const authEmailInput = document.getElementById('auth-email-input');
  const authPasswordInput = document.getElementById('auth-password-input');

  const btnDemoInspector = document.getElementById('btn-demo-inspector');
  const btnDemoAdmin = document.getElementById('btn-demo-admin');
  const menuBtnSignout = document.getElementById('menu-btn-signout');

  function openAuthModal() {
    if (userProfileMenu) userProfileMenu.style.display = 'none';
    if (modalAuth) {
      modalAuth.style.display = 'flex';
      if (authPinInput) {
        authPinInput.value = '';
        setTimeout(() => authPinInput.focus(), 150);
      }
    }
  }

  function closeAuthModal() {
    if (modalAuth) modalAuth.style.display = 'none';
  }

  if (btnOpenAuth) {
    btnOpenAuth.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!currentUser) {
        openAuthModal();
      } else {
        // Toggle profile menu
        if (userProfileMenu) {
          const isShown = userProfileMenu.style.display === 'block';
          userProfileMenu.style.display = isShown ? 'none' : 'block';
        }
      }
    });
  }

  // Close profile menu on outside click
  document.addEventListener('click', (e) => {
    if (userProfileMenu && !userProfileMenu.contains(e.target) && e.target !== btnOpenAuth) {
      userProfileMenu.style.display = 'none';
    }
  });

  if (btnCloseAuthModal) btnCloseAuthModal.addEventListener('click', closeAuthModal);
  if (btnCancelAuthPin) btnCancelAuthPin.addEventListener('click', closeAuthModal);
  if (btnCancelAuthPwd) btnCancelAuthPwd.addEventListener('click', closeAuthModal);

  // Tab switching
  if (tabBtnPin && tabBtnPwd) {
    tabBtnPin.addEventListener('click', () => {
      tabBtnPin.classList.add('active');
      tabBtnPwd.classList.remove('active');
      if (formAuthPin) formAuthPin.style.display = 'block';
      if (formAuthPwd) formAuthPwd.style.display = 'none';
      if (authPinInput) authPinInput.focus();
    });

    tabBtnPwd.addEventListener('click', () => {
      tabBtnPwd.classList.add('active');
      tabBtnPin.classList.remove('active');
      if (formAuthPwd) formAuthPwd.style.display = 'block';
      if (formAuthPin) formAuthPin.style.display = 'none';
      if (authEmailInput) authEmailInput.focus();
    });
  }

  // Quick Demo Access Buttons (Connects to backend for genuine cryptographic tokens)
  if (btnDemoInspector) {
    btnDemoInspector.addEventListener('click', async () => {
      try {
        const resp = await fetch('/api/v1/auth/pin-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: '1234', role: 'inspector' })
        });
        if (resp.ok) {
          const data = await resp.json();
          setAuthUser({
            role: data.role || 'inspector',
            full_name: data.full_name || 'Inspector Sok Chea',
            email: 'inspector@ibisrice.com',
            user_id: data.user_id,
            token: data.access_token,
            assigned_landscapes: data.assigned_landscapes || ['Keo Seima'],
            assigned_villages: data.assigned_villages || []
          });
          closeAuthModal();
          showToast('🧑‍🌾 Signed in as Field Inspector (Assigned: Keo Seima)');
          return;
        }
      } catch (err) {}
      // Fallback
      setAuthUser({
        role: 'inspector',
        full_name: 'Inspector Sok Chea',
        email: 'inspector@ibisrice.com',
        user_id: 'insp-demo-01',
        token: 'fallback-inspector-token',
        assigned_landscapes: ['Keo Seima'],
        assigned_villages: []
      });
      closeAuthModal();
      showToast('🧑‍🌾 Signed in as Field Inspector (Assigned: Keo Seima)');
    });
  }

  if (btnDemoAdmin) {
    btnDemoAdmin.addEventListener('click', async () => {
      try {
        const resp = await fetch('/api/v1/auth/pin-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin: '9999', role: 'admin' })
        });
        if (resp.ok) {
          const data = await resp.json();
          setAuthUser({
            role: data.role || 'admin',
            full_name: (data.full_name && !data.full_name.includes('IRCC')) ? data.full_name : 'System Administrator',
            email: 'admin@ibisrice.com',
            user_id: data.user_id,
            token: data.access_token,
            assigned_landscapes: [],
            assigned_villages: []
          });
          closeAuthModal();
          showToast('🛡️ Signed in as System Administrator (Nationwide)');
          return;
        }
      } catch (err) {}
      // Fallback
      setAuthUser({
        role: 'admin',
        full_name: 'System Administrator',
        email: 'admin@ibisrice.com',
        user_id: 'admin-demo-01',
        token: 'fallback-admin-token',
        assigned_landscapes: [],
        assigned_villages: []
      });
      closeAuthModal();
      showToast('🛡️ Signed in as System Administrator (Nationwide)');
    });
  }

  // PIN Form Submit
  if (formAuthPin) {
    formAuthPin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pin = authPinInput ? authPinInput.value.trim() : '';
      if (!pin) {
        showToast('Please enter your 4-digit PIN');
        return;
      }

      // Fast PIN login API check
      try {
        const resp = await fetch('/api/v1/auth/pin-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin })
        });
        if (resp.ok) {
          const data = await resp.json();
          setAuthUser({
            role: data.role || 'inspector',
            full_name: data.full_name || 'Field Officer',
            email: data.role === 'admin' ? 'admin@ibisrice.com' : 'inspector@ibisrice.com',
            user_id: data.user_id,
            token: data.access_token,
            assigned_landscapes: data.assigned_landscapes || [],
            assigned_villages: data.assigned_villages || []
          });
          closeAuthModal();
          showToast(`✅ Welcome back, ${data.full_name}`);
          return;
        } else {
          const err = await resp.json().catch(() => ({}));
          showToast(`❌ ${err.detail || 'Incorrect PIN code'}`);
          return;
        }
      } catch (err) {
        // Fallback for offline PIN unlock in remote protected zones
        if (pin === '1234') {
          setAuthUser({
            role: 'inspector',
            full_name: 'Inspector Sok Chea (Offline)',
            email: 'inspector@ibisrice.com',
            user_id: 'offline-inspector',
            token: 'offline-token',
            assigned_landscapes: ['Keo Seima'],
            assigned_villages: []
          });
          closeAuthModal();
          showToast('⚡ Offline Field Session Unlocked (Assigned: Keo Seima)');
          return;
        } else if (pin === '9999') {
          setAuthUser({
            role: 'admin',
            full_name: 'System Administrator (Offline)',
            email: 'admin@ibisrice.com',
            user_id: 'offline-admin',
            token: 'offline-admin-token',
            assigned_landscapes: [],
            assigned_villages: []
          });
          closeAuthModal();
          showToast('⚡ Offline Admin Session Unlocked (Nationwide)');
          return;
        }
      }

      showToast('❌ Incorrect PIN. Inspector: 1234 | Admin: 9999');
    });
  }

  // Password Form Submit
  if (formAuthPwd) {
    formAuthPwd.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = authEmailInput ? authEmailInput.value.trim() : '';
      const password = authPasswordInput ? authPasswordInput.value : '';
      
      try {
        const resp = await fetch('/api/v1/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        if (resp.ok) {
          const data = await resp.json();
          setAuthUser({
            role: data.role || 'inspector',
            full_name: data.full_name || email,
            email: email,
            user_id: data.user_id,
            token: data.access_token,
            assigned_landscapes: data.assigned_landscapes || [],
            assigned_villages: data.assigned_villages || []
          });
          closeAuthModal();
          showToast(`✅ Welcome back, ${data.full_name}`);
        } else {
          showToast('❌ Incorrect email or password');
        }
      } catch (err) {
        showToast('❌ Server unreachable. Please try PIN unlock.');
      }
    });
  }

  // Sign out
  if (menuBtnSignout) {
    menuBtnSignout.addEventListener('click', () => {
      if (userProfileMenu) userProfileMenu.style.display = 'none';
      setAuthUser(null);
      showToast('🚪 Signed out. Public mode active.');
    });
  }

  // ==========================================================
  // ANNUAL GIS GEOJSON INGESTION & DIFF WORKBENCH
  // ==========================================================
  const modalAdminGis = document.getElementById('modal-admin-gis');
  const btnAnnualGis = document.getElementById('btn-annual-gis');
  const menuBtnGis = document.getElementById('menu-btn-gis');
  const btnCloseGisModal = document.getElementById('btn-close-gis-modal');
  const gisFileInput = document.getElementById('gis-file-input');
  const btnRunGisDiff = document.getElementById('btn-run-gis-diff');
  const btnUseServerGeojson = document.getElementById('btn-use-server-geojson');
  const gisDiffOutput = document.getElementById('gis-diff-output');
  const btnCommitGisImport = document.getElementById('btn-commit-gis-import');
  const gisTargetSeason = document.getElementById('gis-target-season');

  let activeGisDiffData = null;
  let activeGisFile = null;

  function openGisModal() {
    if (userProfileMenu) userProfileMenu.style.display = 'none';
    if (modalAdminGis) {
      modalAdminGis.style.display = 'flex';
      if (gisDiffOutput) gisDiffOutput.style.display = 'none';
      activeGisDiffData = null;
      activeGisFile = null;
      if (gisFileInput) gisFileInput.value = '';
      if (btnRunGisDiff) btnRunGisDiff.disabled = true;
    }
  }

  function closeGisModal() {
    if (modalAdminGis) modalAdminGis.style.display = 'none';
  }

  if (btnAnnualGis) btnAnnualGis.addEventListener('click', openGisModal);
  if (menuBtnGis) menuBtnGis.addEventListener('click', openGisModal);
  if (btnCloseGisModal) btnCloseGisModal.addEventListener('click', closeGisModal);

  if (gisFileInput) {
    gisFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) {
        activeGisFile = e.target.files[0];
        if (btnRunGisDiff) btnRunGisDiff.disabled = false;
      }
    });
  }

  if (btnUseServerGeojson) {
    btnUseServerGeojson.addEventListener('click', async () => {
      showToast('Fetching server GeoJSON sample for diff...');
      try {
        const resp = await fetch('data/plots.geojson');
        const blob = await resp.blob();
        activeGisFile = new File([blob], 'all_ibis_rice_plots.geojson', { type: 'application/json' });
        if (btnRunGisDiff) btnRunGisDiff.disabled = false;
        showToast('📂 Loaded server plots.geojson ready to analyze');
        runGisDiff();
      } catch (err) {
        showToast(`Failed to load server GeoJSON: ${err.message}`);
      }
    });
  }

  async function runGisDiff() {
    if (!activeGisFile) {
      showToast('Please select a GeoJSON file first');
      return;
    }

    const season = gisTargetSeason ? gisTargetSeason.value : '2027';
    showToast('Analyzing spatial diff with database...');
    if (btnRunGisDiff) btnRunGisDiff.disabled = true;

    const formData = new FormData();
    formData.append('season_code', season);
    formData.append('file', activeGisFile);

    try {
      const resp = await fetch('/api/v1/admin/gis/preview-diff', {
        method: 'POST',
        body: formData
      });

      if (!resp.ok) {
        const errData = await resp.json();
        throw new Error(errData.detail?.message || errData.detail || 'Diff failed');
      }

      activeGisDiffData = await resp.json();
      displayGisDiffResults(activeGisDiffData);
      showToast(`✅ Diff complete: ${activeGisDiffData.total_features} plots analyzed`);
    } catch (err) {
      console.error('GIS diff error:', err);
      showToast(`Diff error: ${err.message}`);
    } finally {
      if (btnRunGisDiff) btnRunGisDiff.disabled = false;
    }
  }

  if (btnRunGisDiff) {
    btnRunGisDiff.addEventListener('click', runGisDiff);
  }

  function displayGisDiffResults(diff) {
    if (!gisDiffOutput) return;
    gisDiffOutput.style.display = 'block';

    const kpiTotal = document.getElementById('diff-kpi-total');
    const kpiUnchanged = document.getElementById('diff-kpi-unchanged');
    const kpiModified = document.getElementById('diff-kpi-modified');
    const kpiNew = document.getElementById('diff-kpi-new');
    const kpiRemoved = document.getElementById('diff-kpi-removed');

    if (kpiTotal) kpiTotal.textContent = (diff.total_features || 0).toLocaleString();
    if (kpiUnchanged) kpiUnchanged.textContent = (diff.unchanged_count || 0).toLocaleString();
    if (kpiModified) kpiModified.textContent = (diff.modified_count || 0).toLocaleString();
    if (kpiNew) kpiNew.textContent = (diff.new_count || 0).toLocaleString();
    if (kpiRemoved) kpiRemoved.textContent = (diff.removed_count || 0).toLocaleString();

    const tbody = document.getElementById('diff-table-body');
    if (tbody) {
      tbody.innerHTML = '';
      const items = diff.items_sample || [];
      if (items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#94a3b8;">All plots are 100% identical to active database.</td></tr>';
      } else {
        items.slice(0, 25).forEach(item => {
          const tr = document.createElement('tr');
          let statusBadge = '<span style="color:#60a5fa">New</span>';
          if (item.diff_status === 'BOUNDARY_MODIFIED') statusBadge = '<span style="color:#fbbf24">Modified</span>';
          else if (item.diff_status === 'REMOVED') statusBadge = '<span style="color:#f87171">Archived</span>';
          
          tr.innerHTML = `
            <td><strong>${escapeHtml(item.plot_code)}</strong></td>
            <td>${escapeHtml(item.family_code)}</td>
            <td>${escapeHtml(item.village_name)}</td>
            <td>${statusBadge}</td>
            <td>${item.area_diff_ha ? (item.area_diff_ha > 0 ? '+' : '') + item.area_diff_ha.toFixed(2) + ' ha' : '0.00 ha'}</td>
          `;
          tbody.appendChild(tr);
        });
      }
    }
  }

  if (btnCommitGisImport) {
    btnCommitGisImport.addEventListener('click', async () => {
      if (!activeGisFile) {
        showToast('No active file to commit');
        return;
      }
      const season = gisTargetSeason ? gisTargetSeason.value : '2027';
      showToast(`Committing GIS update for Season ${season}...`);
      btnCommitGisImport.disabled = true;

      const formData = new FormData();
      formData.append('season_code', season);
      formData.append('file', activeGisFile);

      try {
        const resp = await fetch('/api/v1/admin/gis/commit', {
          method: 'POST',
          body: formData
        });
        if (!resp.ok) throw new Error('Commit failed');
        const result = await resp.json();
        showToast(`🎉 Successfully committed ${result.total_processed} plots for Season ${season}!`);
        closeGisModal();
      } catch (err) {
        showToast(`Commit error: ${err.message}`);
      } finally {
        btnCommitGisImport.disabled = false;
      }
    });
  }

  // --- Hero Discovery & Sanctuary Quick Explorer ---
  const SANCTUARY_COORDINATES = {
    'Preah Vihear': { center: [13.92, 104.95], zoom: 11 },
    'Keo Seima': { center: [12.35, 106.65], zoom: 11 },
    'Siem Pang': { center: [14.28, 106.38], zoom: 11 },
    'Chhaeb': { center: [13.78, 105.15], zoom: 11 },
  };

  function initHeroDiscoveryCard() {
    const heroCard = document.getElementById('hero-discovery-card');
    const toggleBtn = document.getElementById('btn-toggle-hero-card');
    if (!heroCard) return;

    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isMin = heroCard.classList.toggle('minimized');
        const iconSpan = toggleBtn.querySelector('.toggle-icon');
        if (iconSpan) iconSpan.textContent = isMin ? '+' : '−';
        try { localStorage.setItem('ibis_hero_minimized', isMin ? '1' : '0'); } catch(e) {}
      });
    }

    // Restore minimized state if user previously preferred
    try {
      if (localStorage.getItem('ibis_hero_minimized') === '1') {
        heroCard.classList.add('minimized');
        const iconSpan = toggleBtn ? toggleBtn.querySelector('.toggle-icon') : null;
        if (iconSpan) iconSpan.textContent = '+';
      }
    } catch(e) {}

    // When minimized, clicking card header expands it
    heroCard.addEventListener('click', (e) => {
      if (heroCard.classList.contains('minimized') && !e.target.closest('.hero-toggle-btn')) {
        heroCard.classList.remove('minimized');
        const iconSpan = toggleBtn ? toggleBtn.querySelector('.toggle-icon') : null;
        if (iconSpan) iconSpan.textContent = '−';
        try { localStorage.setItem('ibis_hero_minimized', '0'); } catch(e) {}
      }
    });

    // Landscape explorer chips
    const chips = heroCard.querySelectorAll('.landscape-chip');
    chips.forEach((chip) => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const landscape = chip.getAttribute('data-landscape');
        const target = SANCTUARY_COORDINATES[landscape];
        if (target && map) {
          map.flyTo(target.center, target.zoom, { duration: 1.5 });
          showToast(`🦅 Exploring ${landscape} Wildlife Sanctuary`);
          
          // Filter site dropdown if available
          const filterSite = document.getElementById('filter-site');
          if (filterSite) {
            for (let i = 0; i < filterSite.options.length; i++) {
              if (filterSite.options[i].text.toLowerCase().includes(landscape.toLowerCase())) {
                filterSite.selectedIndex = i;
                filterSite.dispatchEvent(new Event('change'));
                break;
              }
            }
          }
        }
      });
    });
  }

  // --- Admin Workspace & Inspector Territory Management ---
  const LOCAL_ADMIN_USERS_KEY = 'ibis_admin_users_v2';
  const DEFAULT_ADMIN_USERS = [
    { id: 'u-admin-1', full_name: 'IRCC System Administrator', role: 'admin', email: 'admin@ibisrice.com', phone: '', pin: '9999', assigned_landscapes: [], is_active: true },
    { id: 'u-insp-1', full_name: 'Inspector Sok Chea', role: 'inspector', email: 'inspector@ibisrice.com', phone: '', pin: '1234', assigned_landscapes: ['Keo Seima'], is_active: true },
    { id: 'u-insp-2', full_name: 'Inspector Test Officer', role: 'inspector', email: '', phone: '', pin: '5678', assigned_landscapes: ['Keo Seima', 'Siem Pang'], is_active: true },
    { id: 'u-insp-3', full_name: 'Officer Vanna Roth', role: 'inspector', email: '', phone: '012999888', pin: '7788', assigned_landscapes: ['Siem Pang'], is_active: true }
  ];

  function getStoredLocalUsers() {
    try {
      const raw = localStorage.getItem(LOCAL_ADMIN_USERS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    localStorage.setItem(LOCAL_ADMIN_USERS_KEY, JSON.stringify(DEFAULT_ADMIN_USERS));
    return DEFAULT_ADMIN_USERS;
  }

  function saveStoredLocalUsers(usersList) {
    try {
      localStorage.setItem(LOCAL_ADMIN_USERS_KEY, JSON.stringify(usersList));
    } catch (e) {}
  }

  function initAdminWorkspace() {
    const modalAdmin = document.getElementById('modal-admin-workspace');
    const btnOpenAdmin = document.getElementById('btn-sidebar-admin-workspace');
    const btnCloseAdmin = document.getElementById('btn-close-admin-workspace');

    if (btnOpenAdmin) {
      btnOpenAdmin.addEventListener('click', () => {
        if (modalAdmin) modalAdmin.style.display = 'flex';
        loadAdminUsers();
      });
    }

    if (btnCloseAdmin) {
      btnCloseAdmin.addEventListener('click', () => {
        if (modalAdmin) modalAdmin.style.display = 'none';
      });
    }

    // Tabs
    const tabs = [
      { btnId: 'nav-btn-inspectors', panelId: 'admin-tab-inspectors' },
      { btnId: 'nav-btn-export', panelId: 'admin-tab-export' },
      { btnId: 'nav-btn-gis', panelId: 'admin-tab-gis' },
      { btnId: 'nav-btn-purchases', panelId: 'admin-tab-purchases' }
    ];

    tabs.forEach(({ btnId, panelId }) => {
      const b = document.getElementById(btnId);
      if (b) {
        b.addEventListener('click', () => {
          tabs.forEach(t => {
            const btn = document.getElementById(t.btnId);
            const pnl = document.getElementById(t.panelId);
            if (btn) btn.classList.toggle('active', t.btnId === btnId);
            if (pnl) {
              pnl.style.display = t.btnId === btnId ? 'block' : 'none';
              pnl.classList.toggle('active', t.btnId === btnId);
            }
          });
        });
      }
    });

    // Upload Paddy Purchases Event Handler
    const btnUploadPurchases = document.getElementById('btn-upload-purchases');
    const purchaseFileInput = document.getElementById('purchase-file-input');
    const purchaseResultContainer = document.getElementById('purchase-upload-result-container');
    const purchaseResultBody = document.getElementById('purchase-result-body');

    if (btnUploadPurchases && purchaseFileInput) {
      btnUploadPurchases.addEventListener('click', () => {
        const file = purchaseFileInput.files[0];
        if (!file) {
          showToast('⚠️ Please select an Excel (.xlsx) or CSV file first');
          return;
        }

        const formData = new FormData();
        formData.append('file', file);

        btnUploadPurchases.disabled = true;
        btnUploadPurchases.innerHTML = '<span>⏳ Uploading &amp; Validating...</span>';

        fetch('/api/v1/traceability/procurements/upload-excel?season_code=2026', {
          method: 'POST',
          body: formData
        })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(resData => {
          btnUploadPurchases.disabled = false;
          btnUploadPurchases.innerHTML = '<span>📤 Upload Paddy Purchases</span>';
          if (purchaseResultContainer) purchaseResultContainer.style.display = 'block';
          
          let varietySummaryHtml = '';
          if (resData.summary_by_variety) {
            varietySummaryHtml = Object.entries(resData.summary_by_variety)
              .map(([v, kg]) => `<li><b>${v}:</b> ${kg.toLocaleString('en-US')} kg</li>`)
              .join('');
          }

          if (purchaseResultBody) {
            purchaseResultBody.innerHTML = `
              <div style="color: #4ade80; font-weight: 600; margin-bottom: 6px;">✅ File Upload Successful!</div>
              <div><b>Source File:</b> ${resData.source_filename}</div>
              <div><b>Total Rows Processed:</b> ${resData.total_rows} | <b>Success:</b> ${resData.success_count} | <b>Failed:</b> ${resData.error_count}</div>
              <div><b>Total Purchased Paddy:</b> ${resData.total_purchased_kg.toLocaleString('en-US')} kg</div>
              ${varietySummaryHtml ? `<div style="margin-top: 8px;"><b>Purchases by Rice Variety:</b><ul>${varietySummaryHtml}</ul></div>` : ''}
              ${resData.errors && resData.errors.length > 0 ? `<div style="color: #f87171; margin-top: 8px;"><b>Row Errors (${resData.errors.length}):</b><br/>${resData.errors.map(e => `Row ${e.row}: ${e.reason}`).join('<br/>')}</div>` : ''}
            `;
          }
          showToast('✅ Paddy Purchases uploaded successfully');
        })
        .catch(err => {
          btnUploadPurchases.disabled = false;
          btnUploadPurchases.innerHTML = '<span>📤 Upload Paddy Purchases</span>';
          if (purchaseResultContainer) purchaseResultContainer.style.display = 'block';
          if (purchaseResultBody) {
            purchaseResultBody.innerHTML = `<span style="color: #f87171;">❌ Upload failed: ${err.message}</span>`;
          }
          showToast('❌ Failed to upload paddy purchase file');
        });
      });
    }

    // Launch GIS Workbench button from inside workspace
    const btnLaunchGis = document.getElementById('btn-launch-gis-workbench');
    const modalGis = document.getElementById('modal-admin-gis');
    if (btnLaunchGis) {
      btnLaunchGis.addEventListener('click', () => {
        if (modalAdmin) modalAdmin.style.display = 'none';
        if (modalGis) modalGis.style.display = 'flex';
      });
    }

    // Add / Edit Inspector Form Toggle
    const editorCard = document.getElementById('admin-user-editor-card');
    const btnOpenAdd = document.getElementById('btn-open-add-user-modal');
    const btnCancelEditor = document.getElementById('btn-cancel-user-editor');
    const btnDismissEditor = document.getElementById('btn-dismiss-user-editor');

    const toggleEditor = (show, user = null) => {
      if (!editorCard) return;
      editorCard.style.display = show ? 'block' : 'none';
      if (show) {
        const title = document.getElementById('editor-user-title');
        const idInput = document.getElementById('admin-user-id');
        const nameInput = document.getElementById('admin-user-name');
        const emailInput = document.getElementById('admin-user-email');
        const phoneInput = document.getElementById('admin-user-phone');
        const roleInput = document.getElementById('admin-user-role');
        const pinInput = document.getElementById('admin-user-pin');
        const selectEl = document.getElementById('admin-user-landscapes');

        if (user) {
          if (title) title.textContent = `Edit Inspector: ${user.full_name}`;
          if (idInput) idInput.value = user.id;
          if (nameInput) nameInput.value = user.full_name || '';
          if (emailInput) emailInput.value = user.email || '';
          if (phoneInput) phoneInput.value = user.phone || '';
          if (roleInput) roleInput.value = user.role || 'inspector';
          if (pinInput) pinInput.value = user.pin || '1234';

          const assignedLands = user.assigned_landscapes || [];
          if (selectEl) {
            Array.from(selectEl.options).forEach(opt => {
              opt.selected = assignedLands.includes(opt.value);
            });
          }
        } else {
          if (title) title.textContent = 'Add New Field Inspector';
          if (idInput) idInput.value = '';
          if (nameInput) nameInput.value = '';
          if (emailInput) emailInput.value = '';
          if (phoneInput) phoneInput.value = '';
          if (roleInput) roleInput.value = 'inspector';
          if (pinInput) pinInput.value = '1234';
          if (selectEl) {
            Array.from(selectEl.options).forEach(opt => {
              opt.selected = false;
            });
          }
        }
      }
    };

    if (btnOpenAdd) btnOpenAdd.addEventListener('click', () => toggleEditor(true));
    if (btnCancelEditor) btnCancelEditor.addEventListener('click', () => toggleEditor(false));
    if (btnDismissEditor) btnDismissEditor.addEventListener('click', () => toggleEditor(false));

    // Save Inspector Form
    const formUser = document.getElementById('form-admin-user');
    if (formUser) {
      formUser.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userId = document.getElementById('admin-user-id')?.value;
        const fullName = document.getElementById('admin-user-name')?.value.trim();
        const email = document.getElementById('admin-user-email')?.value.trim();
        const phone = document.getElementById('admin-user-phone')?.value.trim();
        const role = document.getElementById('admin-user-role')?.value;
        const pin = document.getElementById('admin-user-pin')?.value.trim();

        const selectedLands = [];
        const selectEl = document.getElementById('admin-user-landscapes');
        if (selectEl) {
          Array.from(selectEl.selectedOptions).forEach(opt => {
            selectedLands.push(opt.value);
          });
        }

        if (!fullName) {
          showToast('Please enter inspector name');
          return;
        }

        const payload = {
          full_name: fullName,
          email: email || null,
          phone: phone || null,
          role: role || 'inspector',
          pin: pin || '1234',
          assigned_landscapes: selectedLands,
          assigned_villages: [],
          is_active: true
        };

        let savedUser = null;

        try {
          const url = userId ? `/api/v1/admin/users/${userId}` : '/api/v1/admin/users';
          const method = userId ? 'PUT' : 'POST';
          const headers = { 'Content-Type': 'application/json' };
          if (currentUser && currentUser.token) {
            headers['Authorization'] = `Bearer ${currentUser.token}`;
          }
          const resp = await fetch(url, {
            method,
            headers,
            body: JSON.stringify(payload)
          });
          if (resp.ok) {
            savedUser = await resp.json();
          }
        } catch (err) {}

        // Local storage sync for seamless offline / static operation
        const localUsers = getStoredLocalUsers();
        const targetId = userId || (savedUser ? savedUser.id : `u-${Date.now()}`);
        const userRecord = { ...payload, id: targetId };

        if (userId) {
          const idx = localUsers.findIndex(u => String(u.id) === String(userId));
          if (idx !== -1) {
            localUsers[idx] = userRecord;
          } else {
            localUsers.push(userRecord);
          }
        } else {
          localUsers.push(userRecord);
        }
        saveStoredLocalUsers(localUsers);

        showToast(`✅ Saved officer account: ${fullName}`);
        toggleEditor(false);
        loadAdminUsers();
      });
    }

    // Master ICS Download Button
    const btnDownloadMaster = document.getElementById('btn-download-master-ics');
    if (btnDownloadMaster) {
      btnDownloadMaster.addEventListener('click', async () => {
        const landscape = document.getElementById('ics-filter-landscape')?.value || '';
        const village = document.getElementById('ics-filter-village')?.value.trim() || '';
        const season = document.getElementById('ics-filter-season')?.value || '2026';
        const phase = document.getElementById('ics-filter-phase')?.value || '';

        const params = new URLSearchParams();
        if (landscape) params.set('landscape_name', landscape);
        if (village) params.set('village_name', village);
        params.set('season_code', season);
        if (phase) params.set('phase', phase);

        showToast('📥 Preparing master ICS CSV dataset...');
        try {
          const headers = currentUser && currentUser.token ? { 'Authorization': `Bearer ${currentUser.token}` } : {};
          const resp = await fetch(`/api/v1/inspections/export/master-ics-csv?${params.toString()}`, { headers });
          if (resp.ok) {
            const blob = await resp.blob();
            const filename = `ibis_master_ics_${(landscape || 'Nationwide').replace(/\s+/g, '_')}_${season}_${new Date().toISOString().slice(0, 10)}.csv`;
            downloadBlob(blob, filename, 'text/csv');
            showToast('✅ Master ICS CSV downloaded successfully');
          } else {
            const err = await resp.json().catch(() => ({}));
            showToast(`❌ Failed to download CSV: ${err.detail || 'Admin privileges required'}`);
          }
        } catch (err) {
          showToast(`❌ Download error: ${err.message}`);
        }
      });
    }
  }

  async function deleteAdminUser(userId, userName) {
    if (!confirm(`Are you sure you want to delete inspector "${userName}"?\nThis account will be removed.`)) {
      return;
    }

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (currentUser && currentUser.token) {
        headers['Authorization'] = `Bearer ${currentUser.token}`;
      }
      await fetch(`/api/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers
      });
    } catch (err) {}

    // Synchronize local storage
    const localUsers = getStoredLocalUsers().filter(u => String(u.id) !== String(userId));
    saveStoredLocalUsers(localUsers);

    showToast(`🗑️ Deleted officer account: ${userName}`);
    loadAdminUsers();
  }

  async function loadAdminUsers() {
    const tbody = document.getElementById('admin-users-table-body');
    if (!tbody) return;

    let users = [];

    try {
      const headers = currentUser && currentUser.token ? { 'Authorization': `Bearer ${currentUser.token}` } : {};
      const resp = await fetch('/api/v1/admin/users', { headers });
      if (resp.ok) {
        users = await resp.json();
        saveStoredLocalUsers(users);
      } else {
        users = getStoredLocalUsers();
      }
    } catch (e) {
      users = getStoredLocalUsers();
    }

    tbody.innerHTML = '';
    if (!users || users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #94a3b8; padding: 16px;">No users registered yet.</td></tr>';
      return;
    }

    users.forEach(u => {
      const tr = document.createElement('tr');
      const roleLabel = u.role === 'admin' ? 'ADMINISTRATOR' : (u.role === 'supervisor' ? 'FIELD SUPERVISOR' : 'FIELD INSPECTOR');
      const terrLabel = (u.assigned_landscapes && u.assigned_landscapes.length > 0)
        ? u.assigned_landscapes.join(', ')
        : 'Nationwide (All)';

      const contactLabel = u.phone || u.email || 'N/A';

      tr.innerHTML = `
        <td><strong>${escapeHtml(u.full_name)}</strong></td>
        <td><span class="user-role-badge role-badge-${u.role}">${escapeHtml(roleLabel)}</span></td>
        <td><span style="font-size: 0.78rem; opacity: 0.85;">${escapeHtml(contactLabel)}</span></td>
        <td><code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; font-weight: bold; color: #facc15;">${escapeHtml(u.pin || '1234')}</code></td>
        <td><span style="font-size: 0.8rem; color: #34d399;">📍 ${escapeHtml(terrLabel)}</span></td>
        <td><span class="user-status-pill ${u.is_active ? 'status-active' : 'status-inactive'}">${u.is_active ? 'Active' : 'Inactive'}</span></td>
        <td>
          <div class="admin-row-actions">
            <button type="button" class="table-btn table-btn-edit" data-user-id="${u.id}">Edit</button>
            <button type="button" class="table-btn table-btn-delete" data-user-id="${u.id}">Delete</button>
          </div>
        </td>
      `;

      const editBtn = tr.querySelector('.table-btn-edit');
      if (editBtn) {
        editBtn.addEventListener('click', () => {
          const editorCard = document.getElementById('admin-user-editor-card');
          if (editorCard) {
            editorCard.style.display = 'block';
            const title = document.getElementById('editor-user-title');
            const idInput = document.getElementById('admin-user-id');
            const nameInput = document.getElementById('admin-user-name');
            const emailInput = document.getElementById('admin-user-email');
            const phoneInput = document.getElementById('admin-user-phone');
            const roleInput = document.getElementById('admin-user-role');
            const pinInput = document.getElementById('admin-user-pin');
            const selectEl = document.getElementById('admin-user-landscapes');

            if (title) title.textContent = `Edit Inspector: ${u.full_name}`;
            if (idInput) idInput.value = u.id;
            if (nameInput) nameInput.value = u.full_name || '';
            if (emailInput) emailInput.value = u.email || '';
            if (phoneInput) phoneInput.value = u.phone || '';
            if (roleInput) roleInput.value = u.role || 'inspector';
            if (pinInput) pinInput.value = u.pin || '1234';

            const assignedLands = u.assigned_landscapes || [];
            if (selectEl) {
              Array.from(selectEl.options).forEach(opt => {
                opt.selected = assignedLands.includes(opt.value);
              });
            }
            editorCard.scrollIntoView({ behavior: 'smooth' });
          }
        });
      }

      const deleteBtn = tr.querySelector('.table-btn-delete');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
          deleteAdminUser(u.id, u.full_name);
        });
      }

      tbody.appendChild(tr);
    });
  }

  // Initialize Hero Card, Admin Workspace & Auth on app start
  initHeroDiscoveryCard();
  initAdminWorkspace();
  initAuthSession();

})();




