from __future__ import annotations

import re
from uuid import uuid4

from tax_llm.domain.models import ExtractedFact, ExtractedFactCertainty, UploadedDocument


UNCERTAINTY_TERMS = [
    "may",
    "might",
    "possible",
    "possibly",
    "considering",
    "evaluate",
    "evaluating",
    "test",
    "testing",
    "could",
]


class DocumentExtractionService:
    def extract(self, documents: list[UploadedDocument]) -> list[UploadedDocument]:
        extracted_documents: list[UploadedDocument] = []
        for document in documents:
            text = self._normalize_text(document.content)
            facts, ambiguities = self._infer_facts(document.file_name, text)
            extracted_documents.append(
                document.model_copy(
                    update={
                        "extraction_status": "completed" if text else "needs_review",
                        "extracted_text": text or None,
                        "extracted_facts": facts,
                        "extraction_ambiguities": ambiguities,
                    }
                )
            )
        return extracted_documents

    def _normalize_text(self, text: str) -> str:
        compact = re.sub(r"\s+", " ", text or "").strip()
        compact = compact.replace("§", " section ")
        return re.sub(r"\s+", " ", compact).strip()

    def _infer_facts(self, file_name: str, text: str) -> tuple[list[ExtractedFact], list[str]]:
        lowered = text.lower()
        candidates: list[ExtractedFact] = []
        seen: set[tuple[str, str, str | None, str | None]] = set()
        ambiguities: list[str] = []
        detected_forms: set[str] = set()
        detected_elections: set[str] = set()

        def certainty_for_match(match_text: str) -> ExtractedFactCertainty:
            if not match_text:
                return "medium"
            return "low" if any(term in match_text for term in UNCERTAINTY_TERMS) else "high"

        def add(
            *,
            category: str,
            label: str,
            value: str,
            confidence: float,
            normalized_field: str | None = None,
            normalized_value: str | None = None,
            normalized_target_kind: str | None = None,
            normalized_target_payload: dict[str, str | float | int | list[str] | None] | None = None,
            ambiguity_note: str | None = None,
            certainty: ExtractedFactCertainty = "medium",
        ) -> None:
            key = (category, value, normalized_field, normalized_value)
            if key in seen:
                return
            seen.add(key)
            candidates.append(
                ExtractedFact(
                    fact_id=str(uuid4()),
                    category=category,
                    label=label,
                    value=value,
                    source_document=file_name,
                    confidence=confidence,
                    certainty=certainty,
                    normalized_field=normalized_field,
                    normalized_value=normalized_value,
                    normalized_target_kind=normalized_target_kind,
                    normalized_target_payload=normalized_target_payload,
                    ambiguity_note=ambiguity_note,
                )
            )

        def add_signal(
            *,
            category: str,
            label: str,
            phrase: str,
            normalized_field: str | None = None,
            normalized_value: str | None = None,
            confidence: float = 0.82,
            rendered_value: str | None = None,
        ) -> bool:
            match = re.search(phrase, lowered)
            if not match:
                return False
            window = lowered[max(0, match.start() - 80) : min(len(lowered), match.end() + 80)]
            certainty = certainty_for_match(window)
            adjusted_confidence = confidence - (0.16 if certainty == "low" else 0.0)
            add(
                category=category,
                label=label,
                value=rendered_value or text[match.start() : match.end()],
                confidence=max(0.45, adjusted_confidence),
                normalized_field=normalized_field,
                normalized_value=normalized_value,
                certainty=certainty,
            )
            return True

        if add_signal(
            category="transaction_form",
            label="Transaction form signal",
            phrase=r"\bmerger\b|\bmerger sub\b|\btriangular merger\b",
            normalized_field="transaction_type",
            normalized_value="merger",
            confidence=0.9,
            rendered_value="Merger structure language appears in the document.",
        ):
            detected_forms.add("merger")
        if add_signal(
            category="transaction_form",
            label="Transaction form signal",
            phrase=r"\basset sale\b|\basset acquisition\b|\basset purchase\b|\bdirect asset\b",
            normalized_field="transaction_type",
            normalized_value="asset sale",
            confidence=0.88,
            rendered_value="Direct asset transfer language appears in the document.",
        ):
            detected_forms.add("asset sale")
        if add_signal(
            category="transaction_form",
            label="Transaction form signal",
            phrase=r"\bstock sale\b|\bstock acquisition\b|\bstock purchase\b",
            normalized_field="transaction_type",
            normalized_value="stock sale",
            confidence=0.86,
            rendered_value="Stock-form acquisition language appears in the document.",
        ):
            detected_forms.add("stock sale")

        if add_signal(
            category="election_language",
            label="Election path signal",
            phrase=r"338\(h\)\(10\)|338\(h\)\s*\(10\)|section 338\(h\)\(10\)|joint election",
            normalized_field="deemed_asset_sale_election",
            normalized_value="true",
            confidence=0.91,
            rendered_value="Section 338(h)(10) election language appears in the document.",
        ):
            detected_elections.add("338(h)(10)")
        if add_signal(
            category="election_language",
            label="Election path signal",
            phrase=r"338\(g\)|section 338\(g\)|qualified stock purchase",
            normalized_field="deemed_asset_sale_election",
            normalized_value="true",
            confidence=0.88,
            rendered_value="Section 338(g) or qualified-stock-purchase election language appears in the document.",
        ):
            detected_elections.add("338(g)")
        if add_signal(
            category="election_language",
            label="Election path signal",
            phrase=r"336\(e\)|section 336\(e\)|qualified stock disposition|election statement",
            normalized_field="deemed_asset_sale_election",
            normalized_value="true",
            confidence=0.88,
            rendered_value="Section 336(e) election language appears in the document.",
        ):
            detected_elections.add("336(e)")

        if add_signal(
            category="structure_signal",
            label="Divisive transaction signal",
            phrase=r"355|section 355|spin-off|spin off|split-off|split off|split-up|split up|divisive|controlled corporation",
            normalized_field="divisive_transactions",
            normalized_value="true",
            confidence=0.9,
            rendered_value="Divisive transaction language appears in the document.",
        ):
            detected_forms.add("divisive")
        if add_signal(
            category="structure_signal",
            label="Contribution signal",
            phrase=r"\b351\b|section 351|contribution|drop-down|drop down|control requirement|holdco",
            normalized_field="contribution_transactions",
            normalized_value="true",
            confidence=0.84,
            rendered_value="Corporate contribution or control-step language appears in the document.",
        ):
            detected_forms.add("contribution")
        if add_signal(
            category="structure_signal",
            label="Partnership transaction signal",
            phrase=r"partnership|llc taxed as a partnership|joint venture|disguised sale|section 721|section 707|section 704\(c\)|section 752|leveraged distribution",
            normalized_field="partnership_issues",
            normalized_value="true",
            confidence=0.87,
            rendered_value="Partnership or disguised-sale language appears in the document.",
        ):
            detected_forms.add("partnership")

        add_signal(
            category="entity_type",
            label="Entity type clue",
            phrase=r"\bs corporation\b|\bc corporation\b|\bdomestic corporation\b|\bforeign corporation\b|\bpartnership\b|\bdisregarded entity\b|\bllc\b",
            confidence=0.74,
            rendered_value="Entity classification language appears in the document.",
        )
        add_signal(
            category="party_profile",
            label="Seller profile clue",
            phrase=r"seller prefers stock|seller consent|domestic corporation seller|s corporation target",
            confidence=0.79,
            rendered_value="Seller-profile language appears in the document.",
        )
        add_signal(
            category="party_profile",
            label="Buyer profile clue",
            phrase=r"buyer values basis step-up|basis step-up|step-up economics|buyer will pay more",
            confidence=0.79,
            rendered_value="Buyer-profile language appears in the document.",
        )

        add_signal(
            category="attribute_signal",
            label="Attribute or NOL clue",
            phrase=r"\bnols?\b|net operating loss(?:es)?|tax attribute(?:s)?|ownership change|built-in gain|built in gain|built-in loss|credit carryforward",
            normalized_field="summary",
            normalized_value="Historic tax attributes may be material.",
            confidence=0.9,
            rendered_value="Historic tax attributes or ownership-change language appears in the document.",
        )
        add_signal(
            category="consideration_signal",
            label="Rollover or equity consideration clue",
            phrase=r"rollover|roll over|equity consideration|continuing equity",
            normalized_field="rollover_equity",
            normalized_value="true",
            confidence=0.85,
            rendered_value="Rollover or continuing-equity language appears in the document.",
        )
        add_signal(
            category="financing_signal",
            label="Debt or refinancing clue",
            phrase=r"debt|refinanc|interest limitation|lender|acquisition indebtedness|significant modification",
            normalized_field="debt_financing",
            normalized_value="true",
            confidence=0.83,
            rendered_value="Debt or refinancing language appears in the document.",
        )
        add_signal(
            category="financing_signal",
            label="Earnout or contingent consideration clue",
            phrase=r"earnout|contingent consideration|contingent payment|installment sale|seller note",
            normalized_field="earnout",
            normalized_value="true",
            confidence=0.8,
            rendered_value="Earnout or deferred-consideration language appears in the document.",
        )

        add_signal(
            category="jurisdictional_overlay",
            label="Withholding clue",
            phrase=r"withholding|backup withholding|certificate of non-foreign status|firpta",
            normalized_field="withholding",
            normalized_value="true",
            confidence=0.82,
            rendered_value="Withholding or certification language appears in the document.",
        )
        add_signal(
            category="jurisdictional_overlay",
            label="International clue",
            phrase=r"cross-border|cross border|foreign|treaty|cfc|outbound transfer|international",
            normalized_field="international",
            normalized_value="true",
            confidence=0.82,
            rendered_value="Cross-border or international language appears in the document.",
        )
        add_signal(
            category="jurisdictional_overlay",
            label="State tax clue",
            phrase=r"state tax|state-law|state law|transfer tax|bulk sale|apportionment",
            normalized_field="state_tax",
            normalized_value="true",
            confidence=0.8,
            rendered_value="State or local tax language appears in the document.",
        )

        if len(detected_forms.intersection({"merger", "asset sale", "stock sale"})) > 1:
            ambiguities.append(
                "The document contains multiple transaction-form signals, so the transaction may still be comparing stock, asset, and merger paths."
            )
        if len(detected_elections) > 1:
            ambiguities.append(
                "The document references more than one deemed-asset election path, so seller profile, target profile, and election mechanics still need review."
            )
        if "partnership" in detected_forms and "contribution" in detected_forms:
            ambiguities.append(
                "The document includes both corporate-contribution and partnership-style signals, so entity classification and rollover structure still need confirmation."
            )
        if ("international" in lowered or "foreign" in lowered) and ("state tax" in lowered or "transfer tax" in lowered):
            ambiguities.append(
                "The document raises both international and state-local overlays, which should stay preliminary until jurisdiction-specific facts are confirmed."
            )

        self._infer_structured_candidates(file_name, text, lowered, add, ambiguities)

        return candidates, ambiguities

    def _infer_structured_candidates(self, file_name: str, text: str, lowered: str, add, ambiguities: list[str]) -> None:
        del file_name

        entity_matches: list[tuple[str, str]] = []

        def add_entity(name: str, entity_type: str = "other", confidence: float = 0.72) -> None:
            entity_name = name.strip()
            if not entity_name:
                return
            if (entity_name.lower(), entity_type) in {(item[0].lower(), item[1]) for item in entity_matches}:
                return
            entity_matches.append((entity_name, entity_type))
            add(
                category="entity_candidate",
                label="Entity candidate",
                value=f"Entity identified: {entity_name}",
                confidence=confidence,
                normalized_target_kind="entity",
                normalized_target_payload={
                    "name": entity_name,
                    "entity_type": entity_type,
                    "status": "confirmed" if confidence >= 0.8 else "proposed",
                },
                certainty="high" if confidence >= 0.8 else "medium",
            )

        simple_entity_patterns = [
            (r"\bmerger sub\b", "Merger Sub", "corporation", 0.88),
            (r"\bsp[in]?co\b", "SpinCo", "corporation", 0.82),
            (r"\bholdco\b", "Holdco", "corporation", 0.78),
            (r"\bparent\b", "Parent", "corporation", 0.76),
            (r"\bbuyer\b", "Buyer", "corporation", 0.8),
            (r"\bseller\b", "Seller", "corporation", 0.8),
            (r"\btarget\b", "Target", "corporation", 0.8),
            (r"\bcontrolled corporation\b", "Controlled Corporation", "corporation", 0.82),
            (r"\bllc\b", "LLC Vehicle", "llc", 0.74),
            (r"\bpartnership\b", "Partnership Vehicle", "partnership", 0.74),
        ]
        for pattern, name, entity_type, confidence in simple_entity_patterns:
            if re.search(pattern, lowered):
                add_entity(name, entity_type, confidence)

        for match in re.finditer(r"\b([A-Z][A-Za-z0-9&.-]*(?:\s+[A-Z][A-Za-z0-9&.-]*)*)\s+(LLC|Inc\.|Corp\.|Corporation|Trust|Branch)\b", text):
            suffix = match.group(2).lower()
            entity_type = {
                "llc": "llc",
                "inc.": "corporation",
                "corp.": "corporation",
                "corporation": "corporation",
                "trust": "trust",
                "branch": "branch",
            }.get(suffix, "other")
            add_entity(match.group(0), entity_type, 0.84)

        role_patterns = [
            ("buyer", "Buyer", "buyer"),
            ("seller", "Seller", "seller"),
            ("target", "Target", "target"),
            ("merger sub", "Merger Sub", "merger_sub"),
            ("parent", "Parent", "parent"),
            ("controlled corporation", "Controlled Corporation", "controlled_corporation"),
            ("distributing corporation", "Parent", "distributing_corporation"),
            ("partnership", "Partnership Vehicle", "partnership_vehicle"),
            ("lender", "Lender", "lender"),
        ]
        for trigger, entity_name, role_type in role_patterns:
            if trigger in lowered:
                add(
                    category="transaction_role_candidate",
                    label="Transaction role candidate",
                    value=f"{entity_name} may serve as {role_type.replace('_', ' ')}.",
                    confidence=0.8,
                    normalized_target_kind="transaction_role",
                    normalized_target_payload={
                        "entity_name": entity_name,
                        "role_type": role_type,
                        "status": "confirmed",
                    },
                    certainty="high",
                )

        classification_patterns = [
            ("s corporation", "Target", "s_corporation"),
            ("c corporation", "Target", "c_corporation"),
            ("llc taxed as a partnership", "LLC Vehicle", "partnership"),
            ("disregarded entity", "LLC Vehicle", "disregarded_entity"),
            ("partnership", "Partnership Vehicle", "partnership"),
            ("foreign corporation", "Target", "foreign_corporation"),
        ]
        for trigger, entity_name, classification_type in classification_patterns:
            if trigger in lowered:
                add(
                    category="tax_classification_candidate",
                    label="Tax classification candidate",
                    value=f"{entity_name} may be treated as {classification_type.replace('_', ' ')}.",
                    confidence=0.8,
                    normalized_target_kind="tax_classification",
                    normalized_target_payload={
                        "entity_name": entity_name,
                        "classification_type": classification_type,
                        "status": "confirmed",
                    },
                    certainty="high",
                )

        if "controlled corporation" in lowered and ("parent" in lowered or "seller" in lowered):
            parent_name = "Parent" if "parent" in lowered else "Seller"
            child_name = "Controlled Corporation"
            add(
                category="ownership_candidate",
                label="Ownership candidate",
                value=f"{parent_name} may own {child_name}.",
                confidence=0.78,
                normalized_target_kind="ownership_link",
                normalized_target_payload={
                    "parent_entity_name": parent_name,
                    "child_entity_name": child_name,
                    "relationship_type": "owns",
                    "status": "proposed",
                },
                certainty="medium",
            )

        step_patterns = [
            (r"spin-off|spin off", "pre_closing", "spin_off", "Spin-off separation step"),
            (r"split-off|split off", "pre_closing", "split_off", "Split-off separation step"),
            (r"split-up|split up", "pre_closing", "split_up", "Split-up separation step"),
            (r"stock acquisition|stock purchase|stock sale", "closing", "stock_purchase", "Stock acquisition step"),
            (r"asset acquisition|asset purchase|asset sale", "closing", "asset_purchase", "Asset acquisition step"),
            (r"merger|merger sub|triangular merger", "closing", "merger", "Merger step"),
            (r"contribution|drop-down|drop down", "pre_closing", "contribution", "Contribution step"),
            (r"llc taxed as a partnership|partnership contribution|joint venture", "pre_closing", "partnership_contribution", "Partnership contribution step"),
            (r"refinanc", "post_closing", "refinancing", "Refinancing step"),
        ]
        for pattern, phase, step_type, title in step_patterns:
            if re.search(pattern, lowered):
                entity_names = [name for name, _ in entity_matches[:3]]
                add(
                    category="transaction_step_candidate",
                    label="Transaction step candidate",
                    value=f"{title} may be part of the deal sequence.",
                    confidence=0.79,
                    normalized_target_kind="transaction_step",
                    normalized_target_payload={
                        "phase": phase,
                        "step_type": step_type,
                        "title": title,
                        "description": f"Proposed from extracted document language: {title.lower()}.",
                        "entity_names": entity_names,
                        "status": "proposed",
                    },
                    certainty="medium",
                )

        election_patterns = [
            (r"338\(h\)\(10\)|joint election", "Section 338(h)(10) election", "election", "IRC Section 338(h)(10) / Form 8023"),
            (r"338\(g\)|qualified stock purchase", "Section 338(g) election", "election", "IRC Section 338(g) / Form 8023"),
            (r"336\(e\)|qualified stock disposition|election statement", "Section 336(e) election", "election", "IRC Section 336(e)"),
            (r"form 8023|8023", "Form 8023 filing", "filing", "IRS Form 8023"),
            (r"form 8594|8594", "Form 8594 filing", "filing", "IRS Form 8594"),
        ]
        for pattern, name, item_type, citation in election_patterns:
            if re.search(pattern, lowered):
                add(
                    category="election_filing_candidate",
                    label="Election or filing candidate",
                    value=f"{name} may be relevant to the structure.",
                    confidence=0.84,
                    normalized_target_kind="election_filing_item",
                    normalized_target_payload={
                        "name": name,
                        "item_type": item_type,
                        "citation_or_form": citation,
                        "related_entity_names": [name for name, _ in entity_matches[:2]],
                        "related_step_titles": ["Stock acquisition step"] if "338" in citation or "336" in citation else [],
                        "status": "possible",
                    },
                    certainty="high",
                )

        if "buyer" in lowered and "target" in lowered and "acquires" in lowered:
            ambiguities.append(
                "The document suggests buyer and target roles, but exact entity names and ownership percentages still need confirmation in Entity Structure."
            )
