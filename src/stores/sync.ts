import { ref, watch, type WatchStopHandle } from 'vue'
import { defineStore } from 'pinia'
import { request, type ApiError } from '@/lib/api'
import {
  isRecord,
  normaliseExercise,
  normaliseFood,
  normaliseLog,
  normalisePlans,
  normalisePortableSettings,
  parseJson,
  readKey,
  removeKey,
  writeKey,
  type Exercise,
  type Food,
  type Log,
  type PortableSettings,
} from '@/lib/storage'
import type { Plans } from '@/lib/plans'
import { EXPORT_FORMAT, EXPORT_VERSION, type ExportData } from '@/lib/transfer'
import { useDietStore } from '@/stores/diet'
import { usePlannerStore } from '@/stores/planner'

/**
 * Keeps the stores and the API in step (docs/architecture.md §7).
 *
 * The stores change state optimistically; a deep watch diffs that state against `base`, the last
 * state the server is known to hold, and turns each difference into an operation in a persisted
 * outbox. Operations go out one at a time, in order. Reads replace local state only when nothing
 * is waiting to go out, so a refresh can never undo an edit that hasn't reached the server yet.
 */

export const CACHE_PREFIX = 'exercise-planner-cache-v1:'
export const OUTBOX_PREFIX = 'exercise-planner-outbox-v1:'

const SECTIONS = ['exercise', 'diet'] as const
type Section = (typeof SECTIONS)[number]

export type Op =
  | { kind: 'plan'; section: Section; week: string }
  | { kind: 'tick'; section: Section; week: string; item: string; day: number; done: boolean }
  | { kind: 'settings' }

/**
 * An operation in the outbox. Plan and settings operations read their values when sent, so two
 * versions of one look alike; the id tells a newer one from the one already in flight.
 */
type Queued = Op & { id: string }

type Tracked = { plans: Plans<unknown>; log: Log }
type Revs = Record<Section, Record<string, number>>
/** The shape of `GET /api/state`, and of the cache. */
export type SyncState = {
  exercise: { plans: Plans<Exercise>; log: Log; revs: Record<string, number> }
  diet: { plans: Plans<Food>; log: Log; revs: Record<string, number> }
  settings: PortableSettings | null
}
type Snapshot = { exercise: Tracked; diet: Tracked; settings: PortableSettings }
/** What `POST /api/import` added. */
export type ImportAdded = { weeks: number; ticks: number; settings: boolean }
export type ImportOutcome =
  { ok: true; added: ImportAdded } | { ok: false; code: 'offline' | 'auth' | 'error' }

export const CONFLICT_NOTICE =
  'A plan was changed on another device, so this device now shows that version.'
export const REFUSED_NOTICE =
  'The server refused a change, so it was undone here. Reload to see what was saved.'
const FIRST_RETRY = 5_000
const MAX_RETRY = 60_000

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

function opKey(op: Op): string {
  if (op.kind === 'plan') return `plan/${op.section}/${op.week}`
  if (op.kind === 'tick') return `tick/${op.section}/${op.week}/${op.item}/${op.day}`
  return 'settings'
}

const WEEK_KEY = /^\d{4}-\d{2}-\d{2}$/

/** An outbox entry this version can send; a damaged or foreign one is skipped, not stuck on. */
function isQueued(v: unknown): v is Queued {
  if (!isRecord(v) || typeof v.id !== 'string') return false
  if (v.kind === 'settings') return true
  const sectionOk = v.section === 'exercise' || v.section === 'diet'
  const weekOk = typeof v.week === 'string' && WEEK_KEY.test(v.week)
  if (v.kind === 'plan') return sectionOk && weekOk
  return (
    v.kind === 'tick' &&
    sectionOk &&
    weekOk &&
    typeof v.item === 'string' &&
    typeof v.done === 'boolean' &&
    Number.isInteger(v.day) &&
    (v.day as number) >= 0 &&
    (v.day as number) <= 6
  )
}

function newId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function revsOf(v: unknown): Record<string, number> {
  const out: Record<string, number> = {}
  if (!isRecord(v)) return out
  for (const [week, rev] of Object.entries(v)) {
    if (typeof rev === 'number' && Number.isInteger(rev) && rev > 0) out[week] = rev
  }
  return out
}

/** Validate a state from the cache or the API with the same rules as stored data. */
export function normaliseState(v: unknown): SyncState | null {
  if (!isRecord(v) || !isRecord(v.exercise) || !isRecord(v.diet)) return null
  const { exercise, diet } = v
  return {
    exercise: {
      plans: normalisePlans(exercise.plans, normaliseExercise),
      log: normaliseLog(exercise.log),
      revs: revsOf(exercise.revs),
    },
    diet: {
      plans: normalisePlans(diet.plans, normaliseFood),
      log: normaliseLog(diet.log),
      revs: revsOf(diet.revs),
    },
    settings: isRecord(v.settings) ? normalisePortableSettings(v.settings) : null,
  }
}

/** The operations that take the server from `base` to `local`. */
export function diff(base: Snapshot, local: Snapshot): Op[] {
  const ops: Op[] = []
  for (const section of SECTIONS) {
    const b = base[section]
    const l = local[section]
    for (const [week, items] of Object.entries(l.plans)) {
      if (JSON.stringify(items) !== JSON.stringify(b.plans[week])) {
        ops.push({ kind: 'plan', section, week })
      }
    }
    for (const week of new Set([...Object.keys(b.log), ...Object.keys(l.log)])) {
      const bw = b.log[week] ?? {}
      const lw = l.log[week] ?? {}
      for (const item of new Set([...Object.keys(bw), ...Object.keys(lw)])) {
        for (let day = 0; day < 7; day++) {
          const done = lw[item]?.[day] === true
          if (done !== (bw[item]?.[day] === true)) {
            ops.push({ kind: 'tick', section, week, item, day, done })
          }
        }
      }
    }
  }
  const { settings: bs } = base
  const { settings: ls } = local
  if (bs.accent !== ls.accent || bs.dailyPick !== ls.dailyPick) ops.push({ kind: 'settings' })
  return ops
}

export const useSyncStore = defineStore('sync', () => {
  const planner = usePlannerStore()
  const diet = useDietStore()

  const user = ref<string | null>(null)
  /** True once there is data to show, from the cache or the server. */
  const loaded = ref(false)
  /** `offline` after a write or read failed to reach the API; cleared by the next success. */
  const status = ref<'idle' | 'syncing' | 'offline'>('idle')
  const pending = ref(0)
  const notice = ref<string | null>(null)

  let base: Snapshot | null = null
  let revs: Revs = { exercise: {}, diet: {} }
  let stopWatch: WatchStopHandle | null = null
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let retryDelay = FIRST_RETRY
  let flushing: Promise<void> | null = null
  let refreshing: Promise<void> | null = null
  /** Bumped on every start and stop, so replies to an older session are ignored. */
  let generation = 0
  /** Bumped on every local change, so a read that raced one is discarded. */
  let changes = 0
  /** True while `adopt` replaces the stores' state, which is not a local change. */
  let adopting = false
  let authLost: (() => void) | null = null

  const cacheKey = () => CACHE_PREFIX + user.value
  const outboxKey = () => OUTBOX_PREFIX + user.value
  const store = (section: Section) => (section === 'exercise' ? planner : diet)

  function local(): Snapshot {
    return clone({
      exercise: { plans: planner.plans, log: planner.log },
      diet: { plans: diet.plans, log: diet.log },
      settings: { accent: planner.accent, dailyPick: planner.dailyPick },
    })
  }

  function readOutbox(): Queued[] {
    const ops = parseJson(readKey(outboxKey()))
    return Array.isArray(ops) ? ops.filter(isQueued) : []
  }

  function writeOutbox(ops: Queued[]): void {
    if (ops.length) writeKey(outboxKey(), ops)
    else removeKey(outboxKey())
    pending.value = ops.length
  }

  /** Add operations, each replacing any queued one for the same plan, cell or settings. */
  function enqueue(ops: Op[]): void {
    const keys = new Set(ops.map(opKey))
    const queued = ops.map((op) => ({ ...op, id: newId() }))
    writeOutbox([...readOutbox().filter((op) => !keys.has(opKey(op))), ...queued])
  }

  /** Drop a sent operation, unless a newer one for the same key has replaced it meanwhile. */
  function dequeue(sent: Queued): void {
    writeOutbox(readOutbox().filter((op) => op.id !== sent.id))
  }

  function persistCache(): void {
    const snapshot = local()
    const cache: SyncState = {
      exercise: { ...(snapshot.exercise as SyncState['exercise']), revs: revs.exercise },
      diet: { ...(snapshot.diet as SyncState['diet']), revs: revs.diet },
      settings: planner.savedSettings(),
    }
    writeKey(cacheKey(), cache)
  }

  /** Make `state` both what the stores show and what the server is known to hold. */
  function adopt(state: SyncState): void {
    revs = { exercise: { ...state.exercise.revs }, diet: { ...state.diet.revs } }
    adopting = true
    try {
      planner.adopt(clone({ plans: state.exercise.plans, log: state.exercise.log }), state.settings)
      diet.adopt(clone({ plans: state.diet.plans, log: state.diet.log }))
    } finally {
      adopting = false
    }
    base = local()
    loaded.value = true
    persistCache()
  }

  /**
   * Queue whatever the stores hold that `base` does not. The watcher calls it after each change,
   * but a reply can land before Vue runs the watcher, so reads and other tabs' writes call it
   * first too: comparing whole snapshots catches a change however it was made.
   */
  function capture(): void {
    if (!base || adopting) return
    const now = local()
    const ops = diff(base, now)
    if (!ops.length) return
    changes++
    base = now
    persistCache()
    enqueue(ops)
    void flush()
  }

  function scheduleRetry(): void {
    status.value = 'offline'
    clearTimeout(retryTimer)
    retryTimer = setTimeout(() => void refresh(), retryDelay)
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY)
  }

  /** A request on behalf of the signed-in user, which the API refuses for anyone else. */
  function call<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown) {
    return request<T>(method, path, body, { 'X-Expected-User': user.value ?? '' })
  }

  /**
   * `done` drops the operation; `again` sends it again now; `stop` ends the flush. A reply that
   * arrives after `stop()` (sign-out, or another user) is ignored entirely.
   */
  async function send(op: Queued, gen: number): Promise<'done' | 'again' | 'stop'> {
    let error: ApiError
    if (op.kind === 'plan') {
      const { section, week } = op
      const plans = store(section).plans
      // Gone from the stores (another tab's state, a damaged cache): sending [] would wipe it.
      if (!(week in plans)) return 'done'
      const res = await call<{ rev: number }>('PUT', `/plans/${section}/${week}`, {
        items: plans[week],
        rev: revs[section][week] ?? 0,
      })
      if (gen !== generation) return 'stop'
      if (res.ok) {
        revs[section][week] = res.data.rev
        return 'done'
      }
      error = res.error
      if (error.kind === 'conflict') {
        revs[section][week] = error.body.rev
        // The server has no plan for the week: send ours again as a create.
        if (!Array.isArray(error.body.items)) return 'again'
        const theirs = normalisePlans(
          { [week]: error.body.items },
          section === 'exercise' ? normaliseExercise : normaliseFood,
        )[week]!
        // The base first: adopting their copy is then no change to send back.
        base![section].plans[week] = clone(theirs)
        if (section === 'exercise') planner.adoptWeek(week, theirs as Exercise[])
        else diet.adoptWeek(week, theirs as Food[])
        notice.value = CONFLICT_NOTICE
        return 'done'
      }
    } else if (op.kind === 'tick') {
      const { section, week, item, day, done } = op
      const path = `/ticks/${section}/${week}/${encodeURIComponent(item)}/${day}`
      const res = await call('PUT', path, { done })
      if (gen !== generation) return 'stop'
      if (res.ok) return 'done'
      error = res.error
    } else {
      const res = await call('PUT', '/settings', {
        accent: planner.accent,
        dailyPick: planner.dailyPick,
      })
      if (gen !== generation) return 'stop'
      if (res.ok) return 'done'
      error = res.error
    }
    if (error.kind === 'offline' || error.kind === 'server') {
      scheduleRetry()
      return 'stop'
    }
    if (error.kind === 'auth') {
      authLost?.()
      return 'stop'
    }
    // Refused for good (an invalid write, a misconfigured origin): retrying cannot help, and
    // keeping it would block every write behind it. Drop it, and say so: the next read will
    // show the server's state without this change.
    console.warn('sync: dropped a refused write', op, error)
    notice.value = REFUSED_NOTICE
    return 'done'
  }

  /** Send queued operations in order until the outbox is empty or a send cannot finish. */
  function flush(): Promise<void> {
    if (flushing) return flushing
    const gen = generation
    flushing = (async () => {
      for (;;) {
        const op = readOutbox()[0]
        if (!op || gen !== generation) break
        status.value = 'syncing'
        const outcome = await send(op, gen)
        if (gen !== generation || outcome === 'stop') return
        if (outcome === 'done') dequeue(op)
        retryDelay = FIRST_RETRY
        if (op.kind === 'plan') persistCache()
      }
      if (gen === generation) status.value = 'idle'
    })().finally(() => {
      flushing = null
    })
    return flushing
  }

  /** Send what is queued, then take the server's state if nothing local is still waiting. */
  function refresh(): Promise<void> {
    if (refreshing) return refreshing
    const gen = generation
    refreshing = (async () => {
      if (!user.value) return
      await flush()
      if (gen !== generation || status.value === 'offline' || readOutbox().length) return
      const before = changes
      const res = await call<unknown>('GET', '/state')
      if (gen !== generation) return
      if (!res.ok) {
        if (res.error.kind === 'auth') authLost?.()
        else if (res.error.kind === 'offline' || res.error.kind === 'server') scheduleRetry()
        return
      }
      status.value = 'idle'
      retryDelay = FIRST_RETRY
      // A change made while the read was in flight is newer than the reply: keep it.
      capture()
      if (changes !== before || readOutbox().length) return
      const state = normaliseState(res.data)
      if (state) adopt(state)
    })().finally(() => {
      refreshing = null
    })
    return refreshing
  }

  /**
   * Merge `data` into the account on the server (`POST /api/import`), then show the result. Local
   * writes go first, so the server merges against everything this device has; the server's merge
   * never deletes (docs/architecture.md §4). One request, however much the data holds.
   */
  async function importFile(data: ExportData): Promise<ImportOutcome> {
    if (!user.value) return { ok: false, code: 'error' }
    const gen = generation
    capture()
    await flush()
    if (gen !== generation) return { ok: false, code: 'error' }
    const file = {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      exercise: data.exercise,
      diet: data.diet,
      ...(data.settings ? { settings: data.settings } : {}),
    }
    const res = await call<ImportAdded>('POST', '/import', file)
    if (gen !== generation) return { ok: false, code: 'error' }
    if (!res.ok) {
      if (res.error.kind === 'offline' || res.error.kind === 'server')
        return { ok: false, code: 'offline' }
      if (res.error.kind === 'auth') {
        authLost?.()
        return { ok: false, code: 'auth' }
      }
      return { ok: false, code: 'error' }
    }
    await refresh()
    return { ok: true, added: res.data }
  }

  /** Begin syncing for `name`: show the cache at once, then send and read in the background. */
  function start(name: string, onAuthLost: () => void): void {
    stop()
    generation++
    user.value = name
    authLost = onAuthLost
    const cached = normaliseState(parseJson(readKey(cacheKey())))
    if (cached) adopt(cached)
    pending.value = readOutbox().length
    stopWatch = watch(
      () => [planner.plans, planner.log, diet.plans, diet.log, planner.accent, planner.dailyPick],
      capture,
      { deep: true },
    )
    void refresh()
  }

  /** Stop syncing; the cache and outbox stay, so signing in again carries on. */
  function stop(): void {
    generation++
    // Replies to the old session are ignored; don't let its pending promises block the next one.
    flushing = null
    refreshing = null
    stopWatch?.()
    stopWatch = null
    clearTimeout(retryTimer)
    retryDelay = FIRST_RETRY
    base = null
    revs = { exercise: {}, diet: {} }
    user.value = null
    loaded.value = false
    status.value = 'idle'
    pending.value = 0
    notice.value = null
  }

  /** Delete a user's cache and outbox: signing out on purpose leaves nothing behind. */
  function forget(name: string): void {
    removeKey(CACHE_PREFIX + name)
    removeKey(OUTBOX_PREFIX + name)
  }

  /** Another tab changed this user's cache or outbox (a `storage` event). */
  function onStorage(key: string | null): void {
    if (!user.value) return
    if (key === cacheKey()) {
      capture() // queue this tab's own unsent change before the other tab's state replaces it
      const state = normaliseState(parseJson(readKey(cacheKey())))
      // Its pending writes are in the shared outbox, so its state can count as the base. It is
      // newer than any read still in flight here, so that read must not overwrite it.
      if (state) {
        changes++
        adopt(state)
      }
    } else if (key === outboxKey()) {
      pending.value = readOutbox().length
    }
  }

  function dismissNotice(): void {
    notice.value = null
  }

  return {
    user,
    loaded,
    status,
    pending,
    notice,
    start,
    stop,
    forget,
    flush,
    refresh,
    importFile,
    onStorage,
    dismissNotice,
  }
})
