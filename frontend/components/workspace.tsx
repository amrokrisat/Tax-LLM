"use client";

import { FormEvent, useState } from "react";

import {
  AnalysisResult,
  AnalyzeTransactionRequest,
  analyzeTransaction,
  emptyRequest,
  getDemoScenario,
} from "@/lib/api";
import { AnalysisPanel } from "@/components/analysis-panel";
import { IntakeForm } from "@/components/intake-form";

type IntakeMode = "custom" | "demo" | "demo_edited";

export function Workspace() {
  const [request, setRequest] = useState<AnalyzeTransactionRequest>(emptyRequest);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intakeMode, setIntakeMode] = useState<IntakeMode>("custom");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const result = await analyzeTransaction(request);
      setAnalysis(result);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "An unexpected error occurred.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadDemo() {
    setLoading(true);
    setError(null);

    try {
      const scenario = await getDemoScenario();
      setRequest(scenario);
      setIntakeMode("demo");
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Failed to load demo scenario.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleResetForm() {
    setRequest(emptyRequest);
    setAnalysis(null);
    setError(null);
    setIntakeMode("custom");
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Tax LLM</p>
          <h1>Retrieval-first transactional tax analysis.</h1>
          <p className="lede">
            Intake facts, classify issue buckets, retrieve tagged authorities, and
            draft a citation-aware work product with explicit coverage warnings.
          </p>
          <p className="muted">
            The demo scenario is available as a form prefill, but custom facts remain the
            default path and the form stays editable after loading the demo.
          </p>
        </div>

        <div className="hero-card">
          <h2>Backend output</h2>
          <ul className="list-tight">
            <li>Issue bucket classification before drafting</li>
            <li>Authority retrieval with source tags and metadata</li>
            <li>Coverage validation and incomplete-analysis warnings</li>
            <li>Citation-backed structural alternatives and memo sections</li>
          </ul>
        </div>
      </section>

      <section className="workspace-grid">
        <IntakeForm
          request={request}
          setRequest={setRequest}
          loading={loading}
          error={error}
          intakeMode={intakeMode}
          onLoadDemo={handleLoadDemo}
          onReset={handleResetForm}
          onEdit={() =>
            setIntakeMode((current) => (current === "demo" ? "demo_edited" : current))
          }
          onSubmit={handleSubmit}
        />
        <AnalysisPanel analysis={analysis} loading={loading} />
      </section>
    </main>
  );
}
