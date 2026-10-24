import { isRecord } from '@/lib/storage'

/**
 * The one way the client talks to the API (docs/api.md). Every reply becomes a typed result, so
 * callers branch on what happened rather than on status codes.
 */

export type ApiError =
  /** No network, or the proxy could not reach the API (502, 503 or 504 without an API body). */
  | { kind: 'offline' }
  /** No session, or it ended (401 `auth`). */
  | { kind: 'auth' }
  /** A stale plan write; the body carries the server's `items` and `rev`. */
  | { kind: 'conflict'; body: { items: unknown; rev: number } }
  /** Any other refusal, with the API's error code (`error` when the reply was not the API's). */
  | { kind: 'refused'; status: number; code: string; retryAfter?: number }

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError }

const OFFLINE: ApiError = { kind: 'offline' }

async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await res.json()
    return isRecord(body) ? body : null
  } catch {
    return null
  }
}

export async function request<T = unknown>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const init: RequestInit = { method, credentials: 'same-origin' }
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  let res: Response
  try {
    res = await fetch(`/api${path}`, init)
  } catch {
    return { ok: false, error: OFFLINE }
  }
  if (res.status === 204) return { ok: true, data: undefined as T }
  const json = await readJson(res)
  if (res.ok && json !== null) return { ok: true, data: json as T }
  // A gateway error with no API body means nginx could not reach the API: treat it as offline.
  const code = typeof json?.error === 'string' ? json.error : null
  if ([502, 503, 504].includes(res.status) && code === null) return { ok: false, error: OFFLINE }
  // A 401 means the session has ended, unless the API says otherwise (a wrong password is
  // 401 `invalid`, which the login form has to tell apart).
  if (res.status === 401 && (code === null || code === 'auth')) {
    return { ok: false, error: { kind: 'auth' } }
  }
  if (res.status === 409 && json !== null) {
    return { ok: false, error: { kind: 'conflict', body: json as { items: unknown; rev: number } } }
  }
  const error: ApiError = { kind: 'refused', status: res.status, code: code ?? 'error' }
  if (typeof json?.retryAfter === 'number') error.retryAfter = json.retryAfter
  return { ok: false, error }
}
