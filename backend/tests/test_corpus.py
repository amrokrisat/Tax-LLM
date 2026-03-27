from pathlib import Path
from types import SimpleNamespace

from tax_llm.domain.models import RetrievalFilters, TransactionFacts
from tax_llm.infrastructure.corpus import AuthorityCorpusLoader, corpus_root, rank_authority
from tax_llm.infrastructure.repositories import AuthorityCorpusRepository


def test_corpus_loader_reads_supported_files():
    result = AuthorityCorpusLoader(root_path=corpus_root()).load()

    assert len(result.authorities) >= 8
    assert any(authority.source_type == "code" for authority in result.authorities)
    assert any(path.endswith(".pdf") for path in result.pending_files)
    assert any(authority.source_url for authority in result.authorities)
    assert any(authority.primary_authority for authority in result.authorities)
    assert any(authority.transaction_type_tags for authority in result.authorities)
    assert any(authority.structure_tags for authority in result.authorities)
    assert any(authority.procedural_or_substantive in {"procedural", "substantive", "mixed"} for authority in result.authorities)


def test_repository_search_by_issue_bucket_prioritizes_code_and_regs():
    repository = AuthorityCorpusRepository(root_path=corpus_root())
    facts = TransactionFacts(
        transaction_name="Atlas",
        summary="Merger with rollover equity and debt financing.",
        entities=["Buyer", "Target"],
        jurisdictions=["United States"],
        transaction_type="merger",
        consideration_mix="Cash plus rollover equity",
        proposed_steps="Merger followed by debt refinancing",
        rollover_equity=True,
        debt_financing=True,
    )

    results = repository.search_by_issue_bucket(
        facts=facts,
        documents=[],
        issue_bucket="merger_reorganization",
    )

    assert results
    assert results[0].source_type in {"code", "regs"}
    assert any("merger_reorganization" in authority.issue_buckets for authority in results)


def test_repository_can_filter_by_source_type_and_keywords():
    repository = AuthorityCorpusRepository(root_path=corpus_root())
    facts = TransactionFacts(
        transaction_name="Asset Deal",
        summary="Asset acquisition with allocation sensitivity.",
        entities=["Buyer", "Target"],
        jurisdictions=["United States"],
        transaction_type="asset sale",
    )

    results = repository.search(
        facts=facts,
        documents=[],
        filters=RetrievalFilters(
            issue_buckets=["asset_sale"],
            source_types=["forms"],
            citation_keywords=["8594"],
        ),
        limit=3,
    )

    assert results
    assert all(authority.source_type == "forms" for authority in results)
    assert any("8594" in authority.citation for authority in results)


def test_repository_support_warning_flags_internal_only_support(tmp_path: Path):
    for folder in ["code", "regs", "irs_guidance", "cases", "forms", "internal"]:
        (tmp_path / folder).mkdir(parents=True, exist_ok=True)
    (tmp_path / "internal" / "memo.md").write_text(
        """---
title: Internal only memo
citation: Internal Memo
issue_buckets: [earnout_overlay]
jurisdiction: United States
authority_weight: 0.2
---
Internal observations on earnout mechanics.
""",
        encoding="utf-8",
    )

    repository = AuthorityCorpusRepository(root_path=tmp_path)
    facts = TransactionFacts(
        transaction_name="Earnout Deal",
        summary="Earnout-heavy acquisition.",
        entities=["Buyer", "Target"],
        jurisdictions=["United States"],
        transaction_type="stock sale",
        earnout=True,
    )
    results = repository.search_by_issue_bucket(
        facts=facts,
        documents=[],
        issue_bucket="earnout_overlay",
    )

    assert repository.support_warning(results) is not None


def test_corpus_loader_prefers_newer_duplicate_authority_versions(tmp_path: Path):
    (tmp_path / "code").mkdir(parents=True, exist_ok=True)
    old_version = """---
authority_id: code-338
title: Old Section 338
citation: IRC Section 338
issue_buckets: [deemed_asset_sale_election]
effective_date: 2024-01-01
authority_weight: 0.8
source_url: https://example.com/old
ingestion_timestamp: 2026-03-20T00:00:00+00:00
primary_authority: true
---
Old text.
"""
    new_version = """---
authority_id: code-338
title: New Section 338
citation: IRC Section 338
issue_buckets: [deemed_asset_sale_election]
effective_date: 2025-01-01
authority_weight: 1.0
source_url: https://example.com/new
ingestion_timestamp: 2026-03-26T00:00:00+00:00
primary_authority: true
---
New text.
"""
    (tmp_path / "code" / "old.md").write_text(old_version, encoding="utf-8")
    (tmp_path / "code" / "new.md").write_text(new_version, encoding="utf-8")

    result = AuthorityCorpusLoader(root_path=tmp_path).load()

    assert len(result.authorities) == 1
    authority = result.authorities[0]
    assert authority.title == "New Section 338"
    assert authority.source_url == "https://example.com/new"


def test_rule_level_338_and_368_entries_are_present():
    result = AuthorityCorpusLoader(root_path=corpus_root()).load()
    ids = {authority.authority_id for authority in result.authorities}

    assert "reg-1-338-1" in ids
    assert "reg-1-338-2" in ids
    assert "reg-1-338-5" in ids
    assert "reg-1-338h10-1" in ids
    assert "reg-1-368-1-continuity" in ids
    assert "reg-1-368-2-triangular" in ids
    assert "code-336e" in ids
    assert "reg-1-336-1" in ids
    assert "reg-1-336-2" in ids
    assert "code-355" in ids
    assert "reg-1-355-1" in ids


def test_338h10_facts_pull_specific_regulation_ahead_of_broad_section_338():
    repository = AuthorityCorpusRepository(root_path=corpus_root())
    facts = TransactionFacts(
        transaction_name="338(h)(10) Deal",
        summary="Buyer is considering a 338(h)(10) joint election and needs seller consent mechanics.",
        entities=["Buyer", "Target"],
        jurisdictions=["United States"],
        transaction_type="stock sale",
        proposed_steps="Buyer acquires stock and evaluates a 338(h)(10) election.",
        deemed_asset_sale_election=True,
    )

    results = repository.search_by_issue_bucket(
        facts=facts,
        documents=[],
        issue_bucket="deemed_asset_sale_election",
    )

    assert results
    assert results[0].authority_id == "reg-1-338h10-1"
    assert any(authority.authority_id == "code-338" for authority in results)


def test_triangular_merger_facts_pull_triangular_rules_ahead_of_general_continuity():
    repository = AuthorityCorpusRepository(root_path=corpus_root())
    facts = TransactionFacts(
        transaction_name="Triangular Merger",
        summary="Buyer is evaluating a reverse triangular merger with parent stock and merger-sub mechanics.",
        entities=["Buyer", "Target", "Merger Sub"],
        jurisdictions=["United States"],
        transaction_type="merger",
        consideration_mix="Parent stock plus cash",
        proposed_steps="Reverse triangular merger through merger sub.",
        rollover_equity=True,
    )

    results = repository.search_by_issue_bucket(
        facts=facts,
        documents=[],
        issue_bucket="merger_reorganization",
    )

    assert results
    assert results[0].authority_id == "reg-1-368-2-triangular"
    assert any(authority.authority_id == "reg-1-368-1-continuity" for authority in results)


def test_direct_asset_facts_prioritize_1060_framework_over_debt_modification():
    repository = AuthorityCorpusRepository(root_path=corpus_root())
    facts = TransactionFacts(
        transaction_name="Direct Asset Deal",
        summary="Buyer is considering a direct asset purchase and needs purchase price allocation, residual method, and basis step-up analysis.",
        entities=["Buyer", "Seller"],
        jurisdictions=["United States"],
        transaction_type="asset sale",
        consideration_mix="Cash",
        proposed_steps="Direct taxable asset acquisition with section 1060 allocation.",
    )

    results = repository.search_by_issue_bucket(
        facts=facts,
        documents=[],
        issue_bucket="asset_sale",
    )

    assert results
    assert results[0].authority_id in {"code-1060", "reg-1-1060-1", "form-8594"}
    assert "reg-1-1001-3" not in {authority.authority_id for authority in results[:2]}


def test_stock_sale_without_attribute_facts_does_not_lead_with_section_382():
    repository = AuthorityCorpusRepository(root_path=corpus_root())
    facts = TransactionFacts(
        transaction_name="Stock Form Deal",
        summary="Buyer is evaluating a stock acquisition because the seller prefers stock treatment and the parties want to preserve contracts and entity history.",
        entities=["Buyer", "Target"],
        jurisdictions=["United States"],
        transaction_type="stock sale",
        consideration_mix="Cash",
        proposed_steps="Single-step stock acquisition with possible election analysis later.",
    )

    results = repository.search_by_issue_bucket(
        facts=facts,
        documents=[],
        issue_bucket="stock_sale",
    )

    assert results
    assert results[0].authority_id != "code-382"


def test_336e_facts_pull_specific_336e_rules_ahead_of_338h10():
    repository = AuthorityCorpusRepository(root_path=corpus_root())
    facts = TransactionFacts(
        transaction_name="336e Deal",
        summary="Seller is evaluating whether a qualified stock disposition of an S corporation target can support a 336(e) election statement.",
        entities=["Buyer", "Target", "Seller"],
        jurisdictions=["United States"],
        transaction_type="stock sale",
        consideration_mix="Cash",
        proposed_steps="Seller disposes of target stock and evaluates a 336(e) election.",
        deemed_asset_sale_election=True,
    )

    results = repository.search_by_issue_bucket(
        facts=facts,
        documents=[],
        issue_bucket="deemed_asset_sale_election",
    )

    assert results
    assert results[0].authority_id in {"reg-1-336-1", "reg-1-336-2", "code-336e"}
    assert results[0].authority_id != "reg-1-338h10-1"


def test_rank_authority_tolerates_legacy_authority_objects_missing_new_metadata():
    legacy_authority = SimpleNamespace(
        authority_id="legacy-1060",
        source_type="code",
        title="IRC Section 1060",
        citation="IRC Section 1060",
        excerpt="Allocation rules for applicable asset acquisitions.",
        issue_buckets=["asset_sale"],
        authority_weight=1.0,
        tags=[],
    )

    score = rank_authority(
        authority=legacy_authority,
        priority_order=["code", "regs", "irs_guidance", "cases", "forms", "internal"],
        query_text="direct asset purchase basis step-up allocation residual method form 8594",
        issue_buckets=["asset_sale"],
        transaction_type="asset sale",
        title_keywords=["asset", "allocation"],
        citation_keywords=["1060", "8594"],
    )

    assert score > 0


def test_divisive_transaction_facts_pull_section_355_authorities():
    repository = AuthorityCorpusRepository(root_path=corpus_root())
    facts = TransactionFacts(
        transaction_name="SpinCo Separation",
        summary="Seller is evaluating a spin-off of a controlled corporation before a sale and needs section 355 device and active-trade-or-business analysis.",
        entities=["Parent", "Controlled Corporation"],
        jurisdictions=["United States"],
        transaction_type="divisive transaction",
        proposed_steps="Seller distributes controlled corporation stock in a spin-off before the transaction.",
        divisive_transactions=True,
    )

    results = repository.search_by_issue_bucket(
        facts=facts,
        documents=[],
        issue_bucket="divisive_transactions",
    )

    assert results
    assert results[0].authority_id in {"code-355", "reg-1-355-1"}
    assert any(authority.authority_id == "code-355" for authority in results)
