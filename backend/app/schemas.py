from typing import List, Optional, Any, Dict
from datetime import date, datetime
from pydantic import BaseModel, Field

# ----------------------------------------------------------------------
# REFERENCE SCHEMAS
# ----------------------------------------------------------------------

class SeasonOut(BaseModel):
    id: int
    code: str
    name: str
    is_active: bool

    class Config:
        from_attributes = True

class VillageOut(BaseModel):
    id: int
    name: str
    code: Optional[str] = None
    commune_name: Optional[str] = None
    landscape_name: Optional[str] = None

class RiceVarietyOut(BaseModel):
    id: int
    code: str
    name_en: str
    name_kh: Optional[str] = None
    is_organic_certified: bool

    class Config:
        from_attributes = True

# ----------------------------------------------------------------------
# FARMER & HOUSEHOLD SCHEMAS
# ----------------------------------------------------------------------

class HouseholdProfileSchema(BaseModel):
    total_members: int = 1
    school_age_children: int = 0
    has_latrine: bool = False
    has_disabled_members: bool = False
    num_cows: int = 0
    num_buffalos: int = 0
    num_pigs: int = 0
    has_daily_records_book: bool = False
    trainings_received: List[str] = []

class FarmerBase(BaseModel):
    village_id: int
    family_code: str
    head_name: str
    gender: str = "male"
    ethnicity: str = "Khmer"
    id_card_number: Optional[str] = None
    phone_number: Optional[str] = None
    compliance_status: str = "compliant"
    notes: Optional[str] = None

class FarmerCreate(FarmerBase):
    profile: Optional[HouseholdProfileSchema] = None

class FarmerOut(FarmerBase):
    id: str
    village_name: Optional[str] = None
    commune_name: Optional[str] = None
    landscape_name: Optional[str] = None
    profile: Optional[HouseholdProfileSchema] = None
    parcels_count: int = 0
    total_gis_area_ha: float = 0.0

    class Config:
        from_attributes = True

# ----------------------------------------------------------------------
# PARCEL & SUBPLOT SCHEMAS
# ----------------------------------------------------------------------

class SubplotHarvestSchema(BaseModel):
    id: Optional[str] = None
    harvest_status: str = "completed"
    harvest_date: Optional[date] = None
    actual_production_kg: float = 0.0
    for_sale_kg: float = 0.0
    consumption_kg: float = 0.0
    seed_kept_kg: float = 0.0
    other_disposition_kg: float = 0.0
    threshing_method: str = "combine_harvester"
    contractor_name: Optional[str] = None
    flush_quantity_kg: float = 0.0
    payment_type: str = "cash"
    payment_amount_kg: float = 0.0
    drying_location: Optional[str] = None

class SubplotSchema(BaseModel):
    id: Optional[str] = None
    subplot_code: str
    variety_id: int
    variety_name: Optional[str] = None
    percentage_of_main: float
    calculated_area_ha: float
    geom_geojson: Optional[str] = None
    seed_source: str = "own_saved"
    seed_qty_kg: float = 0.0
    planting_method: str = "direct_seeding"
    planting_date: Optional[date] = None
    expected_yield_kg: float = 0.0
    expected_sales_kg: float = 0.0
    harvest: Optional[SubplotHarvestSchema] = None

class ParcelOut(BaseModel):
    id: str
    season_id: int = 1
    season_code: Optional[str] = "2026"
    farmer_id: str
    parcel_code: Optional[str] = None
    lat: float
    lng: float
    gis_area_ha: float
    geom_geojson: str
    inspection_status: str = "pending" # 'pending', 'in_progress', 'completed', 'non_compliant'
    land_tenure: str
    irrigation_type: str
    contamination_risk: bool
    buffer_zone_meters: float
    prohibited_chemicals_3yr: bool
    subplots: List[SubplotSchema] = []

    class Config:
        from_attributes = True

# ----------------------------------------------------------------------
# INSPECTION & SIGNATURE SCHEMAS
# ----------------------------------------------------------------------

class InspectionAnswerSchema(BaseModel):
    question_key: str
    answer_value: Any

class InspectionCreate(BaseModel):
    season_code: str = "2026"
    farmer_id: str
    parcel_id: Optional[str] = None
    inspector_id: Optional[str] = None
    inspection_type: str = "baseline_field"
    inspection_date: date
    status: str = "completed"
    recommendation: str = "approved_organic"
    inspector_notes: Optional[str] = None
    village_rep_name: Optional[str] = None
    digital_signature_blob: Optional[str] = None
    answers: List[InspectionAnswerSchema] = []
    farmer_profile: Optional[HouseholdProfileSchema] = None
    subplots: List[SubplotSchema] = []

# ----------------------------------------------------------------------
# DYNAMIC QUESTION DEFINITION SCHEMAS
# ----------------------------------------------------------------------

class QuestionDefinitionOut(BaseModel):
    id: int
    template_code: str
    stage_number: int
    section_name: str
    field_key: str
    label_en: str
    label_kh: Optional[str] = None
    input_type: str
    options: Optional[List[Dict[str, Any]]] = None
    validation_rules: Optional[Dict[str, Any]] = None
    conditional_display: Optional[Dict[str, Any]] = None
    display_order: int

class InspectionTemplateOut(BaseModel):
    template_code: str
    season_code: str
    stages: Dict[int, List[QuestionDefinitionOut]]
    varieties: List[RiceVarietyOut]

# ----------------------------------------------------------------------
# SYNC SCHEMAS
# ----------------------------------------------------------------------

class SyncItem(BaseModel):
    entity_type: str # 'farmer', 'inspection', 'subplot', 'harvest'
    operation: str   # 'insert', 'update', 'delete'
    entity_id: str
    client_timestamp: datetime
    payload: Dict[str, Any]

class SyncPushRequest(BaseModel):
    device_id: str
    items: List[SyncItem]

class SyncPushResponse(BaseModel):
    success: bool
    applied_count: int
    synced_ids: List[str]
    server_time: datetime
