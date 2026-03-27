"use client";

import { ReactNode, memo } from "react";

export const WorkspaceSection = memo(function WorkspaceSection({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="workspace-section">
      <div className="workspace-section-header">
        <div>
          <h2>{title}</h2>
          {description ? <p className="muted">{description}</p> : null}
        </div>
        {actions ? <div className="button-row">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
});

export const EmptyPanel = memo(function EmptyPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-panel">
      <h3>{title}</h3>
      <p className="muted">{description}</p>
    </div>
  );
});
