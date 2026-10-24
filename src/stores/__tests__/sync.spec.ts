import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { usePlannerStore } from '@/stores/planner'
import { useDietStore } from '@/stores/diet'
import {
  CACHE_PREFIX,
  CONFLICT_NOTICE,
  OUTBOX_PREFIX,
  diff,
  normaliseState,
  useSyncStore,
  type SyncState,
} from '@/stores/sync'
import { DATA_KEY, DIET_KEY, LEGACY_DATA_KEY } from '@/lib/storage'
import { FakeApi } from '@/lib/__tests__/fakeApi'
import { USER, cached, emptyState } from '@/lib/__tests__/signedIn'

const NOW = new Date(2026, 9, 23, 18, 0)
const WEEK = '2026-10-19'
const PUSHUPS = { id: 'pu', name: 'Push-ups', reps: 10, target: 4 }
const SQUATS = { id: 'sq', name: 'Squats', reps: 15, target: 4 }

let api: FakeApi
let lost: ReturnType<typeof vi.fn<() => void>>

function outbox(): unknown[] {
  return JSON.parse(localStorage.getItem(OUTBOX_PREFIX + USER) ?? '[]') as unknown[]
}

function stateWith(plans: object, revs: object = {}): SyncState {
  const s = emptyState()
  s.exercise.plans = plans as SyncState['exercise']['plans']
  s.exercise.revs = revs as Record<string, number>
  return s
}

/** Start syncing alice, with `cache` on the device (or none), and let it settle. */
async function start(cache?: SyncState) {
  if (cache) localStorage.setItem(CACHE_PREFIX + USER, JSON.stringify(cache))
  const sync = useSyncStore()
  sync.start(USER, lost)
  await flushPromises()
  return { sync, planner: usePlannerStore(), diet: useDietStore() }
}

/** Let a local change reach the watcher, then let the writes it queues finish. */
async function settle(): Promise<void> {
  await nextTick()
  await flushPromises()
}

describe('sync', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    localStorage.clear()
    setActivePinia(createPinia())
    api = new FakeApi()
    api.addUser(USER)
    api.signedIn = USER
    vi.stubGlobal('fetch', api.fetch)
    lost = vi.fn<() => void>()
  })

  afterEach(() => {
    useSyncStore().stop()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('shows the cache at once, then takes the server’s state', async () => {
    api.accounts.get(USER)!.plans.exercise[WEEK] = { items: [SQUATS], rev: 3 }
    localStorage.setItem(CACHE_PREFIX + USER, JSON.stringify(stateWith({ [WEEK]: [PUSHUPS] })))
    const sync = useSyncStore()
    const planner = usePlannerStore()
    sync.start(USER, lost)
    expect(sync.loaded).toBe(true)
    expect(planner.exercises).toEqual([PUSHUPS])
    await flushPromises()
    expect(planner.exercises).toEqual([SQUATS])
    expect(cached().exercise).toEqual({ plans: { [WEEK]: [SQUATS] }, log: {}, revs: { [WEEK]: 3 } })
  })

  it('loads from the server when the device has no cache', async () => {
    api.accounts.get(USER)!.settings = { accent: '#0a84ff', dailyPick: 5 }
    const sync = useSyncStore()
    sync.start(USER, lost)
    expect(sync.loaded).toBe(false)
    await flushPromises()
    expect(sync.loaded).toBe(true)
    expect(usePlannerStore().accent).toBe('#0a84ff')
    expect(cached().settings).toEqual({ accent: '#0a84ff', dailyPick: 5 })
  })

  it('ignores a cache it cannot read', async () => {
    localStorage.setItem(CACHE_PREFIX + USER, '{broken')
    const sync = useSyncStore()
    sync.start(USER, lost)
    expect(sync.loaded).toBe(false)
    await flushPromises()
    expect(sync.loaded).toBe(true)
  })

  it('creates the week’s plan, then sends the tick, and uses the new revision next time', async () => {
    const { planner } = await start(emptyState())
    planner.toggle('pu', 0)
    await settle()
    expect(api.paths('PUT')).toEqual([
      `PUT /plans/exercise/${WEEK}`,
      `PUT /ticks/exercise/${WEEK}/pu/0`,
    ])
    expect(api.calls.find((c) => c.method === 'PUT')!.body).toMatchObject({ rev: 0 })
    const server = api.accounts.get(USER)!
    expect(server.plans.exercise[WEEK]!.rev).toBe(1)
    expect(server.ticks.exercise[WEEK]).toEqual({ pu: 1 })
    expect(outbox()).toEqual([])
    planner.changeTarget('pu', 1)
    await settle()
    expect(api.calls.at(-1)!.body).toMatchObject({ rev: 1 })
    expect(server.plans.exercise[WEEK]!.rev).toBe(2)
    expect(cached().exercise.revs).toEqual({ [WEEK]: 2 })
  })

  it('sends food plans and ticks under the diet section', async () => {
    const { diet } = await start(emptyState())
    diet.toggle('veg', 2)
    await settle()
    expect(api.paths('PUT')).toEqual([`PUT /plans/diet/${WEEK}`, `PUT /ticks/diet/${WEEK}/veg/2`])
  })

  it('sends settings changes', async () => {
    const { planner } = await start(emptyState())
    planner.setAccent('#bf5af2')
    planner.changeDailyPick(1)
    await settle()
    expect(api.accounts.get(USER)!.settings).toEqual({ accent: '#bf5af2', dailyPick: 4 })
    expect(cached().settings).toEqual({ accent: '#bf5af2', dailyPick: 4 })
  })

  it('ends on the latest value when a cell is toggled while its write is in flight', async () => {
    api.accounts.get(USER)!.plans.exercise[WEEK] = { items: [PUSHUPS], rev: 1 }
    const { planner } = await start(stateWith({ [WEEK]: [PUSHUPS] }, { [WEEK]: 1 }))
    const release = api.hold()
    planner.toggle('pu', 0) // on: sent, reply held
    await nextTick()
    planner.toggle('pu', 0) // off: queued behind it, replacing nothing in flight
    await nextTick()
    release()
    await flushPromises()
    expect(planner.isDone('pu', 0)).toBe(false)
    expect(api.accounts.get(USER)!.ticks.exercise[WEEK]).toEqual({ pu: 0 })
    expect(outbox()).toEqual([])
  })

  it('keeps writes while offline, says so, and sends them once back', async () => {
    const { sync, planner } = await start(emptyState())
    api.offline = true
    planner.toggle('sq', 3)
    await settle()
    expect(sync.status).toBe('offline')
    expect(sync.pending).toBe(2)
    expect(outbox()).toHaveLength(2)
    api.offline = false
    await sync.flush()
    expect(sync.status).toBe('idle')
    expect(sync.pending).toBe(0)
    expect(api.accounts.get(USER)!.ticks.exercise[WEEK]).toEqual({ sq: 8 })
  })

  it('retries on a timer that backs off', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(NOW)
    const { sync, planner } = await start(emptyState())
    api.offline = true
    planner.toggle('sq', 0)
    await settle()
    const tries = () => api.paths(`/plans/exercise/${WEEK}`).length
    expect(tries()).toBe(1)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(tries()).toBe(2)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(tries()).toBe(2) // the second wait is ten seconds
    api.offline = false
    await vi.advanceTimersByTimeAsync(5_000)
    expect(tries()).toBe(3)
    expect(sync.pending).toBe(0)
  })

  it('treats a gateway error as offline', async () => {
    const { sync, planner } = await start(emptyState())
    api.failNext('PUT', '/plans', 502)
    planner.toggle('sq', 0)
    await settle()
    expect(sync.status).toBe('offline')
    expect(sync.pending).toBe(2)
  })

  it('hands control back on a 401 and keeps the outbox for after sign-in', async () => {
    const { planner } = await start(emptyState())
    api.signedIn = null
    planner.toggle('sq', 0)
    await settle()
    expect(lost).toHaveBeenCalledOnce()
    expect(outbox()).toHaveLength(2)
  })

  it('hands control back when a read finds the session gone', async () => {
    api.signedIn = null
    await start(emptyState())
    expect(lost).toHaveBeenCalledOnce()
  })

  it('takes the server’s copy of a plan changed elsewhere, and says so', async () => {
    api.accounts.get(USER)!.plans.exercise[WEEK] = { items: [SQUATS], rev: 2 }
    api.stall('GET', '/state') // the start-up read must not bring the server's copy in first
    const { sync, planner } = await start(stateWith({ [WEEK]: [PUSHUPS] }, { [WEEK]: 1 }))
    planner.changeTarget('pu', 1)
    await settle()
    expect(planner.exercises).toEqual([SQUATS])
    expect(sync.notice).toBe(CONFLICT_NOTICE)
    expect(cached().exercise.revs).toEqual({ [WEEK]: 2 })
    await settle()
    expect(api.paths('PUT')).toHaveLength(1) // adopting their copy queues nothing
    sync.dismissNotice()
    expect(sync.notice).toBeNull()
  })

  it('takes the server’s copy of a food plan the same way', async () => {
    const veg = { id: 'veg', name: 'Vegetables', target: 7 }
    api.accounts.get(USER)!.plans.diet[WEEK] = { items: [veg], rev: 2 }
    api.stall('GET', '/state')
    const cache = emptyState()
    cache.diet.plans = { [WEEK]: [veg, { id: 'nuts', name: 'Nuts', target: 3 }] }
    cache.diet.revs = { [WEEK]: 1 }
    const { sync, diet } = await start(cache)
    diet.changeTarget('veg', -1)
    await settle()
    expect(diet.foods).toEqual([veg])
    expect(sync.notice).toBe(CONFLICT_NOTICE)
  })

  it('keeps a tick write while offline when the week already has its plan', async () => {
    api.accounts.get(USER)!.plans.exercise[WEEK] = { items: [PUSHUPS], rev: 1 }
    const { sync, planner } = await start(stateWith({ [WEEK]: [PUSHUPS] }, { [WEEK]: 1 }))
    api.offline = true
    planner.toggle('pu', 2)
    await settle()
    expect(outbox()).toMatchObject([{ kind: 'tick', item: 'pu', day: 2, done: true }])
    expect(sync.status).toBe('offline')
  })

  it('does nothing on refresh before it has started', async () => {
    await useSyncStore().refresh()
    expect(api.calls).toEqual([])
  })

  it('keeps a settings write while offline', async () => {
    const { sync, planner } = await start(emptyState())
    api.offline = true
    planner.setAccent('#ff9f0a')
    await settle()
    expect(sync.pending).toBe(1)
    expect(sync.status).toBe('offline')
  })

  it('sends a plan again as a create when the server has none', async () => {
    api.stall('GET', '/state')
    const { sync, planner } = await start(stateWith({ [WEEK]: [PUSHUPS] }, { [WEEK]: 4 }))
    planner.changeTarget('pu', 1)
    await settle()
    const bodies = api.calls.filter((c) => c.method === 'PUT').map((c) => c.body)
    expect(bodies).toMatchObject([{ rev: 4 }, { rev: 0 }])
    expect(api.accounts.get(USER)!.plans.exercise[WEEK]!.rev).toBe(1)
    expect(sync.notice).toBeNull()
  })

  it('raises no notice when another device already created the same week', async () => {
    const defaults = usePlannerStore().exercises.map((e) => ({ ...e }))
    api.stall('GET', '/state')
    const { sync, planner } = await start(emptyState())
    api.accounts.get(USER)!.plans.exercise[WEEK] = { items: defaults, rev: 1 }
    planner.toggle('pu', 0)
    await settle()
    expect(sync.notice).toBeNull()
    expect(cached().exercise.revs).toEqual({ [WEEK]: 1 })
  })

  it('drops a refused write so the rest still go', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { sync, planner } = await start(emptyState())
    api.failNext('PUT', '/plans', 400, { error: 'invalid' })
    planner.toggle('sq', 0)
    await settle()
    expect(warn).toHaveBeenCalledOnce()
    expect(sync.pending).toBe(0)
    expect(api.accounts.get(USER)!.ticks.exercise[WEEK]).toEqual({ sq: 1 })
  })

  it('never lets a read undo a change made while it was in flight', async () => {
    const { sync, planner } = await start(emptyState())
    // The read's reply is the state before the tick, and it lands after the tick has synced.
    const release = api.holdNext('GET', '/state')
    const read = sync.refresh()
    await flushPromises()
    planner.toggle('sq', 0)
    await settle()
    expect(sync.pending).toBe(0)
    release()
    await read
    expect(planner.isDone('sq', 0)).toBe(true)
  })

  it('never lets a read undo a change its watcher has not seen yet', async () => {
    const { sync, planner } = await start(emptyState())
    const release = api.holdNext('GET', '/state')
    const read = sync.refresh()
    await flushPromises()
    // The reply lands in the same tick as the edit, before Vue runs the sync watcher.
    planner.changeTarget('sq', 1)
    release()
    await read
    await settle()
    expect(planner.exercises.find((e) => e.id === 'sq')!.target).toBe(5)
    expect(api.accounts.get(USER)!.plans.exercise[WEEK]).toBeDefined()
  })

  it('keeps an unseen change when another tab writes the cache', async () => {
    const { sync, planner } = await start(emptyState())
    planner.changeTarget('sq', 1)
    sync.onStorage(CACHE_PREFIX + USER) // in the same tick, before the watcher runs
    await settle()
    expect(api.accounts.get(USER)!.plans.exercise[WEEK]!.items).toHaveLength(5)
  })

  it('reads the server only once the outbox is empty', async () => {
    const { sync, planner } = await start(emptyState())
    api.offline = true
    planner.toggle('sq', 0)
    await settle()
    const reads = api.paths('GET /state').length
    await sync.refresh() // still offline: the writes stay queued, so no read
    expect(api.paths('GET /state')).toHaveLength(reads)
    expect(planner.isDone('sq', 0)).toBe(true)
  })

  it('brings in other devices’ changes on refresh', async () => {
    const { sync, planner } = await start(emptyState())
    api.accounts.get(USER)!.ticks.exercise[WEEK] = { sq: 0b10 }
    await sync.refresh()
    expect(planner.isDone('sq', 1)).toBe(true)
  })

  it('adopts another tab’s cache write without sending it again', async () => {
    const { sync, planner } = await start(emptyState())
    const other = stateWith({ [WEEK]: [SQUATS] }, { [WEEK]: 1 })
    localStorage.setItem(CACHE_PREFIX + USER, JSON.stringify(other))
    sync.onStorage(CACHE_PREFIX + USER)
    await settle()
    expect(planner.exercises).toEqual([SQUATS])
    expect(api.paths('PUT')).toEqual([])
    localStorage.setItem(OUTBOX_PREFIX + USER, JSON.stringify([{ kind: 'settings' }]))
    sync.onStorage(OUTBOX_PREFIX + USER)
    expect(sync.pending).toBe(1)
    sync.onStorage('something-else')
    sync.stop()
    sync.onStorage(CACHE_PREFIX + USER) // after stop: ignored
  })

  it('stops cleanly, keeping the cache, and forgets on request', async () => {
    const { sync, planner } = await start(emptyState())
    planner.toggle('sq', 0)
    await settle()
    sync.stop()
    expect(sync.loaded).toBe(false)
    expect(localStorage.getItem(CACHE_PREFIX + USER)).not.toBeNull()
    planner.toggle('pu', 0) // no longer watched
    await settle()
    expect(api.paths(`/ticks/exercise/${WEEK}/pu`)).toEqual([])
    localStorage.setItem(OUTBOX_PREFIX + USER, '[]')
    sync.forget(USER)
    expect(localStorage.getItem(CACHE_PREFIX + USER)).toBeNull()
    expect(localStorage.getItem(OUTBOX_PREFIX + USER)).toBeNull()
  })

  it('never writes the keys from before accounts', async () => {
    localStorage.setItem(LEGACY_DATA_KEY, '{"exercises":[]}')
    const { planner, diet } = await start(emptyState())
    planner.toggle('sq', 0)
    diet.toggle('veg', 0)
    await settle()
    expect(localStorage.getItem(DATA_KEY)).toBeNull()
    expect(localStorage.getItem(DIET_KEY)).toBeNull()
    expect(localStorage.getItem(LEGACY_DATA_KEY)).toBe('{"exercises":[]}')
  })
})

describe('diff', () => {
  const settings = { accent: '#30d158', dailyPick: 3 }
  const empty = () => ({
    exercise: { plans: {}, log: {} },
    diet: { plans: {}, log: {} },
    settings: { ...settings },
  })

  it('is empty for identical snapshots', () => {
    expect(diff(empty(), empty())).toEqual([])
  })

  it('finds changed plans, set and cleared days, and settings', () => {
    const base = empty()
    base.diet.log = { [WEEK]: { veg: [true, false, false, false, false, false, false] } }
    const local = empty()
    local.exercise.plans = { [WEEK]: [PUSHUPS] }
    local.diet.log = { [WEEK]: { veg: [false, true, false, false, false, false, false] } }
    local.settings.dailyPick = 4
    expect(diff(base, local)).toEqual([
      { kind: 'plan', section: 'exercise', week: WEEK },
      { kind: 'tick', section: 'diet', week: WEEK, item: 'veg', day: 0, done: false },
      { kind: 'tick', section: 'diet', week: WEEK, item: 'veg', day: 1, done: true },
      { kind: 'settings' },
    ])
  })
})

describe('normaliseState', () => {
  it('validates like stored data and drops bad revisions', () => {
    expect(normaliseState(null)).toBeNull()
    expect(normaliseState({ exercise: {} })).toBeNull()
    expect(
      normaliseState({
        exercise: {
          plans: { [WEEK]: [{ id: 'a', name: 'A', reps: 2.6, target: 9 }], bad: [] },
          log: {},
          revs: { [WEEK]: 2, x: 'y', y: 0, z: 1.5 },
        },
        diet: { plans: 'nope' },
        settings: 'nope',
      }),
    ).toEqual({
      exercise: {
        plans: { [WEEK]: [{ id: 'a', name: 'A', reps: 3, target: 7 }] },
        log: {},
        revs: { [WEEK]: 2 },
      },
      diet: { plans: {}, log: {}, revs: {} },
      settings: null,
    })
  })
})
