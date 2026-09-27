import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List, Dict, Any

from ..database import get_db
from ..models import (
    Parcel, Plot, PlotGeometryHistory, PlotSeasonRegistration,
    Season, Village, Farmer, Subplot
)

router = APIRouter(prefix="/plots", tags=["Plots & Thematic GeoJSON"])

STATUS_COLOR_MAP = {
    "completed": "#2e7d32",     # Forest Green (Compliant & Inspected)
    "in_progress": "#f57c00",   # Amber / Orange (In Progress / Draft Saved)
    "pending": "#d32f2f",       # Crimson Red (Pending / Outstanding Inspection)
    "non_compliant": "#7b1fa2", # Purple (Sanctioned / Chemical Risk Detected)
    "fallow": "#757575"         # Neutral Slate Gray (Fallow / Inactive)
}

@router.get("/geojson")
def get_thematic_plots_geojson(
    season_code: str = Query("2026", description="Inspection Season e.g. 2026"),
    village_id: Optional[int] = Query(None, description="Optional village filter"),
    status: Optional[str] = Query(None, description="Filter by status e.g. completed, pending"),
    db: Session = Depends(get_db)
):
    """
    Returns FeatureCollection GeoJSON formatted for interactive Leaflet / MapLibre map.
    Each feature includes real-time thematic color tokens and inspection status:
    - 🟢 Green (#2e7d32): Verified Organic & Completed
    - 🟡 Amber (#f57c00): Inspection in Progress
    - 🔴 Red (#d32f2f): Outstanding / Uninspected
    - 🟣 Purple (#7b1fa2): Non-compliant / Chemical Risk
    - ⚪ Gray (#757575): Inactive / Fallow
    """
    season = db.query(Season).filter(Season.code == season_code).first()
    if not season:
        raise HTTPException(status_code=404, detail=f"Season '{season_code}' not found")
        
    query = db.query(Parcel).join(Farmer).join(Village)
    if village_id:
        query = query.filter(Farmer.village_id == village_id)
        
    parcels = query.all()
    features = []
    
    for p in parcels:
        farmer = p.farmer
        village = farmer.village
        commune = village.commune if village else None
        landscape = commune.landscape if commune else None
        
        # Check seasonal registration if available, fallback to parcel snapshot
        current_status = p.inspection_status or "pending"
        
        # Check if plot has registration for this season
        plot = p.plots[0] if p.plots else None
        if plot:
            reg = db.query(PlotSeasonRegistration).filter(
                PlotSeasonRegistration.plot_id == plot.id,
                PlotSeasonRegistration.season_id == season.id
            ).first()
            if reg:
                current_status = reg.inspection_status
                
        if status and current_status != status:
            continue
            
        color_token = STATUS_COLOR_MAP.get(current_status, STATUS_COLOR_MAP["pending"])
        
        try:
            geometry_obj = json.loads(p.geom_geojson)
        except Exception:
            continue
            
        # Variety info if subplots exist
        variety_names = []
        for s in p.subplots:
            if s.season_id == season.id and s.variety:
                variety_names.append(s.variety.name_en)
        variety_display = ", ".join(set(variety_names)) if variety_names else "Organic Jasmine (PKR)"
        
        features.append({
            "type": "Feature",
            "geometry": geometry_obj,
            "properties": {
                "parcel_id": p.id,
                "plot_id": plot.id if plot else None,
                "plot_code": plot.plot_code if plot else p.parcel_code,
                "parcel_code": p.parcel_code,
                "family_id": farmer.family_code,
                "farmer_name": farmer.head_name,
                "farmer_id": farmer.id,
                "village": village.name if village else "Unknown Village",
                "commune": commune.name if commune else "Unknown Commune",
                "site": landscape.name if landscape else "Unknown Site",
                "area_ha": p.gis_area_ha,
                "lat": p.lat,
                "lng": p.lng,
                "season": season_code,
                "status": current_status,
                "color_token": color_token,
                "variety": variety_display,
                "land_tenure": p.land_tenure,
                "irrigation_type": p.irrigation_type,
                "is_inspected": current_status == "completed"
            }
        })
        
    return {
        "type": "FeatureCollection",
        "name": f"IBIS_RICE_PLOTS_{season_code}",
        "season": season_code,
        "total_features": len(features),
        "features": features
    }

@router.get("/{plot_id}")
def get_plot_detail(plot_id: str, season_code: str = "2026", db: Session = Depends(get_db)):
    """Returns single plot details, active season registration, and current geometry."""
    plot = db.query(Plot).filter(Plot.id == plot_id).first()
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
        
    parcel = plot.parcel
    farmer = parcel.farmer
    
    season = db.query(Season).filter(Season.code == season_code).first()
    reg = None
    if season:
        reg = db.query(PlotSeasonRegistration).filter(
            PlotSeasonRegistration.plot_id == plot.id,
            PlotSeasonRegistration.season_id == season.id
        ).first()
        
    return {
        "plot_id": plot.id,
        "plot_code": plot.plot_code,
        "plot_number": plot.plot_number,
        "parcel_id": parcel.id,
        "farmer_id": farmer.id,
        "family_code": farmer.family_code,
        "farmer_name": farmer.head_name,
        "village_name": farmer.village.name if farmer.village else None,
        "season_code": season_code,
        "inspection_status": reg.inspection_status if reg else parcel.inspection_status,
        "gis_area_ha": parcel.gis_area_ha,
        "lat": parcel.lat,
        "lng": parcel.lng,
        "geom_geojson": parcel.geom_geojson
    }
