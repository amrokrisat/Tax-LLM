export type UploadedDocumentInput = {
  file_name: string;
  document_type: string;
  content: string;
  source?: "pasted" | "uploaded";
  mime_type?: string | null;
  extraction_status?: "not_requested" | "pending" | "completed" | "needs_review";
  extracted_text?: string | null;
  extracted_facts?: ExtractedFact[];
};

export type ExtractedFact = {
  fact_id: string;
  label: string;
  value: string;
  source_document: string;
  confidence: number;
  status: "pending" | "confirmed" | "rejected";
};

export type TransactionFactsInput = {
  transaction_name: string;
  summary: string;
  entities: string[];
  jurisdictions: string[];
  transaction_type: string;
  stated_goals: string[];
  constraints: string[];
  consideration_mix: string;
  proposed_steps: string;
  rollover_equity: boolean;
  deemed_asset_sale_election: boolean;
  contribution_transactions: boolean;
  divisive_transactions: boolean;
  partnership_issues: boolean;
  debt_financing: boolean;
  earnout: boolean;
  withholding: boolean;
  state_tax: boolean;
  international: boolean;
};

export type AnalyzeTransactionRequest = {
  facts: TransactionFactsInput;
  uploaded_documents: UploadedDocumentInput[];
};

export type AuthorityRecord = {
  authority_id: string;
  source_type:
    | "code"
    | "regs"
    | "irs_guidance"
    | "cases"
    | "forms"
    | "internal";
  title: string;
  citation: string;
  excerpt: string;
  effective_date: string | null;
  tax_year?: string | null;
  date_range?: string | null;
  authority_weight?: number;
  file_path: string;
  jurisdiction: string | null;
  issue_buckets: string[];
  transaction_type_tags?: string[];
  structure_tags?: string[];
  procedural_or_substantive?: "procedural" | "substantive" | "mixed";
  source_url?: string | null;
  ingestion_timestamp?: string | null;
  primary_authority?: boolean;
  secondary_authority?: boolean;
  internal_only?: boolean;
  tags: string[];
  relevance_score: number;
};

export type TransactionBucket = {
  bucket: string;
  label: string;
  reason: string;
};

export type BucketCoverage = {
  bucket: string;
  label: string;
  status: "covered" | "under_supported";
  authorities: AuthorityRecord[];
  notes: string[];
  source_priority_warning?: string | null;
};

export type TaxIssue = {
  bucket: string;
  name: string;
  description: string;
  severity: string;
  supported: boolean;
  authorities: AuthorityRecord[];
  notes: string[];
};

export type SupportedStatement = {
  text: string;
  citations: AuthorityRecord[];
  supported: boolean;
  note?: string | null;
};

export type StructuralAlternative = {
  name: string;
  description: string;
  governing_authorities: AuthorityRecord[];
  tax_consequences: SupportedStatement[];
  assumptions: string[];
  missing_facts: string[];
  risks_uncertainty: SupportedStatement[];
  unsupported_assertions: string[];
};

export type MemoSection = {
  heading: string;
  body: string;
  citations: AuthorityRecord[];
  supported: boolean;
  note?: string | null;
};

export type MissingFactQuestion = {
  bucket: string;
  question: string;
  rationale: string;
};

export type AnalysisResult = {
  facts: TransactionFactsInput;
  parsed_documents: UploadedDocumentInput[];
  classification: TransactionBucket[];
  authorities_reviewed: AuthorityRecord[];
  bucket_coverage: BucketCoverage[];
  covered_buckets: string[];
  under_supported_buckets: string[];
  issues: TaxIssue[];
  alternatives: StructuralAlternative[];
  memo_sections: MemoSection[];
  missing_facts: MissingFactQuestion[];
  completeness_warning: string;
  confidence_label: "high" | "medium" | "low";
  retrieval_complete: boolean;
};

export type AnalysisRun = {
  run_id: string;
  created_at: string;
  facts: TransactionFactsInput;
  uploaded_documents: UploadedDocumentInput[];
  result: AnalysisResult;
  review_status: "unreviewed" | "in_review" | "reviewed";
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  reviewer_notes: string[];
  pinned_authority_ids: string[];
  reviewed_sections: string[];
};

export type AnalysisRunSummary = {
  run_id: string;
  created_at: string;
  issue_bucket_count: number;
  authority_count: number;
  review_status: "unreviewed" | "in_review" | "reviewed";
  reviewed_at?: string | null;
  reviewed_by?: string | null;
};

export type MatterRecord = {
  matter_id: string;
  matter_name: string;
  transaction_type: string;
  facts: TransactionFactsInput;
  uploaded_documents: UploadedDocumentInput[];
  latest_analysis: AnalysisResult | null;
  analysis_runs: AnalysisRun[];
  created_at: string;
  updated_at: string;
};

export type MatterWorkspaceRecord = {
  matter_id: string;
  matter_name: string;
  transaction_type: string;
  facts: TransactionFactsInput;
  uploaded_documents: UploadedDocumentInput[];
  analysis_runs: AnalysisRunSummary[];
  created_at: string;
  updated_at: string;
};

export type MatterSummary = {
  matter_id: string;
  matter_name: string;
  transaction_type: string;
  summary: string;
  analysis_run_count: number;
  document_count: number;
  created_at: string;
  updated_at: string;
};

export type MatterInput = {
  matter_name: string;
  transaction_type: string;
  facts: TransactionFactsInput;
  uploaded_documents: UploadedDocumentInput[];
};

export type DocumentFactConfirmation = {
  document_index: number;
  fact_id: string;
  status: "pending" | "confirmed" | "rejected";
};

export type RunReviewInput = {
  review_status: "unreviewed" | "in_review" | "reviewed";
  reviewed_by?: string;
  note?: string;
  pinned_authority_ids?: string[];
  reviewed_sections?: string[];
};

export type UserRecord = {
  user_id: string;
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type AuthPayload = {
  email: string;
  password: string;
  name?: string;
};

export async function getDemoScenario(): Promise<AnalyzeTransactionRequest> {
  const response = await fetch(`/api/demo/scenario`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Failed to load demo scenario.");
  }

  return response.json();
}

export async function analyzeTransaction(
  payload: AnalyzeTransactionRequest,
): Promise<AnalysisResult> {
  const response = await fetch(`/api/intake/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("The backend could not complete the analysis.");
  }

  const data = (await response.json()) as { result: AnalysisResult };
  return data.result;
}

async function parseMatterResponse(response: Response): Promise<MatterRecord> {
  if (!response.ok) {
    const clone = response.clone();
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    const fallbackText = await clone
      .text()
      .catch(() => "");
    throw new Error((payload?.detail ?? fallbackText) || "The matter request could not be completed.");
  }

  const data = (await response.json()) as { matter: MatterRecord };
  return data.matter;
}

async function parseMatterWorkspaceResponse(response: Response): Promise<MatterWorkspaceRecord> {
  if (!response.ok) {
    const clone = response.clone();
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    const fallbackText = await clone.text().catch(() => "");
    throw new Error((payload?.detail ?? fallbackText) || "The matter request could not be completed.");
  }

  const data = (await response.json()) as { matter: MatterWorkspaceRecord };
  return data.matter;
}

async function parseRunResponse(response: Response): Promise<AnalysisRun> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? "The analysis run could not be loaded.");
  }

  const data = (await response.json()) as { run: AnalysisRun };
  return data.run;
}

async function parseUserResponse(response: Response): Promise<UserRecord> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? "Authentication request failed.");
  }

  const data = (await response.json()) as { user: UserRecord };
  return data.user;
}

export async function signUp(payload: AuthPayload): Promise<UserRecord> {
  const response = await fetch("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseUserResponse(response);
}

export async function signIn(payload: AuthPayload): Promise<UserRecord> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseUserResponse(response);
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function currentUser(): Promise<UserRecord | null> {
  const response = await fetch("/api/auth/me", { cache: "no-store" });
  if (response.status === 401) {
    return null;
  }
  return parseUserResponse(response);
}

export async function listMatters(): Promise<MatterRecord[]> {
  const response = await fetch("/api/matters", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load matters.");
  }
  const data = (await response.json()) as { matters: MatterRecord[] };
  return data.matters;
}

export async function listMatterSummaries(): Promise<MatterSummary[]> {
  const response = await fetch("/api/matters?view=summary", { cache: "no-store" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? "Failed to load matters.");
  }
  const data = (await response.json()) as { matters: MatterSummary[] };
  return data.matters;
}

export async function createMatter(payload: MatterInput): Promise<MatterRecord> {
  const response = await fetch("/api/matters", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseMatterResponse(response);
}

export async function getMatter(matterId: string): Promise<MatterRecord> {
  const response = await fetch(`/api/matters/${matterId}`, { cache: "no-store" });
  return parseMatterResponse(response);
}

export async function getMatterWorkspace(matterId: string): Promise<MatterWorkspaceRecord> {
  const response = await fetch(`/api/matters/${matterId}?view=workspace_summary`, {
    cache: "no-store",
  });
  return parseMatterWorkspaceResponse(response);
}

export async function getMatterRun(matterId: string, runId: string): Promise<AnalysisRun> {
  const response = await fetch(`/api/matters/${matterId}/runs/${runId}`, {
    cache: "no-store",
  });
  return parseRunResponse(response);
}

export async function updateMatter(
  matterId: string,
  payload: MatterInput,
): Promise<MatterRecord> {
  const response = await fetch(`/api/matters/${matterId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseMatterResponse(response);
}

export async function analyzeMatter(
  matterId: string,
  payload: MatterInput,
): Promise<MatterRecord> {
  const response = await fetch(`/api/matters/${matterId}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return parseMatterResponse(response);
}

export async function extractMatterDocuments(matterId: string): Promise<MatterRecord> {
  const response = await fetch(`/api/matters/${matterId}/documents/extract`, {
    method: "POST",
  });
  return parseMatterResponse(response);
}

export async function confirmExtractedFacts(
  matterId: string,
  confirmations: DocumentFactConfirmation[],
): Promise<MatterRecord> {
  const response = await fetch(`/api/matters/${matterId}/documents/confirm-facts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmations }),
  });
  return parseMatterResponse(response);
}

export async function reviewRun(
  matterId: string,
  runId: string,
  payload: RunReviewInput,
): Promise<MatterRecord> {
  const response = await fetch(`/api/matters/${matterId}/runs/${runId}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseMatterResponse(response);
}

export async function exportRunMarkdown(matterId: string, runId: string): Promise<string> {
  const response = await fetch(`/api/matters/${matterId}/runs/${runId}/export`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error("The report could not be exported.");
  }
  const data = (await response.json()) as { format: string; content: string };
  return data.content;
}

export const emptyRequest: AnalyzeTransactionRequest = {
  facts: {
    transaction_name: "",
    summary: "",
    entities: [],
    jurisdictions: ["United States"],
    transaction_type: "stock sale",
    stated_goals: [],
    constraints: [],
    consideration_mix: "",
    proposed_steps: "",
    rollover_equity: false,
    deemed_asset_sale_election: false,
    contribution_transactions: false,
    divisive_transactions: false,
    partnership_issues: false,
    debt_financing: false,
    earnout: false,
    withholding: false,
    state_tax: false,
    international: false,
  },
  uploaded_documents: [
    {
      file_name: "transaction-summary.txt",
      document_type: "deal_summary",
      content: "",
    },
  ],
};
