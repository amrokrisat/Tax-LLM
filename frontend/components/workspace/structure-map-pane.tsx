"use client";

import { memo } from "react";

import {
  ElectionOrFilingItem,
  Entity,
  OwnershipLink,
  TaxClassification,
  TransactionRole,
  TransactionStep,
} from "@/lib/api";
import { deriveStructureMap, StructureMapNode } from "@/lib/structure";

function ownershipLabel(link: OwnershipLink) {
  const pct = link.ownership_percentage != null ? ` ${link.ownership_percentage}%` : "";
  return `${link.relationship_type.replaceAll("_", " ")}${pct}`;
}

const StructureNodeCard = memo(function StructureNodeCard({
  node,
}: {
  node: StructureMapNode;
}) {
  return (
    <div className="structure-node-card">
      <div className="structure-node-header">
        <h4>{node.entity.name || "Unnamed entity"}</h4>
        <div className="chip-row">
          <span className="chip">{node.entity.entity_type.replaceAll("_", " ")}</span>
          {node.classification ? (
            <span className="chip">{node.classification.classification_type.replaceAll("_", " ")}</span>
          ) : null}
        </div>
      </div>
      {node.entity.jurisdiction ? <p className="muted">{node.entity.jurisdiction}</p> : null}
      {node.roles.length ? (
        <div className="chip-row">
          {node.roles.map((role) => (
            <span key={`${node.entity.entity_id}-${role}`} className="support-pill support-secondary">
              {role.replaceAll("_", " ")}
            </span>
          ))}
        </div>
      ) : null}
      <div className="structure-node-meta">
        {node.directParentNames.length ? (
          <p className="muted">Owned by: {node.directParentNames.join(", ")}</p>
        ) : null}
        {node.directChildNames.length ? (
          <p className="muted">Direct children: {node.directChildNames.join(", ")}</p>
        ) : null}
        {node.indirectChildren.length ? (
          <p className="muted">
            Indirect interests:{" "}
            {node.indirectChildren
              .slice(0, 3)
              .map((item) =>
                item.percentage != null ? `${item.childName} (${item.percentage.toFixed(2)}%)` : item.childName,
              )
              .join(", ")}
          </p>
        ) : null}
      </div>
      <div className="chip-row">
        <span className="chip">{node.linkedStepCount} linked steps</span>
        <span className="chip">{node.linkedElectionCount} filings/elections</span>
      </div>
    </div>
  );
});

function StructureBranch({ node }: { node: StructureMapNode }) {
  return (
    <div className="structure-branch">
      <StructureNodeCard node={node} />
      {node.children.length ? (
        <div className="structure-children">
          {node.children.map((child) => {
            const link = node.outbound.find((item) => item.child_entity_id === child.entity.entity_id);
            return (
              <div key={`${node.entity.entity_id}-${child.entity.entity_id}`} className="structure-child-link">
                {link ? <div className="structure-edge-label">{ownershipLabel(link)}</div> : null}
                <StructureBranch node={child} />
              </div>
            );
          })}
        </div>
      ) : null}
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
}: {
  entities: Entity[];
  ownershipLinks: OwnershipLink[];
  taxClassifications: TaxClassification[];
  transactionRoles: TransactionRole[];
  transactionSteps: TransactionStep[];
  electionItems: ElectionOrFilingItem[];
}) {
  const map = deriveStructureMap(
    entities,
    ownershipLinks,
    taxClassifications,
    transactionRoles,
    transactionSteps,
    electionItems,
  );

  return (
    <div className="stack">
      <div className="subpanel stack">
        <h2>Structure Map</h2>
        <p className="muted">
          Visualize ownership, legal form, tax classification, transaction roles, and linked step or filing activity across the current matter structure.
        </p>
      </div>

      {map.roots.length ? (
        <div className="structure-map-roots">
          {map.roots.map((node) => (
            <div key={node.entity.entity_id} className="subpanel">
              <StructureBranch node={node} />
            </div>
          ))}
        </div>
      ) : (
        <div className="subpanel">
          <p className="muted">No ownership tree is available yet. Add ownership links in Entity Structure to populate the map.</p>
        </div>
      )}

      {map.multiOwnerNodes.length ? (
        <div className="subpanel stack">
          <h3>Shared / Multi-owner entities</h3>
          <div className="structure-node-grid">
            {map.multiOwnerNodes.map((node) => (
              <StructureNodeCard key={node.entity.entity_id} node={node} />
            ))}
          </div>
        </div>
      ) : null}

      {map.unlinkedNodes.length ? (
        <div className="subpanel stack">
          <h3>Unlinked participants</h3>
          <div className="structure-node-grid">
            {map.unlinkedNodes.map((node) => (
              <StructureNodeCard key={node.entity.entity_id} node={node} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
});
