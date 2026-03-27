"use client";

import { memo } from "react";

import {
  ElectionOrFilingItem,
  ElectionOrFilingStatus,
  ElectionOrFilingType,
  Entity,
  StructuredRecordStatus,
  TransactionStep,
  TransactionStepPhase,
  TransactionStepType,
} from "@/lib/api";

const phases: TransactionStepPhase[] = ["pre_closing", "closing", "post_closing"];
const stepTypes: TransactionStepType[] = [
  "stock_purchase",
  "asset_purchase",
  "merger",
  "contribution",
  "distribution",
  "spin_off",
  "split_off",
  "split_up",
  "partnership_contribution",
  "refinancing",
  "election",
  "filing",
  "other",
];
const stepStatuses: StructuredRecordStatus[] = ["proposed", "confirmed", "uncertain"];
const itemTypes: ElectionOrFilingType[] = ["election", "filing", "compliance", "other"];
const itemStatuses: ElectionOrFilingStatus[] = ["possible", "required", "selected", "filed", "uncertain"];

export const TransactionStepsPane = memo(function TransactionStepsPane({
  entities,
  transactionSteps,
  electionItems,
  readOnly,
  addTransactionStep,
  updateTransactionStep,
  moveTransactionStep,
  addElectionItem,
  updateElectionItem,
}: {
  entities: Entity[];
  transactionSteps: TransactionStep[];
  electionItems: ElectionOrFilingItem[];
  readOnly: boolean;
  addTransactionStep: () => void;
  updateTransactionStep: <K extends keyof TransactionStep>(stepId: string, key: K, value: TransactionStep[K]) => void;
  moveTransactionStep: (stepId: string, direction: "up" | "down") => void;
  addElectionItem: () => void;
  updateElectionItem: <K extends keyof ElectionOrFilingItem>(
    itemId: string,
    key: K,
    value: ElectionOrFilingItem[K],
  ) => void;
}) {
  const orderedSteps = [...transactionSteps].sort((left, right) => left.sequence_number - right.sequence_number);

  return (
    <div className="stack">
      <div className="subpanel stack">
        <div className="row-between">
          <div>
            <h2>Transaction Steps</h2>
            <p className="muted">
              Capture the deal sequence in order and tie elections or filings back to the relevant entities and steps.
            </p>
          </div>
          {!readOnly ? (
            <div className="button-row">
              <button className="button-subtle" onClick={addTransactionStep} type="button">
                Add step
              </button>
              <button className="button-ghost" onClick={addElectionItem} type="button">
                Add filing
              </button>
            </div>
          ) : <span className="chip">Run snapshot</span>}
        </div>
      </div>

      <div className="subpanel stack">
        <div className="row-between">
          <h3>Transaction Steps</h3>
          {!readOnly ? (
            <button className="button-ghost" onClick={addTransactionStep} type="button">
              Add row
            </button>
          ) : null}
        </div>
        {transactionSteps.length ? (
          orderedSteps.map((step, index) => (
              <div key={step.step_id} className="stack authority-card">
                <div className="row-between">
                  <div className="chip-row">
                    <span className="chip">Step {step.sequence_number}</span>
                    <span className="chip">{step.phase.replaceAll("_", " ")}</span>
                    <span className="chip">{step.status}</span>
                  </div>
                  {!readOnly ? (
                    <div className="button-row">
                      <button className="button-tertiary" onClick={() => moveTransactionStep(step.step_id, "up")} disabled={index === 0} type="button">
                        Move up
                      </button>
                      <button
                        className="button-tertiary"
                        onClick={() => moveTransactionStep(step.step_id, "down")}
                        disabled={index === orderedSteps.length - 1}
                        type="button"
                      >
                        Move down
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="two-col">
                  <label className="field">
                    <span>Phase</span>
                    <select
                      disabled={readOnly}
                      value={step.phase}
                      onChange={(event) => updateTransactionStep(step.step_id, "phase", event.target.value as TransactionStepPhase)}
                    >
                      {phases.map((value) => (
                        <option key={value} value={value}>
                          {value.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Step type</span>
                    <select
                      disabled={readOnly}
                      value={step.step_type}
                      onChange={(event) => updateTransactionStep(step.step_id, "step_type", event.target.value as TransactionStepType)}
                    >
                      {stepTypes.map((value) => (
                        <option key={value} value={value}>
                          {value.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Title</span>
                    <input
                      disabled={readOnly}
                      value={step.title}
                      onChange={(event) => updateTransactionStep(step.step_id, "title", event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Status</span>
                    <select
                      disabled={readOnly}
                      value={step.status}
                      onChange={(event) =>
                        updateTransactionStep(step.step_id, "status", event.target.value as StructuredRecordStatus)
                      }
                    >
                      {stepStatuses.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span>Description</span>
                    <textarea
                      disabled={readOnly}
                      rows={3}
                      value={step.description}
                      onChange={(event) => updateTransactionStep(step.step_id, "description", event.target.value)}
                    />
                  </label>
                  <label className="field" style={{ gridColumn: "1 / -1" }}>
                    <span>Linked entities</span>
                    <select
                      disabled={readOnly}
                      multiple
                      value={step.entity_ids}
                      onChange={(event) =>
                        updateTransactionStep(
                          step.step_id,
                          "entity_ids",
                          Array.from(event.target.selectedOptions).map((option) => option.value),
                        )
                      }
                    >
                      {entities.map((entity) => (
                        <option key={entity.entity_id} value={entity.entity_id}>
                          {entity.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            ))
        ) : (
          <p className="muted">No transaction steps recorded yet.</p>
        )}
      </div>

      <div className="subpanel stack">
        <div className="row-between">
          <h3>Elections and filings</h3>
          {!readOnly ? (
            <button className="button-ghost" onClick={addElectionItem} type="button">
              Add item
            </button>
          ) : null}
        </div>
        {electionItems.length ? (
          electionItems.map((item) => (
            <div key={item.item_id} className="two-col">
              <label className="field">
                <span>Name</span>
                <input
                  disabled={readOnly}
                  value={item.name}
                  onChange={(event) => updateElectionItem(item.item_id, "name", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Type</span>
                <select
                  disabled={readOnly}
                  value={item.item_type}
                  onChange={(event) => updateElectionItem(item.item_id, "item_type", event.target.value as ElectionOrFilingType)}
                >
                  {itemTypes.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Citation or form</span>
                <input
                  disabled={readOnly}
                  value={item.citation_or_form}
                  onChange={(event) => updateElectionItem(item.item_id, "citation_or_form", event.target.value)}
                />
              </label>
              <label className="field">
                <span>Status</span>
                <select
                  disabled={readOnly}
                  value={item.status}
                  onChange={(event) =>
                    updateElectionItem(item.item_id, "status", event.target.value as ElectionOrFilingStatus)
                  }
                >
                  {itemStatuses.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Linked entities</span>
                <select
                  disabled={readOnly}
                  multiple
                  value={item.related_entity_ids}
                  onChange={(event) =>
                    updateElectionItem(
                      item.item_id,
                      "related_entity_ids",
                      Array.from(event.target.selectedOptions).map((option) => option.value),
                    )
                  }
                >
                  {entities.map((entity) => (
                    <option key={entity.entity_id} value={entity.entity_id}>
                      {entity.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Linked steps</span>
                <select
                  disabled={readOnly}
                  multiple
                  value={item.related_step_ids}
                  onChange={(event) =>
                    updateElectionItem(
                      item.item_id,
                      "related_step_ids",
                      Array.from(event.target.selectedOptions).map((option) => option.value),
                    )
                  }
                >
                  {orderedSteps.map((step) => (
                    <option key={step.step_id} value={step.step_id}>
                      {`Step ${step.sequence_number}: ${step.title || step.step_type.replaceAll("_", " ")}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ gridColumn: "1 / -1" }}>
                <span>Notes</span>
                <textarea
                  disabled={readOnly}
                  rows={2}
                  value={item.notes}
                  onChange={(event) => updateElectionItem(item.item_id, "notes", event.target.value)}
                />
              </label>
            </div>
          ))
        ) : (
          <p className="muted">No elections or filing items recorded yet.</p>
        )}
      </div>
    </div>
  );
});
