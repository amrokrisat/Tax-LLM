import { AnalyzeTransactionRequest } from "@/lib/api";

export const embeddedDemoScenario: AnalyzeTransactionRequest = {
  facts: {
    transaction_name: "Project Atlas",
    summary:
      "US buyer is evaluating the acquisition of a domestic software target with significant NOLs and a desire to preserve optionality for future integration.",
    entities: ["Atlas Parent", "TargetCo", "Merger Sub"],
    jurisdictions: ["United States", "Delaware"],
    transaction_type: "merger",
    stated_goals: [
      "Preserve tax attributes where possible",
      "Maintain execution certainty",
      "Support post-closing financing flexibility",
    ],
    constraints: [
      "Seller requests partial equity consideration",
      "Closing timeline is compressed",
    ],
    consideration_mix:
      "Cash plus rollover equity, with possible debt refinancing after closing.",
    proposed_steps:
      "Buyer forms merger sub, signs merger agreement, and may refinance target debt after closing.",
    rollover_equity: true,
    deemed_asset_sale_election: false,
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
        "Buyer proposes a cash and rollover equity merger structure for the acquisition of TargetCo.",
    },
    {
      file_name: "Tax diligence notes.txt",
      document_type: "diligence_notes",
      content:
        "TargetCo has legacy NOLs, prior ownership churn, and pending refinancing discussions.",
    },
  ],
};
