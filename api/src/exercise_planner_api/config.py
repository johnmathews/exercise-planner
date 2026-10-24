"""Runtime configuration, read from the environment (docs/api.md §6)."""

import os
import re
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path

ORIGIN_RE = re.compile(r"https?://[^/\s]+")


def _now() -> int:
    return int(time.time())


def _flag(env: Mapping[str, str], name: str, default: bool) -> bool:
    raw = env.get(name)
    if raw is None:
        return default
    if raw.lower() not in ("true", "false"):
        raise ValueError(f"{name} must be true or false, not {raw!r}")
    return raw.lower() == "true"


@dataclass(frozen=True)
class Config:
    data_dir: Path
    #: Scheme, host and port with no path, e.g. https://fitness.itsa-pizza.com.
    public_origin: str
    cookie_secure: bool = True
    backup_keep: int = 7
    session_days: int = 90
    invite_days: int = 7
    reset_hours: int = 24
    lockout_attempts: int = 5
    lockout_minutes: int = 15
    #: Unix seconds; injectable so tests can move time.
    clock: Callable[[], int] = field(default=_now)

    @property
    def db_path(self) -> Path:
        return self.data_dir / "fitness.db"

    @property
    def backup_dir(self) -> Path:
        return self.data_dir / "backup"

    @property
    def cookie_name(self) -> str:
        # The __Host- prefix makes the browser insist on Secure, Path=/ and no Domain.
        return "__Host-session" if self.cookie_secure else "session"

    @classmethod
    def from_env(cls, env: Mapping[str, str] = os.environ) -> "Config":
        origin = env.get("PUBLIC_ORIGIN", "")
        if not ORIGIN_RE.fullmatch(origin):
            raise ValueError(f"PUBLIC_ORIGIN must look like https://host[:port], not {origin!r}")
        return cls(
            data_dir=Path(env.get("DATA_DIR", "/data")),
            public_origin=origin,
            cookie_secure=_flag(env, "COOKIE_SECURE", True),
            backup_keep=int(env.get("BACKUP_KEEP", "7")),
        )
