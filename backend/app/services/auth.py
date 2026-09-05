import hmac
import hashlib
import base64
import json
import time
import secrets
from typing import Optional, Dict, Any, List
from fastapi import HTTPException, Security, Depends, status, Request, WebSocket
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import settings

security_bearer = HTTPBearer(auto_error=False)

def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')

def _base64url_decode(data_str: str) -> bytes:
    padding = 4 - (len(data_str) % 4)
    if padding != 4:
        data_str += '=' * padding
    return base64.urlsafe_b64decode(data_str.encode('utf-8'))

def get_distinct_accounts_info() -> List[Dict[str, Any]]:
    """Returns unique distinct accounts for public test guidance."""
    return [
        {
            "username": "admin",
            "name": "Administrator",
            "role": "admin",
            "description": "Full administrative control, sync, and system configuration"
        },
        {
            "username": "client_analyst",
            "name": "Financial Analyst",
            "role": "analyst",
            "description": "Market data analysis, sectoral screening, and Excel export access"
        },
        {
            "username": "client_tester",
            "name": "Client QA Tester",
            "role": "tester",
            "description": "Full end-to-end application testing and live streaming verification"
        }
    ]

def get_authorized_users() -> Dict[str, Dict[str, Any]]:
    """Returns the authorized users mapping loaded from settings / environment."""
    admin_info = {
        "username": "admin",
        "password": settings.USER_ADMIN_PASS,
        "name": "Administrator",
        "role": "admin",
        "description": "Full administrative control, sync, and system configuration"
    }
    analyst_info = {
        "username": "client_analyst",
        "password": settings.USER_ANALYST_PASS,
        "name": "Financial Analyst",
        "role": "analyst",
        "description": "Market data analysis, sectoral screening, and Excel export access"
    }
    tester_info = {
        "username": "client_tester",
        "password": settings.USER_TESTER_PASS,
        "name": "Client QA Tester",
        "role": "tester",
        "description": "Full end-to-end application testing and live streaming verification"
    }

    return {
        "admin": admin_info,
        settings.USER_ADMIN_NAME.strip().lower(): admin_info,
        "analyst": analyst_info,
        "client_analyst": analyst_info,
        settings.USER_ANALYST_NAME.strip().lower(): analyst_info,
        "tester": tester_info,
        "client_tester": tester_info,
        settings.USER_TESTER_NAME.strip().lower(): tester_info,
    }

def authenticate_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    """Verifies username and password against configured authorized accounts."""
    if not username or not password:
        return None
    
    users = get_authorized_users()
    clean_username = username.strip().lower()
    user = users.get(clean_username)
    
    if not user:
        return None
    
    # Constant-time comparison to prevent timing attacks
    if secrets.compare_digest(user["password"], password.strip()):
        return {
            "username": user["username"],
            "name": user["name"],
            "role": user["role"],
            "description": user["description"]
        }
    return None

def create_access_token(data: Dict[str, Any], expires_in_seconds: Optional[int] = None) -> str:
    """Generates a secure HMAC-SHA256 signed JWT token."""
    if expires_in_seconds is None:
        expires_in_seconds = settings.JWT_EXPIRY_HOURS * 3600

    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        **data,
        "iat": now,
        "exp": now + expires_in_seconds
    }

    header_b64 = _base64url_encode(json.dumps(header, separators=(',', ':')).encode('utf-8'))
    payload_b64 = _base64url_encode(json.dumps(payload, separators=(',', ':')).encode('utf-8'))

    signing_input = f"{header_b64}.{payload_b64}".encode('utf-8')
    signature = hmac.new(
        settings.JWT_SECRET.encode('utf-8'),
        signing_input,
        hashlib.sha256
    ).digest()
    signature_b64 = _base64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{signature_b64}"

def verify_access_token(token: str) -> Optional[Dict[str, Any]]:
    """Verifies HMAC-SHA256 signature and expiration timestamp of the given token."""
    if not token or token.count('.') != 2:
        return None

    try:
        header_b64, payload_b64, signature_b64 = token.split('.')
        signing_input = f"{header_b64}.{payload_b64}".encode('utf-8')

        expected_sig = hmac.new(
            settings.JWT_SECRET.encode('utf-8'),
            signing_input,
            hashlib.sha256
        ).digest()
        actual_sig = _base64url_decode(signature_b64)

        if not hmac.compare_digest(expected_sig, actual_sig):
            return None

        payload_bytes = _base64url_decode(payload_b64)
        payload = json.loads(payload_bytes.decode('utf-8'))

        now = int(time.time())
        if "exp" in payload and payload["exp"] < now:
            return None

        return payload
    except Exception:
        return None

async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer)
) -> Dict[str, Any]:
    """
    FastAPI dependency that extracts and validates the JWT Bearer token from:
    1. HTTP 'Authorization: Bearer <token>' header
    2. 'token' query parameter (for direct file downloads or WebSocket handshakes)
    """
    token = None
    if credentials and credentials.credentials:
        token = credentials.credentials
    elif "token" in request.query_params:
        token = request.query_params["token"]

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided. Please log in.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    payload = verify_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token. Please sign in again.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    return payload

def verify_ws_token(token: Optional[str]) -> Optional[Dict[str, Any]]:
    """Validates token specifically for WebSocket connections."""
    if not token:
        return None
    return verify_access_token(token)
