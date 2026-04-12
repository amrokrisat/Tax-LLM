"use client";

import { memo } from "react";

import {
  Entity,
  EntityType,
  OwnershipLink,
  OwnershipScope,
  OwnershipRelationshipType,
  StructuredRecordStatus,
  TaxClassification,
  TaxClassificationType,
  TransactionRole,
  TransactionRoleType,
} from "@/lib/api";
import { summarizeEntityStructure } from "@/lib/structure";
import {
  ENTITY_TYPE_OPTIONS,
  OWNERSHIP_RELATIONSHIP_OPTIONS,
  OWNERSHIP_SCOPE_OPTIONS,
  STRUCTURED_RECORD_STATUS_OPTIONS,
  TAX_CLASSIFICATION_OPTIONS,
  TRANSACTION_ROLE_OPTIONS,
  ownershipRelationshipLabel,
  taxClassificationLabel,
  transactionRoleLabel,
} from "@/lib/taxonomy";

export const EntityStructurePane = memo(function EntityStructurePane({
  entities,
  ownershipLinks,
  taxClassifications,
  transactionRoles,
  readOnly,
  addEntity,
  updateEntity,
  addOwnershipLink,
  updateOwnershipLink,
  updateTaxClassification,
  updateTransactionRole,
}: {
  entities: Entity[];
  ownershipLinks: OwnershipLink[];
  taxClassifications: TaxClassification[];
  transactionRoles: TransactionRole[];
  readOnly: boolean;
  addEntity: () => void;
  updateEntity: <K extends keyof Entity>(entityId: string, key: K, value: Entity[K]) => void;
  addOwnershipLink: () => void;
  updateOwnershipLink: <K extends keyof OwnershipLink>(
    linkId: string,
    key: K,
    value: OwnershipLink[K],
  ) => void;
  updateTaxClassification: <K extends keyof TaxClassification>(
    classificationId: string,
    key: K,
    value: TaxClassification[K],
  ) => void;
  updateTransactionRole: <K extends keyof TransactionRole>(
    roleId: string,
    key: K,
    value: TransactionRole[K],
  ) => void;
}) {
  function entityName(entityId: string) {
    return entities.find((entity) => entity.entity_id === entityId)?.name ?? "Unknown entity";
  }
  const summaries = summarizeEntityStructure(entities, ownershipLinks, taxClassifications, transactionRoles);

  return (
    <div className="stack">
      <div className="subpanel stack">
        <div className="row-between">
          <div>
            <h2>Entity Structure</h2>
            <p className="muted">
              Track legal entities, tax classifications, transaction roles, and ownership relationships in one shared transaction model.
            </p>
          </div>
          {!readOnly ? (
            <button className="button-subtle" onClick={addEntity} type="button">
              Add entity
            </button>
          ) : <span className="chip">Run snapshot</span>}
        </div>

        {entities.length ? (
          <ul className="list-tight">
            {summaries.map(({ entity, classification, roles, outbound, inbound, indirectChildren }) => {
              return (
                <li key={entity.entity_id}>
                  <strong>{entity.name}</strong>
                  {classification ? ` · ${taxClassificationLabel(classification.classification_type)}` : ""}
                  {roles.length ? ` · ${roles.map(transactionRoleLabel).join(", ")}` : ""}
                  {outbound.length ? ` · owns: ${outbound.map((item) => `${ownershipRelationshipLabel(item.relationship_type)} ${entityName(item.child_entity_id)}`).join("; ")}` : ""}
                  {indirectChildren.length ? ` · indirect: ${indirectChildren.map((item) => item.childName).join("; ")}` : ""}
                  {inbound.length ? ` · owned by: ${inbound.map((item) => `${entityName(item.parent_entity_id)} ${ownershipRelationshipLabel(item.relationship_type)}`).join("; ")}` : ""}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">No entities recorded yet. Add them directly or confirm document-extraction candidates to populate this view.</p>
        )}
      </div>

      <div className="subpanel stack">
        <div className="row-between">
          <h3>Entities</h3>
          {!readOnly ? (
            <button className="button-ghost" onClick={addEntity} type="button">
              Add row
            </button>
          ) : null}
        </div>
        {entities.map((entity) => (
          <div key={entity.entity_id} className="two-col">
            <label className="field">
              <span>Name</span>
              <input
                disabled={readOnly}
                value={entity.name}
                onChange={(event) => updateEntity(entity.entity_id, "name", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Entity type</span>
              <select
                disabled={readOnly}
                value={entity.entity_type}
                onChange={(event) => updateEntity(entity.entity_id, "entity_type", event.target.value as EntityType)}
              >
                {ENTITY_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <small className="muted">{ENTITY_TYPE_OPTIONS.find((option) => option.value === entity.entity_type)?.description}</small>
            </label>
            <label className="field">
              <span>Jurisdiction</span>
              <input
                disabled={readOnly}
                value={entity.jurisdiction ?? ""}
                onChange={(event) => updateEntity(entity.entity_id, "jurisdiction", event.target.value)}
              />
            </label>
            <label className="field">
              <span>Status</span>
              <select
                disabled={readOnly}
                value={entity.status}
                onChange={(event) => updateEntity(entity.entity_id, "status", event.target.value as StructuredRecordStatus)}
              >
                {STRUCTURED_RECORD_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span>Notes</span>
              <textarea
                disabled={readOnly}
                rows={2}
                value={entity.notes}
                onChange={(event) => updateEntity(entity.entity_id, "notes", event.target.value)}
              />
            </label>
          </div>
        ))}
      </div>

      <div className="subpanel stack">
        <h3>Roles and tax classification</h3>
        {entities.map((entity) => {
          const classification =
            taxClassifications.find((item) => item.entity_id === entity.entity_id) ??
            {
              classification_id: `draft-${entity.entity_id}`,
              entity_id: entity.entity_id,
              classification_type: "unknown" as TaxClassificationType,
              status: "proposed" as StructuredRecordStatus,
              notes: "",
              source_fact_ids: [],
            };
          const role =
            transactionRoles.find((item) => item.entity_id === entity.entity_id) ??
            {
              role_id: `draft-${entity.entity_id}`,
              entity_id: entity.entity_id,
              role_type: "other" as TransactionRoleType,
              status: "proposed" as StructuredRecordStatus,
              notes: "",
              source_fact_ids: [],
            };
          return (
            <div key={entity.entity_id} className="two-col">
              <label className="field">
                <span>{entity.name} classification</span>
                <select
                  disabled={readOnly}
                  value={classification.classification_type}
                  onChange={(event) =>
                    updateTaxClassification(
                      classification.classification_id,
                      "classification_type",
                      event.target.value as TaxClassificationType,
                    )
                  }
                >
                  {TAX_CLASSIFICATION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{entity.name} role</span>
                <select
                  disabled={readOnly}
                  value={role.role_type}
                  onChange={(event) =>
                    updateTransactionRole(role.role_id, "role_type", event.target.value as TransactionRoleType)
                  }
                >
                  {TRANSACTION_ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          );
        })}
      </div>

      <div className="subpanel stack">
        <div className="row-between">
          <h3>Ownership</h3>
          {!readOnly ? (
            <button className="button-ghost" onClick={addOwnershipLink} type="button">
              Add ownership link
            </button>
          ) : null}
        </div>
        {ownershipLinks.length ? (
          ownershipLinks.map((link) => (
            <div key={link.link_id} className="two-col">
              <label className="field">
                <span>Parent</span>
                <select
                  disabled={readOnly}
                  value={link.parent_entity_id}
                  onChange={(event) => updateOwnershipLink(link.link_id, "parent_entity_id", event.target.value)}
                >
                  <option value="">Select entity</option>
                  {entities.map((entity) => (
                    <option key={entity.entity_id} value={entity.entity_id}>
                      {entity.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Child</span>
                <select
                  disabled={readOnly}
                  value={link.child_entity_id}
                  onChange={(event) => updateOwnershipLink(link.link_id, "child_entity_id", event.target.value)}
                >
                  <option value="">Select entity</option>
                  {entities.map((entity) => (
                    <option key={entity.entity_id} value={entity.entity_id}>
                      {entity.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Relationship</span>
                <select
                  disabled={readOnly}
                  value={link.relationship_type}
                  onChange={(event) =>
                    updateOwnershipLink(link.link_id, "relationship_type", event.target.value as OwnershipRelationshipType)
                  }
                >
                  {OWNERSHIP_RELATIONSHIP_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Scope</span>
                <select
                  disabled={readOnly}
                  value={link.ownership_scope}
                  onChange={(event) =>
                    updateOwnershipLink(link.link_id, "ownership_scope", event.target.value as OwnershipScope)
                  }
                >
                  {OWNERSHIP_SCOPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Ownership %</span>
                <input
                  disabled={readOnly}
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={link.ownership_percentage ?? ""}
                  onChange={(event) =>
                    updateOwnershipLink(
                      link.link_id,
                      "ownership_percentage",
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                />
              </label>
            </div>
          ))
        ) : (
          <p className="muted">No ownership relationships recorded yet.</p>
        )}
      </div>
    </div>
  );
});
