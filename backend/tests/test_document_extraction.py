from tax_llm.domain.models import UploadedDocument
from tax_llm.infrastructure.document_extraction import DocumentExtractionService


def test_document_extraction_detects_transaction_forms_overlays_and_ambiguities():
    service = DocumentExtractionService()
    documents = [
        UploadedDocument(
            file_name="loi.txt",
            document_type="loi",
            content=(
                "Buyer is evaluating a stock acquisition, a merger-sub structure, or a possible asset purchase. "
                "The parties may consider a section 338(h)(10), 338(g), or 336(e) election. "
                "Seller is also considering a spin-off under section 355 before signing. "
                "The target may contribute assets to an LLC taxed as a partnership, and disguised sale issues remain possible. "
                "Target has NOLs and may refinance debt after closing. State transfer tax and cross-border withholding issues may remain relevant."
            ),
        )
    ]

    extracted = service.extract(documents)
    document = extracted[0]

    assert document.extracted_text is not None
    assert len(document.extracted_facts) >= 8
    categories = {fact.category for fact in document.extracted_facts}
    assert "transaction_form" in categories
    assert "election_language" in categories
    assert "structure_signal" in categories
    assert "attribute_signal" in categories
    assert "financing_signal" in categories
    assert "jurisdictional_overlay" in categories
    assert document.extraction_ambiguities


def test_document_extraction_maps_normalized_fields_for_mergeable_facts():
    service = DocumentExtractionService()
    documents = [
        UploadedDocument(
            file_name="tax-notes.txt",
            document_type="diligence",
            content=(
                "Buyer wants a section 336(e) path, is considering a contribution step, and expects refinancing. "
                "The parties also note rollover equity, state tax, and foreign withholding concerns."
            ),
        )
    ]

    extracted = service.extract(documents)[0]
    normalized_pairs = {
        (fact.normalized_field, fact.normalized_value)
        for fact in extracted.extracted_facts
        if fact.normalized_field
    }

    assert ("deemed_asset_sale_election", "true") in normalized_pairs
    assert ("contribution_transactions", "true") in normalized_pairs
    assert ("debt_financing", "true") in normalized_pairs
    assert ("rollover_equity", "true") in normalized_pairs
    assert ("state_tax", "true") in normalized_pairs
    assert ("withholding", "true") in normalized_pairs
