"""SQLite connections, the schema, and its migrations (docs/api.md §2)."""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

# One entry per schema version, applied in order; never edit one that has shipped.
MIGRATIONS = [
    """
    CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
        failed_logins INTEGER NOT NULL DEFAULT 0,
        failed_since INTEGER,
        locked_until INTEGER,
        created_at INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        last_seen INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
    ) STRICT;
    CREATE INDEX sessions_by_user ON sessions (user_id);

    CREATE TABLE invites (
        token_hash TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('invite', 'reset')),
        username TEXT NOT NULL COLLATE NOCASE,
        user_id INTEGER REFERENCES users (id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER,
        CHECK ((kind = 'reset') = (user_id IS NOT NULL))
    ) STRICT;
    CREATE INDEX invites_by_username ON invites (username);

    CREATE TABLE settings (
        user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
        accent TEXT NOT NULL,
        daily_pick INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE plans (
        user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        section TEXT NOT NULL CHECK (section IN ('exercise', 'diet')),
        week TEXT NOT NULL,
        items_json TEXT NOT NULL,
        rev INTEGER NOT NULL CHECK (rev > 0),
        PRIMARY KEY (user_id, section, week)
    ) STRICT, WITHOUT ROWID;

    CREATE TABLE ticks (
        user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        section TEXT NOT NULL CHECK (section IN ('exercise', 'diet')),
        week TEXT NOT NULL,
        item_id TEXT NOT NULL,
        days INTEGER NOT NULL CHECK (days BETWEEN 0 AND 127),
        PRIMARY KEY (user_id, section, week, item_id)
    ) STRICT, WITHOUT ROWID;
    """,
]
SCHEMA_VERSION = len(MIGRATIONS)


def connect(path: Path) -> sqlite3.Connection:
    """A connection in autocommit mode: writes that must be atomic use `transaction`."""
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=5, autocommit=True, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn


@contextmanager
def transaction(conn: sqlite3.Connection) -> Iterator[sqlite3.Connection]:
    """BEGIN IMMEDIATE, so a read-check-write sequence holds the write lock from its first read."""
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except BaseException:
        conn.execute("ROLLBACK")
        raise
    conn.execute("COMMIT")


def migrate(conn: sqlite3.Connection) -> None:
    """Bring the schema to SCHEMA_VERSION; each step and its version bump commit together."""
    conn.execute("PRAGMA journal_mode = WAL")
    version: int = conn.execute("PRAGMA user_version").fetchone()[0]
    for number, script in enumerate(MIGRATIONS[version:], start=version + 1):
        try:
            conn.executescript(
                f"BEGIN IMMEDIATE; {script}; PRAGMA user_version = {number}; COMMIT;"
            )
        except BaseException:
            if conn.in_transaction:
                conn.execute("ROLLBACK")
            raise
