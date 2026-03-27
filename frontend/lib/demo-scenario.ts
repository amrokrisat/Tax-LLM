import { AnalyzeTransactionRequest } from "@/lib/api";

export const embeddedDemoScenario: AnalyzeTransactionRequest = {
  facts: {
    transaction_name: "Project Atlas",
    summary:
      "US buyer is evaluating a stock acquisition of a domestic software target after a possible pre-close contribution and divisive separation step, and wants to compare a straight stock path against section 338(h)(10), 338(g), or 336(e) election-sensitive paths while preserving attribute value, managing financing, and tracking state overlays.",
    entities: ["Atlas Parent", "TargetCo", "Legacy HoldCo", "SpinCo"],
    jurisdictions: ["United States", "Delaware"],
    transaction_type: "stock sale",
    stated_goals: [
      "Compare stock-form execution against basis step-up value",
      "Preserve usable tax attributes where possible",
      "Support post-closing financing flexibility",
      "Test whether any contribution or divisive step improves the transaction posture",
    ],
    constraints: [
      "Seller prefers stock-sale treatment",
      "Buyer will pay more only if step-up economics are real",
      "Any pre-close separation must be supportable as a real corporate restructuring step",
    ],
    consideration_mix:
      "Cash consideration, with possible deemed asset election, limited rollover flexibility, and post-closing refinancing.",
    proposed_steps:
      "Seller may contribute selected assets to a controlled corporation and evaluate a divisive separation before buyer acquires target stock through a merger-sub structure, models a qualified stock purchase and a 338(h)(10), 338(g), or 336(e) path if available, and may refinance debt after closing.",
    rollover_equity: false,
    deemed_asset_sale_election: true,
    contribution_transactions: false,
    divisive_transactions: false,
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
        "Buyer proposes a stock acquisition of TargetCo through merger sub but may request a 338(h)(10), 338(g), or 336(e) election if the step-up value justifies the added seller tax cost and the seller-target profile permits the relevant election mechanics.",
    },
    {
      file_name: "Tax diligence notes.txt",
      document_type: "diligence_notes",
      content:
        "TargetCo has legacy NOLs, prior ownership churn, significant amortizable software intangibles, and pending refinancing discussions. Seller is also considering whether a contribution or divisive separation step would be used before the transaction. Buyer wants to compare straight stock form against a qualified stock purchase with possible 338(g), 338(h)(10), or 336(e) treatment.",
    },
  ],
};
