from pathlib import Path

from tax_llm.infrastructure.paths import backend_root


def test_backend_root_resolves_to_project_root():
    root = backend_root()

    assert (root / "pyproject.toml").exists()
    assert (root / "data").exists()
    assert (root / "data" / "seed" / "demo_scenario.json").exists()
