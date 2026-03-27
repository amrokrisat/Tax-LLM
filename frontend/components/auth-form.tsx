type AuthFormProps = {
  error?: string | null;
};

export function AuthForm({ error }: AuthFormProps) {
  return (
    <section className="auth-card">
      <div className="auth-card-copy">
        <p className="eyebrow">Secure access</p>
        <h2>Continue with Google</h2>
        <p className="muted">
          Access saved matters, authority support, run history, extraction review, pinned authorities, and memo export after Google authentication.
        </p>
      </div>

      {error ? <p className="status-banner warn">{error}</p> : null}

      <div className="stack">
        <a className="button-primary link-button auth-google-button" href="/api/auth/google/start">
          Continue with Google
        </a>
        <p className="muted">
          Google is the only sign-in method on this version to keep the public entry flow simpler and faster.
        </p>
      </div>
    </section>
  );
}
