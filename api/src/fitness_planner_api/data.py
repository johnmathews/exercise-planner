"""A user's plans, ticks and settings: reads, writes, import and export (docs/api.md §3)."""

import json
import sqlite3
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, TypedDict

from .db import transaction
from .validate import (
    EXPORT_FORMAT,
    EXPORT_VERSION,
    SECTIONS,
    ExportData,
    Item,
    Portable,
    Section,
    Tracked,
    days_to_mask,
    mask_to_days,
    merge_summary,
    normalise_items,
    normalise_portable,
)


class ImportResult(TypedDict):
    weeks: int
    ticks: int
    settings: bool


@dataclass(frozen=True)
class PlanSaved:
    rev: int


@dataclass(frozen=True)
class PlanConflict:
    #: The server's copy; None when the server has no plan for the week.
    items: list[Item] | None
    rev: int


def load_tracked(conn: sqlite3.Connection, user_id: int, section: Section) -> Tracked:
    plans = {
        r["week"]: json.loads(r["items_json"])
        for r in conn.execute(
            "SELECT week, items_json FROM plans WHERE user_id = ? AND section = ? ORDER BY week",
            (user_id, section),
        )
    }
    log: dict[str, dict[str, list[bool]]] = {}
    for r in conn.execute(
        "SELECT week, item_id, days FROM ticks WHERE user_id = ? AND section = ? ORDER BY week",
        (user_id, section),
    ):
        log.setdefault(r["week"], {})[r["item_id"]] = mask_to_days(r["days"])
    return {"plans": plans, "log": log}


def load_settings(conn: sqlite3.Connection, user_id: int) -> Portable | None:
    row = conn.execute(
        "SELECT accent, daily_pick FROM settings WHERE user_id = ?", (user_id,)
    ).fetchone()
    return None if row is None else {"accent": row["accent"], "dailyPick": row["daily_pick"]}


def state(conn: sqlite3.Connection, user_id: int) -> dict[str, Any]:
    """Everything the client renders: each section's plans, log and plan revisions, and settings."""
    out: dict[str, Any] = {}
    for section in SECTIONS:
        tracked = load_tracked(conn, user_id, section)
        revs = {
            r["week"]: r["rev"]
            for r in conn.execute(
                "SELECT week, rev FROM plans WHERE user_id = ? AND section = ?", (user_id, section)
            )
        }
        out[section] = {**tracked, "revs": revs}
    out["settings"] = load_settings(conn, user_id)
    return out


def put_plan(
    conn: sqlite3.Connection,
    user_id: int,
    section: Section,
    week: str,
    raw_items: list[Any],
    rev: int,
) -> PlanSaved | PlanConflict:
    """Store a week's plan if `rev` is current. A stale `rev` conflicts unless the items match."""
    items = normalise_items(section, raw_items)
    with transaction(conn):
        row = conn.execute(
            "SELECT items_json, rev FROM plans WHERE user_id = ? AND section = ? AND week = ?",
            (user_id, section, week),
        ).fetchone()
        current = 0 if row is None else int(row["rev"])
        if rev == current:
            conn.execute(
                "INSERT INTO plans (user_id, section, week, items_json, rev) VALUES (?, ?, ?, ?, ?)"
                " ON CONFLICT (user_id, section, week)"
                " DO UPDATE SET items_json = excluded.items_json, rev = excluded.rev",
                (user_id, section, week, json.dumps(items), current + 1),
            )
            return PlanSaved(current + 1)
        stored = None if row is None else json.loads(row["items_json"])
        # Two devices creating the same carried-forward week send identical items: not a conflict.
        if stored is not None and stored == items:
            return PlanSaved(current)
        return PlanConflict(stored, current)


def set_tick(
    conn: sqlite3.Connection,
    user_id: int,
    section: Section,
    week: str,
    item_id: str,
    day: int,
    done: bool,
) -> list[bool]:
    """Set or clear one day for one item, in one statement; returns the item's seven flags."""
    bit = 1 << day
    row = conn.execute(
        "INSERT INTO ticks (user_id, section, week, item_id, days) VALUES (?, ?, ?, ?, ?)"
        " ON CONFLICT (user_id, section, week, item_id)"
        " DO UPDATE SET days = CASE WHEN ? THEN days | ? ELSE days & ~? END"
        " RETURNING days",
        (user_id, section, week, item_id, bit if done else 0, done, bit, bit),
    ).fetchone()
    return mask_to_days(int(row["days"]))


def put_settings(conn: sqlite3.Connection, user_id: int, raw: dict[str, Any]) -> Portable:
    settings = normalise_portable(raw)
    conn.execute(
        "INSERT INTO settings (user_id, accent, daily_pick) VALUES (?, ?, ?)"
        " ON CONFLICT (user_id) DO UPDATE"
        " SET accent = excluded.accent, daily_pick = excluded.daily_pick",
        (user_id, settings["accent"], settings["dailyPick"]),
    )
    return settings


def export_file(conn: sqlite3.Connection, user_id: int, now: int) -> dict[str, Any]:
    """The same file Settings → Export writes in the browser."""
    settings = load_settings(conn, user_id)
    return {
        "format": EXPORT_FORMAT,
        "version": EXPORT_VERSION,
        # JavaScript's toISOString shape, milliseconds included.
        "exportedAt": datetime.fromtimestamp(now, UTC).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "exercise": load_tracked(conn, user_id, "exercise"),
        "diet": load_tracked(conn, user_id, "diet"),
        "settings": settings,
    }


def import_data(conn: sqlite3.Connection, user_id: int, data: ExportData) -> ImportResult:
    """Merge a parsed export in, never deleting (architecture.md §4); returns what it added."""
    weeks = ticks = 0
    with transaction(conn):
        for section in SECTIONS:
            incoming = data[section]
            existing = load_tracked(conn, user_id, section)
            summary = merge_summary(existing, incoming)
            weeks += summary["weeks"]
            ticks += summary["ticks"]
            for week, items in incoming["plans"].items():
                if week not in existing["plans"]:
                    conn.execute(
                        "INSERT INTO plans (user_id, section, week, items_json, rev)"
                        " VALUES (?, ?, ?, ?, 1)",
                        (user_id, section, week, json.dumps(items)),
                    )
            for week, entries in incoming["log"].items():
                for item_id, days in entries.items():
                    # An all-false row is kept too, so an export of the result matches the file.
                    conn.execute(
                        "INSERT INTO ticks (user_id, section, week, item_id, days)"
                        " VALUES (?, ?, ?, ?, ?) ON CONFLICT (user_id, section, week, item_id)"
                        " DO UPDATE SET days = days | excluded.days",
                        (user_id, section, week, item_id, days_to_mask(days)),
                    )
        applied = False
        if data["settings"] is not None and load_settings(conn, user_id) is None:
            put_settings(conn, user_id, dict(data["settings"]))
            applied = True
    return {"weeks": weeks, "ticks": ticks, "settings": applied}
