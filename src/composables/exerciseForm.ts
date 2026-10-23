import { ref } from 'vue'
import type { Exercise } from '@/lib/storage'
import type { NewExercise } from '@/stores/planner'

/** Keeps the DOM in step even when the cleaned value didn't change (e.g. typing a letter). */
function clean(ev: Event, fn: (text: string) => string): string {
  const input = ev.target as HTMLInputElement
  input.value = fn(input.value)
  return input.value
}

/** Digits only. */
export function digitsOnly(text: string): string {
  return text.replace(/\D/g, '')
}

/** Digits and one decimal point; a comma counts as the point. */
export function decimalOnly(text: string): string {
  const [whole = '', ...rest] = text
    .replace(/,/g, '.')
    .replace(/[^\d.]/g, '')
    .split('.')
  return rest.length ? `${whole}.${rest.join('')}` : whole
}

/** State and input handling shared by the add-exercise form and the edit dialog. */
export function useExerciseForm() {
  const name = ref('')
  const reps = ref('')
  const weight = ref('')
  const perSide = ref(false)

  function onRepsInput(ev: Event): void {
    reps.value = clean(ev, digitsOnly)
  }
  function onWeightInput(ev: Event): void {
    weight.value = clean(ev, decimalOnly)
  }

  function value(): NewExercise {
    return {
      name: name.value,
      reps: parseInt(reps.value, 10) || 0,
      perSide: perSide.value,
      weight: parseFloat(weight.value) || undefined,
    }
  }

  function load(e?: Exercise): void {
    name.value = e?.name ?? ''
    reps.value = e?.reps ? String(e.reps) : ''
    weight.value = e?.weight ? String(e.weight) : ''
    perSide.value = e?.perSide ?? false
  }

  return { name, reps, weight, perSide, onRepsInput, onWeightInput, value, load }
}
