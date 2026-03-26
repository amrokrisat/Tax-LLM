from __future__ import annotations

from dataclasses import dataclass

from tax_llm.domain.models import (
    AnalysisResult,
    AuthorityRecord,
    BucketCoverage,
    MemoSection,
    MissingFactQuestion,
    StructuralAlternative,
    SupportedStatement,
    TaxIssue,
    TransactionBucket,
    TransactionFacts,
    UploadedDocument,
)
from tax_llm.infrastructure.document_parser import DemoDocumentParser
from tax_llm.infrastructure.repositories import (
    DEFAULT_SOURCE_PRIORITY,
    AuthorityCorpusRepository,
)

BUCKET_LABELS = {
    "attribute_preservation": "Attribute preservation",
    "stock_sale": "Stock sale",
    "asset_sale": "Asset sale",
    "deemed_asset_sale_election": "Deemed asset sale elections",
    "merger_reorganization": "Merger / reorganization possibilities",
    "rollover_equity": "Rollover equity",
    "contribution_transactions": "Contribution transactions",
    "partnership_issues": "Partnership issues",
    "debt_overlay": "Debt overlay",
    "earnout_overlay": "Earnout overlay",
    "withholding_overlay": "Withholding overlay",
    "state_overlay": "State and local overlay",
    "international_overlay": "International overlay",
}

ISSUE_LIBRARY = {
    "attribute_preservation": (
        "Attribute preservation and Section 382 sensitivity",
        "Assess whether NOLs or other tax attributes could be limited, diluted, or stranded by the contemplated equity deal and related ownership changes.",
        "high",
    ),
    "stock_sale": (
        "Stock acquisition basis and attribute carryover",
        "Review carryover basis, attribute preservation, and purchase price consequences in the stock acquisition format.",
        "medium",
    ),
    "asset_sale": (
        "Asset gain recognition and allocation mechanics",
        "Review gain recognition, basis step-up, and purchase price allocation mechanics for a taxable asset transfer.",
        "high",
    ),
    "deemed_asset_sale_election": (
        "Deemed asset sale election requirements",
        "Confirm whether the contemplated election mechanics fit the parties, stock ownership profile, and intended purchase price results.",
        "high",
    ),
    "merger_reorganization": (
        "Reorganization qualification",
        "Test continuity, business purpose, and step-plan requirements before treating the structure as reorganization-eligible.",
        "high",
    ),
    "rollover_equity": (
        "Rollover equity qualification and valuation",
        "Confirm whether rollover equity mechanics affect qualification, disguised sale concerns, and value allocation.",
        "high",
    ),
    "contribution_transactions": (
        "Contribution transaction control and basis",
        "Analyze whether contribution steps satisfy control requirements and produce the intended basis and holding period results.",
        "medium",
    ),
    "partnership_issues": (
        "Partnership disguised sale and liability allocation",
        "Review disguised sale, section 704(c), and liability allocation consequences where partnership entities are involved.",
        "high",
    ),
    "debt_overlay": (
        "Debt placement and limitation overlay",
        "Evaluate acquisition debt placement, earnings stripping, and basis alignment implications.",
        "medium",
    ),
    "earnout_overlay": (
        "Contingent consideration timing and character",
        "Assess how earnout mechanics affect amount realized, valuation, and timing across the structure.",
        "medium",
    ),
    "withholding_overlay": (
        "Withholding and collection obligations",
        "Review applicable withholding obligations, certifications, and collection mechanics before closing.",
        "high",
    ),
    "state_overlay": (
        "State and local tax overlays",
        "Review transfer taxes, apportionment consequences, and state-specific conformity issues.",
        "medium",
    ),
    "international_overlay": (
        "Cross-border and international tax overlay",
        "Review cross-border withholding, foreign attribute, and anti-deferral implications for the proposed transaction path.",
        "high",
    ),
}


@dataclass
class AnalysisService:
    authority_repository: AuthorityCorpusRepository
    document_parser: DemoDocumentParser

    def analyze(
        self, facts: TransactionFacts, uploaded_documents: list[UploadedDocument]
    ) -> AnalysisResult:
        parsed_documents = self.document_parser.parse(uploaded_documents)
        classification = self._classify_transaction(facts, parsed_documents)
        bucket_coverage = self._retrieve_bucket_support(
            facts=facts,
            parsed_documents=parsed_documents,
            classification=classification,
        )
        authorities_reviewed = self._flatten_authorities(bucket_coverage)
        covered_buckets = [
            coverage.bucket for coverage in bucket_coverage if self._is_strongly_supported(coverage)
        ]
        under_supported_buckets = [
            coverage.bucket
            for coverage in bucket_coverage
            if coverage.status == "under_supported"
        ]
        weakly_supported_buckets = [
            coverage.bucket
            for coverage in bucket_coverage
            if coverage.status == "covered" and coverage.source_priority_warning
        ]
        issues = self._identify_issues(bucket_coverage)
        missing_facts = self._missing_fact_questions(bucket_coverage, facts)
        alternatives = self._compare_alternatives(bucket_coverage, facts)
        memo_sections = self._draft_memo(
            facts=facts,
            bucket_coverage=bucket_coverage,
            issues=issues,
            alternatives=alternatives,
        )
        retrieval_complete = len(under_supported_buckets) == 0 and len(weakly_supported_buckets) == 0
        completeness_warning = self._completeness_warning(
            under_supported_buckets, weakly_supported_buckets
        )

        return AnalysisResult(
            facts=facts,
            parsed_documents=parsed_documents,
            classification=classification,
            authorities_reviewed=authorities_reviewed,
            bucket_coverage=bucket_coverage,
            covered_buckets=covered_buckets,
            under_supported_buckets=under_supported_buckets,
            issues=issues,
            alternatives=alternatives,
            memo_sections=memo_sections,
            missing_facts=missing_facts,
            completeness_warning=completeness_warning,
            confidence_label=self._confidence_label(
                covered_buckets, under_supported_buckets, weakly_supported_buckets
            ),
            retrieval_complete=retrieval_complete,
        )

    def _facts_text(self, facts: TransactionFacts) -> str:
        return " ".join(
            [
                facts.transaction_name,
                facts.summary,
                facts.transaction_type,
                facts.consideration_mix,
                facts.proposed_steps,
                " ".join(facts.stated_goals),
                " ".join(facts.constraints),
            ]
        ).lower()

    def _contains_any(self, text: str, terms: list[str]) -> bool:
        return any(term in text for term in terms)

    def _clean_phrase(self, value: str) -> str:
        return value.strip().rstrip(".;,")

    def _natural_join(self, items: list[str]) -> str:
        cleaned = [self._clean_phrase(item).lower() for item in items if item]
        if not cleaned:
            return ""
        if len(cleaned) == 1:
            return cleaned[0]
        if len(cleaned) == 2:
            return f"{cleaned[0]} and {cleaned[1]}"
        return ", ".join(cleaned[:-1]) + f", and {cleaned[-1]}"

    def _deal_profile(self, facts: TransactionFacts) -> str:
        if facts.transaction_type and facts.consideration_mix:
            return f"{facts.transaction_type} with {self._clean_phrase(facts.consideration_mix).lower()}"
        if facts.transaction_type:
            return facts.transaction_type
        return "proposed transaction"

    def _has_stock_form(self, text: str, facts: TransactionFacts) -> bool:
        return "stock" in text or facts.transaction_type.lower() in {"stock sale", "stock acquisition", "merger"}

    def _has_asset_form(self, text: str, facts: TransactionFacts) -> bool:
        return "asset" in text or facts.transaction_type.lower() == "asset sale"

    def _has_deemed_asset_signal(self, text: str, facts: TransactionFacts) -> bool:
        return (
            facts.deemed_asset_sale_election
            or "338(h)(10)" in text
            or "338(g)" in text
            or "336(e)" in text
            or "deemed asset" in text
            or "qualified stock purchase" in text
        )

    def _has_338h10_signal(self, text: str) -> bool:
        return "338(h)(10)" in text or "338 h 10" in text

    def _has_338g_signal(self, text: str) -> bool:
        return "338(g)" in text or "338 g" in text

    def _structure_posture(self, facts: TransactionFacts) -> str:
        facts_text = self._facts_text(facts)
        stock_like = self._has_stock_form(facts_text, facts)
        asset_like = self._has_asset_form(facts_text, facts)
        deemed_like = self._has_deemed_asset_signal(facts_text, facts)
        if self._has_338h10_signal(facts_text):
            return "stock-form deal with a possible section 338(h)(10) election"
        if self._has_338g_signal(facts_text):
            return "stock-form deal with a possible section 338(g) election"
        if deemed_like:
            return "stock-form deal with a possible deemed asset election"
        if stock_like and asset_like:
            return "mixed stock-versus-asset comparison"
        if asset_like:
            return "taxable asset path"
        if stock_like:
            return "taxable stock path"
        return "structure still being formed"

    def _classify_transaction(
        self, facts: TransactionFacts, uploaded_documents: list[UploadedDocument]
    ) -> list[TransactionBucket]:
        text = " ".join(
            [
                facts.transaction_type,
                facts.summary,
                facts.consideration_mix,
                facts.proposed_steps,
                " ".join(facts.constraints),
                " ".join(document.content for document in uploaded_documents),
            ]
        ).lower()
        buckets: list[TransactionBucket] = []

        def add(bucket: str, reason: str) -> None:
            if bucket not in {item.bucket for item in buckets}:
                buckets.append(
                    TransactionBucket(
                        bucket=bucket,
                        label=BUCKET_LABELS[bucket],
                        reason=reason,
                    )
                )

        if self._has_stock_form(text, facts):
            add(
                "stock_sale",
                "Facts suggest the parties may preserve stock form and inherited target-level tax history rather than stepping directly into an asset transfer.",
            )
        if any(
            term in text
            for term in [
                "nol",
                "net operating loss",
                "attribute",
                "ownership change",
                "built-in gain",
                "built in loss",
            ]
        ):
            add(
                "attribute_preservation",
                "Facts indicate tax attributes or ownership-change sensitivity that warrants dedicated attribute preservation analysis.",
            )
        if self._has_asset_form(text, facts):
            add(
                "asset_sale",
                "Facts suggest the buyer may want asset-style consequences, including basis step-up and purchase price allocation, even if seller tax cost rises.",
            )
        if self._has_deemed_asset_signal(text, facts):
            deemed_reason = "Facts suggest the parties may be testing whether a nominal stock deal can still produce asset-style tax results through an available election."
            if self._has_338h10_signal(text):
                deemed_reason = "Facts suggest the parties may be testing whether a stock deal can still produce asset-style tax results through a section 338(h)(10) election, making seller consent, ownership profile, and old-target/new-target consequences central gating issues."
            elif self._has_338g_signal(text):
                deemed_reason = "Facts suggest the buyer may be testing a section 338(g) path, making qualified stock purchase status, target-level deemed-sale cost, and basis mechanics central gating issues."
            add(
                "deemed_asset_sale_election",
                deemed_reason,
            )
        if "merger" in text or "reorganization" in text or facts.transaction_type.lower() == "merger":
            add("merger_reorganization", "Facts indicate a merger or reorganization path may be available.")
        if facts.rollover_equity or "rollover" in text or "equity consideration" in text:
            add("rollover_equity", "Facts indicate rollover equity or mixed consideration.")
        if facts.contribution_transactions or "contribution" in text:
            add("contribution_transactions", "Facts indicate contribution steps or pre-close transfers.")
        if facts.partnership_issues or "partnership" in text or "llc" in text:
            add("partnership_issues", "Facts indicate partnership or passthrough tax issues.")
        if facts.debt_financing or "debt" in text or "financing" in text or "refinancing" in text:
            add("debt_overlay", "Facts indicate acquisition debt or financing overlays.")
        if facts.earnout or "earnout" in text or "contingent consideration" in text:
            add("earnout_overlay", "Facts indicate contingent consideration or earnout mechanics.")
        if facts.withholding or "withholding" in text:
            add("withholding_overlay", "Facts indicate withholding or collection obligations.")
        if facts.state_tax or "state tax" in text or "transfer tax" in text:
            add("state_overlay", "Facts indicate state or local tax consequences.")
        if facts.international or "foreign" in text or "cross-border" in text or "international" in text:
            add("international_overlay", "Facts indicate cross-border or international overlays.")

        if not buckets:
            add("stock_sale", "Default classification because the transaction form is not yet complete.")

        return buckets

    def _retrieve_bucket_support(
        self,
        facts: TransactionFacts,
        parsed_documents: list[UploadedDocument],
        classification: list[TransactionBucket],
    ) -> list[BucketCoverage]:
        coverage: list[BucketCoverage] = []
        for bucket in classification:
            authorities = self.authority_repository.search_by_issue_bucket(
                facts=facts,
                documents=parsed_documents,
                issue_bucket=bucket.bucket,
                source_priority=DEFAULT_SOURCE_PRIORITY,
            )
            status = "covered" if authorities else "under_supported"
            notes = []
            if not authorities:
                notes.append(
                    "No authority was retrieved for this bucket. Drafting should remain preliminary."
                )
            source_priority_warning = self.authority_repository.support_warning(authorities)
            if source_priority_warning:
                notes.append(source_priority_warning)
            coverage.append(
                BucketCoverage(
                    bucket=bucket.bucket,
                    label=bucket.label,
                    status=status,
                    authorities=authorities,
                    notes=notes,
                    source_priority_warning=source_priority_warning,
                )
            )
        return coverage

    def _is_strongly_supported(self, coverage: BucketCoverage) -> bool:
        return (
            coverage.status == "covered"
            and bool(coverage.authorities)
            and coverage.source_priority_warning is None
        )

    def _is_preliminary_coverage(self, coverage: BucketCoverage) -> bool:
        return coverage.status == "under_supported" or coverage.source_priority_warning is not None

    def _identify_issues(self, bucket_coverage: list[BucketCoverage]) -> list[TaxIssue]:
        issues: list[TaxIssue] = []
        for coverage in bucket_coverage:
            name, description, severity = ISSUE_LIBRARY[coverage.bucket]
            if self._is_strongly_supported(coverage):
                lead = coverage.authorities[0]
                description = (
                    f"{description} The current lead authority is {lead.citation}, which tracks the active facts in this bucket."
                )
            elif coverage.status == "covered" and coverage.authorities:
                description = (
                    f"{description} Retrieved material exists, but it is not primary-authority support, so the point should stay preliminary."
                )
            else:
                description = (
                    f"{description} This remains preliminary because the current corpus did not retrieve direct support for the bucket."
                )
            issues.append(
                TaxIssue(
                    bucket=coverage.bucket,
                    name=name,
                    description=description,
                    severity=severity,
                    supported=self._is_strongly_supported(coverage),
                    authorities=coverage.authorities[:3],
                    notes=coverage.notes,
                )
            )
        return issues

    def _bucket_fact_specific_text(
        self, bucket: str, facts: TransactionFacts
    ) -> str:
        facts_text = self._facts_text(facts)
        if bucket == "attribute_preservation":
            if self._contains_any(facts_text, ["built-in gain", "built in loss"]):
                return (
                    "The fact pattern raises both ownership-change and built-in-item questions, so the value of the target's attributes depends on more than a simple NOL headline."
                )
            return (
                "The submitted facts point to material tax attributes, so prior ownership shifts, current rollover mechanics, and any post-closing equity moves should be tested before assigning value to those attributes."
            )
        if bucket == "merger_reorganization":
            if self._contains_any(facts_text, ["reverse triangular", "forward triangular", "merger sub"]):
                return (
                    f"The current step plan uses a merger-sub structure with {facts.consideration_mix or 'mixed consideration'}, so continuity, business purpose, and triangular-merger form requirements all matter."
                )
            return (
                f"The current step plan describes a merger with {facts.consideration_mix or 'mixed consideration'}, so continuity, business purpose, and step integration should be tested against the actual consideration mix and sequencing."
            )
        if bucket == "rollover_equity":
            if self._contains_any(
                facts_text,
                ["redemption", "put", "downside protection", "preferred", "guaranteed return", "liquidity right"],
            ):
                return (
                    "The rollover terms appear to include governance or downside-protection features, so the analysis should focus on whether the retained equity is still meaningful continuing equity rather than sale consideration in another form."
                )
            return (
                "Seller rollover equity is part of the consideration mix, making the instrument terms, governance rights, and any exit or downside protections central to the tax analysis."
            )
        if bucket == "debt_overlay":
            if self._contains_any(facts_text, ["refinancing", "debt pushdown", "intercompany note"]):
                return (
                    "The financing plan includes post-signing or post-closing debt steps, so interest limitation, debt placement, and debt-modification consequences should be modeled independently from the acquisition form itself."
                )
            return (
                "The current facts describe acquisition debt or refinancing, so interest-limitation, debt placement, and refinancing consequences should be analyzed separately from the structural qualification questions."
            )
        if bucket == "stock_sale":
            if self._contains_any(facts_text, ["nol", "attribute", "ownership change"]):
                return (
                    "The current facts point to a stock path that may preserve entity-level history, contracts, licenses, and tax attributes in stock form, while leaving the buyer with carryover basis and inherited tax posture; if an election fork is available, that stock-form baseline still has to be weighed against a possible step-up alternative."
                )
            return (
                "The current facts point to a stock path that may preserve legal continuity, contracts, and stock-sale economics for the seller, but the buyer-side cost of inheriting carryover basis and existing tax posture still has to be weighed against any available election or asset-style alternative."
            )
        if bucket == "asset_sale":
            if self._contains_any(facts_text, ["transfer tax", "state tax"]):
                return (
                    "The current facts suggest that a direct asset transfer could produce buyer-favorable basis step-up, but the analysis should be anchored in section 1060 allocation, seller-level current tax cost, and possible state transfer-tax friction rather than in stock-election mechanics."
                )
            return (
                "The current facts point to a direct asset transfer, so residual allocation, buyer basis step-up, seller gain character, and asset-level execution burden should be tested together as the core direct-purchase tradeoff."
            )
        if bucket == "deemed_asset_sale_election":
            if self._has_338h10_signal(facts_text):
                return (
                    "The election analysis should focus on whether a section 338(h)(10) path is actually available, whether the seller and target profile fit the joint-election mechanics, how old-target and new-target consequences affect each side, and whether the buyer values the step-up enough to absorb the seller-side tax cost."
                )
            if self._has_338g_signal(facts_text):
                return (
                    "The election analysis should focus on whether a section 338(g) path is truly available through a qualified stock purchase, how the old-target and new-target deemed-sale consequences affect the target rather than a consenting seller, and whether the buyer-side basis benefit is worth the resulting tax cost and compliance burden."
                )
            return (
                "The election analysis should focus on whether a qualified stock purchase or similar election path is actually available, whether the target and seller profile fit the election mechanics, whether the buyer values the step-up enough to pay for it, and whether the seller would accept deemed sale cost in a nominal stock deal."
            )
        if bucket == "state_overlay":
            return (
                "The fact pattern points to state or transfer-tax consequences, but the current support is only internal and should stay at issue-spotting level rather than recommendation level."
            )
        return "The submitted facts specifically trigger this issue bucket."

    def _memo_observation_body(
        self,
        coverage: BucketCoverage,
        facts: TransactionFacts,
        lead: AuthorityRecord,
    ) -> str:
        fact_anchor = self._bucket_fact_specific_text(coverage.bucket, facts)
        if coverage.bucket == "attribute_preservation":
            return (
                f"The attribute-preservation analysis currently relies most heavily on {lead.citation}, because the transaction cannot treat the target's tax attributes as fully available without testing ownership-change mechanics, built-in-item rules, and related limitations. "
                f"{fact_anchor}"
            )
        if coverage.bucket == "merger_reorganization":
            return (
                f"The reorganization analysis currently relies most heavily on {lead.citation}, because the transaction is being evaluated as a merger rather than as a straightforward taxable acquisition. "
                f"{fact_anchor}"
            )
        if coverage.bucket == "rollover_equity":
            return (
                f"The rollover analysis currently relies most heavily on {lead.citation}, because the seller is not simply cashing out; part of the value is expected to remain invested in equity form, and the exact rights attached to that equity may affect continuity and boot analysis. "
                f"{fact_anchor}"
            )
        if coverage.bucket == "debt_overlay":
            return (
                f"The financing analysis currently relies most heavily on {lead.citation}, because the submitted facts include debt-funded or refinanced economics that can materially change the after-tax profile of the selected structure. "
                f"{fact_anchor}"
            )
        if coverage.bucket == "stock_sale":
            return (
                f"The stock-acquisition analysis currently relies most heavily on {lead.citation}, because the parties are evaluating whether to retain stock form, preserve the target's legal and tax history, and deliver seller-favorable stock treatment rather than moving immediately into a taxable asset-style transfer. On the buyer side, that usually means inheriting carryover basis, historic tax posture, and entity-level liabilities; on the seller side, stock form can be materially more attractive if it avoids current asset-sale style tax cost while still leaving room to test an election fork if one is available. "
                f"{fact_anchor}"
            )
        if coverage.bucket == "asset_sale":
            return (
                f"The direct asset-acquisition analysis currently relies most heavily on {lead.citation}, because the core tax tradeoff is whether a current taxable asset transfer produces enough buyer-side step-up and allocation value under the section 1060 framework to justify the seller's immediate tax cost and the operational burden of asset-level execution. "
                f"{fact_anchor}"
            )
        if coverage.bucket == "deemed_asset_sale_election":
            facts_text = self._facts_text(facts)
            if self._has_338h10_signal(facts_text):
                return (
                    f"The section 338(h)(10) analysis currently relies most heavily on {lead.citation}, because the transaction is being modeled as a qualified stock purchase that may still produce deemed asset-sale consequences through a joint election. The governing questions are whether the ownership profile and seller class actually permit the election, how old-target and new-target consequences split between buyer and seller, and whether the buyer's basis-step-up case is strong enough to justify the seller-side tax cost. "
                    f"{fact_anchor}"
                )
            if self._has_338g_signal(facts_text):
                return (
                    f"The section 338(g) analysis currently relies most heavily on {lead.citation}, because the buyer may be able to reframe a qualified stock purchase as a deemed asset transaction without the joint-election seller mechanics of section 338(h)(10). The critical issues are whether the purchase is truly qualified, whether the old-target/new-target consequences fit the parties' economics, and whether the resulting basis and attribute profile is actually better than a straight stock path. "
                    f"{fact_anchor}"
                )
            return (
                f"The deemed-asset-election analysis currently relies most heavily on {lead.citation}, because the transaction may need to be modeled as a nominal stock deal with asset-style tax consequences. The practical gating question is whether the legal ownership profile and party consent actually permit that election, rather than whether asset-style economics are attractive in the abstract. "
                f"{fact_anchor}"
            )
        return (
            f"The current lead authority for this bucket is {lead.citation}. "
            f"{fact_anchor}"
        )

    def _issue_summary_text(self, issues: list[TaxIssue]) -> str:
        if not issues:
            return "No issue buckets currently have primary-authority support."
        if len(issues) == 1:
            return f"Primary authority currently supports the analysis of {issues[0].name.lower()}."
        labels = [issue.name.lower() for issue in issues[:4]]
        return f"Primary authority currently supports the analysis of {', '.join(labels[:-1])}, and {labels[-1]}."

    def _facts_section_text(
        self, facts: TransactionFacts, bucket_coverage: list[BucketCoverage]
    ) -> str:
        profile = self._deal_profile(facts)
        classified = ", ".join(item.label for item in bucket_coverage)
        emphasis_parts: list[str] = []
        if facts.stated_goals:
            emphasis_parts.append(
                f"business goals to {self._natural_join(facts.stated_goals[:3])}"
            )
        if facts.constraints:
            emphasis_parts.append(
                f"constraints including {self._natural_join(facts.constraints[:2])}"
            )
        emphasis = ""
        if emphasis_parts:
            emphasis = " The submission also highlights " + " and ".join(emphasis_parts) + "."
        return (
            f"{facts.transaction_name or 'The transaction'} currently appears to be a {profile}. "
            + (
                f"The submitted steps include {self._clean_phrase(facts.proposed_steps).lower()}. "
                if facts.proposed_steps
                else ""
            )
            + f"At a structural level, the current record looks most like a {self._structure_posture(facts)}. "
            + f"Based on the submitted facts, the analysis has been organized around {classified}.{emphasis}"
        )

    def _alternative_intro(
        self, alternative: StructuralAlternative
    ) -> str:
        lead_tradeoff = (
            alternative.tax_consequences[0].text
            if alternative.tax_consequences
            else "The relative tax tradeoffs remain preliminary."
        )
        return lead_tradeoff

    def _compare_alternatives(
        self, bucket_coverage: list[BucketCoverage], facts: TransactionFacts
    ) -> list[StructuralAlternative]:
        coverage_map = {item.bucket: item for item in bucket_coverage}
        alternatives: list[StructuralAlternative] = []
        facts_text = self._facts_text(facts)

        if "merger_reorganization" in coverage_map:
            alternatives.append(
                self._build_alternative(
                    name="Reorganization-sensitive merger path",
                    description=(
                        "This path treats the deal as a continuity-sensitive merger and asks whether the rollover equity is substantial and durable enough to support that treatment."
                    ),
                    buckets=["merger_reorganization", "rollover_equity"],
                    consequence_texts=[
                        "This path is stronger if the parties are prepared to preserve meaningful continuing equity and avoid terms that make the rollover look synthetic or redemption-like.",
                        "If the rollover equity is respected and the overall step plan remains coherent, this path can produce a more favorable nonrecognition profile than a fully taxable deal.",
                    ],
                    assumptions=[
                        "The parties intend to preserve genuine continuing equity for rollover holders.",
                        "The merger form and plan of reorganization remain stable through closing.",
                    ],
                    missing_facts=[
                        "Exact rollover instrument terms, governance rights, and any redemption or downside protection features.",
                        "Whether any pre-closing recapitalizations or post-closing integrations alter continuity-sensitive analysis.",
                    ],
                    risk_texts=[
                        "This path becomes weaker if the equity component is too small, too protected, or too quickly unwindable, because those facts can undermine continuity-sensitive treatment.",
                    ],
                    coverage_map=coverage_map,
                )
            )

        if "attribute_preservation" in coverage_map or "debt_overlay" in coverage_map or "stock_sale" in coverage_map:
            alternatives.append(
                self._build_alternative(
                    name="Taxable stock acquisition path",
                    description=(
                        "This path treats the deal as a taxable stock acquisition and measures the value of preserving stock form, entity-level history, and seller-favorable stock treatment against the cost of carryover tax posture, attribute limitations, and any foregone basis step-up."
                    ),
                    buckets=["stock_sale", "attribute_preservation", "debt_overlay"],
                    consequence_texts=[
                        "This path is often strongest when preserving target-level contracts, licenses, permits, and stock-sale execution matters more than an immediate buyer-side basis step-up, and when the seller strongly prefers stock treatment over current asset-sale economics.",
                        "The main tax tradeoff is that the buyer inherits the target's basis and tax profile while the seller may get more favorable stock-sale economics; if the buyer is really paying for step-up, amortization, or allocation value, a straight stock path can become a staging point for an election fork rather than the final answer.",
                    ],
                    assumptions=[
                        "The transaction can be priced and documented in stock form without needing an asset-style election.",
                        "Any possible deemed-election alternative remains optional rather than required to make the stock form economically sensible.",
                    ],
                    missing_facts=[
                        "Historic ownership movements and current NOL profile of the target.",
                        "Whether the buyer is prioritizing stock-form continuity and inherited contracts or instead primarily values buyer-side basis step-up.",
                        "Whether the buyer is actually pricing in basis step-up value or instead prioritizing legal simplicity and stock-form execution.",
                    ],
                    risk_texts=[
                        "This path becomes less attractive if hidden tax liabilities sit inside the target, if the buyer really needs asset-level basis step-up, if a realistic election fork would produce materially better economics, or if the expected debt profile produces a larger interest-limitation cost than the parties modeled.",
                    ],
                    coverage_map=coverage_map,
                )
            )

        if "asset_sale" in coverage_map:
            alternatives.append(
                self._build_alternative(
                    name="Direct taxable asset acquisition path",
                    description=(
                        "This path treats the deal as a direct taxable asset purchase and tests whether immediate buyer-side basis step-up and section 1060 allocation economics justify the seller's current tax cost and asset-level execution burden."
                    ),
                    buckets=["asset_sale", "state_overlay", "withholding_overlay"],
                    consequence_texts=[
                        "This path is strongest when the buyer materially values depreciation, amortization, and gain-shielding from a basis step-up and the parties can support a section 1060 allocation without destabilizing price or execution.",
                        "The central tradeoff is that direct asset purchase economics are usually more buyer-favorable on basis and allocation, but they can become seller-unfriendly once current gain recognition, ordinary-income recapture, transfer-tax friction, and asset-by-asset transfer burden are modeled together.",
                    ],
                    assumptions=[
                        "The parties can actually transfer the relevant assets directly without legal or commercial obstacles overwhelming the tax benefit.",
                        "Purchase price allocation will be documented consistently under the section 1060 framework, including Form 8594 reporting.",
                    ],
                    missing_facts=[
                        "How large the buyer's expected basis step-up benefit really is under the proposed allocation.",
                        "What seller-side current tax cost, recapture exposure, or transfer-tax burden the seller would actually accept in a direct asset transfer.",
                        "Whether consents, permits, or contract-assignment frictions make a direct asset transfer commercially weaker than a stock-form structure.",
                    ],
                    risk_texts=[
                        "This path weakens if the buyer's step-up case is modest, if seller tax cost or transfer-tax friction is too high, or if asset-level transfer mechanics make direct execution materially harder than a stock-form transaction.",
                    ],
                    coverage_map=coverage_map,
                )
            )

        if "deemed_asset_sale_election" in coverage_map:
            if self._has_338h10_signal(facts_text):
                alternatives.append(
                    self._build_alternative(
                        name="Stock acquisition with possible Section 338(h)(10) election",
                        description=(
                            "This path preserves stock-form execution while testing whether a joint section 338(h)(10) election can produce deemed asset-sale consequences and buyer-side basis step-up."
                        ),
                        buckets=["stock_sale", "deemed_asset_sale_election", "asset_sale", "attribute_preservation"],
                        consequence_texts=[
                            "This path is strongest when the target ownership profile permits a 338(h)(10) election, the seller will accept the deemed-sale economics, and the buyer values basis step-up enough to fund any gross-up or pricing adjustment.",
                            "The governing tradeoff is that buyer-side step-up, allocation, and future amortization benefits must outweigh seller-side current tax cost, joint-election execution burden, and any loss of value from turning a stock-form exit into a deemed asset sale for tax purposes.",
                        ],
                        assumptions=[
                            "The stock acquisition can qualify for a 338(h)(10) election and the relevant seller parties are willing to join in the election.",
                            "Allocation economics and old-target/new-target consequences have been modeled rather than assumed at a headline level.",
                        ],
                        missing_facts=[
                            "Exact seller profile and whether the target is held in a manner that permits a 338(h)(10) or similar joint election.",
                            "Whether the buyer values amortization and gain-shielding enough to support any seller gross-up tied to deemed-sale treatment.",
                            "How old-target and new-target consequences change attribute value, basis, and reporting after the acquisition date.",
                        ],
                        risk_texts=[
                            "This path weakens quickly if the election is not actually available, if seller consent is commercially unrealistic, or if basis-step-up value is not large enough to justify the seller-side tax cost and procedural burden.",
                        ],
                        coverage_map=coverage_map,
                    )
                )
            elif self._has_338g_signal(facts_text):
                alternatives.append(
                    self._build_alternative(
                        name="Stock acquisition with possible Section 338(g) election",
                        description=(
                            "This path starts from a qualified stock purchase and tests whether a unilateral section 338(g) election makes the stock deal economically superior to a straight stock path or a direct asset acquisition."
                        ),
                        buckets=["stock_sale", "deemed_asset_sale_election", "asset_sale", "attribute_preservation"],
                        consequence_texts=[
                            "This path is strongest when the buyer can complete a qualified stock purchase, expects meaningful basis-step-up value, and can absorb the deemed-sale consequences imposed on the old target without needing a joint seller election.",
                            "The central tradeoff is that a 338(g) path may improve buyer basis and future deductions, but it can impose substantial tax cost inside the target and requires the facts to fit the qualified-stock-purchase and timing framework with unusual precision.",
                        ],
                        assumptions=[
                            "The buyer will complete a qualified stock purchase and can satisfy the timing mechanics for the election.",
                            "The target-level tax cost from the deemed sale has been modeled alongside the buyer's expected basis benefit.",
                        ],
                        missing_facts=[
                            "Whether the acquisition actually qualifies as a qualified stock purchase under the statute and regulations.",
                            "Expected old-target tax cost and whether it is acceptable relative to the buyer's basis benefit.",
                            "How AGUB, ADSP, and post-acquisition basis consequences affect the buyer's expected value creation.",
                        ],
                        risk_texts=[
                            "This path weakens if the purchase fails qualified-stock-purchase status, if the target-level deemed-sale cost overwhelms the basis benefit, or if the allocation assumptions behind AGUB and ADSP are not supportable.",
                        ],
                        coverage_map=coverage_map,
                    )
                )
            else:
                alternatives.append(
                    self._build_alternative(
                        name="Stock acquisition with possible deemed asset election",
                        description=(
                            "This path starts from stock-form execution but tests whether a deemed asset election is actually available and economically superior to both a straight stock purchase and a direct asset acquisition."
                        ),
                        buckets=["stock_sale", "deemed_asset_sale_election", "attribute_preservation"],
                        consequence_texts=[
                            "This path is only serious if the ownership profile, seller identity, and election mechanics line up well enough to turn a nominal stock deal into asset-style tax results without relying on unsupported assumptions.",
                            "The main tax tradeoff is that buyer-side basis step-up and allocation upside must outweigh seller-side deemed-sale cost, election friction, and any uncertainty about whether the election is actually available in the first place.",
                        ],
                        assumptions=[
                            "A stock acquisition remains the legal baseline, and the election path is being evaluated as a real alternative rather than as a generic hope for asset-style tax results.",
                            "The parties are willing to model election mechanics, seller consent posture, and post-election basis consequences before treating the path as viable.",
                        ],
                        missing_facts=[
                            "Exact seller and target profile needed to determine whether a 338(h)(10), 338(g), or similar deemed asset election is genuinely available.",
                            "Whether the buyer's basis-step-up economics are strong enough to justify the seller-side tax cost or any gross-up negotiation.",
                            "How old-target/new-target or similar deemed-sale consequences would affect attribute value, reporting, and post-close economics.",
                        ],
                        risk_texts=[
                            "This path weakens quickly if the legal ownership profile does not support the election, if required consent is commercially unrealistic, or if basis-step-up value is too small to justify the seller-side tax cost and compliance burden.",
                        ],
                        coverage_map=coverage_map,
                    )
                )

        if "contribution_transactions" in coverage_map or "partnership_issues" in coverage_map:
            alternatives.append(
                self._build_alternative(
                    name="Contribution and partnership path",
                    description=(
                        "This path considers whether a contribution or partnership structure better aligns the parties' economics, basis planning, and liability allocation."
                    ),
                    buckets=["contribution_transactions", "partnership_issues", "debt_overlay"],
                    consequence_texts=[
                        "Contribution and partnership authorities should drive control, disguised sale, and liability allocation analysis.",
                        "Debt allocation may change economics and tax basis outcomes among the parties.",
                    ],
                    assumptions=[
                        "Relevant entities are treated as corporations or partnerships as expected.",
                        "Contribution timing and control mechanics are respected in the legal documents.",
                    ],
                    missing_facts=[
                        "Entity classification of all material blockers and intermediate entities.",
                        "Liability allocation and section 704(c) profile of contributed assets.",
                    ],
                    risk_texts=[
                        "Unsupported contribution or partnership claims should not be presented as settled conclusions.",
                    ],
                    coverage_map=coverage_map,
                )
            )

        return alternatives

    def _build_alternative(
        self,
        name: str,
        description: str,
        buckets: list[str],
        consequence_texts: list[str],
        assumptions: list[str],
        missing_facts: list[str],
        risk_texts: list[str],
        coverage_map: dict[str, BucketCoverage],
    ) -> StructuralAlternative:
        relevant_coverage = [coverage_map[bucket] for bucket in buckets if bucket in coverage_map]
        governing_authorities = self._flatten_authorities(relevant_coverage)[:6]
        unsupported_assertions: list[str] = []

        consequences = [
            self._supported_statement(text, relevant_coverage, unsupported_assertions)
            for text in consequence_texts
        ]
        risks = [
            self._supported_statement(text, relevant_coverage, unsupported_assertions)
            for text in risk_texts
        ]

        return StructuralAlternative(
            name=name,
            description=description,
            governing_authorities=governing_authorities,
            tax_consequences=consequences,
            assumptions=assumptions,
            missing_facts=missing_facts,
            risks_uncertainty=risks,
            unsupported_assertions=unsupported_assertions,
        )

    def _supported_statement(
        self,
        text: str,
        coverage_items: list[BucketCoverage],
        unsupported_assertions: list[str],
    ) -> SupportedStatement:
        citations = self._flatten_authorities(coverage_items)[:3]
        supported = len(citations) > 0 and all(
            self._is_strongly_supported(coverage) for coverage in coverage_items
        )
        note = None
        if not supported:
            if any(
                coverage.status == "covered" and coverage.source_priority_warning
                for coverage in coverage_items
            ):
                note = "Support is preliminary because one or more relevant buckets rely only on secondary or internal materials."
            else:
                note = "Support is incomplete because one or more relevant issue buckets did not retrieve authority."
            unsupported_assertions.append(text)

        return SupportedStatement(
            text=text,
            citations=citations,
            supported=supported,
            note=note,
        )

    def _draft_memo(
        self,
        facts: TransactionFacts,
        bucket_coverage: list[BucketCoverage],
        issues: list[TaxIssue],
        alternatives: list[StructuralAlternative],
    ) -> list[MemoSection]:
        supported_issues = [
            issue
            for issue in issues
            if issue.supported
            and not next(
                (
                    coverage.source_priority_warning
                    for coverage in bucket_coverage
                    if coverage.bucket == issue.bucket
                ),
                None,
            )
        ]
        unsupported_buckets = [
            item.label for item in bucket_coverage if item.status == "under_supported"
        ]
        weak_coverages = [
            item for item in bucket_coverage if item.status == "covered" and item.source_priority_warning
        ]
        supported_coverages = [
            item for item in bucket_coverage if self._is_strongly_supported(item)
        ]
        supported_citations = self._flatten_authorities(supported_coverages)
        memo: list[MemoSection] = [
            MemoSection(
                heading="Facts And Issue Framing",
                body=self._facts_section_text(facts, bucket_coverage),
                citations=supported_citations[:3],
                supported=True,
            ),
            MemoSection(
                heading="Grounded Issues",
                body=self._issue_summary_text(supported_issues),
                citations=supported_citations[:5],
                supported=bool(supported_citations),
                note=(
                    None
                    if supported_citations
                    else "No strongly supported issue sections are ready because the current fact pattern did not retrieve primary-authority support."
                ),
            ),
        ]

        for coverage in supported_coverages:
            lead = coverage.authorities[0] if coverage.authorities else None
            if not lead:
                continue
            memo.append(
                MemoSection(
                    heading=coverage.label,
                    body=self._memo_observation_body(coverage, facts, lead),
                    citations=coverage.authorities[:3],
                    supported=True,
                )
            )

        pending_files = self.authority_repository.pending_files()
        if pending_files:
            memo.append(
                MemoSection(
                    heading="Corpus Ingestion Gaps",
                    body=(
                        "Some corpus files were not ingested because PDF parsing is still pending. "
                        "Those files are excluded from retrieval until PDF extraction is implemented."
                    ),
                    citations=[],
                    supported=False,
                    note=", ".join(pending_files[:5]),
                )
            )

        for alternative in alternatives:
            memo.append(
                MemoSection(
                    heading=f"Alternative: {alternative.name}",
                    body=(
                        f"{alternative.description} "
                        f"Under the current facts, the central tradeoff is: {self._alternative_intro(alternative)} "
                        + (
                            "On the current record, this path can be used as a grounded first-pass comparison."
                            if not alternative.unsupported_assertions
                            else "Part of this comparison remains preliminary because at least one bucket tied to the path lacks strong support."
                        )
                    ),
                    citations=alternative.governing_authorities[:4],
                    supported=len(alternative.unsupported_assertions) == 0,
                    note=(
                        None
                        if not alternative.unsupported_assertions
                        else "One or more assertions remain preliminary because coverage is incomplete or not primary-authority supported."
                    ),
                )
            )

        preliminary_labels = unsupported_buckets + [item.label for item in weak_coverages]
        if preliminary_labels:
            memo.append(
                MemoSection(
                    heading="Preliminary Matters",
                    body=(
                        "The analysis remains preliminary for the following issue buckets because they either lack retrieved support or rely only on secondary/internal material: "
                        + ", ".join(preliminary_labels)
                        + ". Those areas are intentionally kept out of the supported observations above and should not drive final recommendations yet."
                    ),
                    citations=[],
                    supported=False,
                    note="Coverage validation failed for part of the classified transaction.",
                )
            )

        return memo

    def _missing_fact_questions(
        self, bucket_coverage: list[BucketCoverage], facts: TransactionFacts
    ) -> list[MissingFactQuestion]:
        questions: list[MissingFactQuestion] = [
            MissingFactQuestion(
                bucket="general",
                question="What is the exact legal step plan, including pre-closing and post-closing restructuring steps?",
                rationale="Classification and retrieval improve materially when the step plan is fixed.",
            ),
            MissingFactQuestion(
                bucket="general",
                question="What is the final consideration mix, including rollover equity, debt assumptions, earnout, and contingent payments?",
                rationale="Many transaction consequences are highly sensitive to consideration composition.",
            ),
        ]
        bucket_specific = {
            "attribute_preservation": (
                "What is the target's current NOL, credit, and built-in gain or loss profile, and have there been prior ownership shifts during the testing period?",
                "Attribute value cannot be assessed accurately without both the balance-sheet profile and the ownership-change history.",
            ),
            "deemed_asset_sale_election": (
                "Does the acquisition qualify for a section 338 election at all, and if so is the realistic path a 338(g), 338(h)(10), or 336(e) structure given the ownership profile, seller identity, and willingness to make the required elections?",
                "Election availability, old-target/new-target consequences, and party consent determine whether the deemed asset alternative is real rather than merely tax-efficient in theory.",
            ),
            "stock_sale": (
                "Is the buyer prioritizing stock-form execution and continuity of contracts, or is the buyer really paying for basis step-up and asset-level tax attributes?",
                "That priority often determines whether a stock path is truly preferred or only a placeholder before an election or asset alternative is tested.",
            ),
            "asset_sale": (
                "How large is the buyer's expected basis step-up benefit, and what seller tax cost, transfer-tax burden, or allocation dispute would the parties accept to get it?",
                "The recommendation can change quickly once the buyer's step-up value is compared directly with seller-side current tax cost and allocation friction.",
            ),
            "rollover_equity": (
                "What rights attach to the rollover instrument, including redemption, put/call, preferred return, downside protection, board rights, and liquidity arrangements?",
                "Rollover equity can support or undermine continuity-sensitive treatment depending on the exact economic and governance features.",
            ),
            "debt_overlay": (
                "Where will acquisition debt sit after closing, and will any debt terms be refinanced, amended, or replaced shortly after the transaction?",
                "Financing consequences depend on debt placement, interest-limitation posture, and whether refinancing steps create modification or exchange issues.",
            ),
            "partnership_issues": (
                "Which entities are classified as partnerships or disregarded entities, and what are the historic section 704(c) and liability allocation positions?",
                "Partnership analysis depends on entity classification and historic tax capital facts.",
            ),
            "withholding_overlay": (
                "Are any sellers, lenders, or payees foreign persons or otherwise subject to withholding certification requirements?",
                "Withholding conclusions can change immediately once payee status is known.",
            ),
            "state_overlay": (
                "Which states are materially connected to the assets, payroll, sales, and legal entities in the transaction?",
                "State transfer tax and apportionment outcomes depend on jurisdiction-specific facts.",
            ),
            "international_overlay": (
                "Are there controlled foreign corporations, foreign blockers, treaty positions, or outbound transfer elements in the structure?",
                "Cross-border consequences require more precise entity and jurisdiction mapping.",
            ),
        }

        for coverage in bucket_coverage:
            if coverage.bucket in bucket_specific:
                question, rationale = bucket_specific[coverage.bucket]
                questions.append(
                    MissingFactQuestion(
                        bucket=coverage.bucket,
                        question=question,
                        rationale=rationale,
                    )
                )

        if facts.summary.strip() == "":
            questions.append(
                MissingFactQuestion(
                    bucket="general",
                    question="Can you provide a narrative summary of the business objectives and signing/closing sequence?",
                    rationale="Free-text context improves bucket classification and authority retrieval.",
                )
            )

        return questions

    def _flatten_authorities(
        self, coverage_items: list[BucketCoverage]
    ) -> list[AuthorityRecord]:
        deduped: dict[str, AuthorityRecord] = {}
        for coverage in coverage_items:
            for authority in coverage.authorities:
                deduped[authority.authority_id] = authority
        return sorted(
            deduped.values(), key=lambda authority: authority.relevance_score, reverse=True
        )

    def _completeness_warning(
        self, under_supported_buckets: list[str], weakly_supported_buckets: list[str]
    ) -> str:
        if not under_supported_buckets and not weakly_supported_buckets:
            return "Coverage is complete for the currently classified issue buckets, but conclusions still require human tax review."
        if weakly_supported_buckets and not under_supported_buckets:
            return (
                "Coverage is mixed. Some buckets are only weakly supported: "
                + ", ".join(BUCKET_LABELS[bucket] for bucket in weakly_supported_buckets)
                + ". Strongly supported sections remain usable, but weakly supported buckets should stay preliminary."
            )
        return (
            "Coverage is incomplete. The following issue buckets are under-supported: "
            + ", ".join(BUCKET_LABELS[bucket] for bucket in under_supported_buckets)
            + ". Supported sections remain usable, but unsupported buckets should be treated as preliminary and kept out of final recommendations."
        )

    def _confidence_label(
        self,
        covered_buckets: list[str],
        under_supported_buckets: list[str],
        weakly_supported_buckets: list[str],
    ) -> str:
        if under_supported_buckets:
            return "low"
        if weakly_supported_buckets:
            return "low"
        if len(covered_buckets) >= 4:
            return "medium"
        return "low"
