<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { usePlannerStore } from '@/stores/planner'
import { ACCENTS, MAX_DAILY_PICK, MIN_DAILY_PICK } from '@/lib/storage'
import { THEMES, type Theme } from '@/lib/theme'
import NumberStepper from '@/components/NumberStepper.vue'

const ACCENT_NAMES: Record<string, string> = {
  '#0a84ff': 'Blue',
  '#30d158': 'Green',
  '#ff9f0a': 'Orange',
  '#bf5af2': 'Purple',
}

const THEME_NAMES: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' }

const store = usePlannerStore()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const panelId = useId()
const LABEL = 'text-[11px] font-semibold tracking-wider text-muted uppercase'

function onPointerDown(ev: PointerEvent): void {
  if (open.value && root.value && !root.value.contains(ev.target as Node)) open.value = false
}
function onKeydown(ev: KeyboardEvent): void {
  if (ev.key !== 'Escape' || !open.value) return
  open.value = false
  // The panel unmounts, so hand focus back rather than letting it fall to <body>.
  trigger.value?.focus()
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="root" class="relative" data-noprint>
    <button
      ref="trigger"
      type="button"
      class="btn aria-expanded:bg-subtle"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="open = !open"
    >
      <span class="size-2 rounded-full bg-accent" aria-hidden="true" />
      <!-- Below 380px a gear stands in for the word, so the navbar fits a 320px screen. -->
      <span class="hidden max-[379px]:inline" aria-hidden="true">⚙&#xFE0E;</span>
      <span class="max-[379px]:sr-only">Settings</span>
    </button>
    <div
      v-if="open"
      :id="panelId"
      class="absolute top-full right-0 z-30 mt-2 flex w-60 flex-col gap-2 rounded-xl border border-line bg-surface p-3 shadow-lg"
      role="group"
      aria-label="Settings"
    >
      <div :class="LABEL">Appearance</div>
      <div
        class="mb-1 flex rounded-lg border border-line bg-subtle p-0.5"
        role="group"
        aria-label="Theme"
      >
        <button
          v-for="t in THEMES"
          :key="t"
          type="button"
          class="segment h-7 flex-1"
          :aria-pressed="store.theme === t"
          @click="store.setTheme(t)"
        >
          {{ THEME_NAMES[t] }}
        </button>
      </div>
      <div :class="LABEL">Accent</div>
      <div class="flex gap-2.5 px-0.5 pt-0.5 pb-1.5" role="group" aria-label="Accent colour">
        <button
          v-for="c in ACCENTS"
          :key="c"
          type="button"
          class="size-5.5 rounded-full ring-offset-2 ring-offset-surface aria-pressed:ring-2 aria-pressed:ring-fg"
          :style="{ background: c }"
          :aria-pressed="store.accent === c"
          :aria-label="ACCENT_NAMES[c]"
          :title="ACCENT_NAMES[c]"
          @click="store.setAccent(c)"
        />
      </div>
      <div :class="LABEL">Exercises per day</div>
      <div class="flex items-center justify-between">
        <span class="font-mono text-xl font-semibold" aria-live="polite" data-testid="daily-pick">
          {{ store.dailyPick }}
        </span>
        <NumberStepper
          :value="store.dailyPick"
          :min="MIN_DAILY_PICK"
          :max="MAX_DAILY_PICK"
          lower-title="Fewer per day"
          raise-title="More per day"
          lower-label="Fewer exercises per day"
          raise-label="More exercises per day"
          @change="store.changeDailyPick"
        />
      </div>
    </div>
  </div>
</template>
