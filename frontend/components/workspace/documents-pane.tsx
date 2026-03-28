"use client";

import { ChangeEvent, memo } from "react";

import { ExtractedFact, StructureProposal, UploadedDocumentInput } from "@/lib/api";

function categoryLabel(category?: string | null) {
  if (!category) {
    return null;
  }
  return category.replaceAll("_", " ");
}

function targetKindLabel(kind?: string | null) {
  if (!kind) {
    return null;
  }
  switch (kind) {
    case "entity":
      return "Entity";
    case "ownership_link":
      return "Ownership";
    case "transaction_role":
      return "Role";
    case "tax_classification":
      return "Tax classification";
    case "transaction_step":
      return "Transaction step";
    case "election_filing_item":
      return "Election or filing";
    default:
      return kind.replaceAll("_", " ");
  }
}

export const DocumentsPane = memo(function DocumentsPane({
  draftDocuments,
  structureProposals,
  extracting,
  confirmingFacts,
  buildingStructure,
  onAddDocument,
  onExtract,
  onConfirmFacts,
  onBuildStructure,
  onReviewProposal,
  onFileUpload,
  updateDocument,
  updateExtractedFact,
}: {
  draftDocuments: UploadedDocumentInput[];
  structureProposals: StructureProposal[];
  extracting: boolean;
  confirmingFacts: boolean;
  buildingStructure: boolean;
  onAddDocument: () => void;
  onExtract: () => void;
  onConfirmFacts: () => void;
  onBuildStructure: () => void;
  onReviewProposal: (proposalId: string, status: "accepted" | "rejected") => void;
  onFileUpload: (index: number, event: ChangeEvent<HTMLInputElement>) => void;
  updateDocument: (index: number, key: keyof UploadedDocumentInput, value: string) => void;
  updateExtractedFact: (
    documentIndex: number,
    factId: string,
    field: keyof ExtractedFact,
    value: string,
  ) => void;
}) {
  return (
    <div className="stack">
      <div className="row-between">
        <div>
          <h2>Documents</h2>
          <p className="muted">Upload, paste, extract, and confirm document facts before they affect the matter record.</p>
        </div>
        <div className="button-row">
          <button className="button-subtle" onClick={onAddDocument} type="button">
            Add document
          </button>
          <button className="button-subtle" onClick={onExtract} disabled={extracting} type="button">
            {extracting ? "Extracting..." : "Run extraction"}
          </button>
          <button className="button-subtle" onClick={onBuildStructure} disabled={buildingStructure} type="button">
            {buildingStructure ? "Building..." : "Build structure"}
          </button>
          <button className="button-subtle" onClick={onConfirmFacts} disabled={confirmingFacts} type="button">
            {confirmingFacts ? "Saving review..." : "Save extraction review"}
          </button>
        </div>
      </div>

      {structureProposals.length ? (
        <div className="subpanel stack">
          <div className="row-between">
            <div>
              <h3>Structure proposals</h3>
              <p className="muted">Review synthesized entity, ownership, classification, role, step, and filing proposals before they populate the transaction file.</p>
            </div>
            <span className="chip">{structureProposals.length} proposals</span>
          </div>
          {["entity", "ownership_link", "tax_classification", "transaction_role", "transaction_step", "election_filing_item"].map((kind) => {
            const proposals = structureProposals.filter((item) => item.proposal_kind === kind);
            if (!proposals.length) {
              return null;
            }
            return (
              <div key={kind} className="stack">
                <h4>{targetKindLabel(kind) ?? kind.replaceAll("_", " ")}</h4>
                {proposals.map((proposal) => (
                  <div key={proposal.proposal_id} className="extracted-fact-card">
                    <div className="row-between">
                      <div className="chip-row">
                        <span className="chip">{proposal.review_status}</span>
                        <span className="chip">{proposal.confidence.toFixed(2)} confidence</span>
                        <span className="chip">{proposal.certainty} certainty</span>
                      </div>
                      <span className="chip">{proposal.label}</span>
                    </div>
                    <p>{proposal.rationale}</p>
                    {proposal.source_document_names.length ? (
                      <p className="muted">Sources: {proposal.source_document_names.join(", ")}</p>
                    ) : null}
                    {proposal.normalized_payload ? (
                      <p className="muted">Structured payload: {JSON.stringify(proposal.normalized_payload)}</p>
                    ) : null}
                    {proposal.ambiguity_note ? <p className="muted">{proposal.ambiguity_note}</p> : null}
                    {proposal.review_status === "pending" ? (
                      <div className="button-row">
                        <button className="button-subtle" type="button" onClick={() => onReviewProposal(proposal.proposal_id, "accepted")}>
                          Accept
                        </button>
                        <button className="button-ghost" type="button" onClick={() => onReviewProposal(proposal.proposal_id, "rejected")}>
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : null}

      {draftDocuments.map((document, index) => (
        <article key={`${document.file_name}-${index}`} className="document-card stack">
          <div className="row-between">
            <div className="chip-row">
              <span className="chip">{document.source === "uploaded" ? "Uploaded" : "Pasted"}</span>
              <span className="chip">{document.extraction_status ?? "not_requested"}</span>
            </div>
            <label className="button-ghost file-input-button">
              Upload document
              <input
                type="file"
                accept=".txt,.md,.json,.csv,.pdf,.doc,.docx"
                onChange={(event) => onFileUpload(index, event)}
              />
            </label>
          </div>

          <div className="two-col">
            <label className="field">
              <span>File name</span>
              <input value={document.file_name} onChange={(event) => updateDocument(index, "file_name", event.target.value)} />
            </label>
            <label className="field">
              <span>Document type</span>
              <input value={document.document_type} onChange={(event) => updateDocument(index, "document_type", event.target.value)} />
            </label>
          </div>

          <label className="field">
            <span>Content</span>
            <textarea rows={6} value={document.content} onChange={(event) => updateDocument(index, "content", event.target.value)} />
          </label>

          {document.extracted_text ? (
            <div className="subpanel stack">
              <div className="row-between">
                <h4>Extracted text</h4>
                <span className="chip">{document.extracted_text.length} chars</span>
              </div>
              <textarea rows={6} value={document.extracted_text} onChange={(event) => updateDocument(index, "extracted_text", event.target.value)} />
            </div>
          ) : null}

          {(document.extraction_ambiguities ?? []).length ? (
            <div className="subpanel stack">
              <div className="row-between">
                <div>
                  <h4>Unresolved ambiguities</h4>
                  <p className="muted">These items still need reviewer judgment before the extracted facts should be treated as settled.</p>
                </div>
                <span className="chip">{(document.extraction_ambiguities ?? []).length} items</span>
              </div>
              <ul className="list-tight">
                {(document.extraction_ambiguities ?? []).map((item, ambiguityIndex) => (
                  <li key={`${document.file_name}-ambiguity-${ambiguityIndex}`}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {(document.extracted_facts ?? []).length ? (
            <div className="subpanel stack">
              <div className="row-between">
                <div>
                  <h4>Extracted fact candidates</h4>
                  <p className="muted">Confirm, edit, or reject extracted fact candidates before they merge into the matter facts.</p>
                </div>
                <span className="chip">{(document.extracted_facts ?? []).length} candidates</span>
              </div>

              {(document.extracted_facts ?? []).map((fact) => (
                <div key={fact.fact_id} className="extracted-fact-card">
                  <div className="row-between">
                    <div className="chip-row">
                      {fact.category ? <span className="chip">{categoryLabel(fact.category)}</span> : null}
                      {fact.normalized_target_kind ? (
                        <span className="chip">Structured candidate: {targetKindLabel(fact.normalized_target_kind)}</span>
                      ) : null}
                      {fact.mapped_record_kind && fact.mapped_record_label ? (
                        <span className="chip">
                          Mapped to {targetKindLabel(fact.mapped_record_kind)}: {fact.mapped_record_label}
                        </span>
                      ) : null}
                    </div>
                    <span className="chip">{fact.source_document}</span>
                  </div>

                  <div className="two-col">
                    <label className="field">
                      <span>Fact label</span>
                      <input value={fact.label} onChange={(event) => updateExtractedFact(index, fact.fact_id, "label", event.target.value)} />
                    </label>
                    <label className="field">
                      <span>Status</span>
                      <select value={fact.status} onChange={(event) => updateExtractedFact(index, fact.fact_id, "status", event.target.value)}>
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </label>
                  </div>

                  <label className="field">
                    <span>Extracted value</span>
                    <textarea rows={3} value={fact.value} onChange={(event) => updateExtractedFact(index, fact.fact_id, "value", event.target.value)} />
                  </label>

                  <div className="chip-row">
                    <span className="chip">Confidence {fact.confidence.toFixed(2)}</span>
                    {fact.certainty ? <span className="chip">{fact.certainty} certainty</span> : null}
                    {fact.normalized_field ? <span className="chip">Maps to {fact.normalized_field}</span> : null}
                    {fact.normalized_target_kind ? (
                      <span className="chip">Will create or update {targetKindLabel(fact.normalized_target_kind)}</span>
                    ) : null}
                  </div>
                  {fact.normalized_target_payload ? (
                    <p className="muted">
                      Structured payload: {JSON.stringify(fact.normalized_target_payload)}
                    </p>
                  ) : null}
                  {fact.ambiguity_note ? <p className="muted">{fact.ambiguity_note}</p> : null}
                </div>
              ))}
            </div>
          ) : null}

          {(document.extracted_facts ?? []).some((fact) => fact.status === "confirmed") ? (
            <div className="subpanel stack">
              <div className="row-between">
                <div>
                  <h4>Confirmed facts ready to merge</h4>
                  <p className="muted">These reviewed facts are the ones that will be used when you merge confirmed facts into the matter record.</p>
                </div>
                <span className="chip">
                  {(document.extracted_facts ?? []).filter((fact) => fact.status === "confirmed").length} confirmed
                </span>
              </div>
              <ul className="list-tight">
                {(document.extracted_facts ?? [])
                  .filter((fact) => fact.status === "confirmed")
                  .map((fact) => (
                    <li key={`${fact.fact_id}-confirmed`}>
                      <strong>{fact.label}</strong>: {fact.value}
                      {fact.mapped_record_kind && fact.mapped_record_label
                        ? ` -> ${targetKindLabel(fact.mapped_record_kind)} ${fact.mapped_record_label}`
                        : fact.normalized_target_kind
                          ? ` -> ${targetKindLabel(fact.normalized_target_kind)} candidate`
                          : ""}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
});
