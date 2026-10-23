<script setup lang="ts">
import { usePlannerStore } from '@/stores/planner'
import ExerciseRow from '@/components/ExerciseRow.vue'

const store = usePlannerStore()

function countClass(n: number): string {
  if (n === store.dailyPick) return 'met'
  return n > store.dailyPick ? 'over' : 'under'
}
</script>

<template>
  <div class="grid-scroll">
    <div class="grid" role="table" aria-label="Exercises this week" data-surface>
      <div role="row" class="contents">
        <div role="columnheader" class="head label-cell" data-surface>Exercise</div>
        <div
          v-for="d in store.days"
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

      <ExerciseRow v-for="e in store.exercises" :key="e.id" :exercise="e" />

      <div role="row" class="contents">
        <div role="rowheader" class="foot label-cell" data-surface>
          Picked / {{ store.dailyPick }}
        </div>
        <div
          v-for="(n, i) in store.dayCounts"
          :key="i"
          role="cell"
          class="foot mono count"
          :class="countClass(n)"
          data-surface
          data-testid="day-count"
        >
          {{ n }}/{{ store.dailyPick }}
        </div>
        <div role="cell" class="foot mono count grand" data-surface>{{ store.grandTotal }}</div>
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

.count.grand {
  padding: 10px;
  border-left-color: var(--border-strong);
  color: var(--text);
}
</style>
