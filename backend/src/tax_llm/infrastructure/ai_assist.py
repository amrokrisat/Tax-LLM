from __future__ import annotations

import json
import os
from dataclasses import dataclass

import httpx

from tax_llm.application.structured_context import StructuredTransactionContext
from tax_llm.domain.models import (
    AIAssistPayload,
    AuthorityRecord,
    BucketCoverage,
    MemoSection,
    MissingFactQuestion,
    StructuralAlternative,
    TaxIssue,
    TransactionFacts,
)


SYSTEM_PROMPT = """
You are assisting a transactional tax workspace.
You do not invent legal certainty or override the deterministic source of truth.
You rewrite and improve memo prose, missing-facts questions, and alternative comparison summary
using only the provided deterministic analysis, structured facts, and retrieved authorities.

Rules:
- Keep all preliminary/weak support ideas visibly cautious.
- Do not claim support stronger than the deterministic support posture.
- Prefer concrete transactional-tax phrasing over generic prose.
- Keep memo sections practical and deal-focused.
- Return strict JSON matching the requested schema.
""".strip()


@dataclass
class OpenAIAssistService:
    api_key: str | None = None
    model: str = "gpt-5.4-mini"
    timeout_seconds: float = 20.0

    def __post_init__(self) -> None:
        if self.api_key is None:
            self.api_key = os.getenv("OPENAI_API_KEY")
        self.model = os.getenv("OPENAI_MODEL", self.model)

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    def build_ai_assist(
        self,
        *,
        facts: TransactionFacts,
        structured_context: StructuredTransactionContext,
        bucket_coverage: list[BucketCoverage],
        issues: list[TaxIssue],
        alternatives: list[StructuralAlternative],
        memo_sections: list[MemoSection],
        missing_facts: list[MissingFactQuestion],
        completeness_warning: str,
    ) -> AIAssistPayload:
        if not self.enabled:
            return AIAssistPayload(status="disabled", model=None, error=None)

        payload = self._build_payload(
            facts=facts,
            structured_context=structured_context,
            bucket_coverage=bucket_coverage,
            issues=issues,
            alternatives=alternatives,
            memo_sections=memo_sections,
            missing_facts=missing_facts,
            completeness_warning=completeness_warning,
        )

        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                response = client.post(
                    "https://api.openai.com/v1/responses",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "input": [
                            {"role": "system", "content": [{"type": "input_text", "text": SYSTEM_PROMPT}]},
                            {"role": "user", "content": [{"type": "input_text", "text": json.dumps(payload)}]},
                        ],
                        "text": {
                            "format": {
                                "type": "json_schema",
                                "name": "tax_llm_ai_assist",
                                "schema": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "properties": {
                                        "comparison_summary": {"type": "string"},
                                        "memo_sections": {
                                            "type": "array",
                                            "items": {
                                                "type": "object",
                                                "additionalProperties": False,
                                                "properties": {
                                                    "heading": {"type": "string"},
                                                    "body": {"type": "string"},
                                                },
                                                "required": ["heading", "body"],
                                            },
                                        },
                                        "missing_facts": {
                                            "type": "array",
                                            "items": {
                                                "type": "object",
                                                "additionalProperties": False,
                                                "properties": {
                                                    "bucket": {"type": "string"},
                                                    "question": {"type": "string"},
                                                    "rationale": {"type": "string"},
                                                },
                                                "required": ["bucket", "question", "rationale"],
                                            },
                                        },
                                    },
                                    "required": ["comparison_summary", "memo_sections", "missing_facts"],
                                },
                            }
                        },
                    },
                )
                response.raise_for_status()
                body = response.json()
                raw = body.get("output_text", "")
                parsed = json.loads(raw)
        except Exception as exc:  # noqa: BLE001 - graceful degradation is the feature contract
            return AIAssistPayload(status="error", model=self.model, error=str(exc))

        try:
            enhanced_sections = self._merge_sections(
                memo_sections=memo_sections,
                generated=parsed.get("memo_sections", []),
            )
            enhanced_missing = [
                MissingFactQuestion.model_validate(item)
                for item in parsed.get("missing_facts", [])
            ]
            comparison_summary = parsed.get("comparison_summary") or None
            return AIAssistPayload(
                status="ready",
                model=self.model,
                memo_sections=enhanced_sections,
                missing_facts=enhanced_missing,
                comparison_summary=comparison_summary,
            )
        except Exception as exc:  # noqa: BLE001
            return AIAssistPayload(
                status="error",
                model=self.model,
                error=f"AI response validation failed: {exc}",
            )

    def _merge_sections(
        self,
        *,
        memo_sections: list[MemoSection],
        generated: list[dict],
    ) -> list[MemoSection]:
        generated_by_heading = {
            item.get("heading", ""): item.get("body", "")
            for item in generated
            if item.get("heading") and item.get("body")
        }
        merged: list[MemoSection] = []
        for section in memo_sections:
            merged.append(
                section.model_copy(
                    update={
                        "body": generated_by_heading.get(section.heading, section.body),
                    }
                )
            )
        return merged

    def _authority_summary(self, authorities: list[AuthorityRecord]) -> list[dict[str, str]]:
        return [
            {
                "citation": authority.citation,
                "title": authority.title,
                "excerpt": authority.excerpt,
            }
            for authority in authorities[:10]
        ]

    def _build_payload(
        self,
        *,
        facts: TransactionFacts,
        structured_context: StructuredTransactionContext,
        bucket_coverage: list[BucketCoverage],
        issues: list[TaxIssue],
        alternatives: list[StructuralAlternative],
        memo_sections: list[MemoSection],
        missing_facts: list[MissingFactQuestion],
        completeness_warning: str,
    ) -> dict:
        return {
            "task": "Enhance memo prose, missing-facts questions, and alternative comparison summary without changing support posture.",
            "facts": facts.model_dump(),
            "structured_context": {
                "buyers": structured_context.entity_names_for_role("buyer"),
                "sellers": structured_context.entity_names_for_role("seller"),
                "targets": structured_context.entity_names_for_role("target"),
                "parents": structured_context.entity_names_for_role("parent"),
                "merger_subs": structured_context.entity_names_for_role("merger_sub"),
                "partnership_vehicles": structured_context.entity_names_for_role("partnership_vehicle"),
                "ordered_steps": [
                    {
                        "sequence_number": step.sequence_number,
                        "phase": step.phase,
                        "step_type": step.step_type,
                        "title": step.title,
                        "description": step.description,
                    }
                    for step in structured_context.ordered_steps[:8]
                ],
                "ownership": structured_context.derived_ownership_lines()[:12],
                "ambiguities": structured_context.structure_ambiguities,
            },
            "coverage": [
                {
                    "bucket": coverage.bucket,
                    "label": coverage.label,
                    "status": coverage.status,
                    "notes": coverage.notes,
                    "source_priority_warning": coverage.source_priority_warning,
                    "authorities": self._authority_summary(coverage.authorities),
                }
                for coverage in bucket_coverage
            ],
            "issues": [issue.model_dump() for issue in issues],
            "alternatives": [alternative.model_dump() for alternative in alternatives],
            "memo_sections": [section.model_dump() for section in memo_sections],
            "missing_facts": [question.model_dump() for question in missing_facts],
            "completeness_warning": completeness_warning,
        }
