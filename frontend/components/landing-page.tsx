"use client";

import Link from "next/link";

import { AppShell } from "@/components/app-shell";

export function LandingPage() {
  return (
    <AppShell variant="public">
      <main className="page-shell landing-shell">
        <section className="hero hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Premium transactional tax workspace</p>
            <h1>Authority-grounded structuring analysis for live deal work.</h1>
            <p className="lede">
              Review stock, asset, and deemed-asset paths in one calm workspace. Save
              matters, preserve run history, inspect authorities, confirm extracted facts,
              and circulate memo-ready analysis after you sign in.
            </p>
            <div className="button-row">
              <Link className="button-primary link-button" href="/login">
                Sign in
              </Link>
              <Link className="button-secondary link-button" href="/login">
                Create account
              </Link>
            </div>
          </div>

          <div className="hero-stack">
            <section className="surface feature-card">
              <span className="eyebrow">Built for decisions</span>
              <h2>Structure comparison that shows what drives the answer.</h2>
              <p className="muted">
                Compare stock form, direct asset form, and election-sensitive paths with
                authorities, gating facts, and tradeoffs surfaced side by side.
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
