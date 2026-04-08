import {
  ElectionOrFilingItem,
  Entity,
  OwnershipLink,
  StructureProposal,
  StructuredRecordStatus,
  TaxClassification,
  TransactionRole,
  TransactionStep,
} from "@/lib/api";

const NODE_WIDTH = 190;
const NODE_HEIGHT = 156;
const HORIZONTAL_GAP = 58;
const VERTICAL_GAP = 92;
const CANVAS_PADDING_X = 72;
const CANVAS_PADDING_Y = 56;
const ROOT_GAP = 96;

export type DiagramShape =
  | "rectangle"
  | "rounded"
  | "triangle"
  | "diamond"
  | "circle"
  | "oval";

export function normalizeStepFamily(stepType: string) {
  const aliases: Record<string, string> = {
    stock_purchase: "stock form acquisition",
    stock_sale: "stock form acquisition",
    asset_purchase: "asset form acquisition",
    asset_sale: "asset form acquisition",
    pre_closing_reorganization: "pre-closing reorganization",
    post_closing_integration: "post-closing integration",
  };
  return aliases[stepType] ?? stepType.replaceAll("_", " ");
}

function normalizeName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function entityIdFromProposal(proposal: StructureProposal) {
  return proposal.proposal_id;
}

export function deriveIndirectOwnership(entities: Entity[], ownershipLinks: OwnershipLink[]) {
  const byId = Object.fromEntries(entities.map((entity) => [entity.entity_id, entity]));
  const children = ownershipLinks.reduce<Record<string, OwnershipLink[]>>((acc, link) => {
    if (!acc[link.parent_entity_id]) {
      acc[link.parent_entity_id] = [];
    }
    acc[link.parent_entity_id].push(link);
    return acc;
  }, {});

  const derived: Array<{ parentName: string; childName: string; percentage: number | null }> = [];
  for (const entity of entities) {
    const queue: Array<{ entityId: string; percentage: number | null; visited: Set<string> }> = [
      { entityId: entity.entity_id, percentage: 100, visited: new Set([entity.entity_id]) },
    ];
    while (queue.length) {
      const current = queue.shift()!;
      for (const link of children[current.entityId] ?? []) {
        if (current.visited.has(link.child_entity_id)) {
          continue;
        }
        const nextPct =
          current.percentage != null && link.ownership_percentage != null
            ? (current.percentage * link.ownership_percentage) / 100
            : link.ownership_percentage ?? null;
        if (
          entity.entity_id !== link.child_entity_id &&
          !ownershipLinks.some(
            (item) =>
              item.parent_entity_id === entity.entity_id &&
              item.child_entity_id === link.child_entity_id,
          )
        ) {
          derived.push({
            parentName: byId[entity.entity_id]?.name ?? entity.entity_id,
            childName: byId[link.child_entity_id]?.name ?? link.child_entity_id,
            percentage: nextPct,
          });
        }
        queue.push({
          entityId: link.child_entity_id,
          percentage: nextPct,
          visited: new Set([...current.visited, link.child_entity_id]),
        });
      }
    }
  }
  return derived;
}

type MaterializedStructure = {
  entities: Entity[];
  ownershipLinks: OwnershipLink[];
  taxClassifications: TaxClassification[];
  transactionRoles: TransactionRole[];
  transactionSteps: TransactionStep[];
  electionItems: ElectionOrFilingItem[];
};

export function materializeStructureRecords(
  entities: Entity[],
  ownershipLinks: OwnershipLink[],
  taxClassifications: TaxClassification[],
  transactionRoles: TransactionRole[],
  transactionSteps: TransactionStep[],
  electionItems: ElectionOrFilingItem[],
  structureProposals: StructureProposal[] = [],
): MaterializedStructure {
  const mergedEntities = [...entities];
  const mergedLinks = [...ownershipLinks];
  const mergedClassifications = [...taxClassifications];
  const mergedRoles = [...transactionRoles];
  const mergedSteps = [...transactionSteps];
  const mergedElectionItems = [...electionItems];

  const entityIdByName = new Map(
    mergedEntities.map((entity) => [normalizeName(entity.name), entity.entity_id]),
  );

  function ensureEntityFromName(
    name: string,
    entityType = "other",
    status: StructuredRecordStatus = "proposed",
    proposalId?: string,
  ) {
    const normalized = normalizeName(name);
    if (!normalized) {
      return "";
    }
    const existingId = entityIdByName.get(normalized);
    if (existingId) {
      return existingId;
    }
    const entityId =
      proposalId ?? `proposal-entity-${normalized.replaceAll(/[^a-z0-9]+/g, "-")}`;
    mergedEntities.push({
      entity_id: entityId,
      name,
      entity_type: (entityType as Entity["entity_type"]) ?? "other",
      jurisdiction: null,
      status,
      notes: "",
      source_fact_ids: [],
    });
    entityIdByName.set(normalized, entityId);
    return entityId;
  }

  for (const proposal of structureProposals.filter((item) => item.review_status !== "rejected")) {
    const payload = proposal.normalized_payload ?? {};
    if (proposal.proposal_kind === "entity") {
      ensureEntityFromName(
        String(payload.name ?? proposal.label),
        String(payload.entity_type ?? "other"),
        proposal.record_status,
        entityIdFromProposal(proposal),
      );
    }
  }

  for (const proposal of structureProposals.filter((item) => item.review_status !== "rejected")) {
    const payload = proposal.normalized_payload ?? {};

    if (proposal.proposal_kind === "tax_classification") {
      const entityId = ensureEntityFromName(String(payload.entity_name ?? ""));
      if (!entityId || mergedClassifications.some((item) => item.entity_id === entityId)) {
        continue;
      }
      mergedClassifications.push({
        classification_id: proposal.proposal_id,
        entity_id: entityId,
        classification_type: String(payload.classification_type ?? "unknown") as TaxClassification["classification_type"],
        status: proposal.record_status,
        notes: proposal.rationale,
        source_fact_ids: proposal.source_fact_ids,
      });
    }

    if (proposal.proposal_kind === "transaction_role") {
      const entityId = ensureEntityFromName(String(payload.entity_name ?? ""));
      if (
        !entityId ||
        mergedRoles.some(
          (item) => item.entity_id === entityId && item.role_type === payload.role_type,
        )
      ) {
        continue;
      }
      mergedRoles.push({
        role_id: proposal.proposal_id,
        entity_id: entityId,
        role_type: String(payload.role_type ?? "other") as TransactionRole["role_type"],
        status: proposal.record_status,
        notes: proposal.rationale,
        source_fact_ids: proposal.source_fact_ids,
      });
    }

    if (proposal.proposal_kind === "ownership_link") {
      const parentId = ensureEntityFromName(String(payload.parent_entity_name ?? ""));
      const childId = ensureEntityFromName(String(payload.child_entity_name ?? ""));
      if (
        !parentId ||
        !childId ||
        mergedLinks.some(
          (item) =>
            item.parent_entity_id === parentId &&
            item.child_entity_id === childId &&
            item.relationship_type === payload.relationship_type,
        )
      ) {
        continue;
      }
      mergedLinks.push({
        link_id: proposal.proposal_id,
        parent_entity_id: parentId,
        child_entity_id: childId,
        relationship_type: String(payload.relationship_type ?? "owns") as OwnershipLink["relationship_type"],
        ownership_scope: String(payload.ownership_scope ?? "direct") as OwnershipLink["ownership_scope"],
        ownership_percentage:
          typeof payload.ownership_percentage === "number"
            ? payload.ownership_percentage
            : null,
        status: proposal.record_status,
        notes: proposal.rationale,
        source_fact_ids: proposal.source_fact_ids,
      });
    }

    if (proposal.proposal_kind === "transaction_step") {
      if (
        mergedSteps.some(
          (item) =>
            normalizeName(item.title) ===
            normalizeName(String(payload.title ?? proposal.label)),
        )
      ) {
        continue;
      }
      mergedSteps.push({
        step_id: proposal.proposal_id,
        sequence_number: mergedSteps.length + 1,
        phase: String(payload.phase ?? "pre_closing") as TransactionStep["phase"],
        step_type: String(payload.step_type ?? "other") as TransactionStep["step_type"],
        title: String(payload.title ?? proposal.label),
        description: String(payload.description ?? proposal.rationale ?? ""),
        entity_ids: (Array.isArray(payload.entity_names) ? payload.entity_names : [])
          .map((name) => ensureEntityFromName(String(name)))
          .filter(Boolean),
        status: proposal.record_status,
        source_fact_ids: proposal.source_fact_ids,
      });
    }

    if (proposal.proposal_kind === "election_filing_item") {
      if (
        mergedElectionItems.some(
          (item) =>
            normalizeName(item.name) ===
            normalizeName(String(payload.name ?? proposal.label)),
        )
      ) {
        continue;
      }
      mergedElectionItems.push({
        item_id: proposal.proposal_id,
        name: String(payload.name ?? proposal.label),
        item_type: String(payload.item_type ?? "other") as ElectionOrFilingItem["item_type"],
        citation_or_form: String(payload.citation_or_form ?? ""),
        related_entity_ids: (Array.isArray(payload.related_entity_names)
          ? payload.related_entity_names
          : [])
          .map((name) => ensureEntityFromName(String(name)))
          .filter(Boolean),
        related_step_ids: [],
        status: String(payload.status ?? "possible") as ElectionOrFilingItem["status"],
        notes: String(payload.notes ?? proposal.rationale ?? ""),
        source_fact_ids: proposal.source_fact_ids,
      });
    }
  }

  return {
    entities: mergedEntities,
    ownershipLinks: mergedLinks,
    taxClassifications: mergedClassifications,
    transactionRoles: mergedRoles,
    transactionSteps: mergedSteps,
    electionItems: mergedElectionItems,
  };
}

export function summarizeEntityStructure(
  entities: Entity[],
  ownershipLinks: OwnershipLink[],
  taxClassifications: TaxClassification[],
  transactionRoles: TransactionRole[],
) {
  const indirect = deriveIndirectOwnership(entities, ownershipLinks);
  return entities.map((entity) => {
    const classification = taxClassifications.find(
      (item) => item.entity_id === entity.entity_id,
    );
    const roles = transactionRoles
      .filter((item) => item.entity_id === entity.entity_id)
      .map((item) => item.role_type);
    const outbound = ownershipLinks.filter(
      (item) => item.parent_entity_id === entity.entity_id,
    );
    const inbound = ownershipLinks.filter(
      (item) => item.child_entity_id === entity.entity_id,
    );
    const indirectChildren = indirect.filter((item) => item.parentName === entity.name);
    return { entity, classification, roles, outbound, inbound, indirectChildren };
  });
}

export function summarizeStepPlan(steps: TransactionStep[]) {
  return [...steps]
    .sort((left, right) => left.sequence_number - right.sequence_number)
    .map((step) => ({
      ...step,
      normalizedFamily: normalizeStepFamily(step.step_type),
    }));
}

export type StructureMapNode = {
  entity: Entity;
  classification: TaxClassification | undefined;
  roles: string[];
  inbound: OwnershipLink[];
  outbound: OwnershipLink[];
  displayStatus: StructuredRecordStatus;
  directParentNames: string[];
  directChildNames: string[];
  indirectChildren: Array<{ parentName: string; childName: string; percentage: number | null }>;
  linkedStepCount: number;
  linkedElectionCount: number;
  children: StructureMapNode[];
};

export type StructureMapModel = {
  roots: StructureMapNode[];
  multiOwnerNodes: StructureMapNode[];
  unlinkedNodes: StructureMapNode[];
};

export type StructureDiagramNode = Omit<StructureMapNode, "children"> & {
  x: number;
  y: number;
  width: number;
  height: number;
  outerShape: DiagramShape;
  classificationShape: DiagramShape | "badge" | null;
  classificationBadgeText: string | null;
  classificationLabel: string | null;
  countryBadge: string | null;
  proposalIdsByKind: {
    entity: string | null;
    classification: string | null;
    roles: string[];
    steps: string[];
  };
};

export type StructureDiagramOwnershipEdge = {
  edgeId: string;
  parentEntityId: string;
  childEntityId: string;
  label: string;
  status: StructuredRecordStatus;
  proposalId: string | null;
  crossLink: boolean;
};

export type StructureDiagramArrow = {
  arrowId: string;
  label: string;
  sourceEntityId: string;
  targetEntityId: string;
  status: StructuredRecordStatus;
  stepTitle: string;
  stepType: string;
  proposalId?: string;
};

export type StructureDiagramPendingReviewGroups = {
  entities: StructureProposal[];
  relationships: StructureProposal[];
  taxAndRoles: StructureProposal[];
  stepsAndFilings: StructureProposal[];
};

export type StructureDiagramModel = {
  nodes: StructureDiagramNode[];
  ownershipEdges: StructureDiagramOwnershipEdge[];
  crossLinks: StructureDiagramOwnershipEdge[];
  transactionArrows: StructureDiagramArrow[];
  hiddenTransactionArrows: StructureDiagramArrow[];
  pendingProposals: StructureProposal[];
  pendingReviewGroups: StructureDiagramPendingReviewGroups;
  canvasWidth: number;
  canvasHeight: number;
  unlinkedNodes: StructureDiagramNode[];
  multiOwnerNodes: StructureDiagramNode[];
  primaryNodes: StructureDiagramNode[];
  primaryOwnershipEdges: StructureDiagramOwnershipEdge[];
  secondaryNodes: StructureDiagramNode[];
};

function statusRank(status: StructuredRecordStatus) {
  return status === "confirmed" ? 2 : status === "uncertain" ? 1 : 0;
}

function titleFromStatus(status: string) {
  return status.replaceAll("_", " ");
}

function proposalEntityName(proposal: StructureProposal) {
  const payload = proposal.normalized_payload ?? {};
  if (proposal.proposal_kind === "entity") {
    return String(payload.name ?? proposal.label);
  }
  if (
    proposal.proposal_kind === "tax_classification" ||
    proposal.proposal_kind === "transaction_role"
  ) {
    return String(payload.entity_name ?? "");
  }
  return "";
}

function buildProposalIndexes(proposals: StructureProposal[]) {
  const pending = proposals.filter((proposal) => proposal.review_status === "pending");
  const entityById = new Map<string, StructureProposal>();
  const byEntityName = new Map<string, StructureProposal[]>();
  const roleByEntityName = new Map<string, StructureProposal[]>();
  const classificationByEntityName = new Map<string, StructureProposal>();
  const stepById = new Map<string, StructureProposal>();

  for (const proposal of pending) {
    if (proposal.proposal_kind === "entity") {
      entityById.set(entityIdFromProposal(proposal), proposal);
    }
    const entityName = normalizeName(proposalEntityName(proposal));
    if (entityName) {
      byEntityName.set(entityName, [...(byEntityName.get(entityName) ?? []), proposal]);
      if (proposal.proposal_kind === "transaction_role") {
        roleByEntityName.set(entityName, [
          ...(roleByEntityName.get(entityName) ?? []),
          proposal,
        ]);
      }
      if (proposal.proposal_kind === "tax_classification") {
        classificationByEntityName.set(entityName, proposal);
      }
    }
    if (proposal.proposal_kind === "transaction_step") {
      stepById.set(proposal.proposal_id, proposal);
    }
  }

  return { pending, entityById, byEntityName, roleByEntityName, classificationByEntityName, stepById };
}

function outerShapeForEntityType(entityType: Entity["entity_type"]): DiagramShape {
  switch (entityType) {
    case "partnership":
      return "triangle";
    case "trust":
      return "diamond";
    case "individual":
      return "circle";
    case "branch":
      return "oval";
    case "other":
      return "rounded";
    default:
      return "rectangle";
  }
}

function classificationBadge(
  classificationType?: TaxClassification["classification_type"] | null,
): { shape: StructureDiagramNode["classificationShape"]; text: string | null; label: string | null } {
  switch (classificationType) {
    case "partnership":
      return { shape: "triangle", text: "P", label: "partnership" };
    case "disregarded_entity":
      return { shape: "oval", text: "DE", label: "disregarded entity" };
    case "s_corporation":
      return { shape: "badge", text: "S", label: "S corporation" };
    case "c_corporation":
      return { shape: "rectangle", text: "C", label: "C corporation" };
    case "foreign_corporation":
      return { shape: "rectangle", text: "FC", label: "foreign corporation" };
    case "grantor_trust":
      return { shape: "diamond", text: "GT", label: "grantor trust" };
    case "individual":
      return { shape: "circle", text: "I", label: "individual" };
    case "unknown":
      return { shape: "badge", text: "?", label: "unknown" };
    default:
      return { shape: null, text: null, label: null };
  }
}

function abbreviationForJurisdiction(jurisdiction: string | null | undefined) {
  const value = (jurisdiction ?? "").trim();
  if (!value) {
    return null;
  }
  const tokens = value
    .split(/[\s,/-]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.length) {
    return null;
  }
  if (tokens.length === 1 && tokens[0].length <= 3) {
    return tokens[0].toUpperCase();
  }
  return tokens
    .slice(0, 2)
    .map((token) => token[0]?.toUpperCase() ?? "")
    .join("");
}

function edgeLabel(link: OwnershipLink) {
  if (link.ownership_percentage != null) {
    return `${link.ownership_percentage}%`;
  }
  return titleFromStatus(link.relationship_type);
}

function rolePriority(role: string) {
  switch (role) {
    case "target":
      return 64;
    case "blocker":
      return 46;
    case "holding_company":
      return 34;
    case "individual_owner":
    case "seller":
      return 28;
    case "buyer":
      return 38;
    case "parent":
      return 30;
    case "merger_sub":
      return 30;
    default:
      return 8;
  }
}

function inferNameSignals(name: string) {
  const lowered = normalizeName(name);
  return {
    sellerSide:
      /founder|holdco|blocker|target|seller/.test(lowered),
    buyerSide: /acq|buyer|parent|merger sub|sub/.test(lowered),
  };
}

function componentLabel(
  entityIds: string[],
  rolesByEntityId: Record<string, string[]>,
  entitiesById: Record<string, Entity>,
) {
  let sellerSignals = 0;
  let buyerSignals = 0;
  for (const entityId of entityIds) {
    const entity = entitiesById[entityId];
    const roles = rolesByEntityId[entityId] ?? [];
    for (const role of roles) {
      if (["target", "blocker", "holding_company", "individual_owner", "seller"].includes(role)) {
        sellerSignals += 2;
      }
      if (["buyer", "parent", "merger_sub"].includes(role)) {
        buyerSignals += 2;
      }
    }
    const signals = inferNameSignals(entity?.name ?? "");
    if (signals.sellerSide) {
      sellerSignals += 1;
    }
    if (signals.buyerSide) {
      buyerSignals += 1;
    }
  }
  if (sellerSignals >= buyerSignals && sellerSignals > 0) {
    return "Seller-side legal chain";
  }
  if (buyerSignals > 0) {
    return "Buyer-side chain";
  }
  return "Additional legal chain";
}

function buildPendingReviewGroups(
  proposals: StructureProposal[],
): StructureDiagramPendingReviewGroups {
  const pending = proposals.filter((proposal) => proposal.review_status === "pending");
  return {
    entities: pending.filter((proposal) => proposal.proposal_kind === "entity"),
    relationships: pending.filter((proposal) =>
      ["ownership_link"].includes(proposal.proposal_kind),
    ),
    taxAndRoles: pending.filter((proposal) =>
      ["tax_classification", "transaction_role"].includes(proposal.proposal_kind),
    ),
    stepsAndFilings: pending.filter((proposal) =>
      ["transaction_step", "election_filing_item"].includes(proposal.proposal_kind),
    ),
  };
}

type BaseNodeData = Omit<
  StructureDiagramNode,
  "x" | "y" | "width" | "height"
>;

function createBaseNode(
  entity: Entity,
  byId: Record<string, Entity>,
  inboundByChild: Record<string, OwnershipLink[]>,
  outboundByParent: Record<string, OwnershipLink[]>,
  classificationsByEntityId: Record<string, TaxClassification>,
  rolesByEntityId: Record<string, string[]>,
  indirectOwnership: Array<{ parentName: string; childName: string; percentage: number | null }>,
  stepsByEntityId: Record<string, number>,
  electionsByEntityId: Record<string, number>,
  proposalIndexes: ReturnType<typeof buildProposalIndexes>,
): BaseNodeData {
  const inbound = inboundByChild[entity.entity_id] ?? [];
  const outbound = outboundByParent[entity.entity_id] ?? [];
  const classification = classificationsByEntityId[entity.entity_id];
  const normalizedEntityName = normalizeName(entity.name);
  const relatedNameProposals = proposalIndexes.byEntityName.get(normalizedEntityName) ?? [];
  const primaryProposal =
    proposalIndexes.entityById.get(entity.entity_id) ??
    relatedNameProposals.find((proposal) => proposal.proposal_kind === "entity") ??
    null;
  const classificationProposal =
    proposalIndexes.classificationByEntityName.get(normalizedEntityName) ?? null;
  const roleProposals = proposalIndexes.roleByEntityName.get(normalizedEntityName) ?? [];
  const badge = classificationBadge(classification?.classification_type);

  const displayStatus =
    (
      [entity.status, classification?.status, ...inbound.map((item) => item.status), ...outbound.map((item) => item.status)]
        .filter(Boolean)
        .sort(
          (left, right) =>
            statusRank(right as StructuredRecordStatus) -
            statusRank(left as StructuredRecordStatus),
        )[0] as StructuredRecordStatus
    ) ?? entity.status;

  return {
    entity,
    classification,
    roles: rolesByEntityId[entity.entity_id] ?? [],
    inbound,
    outbound,
    displayStatus,
    directParentNames: inbound.map(
      (item) => byId[item.parent_entity_id]?.name ?? item.parent_entity_id,
    ),
    directChildNames: outbound.map(
      (item) => byId[item.child_entity_id]?.name ?? item.child_entity_id,
    ),
    indirectChildren: indirectOwnership.filter((item) => item.parentName === entity.name),
    linkedStepCount: stepsByEntityId[entity.entity_id] ?? 0,
    linkedElectionCount: electionsByEntityId[entity.entity_id] ?? 0,
    outerShape: outerShapeForEntityType(entity.entity_type),
    classificationShape: badge.shape,
    classificationBadgeText: badge.text,
    classificationLabel: badge.label,
    countryBadge: abbreviationForJurisdiction(entity.jurisdiction),
    proposalIdsByKind: {
      entity: primaryProposal?.proposal_id ?? null,
      classification: classificationProposal?.proposal_id ?? null,
      roles: roleProposals.map((proposal) => proposal.proposal_id),
      steps: proposalIndexes.pending
        .filter(
          (proposal) =>
            proposal.proposal_kind === "transaction_step" &&
            Array.isArray(proposal.normalized_payload.entity_names) &&
            (proposal.normalized_payload.entity_names as string[])
              .map((name) => normalizeName(name))
              .includes(normalizedEntityName),
        )
        .map((proposal) => proposal.proposal_id),
    },
  };
}

function computeSubtreeWidth(
  entityId: string,
  childIdsByParent: Record<string, string[]>,
  cache: Map<string, number>,
): number {
  const cached = cache.get(entityId);
  if (cached != null) {
    return cached;
  }
  const children = childIdsByParent[entityId] ?? [];
  if (!children.length) {
    cache.set(entityId, NODE_WIDTH);
    return NODE_WIDTH;
  }
  const childrenWidth =
    children.reduce(
      (total, childId) => total + computeSubtreeWidth(childId, childIdsByParent, cache),
      0,
    ) +
    HORIZONTAL_GAP * Math.max(children.length - 1, 0);
  const value = Math.max(NODE_WIDTH, childrenWidth);
  cache.set(entityId, value);
  return value;
}

function deriveTransactionArrows(
  steps: TransactionStep[],
  entitiesById: Record<string, Entity>,
  stepProposalById: Map<string, StructureProposal>,
): StructureDiagramArrow[] {
  return [...steps]
    .sort((left, right) => left.sequence_number - right.sequence_number)
    .flatMap((step) => {
      if (
        ![
          "merger",
          "stock_purchase",
          "stock_sale",
          "distribution",
          "contribution",
          "asset_purchase",
          "asset_sale",
          "post_closing_integration",
        ].includes(step.step_type)
      ) {
        return [];
      }
      if (step.entity_ids.length < 2) {
        return [];
      }
      const sourceEntityId = step.entity_ids[0];
      const targetEntityId = step.entity_ids[step.entity_ids.length - 1];
      if (
        !entitiesById[sourceEntityId] ||
        !entitiesById[targetEntityId] ||
        sourceEntityId === targetEntityId
      ) {
        return [];
      }
      return [
        {
          arrowId: `arrow-${step.step_id}`,
          label: normalizeStepFamily(step.step_type),
          sourceEntityId,
          targetEntityId,
          status: step.status,
          stepTitle: step.title,
          stepType: step.step_type,
          proposalId: stepProposalById.get(step.step_id)?.proposal_id,
        },
      ];
    });
}

export function deriveStructureMap(
  entities: Entity[],
  ownershipLinks: OwnershipLink[],
  taxClassifications: TaxClassification[],
  transactionRoles: TransactionRole[],
  transactionSteps: TransactionStep[],
  electionItems: ElectionOrFilingItem[],
  structureProposals: StructureProposal[] = [],
): StructureMapModel {
  const diagram = deriveStructureDiagram(
    entities,
    ownershipLinks,
    taxClassifications,
    transactionRoles,
    transactionSteps,
    electionItems,
    structureProposals,
  );
  const nodesById = Object.fromEntries(diagram.nodes.map((node) => [node.entity.entity_id, node]));
  const childIdsByParent = diagram.ownershipEdges.reduce<Record<string, string[]>>((acc, edge) => {
    if (!acc[edge.parentEntityId]) {
      acc[edge.parentEntityId] = [];
    }
    acc[edge.parentEntityId].push(edge.childEntityId);
    return acc;
  }, {});
  function toTree(entityId: string): StructureMapNode {
    const node = nodesById[entityId];
    return {
      entity: node.entity,
      classification: node.classification,
      roles: node.roles,
      inbound: node.inbound,
      outbound: node.outbound,
      displayStatus: node.displayStatus,
      directParentNames: node.directParentNames,
      directChildNames: node.directChildNames,
      indirectChildren: node.indirectChildren,
      linkedStepCount: node.linkedStepCount,
      linkedElectionCount: node.linkedElectionCount,
      children: (childIdsByParent[entityId] ?? []).map(toTree),
    };
  }
  const multiOwnerIds = new Set(diagram.crossLinks.map((edge) => edge.childEntityId));
  const linkedIds = new Set(diagram.ownershipEdges.flatMap((edge) => [edge.parentEntityId, edge.childEntityId]));
  const roots = diagram.nodes
    .filter((node) => !node.inbound.length)
    .map((node) => toTree(node.entity.entity_id));
  return {
    roots,
    multiOwnerNodes: diagram.nodes
      .filter((node) => multiOwnerIds.has(node.entity.entity_id))
      .map((node) => toTree(node.entity.entity_id)),
    unlinkedNodes: diagram.nodes
      .filter((node) => !linkedIds.has(node.entity.entity_id))
      .map((node) => toTree(node.entity.entity_id)),
  };
}

export function deriveStructureDiagram(
  entities: Entity[],
  ownershipLinks: OwnershipLink[],
  taxClassifications: TaxClassification[],
  transactionRoles: TransactionRole[],
  transactionSteps: TransactionStep[],
  electionItems: ElectionOrFilingItem[],
  structureProposals: StructureProposal[] = [],
): StructureDiagramModel {
  const materialized = materializeStructureRecords(
    entities,
    ownershipLinks,
    taxClassifications,
    transactionRoles,
    transactionSteps,
    electionItems,
    structureProposals,
  );
  const proposalIndexes = buildProposalIndexes(structureProposals);
  const byId = Object.fromEntries(
    materialized.entities.map((entity) => [entity.entity_id, entity]),
  );
  const classificationsByEntityId = Object.fromEntries(
    materialized.taxClassifications.map((item) => [item.entity_id, item]),
  );
  const rolesByEntityId = materialized.transactionRoles.reduce<Record<string, string[]>>(
    (acc, role) => {
      if (!acc[role.entity_id]) {
        acc[role.entity_id] = [];
      }
      acc[role.entity_id].push(role.role_type);
      return acc;
    },
    {},
  );
  const stepsByEntityId = materialized.transactionSteps.reduce<Record<string, number>>(
    (acc, step) => {
      for (const entityId of step.entity_ids) {
        acc[entityId] = (acc[entityId] ?? 0) + 1;
      }
      return acc;
    },
    {},
  );
  const electionsByEntityId = materialized.electionItems.reduce<Record<string, number>>(
    (acc, item) => {
      for (const entityId of item.related_entity_ids) {
        acc[entityId] = (acc[entityId] ?? 0) + 1;
      }
      return acc;
    },
    {},
  );
  const indirectOwnership = deriveIndirectOwnership(
    materialized.entities,
    materialized.ownershipLinks,
  );

  const chartLinks = [...materialized.ownershipLinks];
  const parentCandidates = materialized.entities.filter((entity) =>
    (rolesByEntityId[entity.entity_id] ?? []).includes("parent"),
  );
  const mergerSubCandidates = materialized.entities.filter((entity) =>
    (rolesByEntityId[entity.entity_id] ?? []).includes("merger_sub"),
  );
  if (
    parentCandidates.length === 1 &&
    mergerSubCandidates.length === 1 &&
    !chartLinks.some(
      (link) =>
        link.parent_entity_id === parentCandidates[0].entity_id &&
        link.child_entity_id === mergerSubCandidates[0].entity_id,
    )
  ) {
    chartLinks.push({
      link_id: `derived-parent-${parentCandidates[0].entity_id}-${mergerSubCandidates[0].entity_id}`,
      parent_entity_id: parentCandidates[0].entity_id,
      child_entity_id: mergerSubCandidates[0].entity_id,
      relationship_type: "owns",
      ownership_scope: "direct",
      ownership_percentage: 100,
      status: "proposed",
      notes: "Derived display link from the parent / merger-sub structure.",
      source_fact_ids: [],
    });
  }

  const inboundByChild = chartLinks.reduce<Record<string, OwnershipLink[]>>((acc, link) => {
    if (!acc[link.child_entity_id]) {
      acc[link.child_entity_id] = [];
    }
    acc[link.child_entity_id].push(link);
    return acc;
  }, {});
  const outboundByParent = chartLinks.reduce<Record<string, OwnershipLink[]>>((acc, link) => {
    if (!acc[link.parent_entity_id]) {
      acc[link.parent_entity_id] = [];
    }
    acc[link.parent_entity_id].push(link);
    return acc;
  }, {});

  const multiOwnerIds = new Set(
    materialized.entities
      .filter((entity) => (chartLinks.filter((link) => link.child_entity_id === entity.entity_id)).length > 1)
      .map((entity) => entity.entity_id),
  );

  const baseNodeById = Object.fromEntries(
    materialized.entities.map((entity) => [
      entity.entity_id,
      createBaseNode(
        entity,
        byId,
        inboundByChild,
        outboundByParent,
        classificationsByEntityId,
        rolesByEntityId,
        indirectOwnership,
        stepsByEntityId,
        electionsByEntityId,
        proposalIndexes,
      ),
    ]),
  ) as Record<string, BaseNodeData>;

  const connectedIdsByEntity = chartLinks.reduce<Record<string, Set<string>>>((acc, link) => {
    if (!acc[link.parent_entity_id]) {
      acc[link.parent_entity_id] = new Set();
    }
    if (!acc[link.child_entity_id]) {
      acc[link.child_entity_id] = new Set();
    }
    acc[link.parent_entity_id].add(link.child_entity_id);
    acc[link.child_entity_id].add(link.parent_entity_id);
    return acc;
  }, {});

  const visited = new Set<string>();
  const components = materialized.entities.map((entity) => entity.entity_id).reduce<string[][]>((acc, entityId) => {
    if (visited.has(entityId)) {
      return acc;
    }
    const stack = [entityId];
    const component: string[] = [];
    visited.add(entityId);
    while (stack.length) {
      const current = stack.pop()!;
      component.push(current);
      for (const neighbor of connectedIdsByEntity[current] ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    acc.push(component);
    return acc;
  }, []);

  function structuralImportance(entityId: string) {
    const entity = byId[entityId];
    const roles = rolesByEntityId[entityId] ?? [];
    const classification = classificationsByEntityId[entityId];
    const inboundCount = chartLinks.filter((link) => link.child_entity_id === entityId).length;
    const outboundCount = chartLinks.filter((link) => link.parent_entity_id === entityId).length;
    return (
      statusRank(entity?.status ?? "proposed") * 40 +
      roles.reduce((sum, role) => sum + rolePriority(role), 0) +
      (classification?.classification_type === "disregarded_entity" ? 24 : 0) +
      (classification?.classification_type === "partnership" ? 16 : 0) +
      inboundCount * 8 +
      outboundCount * 10 +
      (stepsByEntityId[entityId] ?? 0) * 4 +
      (electionsByEntityId[entityId] ?? 0) * 3
    );
  }

  const componentMeta = components.map((entityIds) => {
    const label = componentLabel(entityIds, rolesByEntityId, byId);
    return {
      entityIds,
      label,
      score:
        entityIds.reduce((sum, entityId) => sum + structuralImportance(entityId), 0) +
        chartLinks.filter(
          (link) =>
            entityIds.includes(link.parent_entity_id) &&
            entityIds.includes(link.child_entity_id),
        ).length *
          12,
    };
  });

  const sellerComponent = componentMeta
    .filter((component) => component.label === "Seller-side legal chain")
    .sort((left, right) => right.score - left.score)[0];
  const buyerComponent = componentMeta
    .filter((component) => component.label === "Buyer-side chain")
    .sort((left, right) => right.score - left.score)
    .find((component) => component !== sellerComponent);
  const selectedComponents =
    [sellerComponent, buyerComponent].filter(Boolean) as Array<(typeof componentMeta)[number]>;
  const fallbackComponents =
    selectedComponents.length > 0
      ? selectedComponents
      : componentMeta.sort((left, right) => right.score - left.score).slice(0, 1);
  const primaryEntityIds = new Set(fallbackComponents.flatMap((component) => component.entityIds));

  const mainTreeChildIdsByParent = chartLinks.reduce<Record<string, string[]>>(
    (acc, link) => {
      if (
        multiOwnerIds.has(link.child_entity_id) ||
        !primaryEntityIds.has(link.parent_entity_id) ||
        !primaryEntityIds.has(link.child_entity_id)
      ) {
        return acc;
      }
      if (!acc[link.parent_entity_id]) {
        acc[link.parent_entity_id] = [];
      }
      acc[link.parent_entity_id].push(link.child_entity_id);
      return acc;
    },
    {},
  );

  const inboundCountByChild = chartLinks.reduce<Record<string, number>>((acc, link) => {
    acc[link.child_entity_id] = (acc[link.child_entity_id] ?? 0) + 1;
    return acc;
  }, {});

  const componentByEntityId = new Map<string, (typeof componentMeta)[number]>();
  for (const component of componentMeta) {
    for (const entityId of component.entityIds) {
      componentByEntityId.set(entityId, component);
    }
  }

  const rootIds = materialized.entities
    .filter(
      (entity) =>
        primaryEntityIds.has(entity.entity_id) &&
        (inboundCountByChild[entity.entity_id] ?? 0) === 0,
    )
    .sort((left, right) => {
      const leftComponent = componentByEntityId.get(left.entity_id);
      const rightComponent = componentByEntityId.get(right.entity_id);
      if ((leftComponent?.label ?? "") !== (rightComponent?.label ?? "")) {
        if (leftComponent?.label === "Seller-side legal chain") {
          return -1;
        }
        if (rightComponent?.label === "Seller-side legal chain") {
          return 1;
        }
        if (leftComponent?.label === "Buyer-side chain") {
          return -1;
        }
        if (rightComponent?.label === "Buyer-side chain") {
          return 1;
        }
      }
      return (rightComponent?.score ?? 0) - (leftComponent?.score ?? 0);
    })
    .map((entity) => entity.entity_id);

  const positionedNodeById = new Map<string, StructureDiagramNode>();
  const subtreeWidths = new Map<string, number>();

  function positionNode(entityId: string, left: number, depth: number) {
    const children = mainTreeChildIdsByParent[entityId] ?? [];
    const subtreeWidth = computeSubtreeWidth(entityId, mainTreeChildIdsByParent, subtreeWidths);
    const centerX = left + subtreeWidth / 2;
    positionedNodeById.set(entityId, {
      ...baseNodeById[entityId],
      x: centerX - NODE_WIDTH / 2,
      y: CANVAS_PADDING_Y + depth * (NODE_HEIGHT + VERTICAL_GAP),
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
    let childLeft =
      left +
      Math.max(
        0,
        (subtreeWidth -
          (children.reduce(
            (total, childId) =>
              total + computeSubtreeWidth(childId, mainTreeChildIdsByParent, subtreeWidths),
            0,
          ) +
            HORIZONTAL_GAP * Math.max(children.length - 1, 0))) /
          2,
      );
    for (const childId of children) {
      const childWidth = computeSubtreeWidth(childId, mainTreeChildIdsByParent, subtreeWidths);
      positionNode(childId, childLeft, depth + 1);
      childLeft += childWidth + HORIZONTAL_GAP;
    }
  }

  let nextRootLeft = CANVAS_PADDING_X;
  for (const rootId of rootIds) {
    const width = computeSubtreeWidth(rootId, mainTreeChildIdsByParent, subtreeWidths);
    positionNode(rootId, nextRootLeft, 0);
    nextRootLeft += width + ROOT_GAP;
  }

  const nodes = [...positionedNodeById.values()].sort((left, right) =>
    left.y === right.y ? left.x - right.x : left.y - right.y,
  );
  const positionedIds = new Set(nodes.map((node) => node.entity.entity_id));

  const ownershipEdges = chartLinks
    .filter(
      (link) =>
        positionedIds.has(link.parent_entity_id) &&
        positionedIds.has(link.child_entity_id) &&
        !multiOwnerIds.has(link.child_entity_id),
    )
    .map(
      (link) =>
        ({
          edgeId: link.link_id,
          parentEntityId: link.parent_entity_id,
          childEntityId: link.child_entity_id,
          label: edgeLabel(link),
          status: link.status,
          proposalId: link.status === "proposed" ? link.link_id : null,
          crossLink: false,
        }) satisfies StructureDiagramOwnershipEdge,
    );

  const crossLinks = chartLinks
    .filter(
      (link) =>
        primaryEntityIds.has(link.parent_entity_id) &&
        primaryEntityIds.has(link.child_entity_id) &&
        multiOwnerIds.has(link.child_entity_id),
    )
    .map(
      (link) =>
        ({
          edgeId: link.link_id,
          parentEntityId: link.parent_entity_id,
          childEntityId: link.child_entity_id,
          label: edgeLabel(link),
          status: link.status,
          proposalId: link.status === "proposed" ? link.link_id : null,
          crossLink: true,
        }) satisfies StructureDiagramOwnershipEdge,
    );

  const secondaryNodes = materialized.entities
    .filter((entity) => !primaryEntityIds.has(entity.entity_id))
    .map((entity, index) => ({
      ...baseNodeById[entity.entity_id],
      x: CANVAS_PADDING_X + (index % 3) * (NODE_WIDTH + 20),
      y: CANVAS_PADDING_Y + Math.floor(index / 3) * (NODE_HEIGHT + 20),
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    }));

  const multiOwnerNodes = secondaryNodes.filter((node) =>
    multiOwnerIds.has(node.entity.entity_id),
  );

  const maxRight = nodes.length
    ? Math.max(...nodes.map((node) => node.x + node.width))
    : NODE_WIDTH + CANVAS_PADDING_X * 2;
  const maxBottom = nodes.length
    ? Math.max(...nodes.map((node) => node.y + node.height))
    : NODE_HEIGHT + CANVAS_PADDING_Y * 2;

  return {
    nodes,
    ownershipEdges,
    crossLinks,
    transactionArrows: deriveTransactionArrows(
      materialized.transactionSteps,
      byId,
      proposalIndexes.stepById,
    ).filter(
      (arrow) =>
        primaryEntityIds.has(arrow.sourceEntityId) && primaryEntityIds.has(arrow.targetEntityId),
    ),
    hiddenTransactionArrows: deriveTransactionArrows(
      materialized.transactionSteps,
      byId,
      proposalIndexes.stepById,
    ).filter(
      (arrow) =>
        !(
          primaryEntityIds.has(arrow.sourceEntityId) && primaryEntityIds.has(arrow.targetEntityId)
        ),
    ),
    pendingProposals: proposalIndexes.pending,
    pendingReviewGroups: buildPendingReviewGroups(proposalIndexes.pending),
    canvasWidth: maxRight + CANVAS_PADDING_X,
    canvasHeight: maxBottom + CANVAS_PADDING_Y,
    unlinkedNodes: secondaryNodes,
    multiOwnerNodes,
    primaryNodes: nodes,
    primaryOwnershipEdges: ownershipEdges,
    secondaryNodes,
  };
}
