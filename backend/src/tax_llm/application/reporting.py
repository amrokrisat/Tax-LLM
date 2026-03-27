from __future__ import annotations

from tax_llm.domain.models import AnalysisRun


def export_run_markdown(run: AnalysisRun) -> str:
    result = run.result
    lines: list[str] = []

    lines.append(f"# {result.facts.transaction_name}")
    lines.append("")
    lines.append(f"_Generated from run {run.run_id} on {run.created_at}_")
    lines.append("")

    for section in result.memo_sections:
        lines.append(f"## {section.heading}")
        lines.append("")
        lines.append(section.body)
        lines.append("")
        if section.citations:
            lines.append("Authorities:")
            for citation in section.citations:
                lines.append(f"- {citation.citation}: {citation.title}")
            lines.append("")

    if result.under_supported_buckets:
        lines.append("## Preliminary Matters")
        lines.append("")
        lines.append(result.completeness_warning)
        lines.append("")

    if run.entities:
        lines.append("## Entity Structure Snapshot")
        lines.append("")
        for entity in run.entities:
            lines.append(
                f"- {entity.name} [{entity.entity_type}]"
                + (f" ({entity.jurisdiction})" if entity.jurisdiction else "")
            )
            classification = next(
                (item.classification_type for item in run.tax_classifications if item.entity_id == entity.entity_id),
                None,
            )
            roles = [item.role_type for item in run.transaction_roles if item.entity_id == entity.entity_id]
            if classification:
                lines.append(f"  - Tax classification: {classification}")
            if roles:
                lines.append(f"  - Roles: {', '.join(roles)}")
        if run.ownership_links:
            lines.append("")
            lines.append("Ownership:")
            for link in run.ownership_links:
                parent = next((entity.name for entity in run.entities if entity.entity_id == link.parent_entity_id), link.parent_entity_id)
                child = next((entity.name for entity in run.entities if entity.entity_id == link.child_entity_id), link.child_entity_id)
                pct = f" ({link.ownership_percentage:.2f}%)" if link.ownership_percentage is not None else ""
                lines.append(f"- {parent} {link.relationship_type} {child}{pct}")
        lines.append("")

    if run.transaction_steps:
        lines.append("## Transaction Steps Snapshot")
        lines.append("")
        for step in sorted(run.transaction_steps, key=lambda item: item.sequence_number):
            entity_names = [
                entity.name
                for entity in run.entities
                if entity.entity_id in step.entity_ids
            ]
            linked = f" [{', '.join(entity_names)}]" if entity_names else ""
            lines.append(
                f"- {step.sequence_number}. {step.phase} / {step.step_type}: {step.title}{linked}"
            )
            if step.description:
                lines.append(f"  - {step.description}")
        lines.append("")

    if run.election_items:
        lines.append("## Elections And Filings")
        lines.append("")
        for item in run.election_items:
            lines.append(
                f"- {item.name} [{item.item_type}]"
                + (f" - {item.citation_or_form}" if item.citation_or_form else "")
                + f" ({item.status})"
            )
            if item.notes:
                lines.append(f"  - {item.notes}")
        lines.append("")

    return "\n".join(lines).strip() + "\n"
