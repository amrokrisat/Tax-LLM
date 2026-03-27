"use client";

import { memo } from "react";

import { AnalysisResult, BucketCoverage } from "@/lib/api";

export const WarningsPane = memo(function WarningsPane({
  activeAnalysis,
  warningBuckets,
  supportLabel,
}: {
  activeAnalysis: AnalysisResult | null;
  warningBuckets: BucketCoverage[];
  supportLabel: (bucket: BucketCoverage) => string;
}) {
  if (!activeAnalysis) {
    return <p className="muted">Run analysis to populate support notes and warning items.</p>;
  }

  return (
    <div className="stack">
      <div className={`warning-strip ${activeAnalysis.retrieval_complete ? "ok" : "warn"}`}>
        <strong>{activeAnalysis.retrieval_complete ? "Coverage status:" : "Coverage warning:"}</strong>
        <span>{activeAnalysis.completeness_warning}</span>
      </div>

      {warningBuckets.length === 0 ? (
        <div className="subpanel stack">
          <h3>No open warning items</h3>
          <p className="muted">This run does not currently show analysis-area warnings beyond the overall coverage note above.</p>
        </div>
      ) : (
        <div className="stack">
          {warningBuckets.map((bucket) => (
            <article key={bucket.bucket} className="subpanel stack">
              <div className="row-between">
                <div>
                  <h3>{bucket.label}</h3>
                  <p className="muted">{supportLabel(bucket)}</p>
                </div>
                <span className={`support-pill ${supportLabel(bucket) === "Unsupported" ? "support-unsupported" : "support-internal"}`}>
                  {supportLabel(bucket)}
                </span>
              </div>

              {bucket.source_priority_warning ? <p className="status-banner warn compact-banner">{bucket.source_priority_warning}</p> : null}

              <ul className="list-tight">
                {bucket.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
                {bucket.notes.length === 0 ? (
                  <li>This analysis area is being kept out of the grounded analysis because the retrieved support remains incomplete.</li>
                ) : null}
              </ul>
            </article>
          ))}
        </div>
      )}
    </div>
  );
});
