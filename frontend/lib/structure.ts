import {
  ElectionOrFilingItem,
  Entity,
  OwnershipLink,
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
        if (entity.entity_id !== link.child_entity_id) {
          const parentName = byId[entity.entity_id]?.name ?? entity.entity_id;
          const childName = byId[link.child_entity_id]?.name ?? link.child_entity_id;
          if (!ownershipLinks.some((item) => item.parent_entity_id === entity.entity_id && item.child_entity_id === link.child_entity_id)) {
            derived.push({ parentName, childName, percentage: nextPct });
          }
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
  visited: Set<string>,
): StructureMapNode {
  const inbound = inboundByChild[entity.entity_id] ?? [];
  const outbound = childrenByParent[entity.entity_id] ?? [];
  const nextVisited = new Set([...visited, entity.entity_id]);
  return {
    entity,
    classification: classificationsByEntityId[entity.entity_id],
    roles: rolesByEntityId[entity.entity_id] ?? [],
    inbound,
    outbound,
    directParentNames: inbound.map((item) => byId[item.parent_entity_id]?.name ?? item.parent_entity_id),
    directChildNames: outbound.map((item) => byId[item.child_entity_id]?.name ?? item.child_entity_id),
    indirectChildren: indirectOwnership.filter((item) => item.parentName === entity.name),
    linkedStepCount: stepsByEntityId[entity.entity_id] ?? 0,
    linkedElectionCount: electionsByEntityId[entity.entity_id] ?? 0,
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
          nextVisited,
        ),
      ),
  };
}

export function deriveStructureMap(
  entities: Entity[],
  ownershipLinks: OwnershipLink[],
  taxClassifications: TaxClassification[],
  transactionRoles: TransactionRole[],
  transactionSteps: TransactionStep[],
  electionItems: ElectionOrFilingItem[],
) {
  const byId = Object.fromEntries(entities.map((entity) => [entity.entity_id, entity]));
  const childrenByParent = ownershipLinks.reduce<Record<string, OwnershipLink[]>>((acc, link) => {
    if (!acc[link.parent_entity_id]) {
      acc[link.parent_entity_id] = [];
    }
    acc[link.parent_entity_id].push(link);
    return acc;
  }, {});
  const inboundByChild = ownershipLinks.reduce<Record<string, OwnershipLink[]>>((acc, link) => {
    if (!acc[link.child_entity_id]) {
      acc[link.child_entity_id] = [];
    }
    acc[link.child_entity_id].push(link);
    return acc;
  }, {});
  const classificationsByEntityId = Object.fromEntries(
    taxClassifications.map((item) => [item.entity_id, item]),
  );
  const rolesByEntityId = transactionRoles.reduce<Record<string, string[]>>((acc, role) => {
    if (!acc[role.entity_id]) {
      acc[role.entity_id] = [];
    }
    acc[role.entity_id].push(role.role_type);
    return acc;
  }, {});
  const stepsByEntityId = transactionSteps.reduce<Record<string, number>>((acc, step) => {
    for (const entityId of step.entity_ids) {
      acc[entityId] = (acc[entityId] ?? 0) + 1;
    }
    return acc;
  }, {});
  const electionsByEntityId = electionItems.reduce<Record<string, number>>((acc, item) => {
    for (const entityId of item.related_entity_ids) {
      acc[entityId] = (acc[entityId] ?? 0) + 1;
    }
    return acc;
  }, {});
  const indirectOwnership = deriveIndirectOwnership(entities, ownershipLinks);

  const multiOwnerIds = new Set(
    entities
      .filter((entity) => (inboundByChild[entity.entity_id] ?? []).length > 1)
      .map((entity) => entity.entity_id),
  );
  const rootEntities = entities.filter((entity) => {
    const inbound = inboundByChild[entity.entity_id] ?? [];
    return inbound.length === 0 && !multiOwnerIds.has(entity.entity_id);
  });
  const linkedEntityIds = new Set(ownershipLinks.flatMap((link) => [link.parent_entity_id, link.child_entity_id]));
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
      new Set(),
    ),
  );
  const multiOwnerNodes = entities
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
        new Set(),
      ),
    );
  const unlinkedNodes = entities
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
        new Set(),
      ),
    );

  return {
    roots,
    multiOwnerNodes,
    unlinkedNodes,
  } satisfies StructureMapModel;
}
