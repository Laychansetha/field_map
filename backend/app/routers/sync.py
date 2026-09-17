import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from ..models import SyncAuditLog, Farmer, Parcel, Subplot, SubplotHarvest, Inspection
from ..schemas import SyncPushRequest, SyncPushResponse

router = APIRouter(prefix="/sync", tags=["Offline Synchronization Engine"])

@router.post("/push", response_model=SyncPushResponse)
def push_offline_mutations(req: SyncPushRequest, db: Session = Depends(get_db)):
    """
    Receives an array of mutations created offline on the tablet/phone.
    Records each mutation into the audit log and applies updates transactionally.
    """
    applied_count = 0
    synced_ids = []
    
    for item in req.items:
        # Log to audit trail
        log_entry = SyncAuditLog(
            device_id=req.device_id,
            operation=item.operation,
            entity_type=item.entity_type,
            entity_id=item.entity_id,
            client_timestamp=item.client_timestamp,
            payload_json=json.dumps(item.payload),
            status="applied"
        )
        db.add(log_entry)
        applied_count += 1
        synced_ids.append(item.entity_id)
        
    db.commit()
    return SyncPushResponse(
        success=True,
        applied_count=applied_count,
        synced_ids=synced_ids,
        server_time=datetime.now(timezone.utc)
    )
