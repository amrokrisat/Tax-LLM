from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, Field

SourceType = Literal[
    "code",
    "regs",
    "irs_guidance",
    "cases",
    "forms",
    "internal",
]

CoverageStatus = Literal["covered", "under_supported"]
DocumentSource = Literal["pasted", "uploaded"]
ExtractionStatus = Literal["not_requested", "pending", "completed", "needs_review"]
ExtractedFactStatus = Literal["pending", "confirmed", "rejected"]
ReviewStatus = Literal["unreviewed", "in_review", "reviewed"]
AuthorityStatus = Literal["canonical", "legacy", "superseded"]

# Phase 1 compatibility boundary:
# - bucket keys remain the canonical persisted/API identifiers
# - these bucket keys conceptually represent transactional-tax regimes
# - future frontend/product language may describe them as "regimes", but
#   saved runs, schemas, and retrieval interfaces remain bucket-shaped here
CANONICAL_BUCKET_IDS = [
    "stock_sale",
    "asset_sale",
    "deemed_asset_sale_election",
    "merger_reorganization",
    "rollover_equity",
    "contribution_transactions",
    "divisive_transactions",
    "partnership_issues",
    "attribute_preservation",
    "debt_overlay",
    "earnout_overlay",
    "withholding_overlay",
    "state_overlay",
    "international_overlay",
]


class ExtractedFact(BaseModel):
    fact_id: str
    label: str
    value: str
    source_document: str
    confidence: float = 0.0
    status: ExtractedFactStatus = "pending"


class UploadedDocument(BaseModel):
    file_name: str
    document_type: str
    content: str
    source: DocumentSource = "pasted"
    mime_type: str | None = None
    extraction_status: ExtractionStatus = "not_requested"
    extracted_text: str | None = None
    extracted_facts: List[ExtractedFact] = Field(default_factory=list)


class TransactionFacts(BaseModel):
    transaction_name: str
    summary: str
    entities: List[str] = Field(default_factory=list)
    jurisdictions: List[str] = Field(default_factory=list)
    transaction_type: str
    stated_goals: List[str] = Field(default_factory=list)
    constraints: List[str] = Field(default_factory=list)
    consideration_mix: str = ""
    proposed_steps: str = ""
    rollover_equity: bool = False
    deemed_asset_sale_election: bool = False
    contribution_transactions: bool = False
    divisive_transactions: bool = False
    partnership_issues: bool = False
    debt_financing: bool = False
    earnout: bool = False
    withholding: bool = False
    state_tax: bool = False
    international: bool = False


class TransactionBucket(BaseModel):
    bucket: str
    label: str
    reason: str


class RetrievalFilters(BaseModel):
    source_types: List[SourceType] = Field(default_factory=list)
    jurisdictions: List[str] = Field(default_factory=list)
    issue_buckets: List[str] = Field(default_factory=list)
    transaction_type: str | None = None
    priority_order: List[SourceType] = Field(default_factory=list)
    title_keywords: List[str] = Field(default_factory=list)
    citation_keywords: List[str] = Field(default_factory=list)
    effective_date_from: str | None = None
    effective_date_to: str | None = None


class AuthorityRecord(BaseModel):
    authority_id: str
    source_type: SourceType
    title: str
    citation: str
    excerpt: str
    full_text: str = ""
    issue_buckets: List[str] = Field(default_factory=list)
    transaction_type_tags: List[str] = Field(default_factory=list)
    structure_tags: List[str] = Field(default_factory=list)
    jurisdiction: str | None = None
    effective_date: str | None = None
    tax_year: str | None = None
    date_range: str | None = None
    procedural_or_substantive: Literal["procedural", "substantive", "mixed"] = "substantive"
    authority_weight: float = 1.0
    file_path: str
    source_url: str | None = None
    ingestion_timestamp: str | None = None
    primary_authority: bool = False
    secondary_authority: bool = False
    internal_only: bool = False
    status: AuthorityStatus = "canonical"
    supersedes: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    relevance_score: float = 0.0


class BucketCoverage(BaseModel):
    bucket: str
    label: str
    status: CoverageStatus
    authorities: List[AuthorityRecord] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)
    source_priority_warning: str | None = None


class TaxIssue(BaseModel):
    bucket: str
    name: str
    description: str
    severity: str
    supported: bool
    authorities: List[AuthorityRecord] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)


class SupportedStatement(BaseModel):
    text: str
    citations: List[AuthorityRecord] = Field(default_factory=list)
    supported: bool = True
    note: str | None = None


class StructuralAlternative(BaseModel):
    name: str
    description: str
    governing_authorities: List[AuthorityRecord] = Field(default_factory=list)
    tax_consequences: List[SupportedStatement] = Field(default_factory=list)
    assumptions: List[str] = Field(default_factory=list)
    missing_facts: List[str] = Field(default_factory=list)
    risks_uncertainty: List[SupportedStatement] = Field(default_factory=list)
    unsupported_assertions: List[str] = Field(default_factory=list)


class MemoSection(BaseModel):
    heading: str
    body: str
    citations: List[AuthorityRecord] = Field(default_factory=list)
    supported: bool = True
    note: str | None = None


class MissingFactQuestion(BaseModel):
    bucket: str
    question: str
    rationale: str


class AnalysisResult(BaseModel):
    facts: TransactionFacts
    parsed_documents: List[UploadedDocument] = Field(default_factory=list)
    classification: List[TransactionBucket] = Field(default_factory=list)
    authorities_reviewed: List[AuthorityRecord] = Field(default_factory=list)
    bucket_coverage: List[BucketCoverage] = Field(default_factory=list)
    covered_buckets: List[str] = Field(default_factory=list)
    under_supported_buckets: List[str] = Field(default_factory=list)
    issues: List[TaxIssue] = Field(default_factory=list)
    alternatives: List[StructuralAlternative] = Field(default_factory=list)
    memo_sections: List[MemoSection] = Field(default_factory=list)
    missing_facts: List[MissingFactQuestion] = Field(default_factory=list)
    completeness_warning: str
    confidence_label: Literal["high", "medium", "low"]
    retrieval_complete: bool


class AnalysisRun(BaseModel):
    run_id: str
    created_at: str
    facts: TransactionFacts
    uploaded_documents: List[UploadedDocument] = Field(default_factory=list)
    result: AnalysisResult
    review_status: ReviewStatus = "unreviewed"
    reviewed_at: str | None = None
    reviewed_by: str | None = None
    reviewer_notes: List[str] = Field(default_factory=list)
    pinned_authority_ids: List[str] = Field(default_factory=list)
    reviewed_sections: List[str] = Field(default_factory=list)


class MatterRecord(BaseModel):
    matter_id: str
    owner_user_id: str = ""
    matter_name: str
    transaction_type: str
    facts: TransactionFacts
    uploaded_documents: List[UploadedDocument] = Field(default_factory=list)
    latest_analysis: AnalysisResult | None = None
    analysis_runs: List[AnalysisRun] = Field(default_factory=list)
    created_at: str
    updated_at: str


class UserRecord(BaseModel):
    user_id: str
    email: str
    password_hash: str
    name: str
    created_at: str
    updated_at: str


class SessionRecord(BaseModel):
    session_token: str
    user_id: str
    created_at: str
