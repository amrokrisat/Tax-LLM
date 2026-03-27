from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from tax_llm.domain.models import AuthorityRecord, RetrievalFilters, SourceType, TransactionFacts, UploadedDocument
from tax_llm.infrastructure.corpus import (
    AuthorityIndex,
    INTERNAL_ONLY_TYPES,
    PRIMARY_SUPPORT_TYPES,
    SECONDARY_SUPPORT_TYPES,
    SOURCE_PRIORITY,
    corpus_root,
)

DEFAULT_SOURCE_PRIORITY: list[SourceType] = [
    "code",
    "regs",
    "irs_guidance",
    "cases",
    "forms",
    "internal",
]


class AuthorityCorpusRepository:
    def __init__(self, root_path: Path | None = None) -> None:
        self.root_path = root_path or corpus_root()

    @lru_cache(maxsize=1)
    def _index(self) -> AuthorityIndex:
        return AuthorityIndex.build(root_path=self.root_path)

    def pending_files(self) -> list[str]:
        return self._index().pending_files

    def search(
        self,
        facts: TransactionFacts,
        documents: list[UploadedDocument],
        filters: RetrievalFilters,
        limit: int = 6,
    ) -> list[AuthorityRecord]:
        query_text = " ".join(
            [
                facts.transaction_type,
                facts.summary,
                facts.consideration_mix,
                facts.proposed_steps,
                " ".join(facts.stated_goals),
                " ".join(facts.constraints),
                " ".join(document.content for document in documents),
            ]
        )
        return self._index().search(
            issue_buckets=filters.issue_buckets,
            transaction_type=(
                None
                if filters.transaction_type == "__any__"
                else filters.transaction_type
                if filters.transaction_type is not None
                else facts.transaction_type
            ),
            source_types=filters.source_types,
            priority_order=filters.priority_order or DEFAULT_SOURCE_PRIORITY,
            jurisdictions=filters.jurisdictions or facts.jurisdictions,
            title_keywords=filters.title_keywords,
            citation_keywords=filters.citation_keywords,
            effective_date_from=filters.effective_date_from,
            effective_date_to=filters.effective_date_to,
            query_text=query_text,
            limit=limit,
        )

    def search_by_issue_bucket(
        self,
        *,
        facts: TransactionFacts,
        documents: list[UploadedDocument],
        issue_bucket: str,
        source_priority: list[SourceType] | None = None,
        limit: int = 6,
    ) -> list[AuthorityRecord]:
        return self.search(
            facts=facts,
            documents=documents,
            filters=RetrievalFilters(
                issue_buckets=[issue_bucket],
                transaction_type=self._transaction_type_scope(issue_bucket, facts),
                jurisdictions=facts.jurisdictions,
                priority_order=source_priority or DEFAULT_SOURCE_PRIORITY,
                title_keywords=self._title_keywords_for_bucket(issue_bucket, facts),
                citation_keywords=self._citation_keywords_for_bucket(issue_bucket, facts),
            ),
            limit=limit,
        )

    def search_by_transaction_type(
        self,
        *,
        facts: TransactionFacts,
        documents: list[UploadedDocument],
        source_priority: list[SourceType] | None = None,
        limit: int = 8,
    ) -> list[AuthorityRecord]:
        return self.search(
            facts=facts,
            documents=documents,
            filters=RetrievalFilters(
                transaction_type=facts.transaction_type,
                jurisdictions=facts.jurisdictions,
                priority_order=source_priority or DEFAULT_SOURCE_PRIORITY,
            ),
            limit=limit,
        )

    def support_warning(self, authorities: list[AuthorityRecord]) -> str | None:
        if not authorities:
            return "No retrieved authority supports this bucket yet."
        source_types = {authority.source_type for authority in authorities}
        if source_types.issubset(INTERNAL_ONLY_TYPES):
            return "Support currently comes only from internal materials. Add primary authority before treating conclusions as complete."
        if source_types.isdisjoint(PRIMARY_SUPPORT_TYPES):
            return "Support currently lacks Code or Regulations. Conclusions should remain preliminary until primary authority is retrieved."
        if source_types.issubset(SECONDARY_SUPPORT_TYPES | INTERNAL_ONLY_TYPES):
            return "Support currently relies on secondary or internal materials without primary authority priority."
        return None

    def source_rank(self, source_type: SourceType) -> int:
        return SOURCE_PRIORITY[source_type]

    def _transaction_type_scope(
        self, issue_bucket: str, facts: TransactionFacts
    ) -> str | None:
        transaction_form_buckets = {
            "stock_sale",
            "asset_sale",
            "deemed_asset_sale_election",
            "merger_reorganization",
            "divisive_transactions",
        }
        if issue_bucket in transaction_form_buckets:
            return facts.transaction_type
        return "__any__"

    def _title_keywords_for_bucket(
        self, issue_bucket: str, facts: TransactionFacts
    ) -> list[str]:
        keywords: dict[str, list[str]] = {
            "attribute_preservation": ["attribute", "ownership", "loss", "credit", "built-in"],
            "debt_overlay": ["interest", "debt", "financing", "refinancing", "modification"],
            "earnout_overlay": ["earnout", "installment", "deferred"],
            "deemed_asset_sale_election": [
                "338",
                "338(h)(10)",
                "338(g)",
                "336(e)",
                "deemed asset",
                "qualified stock purchase",
                "qualified stock disposition",
                "old target",
                "new target",
                "joint election",
                "election statement",
                "protective election",
                "s corporation",
                "domestic corporation seller",
                "agub",
                "adsp",
            ],
            "asset_sale": [
                "asset",
                "asset purchase",
                "allocation",
                "residual",
                "purchase price allocation",
                "basis step-up",
                "asset basis",
                "seller gain",
            ],
            "merger_reorganization": ["reorganization", "continuity", "business purpose", "triangular", "cobe", "boot", "plan of reorganization"],
            "rollover_equity": ["rollover", "continuity", "governance", "redemption", "boot", "securities"],
            "contribution_transactions": ["351", "contribution", "drop-down", "control", "holdco", "property transfer"],
            "divisive_transactions": ["355", "divisive", "spin-off", "split-off", "split-up", "controlled corporation", "distribution"],
            "stock_sale": [
                "stock",
                "stock acquisition",
                "stock form",
                "carryover basis",
                "entity history",
                "seller stock preference",
                "qualified stock purchase",
                "qualified stock disposition",
            ],
        }
        result = keywords.get(issue_bucket, []).copy()
        summary = f"{facts.summary} {facts.consideration_mix} {facts.proposed_steps}".lower()
        if "nol" in summary or "attribute" in summary:
            result.append("ownership")
        return result

    def _citation_keywords_for_bucket(
        self, issue_bucket: str, facts: TransactionFacts
    ) -> list[str]:
        keywords: dict[str, list[str]] = {
            "attribute_preservation": ["382", "383", "384"],
            "debt_overlay": ["163(j)", "279", "1.1001-3"],
            "earnout_overlay": ["453", "1274", "483"],
            "deemed_asset_sale_election": [
                "338",
                "1.338-1",
                "1.338(h)(10)-1",
                "336(e)",
                "1.336-1",
                "1.336-2",
                "8023",
                "8883",
                "agub",
                "adsp",
            ],
            "asset_sale": ["1060", "1.1060-1", "8594", "residual method", "allocation", "asset basis"],
            "merger_reorganization": ["368", "1.368-1", "1.368-2"],
            "rollover_equity": ["368", "351", "1.368-1", "1.368-2", "356"],
            "contribution_transactions": ["351", "1.351", "control"],
            "divisive_transactions": ["355", "1.355-1", "spin-off", "split-off", "device", "controlled corporation"],
            "partnership_issues": ["721", "707"],
            "stock_sale": ["stock form", "carryover basis", "stock acquisition", "338", "qualified stock purchase"],
        }
        result = keywords.get(issue_bucket, []).copy()
        summary = f"{facts.summary} {facts.stated_goals}".lower()
        steps = facts.proposed_steps.lower()
        if issue_bucket in {"stock_sale", "attribute_preservation"} and (
            "nol" in summary or "attribute" in summary
        ):
            result.append("382")
        if issue_bucket == "deemed_asset_sale_election":
            if "338(h)(10)" in summary or "338(h)(10)" in steps:
                result.append("1.338(h)(10)-1")
                result.extend(["8023", "8883"])
            if "338(g)" in summary or "338(g)" in steps:
                result.extend(["1.338-1", "8883"])
            if "336(e)" in summary or "336(e)" in steps or "qualified stock disposition" in summary + " " + steps:
                result.extend(["1.336-1", "1.336-2", "336(e)"])
            if "qualified stock purchase" in summary or "qualified stock purchase" in steps:
                result.extend(["1.338-1", "8023"])
            if any(term in summary + " " + steps for term in ["basis step-up", "allocation", "agub", "adsp"]):
                result.extend(["8883", "1060"])
        if issue_bucket == "asset_sale":
            if any(
                term in summary + " " + steps
                for term in ["basis step-up", "allocation", "residual method", "form 8594", "asset purchase"]
            ):
                result.extend(["1.1060-1", "8594"])
        if issue_bucket == "stock_sale":
            if any(
                term in summary + " " + steps
                for term in ["seller prefers stock", "stock form", "qualified stock purchase", "qualified stock disposition", "contracts", "licenses", "s corporation"]
            ):
                result.extend(["338", "1.338-1", "336(e)", "1.336-1"])
        if issue_bucket == "merger_reorganization":
            if any(term in summary + " " + steps for term in ["triangular", "merger sub", "reverse triangular", "forward triangular"]):
                result.append("1.368-2")
            if any(term in summary + " " + steps for term in ["continuity", "cobe", "business purpose"]):
                result.append("1.368-1")
        return result
