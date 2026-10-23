<script setup lang="ts">
import { ref } from 'vue'
import { usePlannerStore } from '@/stores/planner'

const store = usePlannerStore()
const name = ref('')
const reps = ref('')
const perSide = ref(false)

function onRepsInput(ev: Event): void {
  const input = ev.target as HTMLInputElement
  reps.value = input.value.replace(/\D/g, '')
  // Keep the DOM in step even when the digits-only value didn't change (e.g. typing a letter).
  input.value = reps.value
}

function submit(): void {
  const added = store.addExercise({
    name: name.value,
    reps: parseInt(reps.value, 10) || 0,
    perSide: perSide.value,
  })
  if (!added) return
  name.value = ''
  reps.value = ''
  perSide.value = false
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
      class="field w-24"
      placeholder="Reps"
      inputmode="numeric"
      aria-label="Reps"
      @input="onRepsInput"
    />
    <div
      class="flex h-9 rounded-lg border border-line bg-subtle p-0.5"
      role="group"
      aria-label="Reps count"
    >
      <button
        type="button"
        class="segment px-2.5"
        :aria-pressed="!perSide"
        @click="perSide = false"
      >
        per set
      </button>
      <button type="button" class="segment px-2.5" :aria-pressed="perSide" @click="perSide = true">
        each side, per set
      </button>
    </div>
    <button type="submit" class="btn-primary">Add Exercise</button>
  </form>
</template>
