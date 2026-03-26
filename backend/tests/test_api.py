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


def test_v2_document_review_and_export_workflow(monkeypatch, tmp_path):
    monkeypatch.setattr(routes, "_matter_store", lambda: MatterStore(base_dir=tmp_path / "matters"))
    app.dependency_overrides[get_auth_store] = lambda: AuthStore(base_dir=tmp_path / "auth")

    auth_response = client.post(
        "/api/v1/auth/signup",
        json={"email": "reviewer@example.com", "password": "secret123", "name": "Reviewer"},
    )
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
                "file_name": "LOI.txt",
                "document_type": "letter_of_intent",
                "content": "Buyer proposes a merger with rollover equity and target NOLs.",
                "source": "uploaded",
            }
        ],
    }

    matter_id = client.post("/api/v1/matters", json=payload, headers=headers).json()["matter"]["matter_id"]
    analyzed = client.post(f"/api/v1/matters/{matter_id}/analyze", json=payload, headers=headers)
    run_id = analyzed.json()["matter"]["analysis_runs"][0]["run_id"]

    extracted = client.post(f"/api/v1/matters/{matter_id}/documents/extract", headers=headers)
    assert extracted.status_code == 200
    extracted_document = extracted.json()["matter"]["uploaded_documents"][0]
    assert extracted_document["extraction_status"] == "completed"
    assert len(extracted_document["extracted_facts"]) >= 1

    fact_id = extracted_document["extracted_facts"][0]["fact_id"]
    confirmed = client.post(
        f"/api/v1/matters/{matter_id}/documents/confirm-facts",
        json={"confirmations": [{"document_index": 0, "fact_id": fact_id, "status": "confirmed"}]},
        headers=headers,
    )
    assert confirmed.status_code == 200
    confirmed_fact = confirmed.json()["matter"]["uploaded_documents"][0]["extracted_facts"][0]
    assert confirmed_fact["status"] == "confirmed"

    reviewed = client.post(
        f"/api/v1/matters/{matter_id}/runs/{run_id}/review",
        json={
            "review_status": "reviewed",
            "reviewed_by": "Tax Reviewer",
            "note": "Pinned the core reorganization and attribute authorities.",
            "pinned_authority_ids": ["code-382"],
        },
        headers=headers,
    )
    assert reviewed.status_code == 200
    reviewed_run = reviewed.json()["matter"]["analysis_runs"][0]
    assert reviewed_run["review_status"] == "reviewed"
    assert reviewed_run["pinned_authority_ids"] == ["code-382"]
    assert reviewed_run["reviewer_notes"]

    exported = client.get(f"/api/v1/matters/{matter_id}/runs/{run_id}/export", headers=headers)
    assert exported.status_code == 200
    body = exported.json()
    assert body["format"] == "markdown"
    assert "Facts And Issue Framing" in body["content"]

    app.dependency_overrides.clear()


def test_matter_store_migrates_older_analysis_run_schema(monkeypatch, tmp_path):
    legacy_db_dir = tmp_path / "matters"
    legacy_db_dir.mkdir(parents=True, exist_ok=True)
    legacy_db_path = legacy_db_dir / "tax_llm.db"

    import sqlite3

    connection = sqlite3.connect(legacy_db_path)
    connection.execute(
        """
        CREATE TABLE matters (
            matter_id TEXT PRIMARY KEY,
            owner_user_id TEXT NOT NULL,
            matter_name TEXT NOT NULL,
            transaction_type TEXT NOT NULL,
            facts_json TEXT NOT NULL,
            uploaded_documents_json TEXT NOT NULL,
            latest_analysis_json TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    connection.execute(
        """
        CREATE TABLE analysis_runs (
            run_id TEXT PRIMARY KEY,
            matter_id TEXT NOT NULL,
            created_at TEXT NOT NULL,
            facts_json TEXT NOT NULL,
            uploaded_documents_json TEXT NOT NULL,
            result_json TEXT NOT NULL
        )
        """
    )
    connection.commit()
    connection.close()

    monkeypatch.setattr(routes, "_matter_store", lambda: MatterStore(base_dir=legacy_db_dir))
    app.dependency_overrides[get_auth_store] = lambda: AuthStore(base_dir=tmp_path / "auth")

    auth_response = client.post(
        "/api/v1/auth/signup",
        json={"email": "legacy@example.com", "password": "secret123", "name": "Legacy User"},
    )
    session_token = auth_response.json()["session_token"]
    headers = {"X-Tax-Session": session_token}

    payload = {
        "matter_name": "Legacy Matter",
        "transaction_type": "stock sale",
        "facts": {
            "transaction_name": "Legacy Matter",
            "summary": "Buyer is evaluating stock, deemed asset election, and direct asset alternatives.",
            "entities": ["Buyer", "Target"],
            "jurisdictions": ["United States"],
            "transaction_type": "stock sale",
            "stated_goals": ["Preserve optionality"],
            "constraints": ["Seller prefers stock"],
            "consideration_mix": "Cash",
            "proposed_steps": "Buyer acquires stock and tests a deemed election path.",
            "rollover_equity": False,
            "deemed_asset_sale_election": True,
            "contribution_transactions": False,
            "partnership_issues": False,
            "debt_financing": False,
            "earnout": False,
            "withholding": False,
            "state_tax": False,
            "international": False,
        },
        "uploaded_documents": [],
    }

    matter_id = client.post("/api/v1/matters", json=payload, headers=headers).json()["matter"]["matter_id"]
    analyze_response = client.post(f"/api/v1/matters/{matter_id}/analyze", json=payload, headers=headers)

    assert analyze_response.status_code == 200
    assert len(analyze_response.json()["matter"]["analysis_runs"]) == 1

    app.dependency_overrides.clear()
