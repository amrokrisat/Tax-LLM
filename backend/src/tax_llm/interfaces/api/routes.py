from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Header
from fastapi import HTTPException

from tax_llm.application.reporting import export_run_markdown
from tax_llm.domain.models import TransactionFacts, UploadedDocument
from tax_llm.infrastructure.auth_store import AuthStore
from tax_llm.infrastructure.document_extraction import DocumentExtractionService
from tax_llm.infrastructure.matter_store import MatterStore
from tax_llm.infrastructure.paths import backend_data_path
from tax_llm.interfaces.api.dependencies import (
    get_analyze_transaction_use_case,
    get_auth_store,
    get_current_user_id,
)
from tax_llm.interfaces.api.schemas import (
    AuthUserResponse,
    AuthCredentialsInput,
    AuthSessionResponse,
    AnalyzeTransactionRequest,
    AnalyzeTransactionResponse,
    DocumentFactConfirmationRequest,
    ExportMemoResponse,
    GoogleAuthInput,
    MatterInput,
    MatterListResponse,
    MatterResponse,
    RunReviewInput,
)
from tax_llm.application.use_cases import AnalyzeTransactionUseCase

router = APIRouter(prefix="/api/v1")


def _public_user(user) -> AuthUserResponse:
    return AuthUserResponse(
        user_id=user.user_id,
        email=user.email,
        name=user.name,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


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


def _matter_store() -> MatterStore:
    return MatterStore()


def _document_extraction_service() -> DocumentExtractionService:
    return DocumentExtractionService()


@router.post("/auth/signup", response_model=AuthSessionResponse)
def signup(
    payload: AuthCredentialsInput,
    auth_store: AuthStore = Depends(get_auth_store),
):
    try:
        user = auth_store.create_user(
            email=payload.email,
            password=payload.password,
            name=payload.name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    session = auth_store.create_session(user.user_id)
    return AuthSessionResponse(session_token=session.session_token, user=_public_user(user))


@router.post("/auth/login", response_model=AuthSessionResponse)
def login(
    payload: AuthCredentialsInput,
    auth_store: AuthStore = Depends(get_auth_store),
):
    user = auth_store.authenticate(email=payload.email, password=payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    session = auth_store.create_session(user.user_id)
    return AuthSessionResponse(session_token=session.session_token, user=_public_user(user))


@router.post("/auth/google", response_model=AuthSessionResponse)
def google_login(
    payload: GoogleAuthInput,
    auth_store: AuthStore = Depends(get_auth_store),
):
    user = auth_store.create_or_update_google_user(email=payload.email, name=payload.name)
    session = auth_store.create_session(user.user_id)
    return AuthSessionResponse(session_token=session.session_token, user=_public_user(user))


@router.post("/auth/logout")
def logout(
    current_user_id: str = Depends(get_current_user_id),
    auth_store: AuthStore = Depends(get_auth_store),
    x_tax_session: str | None = Header(default=None),
):
    del current_user_id
    if x_tax_session:
        auth_store.delete_session(x_tax_session)
    return {"ok": True}


@router.get("/auth/me", response_model=AuthSessionResponse)
def current_session(
    x_tax_session: str | None = Header(default=None),
    auth_store: AuthStore = Depends(get_auth_store),
):
    if not x_tax_session:
        raise HTTPException(status_code=401, detail="Authentication required.")
    user = auth_store.get_user_for_session(x_tax_session)
    if not user:
        raise HTTPException(status_code=401, detail="Session is invalid or expired.")
    return AuthSessionResponse(session_token=x_tax_session, user=_public_user(user))


@router.get("/matters", response_model=MatterListResponse)
def list_matters(current_user_id: str = Depends(get_current_user_id)):
    return MatterListResponse(matters=_matter_store().list_matters_for_user(current_user_id))


@router.post("/matters", response_model=MatterResponse)
def create_matter(
    payload: MatterInput,
    current_user_id: str = Depends(get_current_user_id),
):
    matter = _matter_store().create_matter(
        owner_user_id=current_user_id,
        matter_name=payload.matter_name,
        transaction_type=payload.transaction_type,
        facts=TransactionFacts(**payload.facts.model_dump()),
        uploaded_documents=[
            UploadedDocument(**document.model_dump())
            for document in payload.uploaded_documents
        ],
    )
    return MatterResponse(matter=matter)


@router.get("/matters/{matter_id}", response_model=MatterResponse)
def get_matter(matter_id: str, current_user_id: str = Depends(get_current_user_id)):
    try:
        return MatterResponse(matter=_matter_store().get_matter(matter_id, user_id=current_user_id))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Matter not found.") from exc


@router.put("/matters/{matter_id}", response_model=MatterResponse)
def update_matter(
    matter_id: str,
    payload: MatterInput,
    current_user_id: str = Depends(get_current_user_id),
):
    try:
        matter = _matter_store().update_matter(
            matter_id=matter_id,
            user_id=current_user_id,
            matter_name=payload.matter_name,
            transaction_type=payload.transaction_type,
            facts=TransactionFacts(**payload.facts.model_dump()),
            uploaded_documents=[
                UploadedDocument(**document.model_dump())
                for document in payload.uploaded_documents
            ],
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Matter not found.") from exc
    return MatterResponse(matter=matter)


@router.post("/matters/{matter_id}/analyze", response_model=MatterResponse)
def analyze_matter(
    matter_id: str,
    payload: MatterInput,
    use_case: AnalyzeTransactionUseCase = Depends(get_analyze_transaction_use_case),
    current_user_id: str = Depends(get_current_user_id),
):
    facts = TransactionFacts(**payload.facts.model_dump())
    uploaded_documents = [
        UploadedDocument(**document.model_dump())
        for document in payload.uploaded_documents
    ]
    result = use_case.execute(facts=facts, uploaded_documents=uploaded_documents)

    try:
        matter = _matter_store().append_analysis_run(
            matter_id=matter_id,
            user_id=current_user_id,
            facts=facts,
            uploaded_documents=uploaded_documents,
            result=result,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Matter not found.") from exc

    return MatterResponse(matter=matter)


@router.post("/matters/{matter_id}/documents/extract", response_model=MatterResponse)
def extract_documents(
    matter_id: str,
    current_user_id: str = Depends(get_current_user_id),
):
    store = _matter_store()
    try:
        matter = store.get_matter(matter_id, user_id=current_user_id)
        extracted = _document_extraction_service().extract(matter.uploaded_documents)
        updated = store.update_document_extractions(matter_id, current_user_id, extracted)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Matter not found.") from exc
    return MatterResponse(matter=updated)


@router.post("/matters/{matter_id}/documents/confirm-facts", response_model=MatterResponse)
def confirm_document_facts(
    matter_id: str,
    payload: DocumentFactConfirmationRequest,
    current_user_id: str = Depends(get_current_user_id),
):
    try:
        matter = _matter_store().update_extracted_fact_statuses(
            matter_id,
            current_user_id,
            [(item.document_index, item.fact_id, item.status) for item in payload.confirmations],
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Matter not found.") from exc
    return MatterResponse(matter=matter)


@router.post("/matters/{matter_id}/runs/{run_id}/review", response_model=MatterResponse)
def review_run(
    matter_id: str,
    run_id: str,
    payload: RunReviewInput,
    current_user_id: str = Depends(get_current_user_id),
):
    try:
        matter = _matter_store().update_run_review(
            matter_id=matter_id,
            user_id=current_user_id,
            run_id=run_id,
            review_status=payload.review_status,
            reviewed_by=payload.reviewed_by or None,
            note=payload.note or None,
            pinned_authority_ids=payload.pinned_authority_ids,
            reviewed_sections=payload.reviewed_sections,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Matter or run not found.") from exc
    return MatterResponse(matter=matter)


@router.get("/matters/{matter_id}/runs/{run_id}/export", response_model=ExportMemoResponse)
def export_run(
    matter_id: str,
    run_id: str,
    current_user_id: str = Depends(get_current_user_id),
):
    try:
        run = _matter_store().get_run(matter_id, current_user_id, run_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Matter or run not found.") from exc
    return ExportMemoResponse(format="markdown", content=export_run_markdown(run))
