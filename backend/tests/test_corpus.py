from pathlib import Path

from tax_llm.domain.models import RetrievalFilters, TransactionFacts
from tax_llm.infrastructure.corpus import AuthorityCorpusLoader, corpus_root
from tax_llm.infrastructure.repositories import AuthorityCorpusRepository


def test_corpus_loader_reads_supported_files():
    result = AuthorityCorpusLoader(root_path=corpus_root()).load()

    assert len(result.authorities) >= 8
    assert any(authority.source_type == "code" for authority in result.authorities)
    assert any(path.endswith(".pdf") for path in result.pending_files)
    assert any(authority.source_url for authority in result.authorities)
    assert any(authority.primary_authority for authority in result.authorities)


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
