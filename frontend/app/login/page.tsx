import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { AuthForm } from "@/components/auth-form";
import { getServerUser } from "@/lib/server-auth";

export default async function LoginPage() {
  const user = await getServerUser();
  if (user) {
    redirect("/app");
  }

  return (
    <AppShell compact variant="public">
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
