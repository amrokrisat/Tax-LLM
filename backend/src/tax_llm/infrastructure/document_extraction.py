from __future__ import annotations

from uuid import uuid4

from tax_llm.domain.models import ExtractedFact, UploadedDocument


class DocumentExtractionService:
    def extract(self, documents: list[UploadedDocument]) -> list[UploadedDocument]:
        extracted_documents: list[UploadedDocument] = []
        for document in documents:
            text = document.content.strip()
            facts = self._infer_facts(document.file_name, text)
            extracted_documents.append(
                document.model_copy(
                    update={
                        "extraction_status": "completed" if text else "needs_review",
                        "extracted_text": text or None,
                        "extracted_facts": facts,
                    }
                )
            )
        return extracted_documents

    def _infer_facts(self, file_name: str, text: str) -> list[ExtractedFact]:
        lowered = text.lower()
        candidates: list[ExtractedFact] = []

        def add(label: str, value: str, confidence: float) -> None:
            candidates.append(
                ExtractedFact(
                    fact_id=str(uuid4()),
                    label=label,
                    value=value,
                    source_document=file_name,
                    confidence=confidence,
                )
            )

        if "merger" in lowered:
            add("Potential transaction form", "Merger", 0.88)
        if "asset sale" in lowered or "asset acquisition" in lowered:
            add("Potential transaction form", "Asset acquisition", 0.82)
        if "stock" in lowered and "sale" in lowered:
            add("Potential transaction form", "Stock sale", 0.78)
        if "rollover" in lowered:
            add("Consideration feature", "Rollover equity appears relevant", 0.84)
        if "nol" in lowered or "net operating loss" in lowered:
            add("Attribute preservation", "Historic tax attributes may be material", 0.9)
        if "refinanc" in lowered or "debt" in lowered:
            add("Financing overlay", "Acquisition financing or refinancing appears relevant", 0.8)
        if "earnout" in lowered or "contingent" in lowered:
            add("Deferred consideration", "Earnout or contingent consideration appears relevant", 0.76)

        return candidates

