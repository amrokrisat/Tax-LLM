from __future__ import annotations

from dataclasses import dataclass

from tax_llm.domain.models import (
    AnalysisResult,
    ElectionOrFilingItem,
    Entity,
    OwnershipLink,
    TaxClassification,
    TransactionFacts,
    TransactionRole,
    TransactionStep,
    UploadedDocument,
)
from tax_llm.application.services import AnalysisService


@dataclass
class AnalyzeTransactionUseCase:
    service: AnalysisService

    def execute(
        self,
        facts: TransactionFacts,
        uploaded_documents: list[UploadedDocument],
        entities: list[Entity] | None = None,
        ownership_links: list[OwnershipLink] | None = None,
        tax_classifications: list[TaxClassification] | None = None,
        transaction_roles: list[TransactionRole] | None = None,
        transaction_steps: list[TransactionStep] | None = None,
        election_items: list[ElectionOrFilingItem] | None = None,
    ) -> AnalysisResult:
        return self.service.analyze(
            facts=facts,
            uploaded_documents=uploaded_documents,
            entities=entities,
            ownership_links=ownership_links,
            tax_classifications=tax_classifications,
            transaction_roles=transaction_roles,
            transaction_steps=transaction_steps,
            election_items=election_items,
        )
