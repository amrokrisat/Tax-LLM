import { AnalyzeTransactionRequest } from "@/lib/api";

export const embeddedDemoScenario: AnalyzeTransactionRequest = {
  facts: {
    transaction_name: "Project Atlas",
    summary:
      "US buyer is evaluating whether to acquire the stock of a domestic software target, negotiate a deemed asset sale election, or require a direct asset path where the target has significant NOLs and valuable amortizable intangibles.",
    entities: ["Atlas Parent", "TargetCo"],
    jurisdictions: ["United States", "Delaware"],
    transaction_type: "stock sale",
    stated_goals: [
      "Compare stock-form execution against basis step-up value",
      "Preserve usable tax attributes where possible",
      "Support post-closing financing flexibility",
    ],
    constraints: [
      "Seller prefers stock-sale treatment",
      "Buyer will pay more only if step-up economics are real",
    ],
    consideration_mix:
      "Cash consideration, with possible deemed asset election and post-closing refinancing.",
    proposed_steps:
      "Buyer acquires target stock, models a 338(h)(10) or 336(e) path if available, and may refinance debt after closing.",
    rollover_equity: false,
    deemed_asset_sale_election: true,
    contribution_transactions: false,
    partnership_issues: false,
    debt_financing: true,
    earnout: false,
    withholding: false,
    state_tax: true,
    international: false,
  },
  uploaded_documents: [
    {
      file_name: "LOI.txt",
      document_type: "letter_of_intent",
      content:
        "Buyer proposes a stock acquisition of TargetCo but may request a 338(h)(10) election if the step-up value justifies the added seller tax cost.",
    },
    {
      file_name: "Tax diligence notes.txt",
      document_type: "diligence_notes",
      content:
        "TargetCo has legacy NOLs, prior ownership churn, significant amortizable software intangibles, and pending refinancing discussions.",
    },
  ],
};
