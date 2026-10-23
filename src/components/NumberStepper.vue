<script setup lang="ts">
const props = defineProps<{
  value: number
  min: number
  max: number
  lowerLabel: string
  raiseLabel: string
  lowerTitle: string
  raiseTitle: string
}>()
const emit = defineEmits<{ change: [delta: number] }>()

// aria-disabled rather than disabled: a disabled button drops focus mid-press for keyboard users.
function step(delta: number): void {
  const next = props.value + delta
  if (next >= props.min && next <= props.max) emit('change', delta)
}
</script>

<template>
  <div class="stepper">
    <button
      type="button"
      :title="lowerTitle"
      :aria-label="lowerLabel"
      :aria-disabled="value <= min"
      @click="step(-1)"
    >
      −
    </button>
    <div class="divider" />
    <button
      type="button"
      :title="raiseTitle"
      :aria-label="raiseLabel"
      :aria-disabled="value >= max"
      @click="step(1)"
    >
      +
    </button>
  </div>
</template>

<style scoped>
.stepper {
  display: flex;
  background: var(--window);
  border: 1px solid var(--border);
  border-radius: 5px;
  overflow: hidden;
}

button {
  width: 24px;
  height: 20px;
  border: none;
  background: transparent;
  font-size: 12px;
  color: var(--text-2);
}

button:hover:not([aria-disabled='true']) {
  background: var(--border);
  color: var(--text);
}

button[aria-disabled='true'] {
  color: var(--text-3);
  cursor: default;
}

.divider {
  width: 1px;
  background: var(--border);
}
</style>
