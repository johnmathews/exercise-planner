<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { exerciseDetails, usePlannerStore } from '@/stores/planner'
import type { Exercise } from '@/lib/storage'
import type { CountTone, Tracked } from '@/lib/tracker'
import TrackerGrid from '@/components/TrackerGrid.vue'
import EditExerciseDialog from '@/components/EditExerciseDialog.vue'

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
function detailsFor(item: Tracked): string[] {
  return exerciseDetails(item as Exercise)
}

const editing = ref<Exercise | null>(null)

function edit(id: string): void {
  editing.value = store.exercises.find((e) => e.id === id) ?? null
}

// Another tab can delete the exercise while its dialog is open here; close it rather than leave
// a Save that can't apply.
watch(
  () => store.exercises,
  (list) => {
    if (editing.value && !list.some((e) => e.id === editing.value!.id)) editing.value = null
  },
)
</script>

<template>
  <TrackerGrid
    label="Exercise"
    table-label="Exercises this week"
    :items="store.exercises"
    :days="store.days"
    :flags-for="flagsFor"
    :total-for="store.totalFor"
    :details-for="detailsFor"
    editable
    :footer-label="`Picked / ${store.dailyPick}`"
    :counts="counts"
    :grand-total="store.grandTotal"
    data-testid="exercise-grid"
    @toggle="store.toggle"
    @change-target="store.changeTarget"
    @remove="store.removeExercise"
    @edit="edit"
  />
  <EditExerciseDialog v-if="editing" :exercise="editing" @close="editing = null" />
</template>
