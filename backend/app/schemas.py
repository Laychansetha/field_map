from typing import List, Optional, Any, Dict
from datetime import date, datetime
from pydantic import BaseModel, Field

# ----------------------------------------------------------------------
# 1. REFERENCE & MASTER SCHEMAS
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

    class Config:
        from_attributes = True

class RiceVarietyOut(BaseModel):
    id: int
    code: str
    name_en: str
    name_kh: Optional[str] = None
    is_organic_certified: bool

    class Config:
        from_attributes = True

# ----------------------------------------------------------------------
# 2. USER & AUTHENTICATION SCHEMAS
# ----------------------------------------------------------------------

class UserLogin(BaseModel):
    email: str
    password: str

class PinLogin(BaseModel):
    user_id: str
    pin: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    full_name: str
    user_id: str
    assigned_villages: List[int] = []
    assigned_landscapes: List[str] = []

class UserOut(BaseModel):
    id: str
    email: Optional[str] = None
    full_name: str
    role: str # 'admin', 'supervisor', 'inspector', 'public'
    phone: Optional[str] = None
    assigned_villages: List[int] = []
    assigned_landscapes: List[str] = []
    pin: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True

class UserCreate(BaseModel):
    email: Optional[str] = None
    full_name: str
    role: str = "inspector"
    phone: Optional[str] = None
    pin: Optional[str] = None # 4-digit PIN e.g. "1234"
    password: Optional[str] = None
    assigned_villages: List[int] = []
    assigned_landscapes: List[str] = []
    is_active: bool = True

class UserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    phone: Optional[str] = None
    pin: Optional[str] = None
    password: Optional[str] = None
    assigned_villages: Optional[List[int]] = None
    assigned_landscapes: Optional[List[str]] = None
    is_active: Optional[bool] = None

# ----------------------------------------------------------------------
# 3. FARMER & HOUSEHOLD SCHEMAS
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
    farmer_status: str = "Existing"  # 'Existing', 'New', 'Rejoin'
    compliance_status: str = "Compliance"  # 'Compliance', 'Non-Compliance', 'Resign'
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
# 4. PARCEL, PLOT & SPATIAL GEOMETRY SCHEMAS
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

class PlotGeometryHistoryOut(BaseModel):
    id: str
    season_code: str
    gis_area_ha: float
    centroid_lat: float
    centroid_lng: float
    geom_geojson: str
    is_current: bool
    source_file_version: Optional[str] = None
    effective_start_date: datetime

    class Config:
        from_attributes = True

class PlotSeasonRegistrationOut(BaseModel):
    id: str
    plot_id: str
    season_id: int
    farmer_id: str
    inspection_status: str
    risk_level: str
    land_status: str = "Organic"
    buffer_zone_meters: float
    contamination_risk: bool
    prohibited_chemicals_3yr: bool

    class Config:
        from_attributes = True

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
    land_status: str = "Organic"
    land_tenure: str
    irrigation_type: str
    contamination_risk: bool
    buffer_zone_meters: float
    prohibited_chemicals_3yr: bool
    subplots: List[SubplotSchema] = []

    class Config:
        from_attributes = True

# ----------------------------------------------------------------------
# 5. INSPECTION & SIGNATURE SCHEMAS
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
    inspection_phase: str = "phase_1_planting" # 'phase_1_planting', 'phase_2_harvest', 'phase_3_post_harvest', 'phase_final'
    phase_1_completed: Optional[bool] = None
    phase_2_completed: Optional[bool] = None
    phase_3_completed: Optional[bool] = None
    inspection_date: date
    status: str = "completed"
    recommendation: str = "approved_organic"
    inspector_notes: Optional[str] = None
    village_rep_name: Optional[str] = None
    digital_signature_blob: Optional[str] = None
    answers: List[InspectionAnswerSchema] = []
    farmer_profile: Optional[HouseholdProfileSchema] = None
    subplots: List[SubplotSchema] = []

class InspectionDetailOut(BaseModel):
    id: str
    season_code: str
    farmer_id: str
    parcel_id: Optional[str] = None
    inspector_id: Optional[str] = None
    inspection_type: str
    inspection_phase: str
    phase_1_completed: bool = False
    phase_2_completed: bool = False
    phase_3_completed: bool = False
    phase_1_date: Optional[date] = None
    phase_2_date: Optional[date] = None
    phase_3_date: Optional[date] = None
    inspection_date: date
    status: str
    recommendation: str
    inspector_notes: Optional[str] = None
    village_rep_name: Optional[str] = None
    answers: Dict[str, Any] = {}
    is_locked: bool = False

    class Config:
        from_attributes = True

# ----------------------------------------------------------------------
# 6. DYNAMIC QUESTION DEFINITIONS
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
# 7. TRACEABILITY SCHEMAS (FARM GATE TO EXPORT)
# ----------------------------------------------------------------------

class HarvestBagOut(BaseModel):
    id: str
    subplot_id: str
    bag_barcode: str
    gross_weight_kg: float
    moisture_percentage: float
    is_organic_certified: bool
    created_at: datetime

    class Config:
        from_attributes = True

class ProcurementReceiptCreate(BaseModel):
    season_code: str
    farmer_id: str
    buying_station_name: str
    purchase_date: date
    total_bags: int
    total_kg: float
    base_price_riel: float
    organic_premium_riel: float
    payment_status: str = "paid"

class ProcurementReceiptOut(BaseModel):
    id: str
    receipt_code: str
    season_id: int
    farmer_id: str
    farmer_name: Optional[str] = None
    village_name: Optional[str] = None
    buying_station_name: str
    purchase_date: date
    total_bags: int
    total_kg: float
    total_payout_riel: float
    payment_status: str

    class Config:
        from_attributes = True

class WarehouseLotOut(BaseModel):
    id: str
    lot_code: str
    warehouse_name: str
    total_weight_kg: float
    storage_bay: Optional[str] = None
    intake_date: date
    is_fumigation_free: bool

    class Config:
        from_attributes = True

class MillingBatchOut(BaseModel):
    id: str
    batch_code: str
    mill_name: str
    milling_date: date
    input_paddy_kg: float
    output_milled_kg: float
    milling_yield_pct: float

    class Config:
        from_attributes = True

class ExportShipmentOut(BaseModel):
    id: str
    shipment_code: str
    destination_country: str
    importer_name: str
    container_number: Optional[str] = None
    phytosanitary_cert: Optional[str] = None
    organic_cert_number: Optional[str] = None
    qr_verification_code: str
    shipping_date: Optional[date] = None

    class Config:
        from_attributes = True

class PublicTraceabilityOut(BaseModel):
    """
    Sanitized public-facing response for consumers scanning the QR code.
    Protects farmer personal PII while showcasing conservation and organic credentials.
    """
    shipment_code: str
    destination_country: str
    variety_name: str
    organic_certification: str
    landscape_name: str
    village_name: str
    conservation_impact_summary: str
    deforestation_free_verified: bool
    wildlife_friendly_certified: bool
    harvest_season: str

# ----------------------------------------------------------------------
# 8. GIS DIFF & ANNUAL INGESTION SCHEMAS
# ----------------------------------------------------------------------

class GisDiffItem(BaseModel):
    plot_id: Optional[str] = None
    plot_code: str
    family_code: str
    village_name: str
    diff_status: str # 'UNCHANGED', 'BOUNDARY_MODIFIED', 'NEW_PLOT', 'SPLIT_PLOT', 'REMOVED'
    area_old_ha: Optional[float] = None
    area_new_ha: float
    area_diff_ha: float = 0.0

class GisDiffSummary(BaseModel):
    season_code: str
    source_filename: str
    total_features: int
    unchanged_count: int
    modified_count: int
    new_count: int
    split_count: int
    removed_count: int
    items_sample: List[GisDiffItem]

# ----------------------------------------------------------------------
# 9. SYNC SCHEMAS
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
