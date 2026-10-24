import sqlite3
import threading
import time
from typing import Any

import pytest
from argon2 import PasswordHasher, profiles

from fitness_planner_api import auth
from fitness_planner_api.auth import AuthError
from fitness_planner_api.config import Config
from fitness_planner_api.db import connect

from .conftest import Clock

PASSWORD = "correct horse battery"
DAY = 86_400


def make_user(conn: sqlite3.Connection, config: Config, name: str = "alice") -> int:
    token = auth.mint_link(conn, config, "invite", name)
    return auth.redeem(conn, config, token, PASSWORD)


def test_production_hasher_uses_argon2_cffi_defaults() -> None:
    # The conftest swaps in a cheap hasher; the module's own default must be the RFC 9106 profile.
    fresh = PasswordHasher()
    assert fresh.memory_cost == profiles.RFC_9106_LOW_MEMORY.memory_cost == 65536
    assert auth.DEFAULT_HASHER.memory_cost == fresh.memory_cost
    assert auth.DEFAULT_HASHER.time_cost == fresh.time_cost


def test_hashing_runs_one_at_a_time(monkeypatch: pytest.MonkeyPatch) -> None:
    running = 0
    peak = 0
    lock = threading.Lock()

    class Slow:
        def hash(self, password: str) -> str:
            nonlocal running, peak
            with lock:
                running += 1
                peak = max(peak, running)
            time.sleep(0.02)
            with lock:
                running -= 1
            return "h"

    monkeypatch.setattr(auth, "HASHER", Slow())
    threads = [threading.Thread(target=auth.hash_password, args=("pw",)) for _ in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert peak == 1


def test_invite_then_login(conn: sqlite3.Connection, config: Config) -> None:
    uid = make_user(conn, config)
    assert auth.login(conn, config, "alice", PASSWORD) == uid
    assert auth.login(conn, config, "ALICE", PASSWORD) == uid  # usernames ignore case


@pytest.mark.parametrize(("name", "password"), [("alice", "wrong password!"), ("nobody", PASSWORD)])
def test_wrong_password_and_unknown_user_look_the_same(
    conn: sqlite3.Connection,
    config: Config,
    name: str,
    password: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    make_user(conn, config)
    verified: list[str] = []
    real = auth.verify_password

    def counting(password_hash: str, password: str) -> bool:
        verified.append(password_hash)
        return real(password_hash, password)

    monkeypatch.setattr(auth, "verify_password", counting)
    with pytest.raises(AuthError) as e:
        auth.login(conn, config, name, password)
    assert e.value.code == "invalid"
    assert len(verified) == 1  # an unknown user still costs one hash


def test_five_failures_lock_the_account_for_fifteen_minutes(
    conn: sqlite3.Connection, config: Config, clock: Clock
) -> None:
    make_user(conn, config)
    for _ in range(5):
        with pytest.raises(AuthError, match="invalid"):
            auth.login(conn, config, "alice", "wrong password!")
    with pytest.raises(AuthError) as e:
        auth.login(conn, config, "alice", PASSWORD)  # right password, still locked
    assert e.value.code == "locked"
    assert e.value.retry_after == 15 * 60
    clock.advance(15 * 60)
    assert auth.login(conn, config, "alice", PASSWORD)


def test_failures_older_than_the_window_do_not_count(
    conn: sqlite3.Connection, config: Config, clock: Clock
) -> None:
    make_user(conn, config)
    for _ in range(4):
        with pytest.raises(AuthError):
            auth.login(conn, config, "alice", "wrong password!")
    clock.advance(15 * 60 + 1)
    with pytest.raises(AuthError, match="invalid"):
        auth.login(conn, config, "alice", "wrong password!")
    assert auth.login(conn, config, "alice", PASSWORD)


def test_success_resets_the_failure_count(conn: sqlite3.Connection, config: Config) -> None:
    make_user(conn, config)
    for _ in range(4):
        with pytest.raises(AuthError):
            auth.login(conn, config, "alice", "wrong password!")
    auth.login(conn, config, "alice", PASSWORD)
    for _ in range(4):
        with pytest.raises(AuthError, match="invalid"):
            auth.login(conn, config, "alice", "wrong password!")
    assert auth.login(conn, config, "alice", PASSWORD)


def test_a_disabled_user_cannot_log_in_and_loses_sessions(
    conn: sqlite3.Connection, config: Config
) -> None:
    uid = make_user(conn, config)
    token = auth.create_session(conn, config, uid)
    auth.set_disabled(conn, "alice", True)
    assert auth.session_user(conn, config, token) is None
    with pytest.raises(AuthError, match="invalid"):
        auth.login(conn, config, "alice", PASSWORD)
    auth.set_disabled(conn, "alice", False)
    assert auth.login(conn, config, "alice", PASSWORD) == uid


def test_sessions_slide_and_expire(conn: sqlite3.Connection, config: Config, clock: Clock) -> None:
    uid = make_user(conn, config)
    token = auth.create_session(conn, config, uid)
    user = auth.session_user(conn, config, token)
    assert user is not None and (user.id, user.username, user.refreshed) == (uid, "alice", False)
    clock.advance(DAY + 1)
    user = auth.session_user(conn, config, token)
    assert user is not None and user.refreshed  # more than a day since the last refresh
    clock.advance(89 * DAY)
    assert (
        auth.session_user(conn, config, token) is not None
    )  # 90 days from the refresh, not the start
    clock.advance(90 * DAY)
    assert auth.session_user(conn, config, token) is None
    assert conn.execute("SELECT count(*) FROM sessions").fetchone()[0] == 0


def test_sessions_are_stored_hashed(conn: sqlite3.Connection, config: Config) -> None:
    uid = make_user(conn, config)
    token = auth.create_session(conn, config, uid)
    stored = [r[0] for r in conn.execute("SELECT token_hash FROM sessions")]
    assert token not in stored and stored == [auth.token_hash(token)]
    assert auth.session_user(conn, config, "not-a-token") is None


def test_ending_sessions(conn: sqlite3.Connection, config: Config) -> None:
    uid = make_user(conn, config)
    a, b = auth.create_session(conn, config, uid), auth.create_session(conn, config, uid)
    auth.end_session(conn, a)
    assert auth.session_user(conn, config, a) is None
    assert auth.session_user(conn, config, b) is not None
    assert auth.revoke_sessions(conn, "alice") == 1
    assert auth.session_user(conn, config, b) is None


def test_invite_links_are_single_use_and_expire(
    conn: sqlite3.Connection, config: Config, clock: Clock
) -> None:
    token = auth.mint_link(conn, config, "invite", "bob")
    assert auth.link_info(conn, config, token) == ("invite", "bob")
    auth.redeem(conn, config, token, PASSWORD)
    assert auth.link_info(conn, config, token) is None
    with pytest.raises(AuthError, match="gone"):
        auth.redeem(conn, config, token, PASSWORD)
    late = auth.mint_link(conn, config, "invite", "carol")
    clock.advance(7 * DAY)
    assert auth.link_info(conn, config, late) is None
    with pytest.raises(AuthError, match="gone"):
        auth.redeem(conn, config, late, PASSWORD)


def test_a_new_link_revokes_the_earlier_one(conn: sqlite3.Connection, config: Config) -> None:
    first = auth.mint_link(conn, config, "invite", "bob")
    second = auth.mint_link(conn, config, "invite", "Bob")
    assert auth.link_info(conn, config, first) is None
    assert auth.link_info(conn, config, second) == ("invite", "Bob")


def test_cannot_invite_an_existing_user_or_reset_a_missing_one(
    conn: sqlite3.Connection, config: Config
) -> None:
    make_user(conn, config)
    with pytest.raises(AuthError, match="exists"):
        auth.mint_link(conn, config, "invite", "Alice")
    with pytest.raises(AuthError, match="no-user"):
        auth.mint_link(conn, config, "reset", "nobody")


@pytest.mark.parametrize("name", ["", "a b", "x" * 33, "ál", "a/b"])
def test_usernames_are_short_and_plain(conn: sqlite3.Connection, config: Config, name: str) -> None:
    with pytest.raises(AuthError, match="username"):
        auth.mint_link(conn, config, "invite", name)


def test_reset_sets_the_password_ends_sessions_and_unlocks(
    conn: sqlite3.Connection, config: Config, clock: Clock
) -> None:
    uid = make_user(conn, config)
    session = auth.create_session(conn, config, uid)
    for _ in range(5):
        with pytest.raises(AuthError):
            auth.login(conn, config, "alice", "wrong password!")
    token = auth.mint_link(conn, config, "reset", "alice")
    assert auth.link_info(conn, config, token) == ("reset", "alice")
    assert auth.redeem(conn, config, token, "a brand new password") == uid
    assert auth.session_user(conn, config, session) is None
    assert auth.login(conn, config, "alice", "a brand new password") == uid
    with pytest.raises(AuthError, match="invalid"):
        auth.login(conn, config, "alice", PASSWORD)


def test_reset_links_last_a_day(conn: sqlite3.Connection, config: Config, clock: Clock) -> None:
    make_user(conn, config)
    token = auth.mint_link(conn, config, "reset", "alice")
    clock.advance(DAY - 1)
    assert auth.link_info(conn, config, token) is not None
    clock.advance(1)
    assert auth.link_info(conn, config, token) is None


@pytest.mark.parametrize("password", ["short", "x" * 9, "x" * 257])
def test_passwords_are_10_to_256_characters(
    conn: sqlite3.Connection, config: Config, password: str
) -> None:
    token = auth.mint_link(conn, config, "invite", "bob")
    with pytest.raises(AuthError, match="password"):
        auth.redeem(conn, config, token, password)
    assert auth.link_info(conn, config, token) is not None  # a rejected password keeps the link


def test_a_name_taken_after_the_invite_was_minted(conn: sqlite3.Connection, config: Config) -> None:
    token = auth.mint_link(conn, config, "invite", "bob")
    conn.execute("INSERT INTO users (username, password_hash, created_at) VALUES ('BOB', 'h', 0)")
    with pytest.raises(AuthError, match="exists"):
        auth.redeem(conn, config, token, PASSWORD)
    assert auth.link_info(conn, config, token) is not None  # rolled back, link still live


def test_two_redemptions_race_and_only_one_wins(conn: sqlite3.Connection, config: Config) -> None:
    token = auth.mint_link(conn, config, "invite", "bob")
    second = connect(config.db_path)
    results: list[Any] = []
    barrier = threading.Barrier(2)

    def go(c: sqlite3.Connection) -> None:
        barrier.wait()
        try:
            results.append(auth.redeem(c, config, token, PASSWORD))
        except AuthError as e:
            results.append(e.code)

    threads = [threading.Thread(target=go, args=(c,)) for c in (conn, second)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    second.close()
    assert sorted(map(str, results))[1] == "gone"
    assert conn.execute("SELECT count(*) FROM users").fetchone()[0] == 1


def test_a_lock_set_while_hashing_wins_over_a_correct_password(
    conn: sqlite3.Connection, config: Config, clock: Clock, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Requests already waiting for the hasher when a lock lands must not slip past or clear it."""
    make_user(conn, config)
    real = auth.verify_password

    def lock_meanwhile(password_hash: str, password: str) -> bool:
        conn.execute("UPDATE users SET locked_until = ?", (clock() + 900,))
        return real(password_hash, password)

    monkeypatch.setattr(auth, "verify_password", lock_meanwhile)
    with pytest.raises(AuthError) as e:
        auth.login(conn, config, "alice", PASSWORD)
    assert e.value.code == "locked"
    with pytest.raises(AuthError, match="locked"):
        auth.login(conn, config, "alice", "wrong password!")
    # Neither attempt cleared the lock or counted towards a new one.
    row = conn.execute("SELECT failed_logins, locked_until FROM users").fetchone()
    assert (row[0], row[1]) == (0, clock() + 900)


def test_logins_beyond_the_queue_are_turned_away(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth, "_WAITING", threading.BoundedSemaphore(1))
    assert auth._WAITING.acquire(blocking=False)
    try:
        with pytest.raises(AuthError) as e:
            auth.hash_password("pw")
        assert (e.value.code, e.value.retry_after) == ("busy", 1)
    finally:
        auth._WAITING.release()


def test_a_login_that_waits_too_long_for_the_hasher_is_turned_away(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(auth, "HASH_WAIT", 0.01)
    monkeypatch.setattr(auth, "_HASHING", threading.Semaphore(0))  # someone else is hashing
    with pytest.raises(AuthError, match="busy"):
        auth.verify_password("h", "pw")
    assert auth._WAITING.acquire(blocking=False)  # the queue slot was given back
    auth._WAITING.release()
