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
    Season, Landscape, Commune, Village, RiceVariety,
    Farmer, HouseholdProfile, Parcel, Plot, QuestionDefinition
)

def run_migration():
    print("=== STARTING DATA MIGRATION TO DATABASE ===")
    
    # Ensure tables are created
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    try:
        # 1. Seed Seasons
        print("-> Seeding Seasons...")
        seasons_data = [
            {"code": "2026", "name": "ICS Season 2026", "is_active": True, "start_date": date(2026, 1, 1), "end_date": date(2026, 12, 31)},
            {"code": "2027", "name": "ICS Season 2027", "is_active": False, "start_date": date(2027, 1, 1), "end_date": date(2027, 12, 31)},
        ]
        for s in seasons_data:
            if not db.query(Season).filter(Season.code == s["code"]).first():
                db.add(Season(**s))
        db.commit()
        
        # 2. Seed Rice Varieties
        print("-> Seeding Rice Varieties...")
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
        geojson_path = BASE_DIR / "public" / "data" / "plots.geojson"
        if not geojson_path.exists():
            print(f"Error: {geojson_path} does not exist!")
            return
            
        print(f"-> Reading GeoJSON from {geojson_path}...")
        with open(geojson_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        features = data.get("features", [])
        print(f"-> Found {len(features)} plot features to process.")
        
        # In-memory caches to minimize DB queries
        landscapes_map = {l.name: l.id for l in db.query(Landscape).all()}
        communes_map = {} # (landscape_id, commune_name) -> id
        for c in db.query(Commune).all():
            communes_map[(c.landscape_id, c.name)] = c.id
        villages_map = {} # (commune_id, village_name) -> id
        for v in db.query(Village).all():
            villages_map[(v.commune_id, v.name)] = v.id
            
        farmers_map = {} # (village_id, family_code.lower()) -> id
        for fm in db.query(Farmer).all():
            farmers_map[(fm.village_id, fm.family_code.strip().lower())] = fm.id
            
        imported_parcels = 0
        batch_size = 500
        
        for idx, ft in enumerate(features):
            props = ft.get("properties", {})
            geom = ft.get("geometry", {})
            
            site_name = (props.get("site") or "Unknown Landscape").strip()
            commune_name = (props.get("commune") or "Unknown Commune").strip()
            village_name = (props.get("village") or "Unknown Village").strip()
            family_id = str(props.get("family_id") or "Unknown").strip()
            farmer_name = (props.get("farmer_name") or f"Family {family_id}").strip()
            plot_id = props.get("plot_id") or (idx + 1)
            area_ha = float(props.get("area_ha") or props.get("calc_area_ha") or 0.0)
            lat = float(props.get("lat") or 0.0)
            lng = float(props.get("lng") or 0.0)
            
            # Resolve Landscape
            if site_name not in landscapes_map:
                ls = Landscape(name=site_name)
                db.add(ls)
                db.commit()
                landscapes_map[site_name] = ls.id
            landscape_id = landscapes_map[site_name]
            
            # Resolve Commune
            commune_key = (landscape_id, commune_name)
            if commune_key not in communes_map:
                cm = Commune(landscape_id=landscape_id, name=commune_name)
                db.add(cm)
                db.commit()
                communes_map[commune_key] = cm.id
            commune_id = communes_map[commune_key]
            
            # Resolve Village
            village_key = (commune_id, village_name)
            if village_key not in villages_map:
                vl = Village(commune_id=commune_id, name=village_name)
                db.add(vl)
                db.commit()
                villages_map[village_key] = vl.id
            village_id = villages_map[village_key]
            
            # Resolve Farmer (Village + Family ID)
            farmer_key = (village_id, family_id.lower())
            if farmer_key not in farmers_map:
                fm = Farmer(
                    village_id=village_id,
                    family_code=family_id,
                    head_name=farmer_name,
                    gender="male",
                    compliance_status="compliant"
                )
                db.add(fm)
                db.flush()
                farmers_map[farmer_key] = fm.id
            farmer_db_id = farmers_map[farmer_key]
            
            # Add Parcel
            parcel = Parcel(
                farmer_id=farmer_db_id,
                parcel_code=f"Plot {plot_id}",
                lat=lat,
                lng=lng,
                gis_area_ha=round(area_ha, 4),
                geom_geojson=json.dumps(geom),
                land_tenure="titled",
                irrigation_type="rainfed"
            )
            db.add(parcel)
            db.flush()
            
            # Add Plot record
            db.add(Plot(
                parcel_id=parcel.id,
                plot_number=int(plot_id) if str(plot_id).isdigit() else idx + 1,
                name=f"Plot {plot_id}"
            ))
            
            imported_parcels += 1
            if imported_parcels % batch_size == 0:
                db.commit()
                print(f"  Processed {imported_parcels} / {len(features)} parcels...")
                
        db.commit()
        print(f"=== MIGRATION COMPLETE! Imported {imported_parcels} parcels, {len(farmers_map)} unique farmers across {len(villages_map)} villages. ===")
        
    except Exception as e:
        db.rollback()
        print(f"Migration failed with error: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    run_migration()
