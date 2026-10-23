<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { usePlannerStore } from '@/stores/planner'
import { ACCENTS, MAX_DAILY_PICK, MIN_DAILY_PICK } from '@/lib/storage'

const ACCENT_NAMES: Record<string, string> = {
  '#0a84ff': 'Blue',
  '#30d158': 'Green',
  '#ff9f0a': 'Orange',
  '#bf5af2': 'Purple',
}

const store = usePlannerStore()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const panelId = useId()

function onPointerDown(ev: PointerEvent): void {
  if (open.value && root.value && !root.value.contains(ev.target as Node)) open.value = false
}
function onKeydown(ev: KeyboardEvent): void {
  if (ev.key === 'Escape') open.value = false
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
  <div ref="root" class="settings" data-noprint>
    <button
      type="button"
      class="trigger"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="open = !open"
    >
      <span class="dot" aria-hidden="true" />Settings
    </button>
    <div v-if="open" :id="panelId" class="panel" role="dialog" aria-label="Settings">
      <div class="label">Accent</div>
      <div class="swatches" role="radiogroup" aria-label="Accent colour">
        <button
          v-for="c in ACCENTS"
          :key="c"
          type="button"
          role="radio"
          class="swatch"
          :class="{ selected: store.accent === c }"
          :style="{ background: c }"
          :aria-checked="store.accent === c"
          :aria-label="ACCENT_NAMES[c]"
          :title="ACCENT_NAMES[c]"
          @click="store.setAccent(c)"
        />
      </div>
      <div class="label">Exercises per day</div>
      <div class="pick-row">
        <span class="mono pick-value" aria-live="polite">{{ store.dailyPick }}</span>
        <div class="stepper">
          <button
            type="button"
            title="Fewer per day"
            aria-label="Fewer exercises per day"
            :disabled="store.dailyPick <= MIN_DAILY_PICK"
            @click="store.changeDailyPick(-1)"
          >
            −
          </button>
          <div class="divider" />
          <button
            type="button"
            title="More per day"
            aria-label="More exercises per day"
            :disabled="store.dailyPick >= MAX_DAILY_PICK"
            @click="store.changeDailyPick(1)"
          >
            +
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings {
  position: relative;
}

.trigger {
  height: 28px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--border);
  background: var(--border);
  color: var(--text);
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
}

.trigger:hover,
.trigger[aria-expanded='true'] {
  background: var(--border-strong);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
}

.panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 10;
  width: 200px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: var(--toolbar);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}

.label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-2);
}

.swatches {
  display: flex;
  gap: 10px;
  padding: 2px 2px 6px;
}

.swatch {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  padding: 0;
}

.swatch.selected {
  box-shadow:
    0 0 0 2px var(--toolbar),
    0 0 0 4px var(--text);
}

.pick-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pick-value {
  font-size: 20px;
  font-weight: 600;
}

.stepper {
  display: flex;
  background: var(--window);
  border: 1px solid var(--border);
  border-radius: 5px;
  overflow: hidden;
}

.stepper button {
  width: 24px;
  height: 20px;
  border: none;
  background: transparent;
  font-size: 12px;
  color: var(--text-2);
}

.stepper button:hover:not(:disabled) {
  background: var(--border);
  color: var(--text);
}

.stepper button:disabled {
  color: var(--text-3);
  cursor: default;
}

.divider {
  width: 1px;
  background: var(--border);
}
</style>
