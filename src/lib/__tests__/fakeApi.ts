/**
 * An in-memory stand-in for the API (docs/api.md), installed as `fetch` in tests. It keeps the
 * rules the client depends on: plan revisions with 409s, identical-items creates succeeding,
 * single-day ticks, settings, sessions and invite links. Controls let a test go offline, fail
 * a request, or hold replies back to provoke races.
 */
import { mergeSummary, parseExport } from '@/lib/transfer'

type Section = 'exercise' | 'diet'
type Plan = { items: unknown[]; rev: number }
type Settings = { accent: string; dailyPick: number }

export type Account = {
  password: string
  plans: Record<Section, Record<string, Plan>>
  ticks: Record<Section, Record<string, Record<string, number>>>
  settings: Settings | null
}

export const PASSWORD = 'correct horse battery'

function emptyAccount(password: string): Account {
  return {
    password,
    plans: { exercise: {}, diet: {} },
    ticks: { exercise: {}, diet: {} },
    settings: null,
  }
}

function maskToDays(mask: number): boolean[] {
  return Array.from({ length: 7 }, (_, i) => ((mask >> i) & 1) === 1)
}

export class FakeApi {
  accounts = new Map<string, Account>()
  /** The user the browser's cookie belongs to, or null. */
  signedIn: string | null = null
  links = new Map<string, { kind: 'invite' | 'reset'; username: string }>()
  offline = false
  calls: { method: string; path: string; body: unknown; expectedUser?: string }[] = []
  private failures: { method: string; path: string; status: number; body?: unknown }[] = []
  private held: (() => void)[] | null = null
  private stalled: { method: string; path: string }[] = []
  private delayed: { method: string; path: string; until: Promise<void> }[] = []

  addUser(name: string, password = PASSWORD): Account {
    const account = emptyAccount(password)
    this.accounts.set(name, account)
    return account
  }

  /** The next matching request gets this reply instead. `path` matches as a prefix. */
  failNext(method: string, path: string, status: number, body?: unknown): void {
    this.failures.push({ method, path, status, body })
  }

  /** Matching requests never get a reply, like a read lost in a dead connection. */
  stall(method: string, path: string): void {
    this.stalled.push({ method, path })
  }

  /** Hold the next matching request's reply until the returned function is called. */
  holdNext(method: string, path: string): () => void {
    let go = () => {}
    const until = new Promise<void>((resolve) => (go = resolve))
    this.delayed.push({ method, path, until })
    return go
  }

  /** Hold every reply until the returned function is called. */
  hold(): () => void {
    this.held = []
    return () => {
      const waiting = this.held ?? []
      this.held = null
      for (const go of waiting) go()
    }
  }

  /** The calls made, as `METHOD /path`, optionally only those starting with a prefix. */
  paths(prefix = ''): string[] {
    return this.calls.map((c) => `${c.method} ${c.path}`).filter((p) => p.includes(prefix))
  }

  state(name: string): unknown {
    const a = this.accounts.get(name)!
    const section = (s: Section) => ({
      plans: Object.fromEntries(Object.entries(a.plans[s]).map(([w, p]) => [w, p.items])),
      log: Object.fromEntries(
        Object.entries(a.ticks[s]).map(([w, items]) => [
          w,
          Object.fromEntries(Object.entries(items).map(([id, m]) => [id, maskToDays(m)])),
        ]),
      ),
      revs: Object.fromEntries(Object.entries(a.plans[s]).map(([w, p]) => [w, p.rev])),
    })
    return { exercise: section('exercise'), diet: section('diet'), settings: a.settings }
  }

  fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const method = init.method ?? 'GET'
    const path = String(input).replace(/^\/api/, '')
    const body: unknown = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    const headers = new Headers(init.headers)
    const expectedUser = headers.get('X-Expected-User') ?? undefined
    this.calls.push({ method, path, body, expectedUser })
    if (this.stalled.some((s) => s.method === method && path.startsWith(s.path))) {
      return new Promise<Response>(() => {})
    }
    const delay = this.delayed.findIndex((d) => d.method === method && path.startsWith(d.path))
    if (delay >= 0) {
      const [d] = this.delayed.splice(delay, 1)
      // Answer with the state as it was when the request arrived, as a slow reply would.
      const reply = this.route(method, path, body as Record<string, unknown>, expectedUser)
      await d!.until
      return reply
    }
    if (this.held) await new Promise<void>((go) => this.held!.push(go))
    if (this.offline) throw new TypeError('Failed to fetch')
    const failure = this.failures.findIndex((f) => f.method === method && path.startsWith(f.path))
    if (failure >= 0) {
      const [f] = this.failures.splice(failure, 1)
      return f!.body === undefined
        ? new Response('<html>Bad Gateway</html>', { status: f!.status })
        : Response.json(f!.body, { status: f!.status })
    }
    return this.route(method, path, body as Record<string, unknown>, expectedUser)
  }

  private route(
    method: string,
    path: string,
    body: Record<string, unknown>,
    expectedUser?: string,
  ): Response {
    const error = (status: number, code: string, extra: object = {}) =>
      Response.json({ error: code, ...extra }, { status })
    if (method === 'POST' && path === '/auth/login') {
      const a = this.accounts.get(String(body.username))
      if (!a || a.password !== body.password) return error(401, 'invalid')
      this.signedIn = String(body.username)
      return Response.json({ username: this.signedIn })
    }
    if (method === 'POST' && path === '/invites/lookup') {
      const link = this.links.get(String(body.token))
      return link ? Response.json(link) : error(410, 'gone')
    }
    if (method === 'POST' && path === '/invites/redeem') {
      const link = this.links.get(String(body.token))
      if (!link) return error(410, 'gone')
      const password = String(body.password)
      if (password.length < 10 || password.length > 256) return error(400, 'password')
      this.links.delete(String(body.token))
      if (link.kind === 'invite') this.addUser(link.username, password)
      else this.accounts.get(link.username)!.password = password
      this.signedIn = link.username
      return Response.json({ username: link.username })
    }
    if (method === 'POST' && path === '/auth/logout') {
      this.signedIn = null
      return new Response(null, { status: 204 })
    }
    const user = this.signedIn
    const a = user ? this.accounts.get(user) : undefined
    if (!a) return error(401, 'auth')
    // As the API does: a tab expecting another user must not see or change this one's data.
    if (expectedUser !== undefined && expectedUser.toLowerCase() !== user!.toLowerCase()) {
      return error(401, 'auth')
    }
    if (method === 'GET' && path === '/auth/me') return Response.json({ username: user })
    if (method === 'GET' && path === '/state') return Response.json(this.state(user!))
    if (method === 'POST' && path === '/import') return this.import(a, body)
    if (method === 'PUT' && path === '/settings') {
      a.settings = { accent: String(body.accent), dailyPick: Number(body.dailyPick) }
      return Response.json(a.settings)
    }
    let m = path.match(/^\/plans\/(exercise|diet)\/(\d{4}-\d{2}-\d{2})$/)
    if (method === 'PUT' && m) {
      const plans = a.plans[m[1] as Section]
      const current = plans[m[2]!]
      const rev = current?.rev ?? 0
      if (body.rev === rev) {
        plans[m[2]!] = { items: body.items as unknown[], rev: rev + 1 }
        return Response.json({ rev: rev + 1 })
      }
      if (current && JSON.stringify(current.items) === JSON.stringify(body.items)) {
        return Response.json({ rev })
      }
      return error(409, 'conflict', { items: current?.items ?? null, rev })
    }
    m = path.match(/^\/ticks\/(exercise|diet)\/(\d{4}-\d{2}-\d{2})\/([^/]+)\/([0-6])$/)
    if (method === 'PUT' && m) {
      const week = (a.ticks[m[1] as Section][m[2]!] ??= {})
      const id = decodeURIComponent(m[3]!)
      const bit = 1 << Number(m[4])
      week[id] = body.done ? (week[id] ?? 0) | bit : (week[id] ?? 0) & ~bit
      return Response.json({ days: maskToDays(week[id]) })
    }
    return error(404, 'not-found')
  }

  /** The API's merge: existing weeks keep their plan, ticks are OR-ed, settings only if none. */
  private import(a: Account, body: unknown): Response {
    const parsed = parseExport(JSON.stringify(body))
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 })
    let weeks = 0
    let ticks = 0
    for (const section of ['exercise', 'diet'] as const) {
      const incoming = parsed.data[section]
      const existing = this.state(this.signedIn!) as Record<Section, { plans: object; log: object }>
      const added = mergeSummary(existing[section] as never, incoming)
      weeks += added.weeks
      ticks += added.ticks
      for (const [week, items] of Object.entries(incoming.plans)) {
        a.plans[section][week] ??= { items, rev: 1 }
      }
      for (const [week, entries] of Object.entries(incoming.log)) {
        const stored = (a.ticks[section][week] ??= {})
        for (const [id, days] of Object.entries(entries)) {
          const mask = days.reduce((m, on, i) => (on ? m | (1 << i) : m), 0)
          stored[id] = (stored[id] ?? 0) | mask
        }
      }
    }
    const settings = parsed.data.settings !== null && a.settings === null
    if (settings) a.settings = parsed.data.settings
    return Response.json({ weeks, ticks, settings })
  }
}
