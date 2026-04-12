import {
  ElectionOrFilingStatus,
  ElectionOrFilingType,
  Entity,
  EntityType,
  OwnershipRelationshipType,
  OwnershipScope,
  StructuredRecordStatus,
  TaxClassificationType,
  TransactionRoleType,
  TransactionStepPhase,
  TransactionStepType,
} from "@/lib/api";
import type { DiagramShape } from "@/lib/structure";

export type TaxonomyOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

export const ENTITY_TYPE_OPTIONS: TaxonomyOption<EntityType>[] = [
  { value: "corporation", label: "Corporation", description: "Corporate legal entity or company." },
  { value: "llc", label: "LLC", description: "Limited liability company; tax classification is tracked separately." },
  { value: "partnership", label: "Partnership", description: "Legal partnership or partnership-form vehicle." },
  { value: "individual", label: "Individual", description: "Natural person, founder, shareholder, or individual owner." },
  { value: "trust", label: "Trust", description: "Trust or trust-like legal owner." },
  { value: "disregarded_entity", label: "Disregarded / hybrid entity", description: "Hybrid legal-form clue; confirm tax classification separately." },
  { value: "foreign_entity", label: "Foreign entity", description: "Non-U.S. entity; confirm local form and U.S. tax classification separately." },
  { value: "branch", label: "Branch / PE", description: "Branch, permanent establishment, or non-entity branch operation." },
  { value: "other", label: "Other / unknown", description: "Use when legal form is unresolved." },
];

export const TAX_CLASSIFICATION_OPTIONS: TaxonomyOption<TaxClassificationType>[] = [
  { value: "c_corporation", label: "C corporation" },
  { value: "s_corporation", label: "S corporation" },
  { value: "partnership", label: "Partnership" },
  { value: "disregarded_entity", label: "Disregarded entity" },
  { value: "grantor_trust", label: "Grantor trust" },
  { value: "individual", label: "Individual" },
  { value: "foreign_corporation", label: "Foreign corporation" },
  { value: "unknown", label: "Unknown / confirm" },
];

export const TRANSACTION_ROLE_OPTIONS: TaxonomyOption<TransactionRoleType>[] = [
  { value: "buyer", label: "Buyer" },
  { value: "seller", label: "Seller" },
  { value: "target", label: "Target" },
  { value: "parent", label: "Parent" },
  { value: "subsidiary", label: "Subsidiary" },
  { value: "merger_sub", label: "Merger sub" },
  { value: "holding_company", label: "Holding company" },
  { value: "portfolio_company", label: "Portfolio company" },
  { value: "distributing_corporation", label: "Distributing corporation" },
  { value: "controlled_corporation", label: "Controlled corporation" },
  { value: "partnership_vehicle", label: "Partnership vehicle" },
  { value: "blocker", label: "Blocker" },
  { value: "lender", label: "Lender" },
  { value: "shareholder", label: "Shareholder" },
  { value: "partner", label: "Partner" },
  { value: "individual_owner", label: "Individual owner" },
  { value: "rollover_holder", label: "Rollover holder" },
  { value: "other", label: "Other / confirm" },
];

export const OWNERSHIP_RELATIONSHIP_OPTIONS: TaxonomyOption<OwnershipRelationshipType>[] = [
  { value: "owns", label: "Owns" },
  { value: "member_of", label: "Member of" },
  { value: "partner_of", label: "Partner of" },
  { value: "disregarded_owner", label: "Disregarded owner" },
  { value: "shareholder_of", label: "Shareholder of" },
];

export const OWNERSHIP_SCOPE_OPTIONS: TaxonomyOption<OwnershipScope>[] = [
  { value: "direct", label: "Direct" },
  { value: "indirect", label: "Explicit indirect" },
];

export const STRUCTURED_RECORD_STATUS_OPTIONS: TaxonomyOption<StructuredRecordStatus>[] = [
  { value: "proposed", label: "Proposed" },
  { value: "confirmed", label: "Confirmed" },
  { value: "uncertain", label: "Uncertain" },
];

export const TRANSACTION_STEP_PHASE_OPTIONS: TaxonomyOption<TransactionStepPhase>[] = [
  { value: "pre_closing", label: "Pre-closing" },
  { value: "closing", label: "Closing" },
  { value: "post_closing", label: "Post-closing" },
];

export const TRANSACTION_STEP_TYPE_OPTIONS: TaxonomyOption<TransactionStepType>[] = [
  { value: "signing", label: "Signing / definitive agreement" },
  { value: "pre_closing_reorganization", label: "Pre-closing reorganization" },
  { value: "stock_purchase", label: "Stock acquisition" },
  { value: "stock_sale", label: "Stock sale" },
  { value: "asset_purchase", label: "Asset acquisition" },
  { value: "asset_sale", label: "Asset sale" },
  { value: "merger", label: "Merger" },
  { value: "contribution", label: "Contribution / drop-down" },
  { value: "distribution", label: "Distribution" },
  { value: "spin_off", label: "Section 355 spin-off" },
  { value: "split_off", label: "Section 355 split-off" },
  { value: "split_up", label: "Section 355 split-up" },
  { value: "partnership_contribution", label: "Partnership contribution" },
  { value: "refinancing", label: "Refinancing" },
  { value: "election", label: "Election step" },
  { value: "filing", label: "Filing step" },
  { value: "post_closing_integration", label: "Post-closing integration" },
  { value: "other", label: "Other / confirm" },
];

export const TRANSACTION_TYPE_OPTIONS: TaxonomyOption<string>[] = [
  { value: "stock sale", label: "Stock sale / equity acquisition" },
  { value: "asset sale", label: "Asset sale / asset acquisition" },
  { value: "merger", label: "Merger / reorganization" },
  { value: "contribution transaction", label: "Contribution transaction" },
  { value: "divisive transaction", label: "Divisive / Section 355 transaction" },
  { value: "partnership transaction", label: "Partnership transaction" },
];

export const ELECTION_OR_FILING_TYPE_OPTIONS: TaxonomyOption<ElectionOrFilingType>[] = [
  { value: "election", label: "Election" },
  { value: "filing", label: "Filing" },
  { value: "compliance", label: "Compliance item" },
  { value: "other", label: "Other / confirm" },
];

export const ELECTION_OR_FILING_STATUS_OPTIONS: TaxonomyOption<ElectionOrFilingStatus>[] = [
  { value: "possible", label: "Possible" },
  { value: "required", label: "Required" },
  { value: "selected", label: "Selected" },
  { value: "filed", label: "Filed" },
  { value: "uncertain", label: "Uncertain" },
];

export function optionLabel<T extends string>(options: TaxonomyOption<T>[], value: string | null | undefined) {
  if (!value) {
    return "";
  }
  return options.find((option) => option.value === value)?.label ?? value.replaceAll("_", " ");
}

export function entityTypeLabel(value: EntityType | string | null | undefined) {
  return optionLabel(ENTITY_TYPE_OPTIONS, value);
}

export function taxClassificationLabel(value: TaxClassificationType | string | null | undefined) {
  return optionLabel(TAX_CLASSIFICATION_OPTIONS, value);
}

export function transactionRoleLabel(value: TransactionRoleType | string | null | undefined) {
  return optionLabel(TRANSACTION_ROLE_OPTIONS, value);
}

export function ownershipRelationshipLabel(value: OwnershipRelationshipType | string | null | undefined) {
  return optionLabel(OWNERSHIP_RELATIONSHIP_OPTIONS, value);
}

export function transactionStepTypeLabel(value: TransactionStepType | string | null | undefined) {
  return optionLabel(TRANSACTION_STEP_TYPE_OPTIONS, value);
}

export function transactionStepPhaseLabel(value: TransactionStepPhase | string | null | undefined) {
  return optionLabel(TRANSACTION_STEP_PHASE_OPTIONS, value);
}

export function entityShapeForType(entityType: Entity["entity_type"]): DiagramShape {
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
