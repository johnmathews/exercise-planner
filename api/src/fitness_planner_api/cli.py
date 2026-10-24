"""`fp-admin`: invites, resets and account switches, run in the API container (docs/api.md §5)."""

import argparse
import os
import sqlite3
import sys
from collections.abc import Callable, Mapping, Sequence
from dataclasses import replace
from datetime import UTC, datetime

from . import auth
from .config import Config
from .db import connect, migrate

MESSAGES = {
    "username": "usernames are 1 to 32 letters, digits, '.', '_' or '-'",
    "exists": "already exists; use reset to give them a new password",
}


def _when(ts: int) -> str:
    return datetime.fromtimestamp(ts, UTC).strftime("%Y-%m-%d %H:%M UTC")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="fp-admin", description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    for name, text in [
        ("invite", "print a single-use sign-up link for a new user (valid 7 days)"),
        ("reset", "print a password-reset link for a user (valid 24 hours)"),
        ("disable", "block a user's logins and end their sessions"),
        ("enable", "allow a disabled user to log in again"),
        ("revoke-sessions", "sign a user out everywhere"),
    ]:
        commands.add_parser(name, help=text).add_argument("username")
    commands.add_parser("users", help="list users")
    return parser


def main(
    argv: Sequence[str] | None = None,
    env: Mapping[str, str] = os.environ,
    clock: Callable[[], int] | None = None,
) -> int:
    args = _parser().parse_args(argv)
    try:
        config = Config.from_env(env)
    except ValueError as e:
        print(f"fp-admin: {e}", file=sys.stderr)
        return 1
    if clock is not None:
        config = replace(config, clock=clock)
    conn = connect(config.db_path)
    try:
        migrate(conn)
        return _run(args, config, conn)
    except auth.AuthError as e:
        name = getattr(args, "username", "")
        text = f"no user named {name!r}" if e.code == "no-user" else f"{name}: {MESSAGES[e.code]}"
        print(f"fp-admin: {text}", file=sys.stderr)
        return 1
    finally:
        conn.close()


def _run(args: argparse.Namespace, config: Config, conn: sqlite3.Connection) -> int:
    match args.command:
        case "invite" | "reset":
            token = auth.mint_link(conn, config, args.command, args.username)
            lifetime = (
                config.invite_days * auth.DAY
                if args.command == "invite"
                else config.reset_hours * 3600
            )
            print(
                f"{args.command.capitalize()} link for {args.username},"
                f" expires {_when(config.clock() + lifetime)}:"
            )
            print(f"{config.public_origin}/#/{args.command}/{token}")
            print("It works once. Minting another revokes this one.")
        case "disable" | "enable":
            auth.set_disabled(conn, args.username, args.command == "disable")
            print(
                f"{args.username} is now {'disabled' if args.command == 'disable' else 'enabled'}."
            )
        case "revoke-sessions":
            n = auth.revoke_sessions(conn, args.username)
            print(f"Ended {n} session{'' if n == 1 else 's'} for {args.username}.")
        case _:  # users
            rows = conn.execute(
                "SELECT u.username, u.created_at, u.disabled,"
                " (SELECT count(*) FROM sessions s WHERE s.user_id = u.id) AS sessions"
                " FROM users u ORDER BY u.username"
            ).fetchall()
            if not rows:
                print("No users yet.")
            for r in rows:
                state = "disabled" if r["disabled"] else "active"
                n = r["sessions"]
                print(
                    f"{r['username']:<32} {state:<8} since {_when(r['created_at'])},"
                    f" {n} session{'' if n == 1 else 's'}"
                )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
