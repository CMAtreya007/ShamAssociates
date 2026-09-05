import sys
import os
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

import pytest
from app.services.auth import (
    authenticate_user, 
    create_access_token, 
    verify_access_token, 
    get_authorized_users
)

def test_authorized_users_catalog():
    users = get_authorized_users()
    assert "admin" in users
    assert "client_analyst" in users
    assert "client_tester" in users
    assert len(users) >= 3

def test_successful_authentication():
    # Admin check
    admin = authenticate_user("admin", "Shankar@001")
    assert admin is not None
    assert admin["role"] == "admin"
    assert admin["username"] == "admin"

    # Analyst check
    analyst = authenticate_user("analyst", "Shankar@002")
    assert analyst is not None
    assert analyst["role"] == "analyst"

    analyst2 = authenticate_user("client_analyst", "Shankar@002")
    assert analyst2 is not None

    # Tester check
    tester = authenticate_user("tester", "Shankar@003")
    assert tester is not None
    assert tester["role"] == "tester"

    tester2 = authenticate_user("client_tester", "Shankar@003")
    assert tester2 is not None

def test_failed_authentication():
    assert authenticate_user("admin", "WrongPassword123") is None
    assert authenticate_user("nonexistent_user", "Shankar@001") is None
    assert authenticate_user("", "") is None

def test_token_creation_and_verification():
    user = {"username": "admin", "name": "Administrator", "role": "admin"}
    token = create_access_token(user, expires_in_seconds=3600)
    assert token is not None
    assert token.count(".") == 2

    # Verify token
    payload = verify_access_token(token)
    assert payload is not None
    assert payload["username"] == "admin"
    assert payload["role"] == "admin"

def test_expired_token():
    user = {"username": "client_tester", "role": "tester"}
    # Token expired 10 seconds ago
    token = create_access_token(user, expires_in_seconds=-10)
    payload = verify_access_token(token)
    assert payload is None

def test_tampered_token():
    user = {"username": "admin", "role": "admin"}
    token = create_access_token(user, expires_in_seconds=3600)
    parts = token.split(".")
    # Tamper payload
    tampered_token = f"{parts[0]}.{parts[1]}abc.{parts[2]}"
    assert verify_access_token(tampered_token) is None
