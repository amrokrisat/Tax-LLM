from __future__ import annotations

import re
from dataclasses import dataclass
from uuid import uuid4
from tax_llm.domain.models import MatterRecord, StructureProposal
from tax_llm.infrastructure.ai_assist import OpenAIAssistService
from tax_llm.infrastructure.repositories import AuthorityCorpusRepository


def _clean_name(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip(" .,:;")


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-") or "item"


def _infer_entity_type(name: str, context_text: str) -> str:
    lowered = name.lower()
    if "llc" in lowered:
        return "llc"
    if any(term in lowered for term in ["corporation", "corp", "inc"]):
        return "corporation"
    if any(term in lowered for term in ["lp", "l.p.", "fund", "partners"]) and "corp" not in lowered:
        return "partnership"
    if any(term in lowered for term in ["trust", "trustee"]):
        return "trust"
    if any(term in lowered for term in ["parent", "merger sub", "sub", "blocker", "holdco", "target", "buyer", "acq "]):
        return "corporation"
    if "individual" in context_text.lower() and lowered in context_text.lower():
        return "individual"
    return "other"


def _infer_roles(name: str) -> list[str]:
    lowered = name.lower()
    roles: list[str] = []
    if "buyer" in lowered or "acq parent" in lowered:
        roles.append("buyer")
    if "seller" in lowered:
        roles.append("seller")
    if "target" in lowered:
        roles.append("target")
    if "parent" in lowered:
        roles.append("parent")
    if "merger sub" in lowered or re.search(r"\bsub\b", lowered):
        roles.append("merger_sub")
    if "holdco" in lowered or "holding" in lowered:
        roles.append("holding_company")
    if "blocker" in lowered:
        roles.append("blocker")
    if "founder" in lowered or "individual" in lowered:
        roles.append("individual_owner")
    return list(dict.fromkeys(roles))


def _normalized_label(kind: str, payload: dict[str, object]) -> str:
    if kind == "entity":
        return str(payload.get("name") or "Entity")
    if kind == "ownership_link":
        return f"{payload.get('parent_entity_name', 'Parent')} -> {payload.get('child_entity_name', 'Child')}"
    if kind == "tax_classification":
        return f"{payload.get('entity_name', 'Entity')}: {payload.get('classification_type', 'unknown')}"
    if kind == "transaction_role":
        return f"{payload.get('entity_name', 'Entity')}: {payload.get('role_type', 'other')}"
    if kind == "transaction_step":
        return str(payload.get("title") or "Transaction step")
    if kind == "election_filing_item":
        return str(payload.get("name") or "Election or filing item")
    return kind.replace("_", " ")


@dataclass
class StructureSynthesisService:
    authority_repository: AuthorityCorpusRepository
    ai_assist_service: OpenAIAssistService | None = None

    def synthesize(self, matter: MatterRecord) -> list[StructureProposal]:
        deterministic = self._deterministic_proposals(matter)
        ai_proposals = self._ai_proposals(matter, deterministic)
        return self._merge_proposals([*deterministic, *ai_proposals])

    def _deterministic_proposals(self, matter: MatterRecord) -> list[StructureProposal]:
        proposals: list[StructureProposal] = []
        existing_keys = {
            ("entity", entity.name.strip().lower())
            for entity in matter.entities
            if entity.name.strip()
        }
        for document in matter.uploaded_documents:
            for fact in document.extracted_facts:
                if fact.status == "rejected" or not fact.normalized_target_kind:
                    continue
                kind = fact.normalized_target_kind
                payload = dict(fact.normalized_target_payload or {})
                if kind == "entity":
                    name = _clean_name(str(payload.get("name") or fact.value))
                    if not name or ("entity", name.lower()) in existing_keys:
                        continue
                    payload["name"] = name
                rationale = self._proposal_rationale(kind, payload, matter)
                proposals.append(
                    StructureProposal(
                        proposal_id=f"proposal-{uuid4()}",
                        proposal_kind=kind,
                        label=_normalized_label(kind, payload),
                        rationale=rationale,
                        confidence=max(fact.confidence, 0.55),
                        certainty=fact.certainty or "medium",
                        ambiguity_note=fact.ambiguity_note,
                        source_document_names=[document.file_name],
                        source_fact_ids=[fact.fact_id],
                        normalized_payload=payload,
                    )
                )

        text = " ".join(
            [
                matter.facts.summary,
                matter.facts.proposed_steps,
                *matter.facts.entities,
                *[document.content for document in matter.uploaded_documents],
            ]
        )
        proposals.extend(self._facts_backfill_proposals(text, matter))
        return proposals

    def _facts_backfill_proposals(self, text: str, matter: MatterRecord) -> list[StructureProposal]:
        proposals: list[StructureProposal] = []
        lowered = text.lower()
        known_entities = {entity.name.lower() for entity in matter.entities}
        for name in matter.facts.entities:
            cleaned = _clean_name(name)
            if not cleaned or cleaned.lower() in known_entities:
                continue
            entity_type = _infer_entity_type(cleaned, text)
            proposals.append(
                StructureProposal(
                    proposal_id=f"proposal-{uuid4()}",
                    proposal_kind="entity",
                    label=cleaned,
                    rationale="Derived from the named transaction participants in the current matter facts.",
                    confidence=0.58,
                    certainty="medium",
                    source_document_names=[],
                    source_fact_ids=[],
                    normalized_payload={"name": cleaned, "entity_type": entity_type, "status": "proposed"},
                )
            )
            for role in _infer_roles(cleaned):
                proposals.append(
                    StructureProposal(
                        proposal_id=f"proposal-{uuid4()}",
                        proposal_kind="transaction_role",
                        label=f"{cleaned}: {role}",
                        rationale="Role inferred from the entity name and transaction wording in the current matter facts.",
                        confidence=0.63 if role in {"buyer", "seller", "target", "parent", "merger_sub"} else 0.59,
                        certainty="medium",
                        source_document_names=[],
                        source_fact_ids=[],
                        normalized_payload={
                            "entity_name": cleaned,
                            "role_type": role,
                            "status": "proposed",
                        },
                    )
                )

        chains = re.findall(
            r"([A-Z][A-Za-z0-9& ]+(?:LLC|Corp(?:oration)?|Inc\.?|HoldCo|Target(?: LLC)?|Buyer|Merger Sub|Blocker))\s+(?:owns|owned|wholly owns|wholly-owned)\s+([A-Z][A-Za-z0-9& ]+(?:LLC|Corp(?:oration)?|Inc\.?|HoldCo|Target(?: LLC)?|Buyer|Merger Sub|Blocker))",
            text,
        )
        for parent, child in chains:
            parent_name = _clean_name(parent)
            child_name = _clean_name(child)
            proposals.append(
                StructureProposal(
                    proposal_id=f"proposal-{uuid4()}",
                    proposal_kind="ownership_link",
                    label=f"{parent_name} -> {child_name}",
                    rationale="Detected from ownership chain language in the current facts or uploaded documents.",
                    confidence=0.61,
                    certainty="medium",
                    source_document_names=[],
                    source_fact_ids=[],
                    normalized_payload={
                        "parent_entity_name": parent_name,
                        "child_entity_name": child_name,
                        "relationship_type": "owns",
                        "ownership_scope": "direct",
                        "status": "proposed",
                    },
                    )
                )

        acquisition_candidates = [
            name for name in matter.facts.entities if any(token in name.lower() for token in ["blocker", "target", "parent", "merger sub", "holdco"])
        ]

        if "form acq merger sub" in lowered or "form acq merger sub" in lowered or "form acq merger sub to acquire" in lowered:
            proposals.append(
                StructureProposal(
                    proposal_id=f"proposal-step-{uuid4()}",
                    proposal_kind="transaction_step",
                    label="Acq Parent forms Acq Merger Sub",
                    rationale="The current matter text describes a pre-closing formation of the merger subsidiary.",
                    confidence=0.72,
                    certainty="medium",
                    source_document_names=[],
                    source_fact_ids=[],
                    normalized_payload={
                        "title": "Acq Parent forms Acq Merger Sub",
                        "phase": "pre_closing",
                        "step_type": "pre_closing_reorganization",
                        "description": "Buyer forms merger subsidiary before the acquisition closing.",
                        "entity_names": [name for name in acquisition_candidates if name in {"Acq Parent", "Acq Merger Sub"}],
                        "status": "proposed",
                    },
                )
            )

        if "merger-sub acquisition" in lowered or "merger sub acquisition" in lowered or "acquire the blocker stock" in lowered or "acquires target stock" in lowered:
            entities = [
                name
                for name in matter.facts.entities
                if any(token in name.lower() for token in ["acq merger sub", "acq parent", "blocker", "target"])
            ]
            proposals.append(
                StructureProposal(
                    proposal_id=f"proposal-step-{uuid4()}",
                    proposal_kind="transaction_step",
                    label="Acq Merger Sub closes stock acquisition",
                    rationale="The matter text describes a closing acquisition step through merger sub or blocker stock purchase language.",
                    confidence=0.76,
                    certainty="medium",
                    source_document_names=[],
                    source_fact_ids=[],
                    normalized_payload={
                        "title": "Acq Merger Sub closes stock acquisition",
                        "phase": "closing",
                        "step_type": "stock_purchase" if "stock" in lowered else "merger",
                        "description": "Closing acquisition step for the contemplated merger-sub / blocker structure.",
                        "entity_names": entities,
                        "status": "proposed",
                    },
                )
            )

        if "post-closing integration" in lowered or "post closing integration" in lowered or "expects post-closing integration" in lowered:
            proposals.append(
                StructureProposal(
                    proposal_id=f"proposal-step-{uuid4()}",
                    proposal_kind="transaction_step",
                    label="Post-closing integration",
                    rationale="The matter text explicitly references post-closing integration planning.",
                    confidence=0.68,
                    certainty="medium",
                    source_document_names=[],
                    source_fact_ids=[],
                    normalized_payload={
                        "title": "Post-closing integration",
                        "phase": "post_closing",
                        "step_type": "post_closing_integration",
                        "description": "Post-closing integration of the acquired business into buyer operations.",
                        "entity_names": [name for name in matter.facts.entities if any(token in name.lower() for token in ["acq", "target", "blocker"])],
                        "status": "proposed",
                    },
                )
            )

        if any(term in lowered for term in ["338(h)(10)", "336(e)", "338 election", "form 8023"]):
            proposals.append(
                StructureProposal(
                    proposal_id=f"proposal-step-{uuid4()}",
                    proposal_kind="transaction_step",
                    label="Evaluate election mechanics",
                    rationale="The deal materials explicitly raise election-sensitive modeling and filing mechanics.",
                    confidence=0.65,
                    certainty="medium",
                    source_document_names=[],
                    source_fact_ids=[],
                    normalized_payload={
                        "title": "Evaluate election mechanics",
                        "phase": "pre_closing",
                        "step_type": "election",
                        "description": "Model and coordinate section 338(h)(10) / 336(e)-sensitive election availability before closing.",
                        "entity_names": [name for name in matter.facts.entities if any(token in name.lower() for token in ["acq", "blocker", "target"])],
                        "status": "proposed",
                    },
                )
            )
            proposals.append(
                StructureProposal(
                    proposal_id=f"proposal-item-{uuid4()}",
                    proposal_kind="election_filing_item",
                    label="Form 8023 workstream",
                    rationale="Election-sensitive language in the matter suggests a filing workstream should be tracked early.",
                    confidence=0.64,
                    certainty="medium",
                    source_document_names=[],
                    source_fact_ids=[],
                    normalized_payload={
                        "name": "Form 8023 workstream",
                        "item_type": "filing",
                        "citation_or_form": "Form 8023",
                        "related_entity_names": [name for name in matter.facts.entities if any(token in name.lower() for token in ["acq", "blocker", "target"])],
                        "status": "possible",
                        "notes": "Track election and filing mechanics if the deal facts support a section 338 path.",
                    },
                )
            )

        if "disregarded" in lowered:
            for candidate in re.findall(r"([A-Z][A-Za-z0-9& ]+LLC)", text):
                proposals.append(
                    StructureProposal(
                        proposal_id=f"proposal-{uuid4()}",
                        proposal_kind="tax_classification",
                        label=f"{_clean_name(candidate)}: disregarded entity",
                        rationale="The current matter text explicitly suggests disregarded-entity treatment for an LLC participant.",
                        confidence=0.64,
                        certainty="medium",
                        source_document_names=[],
                        source_fact_ids=[],
                        normalized_payload={
                            "entity_name": _clean_name(candidate),
                            "classification_type": "disregarded_entity",
                            "status": "proposed",
                        },
                    )
                )

        return proposals

    def _proposal_rationale(self, kind: str, payload: dict[str, object], matter: MatterRecord) -> str:
        hints: list[str] = []
        lowered = f"{matter.facts.summary} {matter.facts.proposed_steps}".lower()
        if kind == "tax_classification" and payload.get("classification_type") in {"disregarded_entity", "partnership"}:
            authorities = self.authority_repository.search_by_issue_bucket(
                facts=matter.facts,
                documents=matter.uploaded_documents,
                issue_bucket="partnership_issues",
                limit=2,
            )
            if authorities:
                hints.append(f"Classification-sensitive context checked against {authorities[0].citation}.")
        if kind == "transaction_role" and payload.get("role_type") in {"merger_sub", "parent", "target"} and "merger" in lowered:
            authorities = self.authority_repository.search_by_issue_bucket(
                facts=matter.facts,
                documents=matter.uploaded_documents,
                issue_bucket="merger_reorganization",
                limit=1,
            )
            if authorities:
                hints.append(f"Merger sequencing posture aligns with {authorities[0].citation}.")
        base = "Synthesized from extracted structure signals and current matter facts."
        return " ".join([base, *hints]).strip()

    def _ai_proposals(
        self,
        matter: MatterRecord,
        deterministic: list[StructureProposal],
    ) -> list[StructureProposal]:
        if not self.ai_assist_service:
            return []
        payload = {
            "task": "Synthesize reviewable structure proposals only.",
            "facts": matter.facts.model_dump(),
            "uploaded_documents": [
                {"file_name": document.file_name, "content": document.content[:4000]}
                for document in matter.uploaded_documents
            ],
            "existing_structure": {
                "entities": [entity.model_dump() for entity in matter.entities],
                "ownership_links": [link.model_dump() for link in matter.ownership_links],
                "tax_classifications": [item.model_dump() for item in matter.tax_classifications],
                "transaction_roles": [item.model_dump() for item in matter.transaction_roles],
                "transaction_steps": [item.model_dump() for item in matter.transaction_steps],
                "election_items": [item.model_dump() for item in matter.election_items],
            },
            "deterministic_proposals": [proposal.model_dump() for proposal in deterministic[:24]],
        }
        return self.ai_assist_service.build_structure_proposals(synthesis_payload=payload)

    def _merge_proposals(self, proposals: list[StructureProposal]) -> list[StructureProposal]:
        deduped: list[StructureProposal] = []
        seen: set[tuple[str, str]] = set()
        for proposal in proposals:
            payload_key = str(sorted(proposal.normalized_payload.items()))
            key = (proposal.proposal_kind, payload_key)
            if key in seen:
                continue
            seen.add(key)
            deduped.append(proposal)
        kind_order = {
            "entity": 0,
            "ownership_link": 1,
            "tax_classification": 2,
            "transaction_role": 3,
            "transaction_step": 4,
            "election_filing_item": 5,
        }
        return sorted(
            deduped,
            key=lambda proposal: (kind_order.get(proposal.proposal_kind, 99), -proposal.confidence, proposal.label.lower()),
        )
