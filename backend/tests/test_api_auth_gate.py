import sys
import os
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_unauthenticated_api_access_blocked():
    # Attempt to access data without token -> 401
    res = client.get("/api/data/available-dates")
    assert res.status_code == 401
    assert "detail" in res.json()

def test_login_and_authenticated_data_access():
    # 1. Login with admin credentials
    login_res = client.post("/api/auth/login", json={
        "username": "admin",
        "password": "Shankar@001"
    })
    assert login_res.status_code == 200
    data = login_res.json()
    assert data["success"] is True
    assert "token" in data
    token = data["token"]
    assert data["user"]["username"] == "admin"
    assert data["user"]["role"] == "admin"

    # 2. Access protected endpoint with Bearer token
    headers = {"Authorization": f"Bearer {token}"}
    data_res = client.get("/api/data/available-dates", headers=headers)
    assert data_res.status_code == 200
    assert isinstance(data_res.json(), list)

    # 3. Access profile endpoint
    profile_res = client.get("/api/auth/me", headers=headers)
    assert profile_res.status_code == 200
    assert profile_res.json()["username"] == "admin"

def test_analyst_and_tester_logins():
    # Analyst login
    res1 = client.post("/api/auth/login", json={
        "username": "client_analyst",
        "password": "Shankar@002"
    })
    assert res1.status_code == 200
    assert res1.json()["user"]["role"] == "analyst"

    # Tester login
    res2 = client.post("/api/auth/login", json={
        "username": "client_tester",
        "password": "Shankar@003"
    })
    assert res2.status_code == 200
    assert res2.json()["user"]["role"] == "tester"

def test_public_accounts_list():
    res = client.get("/api/auth/accounts")
    assert res.status_code == 200
    accounts = res.json()
    assert len(accounts) >= 3
    usernames = [a["username"] for a in accounts]
    assert "admin" in usernames
    assert "client_analyst" in usernames
    assert "client_tester" in usernames

def test_spa_serving():
    # Check root route returns 200 (serves static HTML or status)
    res = client.get("/")
    assert res.status_code == 200
