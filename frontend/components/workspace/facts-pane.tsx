"use client";

import { memo } from "react";

import { ExtractedFact, MatterRecord } from "@/lib/api";
import { TRANSACTION_TYPE_OPTIONS } from "@/lib/taxonomy";

export const FactsPane = memo(function FactsPane({
  confirmedExtractedFacts,
  draftMatterName,
  draftFacts,
  setDraftMatterName,
  updateFact,
  updateListField,
  onMergeConfirmedFacts,
}: {
  confirmedExtractedFacts: ExtractedFact[];
  draftMatterName: string;
  draftFacts: MatterRecord["facts"];
  setDraftMatterName: (value: string) => void;
  updateFact: <K extends keyof MatterRecord["facts"]>(key: K, value: MatterRecord["facts"][K]) => void;
  updateListField: (
    key: "entities" | "jurisdictions" | "stated_goals" | "constraints",
    value: string,
  ) => void;
  onMergeConfirmedFacts: () => void;
}) {
  return (
    <div className="stack">
      {confirmedExtractedFacts.length ? (
        <div className="subpanel stack">
          <div className="row-between">
            <div>
              <h3>Confirmed extracted facts</h3>
              <p className="muted">
                These facts have been confirmed in Documents and are ready to merge into the editable matter record.
              </p>
            </div>
            <button className="button-subtle" onClick={onMergeConfirmedFacts} type="button">
              Merge confirmed facts
            </button>
          </div>
          <ul className="list-tight">
            {confirmedExtractedFacts.map((fact) => (
              <li key={fact.fact_id}>
                <strong>{fact.label}</strong>: {fact.value}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="two-col">
        <label className="field">
          <span>Matter name</span>
          <input value={draftMatterName} onChange={(event) => setDraftMatterName(event.target.value)} />
        </label>
        <label className="field">
          <span>Transaction type</span>
          <select value={draftFacts.transaction_type} onChange={(event) => updateFact("transaction_type", event.target.value)}>
            {TRANSACTION_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field">
        <span>Summary</span>
        <textarea rows={5} value={draftFacts.summary} onChange={(event) => updateFact("summary", event.target.value)} />
      </label>

      <div className="two-col">
        <label className="field">
          <span>Entities</span>
          <textarea rows={5} value={draftFacts.entities.join("\n")} onChange={(event) => updateListField("entities", event.target.value)} />
        </label>
        <label className="field">
          <span>Jurisdictions</span>
          <textarea rows={5} value={draftFacts.jurisdictions.join("\n")} onChange={(event) => updateListField("jurisdictions", event.target.value)} />
        </label>
      </div>

      <div className="two-col">
        <label className="field">
          <span>Business goals</span>
          <textarea rows={4} value={draftFacts.stated_goals.join("\n")} onChange={(event) => updateListField("stated_goals", event.target.value)} />
        </label>
        <label className="field">
          <span>Constraints</span>
          <textarea rows={4} value={draftFacts.constraints.join("\n")} onChange={(event) => updateListField("constraints", event.target.value)} />
        </label>
      </div>

      <label className="field">
        <span>Consideration mix</span>
        <textarea rows={3} value={draftFacts.consideration_mix} onChange={(event) => updateFact("consideration_mix", event.target.value)} />
      </label>

      <label className="field">
        <span>Proposed steps</span>
        <textarea rows={4} value={draftFacts.proposed_steps} onChange={(event) => updateFact("proposed_steps", event.target.value)} />
      </label>

      <div className="check-grid">
        {[
          ["rollover_equity", "Rollover equity"],
          ["deemed_asset_sale_election", "Deemed asset sale election"],
          ["contribution_transactions", "Contribution transactions"],
          ["divisive_transactions", "Divisive / section 355"],
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
              checked={draftFacts[key as keyof typeof draftFacts] as boolean}
              onChange={(event) => updateFact(key as keyof typeof draftFacts, event.target.checked as never)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
});
