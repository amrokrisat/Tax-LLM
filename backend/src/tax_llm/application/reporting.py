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

    return "\n".join(lines).strip() + "\n"

