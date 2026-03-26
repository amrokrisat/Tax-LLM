from __future__ import annotations

from pathlib import Path


def backend_root() -> Path:
    return Path(__file__).resolve().parents[3]


def backend_data_path(*parts: str) -> Path:
    return backend_root().joinpath("data", *parts)
