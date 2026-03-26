"use client";

import { Dispatch, FormEvent, SetStateAction } from "react";

import { AnalyzeTransactionRequest } from "@/lib/api";

type IntakeFormProps = {
  request: AnalyzeTransactionRequest;
  setRequest: Dispatch<SetStateAction<AnalyzeTransactionRequest>>;
  loading: boolean;
  error: string | null;
  intakeMode: "custom" | "demo" | "demo_edited";
  onLoadDemo: () => void;
  onReset: () => void;
  onEdit: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const transactionTypes = [
  "stock sale",
  "asset sale",
  "merger",
  "contribution transaction",
  "partnership transaction",
];

export function IntakeForm({
  request,
  setRequest,
  loading,
  error,
  intakeMode,
  onLoadDemo,
  onReset,
  onEdit,
  onSubmit,
}: IntakeFormProps) {
  function updateFacts<K extends keyof AnalyzeTransactionRequest["facts"]>(
    key: K,
    value: AnalyzeTransactionRequest["facts"][K],
  ) {
    onEdit();
    setRequest((current) => ({
      ...current,
      facts: {
        ...current.facts,
        [key]: value,
      },
    }));
  }

  function updateBooleanFact(
    key:
      | "rollover_equity"
      | "deemed_asset_sale_election"
      | "contribution_transactions"
      | "partnership_issues"
      | "debt_financing"
      | "earnout"
      | "withholding"
      | "state_tax"
      | "international",
    value: boolean,
  ) {
    updateFacts(key, value);
  }

  function updateListField(
    key: "entities" | "jurisdictions" | "stated_goals" | "constraints",
    value: string,
  ) {
    updateFacts(
      key,
      value
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    );
  }

  function updateDocument(
    index: number,
    key: keyof AnalyzeTransactionRequest["uploaded_documents"][number],
    value: string,
  ) {
    onEdit();
    setRequest((current) => ({
      ...current,
      uploaded_documents: current.uploaded_documents.map((document, documentIndex) =>
        documentIndex === index ? { ...document, [key]: value } : document,
      ),
    }));
  }

  function addDocument() {
    onEdit();
    setRequest((current) => ({
      ...current,
      uploaded_documents: [
        ...current.uploaded_documents,
        { file_name: "", document_type: "deal_document", content: "" },
      ],
    }));
  }

  return (
    <form className="panel stack" onSubmit={onSubmit}>
      <div>
        <p className="eyebrow">Intake</p>
        <div className="row-between">
          <h2>Transaction facts</h2>
          <div className="button-row">
            <button className="button-secondary" type="button" onClick={onLoadDemo}>
              Load Demo Scenario
            </button>
            <button className="button-tertiary" type="button" onClick={onReset}>
              Reset To Blank
            </button>
          </div>
        </div>
        <p className="muted">
          Submit editable facts to the backend. The analysis view only reflects live API
          output from the retrieval-first pipeline.
        </p>
        <div className="chip-row">
          <span className={`mode-pill mode-${intakeMode}`}>
            {intakeMode === "custom"
              ? "Custom facts"
              : intakeMode === "demo"
                ? "Demo facts loaded"
                : "Customized from demo"}
          </span>
          <span className="microcopy">
            Loading demo facts only pre-fills the form. You can edit any field before
            running analysis.
          </span>
        </div>
      </div>

      <label className="field">
        <span>Transaction name</span>
        <input
          value={request.facts.transaction_name}
          onChange={(event) => updateFacts("transaction_name", event.target.value)}
          placeholder="Project Atlas"
        />
      </label>

      <label className="field">
        <span>Transaction type</span>
        <select
          value={request.facts.transaction_type}
          onChange={(event) => updateFacts("transaction_type", event.target.value)}
        >
          {transactionTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Summary</span>
        <textarea
          rows={5}
          value={request.facts.summary}
          onChange={(event) => updateFacts("summary", event.target.value)}
          placeholder="Describe the transaction, consideration, parties, and objectives."
        />
      </label>

      <div className="two-col">
        <label className="field">
          <span>Entities</span>
          <textarea
            rows={4}
            value={request.facts.entities.join("\n")}
            onChange={(event) => updateListField("entities", event.target.value)}
            placeholder={"Buyer\nTarget\nMerger Sub"}
          />
        </label>

        <label className="field">
          <span>Jurisdictions</span>
          <textarea
            rows={4}
            value={request.facts.jurisdictions.join("\n")}
            onChange={(event) => updateListField("jurisdictions", event.target.value)}
            placeholder={"United States\nDelaware"}
          />
        </label>
      </div>

      <div className="two-col">
        <label className="field">
          <span>Business goals</span>
          <textarea
            rows={4}
            value={request.facts.stated_goals.join("\n")}
            onChange={(event) => updateListField("stated_goals", event.target.value)}
            placeholder={"Preserve attributes\nMaintain certainty"}
          />
        </label>

        <label className="field">
          <span>Constraints</span>
          <textarea
            rows={4}
            value={request.facts.constraints.join("\n")}
            onChange={(event) => updateListField("constraints", event.target.value)}
            placeholder={"Seller wants rollover equity\nCompressed timeline"}
          />
        </label>
      </div>

      <label className="field">
        <span>Consideration mix</span>
        <textarea
          rows={3}
          value={request.facts.consideration_mix}
          onChange={(event) => updateFacts("consideration_mix", event.target.value)}
          placeholder="Cash, rollover equity, assumed debt, earnout."
        />
      </label>

      <label className="field">
        <span>Proposed steps</span>
        <textarea
          rows={4}
          value={request.facts.proposed_steps}
          onChange={(event) => updateFacts("proposed_steps", event.target.value)}
          placeholder="Describe signing, closing, elections, contributions, and post-close restructuring."
        />
      </label>

      <div className="check-grid">
        {[
          ["rollover_equity", "Rollover equity"],
          ["deemed_asset_sale_election", "Deemed asset sale election"],
          ["contribution_transactions", "Contribution transactions"],
          ["partnership_issues", "Partnership issues"],
          ["debt_financing", "Debt financing"],
          ["earnout", "Earnout"],
          ["withholding", "Withholding"],
          ["state_tax", "State overlay"],
          ["international", "International overlay"],
        ].map(([key, label]) => (
          <label key={key} className="checkbox">
            <input
              type="checkbox"
              checked={request.facts[key as keyof AnalyzeTransactionRequest["facts"]] as boolean}
              onChange={(event) =>
                updateBooleanFact(
                  key as
                    | "rollover_equity"
                    | "deemed_asset_sale_election"
                    | "contribution_transactions"
                    | "partnership_issues"
                    | "debt_financing"
                    | "earnout"
                    | "withholding"
                    | "state_tax"
                    | "international",
                  event.target.checked,
                )
              }
            />
            <span>{label}</span>
          </label>
        ))}
      </div>

      <div className="subpanel stack">
        <div className="row-between">
          <h3>Uploaded deal documents</h3>
          <button className="button-secondary" type="button" onClick={addDocument}>
            Add Document
          </button>
        </div>

        {request.uploaded_documents.map((document, index) => (
          <div key={`${document.file_name}-${index}`} className="document-card">
            <div className="two-col">
              <label className="field">
                <span>File name</span>
                <input
                  value={document.file_name}
                  onChange={(event) => updateDocument(index, "file_name", event.target.value)}
                  placeholder="LOI.txt"
                />
              </label>
              <label className="field">
                <span>Document type</span>
                <input
                  value={document.document_type}
                  onChange={(event) =>
                    updateDocument(index, "document_type", event.target.value)
                  }
                  placeholder="letter_of_intent"
                />
              </label>
            </div>
            <label className="field">
              <span>Content</span>
              <textarea
                rows={4}
                value={document.content}
                onChange={(event) => updateDocument(index, "content", event.target.value)}
                placeholder="Paste the key transaction language or diligence summary here."
              />
            </label>
          </div>
        ))}
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <button className="button-primary" type="submit" disabled={loading}>
        {loading ? "Analyzing..." : "Run Retrieval-First Analysis"}
      </button>
    </form>
  );
}
