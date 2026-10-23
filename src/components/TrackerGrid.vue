<script setup lang="ts">
import type { Day } from '@/stores/planner'
import type { CountTone, Tracked } from '@/lib/tracker'
import TrackerRow from '@/components/TrackerRow.vue'

defineProps<{
  /** First-column header: "Exercise" or "Food". */
  label: string
  tableLabel: string
  items: Tracked[]
  days: Day[]
  flagsFor: (id: string) => boolean[]
  totalFor: (id: string) => number
  detailFor?: (item: Tracked) => string
  footerLabel: string
  counts: { text: string; tone: CountTone }[]
  grandTotal: number
}>()
defineEmits<{
  toggle: [id: string, day: number]
  changeTarget: [id: string, delta: number]
  remove: [id: string]
}>()
</script>

<template>
  <div class="grid-scroll">
    <div class="grid" role="table" :aria-label="tableLabel" data-surface>
      <div role="row" class="contents">
        <div role="columnheader" class="head label-cell" data-surface>{{ label }}</div>
        <div
          v-for="d in days"
          :key="d.key"
          role="columnheader"
          class="head day-head"
          :class="{ today: d.isToday }"
          data-surface
        >
          <div class="day-name">{{ d.name }}</div>
          <div class="mono day-date">{{ d.date }}</div>
        </div>
        <div role="columnheader" class="head label-cell week-head" data-surface>Week</div>
      </div>

      <TrackerRow
        v-for="it in items"
        :key="it.id"
        :item="it"
        :detail="detailFor?.(it)"
        :days="days"
        :flags="flagsFor(it.id)"
        :total="totalFor(it.id)"
        @toggle="$emit('toggle', it.id, $event)"
        @change-target="$emit('changeTarget', it.id, $event)"
        @remove="$emit('remove', it.id)"
      />

      <div role="row" class="contents">
        <div role="rowheader" class="foot label-cell" data-surface>{{ footerLabel }}</div>
        <div
          v-for="(c, i) in counts"
          :key="i"
          role="cell"
          class="foot mono count"
          :class="c.tone"
          data-surface
          data-testid="day-count"
        >
          {{ c.text }}
        </div>
        <div role="cell" class="foot mono count grand" data-surface>{{ grandTotal }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.grid-scroll {
  padding: 16px 28px 0;
  overflow-x: auto;
}

.grid {
  min-width: 780px;
  display: grid;
  grid-template-columns: minmax(220px, 1.7fr) repeat(7, minmax(64px, 1fr)) minmax(124px, 0.9fr);
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: var(--grid);
}

.contents {
  display: contents;
}

.head {
  background: var(--header);
  border-bottom: 1px solid var(--border);
}

.label-cell {
  padding: 10px 16px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-2);
  display: flex;
  align-items: center;
}

.week-head {
  padding: 10px 12px;
  justify-content: center;
  border-left: 1px solid var(--border-strong);
}

.day-head {
  padding: 8px 4px;
  text-align: center;
  border-left: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.day-head.today {
  background: var(--today-head);
}

.day-name {
  font-size: 12px;
  font-weight: 600;
}

.day-date {
  font-size: 11px;
  color: var(--text-2);
}

.day-head.today .day-name,
.day-head.today .day-date {
  color: var(--accent);
}

.foot {
  background: var(--header);
}

.count {
  padding: 10px 4px;
  text-align: center;
  border-left: 1px solid var(--border-subtle);
  font-size: 13px;
  font-weight: 600;
}

.count.met {
  color: var(--accent);
}

.count.over {
  color: var(--warn);
}

.count.under {
  color: var(--text-3);
}

.count.plain {
  color: var(--text-2);
}

.count.grand {
  padding: 10px;
  border-left-color: var(--border-strong);
  color: var(--text);
}
</style>
