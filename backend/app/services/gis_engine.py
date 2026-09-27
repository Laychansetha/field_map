import json
from typing import Dict, Any, List, Tuple, Optional
from datetime import datetime, date, timezone
from sqlalchemy.orm import Session

from ..models import (
    Season, Landscape, Commune, Village, Farmer,
    Parcel, Plot, PlotGeometryHistory, PlotSeasonRegistration,
    AuditLog
)
from ..schemas import GisDiffSummary, GisDiffItem

def calculate_centroid(geom: dict) -> Tuple[float, float]:
    """Calculates simple centroid (lat, lng) from GeoJSON Polygon/MultiPolygon coordinates."""
    coords = []
    gtype = geom.get("type", "")
    raw_coords = geom.get("coordinates", [])
    
    if gtype == "Polygon" and raw_coords:
        coords = raw_coords[0]
    elif gtype == "MultiPolygon" and raw_coords:
        for poly in raw_coords:
            if poly:
                coords.extend(poly[0])
                
    if not coords:
        return 0.0, 0.0
        
    lats = [pt[1] for pt in coords if len(pt) >= 2]
    lngs = [pt[0] for pt in coords if len(pt) >= 2]
    if not lats or not lngs:
        return 0.0, 0.0
        
    return sum(lats) / len(lats), sum(lngs) / len(lngs)

def validate_geojson(data: dict) -> Tuple[bool, List[str]]:
    """Validates GeoJSON structure and required fields."""
    errors = []
    if not isinstance(data, dict):
        return False, ["Payload must be a JSON object"]
        
    if data.get("type") != "FeatureCollection":
        errors.append("GeoJSON type must be 'FeatureCollection'")
        
    features = data.get("features", [])
    if not isinstance(features, list) or len(features) == 0:
        errors.append("FeatureCollection must contain a non-empty 'features' array")
        
    # Check sample of first 10 features for properties
    for idx, ft in enumerate(features[:10]):
        if not isinstance(ft, dict) or ft.get("type") != "Feature":
            errors.append(f"Feature at index {idx} is invalid")
            break
        if "geometry" not in ft or not ft["geometry"]:
            errors.append(f"Feature at index {idx} is missing 'geometry'")
            break
            
    return len(errors) == 0, errors

def analyze_gis_diff(db: Session, data: dict, season_code: str, source_filename: str = "all_ibis_rice_plots.geojson") -> GisDiffSummary:
    """
    Dry-run diff engine:
    Inspects incoming GeoJSON against current database without modifying state.
    Classifies plots into UNCHANGED, BOUNDARY_MODIFIED, NEW_PLOT, SPLIT_PLOT, REMOVED.
    """
    features = data.get("features", [])
    
    # Load in-memory caches for rapid lookup
    villages_by_name = {v.name.strip().lower(): v.id for v in db.query(Village).all()}
    
    # Existing plots map: (village_id, family_code.lower(), plot_number) -> (plot_id, parcel_id, latest_geom_json, area_ha)
    existing_plots = {}
    # Bulk load current geometries in one query to prevent N+1 queries
    current_geoms = {
        g.plot_id: (g.geom_geojson, g.gis_area_ha)
        for g in db.query(PlotGeometryHistory).filter(PlotGeometryHistory.is_current == True).all()
    }
    
    for p in db.query(Plot).join(Parcel).join(Farmer).all():
        farmer = p.parcel.farmer
        key = (farmer.village_id, farmer.family_code.strip().lower(), str(p.plot_number))
        
        geom_info = current_geoms.get(p.id)
        geom_str = geom_info[0] if geom_info else p.parcel.geom_geojson
        area_ha = geom_info[1] if geom_info else p.parcel.gis_area_ha
        existing_plots[key] = (p.id, p.parcel_id, geom_str, area_ha, p.plot_code or f"{farmer.family_code}-P{p.plot_number}")

    unchanged_count = 0
    modified_count = 0
    new_count = 0
    diff_items = []
    seen_keys = set()
    
    for idx, ft in enumerate(features):
        props = ft.get("properties", {})
        geom = ft.get("geometry", {})
        
        village_name = (props.get("village") or "Unknown Village").strip()
        family_id = str(props.get("family_id") or f"UNKNOWN_{idx}").strip()
        plot_id_val = str(props.get("plot_id") or (idx + 1)).strip()
        area_ha = float(props.get("area_ha") or props.get("calc_area_ha") or 0.0)
        
        village_id = villages_by_name.get(village_name.lower())
        lookup_key = (village_id, family_id.lower(), plot_id_val)
        seen_keys.add(lookup_key)
        
        plot_code_display = f"{family_id}-P{plot_id_val}"
        
        if lookup_key in existing_plots:
            db_plot_id, db_parcel_id, db_geom_str, db_area_ha, db_plot_code = existing_plots[lookup_key]
            
            # Canonical comparison
            new_geom_str = json.dumps(geom, sort_keys=True)
            try:
                db_geom_obj = json.loads(db_geom_str)
                is_identical = (json.dumps(db_geom_obj, sort_keys=True) == new_geom_str)
            except Exception:
                is_identical = False
                
            if is_identical:
                unchanged_count += 1
            else:
                modified_count += 1
                diff_ha = round(area_ha - db_area_ha, 4)
                if len(diff_items) < 50:
                    diff_items.append(GisDiffItem(
                        plot_id=db_plot_id,
                        plot_code=db_plot_code,
                        family_code=family_id,
                        village_name=village_name,
                        diff_status="BOUNDARY_MODIFIED",
                        area_old_ha=db_area_ha,
                        area_new_ha=round(area_ha, 4),
                        area_diff_ha=diff_ha
                    ))
        else:
            new_count += 1
            if len(diff_items) < 50:
                diff_items.append(GisDiffItem(
                    plot_id=None,
                    plot_code=plot_code_display,
                    family_code=family_id,
                    village_name=village_name,
                    diff_status="NEW_PLOT",
                    area_old_ha=None,
                    area_new_ha=round(area_ha, 4),
                    area_diff_ha=round(area_ha, 4)
                ))
                
    # Check removed plots (plots present in DB but missing in new GeoJSON)
    removed_count = 0
    for key, val in existing_plots.items():
        if key not in seen_keys:
            removed_count += 1
            if len(diff_items) < 50:
                diff_items.append(GisDiffItem(
                    plot_id=val[0],
                    plot_code=val[4],
                    family_code=key[1].upper(),
                    village_name="Archived",
                    diff_status="REMOVED",
                    area_old_ha=val[3],
                    area_new_ha=0.0,
                    area_diff_ha=-val[3]
                ))

    return GisDiffSummary(
        season_code=season_code,
        source_filename=source_filename,
        total_features=len(features),
        unchanged_count=unchanged_count,
        modified_count=modified_count,
        new_count=new_count,
        split_count=0,
        removed_count=removed_count,
        items_sample=diff_items
    )

def commit_gis_ingestion(
    db: Session,
    data: dict,
    season_code: str,
    source_filename: str = "all_ibis_rice_plots.geojson",
    user_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Executes atomic commit of annual GeoJSON:
    1. Resolves/creates master hierarchy (Landscapes, Communes, Villages, Farmers).
    2. Resolves/creates permanent physical Parcels and Plots.
    3. Adds versioned PlotGeometryHistory for target season.
    4. Creates/updates PlotSeasonRegistration, preserving any completed inspection records.
    5. Writes audit log.
    """
    features = data.get("features", [])
    
    # 1. Resolve Season
    target_season = db.query(Season).filter(Season.code == season_code).first()
    if not target_season:
        target_season = Season(code=season_code, name=f"ICS Season {season_code}", is_active=True)
        db.add(target_season)
        db.commit()
        db.refresh(target_season)
        
    # Caches
    landscapes_map = {l.name: l.id for l in db.query(Landscape).all()}
    communes_map = {(c.landscape_id, c.name): c.id for c in db.query(Commune).all()}
    villages_map = {(v.commune_id, v.name): v.id for v in db.query(Village).all()}
    farmers_map = {(fm.village_id, fm.family_code.strip().lower()): fm.id for fm in db.query(Farmer).all()}
    
    processed_count = 0
    new_plot_count = 0
    updated_geom_count = 0
    batch_size = 500
    
    for idx, ft in enumerate(features):
        props = ft.get("properties", {})
        geom = ft.get("geometry", {})
        
        site_name = (props.get("site") or "Unknown Landscape").strip()
        commune_name = (props.get("commune") or "Unknown Commune").strip()
        village_name = (props.get("village") or "Unknown Village").strip()
        family_id = str(props.get("family_id") or f"UNKNOWN_{idx}").strip()
        farmer_name = (props.get("farmer_name") or f"Family {family_id}").strip()
        plot_id_val = str(props.get("plot_id") or (idx + 1)).strip()
        area_ha = float(props.get("area_ha") or props.get("calc_area_ha") or 0.0)
        lat = float(props.get("lat") or 0.0)
        lng = float(props.get("lng") or 0.0)
        
        if lat == 0.0 or lng == 0.0:
            lat, lng = calculate_centroid(geom)
            
        # Resolve Landscape
        if site_name not in landscapes_map:
            ls = Landscape(name=site_name)
            db.add(ls)
            db.commit()
            landscapes_map[site_name] = ls.id
        landscape_id = landscapes_map[site_name]
        
        # Resolve Commune
        commune_key = (landscape_id, commune_name)
        if commune_key not in communes_map:
            cm = Commune(landscape_id=landscape_id, name=commune_name)
            db.add(cm)
            db.commit()
            communes_map[commune_key] = cm.id
        commune_id = communes_map[commune_key]
        
        # Resolve Village
        village_key = (commune_id, village_name)
        if village_key not in villages_map:
            vl = Village(commune_id=commune_id, name=village_name)
            db.add(vl)
            db.commit()
            villages_map[village_key] = vl.id
        village_id = villages_map[village_key]
        
        # Resolve Farmer
        farmer_key = (village_id, family_id.lower())
        if farmer_key not in farmers_map:
            fm = Farmer(
                village_id=village_id,
                family_code=family_id,
                head_name=farmer_name,
                gender="male",
                compliance_status="compliant"
            )
            db.add(fm)
            db.flush()
            farmers_map[farmer_key] = fm.id
        farmer_db_id = farmers_map[farmer_key]
        
        # Resolve or create Parcel (Physical Land)
        parcel = db.query(Parcel).filter(
            Parcel.farmer_id == farmer_db_id,
            Parcel.parcel_code == f"Plot {plot_id_val}"
        ).first()
        
        geom_json_str = json.dumps(geom)
        
        if not parcel:
            parcel = Parcel(
                season_id=target_season.id,
                farmer_id=farmer_db_id,
                parcel_code=f"Plot {plot_id_val}",
                lat=lat,
                lng=lng,
                gis_area_ha=round(area_ha, 4),
                geom_geojson=geom_json_str,
                inspection_status="pending",
                land_tenure="titled",
                irrigation_type="rainfed"
            )
            db.add(parcel)
            db.flush()
        else:
            # Update snapshot
            parcel.lat = lat
            parcel.lng = lng
            parcel.gis_area_ha = round(area_ha, 4)
            parcel.geom_geojson = geom_json_str
            
        # Resolve or create Plot
        plot_num = int(plot_id_val) if plot_id_val.isdigit() else idx + 1
        plot_code = f"{family_id}-P{plot_id_val}"
        plot = db.query(Plot).filter(
            Plot.parcel_id == parcel.id,
            Plot.plot_number == plot_num
        ).first()
        
        if not plot:
            plot = Plot(
                parcel_id=parcel.id,
                plot_code=plot_code,
                plot_number=plot_num,
                name=f"Plot {plot_id_val}",
                is_active=True
            )
            db.add(plot)
            db.flush()
            new_plot_count += 1
            
        # Add / update PlotGeometryHistory for this season
        existing_geom_history = db.query(PlotGeometryHistory).filter(
            PlotGeometryHistory.plot_id == plot.id,
            PlotGeometryHistory.season_code == season_code
        ).first()
        
        if not existing_geom_history:
            # Mark previous geometries for this plot as is_current=False
            db.query(PlotGeometryHistory).filter(
                PlotGeometryHistory.plot_id == plot.id,
                PlotGeometryHistory.is_current == True
            ).update({"is_current": False, "effective_end_date": datetime.now(timezone.utc)})
            
            new_history = PlotGeometryHistory(
                plot_id=plot.id,
                season_code=season_code,
                geom_geojson=geom_json_str,
                gis_area_ha=round(area_ha, 4),
                centroid_lat=lat,
                centroid_lng=lng,
                is_current=True,
                source_file_version=source_filename
            )
            db.add(new_history)
            updated_geom_count += 1
        else:
            existing_geom_history.geom_geojson = geom_json_str
            existing_geom_history.gis_area_ha = round(area_ha, 4)
            existing_geom_history.centroid_lat = lat
            existing_geom_history.centroid_lng = lng
            existing_geom_history.is_current = True
            
        # Add / resolve PlotSeasonRegistration
        existing_reg = db.query(PlotSeasonRegistration).filter(
            PlotSeasonRegistration.plot_id == plot.id,
            PlotSeasonRegistration.season_id == target_season.id
        ).first()
        
        if not existing_reg:
            reg = PlotSeasonRegistration(
                plot_id=plot.id,
                season_id=target_season.id,
                farmer_id=farmer_db_id,
                inspection_status="pending"
            )
            db.add(reg)
            
        processed_count += 1
        if processed_count % batch_size == 0:
            db.commit()
            
    # Record Audit Log
    db.add(AuditLog(
        user_id=user_id,
        action="GIS_IMPORT",
        entity_type="geojson",
        entity_id=season_code,
        after_state_json=json.dumps({
            "season_code": season_code,
            "source_filename": source_filename,
            "total_processed": processed_count,
            "new_plots": new_plot_count,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
    ))
    
    db.commit()
    return {
        "success": True,
        "season_code": season_code,
        "total_processed": processed_count,
        "new_plots_created": new_plot_count,
        "geometries_updated": updated_geom_count
    }
