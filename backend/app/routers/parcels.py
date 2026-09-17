from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import Parcel, Subplot, RiceVariety, Season
from ..schemas import ParcelOut, SubplotSchema, SubplotHarvestSchema

router = APIRouter(prefix="/parcels", tags=["Parcels & Subplots"])

@router.get("/farmer/{farmer_id}", response_model=List[ParcelOut])
def get_parcels_by_farmer(farmer_id: str, season_code: str = "2026", db: Session = Depends(get_db)):
    """Returns all registered physical parcels for a farmer for the given season, with subplots."""
    season = db.query(Season).filter(Season.code == season_code).first()
    season_id = season.id if season else None
    
    query = db.query(Parcel).filter(Parcel.farmer_id == farmer_id)
    if season_id:
        query = query.filter(Parcel.season_id == season_id)
    parcels = query.all()
    
    results = []
    for p in parcels:
        subplots_out = []
        if season_id:
            db_subplots = db.query(Subplot).filter(
                Subplot.parcel_id == p.id,
                Subplot.season_id == season_id
            ).all()
            
            for s in db_subplots:
                harvest_data = None
                if s.harvest:
                    h = s.harvest
                    harvest_data = SubplotHarvestSchema(
                        id=h.id,
                        harvest_status=h.harvest_status,
                        harvest_date=h.harvest_date,
                        actual_production_kg=h.actual_production_kg,
                        for_sale_kg=h.for_sale_kg,
                        consumption_kg=h.consumption_kg,
                        seed_kept_kg=h.seed_kept_kg,
                        other_disposition_kg=h.other_disposition_kg,
                        threshing_method=h.threshing_method,
                        contractor_name=h.contractor_name,
                        flush_quantity_kg=h.flush_quantity_kg,
                        payment_type=h.payment_type,
                        payment_amount_kg=h.payment_amount_kg,
                        drying_location=h.drying_location
                    )
                    
                subplots_out.append(SubplotSchema(
                    id=s.id,
                    subplot_code=s.subplot_code,
                    variety_id=s.variety_id,
                    variety_name=s.variety.name_en if s.variety else None,
                    percentage_of_main=s.percentage_of_main,
                    calculated_area_ha=s.calculated_area_ha,
                    geom_geojson=s.geom_geojson,
                    seed_source=s.seed_source or "own_saved",
                    seed_qty_kg=s.seed_qty_kg or 0.0,
                    planting_method=s.planting_method or "direct_seeding",
                    planting_date=s.planting_date,
                    expected_yield_kg=s.expected_yield_kg or 0.0,
                    expected_sales_kg=s.expected_sales_kg or 0.0,
                    harvest=harvest_data
                ))
                
        results.append(ParcelOut(
            id=p.id,
            season_id=p.season_id,
            season_code=season_code,
            farmer_id=p.farmer_id,
            parcel_code=p.parcel_code,
            lat=p.lat,
            lng=p.lng,
            gis_area_ha=p.gis_area_ha,
            geom_geojson=p.geom_geojson,
            inspection_status=p.inspection_status or "pending",
            land_tenure=p.land_tenure or "titled",
            irrigation_type=p.irrigation_type or "rainfed",
            contamination_risk=p.contamination_risk or False,
            buffer_zone_meters=p.buffer_zone_meters or 0.0,
            prohibited_chemicals_3yr=p.prohibited_chemicals_3yr or False,
            subplots=subplots_out
        ))
    return results

@router.get("/{parcel_id}", response_model=ParcelOut)
def get_parcel(parcel_id: str, db: Session = Depends(get_db)):
    parcel = db.query(Parcel).filter(Parcel.id == parcel_id).first()
    if not parcel:
        raise HTTPException(status_code=404, detail="Parcel not found")
        
    season_code = parcel.season.code if parcel.season else "2026"
    return ParcelOut(
        id=parcel.id,
        season_id=parcel.season_id,
        season_code=season_code,
        farmer_id=parcel.farmer_id,
        parcel_code=parcel.parcel_code,
        lat=parcel.lat,
        lng=parcel.lng,
        gis_area_ha=parcel.gis_area_ha,
        geom_geojson=parcel.geom_geojson,
        inspection_status=parcel.inspection_status or "pending",
        land_tenure=parcel.land_tenure or "titled",
        irrigation_type=parcel.irrigation_type or "rainfed",
        contamination_risk=parcel.contamination_risk or False,
        buffer_zone_meters=parcel.buffer_zone_meters or 0.0,
        prohibited_chemicals_3yr=parcel.prohibited_chemicals_3yr or False,
        subplots=[]
    )

@router.put("/{parcel_id}/status")
def update_parcel_status(parcel_id: str, status: str, db: Session = Depends(get_db)):
    """Updates the inspection status of a parcel for visual map styling ('pending', 'in_progress', 'completed', 'non_compliant')."""
    parcel = db.query(Parcel).filter(Parcel.id == parcel_id).first()
    if not parcel:
        raise HTTPException(status_code=404, detail="Parcel not found")
        
    valid_statuses = ["pending", "in_progress", "completed", "non_compliant"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
        
    parcel.inspection_status = status
    db.commit()
    return {"success": True, "parcel_id": parcel_id, "status": status}
