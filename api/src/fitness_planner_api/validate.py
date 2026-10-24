"""The port of src/lib/storage.ts's normalisers and src/lib/transfer.ts's parse and merge rules.

Each function mirrors its TypeScript namesake. Where Python's defaults differ from JavaScript's,
the code follows JavaScript: halves round up (`Math.round`), `True` is not a number, `NaN` is not
JSON, and week keys need ASCII digits with nothing after them. `tests/test_parity.py` runs the
shared fixtures in `fixtures/transfer/` to keep the two in step.
"""

import copy
import json
import math
import re
import sys
from typing import Any, Literal, TypedDict

EXPORT_FORMAT = "fitness-planner-export"
#: Files exported before the app was renamed carry this format; they import as if current.
OLD_EXPORT_FORMAT = "exercise-planner-export"
EXPORT_VERSION = 1

MIN_TARGET, MAX_TARGET = 0, 7
MIN_DAILY_PICK, MAX_DAILY_PICK = 1, 8
NEW_EXERCISE_TARGET = 3
NEW_FOOD_TARGET = 3
MAX_WEIGHT = 500
MAX_SETS = 20
DEFAULT_ACCENT = "#30d158"
DEFAULT_DAILY_PICK = 3

Section = Literal["exercise", "diet"]
SECTIONS: tuple[Section, ...] = ("exercise", "diet")

# `[0-9]` rather than `\d`, which in Python also matches non-ASCII digits; fullmatch rather than
# `$`, which in Python also matches before a trailing newline.
WEEK_RE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
ACCENT_RE = re.compile(r"#[0-9a-fA-F]{6}")

type Item = dict[str, Any]
type Plans = dict[str, list[Item]]
type Log = dict[str, dict[str, list[bool]]]


class Tracked(TypedDict):
    plans: Plans
    log: Log


class Portable(TypedDict):
    """The settings that belong to the person rather than the device: everything but the theme."""

    accent: str
    dailyPick: int


class ExportData(TypedDict):
    exercise: Tracked
    diet: Tracked
    settings: Portable | None


class Summary(TypedDict):
    weeks: int
    ticks: int


class ExportError(ValueError):
    """An export file rejected whole: `code` is `json`, `format` or `version`."""

    def __init__(self, code: Literal["json", "format", "version"]) -> None:
        super().__init__(code)
        self.code = code


def as_number(v: object) -> float | None:
    """What JavaScript's JSON.parse makes of `v`, when that is a finite number; else None.

    JavaScript has one number type: an integer past a double's range parses as Infinity, and a
    large one rounds to the nearest double. `bool` is not a number.
    """
    if isinstance(v, bool) or not isinstance(v, int | float):
        return None
    if isinstance(v, int):
        if abs(v) > sys.float_info.max:
            return None
        v = float(v)
    return v if math.isfinite(v) else None


def js_round(x: float) -> int:
    """`Math.round`: halves go up (2.5 → 3, -2.5 → -2), not to even as `round()` does."""
    floor = math.floor(x)
    return floor + 1 if x - floor >= 0.5 else floor


def to_int(v: object, fallback: int) -> int:
    n = as_number(v)
    return fallback if n is None else js_round(n)


def clamp(n: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, n))


def whole(x: float) -> int | float:
    """12.0 → 12, so JSON output matches JavaScript's (which has one number type)."""
    return int(x) if x.is_integer() else x


def normalise_weight(v: object) -> int | float | None:
    """A usable weight in kg, rounded to 2 decimals and capped; None means "no weight"."""
    n = as_number(v)
    if n is None:
        return None
    scaled = n * 100
    # Scaling can overflow to ±Infinity, which Math.round passes through and the cap then catches.
    kg = js_round(scaled) / 100 if math.isfinite(scaled) else scaled
    return whole(min(MAX_WEIGHT, kg)) if kg > 0 else None


def normalise_exercise(v: object) -> Item | None:
    if (
        not isinstance(v, dict)
        or not isinstance(v.get("id"), str)
        or not isinstance(v.get("name"), str)
    ):
        return None
    out: Item = {"id": v["id"], "name": v["name"]}
    sets = to_int(v.get("sets"), 0)
    if sets > 0:
        out["sets"] = min(MAX_SETS, sets)
    out["reps"] = max(0, to_int(v.get("reps"), 0))
    if isinstance(v.get("perSide"), bool):
        out["perSide"] = v["perSide"]
    weight = normalise_weight(v.get("weight"))
    if weight is not None:
        out["weight"] = weight
    out["target"] = clamp(to_int(v.get("target"), NEW_EXERCISE_TARGET), MIN_TARGET, MAX_TARGET)
    return out


def normalise_food(v: object) -> Item | None:
    if (
        not isinstance(v, dict)
        or not isinstance(v.get("id"), str)
        or not isinstance(v.get("name"), str)
    ):
        return None
    target = clamp(to_int(v.get("target"), NEW_FOOD_TARGET), MIN_TARGET, MAX_TARGET)
    return {"id": v["id"], "name": v["name"], "target": target}


NORMALISERS = {"exercise": normalise_exercise, "diet": normalise_food}


def is_week(key: str) -> bool:
    return WEEK_RE.fullmatch(key) is not None


def normalise_days(v: list[Any]) -> list[bool]:
    """Exactly seven flags; only a literal `true` ticks a day."""
    return [i < len(v) and v[i] is True for i in range(7)]


def normalise_log(v: object) -> Log:
    log: Log = {}
    if not isinstance(v, dict):
        return log
    for week, entries in v.items():
        if not is_week(week) or not isinstance(entries, dict):
            continue
        # JavaScript drops a `__proto__` entry: assigning it sets the object's prototype instead.
        log[week] = {
            i: normalise_days(d)
            for i, d in entries.items()
            if isinstance(d, list) and i != "__proto__"
        }
    return log


def normalise_items(section: Section, v: list[Any]) -> list[Item]:
    """A plan's items, dropping any that fail validation."""
    normalise = NORMALISERS[section]
    return [it for it in map(normalise, v) if it is not None]


def normalise_plans(section: Section, v: object) -> Plans:
    plans: Plans = {}
    if not isinstance(v, dict):
        return plans
    for week, items in v.items():
        if is_week(week) and isinstance(items, list):
            plans[week] = normalise_items(section, items)
    return plans


def normalise_portable(v: dict[str, Any]) -> Portable:
    accent = v.get("accent")
    return {
        "accent": accent
        if isinstance(accent, str) and ACCENT_RE.fullmatch(accent)
        else DEFAULT_ACCENT,
        "dailyPick": clamp(
            to_int(v.get("dailyPick"), DEFAULT_DAILY_PICK), MIN_DAILY_PICK, MAX_DAILY_PICK
        ),
    }


def _reject_constant(name: str) -> None:
    raise ValueError(name)


def parse_json(text: str) -> object:
    """`JSON.parse`, which has no NaN or Infinity; None for anything that is not JSON.

    Two cases differ from JavaScript on purpose. Nesting deep enough to exhaust Python's recursion
    limit, which no export comes near, and strings holding a lone surrogate (`"\\ud800"`), which
    SQLite cannot store as UTF-8, both count as not JSON.
    """
    try:
        parsed = json.loads(text, parse_constant=_reject_constant)
        json.dumps(parsed, ensure_ascii=False).encode("utf-8")
    except (ValueError, RecursionError):
        return None
    return parsed


def section(name: Section, v: object) -> Tracked:
    if not isinstance(v, dict):
        return {"plans": {}, "log": {}}
    return {"plans": normalise_plans(name, v.get("plans")), "log": normalise_log(v.get("log"))}


def parse_export(text: str) -> ExportData:
    """Read an export file, or raise ExportError. Valid files normalise like stored data."""
    parsed = parse_json(text)
    if parsed is None:
        raise ExportError("json")
    if not isinstance(parsed, dict):
        raise ExportError("format")
    if parsed.get("format") not in (EXPORT_FORMAT, OLD_EXPORT_FORMAT):
        raise ExportError("format")
    if as_number(parsed.get("version")) != EXPORT_VERSION:
        raise ExportError("version")
    settings = parsed.get("settings")
    return {
        "exercise": section("exercise", parsed.get("exercise")),
        "diet": section("diet", parsed.get("diet")),
        "settings": normalise_portable(settings) if isinstance(settings, dict) else None,
    }


NO_DAYS = [False] * 7


def merge_tracked(existing: Tracked, incoming: Tracked) -> Tracked:
    """Merge without deleting: existing weeks keep their plan, ticks are OR-ed. New objects."""
    plans = copy.deepcopy(existing["plans"])
    for week, items in incoming["plans"].items():
        if week not in plans:
            plans[week] = copy.deepcopy(items)
    log: Log = {}
    for week in {**existing["log"], **incoming["log"]}:
        mine = existing["log"].get(week, {})
        theirs = incoming["log"].get(week, {})
        log[week] = {
            i: [
                a is True or b is True
                for a, b in zip(mine.get(i, NO_DAYS), theirs.get(i, NO_DAYS), strict=True)
            ]
            for i in {**mine, **theirs}
        }
    return {"plans": plans, "log": log}


def merge_summary(existing: Tracked, incoming: Tracked) -> Summary:
    """What a merge would add: weeks that gain a plan, and day cells that gain a tick."""
    weeks = sum(1 for w in incoming["plans"] if w not in existing["plans"])
    ticks = 0
    for week, entries in incoming["log"].items():
        for item_id, days in entries.items():
            mine = existing["log"].get(week, {}).get(item_id, NO_DAYS)
            ticks += sum(1 for i, on in enumerate(days) if on and not mine[i])
    return {"weeks": weeks, "ticks": ticks}


def merge_settings(existing: Portable | None, incoming: Portable | None) -> Portable | None:
    """Saved settings win; the file's apply only where none are saved."""
    return existing if existing is not None else incoming


def days_to_mask(days: list[bool]) -> int:
    """Seven flags as a 7-bit mask, Monday in bit 0."""
    return sum(1 << i for i, on in enumerate(days[:7]) if on)


def mask_to_days(mask: int) -> list[bool]:
    return [bool(mask >> i & 1) for i in range(7)]
