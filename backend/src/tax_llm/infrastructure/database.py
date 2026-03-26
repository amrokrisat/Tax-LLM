from __future__ import annotations

import sqlite3
from pathlib import Path

from tax_llm.infrastructure.paths import backend_data_path


def resolve_db_path(base_dir: Path | None = None) -> Path:
    if base_dir is None:
        return backend_data_path("tax_llm.db")
    if base_dir.suffix == ".db":
        base_dir.parent.mkdir(parents=True, exist_ok=True)
        return base_dir
    base_dir.mkdir(parents=True, exist_ok=True)
    return base_dir / "tax_llm.db"


def connect_db(db_path: Path) -> sqlite3.Connection:
    connection = sqlite3.connect(db_path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection

