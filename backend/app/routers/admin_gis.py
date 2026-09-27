import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..models import Plot, PlotGeometryHistory, Season, User
from ..schemas import GisDiffSummary, PlotGeometryHistoryOut
from ..services.gis_engine import validate_geojson, analyze_gis_diff, commit_gis_ingestion
from .auth import require_admin, require_staff

router = APIRouter(prefix="/admin/gis", tags=["Admin GIS & Annual GeoJSON"])

@router.post("/preview-diff", response_model=GisDiffSummary)
async def preview_annual_geojson_diff(
    season_code: str = Form("2027"),
    file: UploadFile = File(...),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Dry-run annual GIS GeoJSON validator and diff analyzer (Admin only).
    Identifies unchanged, modified, split, new, and removed plots
    BEFORE any database changes are made.
    """
    try:
        content = await file.read()
        data = json.loads(content.decode("utf-8"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON file: {str(e)}")
        
    is_valid, errors = validate_geojson(data)
    if not is_valid:
        raise HTTPException(status_code=422, detail={"message": "GeoJSON validation failed", "errors": errors})
        
    diff_summary = analyze_gis_diff(
        db=db,
        data=data,
        season_code=season_code,
        source_filename=file.filename or "uploaded_plots.geojson"
    )
    return diff_summary

@router.post("/commit")
async def commit_annual_geojson(
    season_code: str = Form(...),
    file: UploadFile = File(...),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Commits the validated annual GeoJSON into production (Admin only):
    - Creates versioned PlotGeometryHistory records for the new season.
    - Updates PlotSeasonRegistration for each plot.
    - Historical inspection records remain 100% untouched.
    """
    try:
        content = await file.read()
        data = json.loads(content.decode("utf-8"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid JSON file: {str(e)}")
        
    is_valid, errors = validate_geojson(data)
    if not is_valid:
        raise HTTPException(status_code=422, detail={"message": "GeoJSON validation failed", "errors": errors})
        
    result = commit_gis_ingestion(
        db=db,
        data=data,
        season_code=season_code,
        source_filename=file.filename or "uploaded_plots.geojson"
    )
    return result

@router.get("/history/{plot_id}", response_model=list[PlotGeometryHistoryOut])
def get_plot_geometry_history(
    plot_id: str,
    staff: User = Depends(require_staff),
    db: Session = Depends(get_db)
):
    """Returns all historical geometry versions for a specific plot (Staff/Admin)."""
    plot = db.query(Plot).filter(Plot.id == plot_id).first()
    if not plot:
        raise HTTPException(status_code=404, detail="Plot not found")
        
    histories = db.query(PlotGeometryHistory).filter(
        PlotGeometryHistory.plot_id == plot_id
    ).order_by(PlotGeometryHistory.season_code.desc()).all()
    
    return [
        PlotGeometryHistoryOut(
            id=h.id,
            season_code=h.season_code,
            gis_area_ha=h.gis_area_ha,
            centroid_lat=h.centroid_lat,
            centroid_lng=h.centroid_lng,
            geom_geojson=h.geom_geojson,
            is_current=h.is_current,
            source_file_version=h.source_file_version,
            effective_start_date=h.effective_start_date
        )
        for h in histories
    ]
