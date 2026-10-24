"""The HTTP layer: routes, the write checks, and error mapping (docs/api.md §3)."""

import sqlite3
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Path, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import auth, data
from .backup import BackupThread
from .config import Config
from .db import connect, migrate
from .validate import ExportError, Section, is_week, parse_export, parse_json

MAX_BODY = 1 << 20
WRITES = frozenset({"POST", "PUT", "PATCH", "DELETE"})
# The HTTP status for each refusal code an auth step can raise.
AUTH_STATUS = {
    "invalid": 401,
    "locked": 423,
    "busy": 503,
    "password": 400,
    "gone": 410,
    "exists": 409,
}


class ApiError(Exception):
    """An error response, `{"error": code, **extra}`. Raising it drops headers set on the injected
    Response, so any header the error needs travels here."""

    def __init__(
        self, status: int, code: str, headers: dict[str, str] | None = None, **extra: object
    ) -> None:
        super().__init__(code)
        self.status = status
        self.code = code
        self.headers = headers or {}
        self.extra = extra


def error_response(
    status: int, code: str, headers: dict[str, str] | None = None, **extra: object
) -> JSONResponse:
    return JSONResponse(
        {"error": code, **extra},
        status_code=status,
        headers={**(headers or {}), "Cache-Control": "no-store"},
    )


def create_app(config: Config, run_backups: bool = True) -> FastAPI:
    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        conn = connect(config.db_path)
        migrate(conn)
        conn.close()
        backups = BackupThread(config) if run_backups else None
        if backups:
            backups.start()
        yield
        if backups:
            backups.stop()

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    @app.middleware("http")
    async def guard(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if request.method in WRITES:
            if request.headers.get("origin") != config.public_origin:
                return error_response(403, "origin")
            content_type = request.headers.get("content-type", "").split(";")[0].strip().lower()
            if content_type != "application/json":
                return error_response(415, "content-type")
            length = request.headers.get("content-length", "0")
            if not length.isdigit() or int(length) > MAX_BODY:
                return error_response(413, "too-large")
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(ApiError)
    async def on_api_error(_: Request, e: ApiError) -> JSONResponse:
        return error_response(e.status, e.code, e.headers, **e.extra)

    @app.exception_handler(RequestValidationError)
    async def on_invalid(_: Request, __: RequestValidationError) -> JSONResponse:
        return error_response(400, "invalid")

    @app.exception_handler(StarletteHTTPException)
    async def on_http(_: Request, e: StarletteHTTPException) -> JSONResponse:
        return error_response(
            e.status_code, {404: "not-found", 405: "method"}.get(e.status_code, "error")
        )

    def get_conn() -> Iterator[sqlite3.Connection]:
        conn = connect(config.db_path)
        try:
            yield conn
        finally:
            conn.close()

    Conn = Annotated[sqlite3.Connection, Depends(get_conn)]

    async def body_text(request: Request) -> str:
        # Counted as it arrives: a chunked body has no Content-Length for the guard to check, and
        # reading it whole first would let one request exhaust the container's memory.
        raw = bytearray()
        async for chunk in request.stream():
            raw += chunk
            if len(raw) > MAX_BODY:
                raise ApiError(413, "too-large")
        try:
            # utf-8-sig drops a byte-order mark, as the browser's File.text() does.
            return raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise ApiError(400, "json") from None

    async def json_object(text: Annotated[str, Depends(body_text)]) -> dict[str, Any]:
        parsed = parse_json(text)
        if not isinstance(parsed, dict):
            raise ApiError(400, "json")
        return parsed

    Body = Annotated[dict[str, Any], Depends(json_object)]

    def set_session_cookie(response: Response, token: str) -> None:
        response.set_cookie(
            config.cookie_name,
            token,
            max_age=config.session_days * auth.DAY,
            path="/",
            secure=config.cookie_secure,
            httponly=True,
            samesite="lax",
        )

    def current_user(request: Request, response: Response, conn: Conn) -> auth.SessionUser:
        token = request.cookies.get(config.cookie_name)
        user = auth.session_user(conn, config, token) if token else None
        if user is None:
            raise ApiError(401, "auth")
        if user.refreshed:
            set_session_cookie(response, token or "")
        return user

    User = Annotated[auth.SessionUser, Depends(current_user)]

    def strings(body: dict[str, Any], *names: str) -> list[str]:
        values = [body.get(n) for n in names]
        if not all(isinstance(v, str) for v in values):
            raise ApiError(400, "invalid")
        return values  # type: ignore[return-value]

    def refused(e: auth.AuthError) -> ApiError:
        if e.retry_after is None:
            return ApiError(AUTH_STATUS.get(e.code, 400), e.code)
        wait = e.retry_after
        return ApiError(AUTH_STATUS[e.code], e.code, {"Retry-After": str(wait)}, retryAfter=wait)

    def week_key(week: str) -> str:
        if not is_week(week):
            raise ApiError(400, "invalid")
        return week

    @app.get("/api/healthz")
    def healthz(conn: Conn) -> dict[str, bool]:
        conn.execute("SELECT 1").fetchone()
        return {"ok": True}

    @app.post("/api/auth/login")
    def login(body: Body, response: Response, conn: Conn) -> dict[str, str]:
        username, password = strings(body, "username", "password")
        try:
            uid = auth.login(conn, config, username, password)
        except auth.AuthError as e:
            raise refused(e) from None
        set_session_cookie(response, auth.create_session(conn, config, uid))
        name = conn.execute("SELECT username FROM users WHERE id = ?", (uid,)).fetchone()[0]
        return {"username": name}

    @app.post("/api/auth/logout", status_code=204)
    def logout(_: Body, request: Request, response: Response, conn: Conn) -> None:
        token = request.cookies.get(config.cookie_name)
        if token:
            auth.end_session(conn, token)
        response.delete_cookie(
            config.cookie_name, path="/", secure=config.cookie_secure, httponly=True, samesite="lax"
        )

    @app.get("/api/auth/me")
    def me(user: User) -> dict[str, str]:
        return {"username": user.username}

    @app.post("/api/invites/lookup")
    def lookup(body: Body, conn: Conn) -> dict[str, str]:
        (token,) = strings(body, "token")
        info = auth.link_info(conn, config, token)
        if info is None:
            raise ApiError(410, "gone")
        return {"kind": info[0], "username": info[1]}

    @app.post("/api/invites/redeem")
    def redeem(body: Body, response: Response, conn: Conn) -> dict[str, str]:
        token, password = strings(body, "token", "password")
        try:
            uid = auth.redeem(conn, config, token, password)
        except auth.AuthError as e:
            raise refused(e) from None
        set_session_cookie(response, auth.create_session(conn, config, uid))
        name = conn.execute("SELECT username FROM users WHERE id = ?", (uid,)).fetchone()[0]
        return {"username": name}

    @app.get("/api/state")
    def get_state(user: User, conn: Conn) -> dict[str, Any]:
        return data.state(conn, user.id)

    @app.put("/api/plans/{section}/{week}")
    def put_plan(section: Section, week: str, body: Body, user: User, conn: Conn) -> dict[str, int]:
        items, rev = body.get("items"), body.get("rev")
        if not isinstance(items, list) or type(rev) is not int or rev < 0:
            raise ApiError(400, "invalid")
        result = data.put_plan(conn, user.id, section, week_key(week), items, rev)
        if isinstance(result, data.PlanConflict):
            raise ApiError(409, "conflict", items=result.items, rev=result.rev)
        return {"rev": result.rev}

    @app.put("/api/ticks/{section}/{week}/{item_id}/{day}")
    def put_tick(
        section: Section,
        week: str,
        item_id: Annotated[str, Path(min_length=1, max_length=128)],
        day: Annotated[int, Path(ge=0, le=6)],
        body: Body,
        user: User,
        conn: Conn,
    ) -> dict[str, list[bool]]:
        done = body.get("done")
        if not isinstance(done, bool):
            raise ApiError(400, "invalid")
        return {"days": data.set_tick(conn, user.id, section, week_key(week), item_id, day, done)}

    @app.put("/api/settings")
    def put_settings(body: Body, user: User, conn: Conn) -> dict[str, Any]:
        return dict(data.put_settings(conn, user.id, body))

    @app.get("/api/export")
    def export(user: User, conn: Conn, response: Response) -> dict[str, Any]:
        file = data.export_file(conn, user.id, config.clock())
        day = file["exportedAt"][:10]
        response.headers["Content-Disposition"] = (
            f'attachment; filename="exercise-planner-{day}.json"'
        )
        return file

    @app.post("/api/import")
    def import_(text: Annotated[str, Depends(body_text)], user: User, conn: Conn) -> dict[str, Any]:
        try:
            parsed = parse_export(text)
        except ExportError as e:
            raise ApiError(400, e.code) from None
        return dict(data.import_data(conn, user.id, parsed))

    return app


def create_app_from_env() -> FastAPI:
    """The uvicorn entry point: `uvicorn --factory exercise_planner_api.app:create_app_from_env`."""
    return create_app(Config.from_env())
