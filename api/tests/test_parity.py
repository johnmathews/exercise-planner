"""The shared fixtures through the Python port: what src/lib/__tests__/transfer.spec.ts runs."""

import json
from typing import Any

import pytest

from exercise_planner_api.validate import (
    ExportError,
    merge_settings,
    merge_summary,
    merge_tracked,
    parse_export,
)

from .fixtures import fixture_cases, read_fixture

PARSE = fixture_cases("parse")
MERGE = fixture_cases("merge")
SETTINGS = read_fixture("merge-settings.json")["cases"]


def run_parse(text: str) -> dict[str, Any]:
    try:
        return {"ok": True, "data": parse_export(text)}
    except ExportError as e:
        return {"ok": False, "error": e.code}


def test_finds_the_fixture_files() -> None:
    assert len(PARSE) >= 11
    assert len(MERGE) >= 5
    assert len(SETTINGS) >= 3


@pytest.mark.parametrize(("name", "case"), PARSE, ids=[n for n, _ in PARSE])
def test_parse(name: str, case: dict[str, Any]) -> None:
    text = case["inputText"] if "inputText" in case else json.dumps(case["input"])
    assert run_parse(text) == case["expected"]


@pytest.mark.parametrize(("name", "case"), MERGE, ids=[n for n, _ in MERGE])
def test_merge(name: str, case: dict[str, Any]) -> None:
    assert merge_tracked(case["existing"], case["incoming"]) == case["expected"]
    assert merge_summary(case["existing"], case["incoming"]) == case["summary"]


@pytest.mark.parametrize("case", SETTINGS, ids=[c["description"] for c in SETTINGS])
def test_merge_settings(case: dict[str, Any]) -> None:
    assert merge_settings(case["existing"], case["incoming"]) == case["expected"]


def test_sample_export_parses_to_itself() -> None:
    sample = read_fixture("sample/export.json")
    data = parse_export(json.dumps(sample))
    assert data == {k: sample[k] for k in ("exercise", "diet", "settings")}


def test_json_numbers_keep_their_type() -> None:
    """Whole numbers come back as int, so the API's JSON reads 12 rather than 12.0."""
    data = parse_export(json.dumps(read_fixture("sample/export.json")))
    squats = data["exercise"]["plans"]["2026-10-12"][2]
    assert squats["weight"] == 16
    assert type(squats["weight"]) is int


def test_merge_does_not_alias_its_inputs() -> None:
    incoming: Any = {
        "plans": {"2026-10-19": [{"id": "pu", "name": "Push-ups", "reps": 10, "target": 4}]},
        "log": {"2026-10-19": {"pu": [True, False, False, False, False, False, False]}},
    }
    merged = merge_tracked({"plans": {}, "log": {}}, incoming)
    merged["plans"]["2026-10-19"][0]["reps"] = 99
    merged["log"]["2026-10-19"]["pu"][1] = True
    assert incoming["plans"]["2026-10-19"][0]["reps"] == 10
    assert incoming["log"]["2026-10-19"]["pu"][1] is False
