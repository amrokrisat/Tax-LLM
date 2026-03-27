"use client";

import Link from "next/link";

import { AppShell } from "@/components/app-shell";

export function LandingPage() {
  return (
    <AppShell variant="public">
      <main className="page-shell landing-shell">
        <section className="hero hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Tax LLM</p>
            <h1>Authority-grounded transactional tax analysis for live structuring work.</h1>
            <p className="lede">
              Work through transactional-tax structuring questions in one calm workspace. Save matters, preserve run history, inspect authority support, confirm extracted facts, and circulate memo-ready analysis after you sign in. Support still varies by analysis area, and thinner areas stay visibly preliminary.
            </p>
            <div className="button-row">
              <Link className="button-primary link-button" href="/login">
                Sign in
              </Link>
            </div>
          </div>

          <div className="hero-stack">
            <section className="surface feature-card">
              <span className="eyebrow">Built for decisions</span>
              <h2>Structure comparison that shows what drives the answer.</h2>
              <p className="muted">
                Compare stock form, direct asset form, deemed asset elections, reorganizations, and other supported analysis areas with authorities, gating facts, and tradeoffs surfaced side by side. Areas with thinner support stay visibly preliminary.
              </p>
            </section>
            <section className="surface feature-grid">
              <div>
                <strong>Saved matters</strong>
                <p className="muted">Keep facts, documents, runs, and review state together.</p>
              </div>
              <div>
                <strong>Authority review</strong>
                <p className="muted">Inspect source types, support level, and pinned authority.</p>
              </div>
              <div>
                <strong>Memo export</strong>
                <p className="muted">Copy or download markdown from any saved run.</p>
              </div>
              <div>
                <strong>Extraction workflow</strong>
                <p className="muted">Confirm extracted facts before they enter the matter record.</p>
              </div>
            </section>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
