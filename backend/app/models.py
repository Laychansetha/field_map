import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, Date, DateTime, Text,
    ForeignKey, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from .database import Base

def gen_uuid():
    return str(uuid.uuid4())

def utc_now():
    return datetime.now(timezone.utc)

# ----------------------------------------------------------------------
# 1. REFERENCE & MASTER TABLES
# ----------------------------------------------------------------------

class Season(Base):
    __tablename__ = "seasons"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(32), unique=True, nullable=False, index=True) # e.g. '2025', '2026', '2027'
    name = Column(String(128), nullable=False)                         # e.g. 'ICS Season 2026'
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)
    
    subplots = relationship("Subplot", back_populates="season")
    inspections = relationship("Inspection", back_populates="season")
    parcels = relationship("Parcel", back_populates="season", cascade="all, delete-orphan")
    plot_registrations = relationship("PlotSeasonRegistration", back_populates="season", cascade="all, delete-orphan")
    procurement_receipts = relationship("ProcurementReceipt", back_populates="season")
    warehouse_lots = relationship("WarehouseLot", back_populates="season")

class Landscape(Base):
    __tablename__ = "landscapes"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(128), unique=True, nullable=False) # 'Preah Vihear', 'Siem Pang', 'Keo Seima'
    
    communes = relationship("Commune", back_populates="landscape", cascade="all, delete-orphan")

class Commune(Base):
    __tablename__ = "communes"
    
    id = Column(Integer, primary_key=True, index=True)
    landscape_id = Column(Integer, ForeignKey("landscapes.id"), nullable=False)
    name = Column(String(128), nullable=False)
    code = Column(String(64), nullable=True)
    
    landscape = relationship("Landscape", back_populates="communes")
    villages = relationship("Village", back_populates="commune", cascade="all, delete-orphan")

class Village(Base):
    __tablename__ = "villages"
    
    id = Column(Integer, primary_key=True, index=True)
    commune_id = Column(Integer, ForeignKey("communes.id"), nullable=False)
    name = Column(String(128), nullable=False, index=True) # 'Kral Peas', 'Srayang', 'Sambou'
    code = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=utc_now)
    
    __table_args__ = (UniqueConstraint("commune_id", "name", name="uq_commune_village"),)
    
    commune = relationship("Commune", back_populates="villages")
    farmers = relationship("Farmer", back_populates="village")

class RiceVariety(Base):
    __tablename__ = "rice_varieties"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(32), unique=True, nullable=False) # 'PKR', 'RED', 'STICKY', 'LOCAL', 'OTHER', 'FALLOW'
    name_en = Column(String(128), nullable=False)          # 'Phka Rumduol'
    name_kh = Column(String(128), nullable=True)           # 'ផ្ការំដួល'
    is_organic_certified = Column(Boolean, default=True)
    is_active = Column(Boolean, default=True)
    
    subplots = relationship("Subplot", back_populates="variety")
    warehouse_lots = relationship("WarehouseLot", back_populates="variety")

class User(Base):
    __tablename__ = "users"
    
    id = Column(String(36), primary_key=True, default=gen_uuid)
    email = Column(String(255), unique=True, nullable=True, index=True)
    full_name = Column(String(255), nullable=False)
    role = Column(String(64), default="inspector", index=True) # 'admin', 'supervisor', 'inspector', 'public'
    phone = Column(String(64), nullable=True)
    hashed_password = Column(String(255), nullable=True)
    pin_hash = Column(String(255), nullable=True)  # Fast 4-digit PIN for offline field unlock
    assigned_villages_json = Column(Text, default="[]") # JSON list of assigned village IDs
    assigned_landscapes_json = Column(Text, default="[]") # JSON list of assigned landscape names
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    
    inspections = relationship("Inspection", back_populates="inspector")
    procurement_receipts = relationship("ProcurementReceipt", back_populates="buyer")

# ----------------------------------------------------------------------
# 2. FARMER IDENTITY & HOUSEHOLD PROFILE
# ----------------------------------------------------------------------

class Farmer(Base):
    __tablename__ = "farmers"
    
    id = Column(String(36), primary_key=True, default=gen_uuid)
    village_id = Column(Integer, ForeignKey("villages.id"), nullable=False, index=True)
    family_code = Column(String(64), nullable=False, index=True) # e.g. 'SB049'
    head_name = Column(String(255), nullable=False, index=True)
    gender = Column(String(16), default="male")
    ethnicity = Column(String(64), default="Khmer")
    id_card_number = Column(String(64), nullable=True)
    phone_number = Column(String(64), nullable=True)
    farmer_status = Column(String(32), default="Existing", index=True) # 'Existing', 'New', 'Rejoin'
    compliance_status = Column(String(32), default="Compliance", index=True) # 'Compliance', 'Non-Compliance', 'Resign'
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    
    __table_args__ = (
        UniqueConstraint("village_id", "family_code", name="uq_farmer_village_family"),
    )
    
    village = relationship("Village", back_populates="farmers")
    profile = relationship("HouseholdProfile", back_populates="farmer", uselist=False, cascade="all, delete-orphan")
    parcels = relationship("Parcel", back_populates="farmer", cascade="all, delete-orphan")
    inspections = relationship("Inspection", back_populates="farmer", cascade="all, delete-orphan")
    plot_registrations = relationship("PlotSeasonRegistration", back_populates="farmer", cascade="all, delete-orphan")
    procurement_receipts = relationship("ProcurementReceipt", back_populates="farmer", cascade="all, delete-orphan")

class HouseholdProfile(Base):
    __tablename__ = "household_profiles"
    
    id = Column(String(36), primary_key=True, default=gen_uuid)
    farmer_id = Column(String(36), ForeignKey("farmers.id"), unique=True, nullable=False)
    total_members = Column(Integer, default=1)
    school_age_children = Column(Integer, default=0)
    has_latrine = Column(Boolean, default=False)
    has_disabled_members = Column(Boolean, default=False)
    num_cows = Column(Integer, default=0)
    num_buffalos = Column(Integer, default=0)
    num_pigs = Column(Integer, default=0)
    has_daily_records_book = Column(Boolean, default=False)
    trainings_received_json = Column(Text, default="[]") # JSON list of received trainings
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    
    farmer = relationship("Farmer", back_populates="profile")

# ----------------------------------------------------------------------
# 3. SPATIAL CADASTRAL LAND & MULTI-YEAR GEOMETRY
# ----------------------------------------------------------------------

class Parcel(Base):
    """
    Physical cadastral parcel owned or operated by a farmer.
    Maintains backward compatibility with season_id and snapshot properties.
    """
    __tablename__ = "parcels"
    
    id = Column(String(36), primary_key=True, default=gen_uuid)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, index=True, default=1)
    farmer_id = Column(String(36), ForeignKey("farmers.id"), nullable=False, index=True)
    parcel_code = Column(String(64), nullable=True, index=True) # e.g. 'Plot 90'
    lat = Column(Float, nullable=False, default=0.0)
    lng = Column(Float, nullable=False, default=0.0)
    gis_area_ha = Column(Float, nullable=False, default=0.0)
    geom_geojson = Column(Text, nullable=False) # Current snapshot geometry
    inspection_status = Column(String(32), default="pending", index=True) # 'pending', 'in_progress', 'completed', 'non_compliant'
    
    # Agronomic & Land Organic baseline
    land_status = Column(String(32), default="Organic", index=True) # 'Organic', 'New Organic', 'Ibis I', 'Ibis II', 'WF'
    land_tenure = Column(String(64), default="titled")
    irrigation_type = Column(String(64), default="rainfed")
    contamination_risk = Column(Boolean, default=False)
    buffer_zone_meters = Column(Float, default=0.0)
    prohibited_chemicals_3yr = Column(Boolean, default=False)
    
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    
    __table_args__ = (
        UniqueConstraint("season_id", "farmer_id", "parcel_code", name="uq_season_farmer_parcel"),
    )
    
    season = relationship("Season", back_populates="parcels")
    farmer = relationship("Farmer", back_populates="parcels")
    plots = relationship("Plot", back_populates="parcel", cascade="all, delete-orphan")
    subplots = relationship("Subplot", back_populates="parcel", cascade="all, delete-orphan")
    inspections = relationship("Inspection", back_populates="parcel")

class Plot(Base):
    """
    Stable physical plot entity. Maintains its internal UUID across all GIS updates.
    """
    __tablename__ = "plots"
    
    id = Column(String(36), primary_key=True, default=gen_uuid)
    parcel_id = Column(String(36), ForeignKey("parcels.id"), nullable=False, index=True)
    plot_code = Column(String(64), nullable=True, index=True) # e.g. 'SB049-P1'
    plot_number = Column(Integer, nullable=False)
    name = Column(String(128), nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    
    parcel = relationship("Parcel", back_populates="plots")
    geometries = relationship("PlotGeometryHistory", back_populates="plot", cascade="all, delete-orphan")
    registrations = relationship("PlotSeasonRegistration", back_populates="plot", cascade="all, delete-orphan")

class PlotGeometryHistory(Base):
    """
    Multi-year spatial boundary history for each plot.
    Every annual GIS GeoJSON import creates a new version here if coordinates shift,
    leaving past inspection snapshots 100% untouched.
    """
    __tablename__ = "plot_geometry_history"
    
    id = Column(String(36), primary_key=True, default=gen_uuid)
    plot_id = Column(String(36), ForeignKey("plots.id"), nullable=False, index=True)
    season_code = Column(String(32), nullable=False, index=True) # '2025', '2026', '2027'
    geom_geojson = Column(Text, nullable=False)                 # Stored GeoJSON polygon (PostGIS compatible)
    gis_area_ha = Column(Float, nullable=False, default=0.0)
    centroid_lat = Column(Float, nullable=False, default=0.0)
    centroid_lng = Column(Float, nullable=False, default=0.0)
    is_current = Column(Boolean, default=True, index=True)
    source_file_version = Column(String(128), nullable=True)     # e.g. 'all_ibis_rice_plots_2026.geojson'
    effective_start_date = Column(DateTime, default=utc_now)
    effective_end_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    
    __table_args__ = (
        Index("idx_plot_geom_season", "plot_id", "season_code"),
    )
    
    plot = relationship("Plot", back_populates="geometries")

class PlotSeasonRegistration(Base):
    """
    Bridges a permanent physical Plot to an operational Season.
    Holds visual inspection status, agronomic risk, and seasonal compliance.
    """
    __tablename__ = "plot_season_registrations"
    
    id = Column(String(36), primary_key=True, default=gen_uuid)
    plot_id = Column(String(36), ForeignKey("plots.id"), nullable=False, index=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, index=True)
    farmer_id = Column(String(36), ForeignKey("farmers.id"), nullable=False, index=True)
    
    # Visual Inspection & Status tracking
    land_status = Column(String(32), default="Organic", index=True) # 'Organic', 'New Organic', 'Ibis I', 'Ibis II', 'WF'
    inspection_status = Column(String(32), default="pending", index=True) # 'pending', 'in_progress', 'completed', 'non_compliant'
    risk_level = Column(String(32), default="low")                         # 'low', 'medium', 'high'
    buffer_zone_meters = Column(Float, default=0.0)
    contamination_risk = Column(Boolean, default=False)
    prohibited_chemicals_3yr = Column(Boolean, default=False)
    
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    
    __table_args__ = (
        UniqueConstraint("plot_id", "season_id", name="uq_plot_season_reg"),
    )
    
    plot = relationship("Plot", back_populates="registrations")
    season = relationship("Season", back_populates="plot_registrations")
    farmer = relationship("Farmer", back_populates="plot_registrations")
    subplots = relationship("Subplot", back_populates="registration", cascade="all, delete-orphan")

class Subplot(Base):
    """
    Seasonal division of a plot cultivated with a specific rice variety.
    """
    __tablename__ = "subplots"
    
    id = Column(String(36), primary_key=True, default=gen_uuid)
    parcel_id = Column(String(36), ForeignKey("parcels.id"), nullable=False, index=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, index=True)
    registration_id = Column(String(36), ForeignKey("plot_season_registrations.id"), nullable=True, index=True)
    subplot_code = Column(String(32), nullable=False) # 'A', 'B', 'C'
    variety_id = Column(Integer, ForeignKey("rice_varieties.id"), nullable=False)
    percentage_of_main = Column(Float, nullable=False) # 0 to 100
    calculated_area_ha = Column(Float, nullable=False)
    geom_geojson = Column(Text, nullable=True) # Sketched boundary geometry
    
    # Planting Details
    seed_source = Column(String(64), default="own_saved")
    seed_qty_kg = Column(Float, default=0.0)
    planting_method = Column(String(64), default="direct_seeding")
    planting_date = Column(Date, nullable=True)
    expected_yield_kg = Column(Float, default=0.0)
    expected_sales_kg = Column(Float, default=0.0)
    
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    
    __table_args__ = (
        UniqueConstraint("parcel_id", "season_id", "subplot_code", name="uq_parcel_season_subplot"),
    )
    
    parcel = relationship("Parcel", back_populates="subplots")
    season = relationship("Season", back_populates="subplots")
    variety = relationship("RiceVariety", back_populates="subplots")
    registration = relationship("PlotSeasonRegistration", back_populates="subplots")
    harvest = relationship("SubplotHarvest", back_populates="subplot", uselist=False, cascade="all, delete-orphan")
    bags = relationship("HarvestBag", back_populates="subplot", cascade="all, delete-orphan")

# ----------------------------------------------------------------------
# 4. DYNAMIC INSPECTIONS & FORM AUDIT
# ----------------------------------------------------------------------

class QuestionDefinition(Base):
    __tablename__ = "question_definitions"
    
    id = Column(Integer, primary_key=True, index=True)
    template_code = Column(String(64), nullable=False, index=True) # e.g. 'ICS_2026'
    stage_number = Column(Integer, nullable=False)                 # 1: Farmer, 2: Parcel, 3: Subplot, 4: Harvest, 5: Confirm
    section_name = Column(String(128), nullable=False)             # 'Demographics', 'Chemical History', 'Post-Harvest'
    field_key = Column(String(128), unique=True, nullable=False)   # 'has_latrine', 'drying_location'
    label_en = Column(Text, nullable=False)
    label_kh = Column(Text, nullable=True)
    input_type = Column(String(32), nullable=False)                # 'text', 'number', 'select', 'multiselect', 'boolean', 'date'
    options_json = Column(Text, nullable=True)                     # '[{"value": "1", "label": "Concrete floor"}]'
    validation_rules_json = Column(Text, nullable=True)            # '{"required": true}'
    conditional_display_json = Column(Text, nullable=True)         # '{"depends_on": "contamination_risk", "equals": true}'
    display_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

class Inspection(Base):
    __tablename__ = "inspections"
    
    id = Column(String(36), primary_key=True, default=gen_uuid)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, index=True)
    farmer_id = Column(String(36), ForeignKey("farmers.id"), nullable=False, index=True)
    parcel_id = Column(String(36), ForeignKey("parcels.id"), nullable=True, index=True)
    inspector_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    
    inspection_type = Column(String(64), default="baseline_field") # 'baseline_field', 'harvest', 'post_harvest'
    inspection_phase = Column(String(64), default="phase_1_planting") # 'phase_1_planting', 'phase_2_harvest', 'phase_3_post_harvest', 'phase_final'
    phase_1_completed = Column(Boolean, default=False)
    phase_2_completed = Column(Boolean, default=False)
    phase_3_completed = Column(Boolean, default=False)
    phase_1_date = Column(Date, nullable=True)
    phase_2_date = Column(Date, nullable=True)
    phase_3_date = Column(Date, nullable=True)
    inspection_date = Column(Date, nullable=False)
    status = Column(String(32), default="completed")               # 'draft', 'submitted', 'verified'
    
    # Confirmation / Sign-off
    recommendation = Column(String(64), default="approved_organic")
    inspector_notes = Column(Text, nullable=True)
    village_rep_name = Column(String(255), nullable=True)
    digital_signature_blob = Column(Text, nullable=True)           # Base64 canvas stroke
    is_locked = Column(Boolean, default=False)                     # Lock historical audit record
    synced_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    
    season = relationship("Season", back_populates="inspections")
    farmer = relationship("Farmer", back_populates="inspections")
    parcel = relationship("Parcel", back_populates="inspections")
    inspector = relationship("User", back_populates="inspections")
    answers = relationship("InspectionAnswer", back_populates="inspection", cascade="all, delete-orphan")

class InspectionAnswer(Base):
    __tablename__ = "inspection_answers"
    
    id = Column(String(36), primary_key=True, default=gen_uuid)
    inspection_id = Column(String(36), ForeignKey("inspections.id"), nullable=False, index=True)
    question_key = Column(String(128), nullable=False)
    answer_value_json = Column(Text, nullable=False) # Scalar string, number, or JSON array
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    
    __table_args__ = (
        UniqueConstraint("inspection_id", "question_key", name="uq_inspection_question"),
    )
    
    inspection = relationship("Inspection", back_populates="answers")

class SubplotHarvest(Base):
    __tablename__ = "subplot_harvests"
    
    id = Column(String(36), primary_key=True, default=gen_uuid)
    subplot_id = Column(String(36), ForeignKey("subplots.id"), unique=True, nullable=False)
    inspection_id = Column(String(36), ForeignKey("inspections.id"), nullable=True)
    harvest_status = Column(String(32), default="completed") # 'standing_crop', 'harvested', 'threshed'
    harvest_date = Column(Date, nullable=True)
    actual_production_kg = Column(Float, default=0.0)
    for_sale_kg = Column(Float, default=0.0)
    consumption_kg = Column(Float, default=0.0)
    seed_kept_kg = Column(Float, default=0.0)
    other_disposition_kg = Column(Float, default=0.0)
    
    # Machinery and threshing details
    threshing_method = Column(String(64), default="combine_harvester")
    contractor_name = Column(String(255), nullable=True)
    flush_quantity_kg = Column(Float, default=0.0)
    payment_type = Column(String(32), default="cash")
    payment_amount_kg = Column(Float, default=0.0)
    drying_location = Column(String(128), nullable=True)
    
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    
    subplot = relationship("Subplot", back_populates="harvest")

# ----------------------------------------------------------------------
# 5. ENTERPRISE TRACEABILITY: PROCUREMENT TO EXPORT
# ----------------------------------------------------------------------

class HarvestBag(Base):
    """
    Granular bag-level tracking from field gate into buying station.
    """
    __tablename__ = "harvest_bags"
    
    id = Column(String(36), primary_key=True, default=gen_uuid)
    subplot_id = Column(String(36), ForeignKey("subplots.id"), nullable=False, index=True)
    bag_barcode = Column(String(64), unique=True, nullable=False, index=True)
    gross_weight_kg = Column(Float, nullable=False, default=50.0)
    moisture_percentage = Column(Float, default=14.0)
    is_organic_certified = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)
    
    subplot = relationship("Subplot", back_populates="bags")

class ProcurementReceipt(Base):
    """
    Buying station purchase order at community level.
    """
    __tablename__ = "procurement_receipts"
    
    id = Column(String(36), primary_key=True, default=gen_uuid)
    receipt_code = Column(String(64), unique=True, nullable=False, index=True) # e.g. 'BUY-2026-PV-0012'
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False, index=True)
    farmer_id = Column(String(36), ForeignKey("farmers.id"), nullable=False, index=True)
    parcel_id = Column(String(36), ForeignKey("parcels.id"), nullable=True, index=True)
    variety_id = Column(Integer, ForeignKey("rice_varieties.id"), nullable=True, index=True)
    variety_code = Column(String(64), nullable=True)
    variety_name = Column(String(128), nullable=True)
    buyer_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    buying_station_name = Column(String(128), nullable=False)
    purchase_date = Column(Date, nullable=False)
    total_bags = Column(Integer, default=0)
    total_kg = Column(Float, default=0.0)
    base_price_riel = Column(Float, default=0.0)
    organic_premium_riel = Column(Float, default=0.0)
    total_payout_riel = Column(Float, default=0.0)
    payment_status = Column(String(32), default="paid") # 'pending', 'paid', 'verified'
    created_at = Column(DateTime, default=utc_now)
    
    season = relationship("Season", back_populates="procurement_receipts")
    farmer = relationship("Farmer", back_populates="procurement_receipts")
    parcel = relationship("Parcel")
    variety = relationship("RiceVariety")
    buyer = relationship("User", back_populates="procurement_receipts")

class WarehouseLot(Base):
    """
    Batch storage at IRCC certified organic warehouse / silo.
    """
    __tablename__ = "warehouse_lots"
    
    id = Column(String(36), primary_key=True, default=gen_uuid)
    lot_code = Column(String(64), unique=True, nullable=False, index=True)
    warehouse_name = Column(String(128), nullable=False)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False)
    variety_id = Column(Integer, ForeignKey("rice_varieties.id"), nullable=False)
    total_weight_kg = Column(Float, default=0.0)
    storage_bay = Column(String(64), nullable=True)
    intake_date = Column(Date, nullable=False)
    is_fumigation_free = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utc_now)
    
    season = relationship("Season", back_populates="warehouse_lots")
    variety = relationship("RiceVariety", back_populates="warehouse_lots")

class MillingBatch(Base):
    """
    Processing and milling run from paddy into polished/brown certified organic rice.
    """
    __tablename__ = "milling_batches"
    
    id = Column(String(36), primary_key=True, default=gen_uuid)
    batch_code = Column(String(64), unique=True, nullable=False, index=True)
    mill_name = Column(String(128), nullable=False)
    milling_date = Column(Date, nullable=False)
    input_paddy_kg = Column(Float, nullable=False)
    output_milled_kg = Column(Float, nullable=False)
    output_broken_kg = Column(Float, default=0.0)
    output_bran_kg = Column(Float, default=0.0)
    milling_yield_pct = Column(Float, default=0.0)
    input_lots_json = Column(Text, default="[]") # JSON list of input warehouse lot codes
    created_at = Column(DateTime, default=utc_now)

class ExportShipment(Base):
    """
    Final packaged export container with traceability QR verification code.
    """
    __tablename__ = "export_shipments"
    
    id = Column(String(36), primary_key=True, default=gen_uuid)
    shipment_code = Column(String(64), unique=True, nullable=False, index=True) # e.g. 'EXP-2026-EU-01'
    destination_country = Column(String(64), nullable=False)
    importer_name = Column(String(128), nullable=False)
    container_number = Column(String(64), nullable=True)
    phytosanitary_cert = Column(String(128), nullable=True)
    organic_cert_number = Column(String(128), nullable=True)
    eudr_compliance_reference = Column(String(128), nullable=True)
    qr_verification_code = Column(String(128), unique=True, nullable=False, index=True)
    shipping_date = Column(Date, nullable=True)
    created_at = Column(DateTime, default=utc_now)

# ----------------------------------------------------------------------
# 6. SECURITY & AUDIT TRAIL
# ----------------------------------------------------------------------

class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), nullable=True, index=True)
    action = Column(String(32), nullable=False)               # 'CREATE', 'UPDATE', 'DELETE', 'GIS_IMPORT'
    entity_type = Column(String(64), nullable=False)         # 'plot', 'farmer', 'inspection', 'geojson'
    entity_id = Column(String(64), nullable=False, index=True)
    before_state_json = Column(Text, nullable=True)
    after_state_json = Column(Text, nullable=True)
    ip_address = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=utc_now, index=True)

class SyncAuditLog(Base):
    __tablename__ = "sync_audit_log"
    
    id = Column(String(36), primary_key=True, default=gen_uuid)
    device_id = Column(String(128), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    operation = Column(String(32), nullable=False)           # 'insert', 'update', 'delete'
    entity_type = Column(String(64), nullable=False)         # 'inspection', 'subplot', 'harvest'
    entity_id = Column(String(64), nullable=False)
    client_timestamp = Column(DateTime, nullable=False)
    server_timestamp = Column(DateTime, default=utc_now)
    payload_json = Column(Text, nullable=False)
    status = Column(String(32), default="applied")           # 'applied', 'conflict_resolved', 'rejected'
