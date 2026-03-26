from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from tax_llm.domain.models import AnalysisResult, AnalysisRun, MatterRecord, TransactionFacts, UploadedDocument
from tax_llm.infrastructure.database import connect_db, resolve_db_path


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class MatterStore:
    def __init__(self, base_dir: Path | None = None) -> None:
        self.db_path = resolve_db_path(base_dir)
        self._initialize()
        self._migrate_legacy_json(base_dir)

    def list_matters(self) -> list[MatterRecord]:
        with connect_db(self.db_path) as connection:
            rows = connection.execute(
                """
                SELECT matter_id, owner_user_id, matter_name, transaction_type, facts_json,
                       uploaded_documents_json, latest_analysis_json, created_at, updated_at
                FROM matters
                ORDER BY updated_at DESC
                """
            ).fetchall()
        return [self._matter_from_row(row) for row in rows]

    def list_matters_for_user(self, user_id: str) -> list[MatterRecord]:
        with connect_db(self.db_path) as connection:
            rows = connection.execute(
                """
                SELECT matter_id, owner_user_id, matter_name, transaction_type, facts_json,
                       uploaded_documents_json, latest_analysis_json, created_at, updated_at
                FROM matters
                WHERE owner_user_id = ?
                ORDER BY updated_at DESC
                """,
                (user_id,),
            ).fetchall()
        return [self._matter_from_row(row) for row in rows]

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
        return self.save_matter(matter)

    def get_matter(self, matter_id: str, user_id: str | None = None) -> MatterRecord:
        with connect_db(self.db_path) as connection:
            row = connection.execute(
                """
                SELECT matter_id, owner_user_id, matter_name, transaction_type, facts_json,
                       uploaded_documents_json, latest_analysis_json, created_at, updated_at
                FROM matters
                WHERE matter_id = ?
                """,
                (matter_id,),
            ).fetchone()
        if not row:
            raise FileNotFoundError(matter_id)
        matter = self._matter_from_row(row)
        if user_id and matter.owner_user_id != user_id:
            raise FileNotFoundError(matter_id)
        return matter

    def save_matter(self, matter: MatterRecord) -> MatterRecord:
        with connect_db(self.db_path) as connection:
            connection.execute(
                """
                INSERT INTO matters (
                    matter_id, owner_user_id, matter_name, transaction_type, facts_json,
                    uploaded_documents_json, latest_analysis_json, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(matter_id) DO UPDATE SET
                    owner_user_id = excluded.owner_user_id,
                    matter_name = excluded.matter_name,
                    transaction_type = excluded.transaction_type,
                    facts_json = excluded.facts_json,
                    uploaded_documents_json = excluded.uploaded_documents_json,
                    latest_analysis_json = excluded.latest_analysis_json,
                    created_at = excluded.created_at,
                    updated_at = excluded.updated_at
                """,
                (
                    matter.matter_id,
                    matter.owner_user_id,
                    matter.matter_name,
                    matter.transaction_type,
                    self._dump(matter.facts),
                    self._dump(matter.uploaded_documents),
                    self._dump(matter.latest_analysis),
                    matter.created_at,
                    matter.updated_at,
                ),
            )
        return self.get_matter(matter.matter_id)

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
        with connect_db(self.db_path) as connection:
            connection.execute(
                """
                INSERT INTO analysis_runs (
                    run_id, matter_id, created_at, facts_json, uploaded_documents_json,
                    result_json, review_status, reviewed_at, reviewed_by,
                    reviewer_notes_json, pinned_authority_ids_json, reviewed_sections_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run.run_id,
                    matter_id,
                    run.created_at,
                    self._dump(run.facts),
                    self._dump(run.uploaded_documents),
                    self._dump(run.result),
                    run.review_status,
                    run.reviewed_at,
                    run.reviewed_by,
                    self._dump(run.reviewer_notes),
                    self._dump(run.pinned_authority_ids),
                    self._dump(run.reviewed_sections),
                ),
            )
        matter.facts = facts
        matter.uploaded_documents = uploaded_documents
        matter.transaction_type = facts.transaction_type
        matter.latest_analysis = result
        matter.updated_at = run.created_at
        self.save_matter(matter)
        return self.get_matter(matter_id, user_id=user_id)

    def update_document_extractions(
        self,
        matter_id: str,
        user_id: str,
        uploaded_documents: list[UploadedDocument],
    ) -> MatterRecord:
        matter = self.get_matter(matter_id, user_id=user_id)
        matter.uploaded_documents = uploaded_documents
        matter.updated_at = utc_now_iso()
        return self.save_matter(matter)

    def update_extracted_fact_statuses(
        self,
        matter_id: str,
        user_id: str,
        confirmations: list[tuple[int, str, str]],
    ) -> MatterRecord:
        matter = self.get_matter(matter_id, user_id=user_id)
        for document_index, fact_id, status in confirmations:
            if document_index >= len(matter.uploaded_documents):
                continue
            document = matter.uploaded_documents[document_index]
            document.extracted_facts = [
                fact.model_copy(update={"status": status}) if fact.fact_id == fact_id else fact
                for fact in document.extracted_facts
            ]
        matter.updated_at = utc_now_iso()
        return self.save_matter(matter)

    def update_run_review(
        self,
        matter_id: str,
        user_id: str,
        run_id: str,
        review_status: str,
        reviewed_by: str | None,
        note: str | None,
        pinned_authority_ids: list[str] | None,
        reviewed_sections: list[str] | None,
    ) -> MatterRecord:
        matter = self.get_matter(matter_id, user_id=user_id)
        run = next((item for item in matter.analysis_runs if item.run_id == run_id), None)
        if not run:
            raise FileNotFoundError(run_id)
        notes = list(run.reviewer_notes)
        if note:
            notes.append(note.strip())
        reviewed_at = utc_now_iso() if review_status == "reviewed" else run.reviewed_at
        with connect_db(self.db_path) as connection:
            connection.execute(
                """
                UPDATE analysis_runs
                SET review_status = ?, reviewed_at = ?, reviewed_by = ?,
                    reviewer_notes_json = ?, pinned_authority_ids_json = ?, reviewed_sections_json = ?
                WHERE run_id = ? AND matter_id = ?
                """,
                (
                    review_status,
                    reviewed_at,
                    reviewed_by or run.reviewed_by,
                    self._dump(notes),
                    self._dump(pinned_authority_ids or run.pinned_authority_ids),
                    self._dump(reviewed_sections or run.reviewed_sections),
                    run_id,
                    matter_id,
                ),
            )
        return self.get_matter(matter_id, user_id=user_id)

    def get_run(self, matter_id: str, user_id: str, run_id: str) -> AnalysisRun:
        matter = self.get_matter(matter_id, user_id=user_id)
        run = next((item for item in matter.analysis_runs if item.run_id == run_id), None)
        if not run:
            raise FileNotFoundError(run_id)
        return run

    def _initialize(self) -> None:
        with connect_db(self.db_path) as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS matters (
                    matter_id TEXT PRIMARY KEY,
                    owner_user_id TEXT NOT NULL,
                    matter_name TEXT NOT NULL,
                    transaction_type TEXT NOT NULL,
                    facts_json TEXT NOT NULL,
                    uploaded_documents_json TEXT NOT NULL,
                    latest_analysis_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS analysis_runs (
                    run_id TEXT PRIMARY KEY,
                    matter_id TEXT NOT NULL REFERENCES matters(matter_id) ON DELETE CASCADE,
                    created_at TEXT NOT NULL,
                    facts_json TEXT NOT NULL,
                    uploaded_documents_json TEXT NOT NULL,
                    result_json TEXT NOT NULL,
                    review_status TEXT NOT NULL DEFAULT 'unreviewed',
                    reviewed_at TEXT,
                    reviewed_by TEXT,
                    reviewer_notes_json TEXT NOT NULL DEFAULT '[]',
                    pinned_authority_ids_json TEXT NOT NULL DEFAULT '[]',
                    reviewed_sections_json TEXT NOT NULL DEFAULT '[]'
                );
                """
            )
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(analysis_runs)").fetchall()}
            if "reviewed_sections_json" not in columns:
                connection.execute(
                    "ALTER TABLE analysis_runs ADD COLUMN reviewed_sections_json TEXT NOT NULL DEFAULT '[]'"
                )

    def _migrate_legacy_json(self, base_dir: Path | None) -> None:
        legacy_dir = None
        if base_dir and base_dir.suffix != ".db":
            legacy_dir = base_dir
        elif base_dir is None:
            legacy_dir = self.db_path.parent / "matters"
        if not legacy_dir or not legacy_dir.exists():
            return

        with connect_db(self.db_path) as connection:
            matter_count = connection.execute("SELECT COUNT(*) FROM matters").fetchone()[0]
            if matter_count > 0:
                return

            for path in legacy_dir.glob("*.json"):
                payload = json.loads(path.read_text(encoding="utf-8"))
                matter = MatterRecord.model_validate(payload)
                connection.execute(
                    """
                    INSERT OR IGNORE INTO matters (
                        matter_id, owner_user_id, matter_name, transaction_type, facts_json,
                        uploaded_documents_json, latest_analysis_json, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        matter.matter_id,
                        matter.owner_user_id,
                        matter.matter_name,
                        matter.transaction_type,
                        self._dump(matter.facts),
                        self._dump(matter.uploaded_documents),
                        self._dump(matter.latest_analysis),
                        matter.created_at,
                        matter.updated_at,
                    ),
                )
                for run in matter.analysis_runs:
                    connection.execute(
                        """
                        INSERT OR IGNORE INTO analysis_runs (
                            run_id, matter_id, created_at, facts_json, uploaded_documents_json,
                            result_json, review_status, reviewed_at, reviewed_by,
                            reviewer_notes_json, pinned_authority_ids_json, reviewed_sections_json
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            run.run_id,
                            matter.matter_id,
                            run.created_at,
                            self._dump(run.facts),
                            self._dump(run.uploaded_documents),
                            self._dump(run.result),
                            run.review_status,
                            run.reviewed_at,
                            run.reviewed_by,
                            self._dump(run.reviewer_notes),
                            self._dump(run.pinned_authority_ids),
                            self._dump(run.reviewed_sections),
                        ),
                    )

    def _matter_from_row(self, row) -> MatterRecord:
        with connect_db(self.db_path) as connection:
            runs = connection.execute(
                """
                SELECT run_id, created_at, facts_json, uploaded_documents_json, result_json,
                       review_status, reviewed_at, reviewed_by,
                       reviewer_notes_json, pinned_authority_ids_json, reviewed_sections_json
                FROM analysis_runs
                WHERE matter_id = ?
                ORDER BY created_at DESC
                """,
                (row["matter_id"],),
            ).fetchall()

        return MatterRecord(
            matter_id=row["matter_id"],
            owner_user_id=row["owner_user_id"],
            matter_name=row["matter_name"],
            transaction_type=row["transaction_type"],
            facts=TransactionFacts.model_validate(json.loads(row["facts_json"])),
            uploaded_documents=[UploadedDocument.model_validate(item) for item in json.loads(row["uploaded_documents_json"])],
            latest_analysis=AnalysisResult.model_validate(json.loads(row["latest_analysis_json"])) if row["latest_analysis_json"] else None,
            analysis_runs=[
                AnalysisRun(
                    run_id=run["run_id"],
                    created_at=run["created_at"],
                    facts=TransactionFacts.model_validate(json.loads(run["facts_json"])),
                    uploaded_documents=[UploadedDocument.model_validate(item) for item in json.loads(run["uploaded_documents_json"])],
                    result=AnalysisResult.model_validate(json.loads(run["result_json"])),
                    review_status=run["review_status"],
                    reviewed_at=run["reviewed_at"],
                    reviewed_by=run["reviewed_by"],
                    reviewer_notes=list(json.loads(run["reviewer_notes_json"])),
                    pinned_authority_ids=list(json.loads(run["pinned_authority_ids_json"])),
                    reviewed_sections=list(json.loads(run["reviewed_sections_json"])),
                )
                for run in runs
            ],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def _dump(self, payload) -> str | None:
        if payload is None:
            return None
        if isinstance(payload, list):
            return json.dumps(
                [item.model_dump(mode="json") if hasattr(item, "model_dump") else item for item in payload],
                indent=2,
            )
        if hasattr(payload, "model_dump"):
            return json.dumps(payload.model_dump(mode="json"), indent=2)
        return json.dumps(payload, indent=2)
