from __future__ import annotations

from dataclasses import dataclass, field

from tax_llm.domain.models import (
    Entity,
    OwnershipLink,
    TaxClassification,
    TransactionRole,
    TransactionStep,
)


ROLE_PRIORITY = {
    "buyer": 100,
    "seller": 95,
    "target": 95,
    "merger_sub": 90,
    "parent": 85,
    "holding_company": 80,
    "portfolio_company": 75,
    "controlled_corporation": 75,
    "distributing_corporation": 75,
    "partnership_vehicle": 70,
    "blocker": 70,
    "lender": 65,
    "shareholder": 60,
    "partner": 60,
    "individual_owner": 60,
    "rollover_holder": 55,
    "subsidiary": 50,
    "other": 0,
}


def normalize_name(value: str | None) -> str:
    return (value or "").strip().lower()


def normalize_step_family(step_type: str) -> str:
    aliases = {
        "stock_purchase": "stock_form_acquisition",
        "stock_sale": "stock_form_acquisition",
        "asset_purchase": "asset_form_acquisition",
        "asset_sale": "asset_form_acquisition",
        "pre_closing_reorganization": "pre_closing_reorganization",
        "post_closing_integration": "post_closing_integration",
    }
    return aliases.get(step_type, step_type)


@dataclass
class StructuredTransactionContext:
    entities: list[Entity]
    ownership_links: list[OwnershipLink]
    tax_classifications: list[TaxClassification]
    transaction_roles: list[TransactionRole]
    transaction_steps: list[TransactionStep]
    entities_by_id: dict[str, Entity] = field(default_factory=dict)
    entities_by_name: dict[str, Entity] = field(default_factory=dict)
    classifications_by_entity_id: dict[str, TaxClassification] = field(default_factory=dict)
    roles_by_entity_id: dict[str, list[TransactionRole]] = field(default_factory=dict)
    direct_children: dict[str, list[OwnershipLink]] = field(default_factory=dict)
    direct_parents: dict[str, list[OwnershipLink]] = field(default_factory=dict)
    indirect_links: list[tuple[str, str, float | None]] = field(default_factory=list)
    primary_roles: dict[str, list[Entity]] = field(default_factory=dict)
    ordered_steps: list[TransactionStep] = field(default_factory=list)
    step_families: set[str] = field(default_factory=set)
    structure_ambiguities: list[str] = field(default_factory=list)

    def classification_for(self, entity_id: str) -> str | None:
        return self.classifications_by_entity_id.get(entity_id, None).classification_type if entity_id in self.classifications_by_entity_id else None

    def roles_for(self, entity_id: str) -> list[str]:
        return [item.role_type for item in self.roles_by_entity_id.get(entity_id, [])]

    def entities_for_role(self, role_type: str) -> list[Entity]:
        return self.primary_roles.get(role_type, [])

    def entity_names_for_role(self, role_type: str) -> list[str]:
        return [entity.name for entity in self.entities_for_role(role_type)]

    def entity_name(self, entity_id: str) -> str:
        return self.entities_by_id.get(entity_id, Entity(entity_id=entity_id, name=entity_id)).name

    def describe_step(self, step: TransactionStep) -> str:
        linked = [self.entity_name(entity_id) for entity_id in step.entity_ids if entity_id in self.entities_by_id]
        if linked:
            return f"{step.title} ({', '.join(linked)})"
        return step.title

    def derived_ownership_lines(self) -> list[str]:
        lines: list[str] = []
        for link in self.ownership_links:
            parent = self.entity_name(link.parent_entity_id)
            child = self.entity_name(link.child_entity_id)
            pct = f" ({link.ownership_percentage:.2f}%)" if link.ownership_percentage is not None else ""
            lines.append(f"{parent} {link.relationship_type.replace('_', ' ')} {child}{pct}")
        for parent_id, child_id, pct in self.indirect_links:
            parent = self.entity_name(parent_id)
            child = self.entity_name(child_id)
            pct_text = f" ({pct:.2f}% derived)" if pct is not None else " (derived)"
            lines.append(f"{parent} indirectly owns {child}{pct_text}")
        return lines


def build_structured_transaction_context(
    entities: list[Entity] | None,
    ownership_links: list[OwnershipLink] | None,
    tax_classifications: list[TaxClassification] | None,
    transaction_roles: list[TransactionRole] | None,
    transaction_steps: list[TransactionStep] | None,
) -> StructuredTransactionContext:
    entity_list = entities or []
    link_list = ownership_links or []
    classification_list = tax_classifications or []
    role_list = transaction_roles or []
    step_list = sorted(transaction_steps or [], key=lambda item: item.sequence_number)

    context = StructuredTransactionContext(
        entities=entity_list,
        ownership_links=link_list,
        tax_classifications=classification_list,
        transaction_roles=role_list,
        transaction_steps=step_list,
    )
    context.entities_by_id = {entity.entity_id: entity for entity in entity_list}
    context.entities_by_name = {normalize_name(entity.name): entity for entity in entity_list if normalize_name(entity.name)}
    context.classifications_by_entity_id = {item.entity_id: item for item in classification_list}
    context.ordered_steps = step_list

    for role in role_list:
        context.roles_by_entity_id.setdefault(role.entity_id, []).append(role)
    for roles in context.roles_by_entity_id.values():
        roles.sort(key=lambda item: ROLE_PRIORITY.get(item.role_type, 0), reverse=True)

    for link in link_list:
        context.direct_children.setdefault(link.parent_entity_id, []).append(link)
        context.direct_parents.setdefault(link.child_entity_id, []).append(link)

    for role_type in ROLE_PRIORITY:
        context.primary_roles[role_type] = []
    for entity in entity_list:
        seen_role_types = {role.role_type for role in context.roles_by_entity_id.get(entity.entity_id, [])}
        for role_type in seen_role_types:
            context.primary_roles.setdefault(role_type, []).append(entity)

        if entity.entity_type == "partnership" and entity not in context.primary_roles["partnership_vehicle"]:
            context.primary_roles["partnership_vehicle"].append(entity)
        if normalize_name(entity.name).endswith("holdco") or "holdco" in normalize_name(entity.name):
            context.primary_roles.setdefault("holding_company", []).append(entity)
        if "portfolio" in normalize_name(entity.name):
            context.primary_roles.setdefault("portfolio_company", []).append(entity)

        roles = context.roles_for(entity.entity_id)
        if "target" in roles and entity.entity_id not in context.direct_parents:
            context.structure_ambiguities.append(f"Target entity {entity.name} does not yet have a recorded parent or seller linkage.")
        if "merger_sub" in roles:
            if entity.entity_id not in context.direct_parents:
                context.structure_ambiguities.append(f"Merger sub {entity.name} does not yet show a parent owner in Entity Structure.")
            if not any(entity.entity_id in step.entity_ids and normalize_step_family(step.step_type) == "merger" for step in step_list):
                context.structure_ambiguities.append(f"Merger sub {entity.name} is recorded, but the step plan does not yet show a merger step tied to it.")

        classification = context.classification_for(entity.entity_id)
        if entity.entity_type == "llc" and classification in {None, "unknown"}:
            context.structure_ambiguities.append(f"Entity {entity.name} is an LLC but its tax classification is still unresolved.")
        if "blocker" in roles and classification in {None, "unknown"}:
            context.structure_ambiguities.append(f"Blocker entity {entity.name} needs a confirmed tax classification.")

    for step in step_list:
        family = normalize_step_family(step.step_type)
        context.step_families.add(family)
        missing = [entity_id for entity_id in step.entity_ids if entity_id not in context.entities_by_id]
        if missing:
            context.structure_ambiguities.append(
                f"Step '{step.title}' references one or more entities that are not currently present in Entity Structure."
            )

    for start_entity in entity_list:
        queue: list[tuple[str, float | None, set[str]]] = [(start_entity.entity_id, 100.0, {start_entity.entity_id})]
        while queue:
            current_id, current_pct, visited = queue.pop(0)
            for link in context.direct_children.get(current_id, []):
                child_id = link.child_entity_id
                if child_id in visited:
                    continue
                derived_pct = None
                if current_pct is not None and link.ownership_percentage is not None:
                    derived_pct = current_pct * link.ownership_percentage / 100.0
                elif link.ownership_percentage is not None and current_id == start_entity.entity_id:
                    derived_pct = link.ownership_percentage
                if start_entity.entity_id != child_id and not any(
                    existing_parent == start_entity.entity_id and existing_child == child_id
                    for existing_parent, existing_child, _ in context.indirect_links
                ):
                    context.indirect_links.append((start_entity.entity_id, child_id, derived_pct))
                queue.append((child_id, derived_pct, {*visited, child_id}))

    for entity in entity_list:
        if context.classification_for(entity.entity_id) in {"partnership", "disregarded_entity"} and not context.roles_for(entity.entity_id):
            context.structure_ambiguities.append(
                f"Entity {entity.name} has a partnership-sensitive tax classification but no recorded transaction role yet."
            )

    deduped: list[str] = []
    seen = set()
    for item in context.structure_ambiguities:
        if item not in seen:
            deduped.append(item)
            seen.add(item)
    context.structure_ambiguities = deduped
    return context
