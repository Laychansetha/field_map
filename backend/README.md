# Ibis Rice Enterprise Backend & Spatial Intelligence API

Modern, production-grade backend powering the Ibis Rice Field Inspection & Spatial Intelligence Platform. Built with Python 3, FastAPI, SQLAlchemy 2.0, and PostGIS/SQLite.

---

## 🏛️ Architecture Overview

- **Framework:** FastAPI (High performance, asynchronous, automatic OpenAPI Swagger documentation at `/docs`).
- **Database Support:** 
  - **PostgreSQL 16+ with PostGIS 3.4+** (Recommended for enterprise / cloud production).
  - **SQLite** (Default zero-config local engine for desktop/offline development).
- **Core Hierarchy:**
  $$\text{Season} \longrightarrow \text{Village} + \text{Family ID (Farmer)} \longrightarrow \text{Parcels} \longrightarrow \text{Plots} \longrightarrow \text{Subplots} \longrightarrow \text{Inspections} \longrightarrow \text{Subplot Harvests}$$
- **Dynamic Form Engine:** Questionnaires are defined in `question_definitions` and served dynamically at `/api/v1/templates/ICS_2026`, allowing new seasons (2027+) and new questions to be added without frontend code changes.

---

## 🚀 Quick Start

### 1. Run the Backend Server
```bash
# Run using Python's uvicorn server
python -m uvicorn backend.app.main:app --port 8080 --host 0.0.0.0 --reload
```

Once running:
- **Interactive Map PWA:** [http://localhost:8080/](http://localhost:8080/)
- **Interactive Swagger API Docs:** [http://localhost:8080/docs](http://localhost:8080/docs)
- **API Health Check:** [http://localhost:8080/api/v1/health](http://localhost:8080/api/v1/health)

---

## 💾 Connecting to PostgreSQL / PostGIS

To switch from SQLite to a PostgreSQL / PostGIS database (e.g. Supabase, AWS RDS, or local PostgreSQL service):

1. Set the `DATABASE_URL` environment variable:
```bash
# Windows PowerShell
$env:DATABASE_URL="postgresql://postgres:your_password@localhost:5432/ibis_rice"

# Linux / Mac
export DATABASE_URL="postgresql://postgres:your_password@localhost:5432/ibis_rice"
```

2. Run the migration script to ingest all 6,427 plots and 4,135 unique farmers:
```bash
python backend/scripts/migrate_geojson.py
```

---

## 📡 Key API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/health` | Service health status and active season |
| `GET` | `/api/v1/reference/seasons` | Available inspection seasons (2026, 2027) |
| `GET` | `/api/v1/reference/villages` | All 62 registered conservation villages |
| `GET` | `/api/v1/reference/varieties` | Certified rice varieties (Phka Rumduol, Red Jasmine, etc.) |
| `GET` | `/api/v1/farmers/lookup?village_name=Sambou&family_code=SB049` | Unique farmer profile and parcel summary by Village + Family ID |
| `GET` | `/api/v1/parcels/farmer/{farmer_id}` | Registered parcels and sketched subplots for a farmer |
| `GET` | `/api/v1/templates/{template_code}` | Dynamic questionnaire schema and skip-logic |
| `POST` | `/api/v1/inspections/` | Submit inspection event, subplots, answers, and digital signature |
| `GET` | `/api/v1/inspections/export/farmer-csv` | Single-farmer CSV report for a Village + Family ID |
| `POST` | `/api/v1/sync/push` | Batch synchronization queue for offline field tablets |

---

## 📂 Code Directory Structure

```text
backend/
├── app/
│   ├── config.py           # Settings, DB URL auto-resolution, security
│   ├── database.py         # SQLAlchemy engine & session dependency
│   ├── main.py             # FastAPI app, CORS, static mounts
│   ├── models.py           # Relational & spatial ORM entities
│   ├── schemas.py          # Pydantic validation and serialization schemas
│   └── routers/
│       ├── reference.py    # Seasons, villages, and varieties
│       ├── farmers.py      # Unique Village+Family lookup & household profiles
│       ├── parcels.py      # Physical parcels & subplots
│       ├── templates.py    # Dynamic questionnaire schema
│       ├── inspections.py  # Inspections, signatures, and single-farmer CSV exports
│       └── sync.py         # Offline sync queue
└── scripts/
    └── migrate_geojson.py  # Ingestion script for plots.geojson
```
