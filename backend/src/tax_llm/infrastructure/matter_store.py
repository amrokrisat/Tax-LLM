from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from tax_llm.domain.models import AnalysisResult, AnalysisRun, MatterRecord, TransactionFacts, UploadedDocument
from tax_llm.infrastructure.paths import backend_data_path


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class MatterStore:
    def __init__(self, base_dir: Path | None = None) -> None:
        self.base_dir = base_dir or backend_data_path("matters")
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def list_matters(self) -> list[MatterRecord]:
        matters = [self._load_path(path) for path in self.base_dir.glob("*.json")]
        return sorted(matters, key=lambda matter: matter.updated_at, reverse=True)

    def list_matters_for_user(self, user_id: str) -> list[MatterRecord]:
        return [matter for matter in self.list_matters() if matter.owner_user_id == user_id]

    def create_matter(
        self,
        owner_user_id: str,
        matter_name: str,
        transaction_type: str,
        facts: TransactionFacts,
        uploaded_documents: list[UploadedDocument],
    ) -> MatterRecord:
        timestamp = utc_now_iso()
        matter = MatterRecord(
            matter_id=str(uuid4()),
            owner_user_id=owner_user_id,
            matter_name=matter_name,
            transaction_type=transaction_type,
            facts=facts,
            uploaded_documents=uploaded_documents,
            latest_analysis=None,
            analysis_runs=[],
            created_at=timestamp,
            updated_at=timestamp,
        )
        self.save_matter(matter)
        return matter

    def get_matter(self, matter_id: str, user_id: str | None = None) -> MatterRecord:
        matter = self._load_path(self._matter_path(matter_id))
        if user_id and matter.owner_user_id != user_id:
            raise FileNotFoundError(matter_id)
        return matter

    def save_matter(self, matter: MatterRecord) -> MatterRecord:
        path = self._matter_path(matter.matter_id)
        path.write_text(
            json.dumps(matter.model_dump(mode="json"), indent=2),
            encoding="utf-8",
        )
        return matter

    def update_matter(
        self,
        matter_id: str,
        user_id: str,
        matter_name: str,
        transaction_type: str,
        facts: TransactionFacts,
        uploaded_documents: list[UploadedDocument],
    ) -> MatterRecord:
        matter = self.get_matter(matter_id, user_id=user_id)
        matter.matter_name = matter_name
        matter.transaction_type = transaction_type
        matter.facts = facts
        matter.uploaded_documents = uploaded_documents
        matter.updated_at = utc_now_iso()
        return self.save_matter(matter)

    def append_analysis_run(
        self,
        matter_id: str,
        user_id: str,
        facts: TransactionFacts,
        uploaded_documents: list[UploadedDocument],
        result: AnalysisResult,
    ) -> MatterRecord:
        matter = self.get_matter(matter_id, user_id=user_id)
        run = AnalysisRun(
            run_id=str(uuid4()),
            created_at=utc_now_iso(),
            facts=facts,
            uploaded_documents=uploaded_documents,
            result=result,
        )
        matter.facts = facts
        matter.uploaded_documents = uploaded_documents
        matter.transaction_type = facts.transaction_type
        matter.latest_analysis = result
        matter.analysis_runs = [run, *matter.analysis_runs]
        matter.updated_at = run.created_at
        return self.save_matter(matter)

    def _matter_path(self, matter_id: str) -> Path:
        return self.base_dir / f"{matter_id}.json"

    def _load_path(self, path: Path) -> MatterRecord:
        with path.open("r", encoding="utf-8") as handle:
            return MatterRecord.model_validate(json.load(handle))
