import sqlite3
from pathlib import Path

import pytest

from exercise_planner_api.db import SCHEMA_VERSION, connect, migrate, transaction


def test_migrates_a_fresh_database_once(tmp_path: Path) -> None:
    c = connect(tmp_path / "f.db")
    migrate(c)
    migrate(c)  # a second run is a no-op
    assert c.execute("PRAGMA user_version").fetchone()[0] == SCHEMA_VERSION
    tables = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert {"users", "sessions", "invites", "settings", "plans", "ticks"} <= tables
    c.close()


def test_connections_use_wal_and_foreign_keys(tmp_path: Path) -> None:
    c = connect(tmp_path / "f.db")
    migrate(c)
    assert c.execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    assert c.execute("PRAGMA foreign_keys").fetchone()[0] == 1
    c.close()


def test_deleting_a_user_cascades_to_their_rows(conn: sqlite3.Connection) -> None:
    conn.execute(
        "INSERT INTO users (id, username, password_hash, created_at) VALUES (1, 'a', 'h', 0)"
    )
    conn.execute("INSERT INTO settings VALUES (1, '#30d158', 3)")
    conn.execute("INSERT INTO plans VALUES (1, 'exercise', '2026-10-19', '[]', 1)")
    conn.execute("INSERT INTO ticks VALUES (1, 'diet', '2026-10-19', 'veg', 5)")
    conn.execute("INSERT INTO sessions VALUES ('t', 1, 0, 0, 0)")
    conn.execute("DELETE FROM users WHERE id = 1")
    for table in ("settings", "plans", "ticks", "sessions"):
        assert conn.execute(f"SELECT count(*) FROM {table}").fetchone()[0] == 0  # noqa: S608


def test_constraints_reject_bad_rows(conn: sqlite3.Connection) -> None:
    conn.execute(
        "INSERT INTO users (id, username, password_hash, created_at) VALUES (1, 'Ann', 'h', 0)"
    )
    bad = [
        # Usernames are unique regardless of case.
        "INSERT INTO users (username, password_hash, created_at) VALUES ('ann', 'h', 0)",
        "INSERT INTO plans VALUES (1, 'other', '2026-10-19', '[]', 1)",
        "INSERT INTO plans VALUES (1, 'exercise', '2026-10-19', '[]', 0)",
        "INSERT INTO ticks VALUES (1, 'diet', '2026-10-19', 'veg', 128)",
        "INSERT INTO ticks VALUES (2, 'diet', '2026-10-19', 'veg', 1)",  # no such user
        # A reset link names its user; an invite does not.
        "INSERT INTO invites VALUES ('t', 'reset', 'Ann', NULL, 0, 0, NULL)",
        "INSERT INTO invites VALUES ('t', 'invite', 'bob', 1, 0, 0, NULL)",
    ]
    for sql in bad:
        with pytest.raises(sqlite3.IntegrityError):
            conn.execute(sql)


def test_transaction_commits_or_rolls_back(conn: sqlite3.Connection) -> None:
    with transaction(conn):
        conn.execute("INSERT INTO users (username, password_hash, created_at) VALUES ('a', 'h', 0)")
    with pytest.raises(RuntimeError), transaction(conn):
        conn.execute("INSERT INTO users (username, password_hash, created_at) VALUES ('b', 'h', 0)")
        raise RuntimeError
    assert [r[0] for r in conn.execute("SELECT username FROM users")] == ["a"]


def test_a_failed_migration_leaves_the_version(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from exercise_planner_api import db

    c = connect(tmp_path / "f.db")
    monkeypatch.setattr(db, "MIGRATIONS", ["CREATE TABLE a (x); CREATE TABLE a (x);"])
    with pytest.raises(sqlite3.OperationalError):
        db.migrate(c)
    assert c.execute("PRAGMA user_version").fetchone()[0] == 0
    assert c.execute("SELECT count(*) FROM sqlite_master WHERE name = 'a'").fetchone()[0] == 0
    c.close()
