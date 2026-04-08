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
              item.parent_entity_id === entity.entity_id && item.child_entity_id === link.child_entity_id,
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

  const entityIdByName = new Map(mergedEntities.map((entity) => [normalizeName(entity.name), entity.entity_id]));

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
        mergedRoles.some((item) => item.entity_id === entityId && item.role_type === payload.role_type)
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
          typeof payload.ownership_percentage === "number" ? payload.ownership_percentage : null,
        status: proposal.record_status,
        notes: proposal.rationale,
        source_fact_ids: proposal.source_fact_ids,
      });
    }
    if (proposal.proposal_kind === "transaction_step") {
      if (mergedSteps.some((item) => normalizeName(item.title) === normalizeName(String(payload.title ?? proposal.label)))) {
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
      if (mergedElectionItems.some((item) => normalizeName(item.name) === normalizeName(String(payload.name ?? proposal.label)))) {
        continue;
      }
      mergedElectionItems.push({
        item_id: proposal.proposal_id,
        name: String(payload.name ?? proposal.label),
        item_type: String(payload.item_type ?? "other") as ElectionOrFilingItem["item_type"],
        citation_or_form: String(payload.citation_or_form ?? ""),
        related_entity_ids: (Array.isArray(payload.related_entity_names) ? payload.related_entity_names : [])
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
    const classification = taxClassifications.find((item) => item.entity_id === entity.entity_id);
    const roles = transactionRoles.filter((item) => item.entity_id === entity.entity_id).map((item) => item.role_type);
    const outbound = ownershipLinks.filter((item) => item.parent_entity_id === entity.entity_id);
    const inbound = ownershipLinks.filter((item) => item.child_entity_id === entity.entity_id);
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

export type StructureDiagramNode = Omit<StructureMapNode, "children"> & {
  primaryProposalId: string | null;
  relatedProposalIds: string[];
  children: StructureDiagramNode[];
};

export type StructureDiagramLane = {
  root: StructureDiagramNode;
  columns: StructureDiagramNode[][];
};

export type StructureDiagramModel = {
  lanes: StructureDiagramLane[];
  multiOwnerNodes: StructureDiagramNode[];
  unlinkedNodes: StructureDiagramNode[];
  transactionArrows: StructureDiagramArrow[];
  pendingProposals: StructureProposal[];
};

function statusRank(status: StructuredRecordStatus) {
  return status === "confirmed" ? 2 : status === "uncertain" ? 1 : 0;
}

function proposalEntityName(proposal: StructureProposal) {
  const payload = proposal.normalized_payload ?? {};
  if (proposal.proposal_kind === "entity") {
    return String(payload.name ?? proposal.label);
  }
  if (proposal.proposal_kind === "tax_classification" || proposal.proposal_kind === "transaction_role") {
    return String(payload.entity_name ?? "");
  }
  return "";
}

function buildProposalIndexes(proposals: StructureProposal[]) {
  const pending = proposals.filter((proposal) => proposal.review_status === "pending");
  const entityById = new Map<string, StructureProposal>();
  const byEntityName = new Map<string, StructureProposal[]>();
  const ownershipByKey = new Map<string, StructureProposal>();
  const stepById = new Map<string, StructureProposal>();

  for (const proposal of pending) {
    if (proposal.proposal_kind === "entity") {
      entityById.set(entityIdFromProposal(proposal), proposal);
    }
    const entityName = normalizeName(proposalEntityName(proposal));
    if (entityName) {
      byEntityName.set(entityName, [...(byEntityName.get(entityName) ?? []), proposal]);
    }
    if (proposal.proposal_kind === "ownership_link") {
      const payload = proposal.normalized_payload ?? {};
      const key = [
        normalizeName(String(payload.parent_entity_name ?? "")),
        normalizeName(String(payload.child_entity_name ?? "")),
        String(payload.relationship_type ?? "owns"),
      ].join("|");
      ownershipByKey.set(key, proposal);
    }
    if (proposal.proposal_kind === "transaction_step") {
      stepById.set(proposal.proposal_id, proposal);
    }
  }

  return { pending, entityById, byEntityName, ownershipByKey, stepById };
}

function buildNode(
  entity: Entity,
  byId: Record<string, Entity>,
  childrenByParent: Record<string, OwnershipLink[]>,
  inboundByChild: Record<string, OwnershipLink[]>,
  classificationsByEntityId: Record<string, TaxClassification>,
  rolesByEntityId: Record<string, string[]>,
  indirectOwnership: Array<{ parentName: string; childName: string; percentage: number | null }>,
  stepsByEntityId: Record<string, number>,
  electionsByEntityId: Record<string, number>,
  proposalIndexes: ReturnType<typeof buildProposalIndexes>,
  visited: Set<string>,
): StructureDiagramNode {
  const inbound = inboundByChild[entity.entity_id] ?? [];
  const outbound = childrenByParent[entity.entity_id] ?? [];
  const classification = classificationsByEntityId[entity.entity_id];
  const nextVisited = new Set([...visited, entity.entity_id]);
  const displayStatus =
    (
      [entity.status, classification?.status, ...inbound.map((item) => item.status), ...outbound.map((item) => item.status)]
        .filter(Boolean)
        .sort(
          (left, right) =>
            statusRank(right as StructuredRecordStatus) - statusRank(left as StructuredRecordStatus),
        )[0] as StructuredRecordStatus
    ) ?? entity.status;
  const normalizedEntityName = normalizeName(entity.name);
  const relatedNameProposals = proposalIndexes.byEntityName.get(normalizedEntityName) ?? [];
  const primaryProposal =
    proposalIndexes.entityById.get(entity.entity_id) ??
    relatedNameProposals.find((proposal) => proposal.proposal_kind === "entity") ??
    relatedNameProposals[0] ??
    null;

  return {
    entity,
    classification,
    roles: rolesByEntityId[entity.entity_id] ?? [],
    inbound,
    outbound,
    displayStatus,
    directParentNames: inbound.map((item) => byId[item.parent_entity_id]?.name ?? item.parent_entity_id),
    directChildNames: outbound.map((item) => byId[item.child_entity_id]?.name ?? item.child_entity_id),
    indirectChildren: indirectOwnership.filter((item) => item.parentName === entity.name),
    linkedStepCount: stepsByEntityId[entity.entity_id] ?? 0,
    linkedElectionCount: electionsByEntityId[entity.entity_id] ?? 0,
    primaryProposalId: primaryProposal?.proposal_id ?? null,
    relatedProposalIds: relatedNameProposals.map((proposal) => proposal.proposal_id),
    children: outbound
      .filter((link) => !nextVisited.has(link.child_entity_id))
      .map((link) =>
        buildNode(
          byId[link.child_entity_id] ?? {
            entity_id: link.child_entity_id,
            name: link.child_entity_id,
            entity_type: "other",
            jurisdiction: "",
            status: "uncertain",
            notes: "",
            source_fact_ids: [],
          },
          byId,
          childrenByParent,
          inboundByChild,
          classificationsByEntityId,
          rolesByEntityId,
          indirectOwnership,
          stepsByEntityId,
          electionsByEntityId,
          proposalIndexes,
          nextVisited,
        ),
      ),
  };
}

function collectColumns(node: StructureDiagramNode, depth = 0, columns: StructureDiagramNode[][] = []) {
  if (!columns[depth]) {
    columns[depth] = [];
  }
  columns[depth].push(node);
  for (const child of node.children) {
    collectColumns(child, depth + 1, columns);
  }
  return columns;
}

function deriveTransactionArrows(
  steps: TransactionStep[],
  entitiesById: Record<string, Entity>,
  stepProposalById: Map<string, StructureProposal>,
) {
  return [...steps]
    .sort((left, right) => left.sequence_number - right.sequence_number)
    .flatMap((step) => {
      if (!["merger", "stock_purchase", "stock_sale", "distribution", "contribution", "asset_purchase", "asset_sale"].includes(step.step_type)) {
        return [];
      }
      if (step.entity_ids.length < 2) {
        return [];
      }
      const sourceEntityId = step.entity_ids[0];
      const targetEntityId = step.entity_ids[step.entity_ids.length - 1];
      if (!entitiesById[sourceEntityId] || !entitiesById[targetEntityId] || sourceEntityId === targetEntityId) {
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
        } satisfies StructureDiagramArrow,
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
) {
  const diagram = deriveStructureDiagram(
    entities,
    ownershipLinks,
    taxClassifications,
    transactionRoles,
    transactionSteps,
    electionItems,
    structureProposals,
  );
  return {
    roots: diagram.lanes.map((lane) => lane.root),
    multiOwnerNodes: diagram.multiOwnerNodes,
    unlinkedNodes: diagram.unlinkedNodes,
  } satisfies StructureMapModel;
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
  const byId = Object.fromEntries(materialized.entities.map((entity) => [entity.entity_id, entity]));
  const childrenByParent = materialized.ownershipLinks.reduce<Record<string, OwnershipLink[]>>((acc, link) => {
    if (!acc[link.parent_entity_id]) {
      acc[link.parent_entity_id] = [];
    }
    acc[link.parent_entity_id].push(link);
    return acc;
  }, {});
  const inboundByChild = materialized.ownershipLinks.reduce<Record<string, OwnershipLink[]>>((acc, link) => {
    if (!acc[link.child_entity_id]) {
      acc[link.child_entity_id] = [];
    }
    acc[link.child_entity_id].push(link);
    return acc;
  }, {});
  const classificationsByEntityId = Object.fromEntries(
    materialized.taxClassifications.map((item) => [item.entity_id, item]),
  );
  const rolesByEntityId = materialized.transactionRoles.reduce<Record<string, string[]>>((acc, role) => {
    if (!acc[role.entity_id]) {
      acc[role.entity_id] = [];
    }
    acc[role.entity_id].push(role.role_type);
    return acc;
  }, {});
  const stepsByEntityId = materialized.transactionSteps.reduce<Record<string, number>>((acc, step) => {
    for (const entityId of step.entity_ids) {
      acc[entityId] = (acc[entityId] ?? 0) + 1;
    }
    return acc;
  }, {});
  const electionsByEntityId = materialized.electionItems.reduce<Record<string, number>>((acc, item) => {
    for (const entityId of item.related_entity_ids) {
      acc[entityId] = (acc[entityId] ?? 0) + 1;
    }
    return acc;
  }, {});
  const indirectOwnership = deriveIndirectOwnership(materialized.entities, materialized.ownershipLinks);
  const multiOwnerIds = new Set(
    materialized.entities
      .filter((entity) => (inboundByChild[entity.entity_id] ?? []).length > 1)
      .map((entity) => entity.entity_id),
  );
  const rootEntities = materialized.entities.filter((entity) => {
    const inbound = inboundByChild[entity.entity_id] ?? [];
    return inbound.length === 0 && !multiOwnerIds.has(entity.entity_id);
  });
  const linkedEntityIds = new Set(materialized.ownershipLinks.flatMap((link) => [link.parent_entity_id, link.child_entity_id]));
  const rootIds = new Set(rootEntities.map((entity) => entity.entity_id));

  const roots = rootEntities.map((entity) =>
    buildNode(
      entity,
      byId,
      childrenByParent,
      inboundByChild,
      classificationsByEntityId,
      rolesByEntityId,
      indirectOwnership,
      stepsByEntityId,
      electionsByEntityId,
      proposalIndexes,
      new Set(),
    ),
  );

  return {
    lanes: roots.map((root) => ({
      root,
      columns: collectColumns(root),
    })),
    multiOwnerNodes: materialized.entities
      .filter((entity) => multiOwnerIds.has(entity.entity_id))
      .map((entity) =>
        buildNode(
          entity,
          byId,
          childrenByParent,
          inboundByChild,
          classificationsByEntityId,
          rolesByEntityId,
          indirectOwnership,
          stepsByEntityId,
          electionsByEntityId,
          proposalIndexes,
          new Set(),
        ),
      ),
    unlinkedNodes: materialized.entities
      .filter((entity) => !linkedEntityIds.has(entity.entity_id) && !rootIds.has(entity.entity_id))
      .map((entity) =>
        buildNode(
          entity,
          byId,
          childrenByParent,
          inboundByChild,
          classificationsByEntityId,
          rolesByEntityId,
          indirectOwnership,
          stepsByEntityId,
          electionsByEntityId,
          proposalIndexes,
          new Set(),
        ),
      ),
    transactionArrows: deriveTransactionArrows(
      materialized.transactionSteps,
      byId,
      proposalIndexes.stepById,
    ),
    pendingProposals: proposalIndexes.pending,
  };
}
