"use client";

import { memo } from "react";

import { AnalysisResult } from "@/lib/api";

export const AlternativesPane = memo(function AlternativesPane({
  activeAnalysis,
}: {
  activeAnalysis: AnalysisResult | null;
}) {
  if (!activeAnalysis) {
    return <p className="muted">Run analysis to compare structure alternatives across the triggered analysis areas.</p>;
  }

  return (
    <div className="alternatives-grid">
      {activeAnalysis.alternatives.map((alternative) => (
        <article key={alternative.name} className="document-card alternative-card">
          <div className="alternative-header">
            <h3>{alternative.name}</h3>
            <span className={`support-pill ${alternative.unsupported_assertions.length ? "support-internal" : "support-primary"}`}>
              {alternative.unsupported_assertions.length ? "Partly preliminary" : "Grounded"}
            </span>
          </div>
          <p className="alternative-description">{alternative.description}</p>
          <div className="alternative-meta">
            <div className="alternative-section">
              <h4>Tax consequences</h4>
              <p className="muted">These consequences are only as strong as the support behind the relevant analysis areas.</p>
              <ul className="list-tight">
                {alternative.tax_consequences.map((item) => (
                  <li key={item.text}>{item.text}</li>
                ))}
              </ul>
            </div>
            <div className="alternative-section">
              <h4>Assumptions</h4>
              <ul className="list-tight">
                {alternative.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="alternative-section">
              <h4>Missing facts</h4>
              <ul className="list-tight">
                {alternative.missing_facts.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="alternative-section">
              <h4>Risks and uncertainty</h4>
              <ul className="list-tight">
                {alternative.risks_uncertainty.map((item) => (
                  <li key={item.text}>{item.text}</li>
                ))}
              </ul>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
});
