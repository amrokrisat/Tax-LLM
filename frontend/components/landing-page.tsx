import Link from "next/link";

type LandingPageProps = {
  signedIn: boolean;
};

export function LandingPage({ signedIn }: LandingPageProps) {
  return (
    <main className="page-shell">
      <section className="hero matters-hero">
        <div className="hero-copy">
          <p className="eyebrow">Tax LLM</p>
          <h1>Transactional tax analysis in a secure matter workspace.</h1>
          <p className="lede">
            Intake deal facts, organize issues, review authorities, compare structures, and
            generate memo-style analysis inside a saved matter workflow.
          </p>
          <div className="button-row">
            <Link className="button-primary link-button" href={signedIn ? "/app" : "/login"}>
              {signedIn ? "Open Workspace" : "Sign In"}
            </Link>
            <Link className="button-secondary link-button" href="/login">
              Create Account
            </Link>
          </div>
        </div>

        <div className="hero-card stack">
          <h2>What’s inside</h2>
          <ul className="list-tight">
            <li>Saved matters with rerun history</li>
            <li>Retrieval-first tax analysis with authority review</li>
            <li>Structural alternatives, memo drafting, and warning controls</li>
            <li>Document intake designed for later extraction workflows</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
