"use client";

import { memo } from "react";

import { AnalysisResult, AnalysisRun } from "@/lib/api";

export const MemoPane = memo(function MemoPane({
  activeAnalysis,
  selectedRun,
  copyingExport,
  exporting,
  exportMarkdownAction,
  reviewKeyForMemo,
  toggleReviewedSection,
}: {
  activeAnalysis: AnalysisResult | null;
  selectedRun: AnalysisRun | null;
  copyingExport: boolean;
  exporting: boolean;
  exportMarkdownAction: (copyOnly?: boolean) => void;
  reviewKeyForMemo: (heading: string) => string;
  toggleReviewedSection: (sectionKey: string) => void;
}) {
  if (!activeAnalysis) {
    return <p className="muted">Run analysis to generate the memo view and markdown export.</p>;
  }

  const aiReady =
    activeAnalysis.ai_assist?.status === "ready" &&
    (activeAnalysis.ai_assist.memo_sections?.length ?? 0) > 0;
  const sections = aiReady ? activeAnalysis.ai_assist!.memo_sections : activeAnalysis.memo_sections;

  return (
    <div className="memo-stack">
      <div className="row-between subpanel">
        <div>
          <h3>Export memo</h3>
          <p className="muted">Download or copy the markdown version of the selected saved run, including grounded and preliminary sections as labeled.</p>
        </div>
        <div className="button-row">
          <button className="button-subtle" onClick={() => exportMarkdownAction(true)} disabled={!selectedRun || copyingExport} type="button">
            {copyingExport ? "Copying..." : "Copy markdown"}
          </button>
          <button className="button-subtle" onClick={() => exportMarkdownAction(false)} disabled={!selectedRun || exporting} type="button">
            {exporting ? "Exporting..." : "Download markdown"}
          </button>
        </div>
      </div>

      {activeAnalysis.ai_assist?.status === "error" ? (
        <p className="status-banner warn compact-banner">
          AI memo enhancement is unavailable right now. Showing deterministic memo output instead.
        </p>
      ) : null}

      {aiReady ? (
        <p className="status-banner ok compact-banner">AI-enhanced memo drafting is active for this run.</p>
      ) : null}

      {sections.map((section) => {
        const sectionKey = reviewKeyForMemo(section.heading);
        const sectionReviewed = selectedRun?.reviewed_sections.includes(sectionKey) ?? false;
        return (
          <article key={section.heading} className={!section.supported ? "memo-section memo-section-flagged" : "memo-section"}>
            <div className="row-between">
              <h3>{section.heading}</h3>
              <div className="button-row">
                <span className={`support-pill ${section.supported ? "support-primary" : "support-internal"}`}>
                  {section.supported ? "Grounded" : "Preliminary"}
                </span>
                {selectedRun ? (
                  <button className="button-ghost review-toggle" onClick={() => toggleReviewedSection(sectionKey)} type="button">
                    {sectionReviewed ? "Reviewed" : "Mark reviewed"}
                  </button>
                ) : null}
              </div>
            </div>
            <p>{section.body}</p>
            {section.citations.length ? (
              <ul className="list-tight">
                {section.citations.map((citation) => (
                  <li key={`${section.heading}-${citation.authority_id}`}>
                    <strong>{citation.citation}</strong>: {citation.title}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        );
      })}
    </div>
  );
});
