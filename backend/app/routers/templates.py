import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, List
from ..database import get_db
from ..models import QuestionDefinition, RiceVariety, Season
from ..schemas import QuestionDefinitionOut, InspectionTemplateOut, RiceVarietyOut, QuestionDefinitionCreate

router = APIRouter(prefix="/templates", tags=["Inspection Templates & Dynamic Form Schema"])

@router.post("/questions", response_model=QuestionDefinitionOut)
def create_or_update_question(payload: QuestionDefinitionCreate, db: Session = Depends(get_db)):
    """
    Admin endpoint to define or update custom inspection form questions per season.
    """
    existing = db.query(QuestionDefinition).filter(
        QuestionDefinition.template_code == payload.template_code,
        QuestionDefinition.field_key == payload.field_key
    ).first()

    options_str = json.dumps(payload.options) if payload.options else None
    val_rules_str = json.dumps(payload.validation_rules) if payload.validation_rules else None
    cond_display_str = json.dumps(payload.conditional_display) if payload.conditional_display else None

    if existing:
        existing.stage_number = payload.stage_number
        existing.section_name = payload.section_name
        existing.label_en = payload.label_en
        existing.label_kh = payload.label_kh
        existing.input_type = payload.input_type
        existing.options_json = options_str
        existing.validation_rules_json = val_rules_str
        existing.conditional_display_json = cond_display_str
        existing.display_order = payload.display_order
        existing.is_active = True
        db.commit()
        db.refresh(existing)
        q = existing
    else:
        q = QuestionDefinition(
            template_code=payload.template_code,
            stage_number=payload.stage_number,
            section_name=payload.section_name,
            field_key=payload.field_key,
            label_en=payload.label_en,
            label_kh=payload.label_kh,
            input_type=payload.input_type,
            options_json=options_str,
            validation_rules_json=val_rules_str,
            conditional_display_json=cond_display_str,
            display_order=payload.display_order,
            is_active=True
        )
        db.add(q)
        db.commit()
        db.refresh(q)

    return QuestionDefinitionOut(
        id=q.id,
        template_code=q.template_code,
        stage_number=q.stage_number,
        section_name=q.section_name,
        field_key=q.field_key,
        label_en=q.label_en,
        label_kh=q.label_kh,
        input_type=q.input_type,
        options=payload.options,
        validation_rules=payload.validation_rules,
        conditional_display=payload.conditional_display,
        display_order=q.display_order
    )

@router.get("/{template_code}", response_model=InspectionTemplateOut)
def get_inspection_template(template_code: str, season_code: str = "2026", db: Session = Depends(get_db)):
    """
    Returns the complete dynamic questionnaire structure grouped by inspection stage (1 to 5).
    Allows adding or changing inspection questions for future seasons without frontend redeployment.
    """
    questions = db.query(QuestionDefinition).filter(
        QuestionDefinition.template_code == template_code,
        QuestionDefinition.is_active == True
    ).order_by(QuestionDefinition.stage_number, QuestionDefinition.display_order).all()
    
    stages: Dict[int, List[QuestionDefinitionOut]] = {1: [], 2: [], 3: [], 4: [], 5: []}
    for q in questions:
        options = None
        if q.options_json:
            try:
                options = json.loads(q.options_json)
            except Exception:
                options = None
                
        val_rules = None
        if q.validation_rules_json:
            try:
                val_rules = json.loads(q.validation_rules_json)
            except Exception:
                val_rules = None
                
        cond_display = None
        if q.conditional_display_json:
            try:
                cond_display = json.loads(q.conditional_display_json)
            except Exception:
                cond_display = None
                
        item = QuestionDefinitionOut(
            id=q.id,
            template_code=q.template_code,
            stage_number=q.stage_number,
            section_name=q.section_name,
            field_key=q.field_key,
            label_en=q.label_en,
            label_kh=q.label_kh,
            input_type=q.input_type,
            options=options,
            validation_rules=val_rules,
            conditional_display=cond_display,
            display_order=q.display_order
        )
        if q.stage_number in stages:
            stages[q.stage_number].append(item)
        else:
            stages[q.stage_number] = [item]
            
    varieties = db.query(RiceVariety).filter(RiceVariety.is_active == True).all()
    varieties_out = [
        RiceVarietyOut(
            id=v.id,
            code=v.code,
            name_en=v.name_en,
            name_kh=v.name_kh,
            is_organic_certified=v.is_organic_certified
        ) for v in varieties
    ]
    
    return InspectionTemplateOut(
        template_code=template_code,
        season_code=season_code,
        stages=stages,
        varieties=varieties_out
    )
