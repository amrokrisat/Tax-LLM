from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Iterable

from tax_llm.domain.models import AuthorityRecord, SourceType
from tax_llm.infrastructure.paths import backend_data_path

SOURCE_DIRECTORIES: dict[SourceType, str] = {
    "code": "code",
    "regs": "regs",
    "irs_guidance": "irs_guidance",
    "cases": "cases",
    "forms": "forms",
    "internal": "internal",
}

SOURCE_PRIORITY: dict[SourceType, int] = {
    "code": 0,
    "regs": 1,
    "irs_guidance": 2,
    "cases": 3,
    "forms": 4,
    "internal": 5,
}

BUCKET_CONTEXT_TERMS: dict[str, list[str]] = {
    "attribute_preservation": ["nol", "attribute", "ownership change", "built-in gain", "built in loss", "credits", "historic ownership"],
    "stock_sale": ["stock purchase", "stock sale", "equity acquisition"],
    "asset_sale": ["asset purchase", "asset sale", "basis step-up", "allocation"],
    "deemed_asset_sale_election": ["338", "338(h)(10)", "336(e)", "deemed asset"],
    "merger_reorganization": ["merger", "reorganization", "continuity", "business purpose", "merger sub", "triangular"],
    "rollover_equity": ["rollover", "continuing equity", "seller equity", "governance", "redemption", "downside protection"],
    "contribution_transactions": ["contribution", "drop-down", "holdco", "control"],
    "partnership_issues": ["partnership", "llc", "disguised sale", "704(c)"],
    "debt_overlay": ["debt", "refinancing", "leverage", "interest limitation", "seller note", "significant modification", "acquisition indebtedness"],
    "earnout_overlay": ["earnout", "contingent consideration", "deferred payment", "installment"],
    "withholding_overlay": ["withholding", "certificate", "foreign payee"],
    "state_overlay": ["state tax", "transfer tax", "apportionment", "bulk sale"],
    "international_overlay": ["cross-border", "foreign", "treaty", "international"],
}

AUTHORITY_GATING_TERMS: dict[str, list[str]] = {
    "code-382": ["nol", "net operating loss", "attribute", "ownership change", "built-in loss", "built in gain"],
    "reg-1-382": ["nol", "attribute", "ownership change", "five-percent shareholder", "testing period"],
    "notice-2003-65": ["built-in gain", "built in loss", "382", "attribute"],
    "code-163j": ["debt", "financing", "interest", "leverage", "refinancing"],
    "notice-2018-28": ["debt", "financing", "interest", "refinancing"],
    "code-279": ["debt", "financing", "acquisition indebtedness", "subordinated debt"],
    "reg-1-1001-3": ["refinancing", "debt modification", "significant modification", "seller note"],
    "code-453": ["earnout", "contingent", "deferred", "installment"],
    "code-1274-483": ["earnout", "deferred", "seller note", "imputed interest"],
    "reg-1-707-3": ["partnership", "llc", "contribution", "disguised sale", "liability allocation", "leveraged distribution"],
    "reg-1-368-2k": ["merger sub", "triangular merger", "parent stock", "reorganization"],
    "case-letulle": ["debt-like", "security", "redemption", "preferred", "continuity"],
    "case-minnesota-tea": ["continuity", "stock consideration", "mixed consideration", "reorganization"],
    "code-383": ["credits", "attribute", "ownership change", "nol"],
    "code-384": ["built-in gain", "preacquisition loss", "attribute", "gain recognition"],
}

PRIMARY_SUPPORT_TYPES: set[SourceType] = {"code", "regs"}
SECONDARY_SUPPORT_TYPES: set[SourceType] = {"irs_guidance", "cases", "forms"}
INTERNAL_ONLY_TYPES: set[SourceType] = {"internal"}
SUPPORTED_EXTENSIONS = {".txt", ".md", ".json"}
PDF_EXTENSION = ".pdf"


@dataclass(frozen=True)
class CorpusLoadResult:
    authorities: list[AuthorityRecord]
    pending_files: list[str]


def corpus_root() -> Path:
    return backend_data_path("corpus")


class AuthorityCorpusLoader:
    def __init__(self, root_path: Path | None = None) -> None:
        self.root_path = root_path or corpus_root()

    def load(self) -> CorpusLoadResult:
        authorities: list[AuthorityRecord] = []
        pending_files: list[str] = []

        for source_type, folder_name in SOURCE_DIRECTORIES.items():
            folder = self.root_path / folder_name
            if not folder.exists():
                continue
            for path in sorted(folder.rglob("*")):
                if path.is_dir():
                    continue
                suffix = path.suffix.lower()
                if suffix == PDF_EXTENSION:
                    pending_files.append(str(path))
                    continue
                if suffix not in SUPPORTED_EXTENSIONS:
                    continue
                authorities.extend(self._load_file(path, source_type))

        return CorpusLoadResult(
            authorities=dedupe_authorities(authorities),
            pending_files=pending_files,
        )

    def _load_file(self, path: Path, source_type: SourceType) -> list[AuthorityRecord]:
        if path.suffix.lower() == ".json":
            return self._load_json(path, source_type)
        raw_text = path.read_text(encoding="utf-8")
        metadata, body = parse_front_matter(raw_text)
        return [
            self._build_record(
                path=path,
                source_type=source_type,
                metadata=metadata,
                body=body,
            )
        ]

    def _load_json(self, path: Path, source_type: SourceType) -> list[AuthorityRecord]:
        payload = json.loads(path.read_text(encoding="utf-8"))
        items = payload if isinstance(payload, list) else payload.get("authorities", [payload])
        return [
            self._build_record(
                path=path,
                source_type=source_type,
                metadata=item,
                body=item.get("body") or item.get("excerpt") or "",
            )
            for item in items
        ]

    def _build_record(
        self,
        *,
        path: Path,
        source_type: SourceType,
        metadata: dict,
        body: str,
    ) -> AuthorityRecord:
        authority_id = metadata.get("authority_id") or slugify(
            f"{source_type}-{metadata.get('citation') or metadata.get('title') or path.stem}"
        )
        return AuthorityRecord(
            authority_id=authority_id,
            source_type=source_type,
            title=metadata.get("title") or path.stem.replace("_", " ").title(),
            citation=metadata.get("citation") or path.stem,
            excerpt=metadata.get("excerpt") or compact_excerpt(body),
            issue_buckets=normalize_list(metadata.get("issue_buckets")),
            jurisdiction=string_or_none(metadata.get("jurisdiction")),
            effective_date=string_or_none(metadata.get("effective_date")),
            tax_year=string_or_none(metadata.get("tax_year")),
            date_range=string_or_none(metadata.get("date_range")),
            authority_weight=float(metadata.get("authority_weight", 1.0)),
            file_path=str(path),
            source_url=string_or_none(metadata.get("source_url")),
            ingestion_timestamp=string_or_none(metadata.get("ingestion_timestamp")),
            primary_authority=coerce_bool(
                metadata.get("primary_authority"),
                default=source_type in PRIMARY_SUPPORT_TYPES,
            ),
            secondary_authority=coerce_bool(
                metadata.get("secondary_authority"),
                default=source_type in SECONDARY_SUPPORT_TYPES,
            ),
            internal_only=coerce_bool(
                metadata.get("internal_only"),
                default=source_type in INTERNAL_ONLY_TYPES,
            ),
            tags=normalize_list(metadata.get("tags")),
            relevance_score=0.0,
        )


class AuthorityIndex:
    def __init__(self, authorities: list[AuthorityRecord], pending_files: list[str]) -> None:
        self.authorities = authorities
        self.pending_files = pending_files

    @classmethod
    def build(cls, root_path: Path | None = None) -> "AuthorityIndex":
        result = AuthorityCorpusLoader(root_path=root_path).load()
        return cls(result.authorities, result.pending_files)

    def search(
        self,
        *,
        issue_buckets: list[str] | None = None,
        transaction_type: str | None = None,
        source_types: list[SourceType] | None = None,
        priority_order: list[SourceType] | None = None,
        jurisdictions: list[str] | None = None,
        title_keywords: list[str] | None = None,
        citation_keywords: list[str] | None = None,
        effective_date_from: str | None = None,
        effective_date_to: str | None = None,
        query_text: str = "",
        limit: int = 8,
    ) -> list[AuthorityRecord]:
        ranked: list[AuthorityRecord] = []
        normalized_query = query_text.lower()
        normalized_jurisdictions = [item.lower() for item in (jurisdictions or [])]

        for authority in self.authorities:
            if source_types and authority.source_type not in source_types:
                continue
            if issue_buckets and not set(issue_buckets).intersection(authority.issue_buckets):
                continue
            if transaction_type and not transaction_type_matches(transaction_type, authority):
                continue
            if normalized_jurisdictions and not jurisdiction_matches(
                authority.jurisdiction, normalized_jurisdictions
            ):
                continue
            if not date_in_range(authority.effective_date, effective_date_from, effective_date_to):
                continue

            score = rank_authority(
                authority=authority,
                priority_order=priority_order or [],
                query_text=normalized_query,
                issue_buckets=issue_buckets or [],
                transaction_type=transaction_type,
                title_keywords=title_keywords or [],
                citation_keywords=citation_keywords or [],
            )
            ranked.append(authority.model_copy(update={"relevance_score": score}))

        ranked.sort(
            key=lambda authority: (
                authority.relevance_score,
                -SOURCE_PRIORITY[authority.source_type],
            ),
            reverse=True,
        )
        deduped: list[AuthorityRecord] = []
        seen: set[str] = set()
        for authority in ranked:
            if authority.authority_id in seen:
                continue
            seen.add(authority.authority_id)
            deduped.append(authority)
        return deduped[:limit]


def parse_front_matter(raw_text: str) -> tuple[dict, str]:
    if not raw_text.startswith("---\n"):
        return {}, raw_text.strip()
    _, rest = raw_text.split("---\n", 1)
    if "\n---\n" not in rest:
        return {}, raw_text.strip()
    metadata_block, body = rest.split("\n---\n", 1)
    metadata: dict[str, object] = {}
    for line in metadata_block.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        metadata[key.strip()] = parse_front_matter_value(value.strip())
    return metadata, body.strip()


def parse_front_matter_value(raw_value: str):
    lowered = raw_value.lower()
    if lowered in {"true", "false"}:
        return lowered == "true"
    if re.fullmatch(r"-?\d+(\.\d+)?", raw_value):
        return float(raw_value) if "." in raw_value else int(raw_value)
    if raw_value.startswith("[") and raw_value.endswith("]"):
        return [
            item.strip().strip("\"'")
            for item in raw_value[1:-1].split(",")
            if item.strip()
        ]
    return raw_value.strip("\"'")


def normalize_list(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item) for item in value]
    if isinstance(value, str):
        return [item.strip() for item in value.split(",") if item.strip()]
    return [str(value)]


def compact_excerpt(text: str, max_length: int = 280) -> str:
    compact = " ".join(text.split())
    return compact[:max_length] + ("..." if len(compact) > max_length else "")


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def coerce_bool(value: object, *, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower().strip() == "true"
    return bool(value)


def string_or_none(value: object) -> str | None:
    if value is None:
        return None
    return str(value)


def dedupe_authorities(authorities: list[AuthorityRecord]) -> list[AuthorityRecord]:
    winners: dict[str, AuthorityRecord] = {}
    for authority in authorities:
        key = canonical_authority_key(authority)
        current = winners.get(key)
        if current is None or authority_sort_key(authority) > authority_sort_key(current):
            winners[key] = authority
    return list(winners.values())


def canonical_authority_key(authority: AuthorityRecord) -> str:
    if authority.authority_id:
        return authority.authority_id
    return slugify(
        "|".join(
            [
                authority.source_type,
                authority.citation or "",
                authority.title or "",
                authority.source_url or "",
            ]
        )
    )


def authority_sort_key(authority: AuthorityRecord) -> tuple[str, str, float]:
    return (
        authority.effective_date or "",
        authority.ingestion_timestamp or current_timestamp(),
        authority.authority_weight,
    )


def current_timestamp() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def keyword_match(keywords: Iterable[str], haystack: str) -> bool:
    lowered = haystack.lower()
    return any(keyword.lower() in lowered for keyword in keywords)


def transaction_type_matches(transaction_type: str, authority: AuthorityRecord) -> bool:
    lowered = normalize_phrase(transaction_type)
    haystack_parts = authority.tags + authority.issue_buckets + [authority.title, authority.citation]
    normalized_haystack = " ".join(normalize_phrase(part) for part in haystack_parts)
    if lowered in normalized_haystack:
        return True
    tokens = [token for token in lowered.split() if token]
    return all(token in normalized_haystack for token in tokens)


def normalize_phrase(value: str) -> str:
    return value.lower().replace("_", " ").replace("-", " ")


def jurisdiction_matches(authority_jurisdiction: str | None, filters: list[str]) -> bool:
    if not authority_jurisdiction:
        return True
    lowered = authority_jurisdiction.lower()
    return lowered in filters or (lowered == "united states" and "united states" in filters)


def date_in_range(effective_date: str | None, start: str | None, end: str | None) -> bool:
    if not effective_date:
        return True
    if start and effective_date < start:
        return False
    if end and effective_date > end:
        return False
    return True


def rank_authority(
    *,
    authority: AuthorityRecord,
    priority_order: list[SourceType],
    query_text: str,
    issue_buckets: list[str],
    transaction_type: str | None,
    title_keywords: list[str],
    citation_keywords: list[str],
) -> float:
    score = authority.authority_weight

    bucket_terms: list[str] = []
    for bucket in issue_buckets:
        if bucket in authority.issue_buckets:
            score += 2.4
            bucket_terms.extend(BUCKET_CONTEXT_TERMS.get(bucket, []))
    if transaction_type and transaction_type.lower() in " ".join(authority.tags).lower():
        score += 0.6
    for tag in authority.tags:
        if tag.lower() in query_text:
            score += 0.35
    for term in bucket_terms:
        if term in query_text and any(term in item.lower() for item in authority.tags + [authority.title, authority.citation]):
            score += 0.55
    if title_keywords and keyword_match(title_keywords, authority.title):
        score += 0.5
    if citation_keywords and keyword_match(citation_keywords, authority.citation):
        score += 0.5
    if authority.title.lower() in query_text:
        score += 0.4
    if authority.citation.lower() in query_text:
        score += 0.4

    gating_terms = AUTHORITY_GATING_TERMS.get(authority.authority_id, [])
    if gating_terms:
        if any(term in query_text for term in gating_terms):
            score += 0.7
        else:
            score -= 1.2

    if any(bucket in issue_buckets for bucket in {"debt_overlay", "earnout_overlay", "merger_reorganization"}) and authority.authority_id in {"code-382", "reg-1-382", "notice-2003-65"}:
        score -= 1.0
    if "debt_overlay" in issue_buckets:
        financing_terms = ["debt", "financing", "refinancing", "interest", "leverage", "lender", "acquisition debt"]
        deferred_terms = ["earnout", "deferred", "seller note", "installment", "contingent", "imputed interest"]
        partnership_terms = ["partnership", "llc", "contribution", "disguised sale", "liability allocation", "leveraged distribution"]

        if authority.authority_id == "reg-1-707-3" and not any(
            term in query_text for term in partnership_terms
        ):
            score -= 2.4
        if authority.authority_id == "code-1274-483" and not any(
            term in query_text for term in deferred_terms
        ):
            score -= 1.9
        if authority.authority_id == "code-279" and not any(
            term in query_text for term in ["acquisition debt", "subordinated", "financing", "debt"]
        ):
            score -= 1.1
        if authority.authority_id == "reg-1-1001-3" and not any(
            term in query_text for term in ["refinancing", "debt modification", "amendment", "seller note"]
        ):
            score -= 1.1
        if authority.authority_id in {"code-163j", "notice-2018-28"} and any(
            term in query_text for term in financing_terms
        ):
            score += 0.45
        authority_text = " ".join(authority.tags + [authority.title, authority.citation]).lower()
        if authority.authority_id not in {"code-163j", "notice-2018-28", "code-1274-483", "code-279", "reg-1-1001-3"} and not any(
            term in authority_text for term in ["debt", "financing", "interest", "seller note", "leverage"]
        ):
            score -= 1.1
    if "rollover_equity" in issue_buckets:
        if authority.authority_id == "case-letulle" and not any(
            term in query_text for term in ["redemption", "preferred", "protection", "put", "fixed return", "debt-like"]
        ):
            score -= 0.6
        if authority.authority_id in {"reg-1-368-2k", "case-minnesota-tea"} and any(
            term in query_text for term in ["merger sub", "triangular", "mixed consideration", "rollover", "equity"]
        ):
            score += 0.45
    if "attribute_preservation" in issue_buckets:
        if authority.authority_id in {"code-383", "code-384"} and any(
            term in query_text for term in ["credit", "built-in gain", "asset sale", "attribute", "gain recognition"]
        ):
            score += 0.45
    if "state_overlay" in issue_buckets and authority.source_type in {"code", "regs"}:
        if not any(term in query_text for term in ["state", "transfer tax", "bulk sale", "apportionment"]):
            score -= 0.5

    if priority_order:
        try:
            rank = priority_order.index(authority.source_type)
            score += max(0.0, 1.2 - (rank * 0.15))
        except ValueError:
            score -= 0.2
    else:
        score += max(0.0, 1.0 - (SOURCE_PRIORITY[authority.source_type] * 0.1))

    if authority.source_type in PRIMARY_SUPPORT_TYPES:
        score += 0.45
    elif authority.source_type in SECONDARY_SUPPORT_TYPES:
        score -= 0.15
    elif authority.source_type in INTERNAL_ONLY_TYPES:
        score -= 0.5

    return round(max(score, 0.0), 3)
