import { AppShell } from "@/components/app-shell";
import { AuthForm } from "@/components/auth-form";

export default function LoginPage() {
  return (
    <AppShell compact>
      <main className="page-shell auth-shell">
        <section className="hero hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Access Tax LLM</p>
            <h1>Sign in to enter the matter workspace.</h1>
            <p className="lede">
              Saved matters, run history, authority review, extraction review, and export
              are available after authentication.
            </p>
          </div>
          <AuthForm />
        </section>
      </main>
    </AppShell>
  );
}
