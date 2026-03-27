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
    assert "full_text" in body["authorities_reviewed"][0]


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
    run_id = matter["analysis_runs"][0]["run_id"]

    workspace_response = client.get(
        f"/api/v1/matters/{matter_id}?view=workspace_summary",
        headers=headers,
    )
    assert workspace_response.status_code == 200
    workspace_matter = workspace_response.json()["matter"]
    assert workspace_matter["matter_id"] == matter_id
    assert len(workspace_matter["analysis_runs"]) == 1
    assert "result" not in workspace_matter["analysis_runs"][0]
    assert workspace_matter["analysis_runs"][0]["run_id"] == run_id

    run_response = client.get(
        f"/api/v1/matters/{matter_id}/runs/{run_id}",
        headers=headers,
    )
    assert run_response.status_code == 200
    assert run_response.json()["run"]["run_id"] == run_id
    assert run_response.json()["run"]["result"]["memo_sections"]

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
    assert "category" in extracted_document["extracted_facts"][0]
    assert "certainty" in extracted_document["extracted_facts"][0]
    assert "normalized_field" in extracted_document["extracted_facts"][0]
    assert "extraction_ambiguities" in extracted_document

    persisted = client.put(
        f"/api/v1/matters/{matter_id}",
        json={
            **payload,
            "uploaded_documents": [extracted_document],
        },
        headers=headers,
    )
    assert persisted.status_code == 200
    persisted_document = persisted.json()["matter"]["uploaded_documents"][0]
    assert persisted_document["extracted_text"] == extracted_document["extracted_text"]
    assert persisted_document["extraction_ambiguities"] == extracted_document["extraction_ambiguities"]
    assert persisted_document["extracted_facts"][0]["category"] == extracted_document["extracted_facts"][0]["category"]

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


def test_structured_workspace_fields_persist_snapshot_and_export(monkeypatch, tmp_path):
    monkeypatch.setattr(routes, "_matter_store", lambda: MatterStore(base_dir=tmp_path / "matters"))
    app.dependency_overrides[get_auth_store] = lambda: AuthStore(base_dir=tmp_path / "auth")

    auth_response = client.post(
        "/api/v1/auth/signup",
        json={"email": "structure@example.com", "password": "secret123", "name": "Structure User"},
    )
    session_token = auth_response.json()["session_token"]
    headers = {"X-Tax-Session": session_token}

    buyer_id = "entity-buyer"
    target_id = "entity-target"
    step_id = "step-closing"
    payload = {
        "matter_name": "Structured Matter",
        "transaction_type": "stock sale",
        "facts": {
            "transaction_name": "Structured Matter",
            "summary": "Buyer acquires Target through a stock-form closing with an election workstream.",
            "entities": ["Buyer", "Target"],
            "jurisdictions": ["United States"],
            "transaction_type": "stock sale",
            "stated_goals": ["Preserve optionality"],
            "constraints": ["Seller prefers stock treatment"],
            "consideration_mix": "Cash",
            "proposed_steps": "Buyer signs, closes, and considers a filing step.",
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
        "entities": [
            {
                "entity_id": buyer_id,
                "name": "Buyer",
                "entity_type": "corporation",
                "jurisdiction": "Delaware",
                "status": "confirmed",
                "notes": "",
                "source_fact_ids": [],
            },
            {
                "entity_id": target_id,
                "name": "Target",
                "entity_type": "corporation",
                "jurisdiction": "Delaware",
                "status": "confirmed",
                "notes": "",
                "source_fact_ids": [],
            },
        ],
        "ownership_links": [
            {
                "link_id": "link-1",
                "parent_entity_id": buyer_id,
                "child_entity_id": target_id,
                "relationship_type": "owns",
                "ownership_percentage": 100,
                "status": "proposed",
                "notes": "",
                "source_fact_ids": [],
            }
        ],
        "tax_classifications": [
            {
                "classification_id": "classification-1",
                "entity_id": target_id,
                "classification_type": "c_corporation",
                "status": "confirmed",
                "notes": "",
                "source_fact_ids": [],
            }
        ],
        "transaction_roles": [
            {
                "role_id": "role-1",
                "entity_id": target_id,
                "role_type": "target",
                "status": "confirmed",
                "notes": "",
                "source_fact_ids": [],
            }
        ],
        "transaction_steps": [
            {
                "step_id": step_id,
                "sequence_number": 1,
                "phase": "closing",
                "step_type": "stock_purchase",
                "title": "Buyer acquires Target stock",
                "description": "Closing stock acquisition step.",
                "entity_ids": [buyer_id, target_id],
                "status": "confirmed",
                "source_fact_ids": [],
            }
        ],
        "election_items": [
            {
                "item_id": "item-1",
                "name": "Section 338(h)(10) workstream",
                "item_type": "election",
                "citation_or_form": "Form 8023",
                "related_entity_ids": [buyer_id, target_id],
                "related_step_ids": [step_id],
                "status": "possible",
                "notes": "",
                "source_fact_ids": [],
            }
        ],
    }

    create_response = client.post("/api/v1/matters", json=payload, headers=headers)
    assert create_response.status_code == 200
    matter = create_response.json()["matter"]
    matter_id = matter["matter_id"]
    assert len(matter["entities"]) == 2
    assert matter["transaction_steps"][0]["title"] == "Buyer acquires Target stock"

    analyze_response = client.post(f"/api/v1/matters/{matter_id}/analyze", json=payload, headers=headers)
    assert analyze_response.status_code == 200
    run_id = analyze_response.json()["matter"]["analysis_runs"][0]["run_id"]

    run_response = client.get(f"/api/v1/matters/{matter_id}/runs/{run_id}", headers=headers)
    assert run_response.status_code == 200
    run = run_response.json()["run"]
    assert run["entities"][0]["name"] == "Buyer"
    assert run["transaction_steps"][0]["title"] == "Buyer acquires Target stock"
    assert run["election_items"][0]["citation_or_form"] == "Form 8023"

    export_response = client.get(f"/api/v1/matters/{matter_id}/runs/{run_id}/export", headers=headers)
    assert export_response.status_code == 200
    export_body = export_response.json()["content"]
    assert "Entity Structure Snapshot" in export_body
    assert "Transaction Steps Snapshot" in export_body
    assert "Elections And Filings" in export_body

    app.dependency_overrides.clear()


def test_confirming_structured_candidate_upserts_entity(monkeypatch, tmp_path):
    monkeypatch.setattr(routes, "_matter_store", lambda: MatterStore(base_dir=tmp_path / "matters"))
    app.dependency_overrides[get_auth_store] = lambda: AuthStore(base_dir=tmp_path / "auth")

    auth_response = client.post(
        "/api/v1/auth/signup",
        json={"email": "extract@example.com", "password": "secret123", "name": "Extract User"},
    )
    session_token = auth_response.json()["session_token"]
    headers = {"X-Tax-Session": session_token}

    payload = {
        "matter_name": "Extraction Bridge Matter",
        "transaction_type": "stock sale",
        "facts": {
            "transaction_name": "Extraction Bridge Matter",
            "summary": "Buyer reviews target structure.",
            "entities": ["Buyer", "Target"],
            "jurisdictions": ["United States"],
            "transaction_type": "stock sale",
            "stated_goals": [],
            "constraints": [],
            "consideration_mix": "Cash",
            "proposed_steps": "Buyer reviews the transaction.",
            "rollover_equity": False,
            "deemed_asset_sale_election": False,
            "contribution_transactions": False,
            "partnership_issues": False,
            "debt_financing": False,
            "earnout": False,
            "withholding": False,
            "state_tax": False,
            "international": False,
        },
        "uploaded_documents": [
            {
                "file_name": "notes.txt",
                "document_type": "notes",
                "content": "Target LLC sits under Buyer Holdco.",
                "source": "pasted",
                "extraction_status": "completed",
                "extracted_text": "Target LLC sits under Buyer Holdco.",
                "extracted_facts": [
                    {
                        "fact_id": "fact-entity-target",
                        "label": "Entity mention",
                        "value": "Target LLC",
                        "status": "pending",
                        "confidence": 0.92,
                        "certainty": "high",
                        "source_document": "notes.txt",
                        "category": "entity_candidate",
                        "normalized_target_kind": "entity",
                        "normalized_target_payload": {
                            "name": "Target LLC",
                            "entity_type": "llc",
                            "status": "confirmed",
                        },
                    }
                ],
            }
        ],
    }

    create_response = client.post("/api/v1/matters", json=payload, headers=headers)
    assert create_response.status_code == 200
    matter_id = create_response.json()["matter"]["matter_id"]

    confirm_response = client.post(
        f"/api/v1/matters/{matter_id}/documents/confirm-facts",
        json={"confirmations": [{"document_index": 0, "fact_id": "fact-entity-target", "status": "confirmed"}]},
        headers=headers,
    )
    assert confirm_response.status_code == 200
    confirmed_matter = confirm_response.json()["matter"]
    assert any(entity["name"] == "Target LLC" for entity in confirmed_matter["entities"])
    fact = confirmed_matter["uploaded_documents"][0]["extracted_facts"][0]
    assert fact["mapped_record_kind"] == "entity"
    assert fact["mapped_record_label"] == "Target LLC"

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


def test_analyze_matter_surfaces_unhandled_errors(monkeypatch, tmp_path):
    store = MatterStore(base_dir=tmp_path / "matters")
    monkeypatch.setattr(routes, "_matter_store", lambda: store)
    app.dependency_overrides[get_auth_store] = lambda: AuthStore(base_dir=tmp_path / "auth")

    auth_response = client.post(
        "/api/v1/auth/signup",
        json={"email": "broken@example.com", "password": "secret123", "name": "Broken User"},
    )
    session_token = auth_response.json()["session_token"]
    headers = {"X-Tax-Session": session_token}

    payload = {
        "matter_name": "Broken Matter",
        "transaction_type": "stock sale",
        "facts": {
            "transaction_name": "Broken Matter",
            "summary": "Buyer is evaluating stock and asset paths.",
            "entities": ["Buyer", "Target"],
            "jurisdictions": ["United States"],
            "transaction_type": "stock sale",
            "stated_goals": ["Preserve optionality"],
            "constraints": ["Seller prefers stock"],
            "consideration_mix": "Cash",
            "proposed_steps": "Buyer acquires stock.",
            "rollover_equity": False,
            "deemed_asset_sale_election": False,
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

    def _explode(*args, **kwargs):
        raise RuntimeError("boom")

    monkeypatch.setattr(store, "append_analysis_run", _explode)
    analyze_response = client.post(f"/api/v1/matters/{matter_id}/analyze", json=payload, headers=headers)

    assert analyze_response.status_code == 500
    assert "Analyze matter failed: RuntimeError: boom" == analyze_response.json()["detail"]

    app.dependency_overrides.clear()
