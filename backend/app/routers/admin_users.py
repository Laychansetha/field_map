import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from datetime import datetime, timezone

from ..database import get_db
from ..models import User, Village, Landscape, Commune
from ..schemas import UserOut, UserCreate, UserUpdate
from .auth import parse_user_territories, require_admin, require_staff

router = APIRouter(prefix="/admin", tags=["Admin User & Territory Management"])

@router.get("/territories", response_model=dict)
def get_territories(
    staff_user: User = Depends(require_staff),
    db: Session = Depends(get_db)
):
    """Returns all landscapes and their associated villages for territory assignment (Staff/Admin)."""
    landscapes = db.query(Landscape).order_by(Landscape.name).all()
    result = []
    
    for l in landscapes:
        vills = []
        for c in l.communes:
            for v in c.villages:
                vills.append({
                    "id": v.id,
                    "name": v.name,
                    "code": v.code,
                    "commune": c.name
                })
        result.append({
            "id": l.id,
            "name": l.name,
            "villages": sorted(vills, key=lambda x: x["name"])
        })
        
    return {"landscapes": result}

@router.get("/users", response_model=List[UserOut])
def list_users(
    role: Optional[str] = Query(None),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Lists all user accounts (Admin only)."""
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    users = q.order_by(User.full_name).all()
    
    out = []
    for u in users:
        vills, lands = parse_user_territories(u)
        out.append(UserOut(
            id=u.id,
            email=u.email,
            full_name=u.full_name,
            role=u.role,
            phone=u.phone,
            assigned_villages=vills,
            assigned_landscapes=lands,
            pin=u.pin_hash,
            is_active=u.is_active
        ))
    return out

@router.post("/users", response_model=UserOut)
def create_user(
    payload: UserCreate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Creates a new field inspector or admin account with assigned territory and PIN (Admin only)."""
    if payload.email:
        existing = db.query(User).filter(User.email == payload.email.lower().strip()).first()
        if existing:
            raise HTTPException(status_code=400, detail="User with this email already exists")
            
    user = User(
        email=payload.email.lower().strip() if payload.email else None,
        full_name=payload.full_name.strip(),
        role=payload.role,
        phone=payload.phone,
        pin_hash=payload.pin or "1234",
        assigned_landscapes_json=json.dumps(payload.assigned_landscapes or []),
        assigned_villages_json=json.dumps(payload.assigned_villages or []),
        is_active=payload.is_active
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    vills, lands = parse_user_territories(user)
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        phone=user.phone,
        assigned_villages=vills,
        assigned_landscapes=lands,
        pin=user.pin_hash,
        is_active=user.is_active
    )

@router.put("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: str,
    payload: UserUpdate,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Updates user information, territory assignments, or PIN (Admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
    if payload.email is not None:
        user.email = payload.email.lower().strip() if payload.email else None
    if payload.role is not None:
        user.role = payload.role
    if payload.phone is not None:
        user.phone = payload.phone
    if payload.pin is not None:
        user.pin_hash = payload.pin
    if payload.assigned_landscapes is not None:
        user.assigned_landscapes_json = json.dumps(payload.assigned_landscapes)
    if payload.assigned_villages is not None:
        user.assigned_villages_json = json.dumps(payload.assigned_villages)
    if payload.is_active is not None:
        user.is_active = payload.is_active
        
    user.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    
    vills, lands = parse_user_territories(user)
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        phone=user.phone,
        assigned_villages=vills,
        assigned_landscapes=lands,
        pin=user.pin_hash,
        is_active=user.is_active
    )

@router.delete("/users/{user_id}", response_model=dict)
def delete_user(
    user_id: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Deactivates a user account (Admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.is_active = False
    db.commit()
    return {"success": True, "message": f"User {user.full_name} deactivated"}
