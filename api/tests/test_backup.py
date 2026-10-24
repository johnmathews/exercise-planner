import sqlite3
import time
from pathlib import Path

import pytest

from exercise_planner_api.backup import BackupThread, backup_once
from exercise_planner_api.config import Config

from .conftest import START, Clock

DAY = 86_400


def test_writes_one_consistent_copy_per_day(
    config: Config, conn: sqlite3.Connection, clock: Clock
) -> None:
    conn.execute("INSERT INTO users (username, password_hash, created_at) VALUES ('a', 'h', 0)")
    first = backup_once(config.db_path, config.backup_dir, clock(), keep=7)
    assert first is not None and first.name == "fitness-20261023.db"
    assert backup_once(config.db_path, config.backup_dir, clock() + 3600, keep=7) is None
    copy = sqlite3.connect(first)
    assert copy.execute("SELECT username FROM users").fetchall() == [("a",)]
    assert copy.execute("PRAGMA integrity_check").fetchone() == ("ok",)
    copy.close()


def test_keeps_the_newest_copies(config: Config, conn: sqlite3.Connection) -> None:
    for d in range(10):
        backup_once(config.db_path, config.backup_dir, START + d * DAY, keep=7)
    names = sorted(p.name for p in config.backup_dir.iterdir())
    assert names[0] == "fitness-20261026.db" and names[-1] == "fitness-20261101.db"
    assert len(names) == 7


def test_replaces_a_partial_copy_left_by_a_crash(
    config: Config, conn: sqlite3.Connection, clock: Clock
) -> None:
    config.backup_dir.mkdir()
    (config.backup_dir / "fitness-20261023.partial").write_text("junk")
    written = backup_once(config.db_path, config.backup_dir, clock(), keep=7)
    assert written is not None and written.exists()
    assert not (config.backup_dir / "fitness-20261023.partial").exists()


def test_thread_backs_up_at_start_and_stops(config: Config, conn: sqlite3.Connection) -> None:
    thread = BackupThread(config, interval=60)
    thread.start()
    deadline = time.monotonic() + 5
    while not list(config.backup_dir.glob("*.db")) and time.monotonic() < deadline:
        time.sleep(0.01)
    thread.stop()
    assert not thread.is_alive()
    assert [p.name for p in config.backup_dir.glob("*.db")] == ["fitness-20261023.db"]


def test_thread_survives_a_failed_backup(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    # The data dir is a file, so the backup dir cannot be created.
    blocker = tmp_path / "blocked"
    blocker.write_text("")
    config = Config(data_dir=blocker, public_origin="https://x.example", clock=Clock())
    thread = BackupThread(config, interval=0.01)
    thread.start()
    time.sleep(0.05)
    thread.stop()
    assert "backup failed" in caplog.text
