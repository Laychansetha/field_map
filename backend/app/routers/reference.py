from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import Season, Village, Commune, Landscape, RiceVariety
from ..schemas import SeasonOut, VillageOut, RiceVarietyOut

router = APIRouter(prefix="/reference", tags=["Reference & Configurations"])

@router.get("/seasons", response_model=List[SeasonOut])
def get_seasons(db: Session = Depends(get_db)):
    return db.query(Season).order_by(Season.code.desc()).all()

@router.get("/villages", response_model=List[VillageOut])
def get_villages(db: Session = Depends(get_db)):
    villages = db.query(Village).all()
    results = []
    for v in villages:
        commune_name = v.commune.name if v.commune else None
        landscape_name = v.commune.landscape.name if v.commune and v.commune.landscape else None
        results.append(VillageOut(
            id=v.id,
            name=v.name,
            code=v.code,
            commune_name=commune_name,
            landscape_name=landscape_name
        ))
    return sorted(results, key=lambda x: x.name)

@router.get("/varieties", response_model=List[RiceVarietyOut])
def get_rice_varieties(db: Session = Depends(get_db)):
    return db.query(RiceVariety).filter(RiceVariety.is_active == True).all()
