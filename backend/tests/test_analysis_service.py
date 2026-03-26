from tax_llm.application.services import AnalysisService
from tax_llm.domain.models import TransactionFacts, UploadedDocument
from tax_llm.infrastructure.document_parser import DemoDocumentParser
from tax_llm.infrastructure.repositories import AuthorityCorpusRepository


def build_service() -> AnalysisService:
    return AnalysisService(
        authority_repository=AuthorityCorpusRepository(),
        document_parser=DemoDocumentParser(),
    )


def test_retrieval_happens_before_analysis_outputs():
    service = build_service()
    result = service.analyze(
        facts=TransactionFacts(
            transaction_name="Project Atlas",
            summary="Buyer is considering a merger with rollover equity and refinancing.",
            entities=["Buyer", "Target"],
            jurisdictions=["United States"],
            transaction_type="merger",
            stated_goals=["Preserve attributes"],
            constraints=["Timing pressure"],
            consideration_mix="Cash and rollover equity",
            proposed_steps="Merger followed by refinancing",
            rollover_equity=True,
            debt_financing=True,
        ),
        uploaded_documents=[
            UploadedDocument(
                file_name="term-sheet.txt",
                document_type="term_sheet",
                content="The structure is a merger with rollover equity and post-close debt refinancing.",
            )
        ],
    )

    assert result.classification
    assert result.bucket_coverage
    assert result.authorities_reviewed
    assert all(issue.authorities or not issue.supported for issue in result.issues)


def test_fact_sensitivity_changes_bucket_mix():
    service = build_service()

    merger_result = service.analyze(
        facts=TransactionFacts(
            transaction_name="Deal One",
            summary="Merger with rollover equity.",
            entities=["Buyer", "Target"],
            jurisdictions=["United States"],
            transaction_type="merger",
            consideration_mix="Cash and rollover equity",
            proposed_steps="Merger",
            rollover_equity=True,
        ),
        uploaded_documents=[],
    )
    asset_result = service.analyze(
        facts=TransactionFacts(
            transaction_name="Deal Two",
            summary="Taxable asset acquisition with transfer tax concerns.",
            entities=["Buyer", "Target"],
            jurisdictions=["United States"],
            transaction_type="asset acquisition",
            consideration_mix="Cash",
            proposed_steps="Asset purchase",
            state_tax=True,
        ),
        uploaded_documents=[],
    )

    merger_buckets = {bucket.bucket for bucket in merger_result.classification}
    asset_buckets = {bucket.bucket for bucket in asset_result.classification}
    assert "merger_reorganization" in merger_buckets
    assert "asset_sale" in asset_buckets
    assert merger_buckets != asset_buckets


def test_rollover_equity_changes_retrieved_authority_set():
    service = build_service()

    without_rollover = service.analyze(
        facts=TransactionFacts(
            transaction_name="No Rollover",
            summary="Buyer proposes a cash stock purchase.",
            entities=["Buyer", "Target"],
            jurisdictions=["United States"],
            transaction_type="stock sale",
            consideration_mix="Cash only",
            proposed_steps="Single-step stock purchase",
            rollover_equity=False,
        ),
        uploaded_documents=[],
    )
    with_rollover = service.analyze(
        facts=TransactionFacts(
            transaction_name="With Rollover",
            summary="Buyer proposes a stock purchase with seller rollover equity.",
            entities=["Buyer", "Target"],
            jurisdictions=["United States"],
            transaction_type="stock sale",
            consideration_mix="Cash plus rollover equity",
            proposed_steps="Stock purchase with continuing seller equity",
            rollover_equity=True,
        ),
        uploaded_documents=[],
    )

    without_ids = {authority.authority_id for authority in without_rollover.authorities_reviewed}
    with_ids = {authority.authority_id for authority in with_rollover.authorities_reviewed}

    assert "rollover_equity" not in {
        bucket.bucket for bucket in without_rollover.classification
    }
    assert "rollover_equity" in {bucket.bucket for bucket in with_rollover.classification}
    assert with_ids != without_ids
    assert any(
        authority_id in with_ids
        for authority_id in {"code-368", "reg-1-368", "memo-rollover-2025-07"}
    )


def test_rollover_governance_terms_pull_more_sensitive_authorities():
    service = build_service()
    result = service.analyze(
        facts=TransactionFacts(
            transaction_name="Governance Deal",
            summary="Merger with seller rollover equity that includes preferred terms, redemption rights, and downside protection.",
            entities=["Buyer", "Target"],
            jurisdictions=["United States"],
            transaction_type="merger",
            consideration_mix="Cash plus rollover equity",
            proposed_steps="Forward merger using merger sub",
            rollover_equity=True,
        ),
        uploaded_documents=[
            UploadedDocument(
                file_name="rollover-term-sheet.txt",
                document_type="term_sheet",
                content="Rollover equity includes redemption protection, preferred economics, and governance rights.",
            )
        ],
    )

    rollover_bucket = next(
        coverage for coverage in result.bucket_coverage if coverage.bucket == "rollover_equity"
    )
    rollover_ids = {authority.authority_id for authority in rollover_bucket.authorities}
    assert "case-letulle" in rollover_ids or "reg-1-368-2k" in rollover_ids


def test_nol_facts_change_attribute_preservation_analysis():
    service = build_service()

    baseline = service.analyze(
        facts=TransactionFacts(
            transaction_name="Baseline Deal",
            summary="Buyer proposes a stock acquisition of a domestic target.",
            entities=["Buyer", "Target"],
            jurisdictions=["United States"],
            transaction_type="stock sale",
            consideration_mix="Cash only",
            proposed_steps="Stock purchase",
        ),
        uploaded_documents=[],
    )
    with_nols = service.analyze(
        facts=TransactionFacts(
            transaction_name="Attribute Deal",
            summary="Buyer proposes a stock acquisition of a domestic target with significant NOLs and historic ownership shifts.",
            entities=["Buyer", "Target"],
            jurisdictions=["United States"],
            transaction_type="stock sale",
            consideration_mix="Cash only",
            proposed_steps="Stock purchase",
            stated_goals=["Preserve NOLs if possible"],
        ),
        uploaded_documents=[],
    )

    baseline_ids = {authority.authority_id for authority in baseline.authorities_reviewed}
    nol_ids = {authority.authority_id for authority in with_nols.authorities_reviewed}

    assert "code-382" in nol_ids
    assert nol_ids != baseline_ids or any(
        authority.authority_id == "code-382" and authority.relevance_score > 0
        for authority in with_nols.authorities_reviewed
    )
    assert any("attribute" in issue.name.lower() or "nol" in issue.description.lower() for issue in with_nols.issues)


def test_attribute_analysis_expands_with_credits_and_built_in_gain_facts():
    service = build_service()
    result = service.analyze(
        facts=TransactionFacts(
            transaction_name="Attribute Nuance Deal",
            summary="Stock acquisition of a target with NOLs, tax credit carryforwards, and built-in gain exposure.",
            entities=["Buyer", "Target"],
            jurisdictions=["United States"],
            transaction_type="stock sale",
            consideration_mix="Cash",
            proposed_steps="Stock purchase followed by selected asset dispositions",
            stated_goals=["Preserve NOLs and credits where possible"],
        ),
        uploaded_documents=[],
    )

    attribute_bucket = next(
        coverage for coverage in result.bucket_coverage if coverage.bucket == "attribute_preservation"
    )
    attribute_ids = {authority.authority_id for authority in attribute_bucket.authorities}
    assert "code-382" in attribute_ids
    assert "code-383" in attribute_ids or "code-384" in attribute_ids


def test_section_382_is_not_overranked_without_attribute_facts():
    service = build_service()
    result = service.analyze(
        facts=TransactionFacts(
            transaction_name="Plain Debt Deal",
            summary="Buyer is considering a merger with post-closing refinancing but no identified tax attributes.",
            entities=["Buyer", "Target"],
            jurisdictions=["United States"],
            transaction_type="merger",
            consideration_mix="Cash only",
            proposed_steps="Merger followed by debt refinancing",
            debt_financing=True,
        ),
        uploaded_documents=[],
    )

    debt_bucket = next(coverage for coverage in result.bucket_coverage if coverage.bucket == "debt_overlay")
    debt_ids = [authority.authority_id for authority in debt_bucket.authorities]
    assert debt_ids
    assert debt_ids[0] in {"code-163j", "notice-2018-28", "code-1274-483"}
    assert "code-382" not in debt_ids[:2]


def test_debt_refinancing_and_earnout_change_overlay_buckets():
    service = build_service()

    base = service.analyze(
        facts=TransactionFacts(
            transaction_name="Base Deal",
            summary="Buyer proposes a stock acquisition.",
            entities=["Buyer", "Target"],
            jurisdictions=["United States"],
            transaction_type="stock sale",
            consideration_mix="Cash",
            proposed_steps="Stock purchase",
        ),
        uploaded_documents=[],
    )
    overlay = service.analyze(
        facts=TransactionFacts(
            transaction_name="Overlay Deal",
            summary="Buyer proposes a stock acquisition with post-closing refinancing and contingent earnout payments.",
            entities=["Buyer", "Target"],
            jurisdictions=["United States"],
            transaction_type="stock sale",
            consideration_mix="Cash plus earnout",
            proposed_steps="Stock purchase followed by debt refinancing",
            debt_financing=True,
            earnout=True,
        ),
        uploaded_documents=[],
    )

    base_buckets = {bucket.bucket for bucket in base.classification}
    overlay_buckets = {bucket.bucket for bucket in overlay.classification}

    assert "debt_overlay" not in base_buckets
    assert "earnout_overlay" not in base_buckets
    assert "debt_overlay" in overlay_buckets
    assert "earnout_overlay" in overlay_buckets


def test_debt_overlay_retrieval_is_financing_driven():
    service = build_service()
    result = service.analyze(
        facts=TransactionFacts(
            transaction_name="Leveraged Deal",
            summary="Buyer proposes acquisition debt and immediate refinancing.",
            entities=["Buyer", "Target"],
            jurisdictions=["United States"],
            transaction_type="stock sale",
            consideration_mix="Cash funded with acquisition debt",
            proposed_steps="Stock purchase followed by refinancing",
            debt_financing=True,
        ),
        uploaded_documents=[],
    )

    debt_bucket = next(coverage for coverage in result.bucket_coverage if coverage.bucket == "debt_overlay")
    assert debt_bucket.authorities
    assert any(
        authority.authority_id in {"code-163j", "notice-2018-28"}
        for authority in debt_bucket.authorities
    )
    debt_ids = [authority.authority_id for authority in debt_bucket.authorities]
    assert "reg-1-707-3" not in debt_ids
    assert "code-1274-483" not in debt_ids


def test_refinancing_terms_pull_deeper_financing_authorities():
    service = build_service()
    result = service.analyze(
        facts=TransactionFacts(
            transaction_name="Refinancing Deal",
            summary="Buyer plans a stock acquisition funded with subordinated acquisition debt and a near-term refinancing.",
            entities=["Buyer", "Target"],
            jurisdictions=["United States"],
            transaction_type="stock sale",
            consideration_mix="Cash funded with subordinated debt",
            proposed_steps="Stock purchase followed by refinancing and amendment of debt terms",
            debt_financing=True,
        ),
        uploaded_documents=[
            UploadedDocument(
                file_name="financing.txt",
                document_type="financing",
                content="The parties expect a post-closing refinancing and possible significant modification of the acquisition debt.",
            )
        ],
    )

    debt_bucket = next(coverage for coverage in result.bucket_coverage if coverage.bucket == "debt_overlay")
    debt_ids = {authority.authority_id for authority in debt_bucket.authorities}
    assert "reg-1-1001-3" in debt_ids or "code-279" in debt_ids


def test_thin_support_remains_visibly_preliminary():
    service = build_service()
    result = service.analyze(
        facts=TransactionFacts(
            transaction_name="Deal Three",
            summary="Asset acquisition with state transfer tax concerns and limited state-specific support.",
            entities=["US Buyer", "Domestic Seller"],
            jurisdictions=["United States"],
            transaction_type="asset sale",
            consideration_mix="Cash",
            proposed_steps="Asset purchase",
            state_tax=True,
        ),
        uploaded_documents=[],
    )

    state_bucket = next(coverage for coverage in result.bucket_coverage if coverage.bucket == "state_overlay")
    assert state_bucket.source_priority_warning is not None
    assert any("state" in note.lower() or "primary authority" in note.lower() for note in state_bucket.notes)
    assert any(section.note for section in result.memo_sections if not section.supported)


def test_internal_or_secondary_only_support_is_flagged():
    service = build_service()
    result = service.analyze(
        facts=TransactionFacts(
            transaction_name="State Deal",
            summary="Asset acquisition with state transfer tax concerns.",
            entities=["Buyer", "Target"],
            jurisdictions=["United States"],
            transaction_type="asset sale",
            state_tax=True,
        ),
        uploaded_documents=[],
    )

    state_bucket = next(
        coverage for coverage in result.bucket_coverage if coverage.bucket == "state_overlay"
    )
    state_issue = next(issue for issue in result.issues if issue.bucket == "state_overlay")
    assert state_bucket.source_priority_warning is not None
    assert not state_issue.supported
    assert "preliminary" in state_issue.description.lower()
    assert all(
        section.heading != "Supported Observation: State and local overlay"
        for section in result.memo_sections
    )


def test_memo_sections_change_meaningfully_when_facts_change():
    service = build_service()
    merger_result = service.analyze(
        facts=TransactionFacts(
            transaction_name="Merger Memo",
            summary="Buyer is considering a merger with rollover equity.",
            entities=["Buyer", "Target", "Merger Sub"],
            jurisdictions=["United States"],
            transaction_type="merger",
            consideration_mix="Cash plus rollover equity",
            proposed_steps="Merger",
            rollover_equity=True,
        ),
        uploaded_documents=[],
    )
    asset_result = service.analyze(
        facts=TransactionFacts(
            transaction_name="Asset Memo",
            summary="Buyer is considering an asset acquisition with basis step-up and allocation sensitivity.",
            entities=["Buyer", "Target"],
            jurisdictions=["United States"],
            transaction_type="asset sale",
            consideration_mix="Cash",
            proposed_steps="Asset purchase",
            state_tax=True,
        ),
        uploaded_documents=[],
    )

    merger_bodies = [section.body for section in merger_result.memo_sections]
    asset_bodies = [section.body for section in asset_result.memo_sections]
    assert merger_bodies != asset_bodies
    assert any("rollover" in body.lower() or "merger" in body.lower() for body in merger_bodies)
    assert any("asset" in body.lower() or "allocation" in body.lower() for body in asset_bodies)


def test_memo_avoids_repetitive_support_formulas_and_uses_live_facts():
    service = build_service()
    result = service.analyze(
        facts=TransactionFacts(
            transaction_name="Project Atlas",
            summary="Buyer is considering a merger with cash, rollover equity, target NOLs, and post-closing refinancing.",
            entities=["Buyer", "Target", "Merger Sub"],
            jurisdictions=["United States"],
            transaction_type="merger",
            consideration_mix="Cash and rollover equity",
            proposed_steps="Merger followed by post-closing refinancing",
            stated_goals=["Preserve valuable tax attributes"],
            rollover_equity=True,
            debt_financing=True,
        ),
        uploaded_documents=[],
    )

    memo_text = " ".join(section.body for section in result.memo_sections).lower()
    assert "this bucket is being treated as supported because" not in memo_text
    assert "cash and rollover equity" in memo_text
    assert "post-closing refinancing" in memo_text or "refinancing" in memo_text
    assert "stronger" in memo_text or "weaker" in memo_text
    assert "current fact pattern:" not in memo_text


def test_stock_vs_asset_wedge_produces_more_decision_useful_tradeoffs():
    service = build_service()
    result = service.analyze(
        facts=TransactionFacts(
            transaction_name="Stock Versus Asset",
            summary="Buyer is evaluating whether to acquire stock, negotiate a deemed asset election, or move into a direct asset purchase.",
            entities=["Buyer", "Target"],
            jurisdictions=["United States"],
            transaction_type="stock sale",
            consideration_mix="Cash",
            proposed_steps="Buyer acquires target stock and is evaluating section 338 alternatives.",
            deemed_asset_sale_election=True,
            state_tax=True,
        ),
        uploaded_documents=[],
    )

    memo_text = " ".join(section.body for section in result.memo_sections).lower()
    alternative_names = [alternative.name for alternative in result.alternatives]

    assert "taxable stock acquisition path" in [name.lower() for name in alternative_names]
    assert "taxable asset or deemed asset path" in [name.lower() for name in alternative_names]
    assert "basis step-up" in memo_text or "basis step up" in memo_text
    assert "seller tax cost" in memo_text or "immediate tax cost" in memo_text
    assert "deemed asset" in memo_text


def test_stock_and_deemed_asset_buckets_have_more_specific_memo_language():
    service = build_service()
    result = service.analyze(
        facts=TransactionFacts(
            transaction_name="Section 338 Memo",
            summary="Buyer is considering a qualified stock purchase with a possible 338(h)(10) election to secure asset-style tax consequences.",
            entities=["Buyer", "Target"],
            jurisdictions=["United States"],
            transaction_type="stock sale",
            consideration_mix="Cash",
            proposed_steps="Buyer acquires stock and models a 338(h)(10) election.",
            deemed_asset_sale_election=True,
        ),
        uploaded_documents=[],
    )

    stock_section = next(section for section in result.memo_sections if section.heading == "Stock sale")
    deemed_section = next(
        section for section in result.memo_sections if section.heading == "Deemed asset sale elections"
    )
    assert "carryover tax posture" in stock_section.body.lower() or "carryover basis" in stock_section.body.lower()
    assert "qualified stock purchase" in deemed_section.body.lower() or "seller would accept the deemed sale cost" in deemed_section.body.lower()


def test_stock_vs_asset_classification_and_missing_facts_are_more_decision_useful():
    service = build_service()
    result = service.analyze(
        facts=TransactionFacts(
            transaction_name="Structure Gating",
            summary="Buyer is comparing a stock acquisition against an asset purchase and may ask for a 338(h)(10) election if the basis step-up economics justify it.",
            entities=["Buyer", "Target"],
            jurisdictions=["United States"],
            transaction_type="stock sale",
            consideration_mix="Cash",
            proposed_steps="Buyer acquires stock unless basis step-up value supports an election path.",
            deemed_asset_sale_election=True,
        ),
        uploaded_documents=[],
    )

    classified = {bucket.bucket: bucket.reason.lower() for bucket in result.classification}
    missing_fact_text = " ".join(question.question for question in result.missing_facts).lower()
    facts_section = next(section for section in result.memo_sections if section.heading == "Facts And Issue Framing")

    assert "stock_sale" in classified
    assert "asset_sale" in classified
    assert "deemed_asset_sale_election" in classified
    assert "preserve stock form" in classified["stock_sale"] or "inherited target-level tax history" in classified["stock_sale"]
    assert "asset-style consequences" in classified["asset_sale"] or "basis step-up" in classified["asset_sale"]
    assert "nominal stock deal" in classified["deemed_asset_sale_election"] or "asset-style tax results" in classified["deemed_asset_sale_election"]
    assert "338(h)(10)" in missing_fact_text or "336(e)" in missing_fact_text
    assert "basis step-up" in missing_fact_text
    assert "stock-form deal with a possible deemed asset election" in facts_section.body.lower()


def test_unsupported_buckets_trigger_visible_warnings():
    service = build_service()
    result = service.analyze(
        facts=TransactionFacts(
            transaction_name="Warning Deal",
            summary="Asset acquisition with state tax issues and no state-specific primary authority.",
            entities=["Buyer", "Seller"],
            jurisdictions=["United States"],
            transaction_type="asset sale",
            consideration_mix="Cash",
            proposed_steps="Asset purchase",
            state_tax=True,
        ),
        uploaded_documents=[],
    )

    thin_coverages = [
        coverage
        for coverage in result.bucket_coverage
        if coverage.source_priority_warning is not None or coverage.status == "under_supported"
    ]
    assert thin_coverages
    assert any(coverage.notes for coverage in thin_coverages)
    assert any(not section.supported for section in result.memo_sections)
    assert any(coverage.source_priority_warning for coverage in thin_coverages)
