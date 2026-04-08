from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from tax_llm.domain.models import (
    AnalysisResult,
    AnalysisRun,
    ElectionOrFilingItem,
    Entity,
    ExtractedFact,
    MatterRecord,
    OwnershipLink,
    StructureProposal,
    TaxClassification,
    TransactionFacts,
    TransactionRole,
    TransactionStep,
    UploadedDocument,
)
from tax_llm.infrastructure.database import connect_db, resolve_db_path


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


STRUCTURED_MATTER_COLUMNS = {
    "entities_json": "[]",
    "ownership_links_json": "[]",
    "tax_classifications_json": "[]",
    "transaction_roles_json": "[]",
    "transaction_steps_json": "[]",
    "election_items_json": "[]",
    "structure_proposals_json": "[]",
}


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
                       uploaded_documents_json, entities_json, ownership_links_json,
                       tax_classifications_json, transaction_roles_json, transaction_steps_json,
                       election_items_json, structure_proposals_json, latest_analysis_json, created_at, updated_at
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
                       uploaded_documents_json, entities_json, ownership_links_json,
                       tax_classifications_json, transaction_roles_json, transaction_steps_json,
                       election_items_json, structure_proposals_json, latest_analysis_json, created_at, updated_at
                FROM matters
                WHERE owner_user_id = ?
                ORDER BY updated_at DESC
                """,
                (user_id,),
            ).fetchall()
        return [self._matter_from_row(row) for row in rows]

    def list_matter_summaries_for_user(self, user_id: str) -> list[dict]:
        with connect_db(self.db_path) as connection:
            rows = connection.execute(
                """
                SELECT
                    m.matter_id,
                    m.matter_name,
                    m.transaction_type,
                    m.facts_json,
                    m.uploaded_documents_json,
                    m.entities_json,
                    m.ownership_links_json,
                    m.tax_classifications_json,
                    m.transaction_roles_json,
                    m.transaction_steps_json,
                    m.election_items_json,
                    m.structure_proposals_json,
                    m.created_at,
                    m.updated_at,
                    COUNT(ar.run_id) AS analysis_run_count
                FROM matters m
                LEFT JOIN analysis_runs ar ON ar.matter_id = m.matter_id
                WHERE m.owner_user_id = ?
                GROUP BY
                    m.matter_id,
                    m.matter_name,
                    m.transaction_type,
                    m.facts_json,
                    m.uploaded_documents_json,
                    m.entities_json,
                    m.ownership_links_json,
                    m.tax_classifications_json,
                    m.transaction_roles_json,
                    m.transaction_steps_json,
                    m.election_items_json,
                    m.structure_proposals_json,
                    m.created_at,
                    m.updated_at
                ORDER BY m.updated_at DESC
                """,
                (user_id,),
            ).fetchall()

        summaries: list[dict] = []
        for row in rows:
            facts = json.loads(row["facts_json"])
            documents = json.loads(row["uploaded_documents_json"])
            summaries.append(
                {
                    "matter_id": row["matter_id"],
                    "matter_name": row["matter_name"],
                    "transaction_type": row["transaction_type"],
                    "summary": facts.get("summary", ""),
                    "analysis_run_count": int(row["analysis_run_count"] or 0),
                    "document_count": len(documents),
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                }
            )
        return summaries

    def get_matter_workspace(self, matter_id: str, user_id: str | None = None) -> dict:
        with connect_db(self.db_path) as connection:
            row = connection.execute(
                """
                SELECT matter_id, owner_user_id, matter_name, transaction_type, facts_json,
                       uploaded_documents_json, entities_json, ownership_links_json,
                       tax_classifications_json, transaction_roles_json, transaction_steps_json,
                       election_items_json, structure_proposals_json, created_at, updated_at
                FROM matters
                WHERE matter_id = ?
                """,
                (matter_id,),
            ).fetchone()
            if not row:
                raise FileNotFoundError(matter_id)

            summary_rows = connection.execute(
                """
                SELECT
                    run_id,
                    created_at,
                    result_json,
                    review_status,
                    reviewed_at,
                    reviewed_by
                FROM analysis_runs
                WHERE matter_id = ?
                ORDER BY created_at DESC
                """,
                (matter_id,),
            ).fetchall()

        if user_id and row["owner_user_id"] != user_id:
            raise FileNotFoundError(matter_id)

        run_summaries: list[dict] = []
        for run in summary_rows:
            result = json.loads(run["result_json"])
            run_summaries.append(
                {
                    "run_id": run["run_id"],
                    "created_at": run["created_at"],
                    "issue_bucket_count": len(result.get("classification", [])),
                    "authority_count": len(result.get("authorities_reviewed", [])),
                    "review_status": run["review_status"] or "unreviewed",
                    "reviewed_at": run["reviewed_at"],
                    "reviewed_by": run["reviewed_by"],
                }
            )

        return {
            "matter_id": row["matter_id"],
            "matter_name": row["matter_name"],
            "transaction_type": row["transaction_type"],
            "facts": json.loads(row["facts_json"]),
            "uploaded_documents": json.loads(row["uploaded_documents_json"]),
            "entities": json.loads(row["entities_json"]),
            "ownership_links": json.loads(row["ownership_links_json"]),
            "tax_classifications": json.loads(row["tax_classifications_json"]),
            "transaction_roles": json.loads(row["transaction_roles_json"]),
            "transaction_steps": json.loads(row["transaction_steps_json"]),
            "election_items": json.loads(row["election_items_json"]),
            "structure_proposals": json.loads(row["structure_proposals_json"] or "[]"),
            "analysis_runs": run_summaries,
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
        }

    def create_matter(
        self,
        owner_user_id: str,
        matter_name: str,
        transaction_type: str,
        facts: TransactionFacts,
        uploaded_documents: list[UploadedDocument],
        entities: list[Entity] | None = None,
        ownership_links: list[OwnershipLink] | None = None,
        tax_classifications: list[TaxClassification] | None = None,
        transaction_roles: list[TransactionRole] | None = None,
        transaction_steps: list[TransactionStep] | None = None,
        election_items: list[ElectionOrFilingItem] | None = None,
        structure_proposals: list[StructureProposal] | None = None,
    ) -> MatterRecord:
        timestamp = utc_now_iso()
        matter = MatterRecord(
            matter_id=str(uuid4()),
            owner_user_id=owner_user_id,
            matter_name=matter_name,
            transaction_type=transaction_type,
            facts=facts,
            uploaded_documents=uploaded_documents,
            entities=entities or [],
            ownership_links=ownership_links or [],
            tax_classifications=tax_classifications or [],
            transaction_roles=transaction_roles or [],
            transaction_steps=transaction_steps or [],
            election_items=election_items or [],
            structure_proposals=structure_proposals or [],
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
                       uploaded_documents_json, entities_json, ownership_links_json,
                       tax_classifications_json, transaction_roles_json, transaction_steps_json,
                       election_items_json, structure_proposals_json, latest_analysis_json, created_at, updated_at
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
                    uploaded_documents_json, entities_json, ownership_links_json,
                    tax_classifications_json, transaction_roles_json, transaction_steps_json,
                    election_items_json, structure_proposals_json, latest_analysis_json, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(matter_id) DO UPDATE SET
                    owner_user_id = excluded.owner_user_id,
                    matter_name = excluded.matter_name,
                    transaction_type = excluded.transaction_type,
                    facts_json = excluded.facts_json,
                    uploaded_documents_json = excluded.uploaded_documents_json,
                    entities_json = excluded.entities_json,
                    ownership_links_json = excluded.ownership_links_json,
                    tax_classifications_json = excluded.tax_classifications_json,
                    transaction_roles_json = excluded.transaction_roles_json,
                    transaction_steps_json = excluded.transaction_steps_json,
                    election_items_json = excluded.election_items_json,
                    structure_proposals_json = excluded.structure_proposals_json,
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
                    self._dump(matter.entities),
                    self._dump(matter.ownership_links),
                    self._dump(matter.tax_classifications),
                    self._dump(matter.transaction_roles),
                    self._dump(matter.transaction_steps),
                    self._dump(matter.election_items),
                    self._dump(matter.structure_proposals),
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
        entities: list[Entity],
        ownership_links: list[OwnershipLink],
        tax_classifications: list[TaxClassification],
        transaction_roles: list[TransactionRole],
        transaction_steps: list[TransactionStep],
        election_items: list[ElectionOrFilingItem],
        structure_proposals: list[StructureProposal],
    ) -> MatterRecord:
        matter = self.get_matter(matter_id, user_id=user_id)
        matter.matter_name = matter_name
        matter.transaction_type = transaction_type
        matter.facts = facts
        matter.uploaded_documents = uploaded_documents
        matter.entities = entities
        matter.ownership_links = ownership_links
        matter.tax_classifications = tax_classifications
        matter.transaction_roles = transaction_roles
        matter.transaction_steps = transaction_steps
        matter.election_items = election_items
        matter.structure_proposals = structure_proposals
        matter.updated_at = utc_now_iso()
        return self.save_matter(matter)

    def append_analysis_run(
        self,
        matter_id: str,
        user_id: str,
        facts: TransactionFacts,
        uploaded_documents: list[UploadedDocument],
        entities: list[Entity],
        ownership_links: list[OwnershipLink],
        tax_classifications: list[TaxClassification],
        transaction_roles: list[TransactionRole],
        transaction_steps: list[TransactionStep],
        election_items: list[ElectionOrFilingItem],
        result: AnalysisResult,
    ) -> MatterRecord:
        matter = self.get_matter(matter_id, user_id=user_id)
        run = AnalysisRun(
            run_id=str(uuid4()),
            created_at=utc_now_iso(),
            facts=facts,
            uploaded_documents=uploaded_documents,
            entities=entities,
            ownership_links=ownership_links,
            tax_classifications=tax_classifications,
            transaction_roles=transaction_roles,
            transaction_steps=transaction_steps,
            election_items=election_items,
            result=result,
        )
        analysis_run_columns = self._analysis_run_columns()
        insert_columns = [
            "run_id",
            "matter_id",
            "created_at",
            "facts_json",
            "uploaded_documents_json",
            "entities_json",
            "ownership_links_json",
            "tax_classifications_json",
            "transaction_roles_json",
            "transaction_steps_json",
            "election_items_json",
            "result_json",
        ]
        insert_values = [
            run.run_id,
            matter_id,
            run.created_at,
            self._dump(run.facts),
            self._dump(run.uploaded_documents),
            self._dump(run.entities),
            self._dump(run.ownership_links),
            self._dump(run.tax_classifications),
            self._dump(run.transaction_roles),
            self._dump(run.transaction_steps),
            self._dump(run.election_items),
            self._dump(run.result),
        ]
        optional_columns = {
            "review_status": run.review_status,
            "reviewed_at": run.reviewed_at,
            "reviewed_by": run.reviewed_by,
            "reviewer_notes_json": self._dump(run.reviewer_notes),
            "pinned_authority_ids_json": self._dump(run.pinned_authority_ids),
            "reviewed_sections_json": self._dump(run.reviewed_sections),
        }
        for column_name, value in optional_columns.items():
            if column_name in analysis_run_columns:
                insert_columns.append(column_name)
                insert_values.append(value)
        with connect_db(self.db_path) as connection:
            connection.execute(
                f"""
                INSERT INTO analysis_runs ({", ".join(insert_columns)})
                VALUES ({", ".join("?" for _ in insert_columns)})
                """,
                tuple(insert_values),
            )
        matter.facts = facts
        matter.uploaded_documents = uploaded_documents
        matter.entities = entities
        matter.ownership_links = ownership_links
        matter.tax_classifications = tax_classifications
        matter.transaction_roles = transaction_roles
        matter.transaction_steps = transaction_steps
        matter.election_items = election_items
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

    def replace_structure_proposals(
        self,
        matter_id: str,
        user_id: str,
        proposals: list[StructureProposal],
    ) -> MatterRecord:
        matter = self.get_matter(matter_id, user_id=user_id)
        matter.structure_proposals = proposals
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
            next_facts: list[ExtractedFact] = []
            for fact in document.extracted_facts:
                if fact.fact_id != fact_id:
                    next_facts.append(fact)
                    continue
                updated_fact = fact.model_copy(update={"status": status})
                if status == "confirmed":
                    updated_fact = self._apply_structured_fact(matter, updated_fact)
                next_facts.append(updated_fact)
            document.extracted_facts = next_facts
        matter.updated_at = utc_now_iso()
        return self.save_matter(matter)

    def review_structure_proposals(
        self,
        matter_id: str,
        user_id: str,
        reviews: list[
            tuple[
                str,
                str,
                dict[str, str | float | int | list[str] | None] | None,
            ]
        ],
    ) -> MatterRecord:
        matter = self.get_matter(matter_id, user_id=user_id)
        by_id = {proposal.proposal_id: proposal for proposal in matter.structure_proposals}
        updated: list[StructureProposal] = []
        review_map = {
            proposal_id: (status, normalized_payload)
            for proposal_id, status, normalized_payload in reviews
        }

        for proposal in matter.structure_proposals:
            review = review_map.get(proposal.proposal_id)
            if not review:
                updated.append(proposal)
                continue
            status, normalized_payload = review
            next_proposal = proposal.model_copy(
                update={
                    "review_status": status,
                    "normalized_payload": normalized_payload or proposal.normalized_payload,
                }
            )
            if status == "accepted":
                next_proposal = self._apply_structure_proposal(matter, next_proposal)
            updated.append(next_proposal)

        for proposal_id, status, normalized_payload in reviews:
            if proposal_id in by_id:
                continue
            updated.append(
                StructureProposal(
                    proposal_id=proposal_id,
                    proposal_kind="entity",
                    label=proposal_id,
                    review_status=status if status in {"accepted", "rejected", "pending"} else "pending",
                    normalized_payload=normalized_payload or {},
                )
            )

        matter.structure_proposals = updated
        matter.updated_at = utc_now_iso()
        return self.save_matter(matter)

    def _apply_structured_fact(self, matter: MatterRecord, fact: ExtractedFact) -> ExtractedFact:
        kind = fact.normalized_target_kind
        payload = fact.normalized_target_payload or {}
        if not kind:
            return fact

        if kind == "entity":
            entity = self._upsert_entity(
                matter,
                name=str(payload.get("name") or fact.value).strip(),
                entity_type=str(payload.get("entity_type") or "other"),
                jurisdiction=self._optional_text(payload.get("jurisdiction")),
                status=str(payload.get("status") or "confirmed"),
                source_fact_id=fact.fact_id,
            )
            return fact.model_copy(
                update={
                    "mapped_record_kind": "entity",
                    "mapped_record_id": entity.entity_id,
                    "mapped_record_label": entity.name,
                }
            )

        if kind == "tax_classification":
            entity = self._find_entity_by_name(matter, self._optional_text(payload.get("entity_name")))
            if not entity:
                return fact.model_copy(update={"ambiguity_note": "Could not map this tax classification because the referenced entity has not been resolved yet."})
            classification = self._upsert_tax_classification(
                matter,
                entity_id=entity.entity_id,
                classification_type=str(payload.get("classification_type") or "unknown"),
                status=str(payload.get("status") or "confirmed"),
                source_fact_id=fact.fact_id,
            )
            return fact.model_copy(
                update={
                    "mapped_record_kind": "tax_classification",
                    "mapped_record_id": classification.classification_id,
                    "mapped_record_label": f"{entity.name}: {classification.classification_type}",
                }
            )

        if kind == "transaction_role":
            entity = self._find_entity_by_name(matter, self._optional_text(payload.get("entity_name")))
            if not entity:
                return fact.model_copy(update={"ambiguity_note": "Could not map this transaction role because the referenced entity has not been resolved yet."})
            role = self._upsert_transaction_role(
                matter,
                entity_id=entity.entity_id,
                role_type=str(payload.get("role_type") or "other"),
                status=str(payload.get("status") or "confirmed"),
                source_fact_id=fact.fact_id,
            )
            return fact.model_copy(
                update={
                    "mapped_record_kind": "transaction_role",
                    "mapped_record_id": role.role_id,
                    "mapped_record_label": f"{entity.name}: {role.role_type}",
                }
            )

        if kind == "ownership_link":
            parent = self._find_entity_by_name(matter, self._optional_text(payload.get("parent_entity_name")))
            child = self._find_entity_by_name(matter, self._optional_text(payload.get("child_entity_name")))
            if not parent or not child:
                return fact.model_copy(update={"ambiguity_note": "Could not map this ownership link because one or both referenced entities are still unresolved."})
            link = self._upsert_ownership_link(
                matter,
                parent_entity_id=parent.entity_id,
                child_entity_id=child.entity_id,
                relationship_type=str(payload.get("relationship_type") or "owns"),
                ownership_scope=str(payload.get("ownership_scope") or "direct"),
                ownership_percentage=self._optional_float(payload.get("ownership_percentage")),
                status=str(payload.get("status") or "confirmed"),
                source_fact_id=fact.fact_id,
            )
            return fact.model_copy(
                update={
                    "mapped_record_kind": "ownership_link",
                    "mapped_record_id": link.link_id,
                    "mapped_record_label": f"{parent.name} -> {child.name}",
                }
            )

        if kind == "transaction_step":
            entity_ids = self._resolve_entity_ids(matter, payload.get("entity_names"))
            step = self._upsert_transaction_step(
                matter,
                phase=str(payload.get("phase") or "pre_closing"),
                step_type=str(payload.get("step_type") or "other"),
                title=str(payload.get("title") or fact.label or "Transaction step"),
                description=str(payload.get("description") or fact.value),
                entity_ids=entity_ids,
                status=str(payload.get("status") or "confirmed"),
                source_fact_id=fact.fact_id,
            )
            update_payload: dict[str, str | None] = {
                "mapped_record_kind": "transaction_step",
                "mapped_record_id": step.step_id,
                "mapped_record_label": step.title,
            }
            if payload.get("entity_names") and not entity_ids:
                update_payload["ambiguity_note"] = "The step was created, but one or more referenced entities are still unresolved."
            return fact.model_copy(update=update_payload)

        if kind == "election_filing_item":
            entity_ids = self._resolve_entity_ids(matter, payload.get("related_entity_names"))
            step_ids = self._resolve_step_ids(matter, payload.get("related_step_titles"))
            item = self._upsert_election_item(
                matter,
                name=str(payload.get("name") or fact.label or "Election or filing item"),
                item_type=str(payload.get("item_type") or "other"),
                citation_or_form=str(payload.get("citation_or_form") or ""),
                related_entity_ids=entity_ids,
                related_step_ids=step_ids,
                status=str(payload.get("status") or "possible"),
                notes=str(payload.get("notes") or ""),
                source_fact_id=fact.fact_id,
            )
            update_payload = {
                "mapped_record_kind": "election_filing_item",
                "mapped_record_id": item.item_id,
                "mapped_record_label": item.name,
            }
            if (payload.get("related_entity_names") and not entity_ids) or (
                payload.get("related_step_titles") and not step_ids
            ):
                update_payload["ambiguity_note"] = "The election or filing item was created, but some linked entities or steps remain unresolved."
            return fact.model_copy(update=update_payload)

        return fact

    def _apply_structure_proposal(
        self, matter: MatterRecord, proposal: StructureProposal
    ) -> StructureProposal:
        payload = proposal.normalized_payload or {}
        source_fact_id = proposal.source_fact_ids[0] if proposal.source_fact_ids else proposal.proposal_id
        label_prefix = proposal.label or proposal.proposal_kind.replace("_", " ")

        if proposal.proposal_kind == "entity":
            entity = self._upsert_entity(
                matter,
                name=str(payload.get("name") or label_prefix).strip(),
                entity_type=str(payload.get("entity_type") or "other"),
                jurisdiction=self._optional_text(payload.get("jurisdiction")),
                status=str(payload.get("status") or proposal.record_status or "confirmed"),
                source_fact_id=source_fact_id,
            )
            return proposal.model_copy(
                update={
                    "mapped_record_kind": "entity",
                    "mapped_record_id": entity.entity_id,
                    "mapped_record_label": entity.name,
                }
            )

        if proposal.proposal_kind == "tax_classification":
            entity = self._find_entity_by_name(matter, self._optional_text(payload.get("entity_name")))
            if not entity:
                return proposal.model_copy(update={"ambiguity_note": "Referenced entity still unresolved."})
            classification = self._upsert_tax_classification(
                matter,
                entity_id=entity.entity_id,
                classification_type=str(payload.get("classification_type") or "unknown"),
                status=str(payload.get("status") or proposal.record_status or "confirmed"),
                source_fact_id=source_fact_id,
            )
            return proposal.model_copy(
                update={
                    "mapped_record_kind": "tax_classification",
                    "mapped_record_id": classification.classification_id,
                    "mapped_record_label": f"{entity.name}: {classification.classification_type}",
                }
            )

        if proposal.proposal_kind == "transaction_role":
            entity = self._find_entity_by_name(matter, self._optional_text(payload.get("entity_name")))
            if not entity:
                return proposal.model_copy(update={"ambiguity_note": "Referenced entity still unresolved."})
            role = self._upsert_transaction_role(
                matter,
                entity_id=entity.entity_id,
                role_type=str(payload.get("role_type") or "other"),
                status=str(payload.get("status") or proposal.record_status or "confirmed"),
                source_fact_id=source_fact_id,
            )
            return proposal.model_copy(
                update={
                    "mapped_record_kind": "transaction_role",
                    "mapped_record_id": role.role_id,
                    "mapped_record_label": f"{entity.name}: {role.role_type}",
                }
            )

        if proposal.proposal_kind == "ownership_link":
            parent = self._find_entity_by_name(matter, self._optional_text(payload.get("parent_entity_name")))
            child = self._find_entity_by_name(matter, self._optional_text(payload.get("child_entity_name")))
            if not parent or not child:
                return proposal.model_copy(update={"ambiguity_note": "Parent or child entity still unresolved."})
            link = self._upsert_ownership_link(
                matter,
                parent_entity_id=parent.entity_id,
                child_entity_id=child.entity_id,
                relationship_type=str(payload.get("relationship_type") or "owns"),
                ownership_scope=str(payload.get("ownership_scope") or "direct"),
                ownership_percentage=self._optional_float(payload.get("ownership_percentage")),
                status=str(payload.get("status") or proposal.record_status or "confirmed"),
                source_fact_id=source_fact_id,
            )
            return proposal.model_copy(
                update={
                    "mapped_record_kind": "ownership_link",
                    "mapped_record_id": link.link_id,
                    "mapped_record_label": f"{parent.name} -> {child.name}",
                }
            )

        if proposal.proposal_kind == "transaction_step":
            entity_ids = self._resolve_entity_ids(matter, payload.get("entity_names"))
            step = self._upsert_transaction_step(
                matter,
                phase=str(payload.get("phase") or "pre_closing"),
                step_type=str(payload.get("step_type") or "other"),
                title=str(payload.get("title") or label_prefix),
                description=str(payload.get("description") or proposal.rationale or ""),
                entity_ids=entity_ids,
                status=str(payload.get("status") or proposal.record_status or "confirmed"),
                source_fact_id=source_fact_id,
            )
            return proposal.model_copy(
                update={
                    "mapped_record_kind": "transaction_step",
                    "mapped_record_id": step.step_id,
                    "mapped_record_label": step.title,
                }
            )

        if proposal.proposal_kind == "election_filing_item":
            entity_ids = self._resolve_entity_ids(matter, payload.get("related_entity_names"))
            step_ids = self._resolve_step_ids(matter, payload.get("related_step_titles"))
            item = self._upsert_election_item(
                matter,
                name=str(payload.get("name") or label_prefix),
                item_type=str(payload.get("item_type") or "other"),
                citation_or_form=str(payload.get("citation_or_form") or ""),
                related_entity_ids=entity_ids,
                related_step_ids=step_ids,
                status=str(payload.get("status") or "possible"),
                notes=str(payload.get("notes") or proposal.rationale or ""),
                source_fact_id=source_fact_id,
            )
            return proposal.model_copy(
                update={
                    "mapped_record_kind": "election_filing_item",
                    "mapped_record_id": item.item_id,
                    "mapped_record_label": item.name,
                }
            )

        return proposal

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
        analysis_run_columns = self._analysis_run_columns()
        update_pairs: list[str] = []
        update_values: list[str | None] = []
        candidate_updates = {
            "review_status": review_status,
            "reviewed_at": reviewed_at,
            "reviewed_by": reviewed_by or run.reviewed_by,
            "reviewer_notes_json": self._dump(notes),
            "pinned_authority_ids_json": self._dump(pinned_authority_ids or run.pinned_authority_ids),
            "reviewed_sections_json": self._dump(reviewed_sections or run.reviewed_sections),
        }
        for column_name, value in candidate_updates.items():
            if column_name in analysis_run_columns:
                update_pairs.append(f"{column_name} = ?")
                update_values.append(value)
        if not update_pairs:
            return self.get_matter(matter_id, user_id=user_id)
        with connect_db(self.db_path) as connection:
            connection.execute(
                f"""
                UPDATE analysis_runs
                SET {", ".join(update_pairs)}
                WHERE run_id = ? AND matter_id = ?
                """,
                tuple(update_values + [run_id, matter_id]),
            )
        return self.get_matter(matter_id, user_id=user_id)

    def _analysis_run_columns(self) -> set[str]:
        with connect_db(self.db_path) as connection:
            return {
                row["name"] for row in connection.execute("PRAGMA table_info(analysis_runs)").fetchall()
            }

    def _optional_text(self, value) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    def _optional_float(self, value) -> float | None:
        if value in {None, ""}:
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def _normalize_name(self, value: str | None) -> str:
        return (value or "").strip().lower()

    def _find_entity_by_name(self, matter: MatterRecord, name: str | None) -> Entity | None:
        normalized = self._normalize_name(name)
        if not normalized:
            return None
        return next(
            (entity for entity in matter.entities if self._normalize_name(entity.name) == normalized),
            None,
        )

    def _ensure_source_fact(self, source_fact_ids: list[str], fact_id: str) -> list[str]:
        return source_fact_ids if fact_id in source_fact_ids else [*source_fact_ids, fact_id]

    def _upsert_entity(
        self,
        matter: MatterRecord,
        *,
        name: str,
        entity_type: str,
        jurisdiction: str | None,
        status: str,
        source_fact_id: str,
    ) -> Entity:
        existing = self._find_entity_by_name(matter, name)
        if existing:
            updated = existing.model_copy(
                update={
                    "entity_type": entity_type or existing.entity_type,
                    "jurisdiction": jurisdiction or existing.jurisdiction,
                    "status": status or existing.status,
                    "source_fact_ids": self._ensure_source_fact(existing.source_fact_ids, source_fact_id),
                }
            )
            matter.entities = [updated if entity.entity_id == existing.entity_id else entity for entity in matter.entities]
            return updated
        entity = Entity(
            entity_id=str(uuid4()),
            name=name,
            entity_type=entity_type or "other",
            jurisdiction=jurisdiction,
            status=status or "confirmed",
            source_fact_ids=[source_fact_id],
        )
        matter.entities.append(entity)
        return entity

    def _upsert_tax_classification(
        self,
        matter: MatterRecord,
        *,
        entity_id: str,
        classification_type: str,
        status: str,
        source_fact_id: str,
    ) -> TaxClassification:
        existing = next((item for item in matter.tax_classifications if item.entity_id == entity_id), None)
        if existing:
            updated = existing.model_copy(
                update={
                    "classification_type": classification_type or existing.classification_type,
                    "status": status or existing.status,
                    "source_fact_ids": self._ensure_source_fact(existing.source_fact_ids, source_fact_id),
                }
            )
            matter.tax_classifications = [
                updated if item.classification_id == existing.classification_id else item
                for item in matter.tax_classifications
            ]
            return updated
        classification = TaxClassification(
            classification_id=str(uuid4()),
            entity_id=entity_id,
            classification_type=classification_type or "unknown",
            status=status or "confirmed",
            source_fact_ids=[source_fact_id],
        )
        matter.tax_classifications.append(classification)
        return classification

    def _upsert_transaction_role(
        self,
        matter: MatterRecord,
        *,
        entity_id: str,
        role_type: str,
        status: str,
        source_fact_id: str,
    ) -> TransactionRole:
        existing = next(
            (item for item in matter.transaction_roles if item.entity_id == entity_id and item.role_type == role_type),
            None,
        )
        if existing:
            updated = existing.model_copy(
                update={
                    "status": status or existing.status,
                    "source_fact_ids": self._ensure_source_fact(existing.source_fact_ids, source_fact_id),
                }
            )
            matter.transaction_roles = [
                updated if item.role_id == existing.role_id else item
                for item in matter.transaction_roles
            ]
            return updated
        role = TransactionRole(
            role_id=str(uuid4()),
            entity_id=entity_id,
            role_type=role_type or "other",
            status=status or "confirmed",
            source_fact_ids=[source_fact_id],
        )
        matter.transaction_roles.append(role)
        return role

    def _upsert_ownership_link(
        self,
        matter: MatterRecord,
        *,
        parent_entity_id: str,
        child_entity_id: str,
        relationship_type: str,
        ownership_scope: str,
        ownership_percentage: float | None,
        status: str,
        source_fact_id: str,
    ) -> OwnershipLink:
        existing = next(
            (
                item
                for item in matter.ownership_links
                if item.parent_entity_id == parent_entity_id
                and item.child_entity_id == child_entity_id
                and item.relationship_type == relationship_type
                and item.ownership_scope == ownership_scope
            ),
            None,
        )
        if existing:
            updated = existing.model_copy(
                update={
                    "ownership_percentage": ownership_percentage
                    if ownership_percentage is not None
                    else existing.ownership_percentage,
                    "ownership_scope": ownership_scope or existing.ownership_scope,
                    "status": status or existing.status,
                    "source_fact_ids": self._ensure_source_fact(existing.source_fact_ids, source_fact_id),
                }
            )
            matter.ownership_links = [
                updated if item.link_id == existing.link_id else item
                for item in matter.ownership_links
            ]
            return updated
        link = OwnershipLink(
            link_id=str(uuid4()),
            parent_entity_id=parent_entity_id,
            child_entity_id=child_entity_id,
            relationship_type=relationship_type or "owns",
            ownership_scope=ownership_scope or "direct",
            ownership_percentage=ownership_percentage,
            status=status or "confirmed",
            source_fact_ids=[source_fact_id],
        )
        matter.ownership_links.append(link)
        return link

    def _upsert_transaction_step(
        self,
        matter: MatterRecord,
        *,
        phase: str,
        step_type: str,
        title: str,
        description: str,
        entity_ids: list[str],
        status: str,
        source_fact_id: str,
    ) -> TransactionStep:
        existing = next(
            (
                item
                for item in matter.transaction_steps
                if item.phase == phase and item.step_type == step_type and item.title.strip().lower() == title.strip().lower()
            ),
            None,
        )
        if existing:
            merged_entity_ids = list(dict.fromkeys([*existing.entity_ids, *entity_ids]))
            updated = existing.model_copy(
                update={
                    "description": description or existing.description,
                    "entity_ids": merged_entity_ids,
                    "status": status or existing.status,
                    "source_fact_ids": self._ensure_source_fact(existing.source_fact_ids, source_fact_id),
                }
            )
            matter.transaction_steps = [
                updated if item.step_id == existing.step_id else item
                for item in matter.transaction_steps
            ]
            return updated
        step = TransactionStep(
            step_id=str(uuid4()),
            sequence_number=len(matter.transaction_steps) + 1,
            phase=phase or "pre_closing",
            step_type=step_type or "other",
            title=title,
            description=description,
            entity_ids=entity_ids,
            status=status or "confirmed",
            source_fact_ids=[source_fact_id],
        )
        matter.transaction_steps.append(step)
        return step

    def _upsert_election_item(
        self,
        matter: MatterRecord,
        *,
        name: str,
        item_type: str,
        citation_or_form: str,
        related_entity_ids: list[str],
        related_step_ids: list[str],
        status: str,
        notes: str,
        source_fact_id: str,
    ) -> ElectionOrFilingItem:
        existing = next(
            (
                item
                for item in matter.election_items
                if item.name.strip().lower() == name.strip().lower()
                and item.citation_or_form.strip().lower() == citation_or_form.strip().lower()
            ),
            None,
        )
        if existing:
            updated = existing.model_copy(
                update={
                    "item_type": item_type or existing.item_type,
                    "related_entity_ids": list(dict.fromkeys([*existing.related_entity_ids, *related_entity_ids])),
                    "related_step_ids": list(dict.fromkeys([*existing.related_step_ids, *related_step_ids])),
                    "status": status or existing.status,
                    "notes": notes or existing.notes,
                    "source_fact_ids": self._ensure_source_fact(existing.source_fact_ids, source_fact_id),
                }
            )
            matter.election_items = [
                updated if item.item_id == existing.item_id else item
                for item in matter.election_items
            ]
            return updated
        item = ElectionOrFilingItem(
            item_id=str(uuid4()),
            name=name,
            item_type=item_type or "other",
            citation_or_form=citation_or_form,
            related_entity_ids=related_entity_ids,
            related_step_ids=related_step_ids,
            status=status or "possible",
            notes=notes,
            source_fact_ids=[source_fact_id],
        )
        matter.election_items.append(item)
        return item

    def _resolve_entity_ids(self, matter: MatterRecord, names) -> list[str]:
        if not isinstance(names, list):
            return []
        entity_ids: list[str] = []
        for name in names:
            entity = self._find_entity_by_name(matter, self._optional_text(name))
            if entity and entity.entity_id not in entity_ids:
                entity_ids.append(entity.entity_id)
        return entity_ids

    def _resolve_step_ids(self, matter: MatterRecord, titles) -> list[str]:
        if not isinstance(titles, list):
            return []
        step_ids: list[str] = []
        normalized_titles = {self._normalize_name(str(title)) for title in titles}
        for step in matter.transaction_steps:
            if self._normalize_name(step.title) in normalized_titles and step.step_id not in step_ids:
                step_ids.append(step.step_id)
        return step_ids

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
                    entities_json TEXT NOT NULL DEFAULT '[]',
                    ownership_links_json TEXT NOT NULL DEFAULT '[]',
                    tax_classifications_json TEXT NOT NULL DEFAULT '[]',
                    transaction_roles_json TEXT NOT NULL DEFAULT '[]',
                    transaction_steps_json TEXT NOT NULL DEFAULT '[]',
                    election_items_json TEXT NOT NULL DEFAULT '[]',
                    structure_proposals_json TEXT NOT NULL DEFAULT '[]',
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
                    entities_json TEXT NOT NULL DEFAULT '[]',
                    ownership_links_json TEXT NOT NULL DEFAULT '[]',
                    tax_classifications_json TEXT NOT NULL DEFAULT '[]',
                    transaction_roles_json TEXT NOT NULL DEFAULT '[]',
                    transaction_steps_json TEXT NOT NULL DEFAULT '[]',
                    election_items_json TEXT NOT NULL DEFAULT '[]',
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
            matter_columns = {
                row["name"] for row in connection.execute("PRAGMA table_info(matters)").fetchall()
            }
            if "owner_user_id" not in matter_columns:
                connection.execute(
                    "ALTER TABLE matters ADD COLUMN owner_user_id TEXT NOT NULL DEFAULT ''"
                )
            for column_name, default_value in STRUCTURED_MATTER_COLUMNS.items():
                if column_name not in matter_columns:
                    connection.execute(
                        f"ALTER TABLE matters ADD COLUMN {column_name} TEXT NOT NULL DEFAULT '{default_value}'"
                    )

            analysis_run_columns = {
                row["name"] for row in connection.execute("PRAGMA table_info(analysis_runs)").fetchall()
            }
            analysis_run_migrations = {
                "entities_json": "ALTER TABLE analysis_runs ADD COLUMN entities_json TEXT NOT NULL DEFAULT '[]'",
                "ownership_links_json": "ALTER TABLE analysis_runs ADD COLUMN ownership_links_json TEXT NOT NULL DEFAULT '[]'",
                "tax_classifications_json": "ALTER TABLE analysis_runs ADD COLUMN tax_classifications_json TEXT NOT NULL DEFAULT '[]'",
                "transaction_roles_json": "ALTER TABLE analysis_runs ADD COLUMN transaction_roles_json TEXT NOT NULL DEFAULT '[]'",
                "transaction_steps_json": "ALTER TABLE analysis_runs ADD COLUMN transaction_steps_json TEXT NOT NULL DEFAULT '[]'",
                "election_items_json": "ALTER TABLE analysis_runs ADD COLUMN election_items_json TEXT NOT NULL DEFAULT '[]'",
                "review_status": "ALTER TABLE analysis_runs ADD COLUMN review_status TEXT NOT NULL DEFAULT 'unreviewed'",
                "reviewed_at": "ALTER TABLE analysis_runs ADD COLUMN reviewed_at TEXT",
                "reviewed_by": "ALTER TABLE analysis_runs ADD COLUMN reviewed_by TEXT",
                "reviewer_notes_json": "ALTER TABLE analysis_runs ADD COLUMN reviewer_notes_json TEXT NOT NULL DEFAULT '[]'",
                "pinned_authority_ids_json": "ALTER TABLE analysis_runs ADD COLUMN pinned_authority_ids_json TEXT NOT NULL DEFAULT '[]'",
                "reviewed_sections_json": "ALTER TABLE analysis_runs ADD COLUMN reviewed_sections_json TEXT NOT NULL DEFAULT '[]'",
            }
            for column_name, ddl in analysis_run_migrations.items():
                if column_name not in analysis_run_columns:
                    connection.execute(ddl)

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
                        uploaded_documents_json, entities_json, ownership_links_json,
                        tax_classifications_json, transaction_roles_json, transaction_steps_json,
                        election_items_json, structure_proposals_json, latest_analysis_json, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        matter.matter_id,
                        matter.owner_user_id,
                        matter.matter_name,
                        matter.transaction_type,
                        self._dump(matter.facts),
                        self._dump(matter.uploaded_documents),
                        self._dump(matter.entities),
                        self._dump(matter.ownership_links),
                        self._dump(matter.tax_classifications),
                        self._dump(matter.transaction_roles),
                        self._dump(matter.transaction_steps),
                        self._dump(matter.election_items),
                        self._dump(matter.structure_proposals),
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
                            entities_json, ownership_links_json, tax_classifications_json,
                            transaction_roles_json, transaction_steps_json, election_items_json,
                            result_json, review_status, reviewed_at, reviewed_by,
                            reviewer_notes_json, pinned_authority_ids_json, reviewed_sections_json
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            run.run_id,
                            matter.matter_id,
                            run.created_at,
                            self._dump(run.facts),
                            self._dump(run.uploaded_documents),
                            self._dump(run.entities),
                            self._dump(run.ownership_links),
                            self._dump(run.tax_classifications),
                            self._dump(run.transaction_roles),
                            self._dump(run.transaction_steps),
                            self._dump(run.election_items),
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
        analysis_run_columns = self._analysis_run_columns()
        select_fields = [
            "run_id",
            "created_at",
            "facts_json",
            "uploaded_documents_json",
            "entities_json" if "entities_json" in analysis_run_columns else "'[]' AS entities_json",
            "ownership_links_json" if "ownership_links_json" in analysis_run_columns else "'[]' AS ownership_links_json",
            "tax_classifications_json" if "tax_classifications_json" in analysis_run_columns else "'[]' AS tax_classifications_json",
            "transaction_roles_json" if "transaction_roles_json" in analysis_run_columns else "'[]' AS transaction_roles_json",
            "transaction_steps_json" if "transaction_steps_json" in analysis_run_columns else "'[]' AS transaction_steps_json",
            "election_items_json" if "election_items_json" in analysis_run_columns else "'[]' AS election_items_json",
            "result_json",
            "review_status" if "review_status" in analysis_run_columns else "'unreviewed' AS review_status",
            "reviewed_at" if "reviewed_at" in analysis_run_columns else "NULL AS reviewed_at",
            "reviewed_by" if "reviewed_by" in analysis_run_columns else "NULL AS reviewed_by",
            "reviewer_notes_json" if "reviewer_notes_json" in analysis_run_columns else "'[]' AS reviewer_notes_json",
            "pinned_authority_ids_json" if "pinned_authority_ids_json" in analysis_run_columns else "'[]' AS pinned_authority_ids_json",
            "reviewed_sections_json" if "reviewed_sections_json" in analysis_run_columns else "'[]' AS reviewed_sections_json",
        ]
        with connect_db(self.db_path) as connection:
            runs = connection.execute(
                f"""
                SELECT {", ".join(select_fields)}
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
            entities=[Entity.model_validate(item) for item in json.loads(row["entities_json"])],
            ownership_links=[OwnershipLink.model_validate(item) for item in json.loads(row["ownership_links_json"])],
            tax_classifications=[TaxClassification.model_validate(item) for item in json.loads(row["tax_classifications_json"])],
            transaction_roles=[TransactionRole.model_validate(item) for item in json.loads(row["transaction_roles_json"])],
            transaction_steps=[TransactionStep.model_validate(item) for item in json.loads(row["transaction_steps_json"])],
            election_items=[ElectionOrFilingItem.model_validate(item) for item in json.loads(row["election_items_json"])],
            structure_proposals=[StructureProposal.model_validate(item) for item in json.loads(row["structure_proposals_json"] or "[]")],
            latest_analysis=AnalysisResult.model_validate(json.loads(row["latest_analysis_json"])) if row["latest_analysis_json"] else None,
            analysis_runs=[
                AnalysisRun(
                    run_id=run["run_id"],
                    created_at=run["created_at"],
                    facts=TransactionFacts.model_validate(json.loads(run["facts_json"])),
                    uploaded_documents=[UploadedDocument.model_validate(item) for item in json.loads(run["uploaded_documents_json"])],
                    entities=[Entity.model_validate(item) for item in json.loads(run["entities_json"])],
                    ownership_links=[OwnershipLink.model_validate(item) for item in json.loads(run["ownership_links_json"])],
                    tax_classifications=[TaxClassification.model_validate(item) for item in json.loads(run["tax_classifications_json"])],
                    transaction_roles=[TransactionRole.model_validate(item) for item in json.loads(run["transaction_roles_json"])],
                    transaction_steps=[TransactionStep.model_validate(item) for item in json.loads(run["transaction_steps_json"])],
                    election_items=[ElectionOrFilingItem.model_validate(item) for item in json.loads(run["election_items_json"])],
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
