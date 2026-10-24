"""Passwords, lockout, sessions, and invite and reset links (docs/api.md §4)."""

import hashlib
import re
import secrets
import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Literal

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from .config import Config
from .db import transaction

#: argon2id at argon2-cffi's defaults (RFC 9106 low-memory: 64 MiB, 3 passes, parallelism 4).
DEFAULT_HASHER = PasswordHasher()
HASHER = DEFAULT_HASHER
# One hash at a time: each takes 64 MiB, and the container's memory limit is sized for one.
_HASHING = threading.Semaphore(1)
# Logins wait for the hasher on a worker thread. Bounding the queue and the wait keeps a flood of
# logins from occupying every thread the API has; the excess gets 503 `busy` instead.
MAX_WAITING = 8
HASH_WAIT = 5.0
_WAITING = threading.BoundedSemaphore(MAX_WAITING)

DAY = 86_400
MIN_PASSWORD, MAX_PASSWORD = 10, 256
USERNAME_RE = re.compile(r"[A-Za-z0-9_.-]{1,32}")

LinkKind = Literal["invite", "reset"]


class AuthError(Exception):
    """A refused auth step. `code` is what the API returns as `{"error": code}`."""

    def __init__(self, code: str, retry_after: int | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.retry_after = retry_after


@dataclass(frozen=True)
class SessionUser:
    id: int
    username: str
    #: True when this request moved the expiry forward, so the cookie should be sent again.
    refreshed: bool


@contextmanager
def _hashing() -> Iterator[None]:
    """Hold the hasher, or raise AuthError `busy` when the queue is full or the wait too long."""
    if not _WAITING.acquire(blocking=False):
        raise AuthError("busy", retry_after=1)
    try:
        if not _HASHING.acquire(timeout=HASH_WAIT):
            raise AuthError("busy", retry_after=1)
        try:
            yield
        finally:
            _HASHING.release()
    finally:
        _WAITING.release()


def hash_password(password: str) -> str:
    with _hashing():
        return HASHER.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    with _hashing():
        try:
            return HASHER.verify(password_hash, password)
        except (VerificationError, InvalidHashError):
            return False


_dummy_hash: str | None = None


def _dummy() -> str:
    """A real hash to verify against for unknown users, so they cost the same time."""
    global _dummy_hash
    if _dummy_hash is None:
        _dummy_hash = hash_password(secrets.token_urlsafe(16))
    return _dummy_hash


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def login(conn: sqlite3.Connection, config: Config, username: str, password: str) -> int:
    """The user's id, or AuthError `invalid` or `locked`."""
    now = config.clock()
    row = conn.execute(
        "SELECT id, password_hash, locked_until FROM users WHERE username = ?",
        (username,),
    ).fetchone()
    if row is None:
        verify_password(_dummy(), password)
        raise AuthError("invalid")
    if row["locked_until"] is not None and row["locked_until"] > now:
        raise AuthError("locked", retry_after=row["locked_until"] - now)
    # Verify outside any transaction: a hash takes long enough that holding the lock would block.
    ok = verify_password(row["password_hash"], password)
    window = config.lockout_minutes * 60
    with transaction(conn):
        # Read again under the write lock: a lock set by requests that finished while this one
        # waited for the hasher must hold, or a burst of parallel guesses would get around it.
        fresh = conn.execute(
            "SELECT disabled, failed_logins, failed_since, locked_until FROM users WHERE id = ?",
            (row["id"],),
        ).fetchone()
        if fresh["locked_until"] is not None and fresh["locked_until"] > now:
            raise AuthError("locked", retry_after=fresh["locked_until"] - now)
        if ok and not fresh["disabled"]:
            conn.execute(
                "UPDATE users SET failed_logins = 0, failed_since = NULL, locked_until = NULL"
                " WHERE id = ?",
                (row["id"],),
            )
            return int(row["id"])
        stale = fresh["failed_since"] is None or now - fresh["failed_since"] >= window
        failures = 1 if stale else fresh["failed_logins"] + 1
        since = now if stale else fresh["failed_since"]
        if failures >= config.lockout_attempts:
            conn.execute(
                "UPDATE users SET failed_logins = 0, failed_since = NULL, locked_until = ?"
                " WHERE id = ?",
                (now + window, row["id"]),
            )
        else:
            conn.execute(
                "UPDATE users SET failed_logins = ?, failed_since = ? WHERE id = ?",
                (failures, since, row["id"]),
            )
    raise AuthError("invalid")


def create_session(conn: sqlite3.Connection, config: Config, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    now = config.clock()
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, created_at, last_seen, expires_at)"
        " VALUES (?, ?, ?, ?, ?)",
        (token_hash(token), user_id, now, now, now + config.session_days * DAY),
    )
    return token


def session_user(conn: sqlite3.Connection, config: Config, token: str) -> SessionUser | None:
    """The session's user, sliding its expiry when the last refresh is over a day old."""
    now = config.clock()
    th = token_hash(token)
    row = conn.execute(
        "SELECT s.user_id, s.last_seen, s.expires_at, u.username, u.disabled"
        " FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?",
        (th,),
    ).fetchone()
    if row is None:
        return None
    if row["expires_at"] <= now or row["disabled"]:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (th,))
        return None
    refreshed = now - row["last_seen"] > DAY
    if refreshed:
        conn.execute(
            "UPDATE sessions SET last_seen = ?, expires_at = ? WHERE token_hash = ?",
            (now, now + config.session_days * DAY, th),
        )
    return SessionUser(int(row["user_id"]), row["username"], refreshed)


def end_session(conn: sqlite3.Connection, token: str) -> None:
    conn.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(token),))


def _user_id(conn: sqlite3.Connection, username: str) -> int:
    row = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if row is None:
        raise AuthError("no-user")
    return int(row["id"])


def revoke_sessions(conn: sqlite3.Connection, username: str) -> int:
    """End every session of the user; returns how many there were."""
    cur = conn.execute("DELETE FROM sessions WHERE user_id = ?", (_user_id(conn, username),))
    return cur.rowcount


def set_disabled(conn: sqlite3.Connection, username: str, disabled: bool) -> None:
    uid = _user_id(conn, username)
    with transaction(conn):
        conn.execute("UPDATE users SET disabled = ? WHERE id = ?", (int(disabled), uid))
        if disabled:
            conn.execute("DELETE FROM sessions WHERE user_id = ?", (uid,))


def mint_link(conn: sqlite3.Connection, config: Config, kind: LinkKind, username: str) -> str:
    """A new invite or reset token; earlier unused links of that kind for the name stop working."""
    if not USERNAME_RE.fullmatch(username):
        raise AuthError("username")
    now = config.clock()
    with transaction(conn):
        existing = conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
        if kind == "invite" and existing is not None:
            raise AuthError("exists")
        if kind == "reset" and existing is None:
            raise AuthError("no-user")
        conn.execute(
            "DELETE FROM invites WHERE username = ? AND kind = ? AND used_at IS NULL",
            (username, kind),
        )
        token = secrets.token_urlsafe(32)
        lifetime = config.invite_days * DAY if kind == "invite" else config.reset_hours * 3600
        conn.execute(
            "INSERT INTO invites (token_hash, kind, username, user_id, created_at, expires_at)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (
                token_hash(token),
                kind,
                username,
                existing["id"] if existing else None,
                now,
                now + lifetime,
            ),
        )
    return token


_LIVE_LINK = (
    "SELECT kind, username, user_id FROM invites"
    " WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?"
)


def link_info(conn: sqlite3.Connection, config: Config, token: str) -> tuple[LinkKind, str] | None:
    row = conn.execute(_LIVE_LINK, (token_hash(token), config.clock())).fetchone()
    return None if row is None else (row["kind"], row["username"])


def redeem(conn: sqlite3.Connection, config: Config, token: str, password: str) -> int:
    """Set the password for an invite or reset link, consuming it; returns the user's id."""
    if not MIN_PASSWORD <= len(password) <= MAX_PASSWORD:
        raise AuthError("password")
    if link_info(conn, config, token) is None:
        raise AuthError("gone")
    password_hash = hash_password(password)
    now = config.clock()
    th = token_hash(token)
    with transaction(conn):
        # Checked again under the write lock: two redemptions of one link must not both succeed.
        row = conn.execute(_LIVE_LINK, (th, now)).fetchone()
        if row is None:
            raise AuthError("gone")
        conn.execute("UPDATE invites SET used_at = ? WHERE token_hash = ?", (now, th))
        if row["kind"] == "invite":
            try:
                cur = conn.execute(
                    "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
                    (row["username"], password_hash, now),
                )
            except sqlite3.IntegrityError:
                raise AuthError("exists") from None
            return int(cur.lastrowid or 0)
        uid = int(row["user_id"])
        conn.execute(
            "UPDATE users SET password_hash = ?, failed_logins = 0, failed_since = NULL,"
            " locked_until = NULL WHERE id = ?",
            (password_hash, uid),
        )
        conn.execute("DELETE FROM sessions WHERE user_id = ?", (uid,))
        return uid
