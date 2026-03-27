"use client";

import Link from "next/link";
import { memo } from "react";

export const MatterHeader = memo(function MatterHeader({
  matterName,
  transactionType,
  createdAt,
  updatedAt,
  runCount,
  documentCount,
  pinnedCount,
  hasUnsavedChanges,
  saving,
  analyzing,
  onLoadDemo,
  onSave,
  onAnalyze,
}: {
  matterName: string;
  transactionType: string;
  createdAt: string;
  updatedAt: string;
  runCount: number;
  documentCount: number;
  pinnedCount: number;
  hasUnsavedChanges: boolean;
  saving: boolean;
  analyzing: boolean;
  onLoadDemo: () => void;
  onSave: () => void;
  onAnalyze: () => void;
}) {
  return (
    <section className="workspace-hero">
      <div className="workspace-hero-copy">
        <p className="eyebrow">Matter workspace</p>
        <h1 className="workspace-title">{matterName}</h1>
        <p className="workspace-subtitle">
          {transactionType} · Created {createdAt} · Updated {updatedAt}
        </p>
        <div className="chip-row">
          <span className="chip">{runCount} saved runs</span>
          <span className="chip">
            {documentCount} {documentCount === 1 ? "document" : "documents"}
          </span>
          {pinnedCount ? <span className="chip">{pinnedCount} pinned authorities</span> : null}
          {hasUnsavedChanges ? <span className="chip chip-emphasis">Unsaved changes</span> : null}
        </div>
      </div>

      <div className="workspace-hero-actions">
        <Link className="button-ghost link-button" href="/app">
          Back to matters
        </Link>
        <button className="button-subtle" onClick={onLoadDemo} type="button">
          Load demo
        </button>
        <button className="button-subtle" onClick={onSave} disabled={!hasUnsavedChanges || saving} type="button">
          {saving ? "Saving..." : "Save"}
        </button>
        <button className="button-primary" onClick={onAnalyze} disabled={analyzing} type="button">
          {analyzing ? "Analyzing..." : "Generate analysis"}
        </button>
      </div>
    </section>
  );
});
