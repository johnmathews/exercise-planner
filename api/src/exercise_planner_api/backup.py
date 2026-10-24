"""The daily `VACUUM INTO` copy of the database (docs/api.md §7)."""

import logging
import sqlite3
import threading
from datetime import UTC, datetime
from pathlib import Path

from .config import Config

log = logging.getLogger(__name__)
PREFIX = "fitness-"


def backup_once(db_path: Path, backup_dir: Path, now: int, keep: int) -> Path | None:
    """Write today's copy unless it exists, then keep the newest `keep`; returns the new file."""
    backup_dir.mkdir(parents=True, exist_ok=True)
    day = datetime.fromtimestamp(now, UTC).strftime("%Y%m%d")
    target = backup_dir / f"{PREFIX}{day}.db"
    written = None
    if not target.exists():
        partial = target.with_suffix(".partial")
        partial.unlink(missing_ok=True)  # a crash mid-copy leaves one behind
        conn = sqlite3.connect(db_path)
        try:
            # VACUUM INTO gives a consistent, compacted copy even while the API is writing.
            conn.execute("VACUUM INTO ?", (str(partial),))
        finally:
            conn.close()
        partial.rename(target)
        written = target
    for old in sorted(backup_dir.glob(f"{PREFIX}*.db"))[:-keep]:
        old.unlink()
    return written


class BackupThread(threading.Thread):
    """Runs `backup_once` at start and then hourly; a copy is written once per UTC day."""

    def __init__(self, config: Config, interval: float = 3600) -> None:
        super().__init__(name="backup", daemon=True)
        self.config = config
        self.interval = interval
        self._stop_event = threading.Event()

    def run(self) -> None:
        while True:
            try:
                written = backup_once(
                    self.config.db_path,
                    self.config.backup_dir,
                    self.config.clock(),
                    self.config.backup_keep,
                )
                if written:
                    log.info("backup written: %s", written.name)
            except Exception:
                log.exception("backup failed")
            if self._stop_event.wait(self.interval):
                return

    def stop(self) -> None:
        self._stop_event.set()
        self.join(timeout=5)
