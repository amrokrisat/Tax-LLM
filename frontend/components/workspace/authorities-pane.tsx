"use client";

import { memo } from "react";

import { AnalysisResult, AnalysisRun, AuthorityRecord, BucketCoverage } from "@/lib/api";

export const AuthoritiesPane = memo(function AuthoritiesPane({
  activeAnalysis,
  selectedRun,
  groupAuthoritiesBySource,
  supportLabel,
  supportClass,
  reviewKeyForBucket,
  toggleReviewedSection,
  togglePinnedAuthority,
}: {
  activeAnalysis: AnalysisResult | null;
  selectedRun: AnalysisRun | null;
  groupAuthoritiesBySource: (bucket: BucketCoverage) => Record<string, AuthorityRecord[]>;
  supportLabel: (bucket: BucketCoverage) => string;
  supportClass: (label: string) => string;
  reviewKeyForBucket: (bucket: string) => string;
  toggleReviewedSection: (sectionKey: string) => void;
  togglePinnedAuthority: (authorityId: string) => void;
}) {
  if (!activeAnalysis) {
    return <p className="muted">Run analysis to inspect retrieved authorities, regime coverage, and pinned support.</p>;
  }

  return (
    <div className="stack">
      {activeAnalysis.bucket_coverage.map((bucket) => {
        const groups = groupAuthoritiesBySource(bucket);
        const sectionReviewed = selectedRun?.reviewed_sections.includes(reviewKeyForBucket(bucket.bucket)) ?? false;
        return (
          <section key={bucket.bucket} className="subpanel stack">
            <div className="row-between">
              <div>
                <h3>{bucket.label}</h3>
                <p className="muted">{supportLabel(bucket)}</p>
              </div>
              <div className="button-row">
                <span className={`support-pill ${supportClass(supportLabel(bucket))}`}>{supportLabel(bucket)}</span>
                {selectedRun ? (
                  <button className="button-ghost review-toggle" onClick={() => toggleReviewedSection(reviewKeyForBucket(bucket.bucket))} type="button">
                    {sectionReviewed ? "Reviewed" : "Mark reviewed"}
                  </button>
                ) : null}
              </div>
            </div>

            {Object.keys(groups).length === 0 ? (
              <p className="muted">No authorities were retrieved for this regime yet.</p>
            ) : (
              Object.entries(groups).map(([sourceType, authorities]) => (
                <div key={`${bucket.bucket}-${sourceType}`} className="stack">
                  <h4>{sourceType}</h4>
                  <div className="authority-grid">
                    {authorities.map((authority) => {
                      const pinned = selectedRun?.pinned_authority_ids.includes(authority.authority_id) ?? false;
                      return (
                        <article key={authority.authority_id} className={`authority-card ${pinned ? "authority-card-pinned" : ""}`}>
                          <div className="row-between">
                            <div className="chip-row">
                              <span className="chip">{sourceType}</span>
                              <span className="chip">
                                {authority.primary_authority
                                  ? "Primary"
                                  : authority.secondary_authority
                                    ? "Secondary"
                                    : authority.internal_only
                                      ? "Internal"
                                      : "Authority"}
                              </span>
                              {authority.procedural_or_substantive ? (
                                <span className="chip">{authority.procedural_or_substantive}</span>
                              ) : null}
                              <span className="chip">Score {authority.relevance_score.toFixed(2)}</span>
                            </div>
                            {selectedRun ? (
                              <button className={`button-ghost pin-toggle ${pinned ? "active" : ""}`} onClick={() => togglePinnedAuthority(authority.authority_id)} type="button">
                                {pinned ? "Pinned" : "Pin authority"}
                              </button>
                            ) : null}
                          </div>
                          <p>
                            <strong>{authority.citation}</strong>
                          </p>
                          <p>{authority.title}</p>
                          {authority.structure_tags?.length ? (
                            <div className="chip-row">
                              {authority.structure_tags.slice(0, 3).map((tag) => (
                                <span key={`${authority.authority_id}-${tag}`} className="chip">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <p className="muted">{authority.excerpt}</p>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </section>
        );
      })}
    </div>
  );
});
