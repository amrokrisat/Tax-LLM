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
import { embeddedDemoScenario } from "@/lib/demo-scenario";

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
    } catch {
      setRequest(embeddedDemoScenario);
      setIntakeMode("demo");
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
          <h1>Transactional tax analysis, grounded in authority.</h1>
          <p className="lede">
            Capture deal facts, organize the transaction into transactional-tax regimes, and
            generate a citation-aware draft that shows where the analysis is strong and
            where it remains preliminary.
          </p>
          <p className="muted">
            Project Atlas is available as a one-click sample matter, and the form remains
            fully editable after loading it.
          </p>
        </div>

        <div className="hero-card">
          <h2>What the demo shows</h2>
          <ul className="list-tight">
            <li>Fact-sensitive regime spotting for corporate, partnership, and overlay transactions</li>
            <li>Authority review with source types, citations, and excerpts</li>
            <li>Coverage warnings where support is weak or incomplete</li>
            <li>Side-by-side structural alternatives and memo-style analysis</li>
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
