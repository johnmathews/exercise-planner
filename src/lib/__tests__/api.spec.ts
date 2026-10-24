import { afterEach, describe, expect, it, vi } from 'vitest'
import { request } from '@/lib/api'

function respond(status: number, body?: unknown, raw?: string): void {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(
      async () =>
        new Response(raw ?? (body === undefined ? null : JSON.stringify(body)), { status }),
    ),
  )
}

describe('request', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends JSON to /api with the method and parses the reply', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ rev: 2 }))
    vi.stubGlobal('fetch', fetch)
    expect(await request('PUT', '/plans/exercise/2026-10-19', { items: [], rev: 1 })).toEqual({
      ok: true,
      data: { rev: 2 },
    })
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('/api/plans/exercise/2026-10-19')
    expect(init).toMatchObject({
      method: 'PUT',
      body: '{"items":[],"rev":1}',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    })
  })

  it('sends no body or content type on GET', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ ok: true }))
    vi.stubGlobal('fetch', fetch)
    await request('GET', '/healthz')
    expect(fetch.mock.calls[0]![1]).toEqual({ method: 'GET', credentials: 'same-origin' })
  })

  it('returns undefined data for 204', async () => {
    respond(204)
    expect(await request('POST', '/auth/logout', {})).toEqual({ ok: true, data: undefined })
  })

  it('maps 401 to auth and 409 to a conflict carrying the body', async () => {
    respond(401, { error: 'auth' })
    expect(await request('GET', '/state')).toEqual({ ok: false, error: { kind: 'auth' } })
    respond(401)
    expect(await request('GET', '/state')).toEqual({ ok: false, error: { kind: 'auth' } })
    respond(409, { error: 'conflict', items: [], rev: 3 })
    expect(await request('PUT', '/plans/diet/2026-10-19', {})).toEqual({
      ok: false,
      error: { kind: 'conflict', body: { error: 'conflict', items: [], rev: 3 } },
    })
  })

  it.each([502, 503, 504])('treats a %i from the proxy as offline', async (status) => {
    respond(status, undefined, '<html>Bad Gateway</html>')
    expect(await request('GET', '/state')).toEqual({ ok: false, error: { kind: 'offline' } })
  })

  it('treats a network failure as offline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    expect(await request('GET', '/state')).toEqual({ ok: false, error: { kind: 'offline' } })
  })

  it('keeps a 401 that is not about the session, such as a wrong password', async () => {
    respond(401, { error: 'invalid' })
    expect(await request('POST', '/auth/login', {})).toEqual({
      ok: false,
      error: { kind: 'refused', status: 401, code: 'invalid' },
    })
  })

  it('passes the API’s own refusals through, with Retry-After', async () => {
    respond(423, { error: 'locked', retryAfter: 600 })
    expect(await request('POST', '/auth/login', {})).toEqual({
      ok: false,
      error: { kind: 'refused', status: 423, code: 'locked', retryAfter: 600 },
    })
    respond(503, { error: 'busy', retryAfter: 1 })
    expect(await request('POST', '/auth/login', {})).toEqual({
      ok: false,
      error: { kind: 'refused', status: 503, code: 'busy', retryAfter: 1 },
    })
    respond(400, { error: 'invalid' })
    expect(await request('PUT', '/settings', {})).toEqual({
      ok: false,
      error: { kind: 'refused', status: 400, code: 'invalid' },
    })
  })

  it('calls a successful reply that is not a JSON object an error', async () => {
    respond(200, [1, 2])
    expect(await request('GET', '/state')).toEqual({
      ok: false,
      error: { kind: 'refused', status: 200, code: 'error' },
    })
  })

  it('calls an unexpected reply an error', async () => {
    respond(500, undefined, 'Internal Server Error')
    expect(await request('GET', '/state')).toEqual({
      ok: false,
      error: { kind: 'refused', status: 500, code: 'error' },
    })
  })
})
