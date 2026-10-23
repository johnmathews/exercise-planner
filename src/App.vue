<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { usePlannerStore } from '@/stores/planner'
import AppNavbar from '@/components/AppNavbar.vue'
import WeekHeader from '@/components/WeekHeader.vue'
import ExerciseGrid from '@/components/ExerciseGrid.vue'
import AddExerciseForm from '@/components/AddExerciseForm.vue'
import DietSection from '@/components/DietSection.vue'
import { useDietStore } from '@/stores/diet'
import { isDark } from '@/lib/theme'

const store = usePlannerStore()
const diet = useDietStore()

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
  if (document.visibilityState === 'visible') store.refreshNow()
}
function onStorage(ev: StorageEvent): void {
  if (ev.storageArea !== localStorage) return
  store.syncFromStorage(ev.key)
  diet.syncFromStorage(ev.key)
}

// The minute tick catches midnight in a tab that stays visible (e.g. a wall display);
// visibilitychange catches it immediately when a backgrounded tab returns.
let tick: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('storage', onStorage)
  colorScheme?.addEventListener('change', onColorScheme)
  tick = setInterval(store.refreshNow, 60_000)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('storage', onStorage)
  colorScheme?.removeEventListener('change', onColorScheme)
  clearInterval(tick)
})
</script>

<template>
  <AppNavbar />
  <main class="mx-auto max-w-6xl px-4 pb-16 sm:px-6 lg:px-8 print:max-w-none print:p-0">
    <WeekHeader />
    <ExerciseGrid />
    <AddExerciseForm />
    <DietSection />
  </main>
</template>
