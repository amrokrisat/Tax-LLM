from __future__ import annotations

from tax_llm.application.services import AnalysisService
from tax_llm.application.use_cases import AnalyzeTransactionUseCase
from tax_llm.infrastructure.document_parser import DemoDocumentParser
from tax_llm.infrastructure.repositories import AuthorityCorpusRepository


def get_analyze_transaction_use_case() -> AnalyzeTransactionUseCase:
    service = AnalysisService(
        authority_repository=AuthorityCorpusRepository(),
        document_parser=DemoDocumentParser(),
    )
    return AnalyzeTransactionUseCase(service=service)
