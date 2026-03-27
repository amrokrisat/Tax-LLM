"use client";

import { memo } from "react";

export type WorkspaceTab =
  | "facts"
  | "documents"
  | "entity_structure"
  | "transaction_steps"
  | "issues"
  | "authorities"
  | "alternatives"
  | "memo"
  | "warnings";

const workspaceTabs: Array<{ key: WorkspaceTab; label: string }> = [
  { key: "facts", label: "Facts" },
  { key: "documents", label: "Documents" },
  { key: "entity_structure", label: "Entity Structure" },
  { key: "transaction_steps", label: "Transaction Steps" },
  { key: "issues", label: "Issues" },
  { key: "authorities", label: "Authorities" },
  { key: "alternatives", label: "Alternatives" },
  { key: "memo", label: "Memo" },
  { key: "warnings", label: "Warnings" },
];

export const WorkspaceTabs = memo(function WorkspaceTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
}) {
  return (
    <div className="workspace-tabs">
      {workspaceTabs.map((tab) => (
        <button
          key={tab.key}
          className={`workspace-tab ${activeTab === tab.key ? "active" : ""}`}
          onClick={() => onTabChange(tab.key)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
});
