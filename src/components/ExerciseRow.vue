<script setup lang="ts">
import { computed } from 'vue'
import { repsLabel, usePlannerStore } from '@/stores/planner'
import type { Exercise } from '@/lib/storage'
import DayCell from '@/components/DayCell.vue'
import GoalStepper from '@/components/GoalStepper.vue'

const props = defineProps<{ exercise: Exercise }>()

const store = usePlannerStore()
const total = computed(() => store.totalFor(props.exercise.id))
const goalMet = computed(() => props.exercise.target > 0 && total.value >= props.exercise.target)

function remove(): void {
  if (window.confirm(`Remove ${props.exercise.name}?`)) store.removeExercise(props.exercise.id)
}
</script>

<template>
  <!-- display: contents keeps every cell a direct child of the parent grid. -->
  <div role="row" class="row">
    <div role="rowheader" class="name-cell">
      <div class="name-wrap">
        <div class="name">{{ exercise.name }}</div>
        <div class="chip-row">
          <span class="mono chip">{{ repsLabel(exercise) }}</span>
        </div>
      </div>
      <button
        type="button"
        class="remove"
        title="Remove"
        :aria-label="`Remove ${exercise.name}`"
        data-noprint
        @click="remove"
      >
        ×
      </button>
    </div>
    <DayCell
      v-for="(d, i) in store.days"
      :key="d.key"
      :on="store.isDone(exercise.id, i)"
      :today="d.isToday"
      :label="`${exercise.name}, ${d.name} ${d.date}`"
      @toggle="store.toggle(exercise.id, i)"
    />
    <div role="cell" class="week-cell">
      <div class="mono total" :class="{ met: goalMet }" data-testid="row-total">
        {{ total }}<span class="target"> / {{ exercise.target }}</span>
      </div>
      <GoalStepper
        :value="exercise.target"
        :name="exercise.name"
        @change="store.changeTarget(exercise.id, $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.row {
  display: contents;
}

.name-cell {
  padding: 10px 10px 10px 16px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
}

.name-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.name {
  font-weight: 600;
  font-size: 14px;
  letter-spacing: -0.01em;
}

.chip-row {
  display: flex;
}

.chip {
  font-size: 11px;
  color: var(--text-2);
  background: var(--toolbar);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 6px;
  white-space: nowrap;
}

.remove {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-3);
  border-radius: 5px;
  font-size: 15px;
}

.remove:hover {
  background: var(--border);
  color: var(--text);
}

.week-cell {
  border-bottom: 1px solid var(--border-subtle);
  border-left: 1px solid var(--border-strong);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 8px;
}

.total {
  font-size: 20px;
  font-weight: 600;
  white-space: nowrap;
  color: var(--text);
}

.total.met {
  color: var(--accent);
}

.target {
  font-size: 12px;
  color: var(--text-3);
}
</style>
