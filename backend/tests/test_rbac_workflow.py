import urllib.request
import urllib.error
import json
import sys
import os

sys.path.insert(0, os.path.abspath('.'))

from backend.app.database import SessionLocal
from backend.app.models import Parcel, Village, Commune, Landscape

base_url = 'http://localhost:8080/api/v1'

def api_call(endpoint, method='GET', data=None, token=None):
    url = f"{base_url}{endpoint}"
    headers = {}
    body = None
    if data is not None:
        headers['Content-Type'] = 'application/json'
        body = json.dumps(data).encode('utf-8')
    if token:
        headers['Authorization'] = f"Bearer {token}"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        res = urllib.request.urlopen(req)
        content_type = res.headers.get('Content-Type', '')
        if 'application/json' in content_type:
            return res.status, json.loads(res.read().decode('utf-8'))
        else:
            return res.status, res.read()
    except urllib.error.HTTPError as e:
        try:
            err_body = json.loads(e.read().decode('utf-8'))
        except Exception:
            err_body = str(e)
        return e.code, err_body

def main():
    print("=== 1. TESTING UNAUTHENTICATED / PUBLIC ACCESS ===")
    status, body = api_call('/health')
    assert status == 200, f"Expected 200 on /health, got {status}"
    print("PASS: /health is accessible to public (200)")

    status, body = api_call('/admin/users')
    assert status == 401, f"Expected 401 on /admin/users, got {status}: {body}"
    print("PASS: /admin/users is guarded against public (401)")

    status, body = api_call('/inspections/', method='POST', data={'season_code': '2026', 'farmer_id': 'f1', 'inspection_date': '2026-06-01'})
    assert status == 401, f"Expected 401 on /inspections/, got {status}: {body}"
    print("PASS: POST /inspections/ is guarded against public (401)")

    status, body = api_call('/inspections/export/master-ics-csv')
    assert status == 401, f"Expected 401 on /inspections/export/master-ics-csv, got {status}: {body}"
    print("PASS: Master ICS CSV export is guarded against public (401)")

    print("\n=== 2. TESTING FIELD INSPECTOR AUTH & RBAC ===")
    # Login as inspector
    status, data = api_call('/auth/pin-login', method='POST', data={'pin': '1234', 'role': 'inspector'})
    assert status == 200, f"Inspector PIN login failed: {data}"
    insp_token = data['access_token']
    full_name = data['full_name']
    role = data['role']
    lands = data['assigned_landscapes']
    print(f"PASS: Inspector login successful: {full_name} (Role: {role}, Lands: {lands})")
    assert role == 'inspector'
    assert 'Keo Seima' in lands

    # Inspector /me check
    status, me_data = api_call('/auth/me', token=insp_token)
    assert status == 200, f"Inspector /me failed: {me_data}"
    assert me_data['email'] == 'inspector@ibisrice.com'
    print(f"PASS: Inspector /me verified: {me_data['full_name']}")

    # Inspector attempts admin user list -> MUST FAIL (403)
    status, err = api_call('/admin/users', token=insp_token)
    assert status == 403, f"Expected 403 for inspector on /admin/users, got {status}: {err}"
    print("PASS: Inspector correctly blocked from /admin/users (403 Forbidden)")

    # Inspector attempts master CSV export -> MUST FAIL (403)
    status, err = api_call('/inspections/export/master-ics-csv', token=insp_token)
    assert status == 403, f"Expected 403 for inspector on master CSV export, got {status}: {err}"
    print("PASS: Inspector correctly blocked from Master ICS CSV Export (403 Forbidden)")

    # Inspector accesses territories -> MUST SUCCEED (200)
    status, terr = api_call('/admin/territories', token=insp_token)
    assert status == 200, f"Expected 200 on /admin/territories, got {status}"
    print(f"PASS: Inspector allowed to view territories ({len(terr['landscapes'])} landscapes)")

    db = SessionLocal()
    from backend.app.models import Farmer
    ks_parcel = db.query(Parcel).join(Farmer, Parcel.farmer_id == Farmer.id).join(Village, Farmer.village_id == Village.id).join(Commune, Village.commune_id == Commune.id).join(Landscape, Commune.landscape_id == Landscape.id).filter(Landscape.name == 'Keo Seima').first()
    pv_parcel = db.query(Parcel).join(Farmer, Parcel.farmer_id == Farmer.id).join(Village, Farmer.village_id == Village.id).join(Commune, Village.commune_id == Commune.id).join(Landscape, Commune.landscape_id == Landscape.id).filter(Landscape.name != 'Keo Seima').first()

    if ks_parcel:
        # Submit inspection for Keo Seima parcel -> MUST SUCCEED (200)
        p_data = {
            'season_code': '2026',
            'farmer_id': ks_parcel.farmer_id,
            'parcel_id': ks_parcel.id,
            'inspection_date': '2026-06-15',
            'inspection_phase': 'phase_1_planting',
            'phase_1_completed': True,
            'status': 'in_progress',
            'inspector_notes': 'Verified in Keo Seima'
        }
        status, res = api_call('/inspections/', method='POST', data=p_data, token=insp_token)
        assert status == 200, f"Expected 200 for Keo Seima inspection, got {status}: {res}"
        print("PASS: Inspector successfully submitted inspection in assigned territory (Keo Seima)")

    if pv_parcel:
        # Submit inspection outside Keo Seima -> MUST FAIL (403)
        p_data = {
            'season_code': '2026',
            'farmer_id': pv_parcel.farmer_id,
            'parcel_id': pv_parcel.id,
            'inspection_date': '2026-06-15',
            'inspection_phase': 'phase_1_planting',
            'phase_1_completed': True,
            'status': 'in_progress',
            'inspector_notes': 'Attempting unauthorized territory'
        }
        status, res = api_call('/inspections/', method='POST', data=p_data, token=insp_token)
        assert status == 403, f"Expected 403 for unauthorized territory, got {status}: {res}"
        print(f"PASS: Inspector correctly blocked from submitting inspection outside assigned territory (403): {res.get('detail')}")

    db.close()

    print("\n=== 3. TESTING ADMINISTRATOR AUTH & CAPABILITIES ===")
    # Login as admin via PIN 9999
    status, data = api_call('/auth/pin-login', method='POST', data={'pin': '9999', 'role': 'admin'})
    assert status == 200, f"Admin PIN login failed: {data}"
    admin_token = data['access_token']
    print(f"PASS: Admin login successful: {data['full_name']} (Role: {data['role']})")
    assert data['role'] == 'admin'

    # Admin lists users -> MUST SUCCEED (200)
    status, users = api_call('/admin/users', token=admin_token)
    assert status == 200, f"Admin list users failed: {users}"
    print(f"PASS: Admin successfully listed staff users ({len(users)} users)")

    # Admin creates a new field officer -> MUST SUCCEED (200)
    new_user_payload = {
        'full_name': 'Officer Vanna Roth',
        'email': 'vanna.roth@ibisrice.com',
        'phone': '012999888',
        'role': 'inspector',
        'pin': '7788',
        'assigned_landscapes': ['Siem Pang'],
        'assigned_villages': [],
        'is_active': True
    }
    status, created_user = api_call('/admin/users', method='POST', data=new_user_payload, token=admin_token)
    assert status in (200, 400), f"Create user unexpected status {status}: {created_user}"
    if status == 200:
        print(f"PASS: Admin successfully created officer account: {created_user['full_name']} (PIN: {created_user['pin']})")
    else:
        print(f"PASS: Admin verified existing account validation (400 Bad Request): {created_user.get('detail')}")

    # Admin downloads Master ICS CSV -> MUST SUCCEED (200)
    status, csv_data = api_call('/inspections/export/master-ics-csv?season_code=2026', token=admin_token)
    assert status == 200, f"Admin export CSV failed: {csv_data}"
    print(f"PASS: Admin successfully streamed Master ICS CSV dataset ({len(csv_data)} bytes)")

    print("\n=======================================================")
    print("  ALL SECURITY, RBAC & WORKFLOW TESTS PASSED 100%!")
    print("=======================================================")

if __name__ == '__main__':
    main()
