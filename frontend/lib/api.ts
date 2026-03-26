export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export type UploadedDocumentInput = {
  file_name: string;
  document_type: string;
  content: string;
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

export async function getDemoScenario(): Promise<AnalyzeTransactionRequest> {
  const response = await fetch(`${API_BASE_URL}/api/v1/demo/scenario`, {
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
  const response = await fetch(`${API_BASE_URL}/api/v1/intake/analyze`, {
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
