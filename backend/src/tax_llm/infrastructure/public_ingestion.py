from __future__ import annotations

import hashlib
import json
import re
import urllib.request
from dataclasses import dataclass
from datetime import UTC, datetime
from html import unescape
from pathlib import Path
from typing import Literal

from tax_llm.infrastructure.corpus import SOURCE_DIRECTORIES
from tax_llm.infrastructure.paths import backend_data_path

NormalizationMode = Literal["html_text", "manual_text", "metadata_only"]


@dataclass(frozen=True)
class IngestionEntry:
    authority_id: str
    target_source_type: str
    target_path: str
    title: str
    citation: str
    issue_buckets: list[str]
    jurisdiction: str
    effective_date: str
    authority_weight: float
    source_url: str
    source_quality: str
    tags: list[str]
    body: str
    normalization_mode: NormalizationMode = "manual_text"


def default_manifest_path() -> Path:
    return backend_data_path("ingestion", "transactional_tax_wedge_v1.json")


def default_output_manifest_path() -> Path:
    return backend_data_path("corpus", "manifests", "transactional_tax_wedge_v1_manifest.json")


def load_manifest(path: Path | None = None) -> list[IngestionEntry]:
    manifest_path = path or default_manifest_path()
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    return [IngestionEntry(**entry) for entry in payload["entries"]]


def ingest_public_authorities(
    manifest_path: Path | None = None,
    output_manifest_path: Path | None = None,
) -> dict:
    entries = load_manifest(manifest_path)
    written: list[dict[str, str]] = []

    for entry in entries:
        target = backend_data_path("corpus", SOURCE_DIRECTORIES[entry.target_source_type], entry.target_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        content = render_entry(entry)
        target.write_text(content, encoding="utf-8")
        written.append(
            {
                "authority_id": entry.authority_id,
                "target_path": str(target),
                "source_url": entry.source_url,
                "sha256": hashlib.sha256(content.encode("utf-8")).hexdigest(),
                "ingested_at": current_timestamp(),
            }
        )

    manifest = {
        "pack_name": "transactional_tax_wedge_v1",
        "generated_at": current_timestamp(),
        "entries": written,
    }
    manifest_target = output_manifest_path or default_output_manifest_path()
    manifest_target.parent.mkdir(parents=True, exist_ok=True)
    manifest_target.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def render_entry(entry: IngestionEntry) -> str:
    metadata = {
        "authority_id": entry.authority_id,
        "title": entry.title,
        "citation": entry.citation,
        "issue_buckets": entry.issue_buckets,
        "jurisdiction": entry.jurisdiction,
        "effective_date": entry.effective_date,
        "authority_weight": entry.authority_weight,
        "source_url": entry.source_url,
        "ingestion_timestamp": current_timestamp(),
        "primary_authority": entry.source_quality == "primary_authority",
        "secondary_authority": entry.source_quality == "secondary_authority",
        "internal_only": entry.source_quality == "internal_only",
        "tags": entry.tags,
    }
    body = entry.body
    if entry.normalization_mode == "html_text":
        fetched = fetch_text(entry.source_url)
        body = normalize_html_text(fetched)
    elif entry.normalization_mode == "metadata_only":
        body = (
            "Source captured for provenance, but text normalization still requires a manual pass. "
            + entry.body
        )
    return front_matter(metadata) + "\n" + body.strip() + "\n"


def fetch_text(url: str) -> str:
    with urllib.request.urlopen(url, timeout=30) as response:
        return response.read().decode("utf-8", errors="ignore")


def normalize_html_text(raw_html: str) -> str:
    stripped = re.sub(r"<script.*?</script>", " ", raw_html, flags=re.DOTALL | re.IGNORECASE)
    stripped = re.sub(r"<style.*?</style>", " ", stripped, flags=re.DOTALL | re.IGNORECASE)
    stripped = re.sub(r"<[^>]+>", " ", stripped)
    return " ".join(unescape(stripped).split())


def front_matter(metadata: dict) -> str:
    lines = ["---"]
    for key, value in metadata.items():
        if isinstance(value, list):
            joined = ", ".join(str(item) for item in value)
            lines.append(f"{key}: [{joined}]")
        elif isinstance(value, bool):
            lines.append(f"{key}: {'true' if value else 'false'}")
        else:
            lines.append(f"{key}: {value}")
    lines.append("---")
    return "\n".join(lines)


def current_timestamp() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()
