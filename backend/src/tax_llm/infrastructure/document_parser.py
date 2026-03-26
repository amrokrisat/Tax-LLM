from __future__ import annotations

from tax_llm.domain.models import UploadedDocument


class DemoDocumentParser:
    def parse(self, documents: list[UploadedDocument]) -> list[UploadedDocument]:
        parsed = []
        for document in documents:
            normalized = document.model_copy(
                update={"content": document.content.strip()}
            )
            parsed.append(normalized)
        return parsed
