from __future__ import annotations

import json

from fastapi import APIRouter, Depends

from tax_llm.domain.models import TransactionFacts, UploadedDocument
from tax_llm.infrastructure.paths import backend_data_path
from tax_llm.interfaces.api.dependencies import get_analyze_transaction_use_case
from tax_llm.interfaces.api.schemas import (
    AnalyzeTransactionRequest,
    AnalyzeTransactionResponse,
)
from tax_llm.application.use_cases import AnalyzeTransactionUseCase

router = APIRouter(prefix="/api/v1")


@router.get("/demo/scenario")
def get_demo_scenario():
    fixture_path = backend_data_path("seed", "demo_scenario.json")
    with fixture_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


@router.post("/intake/analyze", response_model=AnalyzeTransactionResponse)
def analyze_transaction(
    payload: AnalyzeTransactionRequest,
    use_case: AnalyzeTransactionUseCase = Depends(get_analyze_transaction_use_case),
):
    result = use_case.execute(
        facts=TransactionFacts(**payload.facts.model_dump()),
        uploaded_documents=[
            UploadedDocument(**document.model_dump())
            for document in payload.uploaded_documents
        ],
    )
    return AnalyzeTransactionResponse(result=result)
