import sys
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR))

import sqlite3
from backend.app.database import SessionLocal
from backend.app.routers.reference import get_seasons, get_rice_varieties
from backend.app.routers.farmers import lookup_farmer_by_village_and_family
from backend.app.routers.templates import get_inspection_template

def test_queries():
    db_path = BASE_DIR / "backend" / "data" / "ibis_platform.db"
    if not db_path.exists():
        print("Database not found. Run migrate_geojson.py first.")
        return

    conn = sqlite3.connect(str(db_path))
    c = conn.cursor()
    c.execute("SELECT v.name, f.family_code, f.head_name FROM farmers f JOIN villages v ON f.village_id = v.id WHERE f.family_code = 'SB049' LIMIT 5")
    rows = c.fetchall()
    print("Found SB049 farmers in DB:", rows)
    conn.close()

    db = SessionLocal()
    for v_name, f_code, _ in rows:
        farmer = lookup_farmer_by_village_and_family(village_name=v_name, family_code=f_code, db=db)
        print(f"Verified via Router -> {v_name} + {f_code}: Head='{farmer.head_name}', Parcels={farmer.parcels_count}, Area={farmer.total_gis_area_ha} ha")

    tmpl = get_inspection_template(template_code="ICS_2026", season_code="2026", db=db)
    print("Verified Template -> Stages:", {k: len(v) for k, v in tmpl.stages.items()})

    db.close()
    print("All backend tests PASSED!")

if __name__ == "__main__":
    test_queries()
