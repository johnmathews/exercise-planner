import { ref } from 'vue'
import { defineStore } from 'pinia'
import { request, type ApiError } from '@/lib/api'
import { isRecord, parseJson, readKey, removeKey, writeKey } from '@/lib/storage'
import { useDietStore } from '@/stores/diet'
import { usePlannerStore } from '@/stores/planner'
import { useSyncStore } from '@/stores/sync'

/** The last signed-in user, so a reload shows their cached data before the server answers. */
export const SESSION_KEY = 'fitness-planner-session-v1'

/** Why a sign-in, a link or a sign-out did not work; the forms turn these into sentences. */
export type AuthProblem = {
  code: 'invalid' | 'locked' | 'busy' | 'offline' | 'gone' | 'password' | 'error'
  retryAfter?: number
}

export type LinkKind = 'invite' | 'reset'

function problem(error: ApiError): AuthProblem {
  if (error.kind === 'offline') return { code: 'offline' }
  if (error.kind !== 'refused') return { code: 'error' }
  const known = ['invalid', 'locked', 'busy', 'gone', 'password'] as const
  const code = known.find((c) => c === error.code) ?? 'error'
  return error.retryAfter === undefined ? { code } : { code, retryAfter: error.retryAfter }
}

function savedUser(): string | null {
  const saved = parseJson(readKey(SESSION_KEY))
  return isRecord(saved) && typeof saved.user === 'string' ? saved.user : null
}

export const useSessionStore = defineStore('session', () => {
  const sync = useSyncStore()
  const planner = usePlannerStore()
  const diet = useDietStore()

  /** `checking` only until the first answer when no user is remembered on this device. */
  const status = ref<'checking' | 'signed-out' | 'signed-in'>('checking')
  const user = ref<string | null>(null)
  /** The session ended by itself (expired or revoked), rather than by signing out. */
  const expired = ref(false)

  function begin(name: string): void {
    // A different user's data must never show, even for a moment.
    if (user.value !== null && user.value !== name) {
      planner.clear()
      diet.clear()
    }
    user.value = name
    status.value = 'signed-in'
    expired.value = false
    writeKey(SESSION_KEY, { user: name })
    sync.start(name, lost)
  }

  /** The server stopped accepting the session: ask to sign in again, keeping unsent changes. */
  function lost(): void {
    sync.stop()
    status.value = 'signed-out'
    expired.value = true
  }

  /** On load: trust a remembered user straight away, then let the server confirm or refuse. */
  async function init(): Promise<void> {
    const remembered = savedUser()
    if (remembered) begin(remembered)
    const res = await request<{ username: string }>('GET', '/auth/me')
    if (res.ok) {
      if (res.data.username !== user.value || status.value !== 'signed-in') begin(res.data.username)
      return
    }
    if (res.error.kind === 'auth' && remembered) lost()
    else if (!remembered) status.value = 'signed-out'
    // Offline with a remembered user: keep working from the cache until the server is back.
  }

  async function signedIn(res: Awaited<ReturnType<typeof request<{ username: string }>>>) {
    if (!res.ok) return problem(res.error)
    begin(res.data.username)
    return null
  }

  async function login(username: string, password: string): Promise<AuthProblem | null> {
    return signedIn(
      await request<{ username: string }>('POST', '/auth/login', { username, password }),
    )
  }

  async function lookup(
    token: string,
  ): Promise<{ kind: LinkKind; username: string } | AuthProblem> {
    const res = await request<{ kind: LinkKind; username: string }>('POST', '/invites/lookup', {
      token,
    })
    return res.ok ? res.data : problem(res.error)
  }

  async function redeem(token: string, password: string): Promise<AuthProblem | null> {
    return signedIn(
      await request<{ username: string }>('POST', '/invites/redeem', { token, password }),
    )
  }

  /**
   * Sign out and forget this user's data on the device. Refused while offline: the session
   * cookie is HttpOnly, so only the server can end it, and leaving it valid would sign the user
   * straight back in on the next visit.
   */
  async function logout(): Promise<AuthProblem | null> {
    const res = await request('POST', '/auth/logout', {})
    if (!res.ok && res.error.kind !== 'auth') return problem(res.error)
    const name = user.value
    sync.stop()
    if (name) sync.forget(name)
    planner.clear()
    diet.clear()
    removeKey(SESSION_KEY)
    user.value = null
    status.value = 'signed-out'
    expired.value = false
    return null
  }

  /**
   * Another tab signed in or out (a `storage` event on the session key). Follow it at once, so
   * this tab never keeps showing, or writing as, a user who is no longer the one signed in.
   */
  async function onStorage(key: string | null): Promise<void> {
    if (key !== SESSION_KEY && key !== null) return
    const remembered = savedUser()
    if (remembered === user.value && status.value === 'signed-in') return
    sync.stop()
    planner.clear()
    diet.clear()
    user.value = null
    expired.value = false
    status.value = 'signed-out'
    if (remembered) await init()
  }

  return { status, user, expired, init, login, lookup, redeem, logout, onStorage }
})
