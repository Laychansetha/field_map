import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from ..models import Farmer, Village, HouseholdProfile, Parcel
from ..schemas import FarmerOut, HouseholdProfileSchema, FarmerCreate

router = APIRouter(prefix="/farmers", tags=["Farmers & Household Profiles"])

@router.get("/lookup", response_model=Optional[FarmerOut])
def lookup_farmer_by_village_and_family(
    village_name: str = Query(..., description="Village name e.g. Kral Peas"),
    family_code: str = Query(..., description="Family ID e.g. SB049"),
    db: Session = Depends(get_db)
):
    """
    Unique farmer lookup using the required composite key: Village + Family ID.
    Prevents accidental collisions when identical family codes exist across different villages.
    """
    village = db.query(Village).filter(Village.name.ilike(village_name.strip())).first()
    if not village:
        raise HTTPException(status_code=404, detail=f"Village '{village_name}' not found")
        
    farmer = db.query(Farmer).filter(
        Farmer.village_id == village.id,
        Farmer.family_code.ilike(family_code.strip())
    ).first()
    
    if not farmer:
        raise HTTPException(status_code=404, detail=f"Farmer '{family_code}' not found in {village_name}")
        
    profile_data = None
    if farmer.profile:
        trainings = []
        if farmer.profile.trainings_received_json:
            try:
                trainings = json.loads(farmer.profile.trainings_received_json)
            except Exception:
                trainings = []
                
        profile_data = HouseholdProfileSchema(
            total_members=farmer.profile.total_members or 1,
            school_age_children=farmer.profile.school_age_children or 0,
            has_latrine=farmer.profile.has_latrine or False,
            has_disabled_members=farmer.profile.has_disabled_members or False,
            num_cows=farmer.profile.num_cows or 0,
            num_buffalos=farmer.profile.num_buffalos or 0,
            num_pigs=farmer.profile.num_pigs or 0,
            has_daily_records_book=farmer.profile.has_daily_records_book or False,
            trainings_received=trainings
        )
        
    parcels = db.query(Parcel).filter(Parcel.farmer_id == farmer.id).all()
    total_area = sum(p.gis_area_ha for p in parcels)
    
    commune_name = village.commune.name if village.commune else None
    landscape_name = village.commune.landscape.name if village.commune and village.commune.landscape else None
    
    return FarmerOut(
        id=farmer.id,
        village_id=farmer.village_id,
        family_code=farmer.family_code,
        head_name=farmer.head_name,
        gender=farmer.gender or "male",
        ethnicity=farmer.ethnicity or "Khmer",
        id_card_number=farmer.id_card_number,
        phone_number=farmer.phone_number,
        compliance_status=farmer.compliance_status or "compliant",
        notes=farmer.notes,
        village_name=village.name,
        commune_name=commune_name,
        landscape_name=landscape_name,
        profile=profile_data,
        parcels_count=len(parcels),
        total_gis_area_ha=round(total_area, 4)
    )

@router.put("/{farmer_id}/profile", response_model=HouseholdProfileSchema)
def update_farmer_profile(
    farmer_id: str,
    profile_in: HouseholdProfileSchema,
    db: Session = Depends(get_db)
):
    """Updates household demographics and trainings for a specific farmer."""
    farmer = db.query(Farmer).filter(Farmer.id == farmer_id).first()
    if not farmer:
        raise HTTPException(status_code=404, detail="Farmer not found")
        
    profile = db.query(HouseholdProfile).filter(HouseholdProfile.farmer_id == farmer_id).first()
    if not profile:
        profile = HouseholdProfile(farmer_id=farmer_id)
        db.add(profile)
        
    profile.total_members = profile_in.total_members
    profile.school_age_children = profile_in.school_age_children
    profile.has_latrine = profile_in.has_latrine
    profile.has_disabled_members = profile_in.has_disabled_members
    profile.num_cows = profile_in.num_cows
    profile.num_buffalos = profile_in.num_buffalos
    profile.num_pigs = profile_in.num_pigs
    profile.has_daily_records_book = profile_in.has_daily_records_book
    profile.trainings_received_json = json.dumps(profile_in.trainings_received)
    
    db.commit()
    db.refresh(profile)
    return profile_in
