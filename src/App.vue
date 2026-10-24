<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { usePlannerStore } from '@/stores/planner'
import AppNavbar from '@/components/AppNavbar.vue'
import WeekHeader from '@/components/WeekHeader.vue'
import ExerciseGrid from '@/components/ExerciseGrid.vue'
import AddExerciseForm from '@/components/AddExerciseForm.vue'
import DietSection from '@/components/DietSection.vue'
import LoginForm from '@/components/LoginForm.vue'
import PasswordForm from '@/components/PasswordForm.vue'
import SyncStatus from '@/components/SyncStatus.vue'
import { isDark } from '@/lib/theme'
import { useSessionStore } from '@/stores/session'
import { useSyncStore } from '@/stores/sync'

const store = usePlannerStore()
const session = useSessionStore()
const sync = useSyncStore()
// Started before the first render: a remembered user is signed in synchronously, so the app
// shows their cached data straight away instead of flashing the sign-in screen.
void session.init()

/** An invite or reset link (`#/invite/<token>`, `#/reset/<token>`): its token, else null. */
function linkToken(): string | null {
  return /^#\/(?:invite|reset)\/([A-Za-z0-9_-]+)$/.exec(location.hash)?.[1] ?? null
}
const link = ref(linkToken())
function onHash(): void {
  link.value = linkToken()
}
/** Drop the token from the address bar and history, where a used or dead one has no place. */
function forgetToken(): void {
  history.replaceState(null, '', location.pathname + location.search)
}
function closeLink(): void {
  forgetToken()
  link.value = null
}

// The accent is a user setting, so it lives in a CSS variable rather than in the stylesheets.
watchEffect(() => document.documentElement.style.setProperty('--accent', store.accent))

// matchMedia is missing in some environments (jsdom), so "System" falls back to light there.
const colorScheme = window.matchMedia?.('(prefers-color-scheme: dark)')
const systemDark = ref(colorScheme?.matches ?? false)
watchEffect(() =>
  document.documentElement.classList.toggle('dark', isDark(store.theme, systemDark.value)),
)
function onColorScheme(ev: MediaQueryListEvent): void {
  systemDark.value = ev.matches
}

function onVisible(): void {
  if (document.visibilityState !== 'visible') return
  store.refreshNow()
  void sync.refresh()
}
function onFocus(): void {
  void sync.refresh()
}
function onOnline(): void {
  void sync.flush()
}
function onStorage(ev: StorageEvent): void {
  if (ev.storageArea !== localStorage) return
  void session.onStorage(ev.key)
  sync.onStorage(ev.key)
}
function onTick(): void {
  store.refreshNow()
  // Another device's changes arrive within a minute even in a tab that is never refocused.
  if (document.visibilityState === 'visible') void sync.refresh()
}

// The minute tick catches midnight in a tab that stays visible (e.g. a wall display);
// visibilitychange catches it immediately when a backgrounded tab returns.
let tick: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', onFocus)
  window.addEventListener('online', onOnline)
  window.addEventListener('storage', onStorage)
  window.addEventListener('hashchange', onHash)
  colorScheme?.addEventListener('change', onColorScheme)
  tick = setInterval(onTick, 60_000)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('focus', onFocus)
  window.removeEventListener('online', onOnline)
  window.removeEventListener('storage', onStorage)
  window.removeEventListener('hashchange', onHash)
  colorScheme?.removeEventListener('change', onColorScheme)
  clearInterval(tick)
  sync.stop()
})
</script>

<template>
  <PasswordForm v-if="link" :key="link" :token="link" @done="closeLink" @spent="forgetToken" />
  <template v-else-if="session.status === 'signed-in'">
    <AppNavbar />
    <main class="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8 print:max-w-none print:p-0">
      <SyncStatus />
      <template v-if="sync.loaded">
        <WeekHeader />
        <ExerciseGrid />
        <AddExerciseForm v-if="store.configMode" />
        <DietSection />
      </template>
    </main>
  </template>
  <LoginForm v-else-if="session.status === 'signed-out'" />
</template>
