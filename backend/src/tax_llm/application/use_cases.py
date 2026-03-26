from __future__ import annotations

from dataclasses import dataclass

from tax_llm.domain.models import AnalysisResult, TransactionFacts, UploadedDocument
from tax_llm.application.services import AnalysisService


@dataclass
class AnalyzeTransactionUseCase:
    service: AnalysisService

    def execute(
        self, facts: TransactionFacts, uploaded_documents: list[UploadedDocument]
    ) -> AnalysisResult:
        return self.service.analyze(facts=facts, uploaded_documents=uploaded_documents)
