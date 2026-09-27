import sqlite3
import os
import sys

db_path = os.path.join(os.path.dirname(__file__), '..', 'backend', 'data', 'ibis_platform.db')
if not os.path.exists(db_path):
    print(f"Database not found at {db_path}")
    sys.exit(1)

print(f"Connecting to database: {db_path}")
conn = sqlite3.connect(db_path)
c = conn.cursor()

# Tables containing transactional / testing inspection data
transaction_tables = [
    'inspections',
    'inspection_answers',
    'subplots',
    'subplot_harvests',
    'harvest_bags',
    'procurement_receipts',
    'warehouse_lots',
    'milling_batches',
    'export_shipments',
    'sync_audit_log',
    'audit_logs',
    'household_profiles'
]

for table in transaction_tables:
    try:
        c.execute(f"DELETE FROM {table}")
        print(f"Cleared table: {table}")
    except Exception as e:
        print(f"Could not clear table {table}: {e}")

# Reset status in plot_season_registrations to baseline 'pending'
try:
    c.execute("UPDATE plot_season_registrations SET inspection_status = 'pending'")
    print("Reset plot_season_registrations status to 'pending'")
except Exception as e:
    print(f"Could not reset plot_season_registrations: {e}")

conn.commit()
conn.close()
print("=== DATABASE CLEANUP COMPLETED SUCCESSFULLY ===")
