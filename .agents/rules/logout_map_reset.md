# Logout and Map Reset Behavior

When an Inspector or Admin signs out (`setAuthUser(null)` / signout flow in `public/app.js`), the application MUST preserve the following seamless transition requirements:

1. **Complete Session Wiping:** `localStorage.removeItem('ibis_auth_user')` and clearing of active user session state.
2. **State & Highlight Cleanup:** Immediately reset `selectedLayer = null` and `selectedPlot = null`. Close all open drawers, subplots, and admin modals.
3. **Filter & Search Reset:** Reset filter dropdowns (`filterSite.value = ''`), hide search suggestion popups, and clear quick/sidebar search inputs.
4. **Full Plot Restoration:** Call `applyUserTerritoryFilter(true)` to restore all 6,427 nationwide plots for General Users (`masterFeatures`).
5. **Fast & Smooth Camera Reset:** Immediately call `map.invalidateSize()` and a single-pass `map.flyToBounds(bounds, { padding: [30, 30], maxZoom: 14, duration: 0.5 })` to animate back to the full nationwide map view.
6. **No Page Refresh:** NEVER use `location.reload()` or page refreshes to reset the map or user state.
