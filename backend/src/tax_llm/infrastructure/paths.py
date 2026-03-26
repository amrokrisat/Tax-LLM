from __future__ import annotations

import os
from pathlib import Path


def backend_root() -> Path:
    env_root = os.getenv("TAX_LLM_BACKEND_ROOT")
    if env_root:
        candidate = Path(env_root).expanduser().resolve()
        if candidate.exists():
            return candidate

    cwd = Path.cwd().resolve()
    if (cwd / "data").exists() and (cwd / "pyproject.toml").exists():
        return cwd

    for candidate in Path(__file__).resolve().parents:
        if (candidate / "data").exists() and (candidate / "pyproject.toml").exists():
            return candidate

    return Path(__file__).resolve().parents[3]


def backend_data_path(*parts: str) -> Path:
    return backend_root().joinpath("data", *parts)
