import json
import os
import sys
from pathlib import Path
from datetime import date

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR))

from backend.app.database import engine, SessionLocal, Base
from backend.app.models import (
    Season, RiceVariety, QuestionDefinition
)
from backend.app.services.gis_engine import commit_gis_ingestion

import argparse

def run_migration(geojson_file=None, season_code="2026"):
    print(f"=== STARTING ENTERPRISE GIS INGESTION & VERSIONING FOR SEASON {season_code} ===")
    
    # Ensure tables are created
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    try:
        # 1. Seed Seasons
        print("-> Ensuring Seasons exist...")
        seasons_data = [
            {"code": "2025", "name": "ICS Season 2025", "is_active": False, "start_date": date(2025, 1, 1), "end_date": date(2025, 12, 31)},
            {"code": "2026", "name": "ICS Season 2026", "is_active": True, "start_date": date(2026, 1, 1), "end_date": date(2026, 12, 31)},
            {"code": "2027", "name": "ICS Season 2027", "is_active": False, "start_date": date(2027, 1, 1), "end_date": date(2027, 12, 31)},
        ]
        for s in seasons_data:
            if not db.query(Season).filter(Season.code == s["code"]).first():
                db.add(Season(**s))
        db.commit()
        
        # 2. Seed Rice Varieties
        print("-> Seeding Certified Rice Varieties...")
        varieties_data = [
            {"code": "PKR", "name_en": "Phka Rumduol (Standard Organic)", "name_kh": "ផ្ការំដួល", "is_organic_certified": True},
            {"code": "RED", "name_en": "Red Jasmine (Special Organic)", "name_kh": "ផ្កាម្លិះក្រហម", "is_organic_certified": True},
            {"code": "STICKY", "name_en": "Sticky Rice (Organic)", "name_kh": "ស្រូវដំណើប", "is_organic_certified": True},
            {"code": "LOCAL", "name_en": "Local Variety (Conventional/Transition)", "name_kh": "ស្រូវពូជស្រុក", "is_organic_certified": False},
            {"code": "OTHER", "name_en": "Other Rice Variety", "name_kh": "ពូជផ្សេងទៀត", "is_organic_certified": True},
            {"code": "FALLOW", "name_en": "Fallow / Resting Land", "name_kh": "ដីទំនេរ", "is_organic_certified": True},
        ]
        for v in varieties_data:
            if not db.query(RiceVariety).filter(RiceVariety.code == v["code"]).first():
                db.add(RiceVariety(**v))
        db.commit()
        
        # 3. Seed Dynamic Question Definitions (ICS 2026 Template)
        print("-> Seeding ICS 2026 Dynamic Questions...")
        template_questions = [
            # Stage 1: Farmer & Household
            {"template_code": "ICS_2026", "stage_number": 1, "section_name": "Demographics", "field_key": "total_members", "label_en": "Total Family Members", "label_kh": "ចំនួនសមាជិកគ្រួសារសរុប", "input_type": "number", "display_order": 1},
            {"template_code": "ICS_2026", "stage_number": 1, "section_name": "Demographics", "field_key": "school_age_children", "label_en": "School-age Children", "label_kh": "កូនក្នុងវ័យសិក្សា", "input_type": "number", "display_order": 2},
            {"template_code": "ICS_2026", "stage_number": 1, "section_name": "Demographics", "field_key": "has_latrine", "label_en": "Has Household Latrine/Toilet", "label_kh": "មានបង្គន់អនាម័យ", "input_type": "boolean", "display_order": 3},
            {"template_code": "ICS_2026", "stage_number": 1, "section_name": "Livestock", "field_key": "num_cows", "label_en": "Number of Cattle / Cows", "label_kh": "ចំនួនគោ", "input_type": "number", "display_order": 4},
            {"template_code": "ICS_2026", "stage_number": 1, "section_name": "Livestock", "field_key": "num_buffalos", "label_en": "Number of Buffalos", "label_kh": "ចំនួនក្របី", "input_type": "number", "display_order": 5},
            {"template_code": "ICS_2026", "stage_number": 1, "section_name": "Records", "field_key": "has_daily_records_book", "label_en": "Keeps Farmer Diary / Records Book", "label_kh": "មានសៀវភៅកត់ត្រាការងារកសិករ", "input_type": "boolean", "display_order": 6},
            
            # Stage 2: Parcel Baseline
            {"template_code": "ICS_2026", "stage_number": 2, "section_name": "Land Situation", "field_key": "land_tenure", "label_en": "Land Ownership / Tenure", "label_kh": "ស្ថានភាពកាន់កាប់ដីធ្លី", "input_type": "select", "options_json": json.dumps([{"value": "1", "label": "Titled / Hard Title"}, {"value": "2", "label": "Certificate / Soft Title"}, {"value": "3", "label": "Customary / Village recognized"}]), "display_order": 10},
            {"template_code": "ICS_2026", "stage_number": 2, "section_name": "Irrigation", "field_key": "irrigation_type", "label_en": "Water & Irrigation Source", "label_kh": "ប្រព័ន្ធធារាសាស្ត្រ និងប្រភពទឹក", "input_type": "select", "options_json": json.dumps([{"value": "1", "label": "100% Rainfed (No irrigation)"}, {"value": "2", "label": "Canal / Community reservoir"}, {"value": "3", "label": "Pond / Solar pump"}]), "display_order": 11},
            {"template_code": "ICS_2026", "stage_number": 2, "section_name": "Buffer & Risk", "field_key": "contamination_risk", "label_en": "Neighbor Chemical Contamination Risk", "label_kh": "ហានិភ័យឆ្លងសារធាតុគីមីពីដីក្បែរខាង", "input_type": "boolean", "display_order": 12},
            {"template_code": "ICS_2026", "stage_number": 2, "section_name": "Buffer & Risk", "field_key": "buffer_zone_meters", "label_en": "Buffer Zone Width (meters)", "label_kh": "ទទឹងខ្សែក្រវាត់ការពារ (ម៉ែត្រ)", "input_type": "number", "conditional_display_json": json.dumps({"depends_on": "contamination_risk", "equals": True}), "display_order": 13},
            
            # Stage 4: Harvest & Threshing
            {"template_code": "ICS_2026", "stage_number": 4, "section_name": "Threshing", "field_key": "threshing_method", "label_en": "Threshing Method", "label_kh": "វិធីសាស្ត្របោកបែន", "input_type": "select", "options_json": json.dumps([{"value": "1", "label": "Combine Harvester"}, {"value": "2", "label": "Hand tractor (Koyon)"}, {"value": "3", "label": "Manual / Animal threshing"}]), "display_order": 20},
            {"template_code": "ICS_2026", "stage_number": 4, "section_name": "Threshing", "field_key": "flush_quantity_kg", "label_en": "Machine Organic Flush Quantity (kg)", "label_kh": "បរិមាណស្រូវ Organic Flush លាងម៉ាស៊ីន (គីឡូ)", "input_type": "number", "display_order": 21},
            {"template_code": "ICS_2026", "stage_number": 4, "section_name": "Drying", "field_key": "drying_location", "label_en": "Paddy Drying Surface", "label_kh": "ទីតាំងហាលស្រូវ", "input_type": "select", "options_json": json.dumps([{"value": "1", "label": "Clean tarpaulin on ground"}, {"value": "2", "label": "Concrete drying floor"}, {"value": "3", "label": "Raised mesh rack"}]), "display_order": 22},
            
            # Stage 5: Confirm & Sanitation
            {"template_code": "ICS_2026", "stage_number": 5, "section_name": "Rice Barn", "field_key": "rice_barn_sanitary", "label_en": "Rice Barn Isolated & Clean", "label_kh": "ជង្រុកស្រូវស្អាត និងគ្មានសារធាតុគីមីនៅជិត", "input_type": "boolean", "display_order": 30},
            {"template_code": "ICS_2026", "stage_number": 5, "section_name": "Zero-Deforestation", "field_key": "zero_deforestation_compliant", "label_en": "Compliant with Zero-Deforestation & No Straw Burning", "label_kh": "អនុវត្តតាមគោលការណ៍មិនកាប់បំផ្លាញព្រៃឈើ និងមិនដុតជញ្ជ្រាំង", "input_type": "boolean", "display_order": 31},
        ]
        for q in template_questions:
            if not db.query(QuestionDefinition).filter(QuestionDefinition.field_key == q["field_key"]).first():
                db.add(QuestionDefinition(**q))
        db.commit()
        
        # 4. Ingest GeoJSON Features
        if geojson_file:
            geojson_path = Path(geojson_file)
        else:
            # Fallback path checks
            cand1 = BASE_DIR / "all_ibis_rice_plots.geojson"
            cand2 = BASE_DIR / "public" / "data" / "plots.geojson"
            geojson_path = cand1 if cand1.exists() else cand2
            
        if not geojson_path.exists():
            print(f"Error: {geojson_path} does not exist!")
            return
            
        print(f"-> Reading GeoJSON from {geojson_path}...")
        with open(geojson_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        result = commit_gis_ingestion(
            db=db,
            data=data,
            season_code=season_code,
            source_filename=geojson_path.name
        )
        print(f"=== INGESTION COMPLETE! ===")
        print(f"  • Total Processed: {result['total_processed']}")
        print(f"  • New Plots Registered: {result['new_plots_created']}")
        print(f"  • Geometries Versioned for Season {season_code}: {result['geometries_updated']}")
        
    except Exception as e:
        db.rollback()
        print(f"Migration failed with error: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Annual GIS GeoJSON Ingestion for Ibis Rice Platform")
    parser.add_argument("--file", default=None, help="Path to annual all_ibis_rice_plots.geojson")
    parser.add_argument("--season", default="2026", help="Season code (e.g. 2026, 2027)")
    args = parser.parse_args()
    
    run_migration(geojson_file=args.file, season_code=args.season)
