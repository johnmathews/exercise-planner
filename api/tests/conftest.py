"""Shared fixtures: a config on a temp dir, a controllable clock, and a cheap password hasher."""

from collections.abc import Iterator
from dataclasses import dataclass
from pathlib import Path

import pytest
from argon2 import PasswordHasher
from fastapi.testclient import TestClient

from fitness_planner_api import auth
from fitness_planner_api.app import create_app
from fitness_planner_api.config import Config
from fitness_planner_api.db import connect, migrate

ORIGIN = "https://testserver"
START = 1_792_742_400  # 2026-10-23 08:00 UTC


@dataclass
class Clock:
    now: int = START

    def __call__(self) -> int:
        return self.now

    def advance(self, seconds: int) -> None:
        self.now += seconds


@pytest.fixture(autouse=True)
def fast_hasher(monkeypatch: pytest.MonkeyPatch) -> None:
    """argon2 at its 64 MiB defaults takes tenths of a second per hash; tests need many."""
    monkeypatch.setattr(auth, "HASHER", PasswordHasher(time_cost=1, memory_cost=8, parallelism=1))


@pytest.fixture
def clock() -> Clock:
    return Clock()


@pytest.fixture
def config(tmp_path: Path, clock: Clock) -> Config:
    return Config(data_dir=tmp_path, public_origin=ORIGIN, clock=clock)


@pytest.fixture
def conn(config: Config) -> Iterator[object]:
    c = connect(config.db_path)
    migrate(c)
    yield c
    c.close()


@pytest.fixture
def client(config: Config) -> Iterator[TestClient]:
    app = create_app(config, run_backups=False)
    # https, so the Secure session cookie is sent back; Origin on every request, as browsers do.
    with TestClient(app, base_url=ORIGIN, headers={"Origin": ORIGIN}) as c:
        yield c
