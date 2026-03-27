import Link from "next/link";
import { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";

type AppShellProps = {
  children: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
};

export function AppShell({ children, actions, compact = false }: AppShellProps) {
  return (
    <div className={`app-shell ${compact ? "compact" : ""}`}>
      <header className="app-topbar">
        <Link className="app-brand" href="/">
          <span className="app-brand-mark">TL</span>
          <span className="app-brand-copy">
            <strong>Tax LLM</strong>
            <span>Transactional tax workspace</span>
          </span>
        </Link>
        <nav className="app-nav" aria-label="Primary">
          <Link href="/">Overview</Link>
          <Link href="/app">Workspace</Link>
          <Link href="/login">Login</Link>
        </nav>
        <div className="app-topbar-actions">
          <ThemeToggle />
          {actions}
        </div>
      </header>
      {children}
    </div>
  );
}
