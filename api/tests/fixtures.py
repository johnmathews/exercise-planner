"""Readers for the shared fixtures in the repo's fixtures/transfer/, which Vitest runs too."""

import json
from pathlib import Path
from typing import Any

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "transfer"


def read_fixture(path: str) -> Any:
    """A fixture file by its path under fixtures/transfer/."""
    return json.loads((FIXTURES / path).read_text(encoding="utf-8"))


def fixture_cases(directory: str) -> list[tuple[str, Any]]:
    """Every .json file in a fixture directory, sorted, as (filename, contents)."""
    return [
        (p.name, read_fixture(f"{directory}/{p.name}"))
        for p in sorted((FIXTURES / directory).glob("*.json"))
    ]
