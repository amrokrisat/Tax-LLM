import { AnalysisResult, AuthorityRecord, BucketCoverage } from "@/lib/api";

type AnalysisPanelProps = {
  analysis: AnalysisResult | null;
  loading: boolean;
};

function supportLabel(bucket: BucketCoverage) {
  if (bucket.status === "under_supported" || bucket.authorities.length === 0) {
    return "unsupported";
  }

  const sourceTypes = new Set(bucket.authorities.map((authority) => authority.source_type));
  const hasPrimary = sourceTypes.has("code") || sourceTypes.has("regs");
  const hasSecondary =
    sourceTypes.has("irs_guidance") || sourceTypes.has("cases") || sourceTypes.has("forms");
  const internalOnly = sourceTypes.size > 0 && [...sourceTypes].every((type) => type === "internal");

  if (hasPrimary) {
    return "primary";
  }
  if (internalOnly) {
    return "internal";
  }
  if (hasSecondary) {
    return "secondary";
  }
  return "unsupported";
}

type SupportLabel = ReturnType<typeof supportLabel>;

function supportCopy(label: ReturnType<typeof supportLabel>) {
  switch (label) {
    case "primary":
      return "Primary support";
    case "secondary":
      return "Secondary support";
    case "internal":
      return "Preliminary only";
    default:
      return "Unsupported";
  }
}

function supportTone(label: SupportLabel) {
  switch (label) {
    case "primary":
      return "support-primary";
    case "secondary":
      return "support-secondary";
    case "internal":
      return "support-internal";
    default:
      return "support-unsupported";
  }
}

function sourceTypeLabel(sourceType: AuthorityRecord["source_type"]) {
  switch (sourceType) {
    case "regs":
      return "Regs";
    case "irs_guidance":
      return "IRS guidance";
    case "forms":
      return "Forms";
    case "internal":
      return "Internal";
    default:
      return sourceType.charAt(0).toUpperCase() + sourceType.slice(1);
  }
}

function sectionTone(section: AnalysisResult["memo_sections"][number]) {
  if (section.heading.startsWith("Alternative:")) {
    return "Alternative";
  }
  if (section.heading === "Facts And Issue Framing") {
    return "Facts";
  }
  if (section.heading === "Grounded Issues") {
    return "Grounded issues";
  }
  return section.supported ? "Supported analysis" : "Preliminary";
}

export function AnalysisPanel({ analysis, loading }: AnalysisPanelProps) {
  if (!analysis) {
    return (
      <section className="panel stack">
        <div>
          <p className="eyebrow">Analysis</p>
          <h2>Awaiting backend analysis</h2>
          <p className="muted">
            Submit transaction facts to render live issue classification, retrieved
            authorities, structural alternatives, memo sections, and coverage warnings.
          </p>
        </div>
        {loading ? <p className="status-chip">Running analysis...</p> : null}
      </section>
    );
  }

  const coverageGroups = {
    primary: analysis.bucket_coverage.filter((bucket) => supportLabel(bucket) === "primary"),
    secondary: analysis.bucket_coverage.filter((bucket) => supportLabel(bucket) === "secondary"),
    internal: analysis.bucket_coverage.filter((bucket) => supportLabel(bucket) === "internal"),
    unsupported: analysis.bucket_coverage.filter((bucket) => supportLabel(bucket) === "unsupported"),
  };
  const bucketSupport = new Map<string, SupportLabel>(
    analysis.bucket_coverage.map((bucket) => [bucket.bucket, supportLabel(bucket)]),
  );
  const primaryCount = coverageGroups.primary.length;
  const preliminaryCount = coverageGroups.secondary.length + coverageGroups.internal.length;

  return (
    <section className="panel stack">
      <div className="analysis-header">
        <p className="eyebrow">Analysis</p>
        <h2>Analysis results</h2>
        <div className={`warning-strip ${analysis.retrieval_complete ? "ok" : "warn"}`}>
          <strong>{analysis.retrieval_complete ? "Coverage status:" : "Coverage warning:"}</strong>
          <span>{analysis.completeness_warning}</span>
        </div>
        <div className="metrics-row">
          <span className="chip">Confidence: {analysis.confidence_label}</span>
          <span className="chip">Primary-supported: {primaryCount}</span>
          <span className="chip">Preliminary: {preliminaryCount}</span>
          <span className="chip">Unsupported: {coverageGroups.unsupported.length}</span>
        </div>
      </div>

      <div className="subpanel stack">
        <div>
          <h3>Coverage summary</h3>
          <p className="muted">
            Coverage counts below follow the same support taxonomy used in the authority
            review, issues list, and memo.
          </p>
        </div>
        <div className="coverage-grid">
          <article className="coverage-card coverage-primary">
            <h4>Primary-authority supported</h4>
            <p className="coverage-count">{coverageGroups.primary.length}</p>
            <ul className="list-tight">
              {coverageGroups.primary.map((bucket) => (
                <li key={bucket.bucket}>{bucket.label}</li>
              ))}
              {coverageGroups.primary.length === 0 ? <li className="microcopy">No analysis areas</li> : null}
            </ul>
          </article>
          <article className="coverage-card coverage-secondary">
            <h4>Secondary-authority supported</h4>
            <p className="coverage-count">{coverageGroups.secondary.length}</p>
            <ul className="list-tight">
              {coverageGroups.secondary.map((bucket) => (
                <li key={bucket.bucket}>{bucket.label}</li>
              ))}
              {coverageGroups.secondary.length === 0 ? <li className="microcopy">No analysis areas</li> : null}
            </ul>
          </article>
          <article className="coverage-card coverage-internal">
            <h4>Internal-only / preliminary</h4>
            <p className="coverage-count">{coverageGroups.internal.length}</p>
            <ul className="list-tight">
              {coverageGroups.internal.map((bucket) => (
                <li key={bucket.bucket}>{bucket.label}</li>
              ))}
              {coverageGroups.internal.length === 0 ? <li className="microcopy">No analysis areas</li> : null}
            </ul>
          </article>
          <article className="coverage-card coverage-unsupported">
            <h4>Unsupported</h4>
            <p className="coverage-count">{coverageGroups.unsupported.length}</p>
            <ul className="list-tight">
              {coverageGroups.unsupported.map((bucket) => (
                <li key={bucket.bucket}>{bucket.label}</li>
              ))}
              {coverageGroups.unsupported.length === 0 ? <li className="microcopy">No analysis areas</li> : null}
            </ul>
          </article>
        </div>
      </div>

      <div className="subpanel stack">
        <div>
          <h3>Authority review</h3>
          <p className="muted">
            Click any transactional-tax analysis area below to review the authorities, citations, and excerpts
            supporting that part of the analysis.
          </p>
        </div>
        <div className="stack">
          {analysis.bucket_coverage.map((bucket) => {
            const label = supportLabel(bucket);
            return (
              <details key={bucket.bucket} className="authority-disclosure" open={label !== "primary"}>
                <summary className="authority-summary">
                  <div className="authority-heading">
                    <h4>{bucket.label}</h4>
                    <p className="microcopy">
                      {bucket.authorities.length > 0
                        ? "Click to review the authorities for this analysis area"
                        : "Click to review support status"}
                    </p>
                  </div>
                  <div className="summary-meta">
                    <span className="summary-count">
                      {bucket.authorities.length}{" "}
                      {bucket.authorities.length === 1 ? "authority" : "authorities"}
                    </span>
                    <span className={`support-pill ${supportTone(label)}`}>{supportCopy(label)}</span>
                    <span className="summary-caret" aria-hidden="true">
                      Open details
                    </span>
                  </div>
                </summary>

                <div className="authority-body stack">
                  {bucket.source_priority_warning ? (
                    <p className="status-banner warn compact-banner">
                      {bucket.source_priority_warning}
                    </p>
                  ) : null}

                  {bucket.authorities.length > 0 ? (
                    <div className="authority-grid">
                      {bucket.authorities.map((authority) => (
                        <article key={`${bucket.bucket}-${authority.authority_id}`} className="authority-card">
                          <div className="chip-row">
                            <span className="chip">{sourceTypeLabel(authority.source_type)}</span>
                            <span className="chip">Score {authority.relevance_score.toFixed(2)}</span>
                          </div>
                          <p>
                            <strong>{authority.citation}</strong>
                          </p>
                          <p>{authority.title}</p>
                          <p className="muted">{authority.excerpt}</p>
                          <p className="microcopy">
                            {authority.jurisdiction ?? "Unknown jurisdiction"}
                            {authority.effective_date ? ` | ${authority.effective_date}` : ""}
                            {authority.tax_year ? ` | Tax year ${authority.tax_year}` : ""}
                          </p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="microcopy">
                      No authorities were retrieved for this regime, so any related memo
                      discussion should be treated as incomplete.
                    </p>
                  )}

                  {bucket.notes.length ? (
                    <ul className="list-tight">
                      {bucket.notes.map((note) => (
                        <li key={note} className="microcopy">
                          {note}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
      </div>

      <div className="subpanel">
        <h3>Classified transactional tax regimes</h3>
        <ul className="list-tight">
          {analysis.classification.map((bucket) => (
            <li key={bucket.bucket}>
              <strong>{bucket.label}</strong>: {bucket.reason}
            </li>
          ))}
        </ul>
      </div>

      <div className="analysis-two-col">
        <div className="subpanel">
          <h3>Issues</h3>
          <ul className="list-tight">
            {analysis.issues.map((issue) => (
              <li key={issue.bucket}>
                <strong>{issue.name}</strong>: {issue.description}
                <div className="microcopy">
                  Severity: {issue.severity} | {supportCopy(bucketSupport.get(issue.bucket) ?? ("unsupported" as SupportLabel))}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="subpanel">
          <h3>Missing facts</h3>
          <ul className="list-tight">
            {analysis.missing_facts.map((item) => (
              <li key={`${item.bucket}-${item.question}`}>
                <strong>{item.question}</strong>
                <div className="muted">{item.rationale}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="subpanel">
        <h3>Structural alternatives</h3>
        <div className="alternatives-grid">
          {analysis.alternatives.map((alternative) => (
            <article key={alternative.name} className="document-card alternative-card">
              <div className="alternative-header">
                <h3>{alternative.name}</h3>
                <span
                  className={`support-pill ${
                    alternative.unsupported_assertions.length ? "support-unsupported" : "support-primary"
                  }`}
                >
                  {alternative.unsupported_assertions.length ? "Partly preliminary" : "Grounded"}
                </span>
              </div>
              <p className="alternative-description">{alternative.description}</p>

              <div className="alternative-meta">
                <div className="alternative-section">
                  <h4>Tax consequences</h4>
                  <ul className="list-tight">
                    {alternative.tax_consequences.map((consequence) => (
                      <li key={consequence.text} className="alternative-point">
                        <span
                          className={`inline-badge ${
                            consequence.supported ? "badge-supported" : "badge-flagged"
                          }`}
                        >
                          {consequence.supported ? "Grounded" : "Preliminary"}
                        </span>
                        {consequence.text}
                        {consequence.note ? (
                          <div className="microcopy">{consequence.note}</div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="alternative-section">
                  <h4>Assumptions</h4>
                  <ul className="list-tight">
                    {alternative.assumptions.map((assumption) => (
                      <li key={assumption}>{assumption}</li>
                    ))}
                  </ul>
                </div>

                <div className="alternative-section">
                  <h4>Missing facts</h4>
                  <ul className="list-tight">
                    {alternative.missing_facts.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                </div>

                <div className="alternative-section">
                  <h4>Risks and uncertainty</h4>
                  <ul className="list-tight">
                    {alternative.risks_uncertainty.map((risk) => (
                      <li key={risk.text} className="alternative-point">
                        {risk.text}
                        {risk.note ? <div className="microcopy">{risk.note}</div> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <h4>Governing authorities</h4>
              <ul className="list-tight">
                {alternative.governing_authorities.map((authority) => (
                  <li key={`${alternative.name}-${authority.authority_id}`}>
                    <strong>{authority.citation}</strong>: {authority.title}
                  </li>
                ))}
              </ul>

              {alternative.unsupported_assertions.length ? (
                <>
                  <h4>Unsupported assertions</h4>
                  <ul className="list-tight">
                    {alternative.unsupported_assertions.map((assertion) => (
                      <li key={assertion}>{assertion}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </article>
          ))}
        </div>
      </div>

      <div className="subpanel">
        <h3>Memo output</h3>
        <p className="muted">
          The memo is a grounded first-pass draft. Any section marked secondary,
          internal-only, or unsupported should be read as preliminary rather than final.
        </p>
        <div className="memo-stack">
          {analysis.memo_sections.map((section) => (
            <article
              key={section.heading}
              className={!section.supported ? "memo-section memo-section-flagged" : "memo-section"}
            >
              <div className="row-between">
                <div className="memo-heading-block">
                  <span className="memo-kicker">{sectionTone(section)}</span>
                  <h3>{section.heading}</h3>
                </div>
                <span className={`support-pill ${section.supported ? "support-primary" : "support-unsupported"}`}>
                  {section.supported ? "Primary-authority supported" : "Preliminary"}
                </span>
              </div>
              <p className="memo-body">{section.body}</p>
              {section.note ? <p className="microcopy">{section.note}</p> : null}
              {section.citations.length ? (
                <div className="memo-citations">
                  {section.citations.map((citation) => (
                    <p key={`${section.heading}-${citation.authority_id}`} className="citation">
                      <strong>{citation.citation}</strong>: {citation.title}
                    </p>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
