from __future__ import annotations

import json

from tax_llm.infrastructure.public_ingestion import ingest_public_authorities


def main() -> None:
    manifest = ingest_public_authorities()
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
