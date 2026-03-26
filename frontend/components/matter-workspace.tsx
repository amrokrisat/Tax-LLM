"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useMemo, useState } from "react";

import { LogoutButton } from "@/components/logout-button";
import {
  AnalysisRun,
  AuthorityRecord,
  BucketCoverage,
  MatterRecord,
  MatterInput,
  UploadedDocumentInput,
  analyzeMatter,
  getMatter,
  getDemoScenario,
  updateMatter,
} from "@/lib/api";
import { embeddedDemoScenario } from "@/lib/demo-scenario";

type MatterWorkspaceProps = {
  matterId: string;
};

type WorkspaceTab =
  | "facts"
  | "documents"
  | "issues"
  | "authorities"
  | "alternatives"
  | "memo"
  | "warnings";

const workspaceTabs: Array<{ key: WorkspaceTab; label: string }> = [
  { key: "facts", label: "Facts" },
  { key: "documents", label: "Documents" },
  { key: "issues", label: "Issues" },
  { key: "authorities", label: "Authorities" },
  { key: "alternatives", label: "Alternatives" },
  { key: "memo", label: "Memo" },
  { key: "warnings", label: "Warnings" },
];

function supportLabel(bucket: BucketCoverage) {
  if (bucket.status === "under_supported" || bucket.authorities.length === 0) {
    return "Unsupported";
  }

  const sourceTypes = new Set(bucket.authorities.map((authority) => authority.source_type));
  const hasPrimary = sourceTypes.has("code") || sourceTypes.has("regs");
  const hasSecondary =
    sourceTypes.has("irs_guidance") || sourceTypes.has("cases") || sourceTypes.has("forms");
  const internalOnly = sourceTypes.size > 0 && [...sourceTypes].every((type) => type === "internal");

  if (hasPrimary) {
    return "Primary support";
  }
  if (internalOnly) {
    return "Preliminary only";
  }
  if (hasSecondary) {
    return "Secondary support";
  }
  return "Unsupported";
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

function formatTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function createMatterInput(
  matterName: string,
  draftFacts: MatterRecord["facts"],
  draftDocuments: UploadedDocumentInput[],
): MatterInput {
  return {
    matter_name: matterName,
    transaction_type: draftFacts.transaction_type,
    facts: draftFacts,
    uploaded_documents: draftDocuments,
  };
}

function compareRuns(currentRun: AnalysisRun | null, previousRun: AnalysisRun | null) {
  if (!currentRun || !previousRun) {
    return null;
  }

  const currentBuckets = new Set(currentRun.result.classification.map((bucket) => bucket.label));
  const previousBuckets = new Set(previousRun.result.classification.map((bucket) => bucket.label));
  const addedBuckets = [...currentBuckets].filter((bucket) => !previousBuckets.has(bucket));
  const removedBuckets = [...previousBuckets].filter((bucket) => !currentBuckets.has(bucket));
  const authorityDelta =
    currentRun.result.authorities_reviewed.length - previousRun.result.authorities_reviewed.length;
  const warningChanged =
    currentRun.result.completeness_warning !== previousRun.result.completeness_warning;

  return {
    addedBuckets,
    removedBuckets,
    authorityDelta,
    warningChanged,
  };
}

function groupAuthoritiesBySource(bucket: BucketCoverage) {
  return bucket.authorities.reduce<Record<string, AuthorityRecord[]>>((groups, authority) => {
    const source = sourceTypeLabel(authority.source_type);
    if (!groups[source]) {
      groups[source] = [];
    }
    groups[source].push(authority);
    return groups;
  }, {});
}

function isTextLikeFile(file: File) {
  return (
    file.type.startsWith("text/") ||
    file.name.endsWith(".txt") ||
    file.name.endsWith(".md") ||
    file.name.endsWith(".json") ||
    file.name.endsWith(".csv")
  );
}

function uploadedFilePlaceholder(file: File) {
  const extension = file.name.split(".").pop()?.toUpperCase() ?? "FILE";
  return [
    `Uploaded file: ${file.name}`,
    `${extension} upload saved to the matter workspace.`,
    "Automated extraction for this file type is not implemented yet, so paste key excerpts or a short summary here before running analysis.",
  ].join("\n");
}

export function MatterWorkspace({ matterId }: MatterWorkspaceProps) {
  const [matter, setMatter] = useState<MatterRecord | null>(null);
  const [draftMatterName, setDraftMatterName] = useState("");
  const [draftFacts, setDraftFacts] = useState<MatterRecord["facts"] | null>(null);
  const [draftDocuments, setDraftDocuments] = useState<UploadedDocumentInput[]>([]);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("facts");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [compareRunId, setCompareRunId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadMatter() {
      setLoading(true);
      setError(null);

      try {
        const nextMatter = await getMatter(matterId);
        setMatter(nextMatter);
        setDraftMatterName(nextMatter.matter_name);
        setDraftFacts(nextMatter.facts);
        setDraftDocuments(nextMatter.uploaded_documents);
        setSelectedRunId(nextMatter.analysis_runs[0]?.run_id ?? null);
        setCompareRunId(nextMatter.analysis_runs[1]?.run_id ?? "");
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load matter.");
      } finally {
        setLoading(false);
      }
    }

    void loadMatter();
  }, [matterId]);

  const selectedRun = useMemo(
    () => matter?.analysis_runs.find((run) => run.run_id === selectedRunId) ?? matter?.analysis_runs[0] ?? null,
    [matter, selectedRunId],
  );
  const compareRun = useMemo(
    () => matter?.analysis_runs.find((run) => run.run_id === compareRunId) ?? null,
    [matter, compareRunId],
  );
  const comparison = compareRuns(selectedRun, compareRun);

  if (loading) {
    return (
      <main className="page-shell">
        <section className="panel">
          <h2>Loading matter workspace...</h2>
        </section>
      </main>
    );
  }

  if (!matter || !draftFacts) {
    return (
      <main className="page-shell">
        <section className="panel stack">
          <h2>Matter unavailable</h2>
          <p className="muted">{error ?? "This matter could not be loaded."}</p>
          <Link className="button-secondary link-button" href="/">
            Back to matters
          </Link>
        </section>
      </main>
    );
  }

  const activeAnalysis = selectedRun?.result ?? matter.latest_analysis;
  const currentMatterId = matter.matter_id;
  const currentDraftFacts = draftFacts;
  const warningBuckets =
    activeAnalysis?.bucket_coverage.filter(
      (bucket) =>
        supportLabel(bucket) !== "Primary support" ||
        bucket.notes.length > 0 ||
        Boolean(bucket.source_priority_warning),
    ) ?? [];
  const hasUnsavedChanges =
    draftMatterName !== matter.matter_name ||
    JSON.stringify(currentDraftFacts) !== JSON.stringify(matter.facts) ||
    JSON.stringify(draftDocuments) !== JSON.stringify(matter.uploaded_documents);

  function updateFact<K extends keyof MatterRecord["facts"]>(
    key: K,
    value: MatterRecord["facts"][K],
  ) {
    setDraftFacts((current) => (current ? { ...current, [key]: value } : current));
  }

  function updateListField(
    key: "entities" | "jurisdictions" | "stated_goals" | "constraints",
    value: string,
  ) {
    updateFact(
      key,
      value
        .split("\n")
        .map((item) => item.trim())
        .filter(Boolean),
    );
  }

  function updateDocument(
    index: number,
    key: keyof UploadedDocumentInput,
    value: string,
  ) {
    setDraftDocuments((current) =>
      current.map((document, documentIndex) =>
        documentIndex === index ? { ...document, [key]: value } : document,
      ),
    );
  }

  async function handleFileUpload(index: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const content = isTextLikeFile(file) ? await file.text() : uploadedFilePlaceholder(file);
    setDraftDocuments((current) =>
      current.map((document, documentIndex) =>
        documentIndex === index
          ? {
              ...document,
              file_name: file.name,
              content,
              source: "uploaded",
            }
          : document,
      ),
    );
  }

  async function loadDemoIntoMatter() {
    setError(null);

    try {
      const scenario = await getDemoScenario().catch(() => embeddedDemoScenario);
      setDraftMatterName(scenario.facts.transaction_name);
      setDraftFacts(scenario.facts);
      setDraftDocuments(scenario.uploaded_documents);
      setActiveTab("facts");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load demo matter.");
    }
  }

  function addDocument() {
    setDraftDocuments((current) => [
      ...current,
      {
        file_name: "",
        document_type: "deal_document",
        content: "",
        source: "pasted",
      },
    ]);
  }

  async function saveMatter() {
    setSaving(true);
    setError(null);

    try {
      const nextMatter = await updateMatter(
        currentMatterId,
        createMatterInput(draftMatterName, currentDraftFacts, draftDocuments),
      );
      setMatter(nextMatter);
      setDraftMatterName(nextMatter.matter_name);
      setDraftFacts(nextMatter.facts);
      setDraftDocuments(nextMatter.uploaded_documents);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save matter.");
    } finally {
      setSaving(false);
    }
  }

  async function runAnalysis() {
    setAnalyzing(true);
    setError(null);

    try {
      const nextMatter = await analyzeMatter(
        currentMatterId,
        createMatterInput(draftMatterName, currentDraftFacts, draftDocuments),
      );
      setMatter(nextMatter);
      setDraftMatterName(nextMatter.matter_name);
      setDraftFacts(nextMatter.facts);
      setDraftDocuments(nextMatter.uploaded_documents);
      setSelectedRunId(nextMatter.analysis_runs[0]?.run_id ?? null);
      setCompareRunId(nextMatter.analysis_runs[1]?.run_id ?? "");
      setActiveTab("issues");
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="matter-header">
        <div className="panel stack">
          <div className="row-between">
            <div>
              <p className="eyebrow">Matter workspace</p>
              <h1 className="matter-title">{draftMatterName}</h1>
              <p className="muted">
                {draftFacts.transaction_type} · Created {formatTimestamp(matter.created_at)} ·
                Updated {formatTimestamp(matter.updated_at)}
              </p>
            </div>
            <div className="button-row">
              <Link className="button-tertiary link-button" href="/app">
                Back to matters
              </Link>
              <LogoutButton />
              <button className="button-secondary" onClick={loadDemoIntoMatter} type="button">
                Load Demo Scenario
              </button>
              <button className="button-secondary" onClick={saveMatter} disabled={!hasUnsavedChanges || saving}>
                {saving ? "Saving..." : "Save Matter"}
              </button>
              <button className="button-primary" onClick={runAnalysis} disabled={analyzing}>
                {analyzing ? "Analyzing..." : "Generate Analysis"}
              </button>
            </div>
          </div>
          <div className="chip-row">
            <span className="chip">{matter.analysis_runs.length} saved runs</span>
            <span className="chip">
              {draftDocuments.length} {draftDocuments.length === 1 ? "document" : "documents"}
            </span>
            {hasUnsavedChanges ? <span className="chip">Unsaved changes</span> : null}
          </div>
          {error ? <p className="status-banner warn">{error}</p> : null}
        </div>
      </section>

      <section className="matter-layout">
        <aside className="matter-sidebar">
          <div className="panel stack">
            <div>
              <h2>Run history</h2>
              <p className="muted">
                Each analysis run is saved with the facts and document set used for that run.
              </p>
            </div>

            {matter.analysis_runs.length === 0 ? (
              <p className="muted">No saved runs yet. Save facts and run analysis to begin a history.</p>
            ) : (
              <div className="run-history-list">
                {matter.analysis_runs.map((run) => (
                  <button
                    key={run.run_id}
                    className={`run-history-card ${selectedRun?.run_id === run.run_id ? "active" : ""}`}
                    onClick={() => setSelectedRunId(run.run_id)}
                    type="button"
                  >
                    <strong>{formatTimestamp(run.created_at)}</strong>
                    <span className="microcopy">
                      {run.result.classification.length} issue buckets · {run.result.authorities_reviewed.length} authorities
                    </span>
                  </button>
                ))}
              </div>
            )}

            {matter.analysis_runs.length > 1 ? (
              <div className="subpanel stack">
                <div>
                  <h3>Compare runs</h3>
                  <p className="muted">See what changed between the selected run and an earlier run.</p>
                </div>
                <label className="field">
                  <span>Compare against</span>
                  <select value={compareRunId} onChange={(event) => setCompareRunId(event.target.value)}>
                    <option value="">Select an earlier run</option>
                    {matter.analysis_runs
                      .filter((run) => run.run_id !== selectedRun?.run_id)
                      .map((run) => (
                        <option key={run.run_id} value={run.run_id}>
                          {formatTimestamp(run.created_at)}
                        </option>
                      ))}
                  </select>
                </label>

                {comparison ? (
                  <div className="comparison-card">
                    <p>
                      <strong>Authority count delta:</strong> {comparison.authorityDelta >= 0 ? "+" : ""}
                      {comparison.authorityDelta}
                    </p>
                    <p>
                      <strong>Added issue buckets:</strong>{" "}
                      {comparison.addedBuckets.length ? comparison.addedBuckets.join(", ") : "None"}
                    </p>
                    <p>
                      <strong>Removed issue buckets:</strong>{" "}
                      {comparison.removedBuckets.length ? comparison.removedBuckets.join(", ") : "None"}
                    </p>
                    <p>
                      <strong>Coverage warning changed:</strong> {comparison.warningChanged ? "Yes" : "No"}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </aside>

        <section className="matter-main">
          <div className="panel stack">
            <div className="tab-row">
              {workspaceTabs.map((tab) => (
                <button
                  key={tab.key}
                  className={`tab-button ${activeTab === tab.key ? "active" : ""}`}
                  onClick={() => setActiveTab(tab.key)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "facts" ? (
              <div className="stack">
                <div className="two-col">
                  <label className="field">
                      <span>Matter name</span>
                      <input
                      value={draftMatterName}
                      onChange={(event) => setDraftMatterName(event.target.value)}
                      />
                  </label>
                  <label className="field">
                    <span>Transaction type</span>
                    <select
                      value={draftFacts.transaction_type}
                      onChange={(event) => updateFact("transaction_type", event.target.value)}
                    >
                      {["stock sale", "asset sale", "merger", "contribution transaction", "partnership transaction"].map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <label className="field">
                  <span>Summary</span>
                  <textarea
                    rows={5}
                    value={draftFacts.summary}
                    onChange={(event) => updateFact("summary", event.target.value)}
                  />
                </label>

                <div className="two-col">
                  <label className="field">
                    <span>Entities</span>
                    <textarea
                      rows={5}
                      value={draftFacts.entities.join("\n")}
                      onChange={(event) => updateListField("entities", event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Jurisdictions</span>
                    <textarea
                      rows={5}
                      value={draftFacts.jurisdictions.join("\n")}
                      onChange={(event) => updateListField("jurisdictions", event.target.value)}
                    />
                  </label>
                </div>

                <div className="two-col">
                  <label className="field">
                    <span>Business goals</span>
                    <textarea
                      rows={4}
                      value={draftFacts.stated_goals.join("\n")}
                      onChange={(event) => updateListField("stated_goals", event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Constraints</span>
                    <textarea
                      rows={4}
                      value={draftFacts.constraints.join("\n")}
                      onChange={(event) => updateListField("constraints", event.target.value)}
                    />
                  </label>
                </div>

                <label className="field">
                  <span>Consideration mix</span>
                  <textarea
                    rows={3}
                    value={draftFacts.consideration_mix}
                    onChange={(event) => updateFact("consideration_mix", event.target.value)}
                  />
                </label>

                <label className="field">
                  <span>Proposed steps</span>
                  <textarea
                    rows={4}
                    value={draftFacts.proposed_steps}
                    onChange={(event) => updateFact("proposed_steps", event.target.value)}
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
                        checked={draftFacts[key as keyof typeof draftFacts] as boolean}
                        onChange={(event) =>
                          updateFact(
                            key as keyof typeof draftFacts,
                            event.target.checked as never,
                          )
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            {activeTab === "documents" ? (
              <div className="stack">
                <div className="row-between">
                  <div>
                    <h2>Documents</h2>
                    <p className="muted">
                      Add pasted text now, or upload PDFs and common document files. Text files are read directly; other file types are saved with an extraction-pending placeholder for now.
                    </p>
                  </div>
                  <button className="button-secondary" onClick={addDocument} type="button">
                    Add document
                  </button>
                </div>

                {draftDocuments.map((document, index) => (
                  <article key={`${document.file_name}-${index}`} className="document-card">
                    <div className="row-between">
                      <div className="chip-row">
                        <span className="chip">{document.source === "uploaded" ? "Uploaded" : "Pasted"}</span>
                      </div>
                      <label className="button-tertiary file-input-button">
                        Upload document
                        <input
                          type="file"
                          accept=".txt,.md,.json,.csv,.pdf,.doc,.docx"
                          onChange={(event) => void handleFileUpload(index, event)}
                        />
                      </label>
                    </div>
                    <div className="two-col">
                      <label className="field">
                        <span>File name</span>
                        <input
                          value={document.file_name}
                          onChange={(event) => updateDocument(index, "file_name", event.target.value)}
                        />
                      </label>
                      <label className="field">
                        <span>Document type</span>
                        <input
                          value={document.document_type}
                          onChange={(event) => updateDocument(index, "document_type", event.target.value)}
                        />
                      </label>
                    </div>
                    <label className="field">
                      <span>Content</span>
                      <textarea
                        rows={6}
                        value={document.content}
                        onChange={(event) => updateDocument(index, "content", event.target.value)}
                      />
                    </label>
                  </article>
                ))}
              </div>
            ) : null}

            {activeTab === "issues" ? (
              activeAnalysis ? (
                <div className="stack">
                  <div className="subpanel">
                    <h3>Classified issue buckets</h3>
                    <ul className="list-tight">
                      {activeAnalysis.classification.map((bucket) => (
                        <li key={bucket.bucket}>
                          <strong>{bucket.label}</strong>: {bucket.reason}
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
              ) : (
                <p className="muted">Run analysis to populate issues.</p>
              )
            ) : null}

            {activeTab === "authorities" ? (
              activeAnalysis ? (
                <div className="stack">
                  {activeAnalysis.bucket_coverage.map((bucket) => {
                    const groups = groupAuthoritiesBySource(bucket);
                    return (
                      <section key={bucket.bucket} className="subpanel stack">
                        <div className="row-between">
                          <div>
                            <h3>{bucket.label}</h3>
                            <p className="muted">{supportLabel(bucket)}</p>
                          </div>
                          <span className="chip">
                            {bucket.authorities.length} {bucket.authorities.length === 1 ? "authority" : "authorities"}
                          </span>
                        </div>

                        {Object.keys(groups).length === 0 ? (
                          <p className="muted">No authorities were retrieved for this issue area.</p>
                        ) : (
                          Object.entries(groups).map(([sourceType, authorities]) => (
                            <div key={`${bucket.bucket}-${sourceType}`} className="stack">
                              <h4>{sourceType}</h4>
                              <div className="authority-grid">
                                {authorities.map((authority) => (
                                  <article key={authority.authority_id} className="authority-card">
                                    <div className="chip-row">
                                      <span className="chip">{sourceType}</span>
                                      <span className="chip">Score {authority.relevance_score.toFixed(2)}</span>
                                    </div>
                                    <p>
                                      <strong>{authority.citation}</strong>
                                    </p>
                                    <p>{authority.title}</p>
                                    <p className="muted">{authority.excerpt}</p>
                                  </article>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </section>
                    );
                  })}
                </div>
              ) : (
                <p className="muted">Run analysis to populate authorities.</p>
              )
            ) : null}

            {activeTab === "alternatives" ? (
              activeAnalysis ? (
                <div className="alternatives-grid">
                  {activeAnalysis.alternatives.map((alternative) => (
                    <article key={alternative.name} className="document-card alternative-card">
                      <div className="alternative-header">
                        <h3>{alternative.name}</h3>
                        <span
                          className={`support-pill ${
                            alternative.unsupported_assertions.length ? "support-internal" : "support-primary"
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
              ) : (
                <p className="muted">Run analysis to populate alternatives.</p>
              )
            ) : null}

            {activeTab === "memo" ? (
              activeAnalysis ? (
                <div className="memo-stack">
                  {activeAnalysis.memo_sections.map((section) => (
                    <article
                      key={section.heading}
                      className={!section.supported ? "memo-section memo-section-flagged" : "memo-section"}
                    >
                      <div className="row-between">
                        <h3>{section.heading}</h3>
                        <span className={`support-pill ${section.supported ? "support-primary" : "support-internal"}`}>
                          {section.supported ? "Grounded" : "Preliminary"}
                        </span>
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
                  ))}
                </div>
              ) : (
                <p className="muted">Run analysis to populate the memo view.</p>
              )
            ) : null}

            {activeTab === "warnings" ? (
              activeAnalysis ? (
                <div className="stack">
                  <div className={`warning-strip ${activeAnalysis.retrieval_complete ? "ok" : "warn"}`}>
                    <strong>{activeAnalysis.retrieval_complete ? "Coverage status:" : "Coverage warning:"}</strong>
                    <span>{activeAnalysis.completeness_warning}</span>
                  </div>
                  {warningBuckets.length === 0 ? (
                    <div className="subpanel stack">
                      <h3>No open warning items</h3>
                      <p className="muted">
                        This run does not currently show bucket-level warnings beyond the
                        overall coverage note above.
                      </p>
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
                            <span
                              className={`support-pill ${
                                supportLabel(bucket) === "Unsupported"
                                  ? "support-unsupported"
                                  : "support-internal"
                              }`}
                            >
                              {supportLabel(bucket)}
                            </span>
                          </div>

                          {bucket.source_priority_warning ? (
                            <p className="status-banner warn compact-banner">
                              {bucket.source_priority_warning}
                            </p>
                          ) : null}

                          <ul className="list-tight">
                            {bucket.notes.map((note) => (
                              <li key={note}>{note}</li>
                            ))}
                            {bucket.notes.length === 0 ? (
                              <li>
                                This issue area is being kept out of the supported analysis
                                because the retrieved support remains incomplete.
                              </li>
                            ) : null}
                          </ul>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="muted">Run analysis to populate warnings and coverage notes.</p>
              )
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}
