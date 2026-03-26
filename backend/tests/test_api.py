from fastapi.testclient import TestClient

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
