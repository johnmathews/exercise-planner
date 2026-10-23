<script setup lang="ts">
import { usePlannerStore } from '@/stores/planner'
import SettingsPopover from '@/components/SettingsPopover.vue'

const store = usePlannerStore()

function print(): void {
  window.print()
}
</script>

<template>
  <header class="toolbar" data-surface>
    <div class="lights" data-noprint aria-hidden="true">
      <span style="background: #ff5f57" />
      <span style="background: #febc2e" />
      <span style="background: #28c840" />
    </div>
    <div class="title">
      <div class="app-name">Workout Log</div>
      <div class="week">{{ store.label }}</div>
    </div>
    <div class="controls" data-noprint>
      <nav class="segmented" aria-label="Week navigation">
        <button type="button" class="seg arrow" title="Previous week" @click="store.prevWeek">
          ‹
        </button>
        <button type="button" class="seg current" @click="store.thisWeek">This Week</button>
        <button type="button" class="seg arrow" title="Next week" @click="store.nextWeek">›</button>
      </nav>
      <SettingsPopover />
      <button type="button" class="action" @click="print">Print…</button>
    </div>
  </header>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--toolbar);
  border-bottom: 1px solid #000;
}

.lights {
  display: flex;
  gap: 8px;
  padding-right: 6px;
}

.lights span {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.title {
  flex: 1;
  min-width: 180px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.app-name {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.week {
  font-size: 11px;
  color: var(--text-2);
}

.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.segmented {
  display: flex;
  background: var(--window);
  border: 1px solid var(--border);
  border-radius: 7px;
  padding: 2px;
  gap: 2px;
}

.seg {
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text);
  border-radius: 5px;
  font-weight: 500;
}

.seg.arrow {
  min-width: 30px;
  padding: 0 8px;
  font-size: 13px;
}

.seg.arrow:hover {
  background: var(--border);
}

.seg.current {
  padding: 0 10px;
  font-size: 12px;
  background: var(--border);
}

.seg.current:hover {
  background: var(--border-strong);
}

.action {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--border);
  background: var(--border);
  color: var(--text);
  border-radius: 7px;
  font-size: 12px;
  font-weight: 500;
}

.action:hover {
  background: var(--border-strong);
}
</style>
