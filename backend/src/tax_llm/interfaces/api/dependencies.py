from __future__ import annotations

from fastapi import Depends, Header, HTTPException

from tax_llm.application.services import AnalysisService
from tax_llm.application.use_cases import AnalyzeTransactionUseCase
from tax_llm.infrastructure.auth_store import AuthStore
from tax_llm.infrastructure.ai_assist import OpenAIAssistService
from tax_llm.infrastructure.document_parser import DemoDocumentParser
from tax_llm.infrastructure.repositories import AuthorityCorpusRepository


def get_analyze_transaction_use_case() -> AnalyzeTransactionUseCase:
    service = AnalysisService(
        authority_repository=AuthorityCorpusRepository(),
        document_parser=DemoDocumentParser(),
        ai_assist_service=OpenAIAssistService(),
    )
    return AnalyzeTransactionUseCase(service=service)


def get_auth_store() -> AuthStore:
    return AuthStore()


def get_current_user_id(
    x_tax_session: str | None = Header(default=None),
    auth_store: AuthStore = Depends(get_auth_store),
) -> str:
    if not x_tax_session:
        raise HTTPException(status_code=401, detail="Authentication required.")

    user = auth_store.get_user_for_session(x_tax_session)
    if not user:
        raise HTTPException(status_code=401, detail="Session is invalid or expired.")
    return user.user_id
