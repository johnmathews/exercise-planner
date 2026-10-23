<script setup lang="ts">
import { computed } from 'vue'
import { repsLabel, usePlannerStore } from '@/stores/planner'
import type { Exercise } from '@/lib/storage'
import type { CountTone, Tracked } from '@/lib/tracker'
import TrackerGrid from '@/components/TrackerGrid.vue'

const store = usePlannerStore()

function tone(n: number): CountTone {
  if (n === store.dailyPick) return 'met'
  return n > store.dailyPick ? 'over' : 'under'
}

const counts = computed(() =>
  store.dayCounts.map((n) => ({ text: `${n}/${store.dailyPick}`, tone: tone(n) })),
)

function flagsFor(id: string): boolean[] {
  return store.days.map((_, i) => store.isDone(id, i))
}

// The grid hands back the item it was given, which is always an Exercise here.
function detailFor(item: Tracked): string {
  return repsLabel(item as Exercise)
}
</script>

<template>
  <TrackerGrid
    label="Exercise"
    table-label="Exercises this week"
    :items="store.exercises"
    :days="store.days"
    :flags-for="flagsFor"
    :total-for="store.totalFor"
    :detail-for="detailFor"
    :footer-label="`Picked / ${store.dailyPick}`"
    :counts="counts"
    :grand-total="store.grandTotal"
    data-testid="exercise-grid"
    @toggle="store.toggle"
    @change-target="store.changeTarget"
    @remove="store.removeExercise"
  />
</template>
