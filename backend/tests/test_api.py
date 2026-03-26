from fastapi.testclient import TestClient

from tax_llm.infrastructure.auth_store import AuthStore
from tax_llm.infrastructure.matter_store import MatterStore
from tax_llm.interfaces.api.dependencies import get_auth_store
from tax_llm.interfaces.api import routes
from tax_llm.interfaces.api.main import app

client = TestClient(app)


def test_healthcheck():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_demo_scenario():
    response = client.get("/api/v1/demo/scenario")

    assert response.status_code == 200
    assert response.json()["facts"]["transaction_name"] == "Project Atlas"


def test_analyze_transaction():
    payload = {
        "facts": {
            "transaction_name": "Project Atlas",
            "summary": "Testing seeded analysis.",
            "entities": ["Atlas Parent", "TargetCo"],
            "jurisdictions": ["United States"],
            "transaction_type": "merger",
            "stated_goals": ["Preserve attributes"],
            "constraints": ["Tight timing"],
            "consideration_mix": "Cash and rollover equity",
            "proposed_steps": "Merger followed by refinancing",
            "rollover_equity": True,
            "deemed_asset_sale_election": False,
            "contribution_transactions": False,
            "partnership_issues": False,
            "debt_financing": True,
            "earnout": False,
            "withholding": False,
            "state_tax": True,
            "international": False
        },
        "uploaded_documents": [
            {
                "file_name": "term-sheet.txt",
                "document_type": "term_sheet",
                "content": "Merger with rollover equity."
            }
        ]
    }

    response = client.post("/api/v1/intake/analyze", json=payload)

    assert response.status_code == 200
    body = response.json()["result"]
    assert len(body["issues"]) >= 1
    assert len(body["classification"]) >= 1
    assert len(body["authorities_reviewed"]) >= 1
    assert len(body["memo_sections"]) >= 1
    assert "completeness_warning" in body
    assert "source_priority_warning" in body["bucket_coverage"][0]


def test_matter_workflow(monkeypatch, tmp_path):
    monkeypatch.setattr(routes, "_matter_store", lambda: MatterStore(base_dir=tmp_path / "matters"))
    app.dependency_overrides[get_auth_store] = lambda: AuthStore(base_dir=tmp_path / "auth")

    auth_response = client.post(
        "/api/v1/auth/signup",
        json={"email": "atlas@example.com", "password": "secret123", "name": "Atlas User"},
    )
    assert auth_response.status_code == 200
    session_token = auth_response.json()["session_token"]
    headers = {"X-Tax-Session": session_token}

    payload = {
        "matter_name": "Atlas Matter",
        "transaction_type": "merger",
        "facts": {
            "transaction_name": "Atlas Matter",
            "summary": "Saved matter workflow test.",
            "entities": ["Atlas Parent", "TargetCo"],
            "jurisdictions": ["United States"],
            "transaction_type": "merger",
            "stated_goals": ["Preserve attributes"],
            "constraints": ["Tight timing"],
            "consideration_mix": "Cash and rollover equity",
            "proposed_steps": "Merger followed by refinancing",
            "rollover_equity": True,
            "deemed_asset_sale_election": False,
            "contribution_transactions": False,
            "partnership_issues": False,
            "debt_financing": True,
            "earnout": False,
            "withholding": False,
            "state_tax": True,
            "international": False,
        },
        "uploaded_documents": [
            {
                "file_name": "term-sheet.txt",
                "document_type": "term_sheet",
                "content": "Merger with rollover equity.",
                "source": "pasted",
            }
        ],
    }

    create_response = client.post("/api/v1/matters", json=payload, headers=headers)
    assert create_response.status_code == 200
    matter_id = create_response.json()["matter"]["matter_id"]

    analyze_response = client.post(
        f"/api/v1/matters/{matter_id}/analyze",
        json=payload,
        headers=headers,
    )
    assert analyze_response.status_code == 200
    matter = analyze_response.json()["matter"]
    assert matter["latest_analysis"] is not None
    assert len(matter["analysis_runs"]) == 1

    list_response = client.get("/api/v1/matters", headers=headers)
    assert list_response.status_code == 200
    assert len(list_response.json()["matters"]) == 1

    unauthorized_response = client.get("/api/v1/matters")
    assert unauthorized_response.status_code == 401

    app.dependency_overrides.clear()
