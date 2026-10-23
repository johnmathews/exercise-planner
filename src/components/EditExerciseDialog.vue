<script setup lang="ts">
import { onMounted, ref, useId } from 'vue'
import type { Exercise } from '@/lib/storage'
import { usePlannerStore } from '@/stores/planner'
import { useExerciseForm } from '@/composables/exerciseForm'
import PerSideToggle from '@/components/PerSideToggle.vue'

const props = defineProps<{ exercise: Exercise }>()
const emit = defineEmits<{ close: [] }>()

const store = usePlannerStore()
const form = useExerciseForm()
const { name, sets, reps, weight, perSide } = form
form.load(props.exercise)

const dialog = ref<HTMLDialogElement | null>(null)
const titleId = useId()
const LABEL = 'flex flex-col gap-1 text-xs font-medium text-muted'

// A native modal dialog: it traps focus, closes on Escape and returns focus to the opener.
onMounted(() => dialog.value?.showModal())

function save(): void {
  if (store.updateExercise(props.exercise.id, form.value())) dialog.value?.close()
}
</script>

<template>
  <dialog
    ref="dialog"
    data-noprint
    class="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-5 text-fg shadow-xl backdrop:bg-black/40"
    :aria-labelledby="titleId"
    @close="emit('close')"
  >
    <form class="flex flex-col gap-4" @submit.prevent="save">
      <h2 :id="titleId" class="text-lg font-semibold tracking-tight">Edit exercise</h2>
      <label :class="LABEL">
        Name
        <input v-model="name" class="field" required pattern=".*\S.*" title="Enter a name" />
      </label>
      <div class="flex flex-wrap items-end gap-2">
        <label :class="LABEL">
          Sets
          <input
            :value="sets"
            maxlength="2"
            class="field w-16"
            inputmode="numeric"
            data-field="sets"
            @input="form.onSetsInput"
          />
        </label>
        <label :class="LABEL">
          Reps
          <input
            :value="reps"
            class="field w-20"
            inputmode="numeric"
            data-field="reps"
            @input="form.onRepsInput"
          />
        </label>
        <PerSideToggle v-model="perSide" />
      </div>
      <label :class="LABEL">
        Weight (kg, optional)
        <input
          :value="weight"
          class="field w-28"
          inputmode="decimal"
          placeholder="e.g. 12"
          @input="form.onWeightInput"
        />
      </label>
      <div class="flex justify-end gap-2 pt-1">
        <button type="button" class="btn h-9" @click="dialog?.close()">Cancel</button>
        <button type="submit" class="btn-primary">Save</button>
      </div>
    </form>
  </dialog>
</template>
