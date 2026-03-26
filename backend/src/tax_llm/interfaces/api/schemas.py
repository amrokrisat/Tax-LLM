from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field

from tax_llm.domain.models import AnalysisResult


class UploadedDocumentInput(BaseModel):
    file_name: str
    document_type: str
    content: str


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
