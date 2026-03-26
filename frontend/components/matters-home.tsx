"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  MatterRecord,
  createMatter,
  emptyRequest,
  getDemoScenario,
  listMatters,
} from "@/lib/api";
import { LogoutButton } from "@/components/logout-button";
import { embeddedDemoScenario } from "@/lib/demo-scenario";

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
  const [matters, setMatters] = useState<MatterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<null | "blank" | "demo">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const nextMatters = await listMatters();
        setMatters(nextMatters);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load matters.");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  async function createBlankMatter() {
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
      setCreating(null);
    }
  }

  async function createDemoMatter() {
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
      setCreating(null);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero matters-hero">
        <div className="hero-copy">
          <div className="row-between">
            <p className="eyebrow">Tax LLM</p>
            <LogoutButton />
          </div>
          <h1>Transactional tax workspace for saved matters.</h1>
          <p className="lede">
            Organize each deal into its own matter, preserve the fact record and document
            set, rerun analysis as the transaction changes, and compare prior runs side by
            side.
          </p>
        </div>

        <div className="hero-card stack">
          <h2>Start a matter</h2>
          <p className="muted">
            Use a blank matter for live work or create a Project Atlas sample matter to
            demo the retrieval-first workflow.
          </p>
          <div className="button-row">
            <button className="button-primary" onClick={createBlankMatter} disabled={creating !== null}>
              {creating === "blank" ? "Creating..." : "New Matter"}
            </button>
            <button className="button-secondary" onClick={createDemoMatter} disabled={creating !== null}>
              {creating === "demo" ? "Creating sample..." : "Create Sample Matter"}
            </button>
          </div>
          {error ? <p className="status-banner warn">{error}</p> : null}
        </div>
      </section>

      <section className="panel stack">
        <div className="row-between">
          <div>
            <p className="eyebrow">Matters</p>
            <h2>Saved matters</h2>
          </div>
          {loading ? <span className="chip">Loading matters...</span> : null}
        </div>

        {matters.length === 0 && !loading ? (
          <div className="empty-state">
            <h3>No matters yet</h3>
            <p className="muted">
              Create a matter to start saving facts, reruns, authorities, and memo drafts
              in one workspace.
            </p>
          </div>
        ) : (
          <div className="matter-list">
            {matters.map((matter) => (
              <article key={matter.matter_id} className="matter-list-card">
                <div className="row-between">
                  <div>
                    <h3>{matter.matter_name}</h3>
                    <p className="muted">
                      {matter.transaction_type} · Updated {relativeTimeLabel(matter.updated_at)}
                    </p>
                  </div>
                  <Link className="button-secondary link-button" href={`/matters/${matter.matter_id}`}>
                    Open matter
                  </Link>
                </div>
                <p>{matter.facts.summary || "No summary yet."}</p>
                <div className="chip-row">
                  <span className="chip">{matter.analysis_runs.length} saved runs</span>
                  <span className="chip">
                    {matter.uploaded_documents.length}{" "}
                    {matter.uploaded_documents.length === 1 ? "document" : "documents"}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
