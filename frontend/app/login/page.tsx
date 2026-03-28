import { AppShell } from "@/components/app-shell";
import { AuthForm } from "@/components/auth-form";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const googleError = resolvedSearchParams.error === "google";
  const sessionError = resolvedSearchParams.error === "session";

  return (
    <AppShell compact variant="public">
      <main className="page-shell auth-shell">
        <section className="hero hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Access Tax LLM</p>
            <h1>Sign in with Google to enter the matter workspace.</h1>
            <p className="lede">
              Saved matters, run history, authority review, extraction review, and export are available after authentication.
            </p>
          </div>
          <AuthForm
            error={
              googleError
                ? "Google sign-in could not be completed. Please try again."
                : sessionError
                  ? "Your session expired or could not be restored. Please sign in again."
                  : null
            }
          />
        </section>
      </main>
    </AppShell>
  );
}
