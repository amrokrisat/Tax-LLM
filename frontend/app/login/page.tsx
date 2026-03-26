import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { getServerUser } from "@/lib/server-auth";

export default async function LoginPage() {
  const user = await getServerUser();
  if (user) {
    redirect("/app");
  }

  return (
    <main className="page-shell auth-shell">
      <section className="hero matters-hero">
        <div className="hero-copy">
          <p className="eyebrow">Access Tax LLM</p>
          <h1>Sign in to enter the matter workspace.</h1>
          <p className="lede">
            Matters, saved analysis runs, documents, and memo drafts are available only
            after authentication.
          </p>
        </div>
        <AuthForm />
      </section>
    </main>
  );
}
