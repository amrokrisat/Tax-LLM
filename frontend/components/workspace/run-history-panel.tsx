"use client";

import { memo } from "react";

import { AnalysisRun, AnalysisRunSummary } from "@/lib/api";

function reviewStatusLabel(status: AnalysisRunSummary["review_status"]) {
  if (status === "reviewed") {
    return "Reviewed";
  }
  if (status === "in_review") {
    return "In review";
  }
  return "Unreviewed";
}

export const RunHistoryPanel = memo(function RunHistoryPanel({
  runs,
  selectedRunId,
  compareRunId,
  onSelectRun,
  onCompareChange,
  comparison,
  reviewerName,
  reviewNote,
  reviewSaving,
  selectedRun,
  onReviewerNameChange,
  onReviewNoteChange,
  onSaveNote,
  onReviewStatusChange,
}: {
  runs: AnalysisRunSummary[];
  selectedRunId: string | null;
  compareRunId: string;
  onSelectRun: (runId: string) => void;
  onCompareChange: (runId: string) => void;
  comparison: {
    addedBuckets: string[];
    removedBuckets: string[];
    authorityDelta: number;
    warningChanged: boolean;
  } | null;
  reviewerName: string;
  reviewNote: string;
  reviewSaving: boolean;
  selectedRun: AnalysisRun | null;
  onReviewerNameChange: (value: string) => void;
  onReviewNoteChange: (value: string) => void;
  onSaveNote: () => void;
  onReviewStatusChange: (status: AnalysisRun["review_status"]) => void;
}) {
  return (
    <aside className="workspace-sidebar">
      <section className="sidebar-panel">
        <div className="sidebar-panel-header">
          <div>
            <h2>Run history</h2>
            <p className="muted">
              Saved analysis runs stay attached to this matter for comparison and review.
            </p>
          </div>
        </div>

        {runs.length === 0 ? (
          <p className="muted">
            No runs yet. Save facts and generate analysis to begin the run history.
          </p>
        ) : (
          <div className="run-history-list">
            {runs.map((run) => (
              <button
                key={run.run_id}
                className={`run-history-card ${selectedRunId === run.run_id ? "active" : ""}`}
                onClick={() => onSelectRun(run.run_id)}
                type="button"
              >
                <strong>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(run.created_at))}</strong>
                <span className="microcopy">
                  {run.issue_bucket_count} analysis areas · {run.authority_count} authorities
                </span>
                <span className="support-pill support-secondary">{reviewStatusLabel(run.review_status)}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {runs.length > 1 ? (
        <section className="sidebar-panel">
          <div className="sidebar-panel-header">
            <div>
              <h3>Compare runs</h3>
              <p className="muted">See what changed between the current run and a prior version.</p>
            </div>
          </div>
          <label className="field">
            <span>Compare against</span>
            <select value={compareRunId} onChange={(event) => onCompareChange(event.target.value)}>
              <option value="">Select a prior run</option>
              {runs
                .filter((run) => run.run_id !== selectedRunId)
                .map((run) => (
                  <option key={run.run_id} value={run.run_id}>
                    {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(run.created_at))}
                  </option>
                ))}
            </select>
          </label>
          {comparison ? (
            <div className="comparison-card">
              <p>
                <strong>Authority delta:</strong> {comparison.authorityDelta >= 0 ? "+" : ""}
                {comparison.authorityDelta}
              </p>
              <p>
                <strong>Added analysis areas:</strong>{" "}
                {comparison.addedBuckets.length ? comparison.addedBuckets.join(", ") : "None"}
              </p>
              <p>
                <strong>Removed analysis areas:</strong>{" "}
                {comparison.removedBuckets.length ? comparison.removedBuckets.join(", ") : "None"}
              </p>
              <p>
                <strong>Coverage changed:</strong> {comparison.warningChanged ? "Yes" : "No"}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {selectedRun ? (
        <section className="sidebar-panel">
          <div className="sidebar-panel-header">
            <div>
              <h3>Review workflow</h3>
              <p className="muted">Save reviewer state, notes, and pinned authorities on the selected run.</p>
            </div>
          </div>
          <label className="field">
            <span>Run review status</span>
            <select
              value={selectedRun.review_status}
              onChange={(event) => onReviewStatusChange(event.target.value as AnalysisRun["review_status"])}
            >
              <option value="unreviewed">Unreviewed</option>
              <option value="in_review">In review</option>
              <option value="reviewed">Reviewed</option>
            </select>
          </label>
          <label className="field">
            <span>Reviewer</span>
            <input value={reviewerName} onChange={(event) => onReviewerNameChange(event.target.value)} />
          </label>
          <label className="field">
            <span>Reviewer note</span>
            <textarea
              rows={4}
              value={reviewNote}
              onChange={(event) => onReviewNoteChange(event.target.value)}
              placeholder="Capture what was checked, what still needs review, or why certain authorities were pinned."
            />
          </label>
          <button
            className="button-subtle"
            onClick={onSaveNote}
            disabled={reviewSaving || !reviewNote.trim()}
            type="button"
          >
            {reviewSaving ? "Saving..." : "Save reviewer note"}
          </button>
          {selectedRun.reviewer_notes.length ? (
            <div className="list-card">
              <h4>Saved notes</h4>
              <ul className="list-tight">
                {selectedRun.reviewer_notes.map((note, index) => (
                  <li key={`${selectedRun.run_id}-note-${index}`}>{note}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </aside>
  );
});
