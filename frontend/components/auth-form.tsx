"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { signIn, signUp } from "@/lib/api";

type AuthMode = "signin" | "signup";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === "signup") {
        await signUp({ name, email, password });
      } else {
        await signIn({ email, password });
      }
      router.push("/app");
      router.refresh();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-card">
      <div className="auth-card-copy">
        <p className="eyebrow">Secure access</p>
        <h2>{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
        <p className="muted">
          Access saved matters, authority support, run history, extraction review, pinned authorities, and memo export across the current supported analysis areas.
        </p>
      </div>

      <div className="auth-switch">
        <button
          className={`workspace-tab ${mode === "signin" ? "active" : ""}`}
          type="button"
          onClick={() => setMode("signin")}
        >
          Sign in
        </button>
        <button
          className={`workspace-tab ${mode === "signup" ? "active" : ""}`}
          type="button"
          onClick={() => setMode("signup")}
        >
          Create account
        </button>
      </div>

      <form className="stack" onSubmit={handleSubmit}>
        <a className="button-subtle link-button auth-google-button" href="/api/auth/google/start">
          Continue with Google
        </a>

        <div className="auth-divider">
          <span>or use email</span>
        </div>

        {mode === "signup" ? (
          <label className="field">
            <span>Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
        ) : null}
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>

        {error ? <p className="status-banner warn">{error}</p> : null}

        <button className="button-primary" type="submit" disabled={loading}>
          {loading ? "Working..." : mode === "signup" ? "Create account" : "Sign in"}
        </button>
      </form>
    </section>
  );
}
