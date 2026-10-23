<script setup lang="ts">
import { usePlannerStore } from '@/stores/planner'
import { useExerciseForm } from '@/composables/exerciseForm'
import PerSideToggle from '@/components/PerSideToggle.vue'

const store = usePlannerStore()
const form = useExerciseForm()
const { name, reps, weight, perSide } = form

function submit(): void {
  if (store.addExercise(form.value())) form.load()
}
</script>

<template>
  <form class="flex flex-wrap items-center gap-2 pt-4" data-noprint @submit.prevent="submit">
    <input
      v-model="name"
      class="field min-w-0 flex-[1_1_220px]"
      placeholder="New exercise"
      aria-label="New exercise name"
    />
    <input
      :value="reps"
      class="field w-20"
      placeholder="Reps"
      inputmode="numeric"
      aria-label="Reps"
      @input="form.onRepsInput"
    />
    <PerSideToggle v-model="perSide" />
    <input
      :value="weight"
      class="field w-24"
      placeholder="Weight kg"
      inputmode="decimal"
      aria-label="Weight in kg (optional)"
      @input="form.onWeightInput"
    />
    <button type="submit" class="btn-primary">Add Exercise</button>
  </form>
</template>
