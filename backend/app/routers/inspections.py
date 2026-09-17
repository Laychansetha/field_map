import json
import io
import csv
from datetime import datetime, date, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import (
    Inspection, InspectionAnswer, Farmer, Village, Season, Parcel,
    Subplot, SubplotHarvest, RiceVariety, HouseholdProfile
)
from ..schemas import InspectionCreate

router = APIRouter(prefix="/inspections", tags=["Inspections & Reporting"])

@router.post("/", response_model=dict)
def submit_inspection(payload: InspectionCreate, db: Session = Depends(get_db)):
    """
    Submits or updates an inspection event:
    1. Persists inspection record and digital signature.
    2. Updates or creates household profile for that farmer.
    3. Persists dynamic question answers.
    4. Upserts subplots and subplot harvests.
    """
    season = db.query(Season).filter(Season.code == payload.season_code).first()
    if not season:
        season = Season(code=payload.season_code, name=f"Season {payload.season_code}")
        db.add(season)
        db.commit()
        db.refresh(season)
        
    farmer = db.query(Farmer).filter(Farmer.id == payload.farmer_id).first()
    if not farmer:
        raise HTTPException(status_code=404, detail="Farmer not found")
        
    # Check if inspection already exists for this farmer and parcel in this season
    existing = db.query(Inspection).filter(
        Inspection.farmer_id == payload.farmer_id,
        Inspection.parcel_id == payload.parcel_id,
        Inspection.season_id == season.id
    ).first()
    
    if existing:
        insp = existing
        insp.inspection_date = payload.inspection_date
        insp.recommendation = payload.recommendation
        insp.inspector_notes = payload.inspector_notes
        insp.village_rep_name = payload.village_rep_name
        if payload.digital_signature_blob:
            insp.digital_signature_blob = payload.digital_signature_blob
        insp.updated_at = datetime.now(timezone.utc)
    else:
        insp = Inspection(
            season_id=season.id,
            farmer_id=payload.farmer_id,
            parcel_id=payload.parcel_id,
            inspector_id=payload.inspector_id,
            inspection_type=payload.inspection_type,
            inspection_date=payload.inspection_date,
            status=payload.status,
            recommendation=payload.recommendation,
            inspector_notes=payload.inspector_notes,
            village_rep_name=payload.village_rep_name,
            digital_signature_blob=payload.digital_signature_blob
        )
        db.add(insp)
        db.flush()
        
    # Save Household Profile
    if payload.farmer_profile:
        fp = payload.farmer_profile
        prof = db.query(HouseholdProfile).filter(HouseholdProfile.farmer_id == farmer.id).first()
        if not prof:
            prof = HouseholdProfile(farmer_id=farmer.id)
            db.add(prof)
        prof.total_members = fp.total_members
        prof.school_age_children = fp.school_age_children
        prof.has_latrine = fp.has_latrine
        prof.has_disabled_members = fp.has_disabled_members
        prof.num_cows = fp.num_cows
        prof.num_buffalos = fp.num_buffalos
        prof.num_pigs = fp.num_pigs
        prof.has_daily_records_book = fp.has_daily_records_book
        prof.trainings_received_json = json.dumps(fp.trainings_received)
        
    # Save Dynamic Answers
    for ans in payload.answers:
        existing_ans = db.query(InspectionAnswer).filter(
            InspectionAnswer.inspection_id == insp.id,
            InspectionAnswer.question_key == ans.question_key
        ).first()
        val_str = json.dumps(ans.answer_value) if not isinstance(ans.answer_value, str) else ans.answer_value
        if existing_ans:
            existing_ans.answer_value_json = val_str
            existing_ans.updated_at = datetime.now(timezone.utc)
        else:
            db.add(InspectionAnswer(
                inspection_id=insp.id,
                question_key=ans.question_key,
                answer_value_json=val_str
            ))
            
    # Save Subplots & Harvests
    if payload.parcel_id and payload.subplots:
        for s in payload.subplots:
            db_sub = db.query(Subplot).filter(
                Subplot.parcel_id == payload.parcel_id,
                Subplot.season_id == season.id,
                Subplot.subplot_code == s.subplot_code
            ).first()
            
            if not db_sub:
                db_sub = Subplot(
                    parcel_id=payload.parcel_id,
                    season_id=season.id,
                    subplot_code=s.subplot_code,
                    variety_id=s.variety_id,
                    percentage_of_main=s.percentage_of_main,
                    calculated_area_ha=s.calculated_area_ha,
                    geom_geojson=s.geom_geojson,
                    seed_source=s.seed_source,
                    seed_qty_kg=s.seed_qty_kg,
                    planting_method=s.planting_method,
                    planting_date=s.planting_date,
                    expected_yield_kg=s.expected_yield_kg,
                    expected_sales_kg=s.expected_sales_kg
                )
                db.add(db_sub)
                db.flush()
            else:
                db_sub.variety_id = s.variety_id
                db_sub.percentage_of_main = s.percentage_of_main
                db_sub.calculated_area_ha = s.calculated_area_ha
                if s.geom_geojson:
                    db_sub.geom_geojson = s.geom_geojson
                db_sub.seed_source = s.seed_source
                db_sub.seed_qty_kg = s.seed_qty_kg
                db_sub.planting_method = s.planting_method
                db_sub.planting_date = s.planting_date
                db_sub.expected_yield_kg = s.expected_yield_kg
                db_sub.expected_sales_kg = s.expected_sales_kg
                
            # Upsert Subplot Harvest
            if s.harvest:
                h = s.harvest
                db_harv = db.query(SubplotHarvest).filter(SubplotHarvest.subplot_id == db_sub.id).first()
                if not db_harv:
                    db_harv = SubplotHarvest(
                        subplot_id=db_sub.id,
                        inspection_id=insp.id,
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
                    db.add(db_harv)
                else:
                    db_harv.inspection_id = insp.id
                    db_harv.harvest_status = h.harvest_status
                    db_harv.harvest_date = h.harvest_date
                    db_harv.actual_production_kg = h.actual_production_kg
                    db_harv.for_sale_kg = h.for_sale_kg
                    db_harv.consumption_kg = h.consumption_kg
                    db_harv.seed_kept_kg = h.seed_kept_kg
                    db_harv.other_disposition_kg = h.other_disposition_kg
                    db_harv.threshing_method = h.threshing_method
                    db_harv.contractor_name = h.contractor_name
                    db_harv.flush_quantity_kg = h.flush_quantity_kg
                    db_harv.payment_type = h.payment_type
                    db_harv.payment_amount_kg = h.payment_amount_kg
                    db_harv.drying_location = h.drying_location
                    
    db.commit()
    return {"success": True, "inspection_id": insp.id, "farmer_id": farmer.id}

@router.get("/export/farmer-csv")
def export_farmer_csv(
    village_name: str = Query(...),
    family_code: str = Query(...),
    season_code: str = Query("2026"),
    db: Session = Depends(get_db)
):
    """
    Exports the comprehensive single-farmer inspection report (Farmer, Parcels, Subplots, Harvest, Post-Harvest, Confirmation)
    strictly scoped to the requested Village + Family ID.
    """
    village = db.query(Village).filter(Village.name.ilike(village_name.strip())).first()
    if not village:
        raise HTTPException(status_code=404, detail="Village not found")
        
    farmer = db.query(Farmer).filter(
        Farmer.village_id == village.id,
        Farmer.family_code.ilike(family_code.strip())
    ).first()
    if not farmer:
        raise HTTPException(status_code=404, detail="Farmer not found")
        
    parcels = db.query(Parcel).filter(Parcel.farmer_id == farmer.id).all()
    season = db.query(Season).filter(Season.code == season_code).first()
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Headers
    writer.writerow([
        "Season", "Landscape", "Commune", "Village", "Family_ID", "Head_of_Family",
        "Gender", "Ethnicity", "Compliance_Status", "Parcel_Code", "GIS_Area_Ha",
        "Land_Tenure", "Irrigation", "Subplot_Code", "Rice_Variety", "Subplot_Pct",
        "Subplot_Area_Ha", "Planting_Method", "Seed_Qty_Kg", "Expected_Yield_Kg",
        "Harvest_Actual_Kg", "Sale_Kg", "Household_Kg", "Seed_Saved_Kg",
        "Threshing_Method", "Recommendation", "Inspector_Notes", "Village_Rep", "Export_Date"
    ])
    
    commune_name = village.commune.name if village.commune else ""
    landscape_name = village.commune.landscape.name if village.commune and village.commune.landscape else ""
    now_str = date.today().isoformat()
    
    for p in parcels:
        subplots = []
        if season:
            subplots = db.query(Subplot).filter(
                Subplot.parcel_id == p.id,
                Subplot.season_id == season.id
            ).all()
            
        if not subplots:
            # Row without subplots
            writer.writerow([
                season_code, landscape_name, commune_name, village.name, farmer.family_code,
                farmer.head_name, farmer.gender, farmer.ethnicity, farmer.compliance_status,
                p.parcel_code or "", p.gis_area_ha, p.land_tenure, p.irrigation_type,
                "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", now_str
            ])
        else:
            for s in subplots:
                var_name = s.variety.name_en if s.variety else ""
                h = s.harvest
                act_kg = h.actual_production_kg if h else ""
                sale_kg = h.for_sale_kg if h else ""
                house_kg = h.consumption_kg if h else ""
                seed_kg = h.seed_kept_kg if h else ""
                method = h.threshing_method if h else ""
                
                writer.writerow([
                    season_code, landscape_name, commune_name, village.name, farmer.family_code,
                    farmer.head_name, farmer.gender, farmer.ethnicity, farmer.compliance_status,
                    p.parcel_code or "", p.gis_area_ha, p.land_tenure, p.irrigation_type,
                    s.subplot_code, var_name, s.percentage_of_main, s.calculated_area_ha,
                    s.planting_method, s.seed_qty_kg, s.expected_yield_kg,
                    act_kg, sale_kg, house_kg, seed_kg, method,
                    "Approved Organic", "", "", now_str
                ])
                
    output.seek(0)
    filename = f"ibis_inspection_{village.name}_{farmer.family_code}_{season_code}_{now_str}.csv".replace(" ", "_")
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
