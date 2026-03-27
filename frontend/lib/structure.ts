import {
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
