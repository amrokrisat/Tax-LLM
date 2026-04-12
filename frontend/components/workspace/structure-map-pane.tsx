"use client";

import { memo, useCallback, useMemo, useRef, useState } from "react";

import {
  ElectionOrFilingItem,
  Entity,
  OwnershipLink,
  StructureProposal,
  TaxClassification,
  TransactionRole,
  TransactionStep,
} from "@/lib/api";
import {
  DiagramShape,
  deriveStructureDiagram,
  StructureDiagramArrow,
  StructureDiagramEntityReviewGroup,
  StructureDiagramNode,
  StructureDiagramOwnershipEdge,
} from "@/lib/structure";
import {
  ENTITY_TYPE_OPTIONS,
  ELECTION_OR_FILING_TYPE_OPTIONS,
  OWNERSHIP_RELATIONSHIP_OPTIONS,
  TAX_CLASSIFICATION_OPTIONS,
  TRANSACTION_STEP_PHASE_OPTIONS,
  TRANSACTION_STEP_TYPE_OPTIONS,
  TRANSACTION_ROLE_OPTIONS,
  entityShapeForType,
  entityTypeLabel,
  taxClassificationLabel,
  transactionRoleLabel,
} from "@/lib/taxonomy";

function titleCase(value: string) {
  return value.replaceAll("_", " ");
}

function truncateList(values: string[], limit = 3) {
  if (values.length <= limit) {
    return values.join(", ");
  }
  return `${values.slice(0, limit).join(", ")} +${values.length - limit} more`;
}

function proposalKindLabel(kind: StructureProposal["proposal_kind"]) {
  switch (kind) {
    case "ownership_link":
      return "Ownership line";
    case "tax_classification":
      return "Tax classification";
    case "transaction_role":
      return "Role";
    case "transaction_step":
      return "Transaction step";
    case "election_filing_item":
      return "Filing or election";
    default:
      return "Entity";
  }
}

function editableFields(proposal: StructureProposal) {
  switch (proposal.proposal_kind) {
    case "entity":
      return [
        { key: "name", label: "Entity name" },
        { key: "entity_type", label: "Legal entity type" },
        { key: "jurisdiction", label: "Jurisdiction" },
      ];
    case "ownership_link":
      return [
        { key: "parent_entity_name", label: "Parent entity" },
        { key: "child_entity_name", label: "Child entity" },
        { key: "relationship_type", label: "Relationship type" },
        { key: "ownership_percentage", label: "Ownership %" },
      ];
    case "tax_classification":
      return [
        { key: "entity_name", label: "Entity" },
        { key: "classification_type", label: "Tax classification" },
      ];
    case "transaction_role":
      return [
        { key: "entity_name", label: "Entity" },
        { key: "role_type", label: "Transaction role" },
      ];
    case "transaction_step":
      return [
        { key: "title", label: "Step title" },
        { key: "step_type", label: "Step type" },
        { key: "phase", label: "Phase" },
        { key: "entity_names", label: "Linked entities" },
      ];
    case "election_filing_item":
      return [
        { key: "name", label: "Item name" },
        { key: "item_type", label: "Type" },
        { key: "citation_or_form", label: "Form or citation" },
        { key: "related_entity_names", label: "Related entities" },
      ];
  }
}

function parseEditedValue(previous: unknown, next: string) {
  if (Array.isArray(previous)) {
    return next
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof previous === "number") {
    const parsed = Number(next);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return next;
}

function splitLabel(text: string, maxChars = 18) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines.slice(0, 2);
}

function pillWidth(label: string) {
  return label.length * 6.2 + 18;
}

function entityCenter(node: StructureDiagramNode) {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
  };
}

function ownershipPath(parent: StructureDiagramNode, child: StructureDiagramNode) {
  const startX = parent.x + parent.width / 2;
  const startY = parent.y + parent.height;
  const endX = child.x + child.width / 2;
  const endY = child.y;
  const midY = startY + (endY - startY) / 2;
  return `M ${startX} ${startY} V ${midY} H ${endX} V ${endY}`;
}

function transactionPath(source: StructureDiagramNode, target: StructureDiagramNode) {
  const sourceCenter = entityCenter(source);
  const targetCenter = entityCenter(target);
  const direction = targetCenter.x >= sourceCenter.x ? 1 : -1;
  const startX = sourceCenter.x + direction * (source.width / 2 - 10);
  const startY = sourceCenter.y + 8;
  const endX = targetCenter.x - direction * (target.width / 2 - 10);
  const endY = targetCenter.y + 8;
  const bend = Math.max(Math.abs(endX - startX) * 0.28, 56);
  return `M ${startX} ${startY} C ${startX + direction * bend} ${startY + 54}, ${endX - direction * bend} ${endY + 54}, ${endX} ${endY}`;
}

function badgeShapePath(shape: DiagramShape | "badge", x: number, y: number, size: number) {
  switch (shape) {
    case "triangle":
      return `M ${x + size / 2} ${y} L ${x + size} ${y + size} L ${x} ${y + size} Z`;
    case "diamond":
      return `M ${x + size / 2} ${y} L ${x + size} ${y + size / 2} L ${x + size / 2} ${y + size} L ${x} ${y + size / 2} Z`;
    case "circle":
      return `M ${x + size / 2} ${y} a ${size / 2} ${size / 2} 0 1 0 0.001 0`;
    case "oval":
      return `M ${x + size / 2} ${y} a ${size / 2} ${size * 0.34} 0 1 0 0.001 0`;
    case "rectangle":
      return `M ${x} ${y} H ${x + size} V ${y + size} H ${x} Z`;
    case "rounded":
    case "badge":
    default:
      return `M ${x + 8} ${y} H ${x + size - 8} Q ${x + size} ${y} ${x + size} ${y + 8} V ${y + size - 8} Q ${x + size} ${y + size} ${x + size - 8} ${y + size} H ${x + 8} Q ${x} ${y + size} ${x} ${y + size - 8} V ${y + 8} Q ${x} ${y} ${x + 8} ${y} Z`;
  }
}

function outerShapePath(shape: DiagramShape, x: number, y: number, width: number, height: number) {
  switch (shape) {
    case "triangle":
      return `M ${x + width / 2} ${y + 4} L ${x + width - 8} ${y + height - 8} L ${x + 8} ${y + height - 8} Z`;
    case "diamond":
      return `M ${x + width / 2} ${y + 4} L ${x + width - 8} ${y + height / 2} L ${x + width / 2} ${y + height - 4} L ${x + 8} ${y + height / 2} Z`;
    case "circle":
      return `M ${x + width / 2} ${y} a ${width / 2} ${height / 2} 0 1 0 0.001 0`;
    case "oval":
      return `M ${x + width / 2} ${y + 8} a ${width / 2} ${(height - 16) / 2} 0 1 0 0.001 0`;
    case "rounded":
      return `M ${x + 22} ${y} H ${x + width - 22} Q ${x + width} ${y} ${x + width} ${y + 22} V ${y + height - 22} Q ${x + width} ${y + height} ${x + width - 22} ${y + height} H ${x + 22} Q ${x} ${y + height} ${x} ${y + height - 22} V ${y + 22} Q ${x} ${y} ${x + 22} ${y} Z`;
    case "rectangle":
    default:
      return `M ${x} ${y} H ${x + width} V ${y + height} H ${x} Z`;
  }
}

function statusClass(status: string) {
  return status.replaceAll("_", "-");
}

type DiagramSelection =
  | { kind: "entity"; entityId: string; section?: "entity" | "classification" | "roles" | "ownership" | "steps" }
  | { kind: "ownership_edge"; edgeId: string }
  | { kind: "arrow"; arrowId: string };

function Legend() {
  return (
    <div className="chip-row">
      <span className="chip chip-status chip-status-confirmed">confirmed</span>
      <span className="chip chip-status chip-status-proposed">proposed</span>
      <span className="chip chip-status chip-status-uncertain">uncertain</span>
      <span className="chip">ownership line</span>
      <span className="chip">transaction arrow</span>
    </div>
  );
}

function ProposalFieldInput({
  field,
  value,
  readOnly,
  onChange,
}: {
  field: { key: string; label: string };
  value: string | number | string[] | null | undefined;
  readOnly: boolean;
  onChange: (value: string | number | string[] | null) => void;
}) {
  const rendered = Array.isArray(value) ? value.join(", ") : value == null ? "" : String(value);

  if (field.key === "entity_type") {
    return (
      <label className="field">
        <span>{field.label}</span>
        <select
          disabled={readOnly}
          value={rendered || "other"}
          onChange={(event) => onChange(event.target.value)}
        >
          {ENTITY_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.key === "classification_type") {
    return (
      <label className="field">
        <span>{field.label}</span>
        <select
          disabled={readOnly}
          value={rendered || "unknown"}
          onChange={(event) => onChange(event.target.value)}
        >
          {TAX_CLASSIFICATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.key === "relationship_type") {
    return (
      <label className="field">
        <span>{field.label}</span>
        <select
          disabled={readOnly}
          value={rendered || "owns"}
          onChange={(event) => onChange(event.target.value)}
        >
          {OWNERSHIP_RELATIONSHIP_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.key === "role_type") {
    return (
      <label className="field">
        <span>{field.label}</span>
        <select
          disabled={readOnly}
          value={rendered || "other"}
          onChange={(event) => onChange(event.target.value)}
        >
          {TRANSACTION_ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.key === "step_type") {
    return (
      <label className="field">
        <span>{field.label}</span>
        <select
          disabled={readOnly}
          value={rendered || "other"}
          onChange={(event) => onChange(event.target.value)}
        >
          {TRANSACTION_STEP_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.key === "phase") {
    return (
      <label className="field">
        <span>{field.label}</span>
        <select
          disabled={readOnly}
          value={rendered || "closing"}
          onChange={(event) => onChange(event.target.value)}
        >
          {TRANSACTION_STEP_PHASE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (field.key === "item_type") {
    return (
      <label className="field">
        <span>{field.label}</span>
        <select
          disabled={readOnly}
          value={rendered || "other"}
          onChange={(event) => onChange(event.target.value)}
        >
          {ELECTION_OR_FILING_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="field">
      <span>{field.label}</span>
      <input
        disabled={readOnly}
        value={rendered}
        onChange={(event) => onChange(parseEditedValue(value, event.target.value))}
      />
    </label>
  );
}

function GenericProposalEditor({
  proposal,
  onApprove,
  onReject,
  readOnly,
}: {
  proposal: StructureProposal | null;
  onApprove: (
    proposalId: string,
    payload: Record<string, string | number | string[] | null>,
  ) => void;
  onReject: (proposalId: string) => void;
  readOnly: boolean;
}) {
  const [draftPayload, setDraftPayload] = useState<Record<string, string | number | string[] | null>>(
    proposal?.normalized_payload ?? {},
  );

  if (!proposal) {
    return (
      <div className="subpanel stack structure-review-panel">
        <h3>Diagram Review</h3>
        <p className="muted">
          Select a proposed entity, ownership line, classification badge, role badge, or
          transaction arrow to review and approve it.
        </p>
      </div>
    );
  }

  return (
    <div className="subpanel stack structure-review-panel">
      <div className="row-between">
        <div>
          <h3>{proposal.label}</h3>
          <p className="muted">{proposalKindLabel(proposal.proposal_kind)}</p>
        </div>
        <span className={`chip chip-status chip-status-${proposal.record_status}`}>
          {titleCase(proposal.record_status)}
        </span>
      </div>
      <div className="chip-row">
        <span className="chip">{proposal.confidence.toFixed(2)} confidence</span>
        <span className="chip">{proposal.certainty} certainty</span>
      </div>
      <p>{proposal.rationale}</p>
      {proposal.ambiguity_note ? <p className="muted">{proposal.ambiguity_note}</p> : null}
      {proposal.source_document_names.length ? (
        <p className="muted">Sources: {proposal.source_document_names.join(", ")}</p>
      ) : null}

      <div className="stack">
        {editableFields(proposal).map((field) => {
          const value = draftPayload[field.key];
          return (
            <ProposalFieldInput
              key={field.key}
              field={field}
              value={value}
              readOnly={readOnly}
              onChange={(nextValue) =>
                setDraftPayload({
                  ...draftPayload,
                  [field.key]: nextValue,
                })
              }
            />
          );
        })}
      </div>

      {!readOnly && proposal.review_status === "pending" ? (
        <div className="button-row">
          <button
            className="button-subtle"
            type="button"
            onClick={() => onApprove(proposal.proposal_id, draftPayload)}
          >
            Approve edited proposal
          </button>
          <button
            className="button-ghost"
            type="button"
            onClick={() => onReject(proposal.proposal_id)}
          >
            Reject proposal
          </button>
        </div>
      ) : (
        <span className="chip">{proposal.review_status}</span>
      )}
    </div>
  );
}

function confidenceSummary(group: StructureDiagramEntityReviewGroup) {
  const values = [
    group.entityProposal?.confidence,
    group.classificationProposal?.confidence,
    ...group.roleProposals.map((proposal) => proposal.confidence),
  ].filter((value): value is number => typeof value === "number");
  if (!values.length) {
    return null;
  }
  return Math.max(...values);
}

function certaintySummary(group: StructureDiagramEntityReviewGroup) {
  const values = [
    group.entityProposal?.certainty,
    group.classificationProposal?.certainty,
    ...group.roleProposals.map((proposal) => proposal.certainty),
  ].filter(Boolean) as Array<"high" | "medium" | "low">;
  if (values.includes("high")) {
    return "high";
  }
  if (values.includes("medium")) {
    return "medium";
  }
  return values[0] ?? null;
}

function EntityWorkspace({
  node,
  reviewGroup,
  readOnly,
  activeSection = "entity",
  onFocusSection,
  onApproveProposal,
  onRejectProposal,
  onEntityDraftChange,
}: {
  node: StructureDiagramNode;
  reviewGroup: StructureDiagramEntityReviewGroup;
  readOnly: boolean;
  activeSection?: "entity" | "classification" | "roles" | "ownership" | "steps";
  onFocusSection: (section: "entity" | "classification" | "roles" | "ownership" | "steps") => void;
  onApproveProposal: (
    proposalId: string,
    payload?: Record<string, string | number | string[] | null>,
  ) => void;
  onRejectProposal: (proposalId: string) => void;
  onEntityDraftChange: (entityId: string, draft: Partial<Entity>) => void;
}) {
  const [entityDraft, setEntityDraft] = useState({
    name: node.entity.name,
    entity_type: node.entity.entity_type,
    jurisdiction: node.entity.jurisdiction ?? "",
  });
  const [classificationDraft, setClassificationDraft] = useState(
    node.classification?.classification_type ?? reviewGroup.classificationProposal?.normalized_payload.classification_type ?? "unknown",
  );
  const [roleDrafts, setRoleDrafts] = useState<Record<string, string>>(
    Object.fromEntries(
      reviewGroup.roleProposals.map((proposal) => [
        proposal.proposal_id,
        String(proposal.normalized_payload.role_type ?? "other"),
      ]),
    ),
  );

  const confidence = confidenceSummary(reviewGroup);
  const certainty = certaintySummary(reviewGroup);
  const currentRoles = node.roles.length ? node.roles : reviewGroup.roleProposals.map((proposal) => String(proposal.normalized_payload.role_type ?? "other"));

  function updateEntityDraft(next: Partial<typeof entityDraft>) {
    const merged = { ...entityDraft, ...next };
    setEntityDraft(merged);
    onEntityDraftChange(node.entity.entity_id, {
      name: merged.name,
      entity_type: merged.entity_type as Entity["entity_type"],
      jurisdiction: merged.jurisdiction || null,
    });
  }

  return (
    <div className="subpanel stack structure-review-panel">
      <div className="row-between">
        <div>
          <h3>{entityDraft.name}</h3>
          <p className="muted">Entity workspace</p>
        </div>
        <span className={`chip chip-status chip-status-${node.displayStatus}`}>
          {titleCase(node.displayStatus)}
        </span>
      </div>
      <div className="chip-row">
        {confidence != null ? <span className="chip">{confidence.toFixed(2)} confidence</span> : null}
        {certainty ? <span className="chip">{certainty} certainty</span> : null}
        <span className="chip">{currentRoles.length} role signals</span>
      </div>

      <div className="chip-row">
        {(["entity", "classification", "roles", "ownership", "steps"] as const).map((section) => (
          <button
            key={section}
            className={`chip structure-review-chip ${activeSection === section ? "active" : ""}`}
            onClick={() => onFocusSection(section)}
            type="button"
          >
            {titleCase(section)}
          </button>
        ))}
      </div>

      <div className="stack structure-review-sections">
        <section className={`structure-review-section ${activeSection === "entity" ? "active" : ""}`}>
          <div className="row-between">
            <h4>Entity</h4>
            {reviewGroup.entityProposal ? (
              <span className="chip chip-status chip-status-proposed">pending proposal</span>
            ) : (
              <span className="chip chip-status chip-status-confirmed">current record</span>
            )}
          </div>
          <label className="field">
            <span>Entity name</span>
            <input
              disabled={readOnly}
              value={entityDraft.name}
              onChange={(event) => updateEntityDraft({ name: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Legal entity type</span>
            <select
              disabled={readOnly}
              value={entityDraft.entity_type}
              onChange={(event) =>
                updateEntityDraft({ entity_type: event.target.value as Entity["entity_type"] })
              }
            >
              {ENTITY_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <small className="muted">
              {ENTITY_TYPE_OPTIONS.find((option) => option.value === entityDraft.entity_type)?.description}
            </small>
          </label>
          <label className="field">
            <span>Jurisdiction</span>
            <input
              disabled={readOnly}
              value={entityDraft.jurisdiction}
              onChange={(event) => updateEntityDraft({ jurisdiction: event.target.value })}
            />
          </label>
          {!readOnly && reviewGroup.entityProposal ? (
            <div className="button-row">
              <button
                className="button-subtle"
                type="button"
                onClick={() =>
                  onApproveProposal(reviewGroup.entityProposal!.proposal_id, {
                    ...reviewGroup.entityProposal!.normalized_payload,
                    name: entityDraft.name,
                    entity_type: entityDraft.entity_type,
                    jurisdiction: entityDraft.jurisdiction || null,
                  })
                }
              >
                Save + approve entity changes
              </button>
              <button
                className="button-ghost"
                type="button"
                onClick={() => onRejectProposal(reviewGroup.entityProposal!.proposal_id)}
              >
                Reject proposal
              </button>
            </div>
          ) : (
            <span className="chip">{reviewGroup.entityProposal ? reviewGroup.entityProposal.review_status : "no pending entity proposal"}</span>
          )}
        </section>

        <section className={`structure-review-section ${activeSection === "classification" ? "active" : ""}`}>
          <div className="row-between">
            <h4>Tax classification</h4>
            {reviewGroup.classificationProposal ? (
              <span className="chip chip-status chip-status-proposed">pending proposal</span>
            ) : (
              <span className="chip chip-status chip-status-confirmed">
                {node.classification ? "current record" : "none"}
              </span>
            )}
          </div>
          <label className="field">
            <span>Tax classification</span>
            <select
              disabled={readOnly}
              value={classificationDraft}
              onChange={(event) => setClassificationDraft(event.target.value)}
            >
              {TAX_CLASSIFICATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {!readOnly && reviewGroup.classificationProposal ? (
            <div className="button-row">
              <button
                className="button-subtle"
                type="button"
                onClick={() =>
                  onApproveProposal(reviewGroup.classificationProposal!.proposal_id, {
                    ...reviewGroup.classificationProposal!.normalized_payload,
                    entity_name: entityDraft.name,
                    classification_type: classificationDraft,
                  })
                }
              >
                Approve classification
              </button>
              <button
                className="button-ghost"
                type="button"
                onClick={() => onRejectProposal(reviewGroup.classificationProposal!.proposal_id)}
              >
                Reject proposal
              </button>
            </div>
          ) : null}
        </section>

        <section className={`structure-review-section ${activeSection === "roles" ? "active" : ""}`}>
          <div className="row-between">
            <h4>Transaction roles</h4>
            <span className="chip">{currentRoles.length} current / pending</span>
          </div>
          {reviewGroup.roleProposals.length ? (
            <div className="stack">
              {reviewGroup.roleProposals.map((proposal) => (
                <div key={proposal.proposal_id} className="structure-inline-card">
                  <label className="field">
                    <span>Role</span>
                    <select
                      disabled={readOnly}
                      value={roleDrafts[proposal.proposal_id] ?? String(proposal.normalized_payload.role_type ?? "other")}
                      onChange={(event) =>
                        setRoleDrafts((current) => ({
                          ...current,
                          [proposal.proposal_id]: event.target.value,
                        }))
                      }
                    >
                      {TRANSACTION_ROLE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="button-row">
                    <button
                      className="button-subtle"
                      type="button"
                      onClick={() =>
                        onApproveProposal(proposal.proposal_id, {
                          ...proposal.normalized_payload,
                          entity_name: entityDraft.name,
                          role_type: roleDrafts[proposal.proposal_id] ?? proposal.normalized_payload.role_type,
                        })
                      }
                    >
                      Approve role
                    </button>
                    <button
                      className="button-ghost"
                      type="button"
                      onClick={() => onRejectProposal(proposal.proposal_id)}
                    >
                      Reject proposal
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">No pending role proposals for this entity.</p>
          )}
        </section>

        <section className={`structure-review-section ${activeSection === "ownership" ? "active" : ""}`}>
          <div className="row-between">
            <h4>Related ownership</h4>
            <span className="chip">{reviewGroup.ownershipProposals.length} pending links</span>
          </div>
          {node.directParentNames.length ? (
            <p className="muted">Parents: {node.directParentNames.join(", ")}</p>
          ) : null}
          {node.directChildNames.length ? (
            <p className="muted">Children: {node.directChildNames.join(", ")}</p>
          ) : null}
          {reviewGroup.ownershipProposals.length ? (
            <div className="stack">
              {reviewGroup.ownershipProposals.map((proposal) => (
                <div key={proposal.proposal_id} className="structure-inline-card">
                  <strong>{proposal.label}</strong>
                  <p className="muted">{proposal.rationale}</p>
                  {!readOnly ? (
                    <div className="button-row">
                      <button
                        className="button-subtle"
                        type="button"
                        onClick={() => onApproveProposal(proposal.proposal_id, proposal.normalized_payload)}
                      >
                        Approve ownership link
                      </button>
                      <button
                        className="button-ghost"
                        type="button"
                        onClick={() => onRejectProposal(proposal.proposal_id)}
                      >
                        Reject proposal
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className={`structure-review-section ${activeSection === "steps" ? "active" : ""}`}>
          <div className="row-between">
            <h4>Related step overlays</h4>
            <span className="chip">
              {reviewGroup.stepProposals.length + reviewGroup.electionItemProposals.length} pending items
            </span>
          </div>
          {reviewGroup.stepProposals.length ? (
            <div className="stack">
              {reviewGroup.stepProposals.map((proposal) => (
                <div key={proposal.proposal_id} className="structure-inline-card">
                  <strong>{proposal.label}</strong>
                  <p className="muted">{proposal.rationale}</p>
                  {!readOnly ? (
                    <div className="button-row">
                      <button
                        className="button-subtle"
                        type="button"
                        onClick={() => onApproveProposal(proposal.proposal_id, proposal.normalized_payload)}
                      >
                        Approve step
                      </button>
                      <button
                        className="button-ghost"
                        type="button"
                        onClick={() => onRejectProposal(proposal.proposal_id)}
                      >
                        Reject proposal
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
          {reviewGroup.electionItemProposals.length ? (
            <div className="stack">
              {reviewGroup.electionItemProposals.map((proposal) => (
                <div key={proposal.proposal_id} className="structure-inline-card">
                  <strong>{proposal.label}</strong>
                  <p className="muted">{proposal.rationale}</p>
                  {!readOnly ? (
                    <div className="button-row">
                      <button
                        className="button-subtle"
                        type="button"
                        onClick={() => onApproveProposal(proposal.proposal_id, proposal.normalized_payload)}
                      >
                        Approve filing item
                      </button>
                      <button
                        className="button-ghost"
                        type="button"
                        onClick={() => onRejectProposal(proposal.proposal_id)}
                      >
                        Reject proposal
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function NodeSvg({
  node,
  selected,
  onSelect,
  entityTypeOverride,
}: {
  node: StructureDiagramNode;
  selected: boolean;
  onSelect: (selection: DiagramSelection) => void;
  entityTypeOverride?: Entity["entity_type"];
}) {
  const nameLines = splitLabel(node.entity.name || "Unnamed entity");
  const legalType = entityTypeLabel(entityTypeOverride ?? node.entity.entity_type);
  const roles = node.roles.slice(0, 2);
  const shapePath = outerShapePath(
    entityTypeOverride ? entityShapeForType(entityTypeOverride) : node.outerShape,
    node.x,
    node.y,
    node.width,
    node.height,
  );
  const fillClass = `structure-node-fill-${statusClass(node.displayStatus)}`;
  const borderClass = `structure-node-stroke-${statusClass(node.displayStatus)}`;
  const classificationX = node.x + 12;
  const classificationY = node.y + 12;
  const countryX = node.x + node.width - 40;
  const countryY = node.y + node.height - 28;

  return (
    <g className={`structure-svg-node ${selected ? "selected" : ""}`}>
      <path
        d={shapePath}
        className={`structure-node-shape ${fillClass} ${borderClass}`}
        onClick={() => onSelect({ kind: "entity", entityId: node.entity.entity_id, section: "entity" })}
      />

      <text x={node.x + node.width / 2} y={node.y + 46} className="structure-node-title" textAnchor="middle">
        {nameLines[0]}
      </text>
      {nameLines[1] ? (
        <text x={node.x + node.width / 2} y={node.y + 64} className="structure-node-title" textAnchor="middle">
          {nameLines[1]}
        </text>
      ) : null}

      <text x={node.x + node.width / 2} y={node.y + 84} className="structure-node-subtitle" textAnchor="middle">
        {legalType}
      </text>
      {node.classificationLabel ? (
        <text x={node.x + node.width / 2} y={node.y + 102} className="structure-node-caption" textAnchor="middle">
          {node.classificationLabel}
        </text>
      ) : null}

      {node.classificationShape && node.classificationBadgeText ? (
        <g
          className={`structure-badge-group ${
            node.proposalIdsByKind.classification ? "clickable" : ""
          }`}
          onClick={() => onSelect({ kind: "entity", entityId: node.entity.entity_id, section: "classification" })}
        >
          <path
            d={badgeShapePath(node.classificationShape, classificationX, classificationY, 24)}
            className="structure-classification-badge"
          />
          <text
            x={classificationX + 12}
            y={classificationY + 16}
            className="structure-badge-text"
            textAnchor="middle"
          >
            {node.classificationBadgeText}
          </text>
        </g>
      ) : null}

      <g>
        <rect
          x={node.x + node.width - 52}
          y={node.y + 10}
          width={42}
          height={20}
          rx={10}
          className={`structure-status-pill structure-status-pill-${statusClass(node.displayStatus)}`}
        />
        <text
          x={node.x + node.width - 31}
          y={node.y + 24}
          className="structure-status-text"
          textAnchor="middle"
        >
          {node.displayStatus === "confirmed"
            ? "OK"
            : node.displayStatus === "proposed"
              ? "NEW"
              : "?"}
        </text>
      </g>

      {roles.map((role, index) => {
        const label = transactionRoleLabel(role);
        const width = pillWidth(label);
        const x = node.x + 14 + index * (width + 8);
        const y = node.y + node.height - 38;
        const proposalId = node.proposalIdsByKind.roles[index] ?? null;
        return (
          <g
            key={`${node.entity.entity_id}-${role}`}
            className={`structure-role-pill-group ${proposalId ? "clickable" : ""}`}
            onClick={() => onSelect({ kind: "entity", entityId: node.entity.entity_id, section: "roles" })}
          >
            <rect x={x} y={y} width={width} height={22} rx={11} className="structure-role-pill" />
            <text x={x + width / 2} y={y + 15} className="structure-role-pill-text" textAnchor="middle">
              {label}
            </text>
          </g>
        );
      })}

      {node.countryBadge ? (
        <g>
          <rect x={countryX} y={countryY} width={28} height={18} rx={9} className="structure-country-pill" />
          <text x={countryX + 14} y={countryY + 12.5} className="structure-country-text" textAnchor="middle">
            {node.countryBadge}
          </text>
        </g>
      ) : null}
    </g>
  );
}

function DiagramCanvas({
  nodes,
  ownershipEdges,
  transactionArrows,
  selectedEdgeId,
  selectedArrowId,
  selectedEntityId,
  entityTypeOverrides,
  onSelect,
}: {
  nodes: StructureDiagramNode[];
  ownershipEdges: StructureDiagramOwnershipEdge[];
  transactionArrows: StructureDiagramArrow[];
  selectedEntityId: string | null;
  selectedEdgeId: string | null;
  selectedArrowId: string | null;
  entityTypeOverrides: Record<string, Entity["entity_type"]>;
  onSelect: (selection: DiagramSelection) => void;
}) {
  const nodeById = Object.fromEntries(nodes.map((node) => [node.entity.entity_id, node])) as Record<
    string,
    StructureDiagramNode
  >;

  return (
    <>
      {ownershipEdges.map((edge) => {
        const parent = nodeById[edge.parentEntityId];
        const child = nodeById[edge.childEntityId];
        if (!parent || !child) {
          return null;
        }
        const path = ownershipPath(parent, child);
        const startY = parent.y + parent.height;
        const endY = child.y;
        const midY = startY + (endY - startY) / 2;
        const labelX = (parent.x + parent.width / 2 + child.x + child.width / 2) / 2;
        return (
          <g key={edge.edgeId}>
            <path d={path} className={`structure-svg-edge structure-svg-edge-${statusClass(edge.status)}`} />
            <path
              d={path}
              className="structure-svg-hit"
              onClick={() => onSelect({ kind: "ownership_edge", edgeId: edge.edgeId })}
            />
            <rect x={labelX - 22} y={midY - 20} width={44} height={18} rx={9} className="structure-edge-label-box" />
            <text x={labelX} y={midY - 7} className="structure-edge-label-text" textAnchor="middle">
              {edge.label}
            </text>
            {selectedEdgeId === edge.edgeId ? (
              <path d={path} className="structure-svg-edge-selected" />
            ) : null}
          </g>
        );
      })}

      <defs>
        <marker
          id="structure-arrowhead"
          markerWidth="10"
          markerHeight="8"
          refX="9"
          refY="4"
          orient="auto"
        >
          <path d="M 0 0 L 10 4 L 0 8 z" className="structure-arrowhead" />
        </marker>
      </defs>

      {transactionArrows.map((arrow) => {
        const source = nodeById[arrow.sourceEntityId];
        const target = nodeById[arrow.targetEntityId];
        if (!source || !target) {
          return null;
        }
        const path = transactionPath(source, target);
        const sourceCenter = entityCenter(source);
        const targetCenter = entityCenter(target);
        const labelX = (sourceCenter.x + targetCenter.x) / 2;
        const labelY = Math.min(sourceCenter.y, targetCenter.y) + 54;
        return (
          <g key={arrow.arrowId}>
            <path d={path} className={`structure-transaction-arrow structure-transaction-arrow-${statusClass(arrow.status)}`} markerEnd="url(#structure-arrowhead)" />
            <path
              d={path}
              className="structure-svg-hit"
              onClick={() => onSelect({ kind: "arrow", arrowId: arrow.arrowId })}
            />
            <rect x={labelX - 42} y={labelY - 15} width={84} height={18} rx={9} className="structure-arrow-label-box" />
            <text x={labelX} y={labelY - 2} className="structure-arrow-label-text" textAnchor="middle">
              {arrow.label}
            </text>
            {selectedArrowId === arrow.arrowId ? (
              <path d={path} className="structure-transaction-arrow-selected" markerEnd="url(#structure-arrowhead)" />
            ) : null}
          </g>
        );
      })}

      {nodes.map((node) => (
        <NodeSvg
          key={node.entity.entity_id}
          node={node}
          selected={selectedEntityId === node.entity.entity_id}
          onSelect={onSelect}
          entityTypeOverride={entityTypeOverrides[node.entity.entity_id]}
        />
      ))}
    </>
  );
}

export const StructureMapPane = memo(function StructureMapPane({
  entities,
  ownershipLinks,
  taxClassifications,
  transactionRoles,
  transactionSteps,
  electionItems,
  structureProposals,
  readOnly = false,
  onReviewProposal,
}: {
  entities: Entity[];
  ownershipLinks: OwnershipLink[];
  taxClassifications: TaxClassification[];
  transactionRoles: TransactionRole[];
  transactionSteps: TransactionStep[];
  electionItems: ElectionOrFilingItem[];
  structureProposals?: StructureProposal[];
  readOnly?: boolean;
  onReviewProposal?: (
    proposalId: string,
    status: "accepted" | "rejected",
    normalizedPayload?: Record<string, string | number | string[] | null>,
  ) => void;
}) {
  const proposals = useMemo(() => structureProposals ?? [], [structureProposals]);
  const diagram = useMemo(
    () =>
      deriveStructureDiagram(
        entities,
        ownershipLinks,
        taxClassifications,
        transactionRoles,
        transactionSteps,
        electionItems,
        proposals,
      ),
    [electionItems, entities, ownershipLinks, proposals, taxClassifications, transactionRoles, transactionSteps],
  );
  const [selection, setSelection] = useState<DiagramSelection | null>(
    diagram.primaryNodes[0]
      ? { kind: "entity", entityId: diagram.primaryNodes[0].entity.entity_id, section: "entity" }
      : null,
  );
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [entityTypeOverrides, setEntityTypeOverrides] = useState<Record<string, Entity["entity_type"]>>({});
  const allNodes = useMemo(
    () => [...diagram.primaryNodes, ...diagram.secondaryNodes],
    [diagram.primaryNodes, diagram.secondaryNodes],
  );
  const nodeById = useMemo(
    () => Object.fromEntries(allNodes.map((node) => [node.entity.entity_id, node])) as Record<string, StructureDiagramNode>,
    [allNodes],
  );
  const edgeById = useMemo(
    () =>
      Object.fromEntries(
        [...diagram.primaryOwnershipEdges, ...diagram.crossLinks].map((edge) => [edge.edgeId, edge]),
      ) as Record<string, StructureDiagramOwnershipEdge>,
    [diagram.crossLinks, diagram.primaryOwnershipEdges],
  );
  const arrowById = useMemo(
    () =>
      Object.fromEntries(
        [...diagram.transactionArrows, ...diagram.hiddenTransactionArrows].map((arrow) => [arrow.arrowId, arrow]),
      ) as Record<string, StructureDiagramArrow>,
    [diagram.hiddenTransactionArrows, diagram.transactionArrows],
  );
  const labelEntityById = useMemo(
    () =>
      Object.fromEntries(
        [...diagram.primaryNodes, ...diagram.secondaryNodes].map((node) => [node.entity.entity_id, node.entity]),
      ) as Record<string, Entity>,
    [diagram.primaryNodes, diagram.secondaryNodes],
  );
  const proposalById = useMemo(
    () => Object.fromEntries(proposals.map((proposal) => [proposal.proposal_id, proposal])) as Record<string, StructureProposal>,
    [proposals],
  );
  const activeSelection = useMemo(() => {
    if (selection?.kind === "entity" && nodeById[selection.entityId]) {
      return selection;
    }
    if (selection?.kind === "ownership_edge" && edgeById[selection.edgeId]) {
      return selection;
    }
    if (selection?.kind === "arrow" && arrowById[selection.arrowId]) {
      return selection;
    }
    if (diagram.primaryNodes[0]) {
      return {
        kind: "entity" as const,
        entityId: diagram.primaryNodes[0].entity.entity_id,
        section: "entity" as const,
      };
    }
    return null;
  }, [arrowById, diagram.primaryNodes, edgeById, nodeById, selection]);

  const selectedNode = activeSelection?.kind === "entity" ? nodeById[activeSelection.entityId] ?? null : null;
  const selectedReviewGroup =
    activeSelection?.kind === "entity" && selectedNode
      ? diagram.entityReviewGroupsByEntityId[selectedNode.entity.entity_id] ?? null
      : null;
  const selectedEdge = activeSelection?.kind === "ownership_edge" ? edgeById[activeSelection.edgeId] ?? null : null;
  const selectedArrow = activeSelection?.kind === "arrow" ? arrowById[activeSelection.arrowId] ?? null : null;
  const selectedProposal =
    selectedEdge?.proposalId != null
      ? proposalById[selectedEdge.proposalId] ?? null
      : selectedArrow?.proposalId != null
        ? proposalById[selectedArrow.proposalId] ?? null
        : null;
  const handleEntityDraftChange = useCallback(
    (entityId: string, draft: Partial<Entity>) => {
      setEntityTypeOverrides((current) => ({
        ...current,
        [entityId]: (draft.entity_type as Entity["entity_type"]) ?? current[entityId],
      }));
    },
    [],
  );

  function fitView() {
    const width = boardRef.current?.clientWidth ?? 0;
    if (!width || !diagram.canvasWidth) {
      setZoom(1);
      return;
    }
    setZoom(Math.min(1, Math.max(0.55, (width - 24) / diagram.canvasWidth)));
  }

  return (
    <div className="stack">
      <div className="subpanel stack">
        <div className="row-between">
          <div>
            <h2>Structure Diagram</h2>
            <p className="muted">
              Review the inferred legal structure as a true company chart with legal-form
              shapes, tax overlays, drawn ownership lines, and separate transaction arrows.
            </p>
          </div>
          <div className="button-row">
            <button className="button-ghost" type="button" onClick={fitView}>
              Fit view
            </button>
            <button className="button-ghost" type="button" onClick={() => setZoom((value) => Math.max(0.55, value - 0.1))}>
              Zoom out
            </button>
            <button className="button-ghost" type="button" onClick={() => setZoom((value) => Math.min(1.4, value + 0.1))}>
              Zoom in
            </button>
            <button className="button-subtle" type="button" onClick={() => { setZoom(1); }}>
              Auto layout
            </button>
          </div>
        </div>
        <Legend />
        <div className="chip-row">
          <span className="chip">{diagram.pendingProposals.length} pending review items</span>
          <span className="chip">{diagram.primaryNodes.length} core chart entities</span>
          <span className="chip">{diagram.secondaryNodes.length} secondary entities</span>
          <span className="chip">Canvas auto-layout</span>
        </div>
      </div>

      <div className="structure-diagram-layout">
        <div className="stack structure-diagram-main">
          {diagram.primaryNodes.length ? (
            <div className="subpanel stack">
              <div className="structure-section-copy">
                <h3>Main legal chart</h3>
                <p className="muted">
                  The canvas is intentionally focused on the best-supported legal ownership
                  structure first. Secondary inferred items stay reviewable below so the
                  company chart remains readable.
                </p>
              </div>
              <div ref={boardRef} className="structure-board-shell">
                <div
                  className="structure-board-scale"
                  style={{
                    width: `${diagram.canvasWidth * zoom}px`,
                    height: `${diagram.canvasHeight * zoom}px`,
                  }}
                >
                  <svg
                    width={diagram.canvasWidth}
                    height={diagram.canvasHeight}
                    viewBox={`0 0 ${diagram.canvasWidth} ${diagram.canvasHeight}`}
                    className="structure-board-svg"
                    style={{ transform: `scale(${zoom})`, transformOrigin: "top left" }}
                  >
                    <rect
                      x={0}
                      y={0}
                      width={diagram.canvasWidth}
                      height={diagram.canvasHeight}
                      className="structure-board-bg"
                    />
                    <pattern id="structure-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                      <path d="M 32 0 L 0 0 0 32" className="structure-grid-line" />
                    </pattern>
                    <rect x={0} y={0} width={diagram.canvasWidth} height={diagram.canvasHeight} fill="url(#structure-grid)" />
                    <DiagramCanvas
                      nodes={diagram.primaryNodes}
                      ownershipEdges={diagram.primaryOwnershipEdges}
                      transactionArrows={diagram.transactionArrows}
                      selectedEntityId={activeSelection?.kind === "entity" ? activeSelection.entityId : null}
                      selectedEdgeId={activeSelection?.kind === "ownership_edge" ? activeSelection.edgeId : null}
                      selectedArrowId={activeSelection?.kind === "arrow" ? activeSelection.arrowId : null}
                      entityTypeOverrides={entityTypeOverrides}
                      onSelect={setSelection}
                    />
                  </svg>
                </div>
              </div>
            </div>
          ) : (
            <div className="subpanel">
              <p className="muted">
                No primary legal chart is available yet. Update the facts or documents and the
                structure proposals will refresh automatically.
              </p>
            </div>
          )}

          {diagram.crossLinks.length ? (
            <div className="subpanel stack">
              <h3>Cross-links / shared ownership</h3>
              <div className="structure-crosslink-list">
                {diagram.crossLinks.map((edge) => (
                  <button
                    key={edge.edgeId}
                    type="button"
                      className={`structure-crosslink-card ${activeSelection?.kind === "ownership_edge" && activeSelection.edgeId === edge.edgeId ? "selected" : ""}`}
                    onClick={() => setSelection({ kind: "ownership_edge", edgeId: edge.edgeId })}
                  >
                    <span className={`chip chip-status chip-status-${edge.status}`}>{titleCase(edge.status)}</span>
                    <strong>
                      {labelEntityById[edge.parentEntityId]?.name ?? edge.parentEntityId}
                      {" → "}
                      {labelEntityById[edge.childEntityId]?.name ?? edge.childEntityId}
                    </strong>
                    <span className="muted">{edge.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {diagram.secondaryNodes.length ? (
            <div className="subpanel stack">
              <div className="structure-section-copy">
                <h3>Additional entities</h3>
                <p className="muted">
                  These inferred entities are still reviewable, but they are intentionally kept
                  off the primary company chart until they are structurally important enough to
                  clarify the legal diagram.
                </p>
              </div>
              <div className="structure-unlinked-grid">
                {diagram.secondaryNodes.map((node) => (
                  <button
                    key={node.entity.entity_id}
                    type="button"
                    className={`structure-unlinked-card ${
                      activeSelection?.kind === "entity" &&
                      activeSelection.entityId === node.entity.entity_id
                        ? "selected"
                        : ""
                    }`}
                    onClick={() => setSelection({ kind: "entity", entityId: node.entity.entity_id, section: "entity" })}
                  >
                    <strong>{node.entity.name}</strong>
                    <span className="muted">
                      {entityTypeLabel(node.entity.entity_type)}
                      {node.classificationLabel ? ` · ${taxClassificationLabel(node.classification?.classification_type ?? node.classificationLabel)}` : ""}
                    </span>
                    {node.roles.length ? (
                      <span className="muted">{truncateList(node.roles.map(transactionRoleLabel), 2)}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {diagram.hiddenTransactionArrows.length ? (
            <div className="subpanel stack">
              <div className="structure-section-copy">
                <h3>Hidden transaction overlays</h3>
                <p className="muted">
                  These step-driven arrows are being kept off the main chart because they do not
                  currently clarify the core legal structure.
                </p>
              </div>
              <div className="structure-arrow-list">
                {diagram.hiddenTransactionArrows.map((arrow) => (
                  <button
                    key={arrow.arrowId}
                    type="button"
                    className={`structure-arrow-card ${activeSelection?.kind === "arrow" && activeSelection.arrowId === arrow.arrowId ? "selected" : ""}`}
                    onClick={() => setSelection({ kind: "arrow", arrowId: arrow.arrowId })}
                  >
                    <span className={`chip chip-status chip-status-${arrow.status}`}>{titleCase(arrow.status)}</span>
                    <strong>{arrow.stepTitle}</strong>
                    <span className="muted">
                      {labelEntityById[arrow.sourceEntityId]?.name ?? arrow.sourceEntityId}
                      {" → "}
                      {labelEntityById[arrow.targetEntityId]?.name ?? arrow.targetEntityId}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="subpanel stack">
            <div className="structure-section-copy">
              <h3>Pending structure items</h3>
              <p className="muted">
                Everything inferred by extraction and synthesis remains reviewable, even when it
                is not drawn on the primary chart.
              </p>
            </div>
            <div className="structure-pending-groups">
              <div className="structure-pending-card">
                <strong>Entities</strong>
                <span className="muted">{diagram.pendingReviewGroups.entities.length} pending</span>
              </div>
              <div className="structure-pending-card">
                <strong>Relationships</strong>
                <span className="muted">{diagram.pendingReviewGroups.relationships.length} pending</span>
              </div>
              <div className="structure-pending-card">
                <strong>Tax + roles</strong>
                <span className="muted">{diagram.pendingReviewGroups.taxAndRoles.length} pending</span>
              </div>
              <div className="structure-pending-card">
                <strong>Steps + filings</strong>
                <span className="muted">{diagram.pendingReviewGroups.stepsAndFilings.length} pending</span>
              </div>
            </div>
          </div>
        </div>

        {selectedNode && selectedReviewGroup ? (
          <EntityWorkspace
            key={`${selectedNode.entity.entity_id}:${selectedReviewGroup.entityProposal?.proposal_id ?? "entity"}:${selectedReviewGroup.classificationProposal?.proposal_id ?? "classification"}:${selectedReviewGroup.roleProposals.map((proposal) => proposal.proposal_id).join(",")}`}
            node={selectedNode}
            reviewGroup={selectedReviewGroup}
            readOnly={readOnly || !onReviewProposal}
            activeSection={activeSelection?.kind === "entity" ? activeSelection.section : "entity"}
            onFocusSection={(section) =>
              setSelection({ kind: "entity", entityId: selectedNode.entity.entity_id, section })
            }
            onEntityDraftChange={handleEntityDraftChange}
            onApproveProposal={(proposalId, normalizedPayload) =>
              onReviewProposal?.(proposalId, "accepted", normalizedPayload)
            }
            onRejectProposal={(proposalId) => onReviewProposal?.(proposalId, "rejected")}
          />
        ) : (
          <GenericProposalEditor
            key={selectedProposal?.proposal_id ?? "empty"}
            proposal={selectedProposal}
            onApprove={(proposalId, normalizedPayload) =>
              onReviewProposal?.(proposalId, "accepted", normalizedPayload)
            }
            onReject={(proposalId) => onReviewProposal?.(proposalId, "rejected")}
            readOnly={readOnly || !onReviewProposal}
          />
        )}
      </div>
    </div>
  );
});
