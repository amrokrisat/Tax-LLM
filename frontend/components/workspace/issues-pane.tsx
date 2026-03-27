"use client";

import { memo } from "react";

import { AnalysisResult, AnalysisRun, BucketCoverage } from "@/lib/api";

export const IssuesPane = memo(function IssuesPane({
  activeAnalysis,
  selectedRun,
  supportLabel,
  reviewKeyForBucket,
  toggleReviewedSection,
}: {
  activeAnalysis: AnalysisResult | null;
  selectedRun: AnalysisRun | null;
  supportLabel: (bucket: BucketCoverage) => string;
  reviewKeyForBucket: (bucket: string) => string;
  toggleReviewedSection: (sectionKey: string) => void;
}) {
  if (!activeAnalysis) {
    return <p className="muted">Run analysis to populate issues and bucket triage.</p>;
  }

  return (
    <div className="stack">
      <div className="subpanel">
        <h3>Classified issue buckets</h3>
        <ul className="list-tight">
          {activeAnalysis.classification.map((bucket) => (
            <li key={bucket.bucket}>
              <div className="row-between review-row">
                <div>
                  <strong>{bucket.label}</strong>: {bucket.reason}
                </div>
                {selectedRun ? (
                  <button className="button-ghost review-toggle" onClick={() => toggleReviewedSection(reviewKeyForBucket(bucket.bucket))} type="button">
                    {selectedRun.reviewed_sections.includes(reviewKeyForBucket(bucket.bucket)) ? "Reviewed" : "Mark reviewed"}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="subpanel">
        <h3>Issues</h3>
        <ul className="list-tight">
          {activeAnalysis.issues.map((issue) => {
            const bucket = activeAnalysis.bucket_coverage.find((item) => item.bucket === issue.bucket);
            return (
              <li key={issue.bucket}>
                <strong>{issue.name}</strong>: {issue.description}
                <div className="microcopy">
                  Severity: {issue.severity} · {bucket ? supportLabel(bucket) : "Unsupported"}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
});
