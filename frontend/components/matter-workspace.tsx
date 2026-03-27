"use client";

import Link from "next/link";
import {
  ChangeEvent,
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";

import { AppShell } from "@/components/app-shell";
import { LogoutButton } from "@/components/logout-button";
import {
  AnalysisRun,
  AnalysisRunSummary,
  AuthorityRecord,
  BucketCoverage,
  DocumentFactConfirmation,
  ExtractedFact,
  MatterRecord,
  MatterInput,
  MatterWorkspaceRecord,
  RunReviewInput,
  UploadedDocumentInput,
  analyzeMatter,
  confirmExtractedFacts,
  exportRunMarkdown,
  extractMatterDocuments,
  getDemoScenario,
  getMatterRun,
  getMatterWorkspace,
  reviewRun,
  updateMatter,
} from "@/lib/api";
import { embeddedDemoScenario } from "@/lib/demo-scenario";
import { startPerf } from "@/lib/perf";
import { MatterHeader } from "@/components/workspace/matter-header";
import { RunHistoryPanel } from "@/components/workspace/run-history-panel";
import { WorkspaceTab, WorkspaceTabs } from "@/components/workspace/workspace-tabs";
import { FactsPane } from "@/components/workspace/facts-pane";
import { DocumentsPane } from "@/components/workspace/documents-pane";
import { IssuesPane } from "@/components/workspace/issues-pane";
import { AuthoritiesPane } from "@/components/workspace/authorities-pane";
import { AlternativesPane } from "@/components/workspace/alternatives-pane";
import { MemoPane } from "@/components/workspace/memo-pane";
import { WarningsPane } from "@/components/workspace/warnings-pane";

type MatterWorkspaceProps = {
  matterId: string;
};

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

function supportClass(label: string) {
  if (label === "Primary support") {
    return "support-primary";
  }
  if (label === "Secondary support") {
    return "support-secondary";
  }
  if (label === "Preliminary only") {
    return "support-internal";
  }
  return "support-unsupported";
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

function summarizeRun(run: AnalysisRun): AnalysisRunSummary {
  return {
    run_id: run.run_id,
    created_at: run.created_at,
    issue_bucket_count: run.result.classification.length,
    authority_count: run.result.authorities_reviewed.length,
    review_status: run.review_status,
    reviewed_at: run.reviewed_at,
    reviewed_by: run.reviewed_by,
  };
}

function summarizeMatter(matter: MatterRecord): MatterWorkspaceRecord {
  return {
    matter_id: matter.matter_id,
    matter_name: matter.matter_name,
    transaction_type: matter.transaction_type,
    facts: matter.facts,
    uploaded_documents: matter.uploaded_documents,
    analysis_runs: matter.analysis_runs.map(summarizeRun),
    created_at: matter.created_at,
    updated_at: matter.updated_at,
  };
}

function mapRunsById(runs: AnalysisRun[]) {
  return Object.fromEntries(runs.map((run) => [run.run_id, run])) as Record<string, AnalysisRun>;
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

function mergeConfirmedFactsIntoDraft(
  facts: MatterRecord["facts"],
  documents: UploadedDocumentInput[],
): MatterRecord["facts"] {
  const nextFacts = structuredClone(facts);
  const confirmed = documents.flatMap((document) =>
    (document.extracted_facts ?? []).filter((fact) => fact.status === "confirmed"),
  );
  const summaryFragments = new Set(
    nextFacts.summary
      .split(/(?<=[.])\s+/)
      .map((fragment) => fragment.trim())
      .filter(Boolean),
  );

  for (const fact of confirmed) {
    const value = fact.value.trim();
    const lowered = value.toLowerCase();
    if (!value) {
      continue;
    }

    if (fact.label === "Potential transaction form") {
      if (lowered.includes("merger")) {
        nextFacts.transaction_type = "merger";
      } else if (lowered.includes("asset")) {
        nextFacts.transaction_type = "asset sale";
      } else if (lowered.includes("stock")) {
        nextFacts.transaction_type = "stock sale";
      }
    }

    if (fact.label === "Consideration feature") {
      nextFacts.rollover_equity = true;
      if (!nextFacts.consideration_mix.toLowerCase().includes("rollover")) {
        nextFacts.consideration_mix = [nextFacts.consideration_mix, value].filter(Boolean).join(" ");
      }
    }

    if (fact.label === "Attribute preservation") {
      if (!nextFacts.stated_goals.includes("Preserve tax attributes where possible")) {
        nextFacts.stated_goals = [...nextFacts.stated_goals, "Preserve tax attributes where possible"];
      }
      summaryFragments.add(value.endsWith(".") ? value : `${value}.`);
    }

    if (fact.label === "Financing overlay") {
      nextFacts.debt_financing = true;
      summaryFragments.add(value.endsWith(".") ? value : `${value}.`);
    }

    if (fact.label === "Deferred consideration") {
      nextFacts.earnout = true;
      summaryFragments.add(value.endsWith(".") ? value : `${value}.`);
    }
  }

  nextFacts.summary = [...summaryFragments].join(" ");
  return nextFacts;
}

function reviewKeyForBucket(bucket: string) {
  return `bucket:${bucket}`;
}

function reviewKeyForMemo(heading: string) {
  return `memo:${heading}`;
}

function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function MatterWorkspace({ matterId }: MatterWorkspaceProps) {
  const [matter, setMatter] = useState<MatterWorkspaceRecord | null>(null);
  const [runDetailsById, setRunDetailsById] = useState<Record<string, AnalysisRun>>({});
  const [draftMatterName, setDraftMatterName] = useState("");
  const [draftFacts, setDraftFacts] = useState<MatterRecord["facts"] | null>(null);
  const [draftDocuments, setDraftDocuments] = useState<UploadedDocumentInput[]>([]);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("facts");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [compareRunId, setCompareRunId] = useState<string>("");
  const [reviewerName, setReviewerName] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [confirmingFacts, setConfirmingFacts] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copyingExport, setCopyingExport] = useState(false);
  const [loadingRunIds, setLoadingRunIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const deferredActiveTab = useDeferredValue(activeTab);

  function syncWorkspace(nextMatter: MatterWorkspaceRecord, nextRunDetailsById: Record<string, AnalysisRun> = {}) {
    setMatter(nextMatter);
    setRunDetailsById((current) => ({ ...current, ...nextRunDetailsById }));
    setDraftMatterName(nextMatter.matter_name);
    setDraftFacts(nextMatter.facts);
    setDraftDocuments(nextMatter.uploaded_documents);
    setSelectedRunId((current) => current ?? nextMatter.analysis_runs[0]?.run_id ?? null);
    setCompareRunId((current) => current || (nextMatter.analysis_runs[1]?.run_id ?? ""));
  }

  function syncFullMatter(nextMatter: MatterRecord) {
    syncWorkspace(summarizeMatter(nextMatter), mapRunsById(nextMatter.analysis_runs));
  }

  const ensureRunDetail = useCallback(async (runId: string) => {
    if (runDetailsById[runId] || loadingRunIds.includes(runId)) {
      return;
    }

    setLoadingRunIds((current) => [...current, runId]);
    try {
      const run = await getMatterRun(matterId, runId);
      setRunDetailsById((current) => ({ ...current, [runId]: run }));
    } finally {
      setLoadingRunIds((current) => current.filter((currentRunId) => currentRunId !== runId));
    }
  }, [loadingRunIds, matterId, runDetailsById]);

  useEffect(() => {
    async function loadMatter() {
      const endPerf = startPerf("matter-workspace.load");
      setLoading(true);
      setError(null);

      try {
        const nextMatter = await getMatterWorkspace(matterId);
        syncWorkspace(nextMatter);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load matter.");
      } finally {
        endPerf();
        setLoading(false);
      }
    }

    void loadMatter();
  }, [matterId]);

  useEffect(() => {
    if (selectedRunId) {
      void ensureRunDetail(selectedRunId).catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Failed to load analysis run.");
      });
    }
  }, [ensureRunDetail, selectedRunId]);

  useEffect(() => {
    if (compareRunId) {
      void ensureRunDetail(compareRunId).catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Failed to load comparison run.");
      });
    }
  }, [compareRunId, ensureRunDetail]);

  const selectedRun = useMemo(
    () =>
      (selectedRunId ? runDetailsById[selectedRunId] : null) ??
      (matter?.analysis_runs[0] ? runDetailsById[matter.analysis_runs[0].run_id] ?? null : null),
    [matter, runDetailsById, selectedRunId],
  );
  const deferredSelectedRun = useDeferredValue(selectedRun);
  const compareRun = useMemo(
    () => (compareRunId ? runDetailsById[compareRunId] ?? null : null),
    [compareRunId, runDetailsById],
  );
  const comparison = useMemo(() => compareRuns(deferredSelectedRun, compareRun), [deferredSelectedRun, compareRun]);

  useEffect(() => {
    setReviewerName(selectedRun?.reviewed_by ?? "");
    setReviewNote("");
  }, [selectedRun?.run_id, selectedRun?.reviewed_by]);

  if (loading) {
    return (
      <AppShell variant="app" actions={<LogoutButton />}>
        <main className="page-shell">
          <div className="workspace-loading">
            <div className="loading-card" />
            <div className="loading-layout">
              <div className="loading-card loading-sidebar" />
              <div className="loading-card loading-main" />
            </div>
          </div>
        </main>
      </AppShell>
    );
  }

  if (!matter || !draftFacts) {
    return (
      <AppShell variant="app" actions={<LogoutButton />}>
        <main className="page-shell">
          <section className="workspace-main-panel stack">
            <h2>Matter unavailable</h2>
            <p className="muted">{error ?? "This matter could not be loaded."}</p>
            <Link className="button-ghost link-button" href="/app">
              Back to matters
            </Link>
          </section>
        </main>
      </AppShell>
    );
  }

  const activeAnalysis = deferredSelectedRun?.result ?? null;
  const currentMatterId = matter.matter_id;
  const currentDraftFacts = draftFacts;
  const selectedRunLoading = Boolean(selectedRunId && !deferredSelectedRun && loadingRunIds.includes(selectedRunId));
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
  const confirmedExtractedFacts = draftDocuments.flatMap((document) =>
    (document.extracted_facts ?? []).filter((fact) => fact.status === "confirmed"),
  );

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

  function updateExtractedFact(
    documentIndex: number,
    factId: string,
    field: keyof ExtractedFact,
    value: string,
  ) {
    setDraftDocuments((current) =>
      current.map((document, nextDocumentIndex) =>
        nextDocumentIndex === documentIndex
          ? {
              ...document,
              extracted_facts: (document.extracted_facts ?? []).map((fact) =>
                fact.fact_id === factId ? { ...fact, [field]: value } : fact,
              ),
            }
          : document,
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
              mime_type: file.type || null,
              extraction_status: "not_requested",
              extracted_text: null,
              extracted_facts: [],
            }
          : document,
      ),
    );
  }

  async function persistDraftMatter() {
      const nextMatter = await updateMatter(
        currentMatterId,
        createMatterInput(draftMatterName, currentDraftFacts, draftDocuments),
      );
    syncFullMatter(nextMatter);
    return nextMatter;
  }

  async function loadDemoIntoMatter() {
    setError(null);
    setSuccess(null);

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
        extraction_status: "not_requested",
        extracted_facts: [],
      },
    ]);
  }

  async function saveMatterAction() {
    const endPerf = startPerf("matter-workspace.save");
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await persistDraftMatter();
      setSuccess("Matter saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save matter.");
    } finally {
      endPerf();
      setSaving(false);
    }
  }

  async function runAnalysis() {
    const endPerf = startPerf("matter-workspace.analyze");
    setAnalyzing(true);
    setError(null);
    setSuccess(null);

    try {
      const nextMatter = await analyzeMatter(
        currentMatterId,
        createMatterInput(draftMatterName, currentDraftFacts, draftDocuments),
      );
      syncFullMatter(nextMatter);
      setSelectedRunId(nextMatter.analysis_runs[0]?.run_id ?? null);
      setCompareRunId(nextMatter.analysis_runs[1]?.run_id ?? "");
      setActiveTab("issues");
      setSuccess("Analysis run saved.");
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Analysis failed.");
    } finally {
      endPerf();
      setAnalyzing(false);
    }
  }

  async function extractDocumentsAction() {
    const endPerf = startPerf("matter-workspace.extract");
    setExtracting(true);
    setError(null);
    setSuccess(null);
    try {
      if (hasUnsavedChanges) {
        await persistDraftMatter();
      }
      const nextMatter = await extractMatterDocuments(currentMatterId);
      syncFullMatter(nextMatter);
      setActiveTab("documents");
      setSuccess("Extracted text and fact candidates generated.");
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : "Document extraction failed.");
    } finally {
      endPerf();
      setExtracting(false);
    }
  }

  async function confirmFactsAction() {
    const endPerf = startPerf("matter-workspace.confirm-facts");
    setConfirmingFacts(true);
    setError(null);
    setSuccess(null);
    try {
      if (hasUnsavedChanges) {
        await persistDraftMatter();
      }
      const confirmations: DocumentFactConfirmation[] = draftDocuments.flatMap((document, documentIndex) =>
        (document.extracted_facts ?? [])
          .filter((fact) => fact.status !== "pending")
          .map((fact) => ({
            document_index: documentIndex,
            fact_id: fact.fact_id,
            status: fact.status,
          })),
      );

      if (confirmations.length === 0) {
        throw new Error("Mark at least one extracted fact as confirmed or rejected first.");
      }

      const nextMatter = await confirmExtractedFacts(currentMatterId, confirmations);
      syncFullMatter(nextMatter);
      setSuccess("Extracted fact review saved.");
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "Failed to confirm extracted facts.");
    } finally {
      endPerf();
      setConfirmingFacts(false);
    }
  }

  function mergeConfirmedFactsAction() {
    setDraftFacts((current) => (current ? mergeConfirmedFactsIntoDraft(current, draftDocuments) : current));
    setSuccess("Confirmed extracted facts merged into the draft matter facts. Save the matter to persist them.");
    setActiveTab("facts");
  }

  async function saveRunReview(payload: RunReviewInput, successMessage: string) {
    if (!selectedRun) {
      return;
    }
    const endPerf = startPerf("matter-workspace.review-save");
    setReviewSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const nextMatter = await reviewRun(currentMatterId, selectedRun.run_id, payload);
      syncFullMatter(nextMatter);
      setSelectedRunId(selectedRun.run_id);
      setSuccess(successMessage);
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Failed to save review state.");
    } finally {
      endPerf();
      setReviewSaving(false);
    }
  }

  function toggleReviewedSection(sectionKey: string) {
    if (!selectedRun) {
      return;
    }
    const reviewedSections = selectedRun.reviewed_sections.includes(sectionKey)
      ? selectedRun.reviewed_sections.filter((item) => item !== sectionKey)
      : [...selectedRun.reviewed_sections, sectionKey];

    void saveRunReview(
      {
        review_status: selectedRun.review_status,
        reviewed_by: reviewerName,
        note: "",
        pinned_authority_ids: selectedRun.pinned_authority_ids,
        reviewed_sections: reviewedSections,
      },
      "Reviewed sections updated.",
    );
  }

  function togglePinnedAuthority(authorityId: string) {
    if (!selectedRun) {
      return;
    }
    const pinnedAuthorityIds = selectedRun.pinned_authority_ids.includes(authorityId)
      ? selectedRun.pinned_authority_ids.filter((item) => item !== authorityId)
      : [...selectedRun.pinned_authority_ids, authorityId];

    void saveRunReview(
      {
        review_status: selectedRun.review_status,
        reviewed_by: reviewerName,
        note: "",
        pinned_authority_ids: pinnedAuthorityIds,
        reviewed_sections: selectedRun.reviewed_sections,
      },
      "Pinned authorities updated.",
    );
  }

  async function saveReviewerNoteAction() {
    if (!selectedRun) {
      return;
    }
    await saveRunReview(
      {
        review_status: selectedRun.review_status,
        reviewed_by: reviewerName,
        note: reviewNote,
        pinned_authority_ids: selectedRun.pinned_authority_ids,
        reviewed_sections: selectedRun.reviewed_sections,
      },
      "Reviewer note saved.",
    );
    setReviewNote("");
  }

  async function updateRunReviewStatus(reviewStatus: AnalysisRun["review_status"]) {
    if (!selectedRun) {
      return;
    }
    await saveRunReview(
      {
        review_status: reviewStatus,
        reviewed_by: reviewerName,
        note: "",
        pinned_authority_ids: selectedRun.pinned_authority_ids,
        reviewed_sections: selectedRun.reviewed_sections,
      },
      "Run review state updated.",
    );
  }

  async function exportMarkdownAction(copyOnly = false) {
    if (!selectedRun) {
      return;
    }
    const endPerf = startPerf(copyOnly ? "matter-workspace.export-copy" : "matter-workspace.export-download");
    if (copyOnly) {
      setCopyingExport(true);
    } else {
      setExporting(true);
    }
    setError(null);
    setSuccess(null);
    try {
      const content = await exportRunMarkdown(currentMatterId, selectedRun.run_id);
      if (copyOnly) {
        await navigator.clipboard.writeText(content);
        setSuccess("Export markdown copied.");
      } else {
        downloadTextFile(`${draftMatterName || "tax-llm-memo"}.md`, content);
        setSuccess("Markdown export downloaded.");
      }
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Export failed.");
    } finally {
      endPerf();
      setExporting(false);
      setCopyingExport(false);
    }
  }

  return (
    <AppShell variant="app" actions={<LogoutButton />}>
      <main className="page-shell">
        <MatterHeader
          matterName={draftMatterName}
          transactionType={draftFacts.transaction_type}
          createdAt={formatTimestamp(matter.created_at)}
          updatedAt={formatTimestamp(matter.updated_at)}
          runCount={matter.analysis_runs.length}
          documentCount={draftDocuments.length}
          pinnedCount={deferredSelectedRun?.pinned_authority_ids.length ?? 0}
          hasUnsavedChanges={hasUnsavedChanges}
          saving={saving}
          analyzing={analyzing}
          onLoadDemo={() => void loadDemoIntoMatter()}
          onSave={() => void saveMatterAction()}
          onAnalyze={() => void runAnalysis()}
        />

        {success ? <p className="status-banner ok">{success}</p> : null}
        {error ? <p className="status-banner warn">{error}</p> : null}

        <section className="workspace-grid-v3">
          <RunHistoryPanel
            runs={matter.analysis_runs}
            selectedRunId={selectedRunId}
            compareRunId={compareRunId}
            onSelectRun={setSelectedRunId}
            onCompareChange={setCompareRunId}
            comparison={comparison}
            reviewerName={reviewerName}
            reviewNote={reviewNote}
            reviewSaving={reviewSaving}
            selectedRun={deferredSelectedRun}
            onReviewerNameChange={setReviewerName}
            onReviewNoteChange={setReviewNote}
            onSaveNote={() => void saveReviewerNoteAction()}
            onReviewStatusChange={(status) => void updateRunReviewStatus(status)}
          />

          <section className="workspace-main-panel">
            <WorkspaceTabs
              activeTab={activeTab}
              onTabChange={(tab) =>
                startTransition(() => {
                  setActiveTab(tab);
                })
              }
            />

            {selectedRunLoading &&
            (deferredActiveTab === "issues" ||
              deferredActiveTab === "authorities" ||
              deferredActiveTab === "alternatives" ||
              deferredActiveTab === "memo" ||
              deferredActiveTab === "warnings") ? (
              <div className="subpanel stack">
                <h3>Loading run detail</h3>
                <p className="muted">
                  Fetching the selected analysis run before rendering this section.
                </p>
              </div>
            ) : null}

            {deferredActiveTab === "facts" ? (
              <FactsPane
                confirmedExtractedFacts={confirmedExtractedFacts}
                draftMatterName={draftMatterName}
                draftFacts={draftFacts}
                setDraftMatterName={setDraftMatterName}
                updateFact={updateFact}
                updateListField={updateListField}
                onMergeConfirmedFacts={mergeConfirmedFactsAction}
              />
            ) : null}

            {deferredActiveTab === "documents" ? (
              <DocumentsPane
                draftDocuments={draftDocuments}
                extracting={extracting}
                confirmingFacts={confirmingFacts}
                onAddDocument={addDocument}
                onExtract={() => void extractDocumentsAction()}
                onConfirmFacts={() => void confirmFactsAction()}
                onFileUpload={(index, event) => void handleFileUpload(index, event)}
                updateDocument={updateDocument}
                updateExtractedFact={updateExtractedFact}
              />
            ) : null}

            {deferredActiveTab === "issues" && !selectedRunLoading ? (
              <IssuesPane
                activeAnalysis={activeAnalysis}
                selectedRun={deferredSelectedRun}
                supportLabel={supportLabel}
                reviewKeyForBucket={reviewKeyForBucket}
                toggleReviewedSection={toggleReviewedSection}
              />
            ) : null}

            {deferredActiveTab === "authorities" && !selectedRunLoading ? (
              <AuthoritiesPane
                activeAnalysis={activeAnalysis}
                selectedRun={deferredSelectedRun}
                groupAuthoritiesBySource={groupAuthoritiesBySource}
                supportLabel={supportLabel}
                supportClass={supportClass}
                reviewKeyForBucket={reviewKeyForBucket}
                toggleReviewedSection={toggleReviewedSection}
                togglePinnedAuthority={togglePinnedAuthority}
              />
            ) : null}

            {deferredActiveTab === "alternatives" && !selectedRunLoading ? (
              <AlternativesPane activeAnalysis={activeAnalysis} />
            ) : null}

            {deferredActiveTab === "memo" && !selectedRunLoading ? (
              <MemoPane
                activeAnalysis={activeAnalysis}
                selectedRun={deferredSelectedRun}
                copyingExport={copyingExport}
                exporting={exporting}
                exportMarkdownAction={(copyOnly) => void exportMarkdownAction(copyOnly)}
                reviewKeyForMemo={reviewKeyForMemo}
                toggleReviewedSection={toggleReviewedSection}
              />
            ) : null}

            {deferredActiveTab === "warnings" && !selectedRunLoading ? (
              <WarningsPane activeAnalysis={activeAnalysis} warningBuckets={warningBuckets} supportLabel={supportLabel} />
            ) : null}
          </section>
        </section>
      </main>
    </AppShell>
  );
}
