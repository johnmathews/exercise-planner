from pathlib import Path

import pytest

from exercise_planner_api.config import Config


def test_reads_the_environment() -> None:
    cfg = Config.from_env(
        {
            "DATA_DIR": "/srv/x",
            "PUBLIC_ORIGIN": "https://fitness.example",
            "COOKIE_SECURE": "false",
            "BACKUP_KEEP": "3",
        }
    )
    assert cfg.data_dir == Path("/srv/x")
    assert cfg.db_path == Path("/srv/x/fitness.db")
    assert cfg.public_origin == "https://fitness.example"
    assert cfg.cookie_secure is False
    assert cfg.cookie_name == "session"
    assert cfg.backup_keep == 3


def test_defaults() -> None:
    cfg = Config.from_env({"PUBLIC_ORIGIN": "https://fitness.example"})
    assert cfg.data_dir == Path("/data")
    assert cfg.cookie_secure is True
    assert cfg.cookie_name == "__Host-session"
    assert cfg.backup_keep == 7
    assert (cfg.session_days, cfg.invite_days, cfg.reset_hours) == (90, 7, 24)
    assert (cfg.lockout_attempts, cfg.lockout_minutes) == (5, 15)
    assert cfg.clock() > 1_700_000_000


@pytest.mark.parametrize(
    "origin",
    [
        None,
        "",
        "fitness.example",
        "https://fitness.example/",
        "https://fitness.example/path",
        "ftp://x",
    ],
)
def test_rejects_a_missing_or_malformed_origin(origin: str | None) -> None:
    env = {} if origin is None else {"PUBLIC_ORIGIN": origin}
    with pytest.raises(ValueError, match="PUBLIC_ORIGIN"):
        Config.from_env(env)


@pytest.mark.parametrize("value", ["yes", "0"])
def test_rejects_an_unclear_boolean(value: str) -> None:
    with pytest.raises(ValueError, match="COOKIE_SECURE"):
        Config.from_env({"PUBLIC_ORIGIN": "https://f.example", "COOKIE_SECURE": value})
