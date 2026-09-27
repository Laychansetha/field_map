import json
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
import jwt
from typing import Optional, List

from ..database import get_db
from ..models import User
from ..schemas import UserLogin, PinLogin, Token, UserOut
from ..config import settings

router = APIRouter(prefix="/auth", tags=["Authentication & User Management"])

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

def parse_user_territories(user: User):
    assigned_villages = []
    assigned_landscapes = []
    try:
        if user.assigned_villages_json:
            assigned_villages = json.loads(user.assigned_villages_json)
    except Exception:
        pass
    try:
        if user.assigned_landscapes_json:
            assigned_landscapes = json.loads(user.assigned_landscapes_json)
    except Exception:
        pass
    return assigned_villages, assigned_landscapes

def ensure_default_accounts(db: Session):
    """Ensures deterministic default accounts for admin and demo inspector."""
    admin = db.query(User).filter(User.email == "admin@ibisrice.com").first()
    if not admin:
        admin = User(
            email="admin@ibisrice.com",
            full_name="System Administrator",
            role="admin",
            pin_hash="9999",
            assigned_landscapes_json=json.dumps([]),
            assigned_villages_json=json.dumps([]),
            is_active=True
        )
        db.add(admin)
    else:
        # Standardize admin PIN to 9999 to avoid collision with inspector PIN 1234
        if admin.pin_hash == "1234":
            admin.pin_hash = "9999"

    inspector = db.query(User).filter(User.email == "inspector@ibisrice.com").first()
    if not inspector:
        inspector = User(
            email="inspector@ibisrice.com",
            full_name="Inspector Sok Chea",
            role="inspector",
            pin_hash="1234",
            assigned_landscapes_json=json.dumps(["Keo Seima"]),
            assigned_villages_json=json.dumps([]),
            is_active=True
        )
        db.add(inspector)
    else:
        if not inspector.assigned_landscapes_json or inspector.assigned_landscapes_json == "[]":
            inspector.assigned_landscapes_json = json.dumps(["Keo Seima"])
        inspector.pin_hash = "1234"

    db.commit()

def get_current_user(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> Optional[User]:
    """Decodes JWT Bearer token and returns authenticated active user or None."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: str = payload.get("sub")
        if not user_id:
            return None
        user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
        return user
    except Exception:
        return None

def require_staff(user: Optional[User] = Depends(get_current_user)):
    """FastAPI dependency: requires authenticated staff (inspector, supervisor, or admin)."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in as Field Inspector or Administrator."
        )
    if user.role not in ("inspector", "supervisor", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Staff or Inspector privileges required."
        )
    return user

def require_admin(user: Optional[User] = Depends(get_current_user)):
    """FastAPI dependency: strictly requires authenticated administrator."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in as Administrator."
        )
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator privileges required."
        )
    return user

@router.post("/login", response_model=Token)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """Authenticates admin, supervisor, or field inspector via email."""
    ensure_default_accounts(db)
    email_clean = credentials.email.lower().strip()
    user = db.query(User).filter(User.email == email_clean, User.is_active == True).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
        
    access_token = create_access_token(data={"sub": user.id, "role": user.role, "email": user.email})
    vills, lands = parse_user_territories(user)
    return Token(
        access_token=access_token,
        token_type="bearer",
        role=user.role,
        full_name=user.full_name,
        user_id=user.id,
        assigned_villages=vills,
        assigned_landscapes=lands
    )

@router.post("/pin-login", response_model=Token)
def pin_login(payload: dict, db: Session = Depends(get_db)):
    """Direct 4-digit PIN unlock for field tablets with role resolution."""
    ensure_default_accounts(db)
    pin = str(payload.get("pin", "")).strip()
    role = payload.get("role")
    if not pin:
        raise HTTPException(status_code=400, detail="PIN is required")
        
    q = db.query(User).filter(User.pin_hash == pin, User.is_active == True)
    if role:
        q = q.filter(User.role == role)
        
    user = q.first()
    if not user and role:
        user = db.query(User).filter(User.pin_hash == pin, User.is_active == True).first()
        
    if not user:
        raise HTTPException(status_code=401, detail="Invalid PIN code")
        
    access_token = create_access_token(data={"sub": user.id, "role": user.role, "email": user.email})
    vills, lands = parse_user_territories(user)
    return Token(
        access_token=access_token,
        token_type="bearer",
        role=user.role,
        full_name=user.full_name,
        user_id=user.id,
        assigned_villages=vills,
        assigned_landscapes=lands
    )

@router.post("/pin-verify", response_model=Token)
def pin_verify(payload: PinLogin, db: Session = Depends(get_db)):
    """Fast 4-digit PIN verification for offline field tablets."""
    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user or user.pin_hash != payload.pin:
        raise HTTPException(status_code=401, detail="Invalid PIN code")
        
    access_token = create_access_token(data={"sub": user.id, "role": user.role})
    vills, lands = parse_user_territories(user)
    return Token(
        access_token=access_token,
        token_type="bearer",
        role=user.role,
        full_name=user.full_name,
        user_id=user.id,
        assigned_villages=vills,
        assigned_landscapes=lands
    )

@router.get("/me", response_model=UserOut)
def get_current_user_profile(
    user_id: Optional[str] = None,
    current_user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns profile and role for current user via Bearer token or user_id."""
    target_user = current_user
    if user_id and (not current_user or current_user.id != user_id):
        target_user = db.query(User).filter(User.id == user_id).first()
        
    if not target_user:
        raise HTTPException(status_code=401, detail="User not authenticated or not found")
        
    vills, lands = parse_user_territories(target_user)
    return UserOut(
        id=target_user.id,
        email=target_user.email,
        full_name=target_user.full_name,
        role=target_user.role,
        phone=target_user.phone,
        assigned_villages=vills,
        assigned_landscapes=lands,
        pin=target_user.pin_hash,
        is_active=target_user.is_active
    )
