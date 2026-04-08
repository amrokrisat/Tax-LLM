"use client";

import { memo, useMemo, useRef, useState } from "react";

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
  StructureDiagramNode,
  StructureDiagramOwnershipEdge,
} from "@/lib/structure";

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

function ProposalEditor({
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

function NodeSvg({
  node,
  selected,
  onSelectProposal,
}: {
  node: StructureDiagramNode;
  selected: boolean;
  onSelectProposal: (proposalId: string | null) => void;
}) {
  const nameLines = splitLabel(node.entity.name || "Unnamed entity");
  const legalType = titleCase(node.entity.entity_type);
  const roles = node.roles.slice(0, 2);
  const shapePath = outerShapePath(node.outerShape, node.x, node.y, node.width, node.height);
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
        onClick={() =>
          onSelectProposal(
            node.proposalIdsByKind.entity ??
              node.proposalIdsByKind.classification ??
              node.proposalIdsByKind.roles[0] ??
              null,
          )
        }
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
          onClick={() => onSelectProposal(node.proposalIdsByKind.classification)}
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
        const label = titleCase(role);
        const width = pillWidth(label);
        const x = node.x + 14 + index * (width + 8);
        const y = node.y + node.height - 38;
        const proposalId = node.proposalIdsByKind.roles[index] ?? null;
        return (
          <g
            key={`${node.entity.entity_id}-${role}`}
            className={`structure-role-pill-group ${proposalId ? "clickable" : ""}`}
            onClick={() => onSelectProposal(proposalId)}
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
  selectedProposalId,
  onSelectProposal,
}: {
  nodes: StructureDiagramNode[];
  ownershipEdges: StructureDiagramOwnershipEdge[];
  transactionArrows: StructureDiagramArrow[];
  selectedProposalId: string | null;
  onSelectProposal: (proposalId: string | null) => void;
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
              onClick={() => onSelectProposal(edge.proposalId)}
            />
            <rect x={labelX - 22} y={midY - 20} width={44} height={18} rx={9} className="structure-edge-label-box" />
            <text x={labelX} y={midY - 7} className="structure-edge-label-text" textAnchor="middle">
              {edge.label}
            </text>
            {selectedProposalId === edge.proposalId && edge.proposalId ? (
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
              onClick={() => onSelectProposal(arrow.proposalId ?? null)}
            />
            <rect x={labelX - 42} y={labelY - 15} width={84} height={18} rx={9} className="structure-arrow-label-box" />
            <text x={labelX} y={labelY - 2} className="structure-arrow-label-text" textAnchor="middle">
              {arrow.label}
            </text>
            {selectedProposalId === arrow.proposalId && arrow.proposalId ? (
              <path d={path} className="structure-transaction-arrow-selected" markerEnd="url(#structure-arrowhead)" />
            ) : null}
          </g>
        );
      })}

      {nodes.map((node) => (
        <NodeSvg
          key={node.entity.entity_id}
          node={node}
          selected={
            selectedProposalId != null &&
            [
              node.proposalIdsByKind.entity,
              node.proposalIdsByKind.classification,
              ...node.proposalIdsByKind.roles,
              ...node.proposalIdsByKind.steps,
            ].includes(selectedProposalId)
          }
          onSelectProposal={onSelectProposal}
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
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(
    diagram.pendingProposals[0]?.proposal_id ?? null,
  );
  const boardRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const activeProposalId = useMemo(() => {
    if (
      selectedProposalId &&
      proposals.some((proposal) => proposal.proposal_id === selectedProposalId)
    ) {
      return selectedProposalId;
    }
    return diagram.pendingProposals[0]?.proposal_id ?? null;
  }, [diagram.pendingProposals, proposals, selectedProposalId]);
  const selectedProposal = useMemo(
    () => proposals.find((proposal) => proposal.proposal_id === activeProposalId) ?? null,
    [activeProposalId, proposals],
  );
  const labelEntityById = useMemo(
    () =>
      Object.fromEntries(
        [...diagram.nodes, ...diagram.unlinkedNodes].map((node) => [node.entity.entity_id, node.entity]),
      ) as Record<string, Entity>,
    [diagram.nodes, diagram.unlinkedNodes],
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
            <button className="button-subtle" type="button" onClick={() => { setZoom(1); setSelectedProposalId(null); }}>
              Auto layout
            </button>
          </div>
        </div>
        <Legend />
        <div className="chip-row">
          <span className="chip">{diagram.pendingProposals.length} pending review items</span>
          <span className="chip">Canvas auto-layout</span>
        </div>
      </div>

      <div className="structure-diagram-layout">
        <div className="stack structure-diagram-main">
          {diagram.nodes.length ? (
            <div className="subpanel stack">
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
                      nodes={diagram.nodes}
                      ownershipEdges={diagram.ownershipEdges}
                      transactionArrows={diagram.transactionArrows}
                      selectedProposalId={activeProposalId}
                      onSelectProposal={setSelectedProposalId}
                    />
                  </svg>
                </div>
              </div>
            </div>
          ) : (
            <div className="subpanel">
              <p className="muted">
                No structure has been inferred yet. Update the facts or documents and the
                chart proposals will refresh automatically.
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
                      className={`structure-crosslink-card ${activeProposalId === edge.proposalId ? "selected" : ""}`}
                    onClick={() => setSelectedProposalId(edge.proposalId)}
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

          {diagram.unlinkedNodes.length ? (
            <div className="subpanel stack">
              <h3>Unlinked participants</h3>
              <div className="structure-unlinked-grid">
                {diagram.unlinkedNodes.map((node) => (
                  <button
                    key={node.entity.entity_id}
                    type="button"
                    className={`structure-unlinked-card ${
                      activeProposalId &&
                      [
                        node.proposalIdsByKind.entity,
                        node.proposalIdsByKind.classification,
                        ...node.proposalIdsByKind.roles,
                      ].includes(activeProposalId)
                        ? "selected"
                        : ""
                    }`}
                    onClick={() =>
                      setSelectedProposalId(
                        node.proposalIdsByKind.entity ??
                          node.proposalIdsByKind.classification ??
                          node.proposalIdsByKind.roles[0] ??
                          null,
                      )
                    }
                  >
                    <strong>{node.entity.name}</strong>
                    <span className="muted">
                      {titleCase(node.entity.entity_type)}
                      {node.classificationLabel ? ` · ${node.classificationLabel}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <ProposalEditor
          key={selectedProposal?.proposal_id ?? "empty"}
          proposal={selectedProposal}
          onApprove={(proposalId, normalizedPayload) =>
            onReviewProposal?.(proposalId, "accepted", normalizedPayload)
          }
          onReject={(proposalId) => onReviewProposal?.(proposalId, "rejected")}
          readOnly={readOnly || !onReviewProposal}
        />
      </div>
    </div>
  );
});
