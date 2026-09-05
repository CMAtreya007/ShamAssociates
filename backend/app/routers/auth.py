from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional

from app.services.auth import (
    authenticate_user, 
    create_access_token, 
    get_current_user,
    get_authorized_users
)
from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["Authentication & Access Control"])

class LoginRequest(BaseModel):
    username: str = Field(..., description="User account ID (e.g. admin, client_analyst, client_tester)")
    password: str = Field(..., description="User password")

class UserProfile(BaseModel):
    username: str
    name: str
    role: str
    description: Optional[str] = None

class LoginResponse(BaseModel):
    success: bool
    message: str
    token: str
    token_type: str = "Bearer"
    expires_in: int
    user: UserProfile

class AccountPublicInfo(BaseModel):
    username: str
    name: str
    role: str
    description: str

@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest):
    """Authenticates the client with username and password, returning a signed JWT Bearer session token."""
    user = authenticate_user(req.username, req.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid User ID or Password. Please verify your credentials.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    expires_in_seconds = settings.JWT_EXPIRY_HOURS * 3600
    token = create_access_token(
        data={
            "sub": user["username"],
            "name": user["name"],
            "role": user["role"]
        },
        expires_in_seconds=expires_in_seconds
    )

    return LoginResponse(
        success=True,
        message=f"Welcome back, {user['name']}!",
        token=token,
        token_type="Bearer",
        expires_in=expires_in_seconds,
        user=UserProfile(
            username=user["username"],
            name=user["name"],
            role=user["role"],
            description=user.get("description")
        )
    )

@router.get("/me", response_model=UserProfile)
async def get_my_profile(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Returns the authenticated user profile based on the validated Bearer token."""
    return UserProfile(
        username=current_user.get("sub", current_user.get("username", "")),
        name=current_user.get("name", "User"),
        role=current_user.get("role", "member")
    )

@router.post("/logout")
async def logout(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Logs out the active session."""
    return {
        "success": True,
        "message": f"Successfully logged out {current_user.get('name', 'user')}."
    }

@router.get("/accounts", response_model=List[AccountPublicInfo])
async def list_testing_accounts():
    """Returns public account roles and usernames for client test guidance (passwords omitted)."""
    from app.services.auth import get_distinct_accounts_info
    accounts_data = get_distinct_accounts_info()
    return [
        AccountPublicInfo(
            username=u["username"],
            name=u["name"],
            role=u["role"],
            description=u["description"]
        ) for u in accounts_data
    ]
