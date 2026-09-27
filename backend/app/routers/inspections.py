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
    Subplot, SubplotHarvest, RiceVariety, HouseholdProfile, User,
    Commune, Landscape
)
from ..schemas import InspectionCreate
from .auth import require_staff, require_admin, parse_user_territories

router = APIRouter(prefix="/inspections", tags=["Inspections & Reporting"])

@router.post("/", response_model=dict)
def submit_inspection(
    payload: InspectionCreate,
    staff_user: User = Depends(require_staff),
    db: Session = Depends(get_db)
):
    """
    Submits or updates an inspection event:
    1. Validates staff authorization and territory boundary scoping.
    2. Persists inspection record and digital signature.
    3. Updates or creates household profile for that farmer.
    4. Persists dynamic question answers.
    5. Upserts subplots and subplot harvests.
    """
    # Territory boundary scoping check for field inspectors
    if staff_user.role in ("inspector", "supervisor"):
        target_farmer = db.query(Farmer).filter(Farmer.id == payload.farmer_id).first()
        if target_farmer and target_farmer.village:
            v = target_farmer.village
            commune = v.commune
            landscape = commune.landscape if commune else None
            land_name = landscape.name if landscape else None
            assigned_vills, assigned_lands = parse_user_territories(staff_user)
            if assigned_lands and land_name and land_name not in assigned_lands:
                raise HTTPException(
                    status_code=403,
                    detail=f"Access denied: Parcel is in '{land_name}', which is outside your assigned territory ({', '.join(assigned_lands)})."
                )
            if assigned_vills and v.id not in assigned_vills:
                raise HTTPException(
                    status_code=403,
                    detail=f"Access denied: Parcel village '{v.name}' is outside your assigned villages."
                )

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
        if payload.inspection_phase:
            insp.inspection_phase = payload.inspection_phase
        insp.updated_at = datetime.now(timezone.utc)
    else:
        insp = Inspection(
            season_id=season.id,
            farmer_id=payload.farmer_id,
            parcel_id=payload.parcel_id,
            inspector_id=staff_user.id,
            inspection_type=payload.inspection_type,
            inspection_phase=payload.inspection_phase or "phase_1_planting",
            inspection_date=payload.inspection_date,
            status=payload.status,
            recommendation=payload.recommendation,
            inspector_notes=payload.inspector_notes,
            village_rep_name=payload.village_rep_name,
            digital_signature_blob=payload.digital_signature_blob
        )
        db.add(insp)
        db.flush()

    # Track Phase Milestones
    today = date.today()
    if payload.inspection_phase == "phase_1_planting" or payload.phase_1_completed:
        insp.phase_1_completed = True
        if not insp.phase_1_date:
            insp.phase_1_date = today
    if payload.inspection_phase == "phase_2_harvest" or payload.phase_2_completed:
        insp.phase_2_completed = True
        if not insp.phase_2_date:
            insp.phase_2_date = today
    if payload.inspection_phase in ("phase_3_post_harvest", "phase_final") or payload.phase_3_completed:
        insp.phase_3_completed = True
        if not insp.phase_3_date:
            insp.phase_3_date = today
        
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
        "Gender", "Ethnicity", "Farmer_Status", "Compliance_Status", "Parcel_Code", "Land_Organic_Status", "GIS_Area_Ha",
        "Land_Tenure", "Irrigation", "Subplot_Code", "Rice_Variety", "Subplot_Pct",
        "Subplot_Area_Ha", "Planting_Method", "Seed_Qty_Kg", "Expected_Yield_Kg",
        "Harvest_Actual_Kg", "Sale_Kg", "Household_Kg", "Seed_Saved_Kg",
        "Threshing_Method", "Recommendation", "Inspector_Notes", "Village_Rep", "Export_Date"
    ])
    
    commune_name = village.commune.name if village.commune else ""
    landscape_name = village.commune.landscape.name if village.commune and village.commune.landscape else ""
    now_str = date.today().isoformat()
    farmer_status_val = getattr(farmer, 'farmer_status', None) or "Existing"
    farmer_comp_val = farmer.compliance_status or "Compliance"
    
    for p in parcels:
        subplots = []
        land_status_val = getattr(p, 'land_status', None) or "Organic"
        if season:
            subplots = db.query(Subplot).filter(
                Subplot.parcel_id == p.id,
                Subplot.season_id == season.id
            ).all()
            
        if not subplots:
            # Row without subplots
            writer.writerow([
                season_code, landscape_name, commune_name, village.name, farmer.family_code,
                farmer.head_name, farmer.gender, farmer.ethnicity, farmer_status_val, farmer_comp_val,
                p.parcel_code or "", land_status_val, p.gis_area_ha, p.land_tenure, p.irrigation_type,
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
                    farmer.head_name, farmer.gender, farmer.ethnicity, farmer_status_val, farmer_comp_val,
                    p.parcel_code or "", land_status_val, p.gis_area_ha, p.land_tenure, p.irrigation_type,
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

@router.get("/by-parcel/{parcel_id}", response_model=dict)
def get_inspection_by_parcel(
    parcel_id: str,
    season_code: str = Query("2026"),
    staff_user: User = Depends(require_staff),
    db: Session = Depends(get_db)
):
    """Retrieves existing inspection progress, answers, and phase milestone status for a parcel."""
    season = db.query(Season).filter(Season.code == season_code).first()
    if not season:
        return {"inspection": None}
        
    insp = db.query(Inspection).filter(
        Inspection.parcel_id == parcel_id,
        Inspection.season_id == season.id
    ).first()
    
    if not insp:
        return {"inspection": None}
        
    # Collate answers
    answers_dict = {}
    for ans in insp.answers:
        try:
            answers_dict[ans.question_key] = json.loads(ans.answer_value_json)
        except Exception:
            answers_dict[ans.question_key] = ans.answer_value_json
            
    return {
        "inspection": {
            "id": insp.id,
            "season_code": season_code,
            "farmer_id": insp.farmer_id,
            "parcel_id": insp.parcel_id,
            "inspection_phase": insp.inspection_phase,
            "phase_1_completed": insp.phase_1_completed,
            "phase_2_completed": insp.phase_2_completed,
            "phase_3_completed": insp.phase_3_completed,
            "phase_1_date": insp.phase_1_date.isoformat() if insp.phase_1_date else None,
            "phase_2_date": insp.phase_2_date.isoformat() if insp.phase_2_date else None,
            "phase_3_date": insp.phase_3_date.isoformat() if insp.phase_3_date else None,
            "inspection_date": insp.inspection_date.isoformat() if insp.inspection_date else None,
            "status": insp.status,
            "recommendation": insp.recommendation,
            "inspector_notes": insp.inspector_notes,
            "village_rep_name": insp.village_rep_name,
            "answers": answers_dict,
            "is_locked": insp.is_locked
        }
    }

@router.get("/export/master-ics-csv")
def export_master_ics_csv(
    landscape_name: Optional[str] = Query(None),
    village_name: Optional[str] = Query(None),
    season_code: str = Query("2026"),
    phase: Optional[str] = Query(None),
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Master ICS Data Center export:
    Streams a complete, multi-filter CSV audit dataset containing farmer identity,
    parcel organic baseline, subplots, harvest volumes, post-harvest compliance,
    and milestone phase statuses.
    """
    season = db.query(Season).filter(Season.code == season_code).first()
    
    from sqlalchemy.orm import joinedload
    
    # Batch-load all matching parcels with full owner hierarchy in a single SQL query
    q = db.query(Parcel).join(Farmer).join(Village)
    if village_name:
        q = q.filter(Village.name.ilike(village_name.strip()))
    elif landscape_name:
        q = q.join(Commune, Village.commune_id == Commune.id).join(Landscape, Commune.landscape_id == Landscape.id)
        q = q.filter(Landscape.name.ilike(landscape_name.strip()))
        
    parcels = q.options(
        joinedload(Parcel.farmer).joinedload(Farmer.village).joinedload(Village.commune).joinedload(Commune.landscape)
    ).all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header row
    writer.writerow([
        "Season", "Landscape", "Commune", "Village", "Family_ID", "Head_of_Family",
        "Gender", "Farmer_Status", "Compliance_Status", "Parcel_Code", "Land_Organic_Status",
        "GIS_Area_Ha", "Subplot_Code", "Rice_Variety", "Subplot_Pct", "Subplot_Area_Ha",
        "Planting_Date", "Expected_Yield_Kg", "Phase_1_Completed", "Phase_1_Date",
        "Harvest_Actual_Kg", "Sold_Kg", "Household_Kg", "Seed_Saved_Kg", "Threshing_Method",
        "Phase_2_Completed", "Phase_2_Date", "Recommendation", "Inspector_Notes",
        "Phase_3_Completed", "Phase_3_Date", "Audit_Status"
    ])
    
    now_str = date.today().isoformat()
    
    # Pre-fetch all inspections and subplots for this season into memory maps to avoid N+1 query overhead
    insp_by_parcel = {}
    subplots_by_parcel = {}
    if season:
        for insp in db.query(Inspection).filter(Inspection.season_id == season.id).all():
            if insp.parcel_id:
                insp_by_parcel[insp.parcel_id] = insp
        for sub in db.query(Subplot).filter(Subplot.season_id == season.id).all():
            subplots_by_parcel.setdefault(sub.parcel_id, []).append(sub)

    for p in parcels:
        f = p.farmer
        if not f:
            continue
        v = f.village
        commune_name = v.commune.name if v and v.commune else ""
        landscape_str = v.commune.landscape.name if v and v.commune and v.commune.landscape else ""
        f_status = getattr(f, 'farmer_status', None) or "Existing"
        f_comp = f.compliance_status or "Compliance"
        land_status_val = getattr(p, 'land_status', None) or "Organic"
        
        # Fetch inspection from pre-indexed map
        insp = insp_by_parcel.get(p.id)
            
        # Filter by phase if specified
        if phase == "phase_1" and (not insp or not insp.phase_1_completed):
            continue
        elif phase == "phase_2" and (not insp or not insp.phase_2_completed):
            continue
        elif phase == "phase_3" and (not insp or not insp.phase_3_completed):
            continue
            
        p1_done = "YES" if (insp and insp.phase_1_completed) else "NO"
        p1_date = insp.phase_1_date.isoformat() if (insp and insp.phase_1_date) else ""
        p2_done = "YES" if (insp and insp.phase_2_completed) else "NO"
        p2_date = insp.phase_2_date.isoformat() if (insp and insp.phase_2_date) else ""
        p3_done = "YES" if (insp and insp.phase_3_completed) else "NO"
        p3_date = insp.phase_3_date.isoformat() if (insp and insp.phase_3_date) else ""
        recom = insp.recommendation if insp else "Pending"
        notes = insp.inspector_notes if insp else ""
        audit_stat = insp.status if insp else "Uninspected"
        
        subplots = subplots_by_parcel.get(p.id, [])
                
        if not subplots:
            writer.writerow([
                season_code, landscape_str, commune_name, v.name if v else "", f.family_code,
                f.head_name, f.gender, f_status, f_comp, p.parcel_code or "", land_status_val,
                p.gis_area_ha, "", "", "", "", "", "", p1_done, p1_date,
                "", "", "", "", "", p2_done, p2_date, recom, notes, p3_done, p3_date, audit_stat
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
                p_date = s.planting_date.isoformat() if s.planting_date else ""
                
                writer.writerow([
                    season_code, landscape_str, commune_name, v.name if v else "", f.family_code,
                    f.head_name, f.gender, f_status, f_comp, p.parcel_code or "", land_status_val,
                    p.gis_area_ha, s.subplot_code, var_name, s.percentage_of_main, s.calculated_area_ha,
                    p_date, s.expected_yield_kg, p1_done, p1_date,
                    act_kg, sale_kg, house_kg, seed_kg, method,
                    p2_done, p2_date, recom, notes, p3_done, p3_date, audit_stat
                ])
                    
    output.seek(0)
    target_tag = (village_name or landscape_name or "Nationwide").replace(" ", "_")
    filename = f"ibis_master_ics_{target_tag}_{season_code}_{now_str}.csv"
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )
