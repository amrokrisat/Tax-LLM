"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import {
  createMatter,
  emptyRequest,
  getDemoScenario,
  MatterSummary,
  listMatterSummaries,
} from "@/lib/api";
import { LogoutButton } from "@/components/logout-button";
import { embeddedDemoScenario } from "@/lib/demo-scenario";
import { startPerf } from "@/lib/perf";

function relativeTimeLabel(timestamp: string) {
  const deltaMs = Date.now() - new Date(timestamp).getTime();
  const deltaHours = Math.max(1, Math.round(deltaMs / (1000 * 60 * 60)));
  if (deltaHours < 24) {
    return `${deltaHours}h ago`;
  }
  const deltaDays = Math.round(deltaHours / 24);
  return `${deltaDays}d ago`;
}

export function MattersHome() {
  const router = useRouter();
  const [matters, setMatters] = useState<MatterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<null | "blank" | "demo">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const endPerf = startPerf("matters-home.load");
      try {
        const nextMatters = await listMatterSummaries();
        setMatters(nextMatters);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load matters.");
      } finally {
        endPerf();
        setLoading(false);
      }
    }

    void load();
  }, []);

  async function createBlankMatter() {
    const endPerf = startPerf("matters-home.create-blank");
    setCreating("blank");
    setError(null);

    try {
      const matter = await createMatter({
        matter_name: "New Matter",
        transaction_type: emptyRequest.facts.transaction_type,
        facts: {
          ...emptyRequest.facts,
          transaction_name: "New Matter",
        },
        uploaded_documents: [],
      });
      router.push(`/matters/${matter.matter_id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create matter.");
    } finally {
      endPerf();
      setCreating(null);
    }
  }

  async function createDemoMatter() {
    const endPerf = startPerf("matters-home.create-demo");
    setCreating("demo");
    setError(null);

    try {
      const scenario = await getDemoScenario().catch(() => embeddedDemoScenario);
      const matter = await createMatter({
        matter_name: scenario.facts.transaction_name,
        transaction_type: scenario.facts.transaction_type,
        facts: scenario.facts,
        uploaded_documents: scenario.uploaded_documents,
      });
      router.push(`/matters/${matter.matter_id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to create sample matter.");
    } finally {
      endPerf();
      setCreating(null);
    }
  }

  return (
    <AppShell variant="app" actions={<LogoutButton />}>
      <main className="page-shell workspace-home">
        <section className="workspace-hero">
          <div className="workspace-hero-copy">
            <p className="eyebrow">Tax LLM</p>
            <h1 className="workspace-title">Saved matters for live transactional-tax structuring work.</h1>
            <p className="workspace-subtitle">
              Keep each matter in its own workspace, preserve reruns and review state, and move from draft facts to exportable memo output without losing transactional tax authority support.
            </p>
          </div>

          <div className="workspace-hero-actions workspace-hero-actions-column">
            <button className="button-primary" onClick={createBlankMatter} disabled={creating !== null}>
              {creating === "blank" ? "Creating..." : "New matter"}
            </button>
            <button className="button-subtle" onClick={createDemoMatter} disabled={creating !== null}>
              {creating === "demo" ? "Creating sample..." : "Create sample matter"}
            </button>
          </div>
        </section>

        {error ? <p className="status-banner warn">{error}</p> : null}

        <section className="workspace-main-panel">
          <div className="workspace-section-header">
            <div>
              <h2>Matters</h2>
              <p className="muted">Open a saved matter or start a new one.</p>
            </div>
            {loading ? <span className="chip">Loading matters...</span> : null}
          </div>

          {matters.length === 0 && !loading ? (
            <div className="empty-panel">
              <h3>No matters yet</h3>
              <p className="muted">
                Create a matter to start saving facts, reruns, authorities, and transactional tax analysis in one workspace.
              </p>
            </div>
          ) : (
            <div className="matter-grid">
              {matters.map((matter) => (
                <article key={matter.matter_id} className="matter-card">
                  <div className="row-between">
                    <div>
                      <h3>{matter.matter_name}</h3>
                      <p className="muted">
                        {matter.transaction_type} · Updated {relativeTimeLabel(matter.updated_at)}
                      </p>
                    </div>
                    <Link className="button-ghost link-button" href={`/matters/${matter.matter_id}`}>
                      Open matter
                    </Link>
                  </div>
                  <p className="matter-card-summary">{matter.summary || "No summary yet."}</p>
                  <div className="chip-row">
                    <span className="chip">{matter.analysis_run_count} saved runs</span>
                    <span className="chip">{matter.document_count} {matter.document_count === 1 ? "document" : "documents"}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </AppShell>
  );
}
