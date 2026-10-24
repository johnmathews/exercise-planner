import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import App from '@/App.vue'
import { SESSION_KEY } from '@/stores/session'
import { usePlannerStore } from '@/stores/planner'
import { CACHE_PREFIX, CONFLICT_NOTICE, OUTBOX_PREFIX, useSyncStore } from '@/stores/sync'
import { FakeApi, PASSWORD } from '@/lib/__tests__/fakeApi'
import { USER, signedIn } from '@/lib/__tests__/signedIn'

const NOW = new Date(2026, 9, 23, 18, 0)

let wrapper: VueWrapper
let api: FakeApi

function mountApp(): VueWrapper {
  const pinia = createPinia()
  setActivePinia(pinia)
  wrapper = mount(App, { global: { plugins: [pinia] }, attachTo: document.body })
  return wrapper
}

/** A browser with nothing remembered, and an API where alice exists but is signed out. */
function signedOut(): FakeApi {
  const a = new FakeApi()
  a.addUser(USER)
  vi.stubGlobal('fetch', a.fetch)
  return a
}

async function signIn(username: string, password: string): Promise<void> {
  await wrapper.get('#login-username').setValue(username)
  await wrapper.get('#login-password').setValue(password)
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

function heading(): string {
  return wrapper.get('h1').text()
}

function button(name: string) {
  return wrapper.findAll('button').find((b) => b.text() === name)!
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  localStorage.clear()
  history.replaceState(null, '', '/')
})

afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('signing in', () => {
  it('shows nothing until the server answers, then the sign-in form', async () => {
    api = signedOut()
    mountApp()
    expect(wrapper.find('form').exists()).toBe(false)
    await flushPromises()
    expect(heading()).toBe('Sign in')
    expect(wrapper.find('[aria-label="Week navigation"]').exists()).toBe(false)
  })

  it('signs in and shows the planner, remembering the user', async () => {
    api = signedOut()
    mountApp()
    await flushPromises()
    await signIn(` ${USER} `, PASSWORD)
    expect(heading()).toBe('Oct 19 – Oct 25, 2026')
    expect(JSON.parse(localStorage.getItem(SESSION_KEY)!)).toEqual({ user: USER })
  })

  it.each([
    ['a wrong password', 'invalid', undefined, 'Wrong username or password.'],
    ['a locked account', 'locked', 600, 'Too many attempts. Try again in 10 minutes.'],
    ['a lock about to end', 'locked', 30, 'Too many attempts. Try again in 1 minute.'],
    ['a busy server', 'busy', 1, 'The server is busy. Try again in a moment.'],
  ])('explains %s', async (_, code, retryAfter, message) => {
    api = signedOut()
    const status = { invalid: 401, locked: 423, busy: 503 }[code]!
    api.failNext('POST', '/auth/login', status, { error: code, retryAfter })
    mountApp()
    await flushPromises()
    await signIn(USER, PASSWORD)
    expect(wrapper.get('[data-testid="login-problem"]').text()).toBe(message)
    expect(heading()).toBe('Sign in')
  })

  it('explains being offline', async () => {
    api = signedOut()
    mountApp()
    await flushPromises()
    api.offline = true
    await signIn(USER, PASSWORD)
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Can’t reach the server. Check the connection and try again.',
    )
  })

  it('asks to sign in again when the session ends, with the username filled in', async () => {
    api = signedIn()
    api.signedIn = null
    mountApp()
    await flushPromises()
    expect(heading()).toBe('Sign in')
    expect(wrapper.text()).toContain('Your session has ended.')
    expect((wrapper.get('#login-username').element as HTMLInputElement).value).toBe(USER)
  })

  it('ignores a second submit while the first is under way', async () => {
    api = signedOut()
    mountApp()
    await flushPromises()
    const release = api.hold()
    await wrapper.get('#login-username').setValue(USER)
    await wrapper.get('#login-password').setValue(PASSWORD)
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('button[type="submit"]').attributes('aria-busy')).toBe('true')
    release()
    await flushPromises()
    expect(api.paths('POST /auth/login')).toHaveLength(1)
  })
})

describe('invite and reset links', () => {
  it('sets a password from an invite, signs in, and clears the link', async () => {
    api = signedOut()
    api.links.set('tok_1', { kind: 'invite', username: 'bob' })
    history.replaceState(null, '', '/#/invite/tok_1')
    mountApp()
    await flushPromises()
    expect(heading()).toBe('Welcome, bob')
    await wrapper.get('#new-password').setValue('a long new password')
    await wrapper.get('#confirm-password').setValue('a long new password')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(location.hash).toBe('')
    expect(heading()).toBe('Oct 19 – Oct 25, 2026')
    expect(api.accounts.get('bob')!.password).toBe('a long new password')
  })

  it('checks the two passwords match, and shows the server’s length rule', async () => {
    api = signedOut()
    api.links.set('tok_1', { kind: 'invite', username: 'bob' })
    history.replaceState(null, '', '/#/invite/tok_1')
    mountApp()
    await flushPromises()
    await wrapper.get('#new-password').setValue('a long new password')
    await wrapper.get('#confirm-password').setValue('something else')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toBe('The passwords don’t match.')
    expect(api.paths('/invites/redeem')).toEqual([])
    await wrapper.get('#new-password').setValue('short')
    await wrapper.get('#confirm-password').setValue('short')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[data-testid="link-problem"]').text()).toBe('Use 10 to 256 characters.')
  })

  it('names the user on a reset link', async () => {
    api = signedOut()
    api.links.set('tok_2', { kind: 'reset', username: USER })
    history.replaceState(null, '', '/#/reset/tok_2')
    mountApp()
    await flushPromises()
    expect(heading()).toBe('Choose a new password')
    expect(wrapper.text()).toContain('This signs you out on every other device.')
  })

  it('says when a link is no good', async () => {
    api = signedOut()
    history.replaceState(null, '', '/#/invite/used')
    mountApp()
    expect(heading()).toBe('Checking the link…')
    await flushPromises()
    expect(heading()).toBe('Link not valid')
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'This link has expired or was already used. Ask for a new one.',
    )
  })

  it('opens a link pasted into a running tab', async () => {
    api = signedOut()
    api.links.set('tok_3', { kind: 'invite', username: 'carol' })
    mountApp()
    await flushPromises()
    history.replaceState(null, '', '/#/invite/tok_3')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    await flushPromises()
    expect(heading()).toBe('Welcome, carol')
  })
})

describe('signing out', () => {
  async function openSettings(): Promise<void> {
    await wrapper
      .findAll('button')
      .find((b) => b.text().endsWith('Settings'))!
      .trigger('click')
  }

  it('shows who is signed in and signs out, forgetting the data', async () => {
    api = signedIn()
    mountApp()
    await flushPromises()
    await openSettings()
    expect(wrapper.get('[data-testid="signed-in-as"]').text()).toBe(`Signed in as ${USER}`)
    await button('Sign out').trigger('click')
    await flushPromises()
    expect(heading()).toBe('Sign in')
    expect(localStorage.getItem(CACHE_PREFIX + USER)).toBeNull()
  })

  it('asks first when changes have not synced', async () => {
    api = signedIn()
    mountApp()
    await flushPromises()
    api.offline = true
    await wrapper.findAll('button[aria-label^="Squats,"]')[0]!.trigger('click')
    await flushPromises()
    api.offline = false
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await openSettings()
    await button('Sign out').trigger('click')
    expect(confirm).toHaveBeenCalledWith('2 changes haven’t synced yet. Sign out anyway?')
    expect(api.paths('/auth/logout')).toEqual([])
  })

  it('signs out after a confirm, in the singular for one change', async () => {
    api = signedIn()
    mountApp()
    await flushPromises()
    api.offline = true
    await openSettings()
    await wrapper.get('button[aria-label="Blue"]').trigger('click')
    await flushPromises()
    api.offline = false
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await button('Sign out').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledWith('1 change haven’t synced yet. Sign out anyway?')
    expect(heading()).toBe('Sign in')
  })

  it('refuses while offline, and says why', async () => {
    api = signedIn()
    mountApp()
    await flushPromises()
    api.offline = true
    await openSettings()
    await button('Sign out').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe(
      'Can’t reach the server. Check the connection and try again.',
    )
    expect(wrapper.find('[aria-label="Week navigation"]').exists()).toBe(true)
  })
})

describe('sync status', () => {
  function status() {
    return wrapper.find('[data-testid="sync-status"]')
  }

  it('says it is loading when the device has no copy yet', async () => {
    api = signedIn()
    localStorage.removeItem(CACHE_PREFIX + USER)
    api.stall('GET', '/state')
    mountApp()
    await flushPromises()
    expect(status().text()).toBe('Loading your data…')
    expect(status().attributes('data-state')).toBe('loading')
    expect(wrapper.find('[data-testid="exercise-grid"]').exists()).toBe(false)
  })

  it('offers a retry when there is no copy and no connection', async () => {
    api = signedIn()
    localStorage.removeItem(CACHE_PREFIX + USER)
    api.offline = true
    mountApp()
    await flushPromises()
    expect(status().text()).toContain('this device has no saved copy of your data yet')
    api.offline = false
    await status().get('button').trigger('click')
    await flushPromises()
    expect(status().exists()).toBe(false)
    expect(wrapper.find('[data-testid="exercise-grid"]').exists()).toBe(true)
  })

  it('counts unsynced changes while offline, and says nothing once they sync', async () => {
    api = signedIn()
    mountApp()
    await flushPromises()
    api.offline = true
    await wrapper.findAll('button[aria-label^="Squats,"]')[0]!.trigger('click')
    await flushPromises()
    expect(status().get('span').text()).toBe(
      'Offline. 2 changes will sync when the connection is back.',
    )
    expect(JSON.parse(localStorage.getItem(OUTBOX_PREFIX + USER)!)).toHaveLength(2)
    api.offline = false
    window.dispatchEvent(new Event('online'))
    await flushPromises()
    expect(status().exists()).toBe(false)
  })

  it('uses the singular for one waiting change', async () => {
    api = signedIn()
    mountApp()
    await flushPromises()
    api.offline = true
    usePlannerStore().setAccent('#ff9f0a')
    await flushPromises()
    expect(status().get('span').text()).toBe(
      'Offline. 1 change will sync when the connection is back.',
    )
  })

  it('says it is showing the saved copy when offline with nothing queued', async () => {
    api = signedIn()
    api.offline = true
    mountApp()
    await flushPromises()
    expect(status().get('span').text()).toBe('Offline. Showing the data saved on this device.')
  })

  it('shows a conflict notice until dismissed', async () => {
    api = signedIn()
    mountApp()
    await flushPromises()
    useSyncStore().notice = CONFLICT_NOTICE
    await flushPromises()
    const notice = wrapper.get('[data-testid="sync-notice"]')
    expect(notice.text()).toContain(CONFLICT_NOTICE)
    await notice.get('button').trigger('click')
    expect(wrapper.find('[data-testid="sync-notice"]').exists()).toBe(false)
  })

  it('leaves a hidden tab alone, and ignores sessionStorage events', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(NOW)
    api = signedIn()
    mountApp()
    await flushPromises()
    const reads = () => api.paths('GET /state').length
    const start = reads()
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(60_000)
    window.dispatchEvent(
      new StorageEvent('storage', { key: CACHE_PREFIX + USER, storageArea: sessionStorage }),
    )
    await flushPromises()
    expect(reads()).toBe(start)
    visibility.mockRestore()
  })

  it('reads the server on focus, when visible again, and every minute', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(NOW)
    api = signedIn()
    mountApp()
    await flushPromises()
    const reads = () => api.paths('GET /state').length
    const start = reads()
    window.dispatchEvent(new Event('focus'))
    await flushPromises()
    expect(reads()).toBe(start + 1)
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()
    expect(reads()).toBe(start + 2)
    vi.advanceTimersByTime(60_000)
    await flushPromises()
    expect(reads()).toBe(start + 3)
  })
})
