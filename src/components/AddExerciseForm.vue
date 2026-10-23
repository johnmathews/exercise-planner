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
  <form class="add" data-noprint @submit.prevent="submit">
    <input
      v-model="name"
      class="field name"
      placeholder="New exercise"
      aria-label="New exercise name"
    />
    <input
      :value="reps"
      class="field reps"
      placeholder="Reps"
      inputmode="numeric"
      aria-label="Reps"
      @input="onRepsInput"
    />
    <div class="segmented" role="group" aria-label="Reps count">
      <button
        type="button"
        class="seg"
        :class="{ selected: !perSide }"
        :aria-pressed="!perSide"
        @click="perSide = false"
      >
        per set
      </button>
      <button
        type="button"
        class="seg"
        :class="{ selected: perSide }"
        :aria-pressed="perSide"
        @click="perSide = true"
      >
        each side, per set
      </button>
    </div>
    <button type="submit" class="submit">Add Exercise</button>
  </form>
</template>

<style scoped>
.add {
  padding: 20px 28px 28px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

/* content-box, as in the prototype: the rendered fields are 34px tall and the reps box 92px wide. */
.field {
  box-sizing: content-box;
  height: 32px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--toolbar);
  font-size: 13px;
  color: var(--text);
}

.field:focus {
  border-color: var(--focus);
  box-shadow: var(--focus-ring);
}

.name {
  flex: 1 1 220px;
}

.reps {
  width: 70px;
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
  height: 26px;
  padding: 0 10px;
  border: none;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  background: transparent;
  color: var(--text-2);
}

.seg.selected {
  background: var(--border-strong);
  color: var(--text);
}

.submit {
  height: 32px;
  padding: 0 16px;
  border: none;
  background: #0a84ff;
  color: #fff;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 600;
}

.submit:hover {
  background: #409cff;
}
</style>
