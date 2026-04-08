"use client";

import { memo, useMemo, useState } from "react";

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
  deriveStructureDiagram,
  StructureDiagramArrow,
  StructureDiagramLane,
  StructureDiagramNode,
} from "@/lib/structure";

function ownershipLabel(link: OwnershipLink) {
  const pct = link.ownership_percentage != null ? ` ${link.ownership_percentage}%` : "";
  return `${link.relationship_type.replaceAll("_", " ")}${pct}`;
}

function titleCase(value: string) {
  return value.replaceAll("_", " ");
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

const DiagramNodeCard = memo(function DiagramNodeCard({
  node,
  selected,
  onSelectProposal,
}: {
  node: StructureDiagramNode;
  selected: boolean;
  onSelectProposal: (proposalId: string | null) => void;
}) {
  return (
    <button
      type="button"
      className={`structure-diagram-card ${selected ? "selected" : ""} ${
        node.primaryProposalId ? "clickable" : ""
      }`}
      onClick={() => onSelectProposal(node.primaryProposalId)}
    >
      <div className="structure-diagram-card-header">
        <h4>{node.entity.name || "Unnamed entity"}</h4>
        <span className={`chip chip-status chip-status-${node.displayStatus}`}>{titleCase(node.displayStatus)}</span>
      </div>
      <div className="structure-diagram-chip-row">
        <span className="chip">{titleCase(node.entity.entity_type)}</span>
        {node.classification ? <span className="chip">{titleCase(node.classification.classification_type)}</span> : null}
      </div>
      {node.roles.length ? (
        <div className="structure-diagram-chip-row">
          {node.roles.map((role) => (
            <span key={`${node.entity.entity_id}-${role}`} className="support-pill support-secondary">
              {titleCase(role)}
            </span>
          ))}
        </div>
      ) : null}
      {node.entity.jurisdiction ? <p className="muted">{node.entity.jurisdiction}</p> : null}
      {node.directParentNames.length ? <p className="muted">Owned by {node.directParentNames.join(", ")}</p> : null}
      {node.indirectChildren.length ? (
        <p className="muted">
          Indirect interests:{" "}
          {node.indirectChildren
            .slice(0, 2)
            .map((item) =>
              item.percentage != null ? `${item.childName} (${item.percentage.toFixed(2)}%)` : item.childName,
            )
            .join(", ")}
        </p>
      ) : null}
      <div className="structure-diagram-chip-row">
        <span className="chip">{node.linkedStepCount} linked steps</span>
        <span className="chip">{node.linkedElectionCount} filings/elections</span>
      </div>
    </button>
  );
});

function DiagramLane({
  lane,
  selectedProposalId,
  onSelectProposal,
}: {
  lane: StructureDiagramLane;
  selectedProposalId: string | null;
  onSelectProposal: (proposalId: string | null) => void;
}) {
  return (
    <div className="structure-diagram-lane">
      {lane.columns.map((column, columnIndex) => (
        <div key={`column-${lane.root.entity.entity_id}-${columnIndex}`} className="structure-diagram-column">
          {column.map((node) => (
            <div key={node.entity.entity_id} className="structure-diagram-node-wrap">
              <DiagramNodeCard
                node={node}
                selected={selectedProposalId != null && node.relatedProposalIds.includes(selectedProposalId)}
                onSelectProposal={onSelectProposal}
              />
              {node.outbound.length ? (
                <div className="structure-diagram-edge-list">
                  {node.outbound.map((link) => (
                    <button
                      key={link.link_id}
                      type="button"
                      className={`structure-diagram-edge ${
                        selectedProposalId === link.link_id ? "selected" : ""
                      }`}
                      onClick={() => onSelectProposal(link.link_id)}
                    >
                      <span className={`structure-diagram-line structure-diagram-line-${link.status}`} />
                      <span>{ownershipLabel(link)}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function TransactionOverlay({
  arrows,
  entityById,
  selectedProposalId,
  onSelectProposal,
}: {
  arrows: StructureDiagramArrow[];
  entityById: Record<string, Entity>;
  selectedProposalId: string | null;
  onSelectProposal: (proposalId: string | null) => void;
}) {
  if (!arrows.length) {
    return null;
  }

  return (
    <div className="subpanel stack">
      <div>
        <h3>Transaction overlays</h3>
        <p className="muted">These arrows are derived from proposed or confirmed transaction steps and stay separate from ownership lines.</p>
      </div>
      <div className="structure-arrow-list">
        {arrows.map((arrow) => (
          <button
            key={arrow.arrowId}
            type="button"
            className={`structure-arrow-card ${selectedProposalId === arrow.proposalId ? "selected" : ""}`}
            onClick={() => onSelectProposal(arrow.proposalId ?? null)}
          >
            <span className={`chip chip-status chip-status-${arrow.status}`}>{titleCase(arrow.status)}</span>
            <strong>
              {entityById[arrow.sourceEntityId]?.name ?? arrow.sourceEntityId} →{" "}
              {entityById[arrow.targetEntityId]?.name ?? arrow.targetEntityId}
            </strong>
            <span className="muted">
              {arrow.label} · {arrow.stepTitle}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ProposalEditor({
  proposal,
  onApprove,
  onReject,
  readOnly,
}: {
  proposal: StructureProposal | null;
  onApprove: (proposalId: string, payload: Record<string, string | number | string[] | null>) => void;
  onReject: (proposalId: string) => void;
  readOnly: boolean;
}) {
  const [draftPayload, setDraftPayload] = useState<Record<string, string | number | string[] | null>>(
    proposal?.normalized_payload ?? {},
  );

  if (!proposal) {
    return (
      <div className="subpanel stack">
        <h3>Diagram review</h3>
        <p className="muted">Select a proposed node, ownership line, or transaction overlay to edit and approve it from the chart.</p>
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
        <span className={`chip chip-status chip-status-${proposal.record_status}`}>{titleCase(proposal.record_status)}</span>
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
          const rendered = Array.isArray(value) ? value.join(", ") : value == null ? "" : String(value);
          return (
            <label key={field.key} className="field">
              <span>{field.label}</span>
              <input
                disabled={readOnly}
                value={rendered}
                onChange={(event) =>
                  setDraftPayload({
                    ...draftPayload,
                    [field.key]: parseEditedValue(value, event.target.value),
                  })
                }
              />
            </label>
          );
        })}
      </div>

      {!readOnly && proposal.review_status === "pending" ? (
        <div className="button-row">
          <button className="button-subtle" type="button" onClick={() => onApprove(proposal.proposal_id, draftPayload)}>
            Approve edited proposal
          </button>
          <button className="button-ghost" type="button" onClick={() => onReject(proposal.proposal_id)}>
            Reject proposal
          </button>
        </div>
      ) : (
        <span className="chip">{proposal.review_status}</span>
      )}
    </div>
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
  const entityById = useMemo(
    () => Object.fromEntries(diagram.lanes.flatMap((lane) => lane.columns.flat().map((node) => [node.entity.entity_id, node.entity]))),
    [diagram.lanes],
  );
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(diagram.pendingProposals[0]?.proposal_id ?? null);
  const activeProposalId = useMemo(() => {
    if (selectedProposalId && proposals.some((proposal) => proposal.proposal_id === selectedProposalId)) {
      return selectedProposalId;
    }
    return diagram.pendingProposals[0]?.proposal_id ?? null;
  }, [diagram.pendingProposals, proposals, selectedProposalId]);
  const selectedProposal = useMemo(
    () => proposals.find((proposal) => proposal.proposal_id === activeProposalId) ?? null,
    [activeProposalId, proposals],
  );

  return (
    <div className="stack">
      <div className="subpanel stack">
        <h2>Structure Diagram</h2>
        <p className="muted">
          Review the inferred legal structure as a professional company chart. Ownership lines are primary, while transaction overlays reflect the proposed or confirmed step plan.
        </p>
        <div className="chip-row">
          <span className="chip chip-status chip-status-confirmed">confirmed</span>
          <span className="chip chip-status chip-status-proposed">proposed</span>
          <span className="chip chip-status chip-status-uncertain">uncertain</span>
          <span className="chip">{diagram.pendingProposals.length} pending review items</span>
        </div>
      </div>

      <div className="structure-diagram-layout">
        <div className="stack structure-diagram-main">
          {diagram.lanes.length ? (
            diagram.lanes.map((lane) => (
              <div key={lane.root.entity.entity_id} className="subpanel stack">
                <DiagramLane
                  lane={lane}
                  selectedProposalId={activeProposalId}
                  onSelectProposal={setSelectedProposalId}
                />
              </div>
            ))
          ) : (
            <div className="subpanel">
              <p className="muted">
                No structure has been inferred yet. Update the facts or documents and the diagram proposals will refresh automatically.
              </p>
            </div>
          )}

          <TransactionOverlay
            arrows={diagram.transactionArrows}
            entityById={entityById}
            selectedProposalId={activeProposalId}
            onSelectProposal={setSelectedProposalId}
          />

          {diagram.multiOwnerNodes.length ? (
            <div className="subpanel stack">
              <h3>Shared ownership / off-tree entities</h3>
              <div className="structure-node-grid">
                {diagram.multiOwnerNodes.map((node) => (
                  <DiagramNodeCard
                    key={node.entity.entity_id}
                    node={node}
                    selected={activeProposalId != null && node.relatedProposalIds.includes(activeProposalId)}
                    onSelectProposal={setSelectedProposalId}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {diagram.unlinkedNodes.length ? (
            <div className="subpanel stack">
              <h3>Unlinked participants</h3>
              <div className="structure-node-grid">
                {diagram.unlinkedNodes.map((node) => (
                  <DiagramNodeCard
                    key={node.entity.entity_id}
                    node={node}
                    selected={activeProposalId != null && node.relatedProposalIds.includes(activeProposalId)}
                    onSelectProposal={setSelectedProposalId}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <ProposalEditor
          key={selectedProposal?.proposal_id ?? "empty"}
          proposal={selectedProposal}
          onApprove={(proposalId, normalizedPayload) => onReviewProposal?.(proposalId, "accepted", normalizedPayload)}
          onReject={(proposalId) => onReviewProposal?.(proposalId, "rejected")}
          readOnly={readOnly || !onReviewProposal}
        />
      </div>
    </div>
  );
});
