from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field

from tax_llm.domain.models import (
    AnalysisResult,
    AnalysisRun,
    ExtractedFact,
    MatterRecord,
    TransactionFacts,
    UploadedDocument,
)


class UploadedDocumentInput(BaseModel):
    file_name: str
    document_type: str
    content: str
    source: str = "pasted"
    mime_type: str | None = None
    extraction_status: str = "not_requested"
    extracted_text: str | None = None
    extracted_facts: List[ExtractedFact] = Field(default_factory=list)
    extraction_ambiguities: List[str] = Field(default_factory=list)


class TransactionFactsInput(BaseModel):
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


class AnalyzeTransactionRequest(BaseModel):
    facts: TransactionFactsInput
    uploaded_documents: List[UploadedDocumentInput] = Field(default_factory=list)


class AnalyzeTransactionResponse(BaseModel):
    result: AnalysisResult


class MatterInput(BaseModel):
    matter_name: str
    transaction_type: str
    facts: TransactionFactsInput
    uploaded_documents: List[UploadedDocumentInput] = Field(default_factory=list)


class MatterResponse(BaseModel):
    matter: MatterRecord


class AnalysisRunSummary(BaseModel):
    run_id: str
    created_at: str
    # Phase 1 compatibility boundary: the persisted/API summary remains bucket-shaped
    # even though product copy may conceptually refer to these as transaction regimes.
    issue_bucket_count: int
    authority_count: int
    review_status: str
    reviewed_at: str | None = None
    reviewed_by: str | None = None


class MatterWorkspace(BaseModel):
    matter_id: str
    matter_name: str
    transaction_type: str
    facts: TransactionFacts
    uploaded_documents: List[UploadedDocument] = Field(default_factory=list)
    analysis_runs: List[AnalysisRunSummary] = Field(default_factory=list)
    created_at: str
    updated_at: str


class MatterWorkspaceResponse(BaseModel):
    matter: MatterWorkspace


class MatterSummary(BaseModel):
    matter_id: str
    matter_name: str
    transaction_type: str
    summary: str
    analysis_run_count: int
    document_count: int
    created_at: str
    updated_at: str


class MatterListResponse(BaseModel):
    matters: List[MatterRecord]


class MatterSummaryListResponse(BaseModel):
    matters: List[MatterSummary]


class AnalysisRunResponse(BaseModel):
    run: AnalysisRun


class DocumentFactConfirmationInput(BaseModel):
    document_index: int
    fact_id: str
    status: str


class DocumentFactConfirmationRequest(BaseModel):
    confirmations: List[DocumentFactConfirmationInput] = Field(default_factory=list)


class RunReviewInput(BaseModel):
    review_status: str
    reviewed_by: str = ""
    note: str = ""
    pinned_authority_ids: List[str] = Field(default_factory=list)
    reviewed_sections: List[str] = Field(default_factory=list)


class ExportMemoResponse(BaseModel):
    format: str
    content: str


class AuthCredentialsInput(BaseModel):
    email: str
    password: str
    name: str = ""


class GoogleAuthInput(BaseModel):
    email: str
    name: str


class AuthUserResponse(BaseModel):
    user_id: str
    email: str
    name: str
    created_at: str
    updated_at: str


class AuthSessionResponse(BaseModel):
    session_token: str
    user: AuthUserResponse
