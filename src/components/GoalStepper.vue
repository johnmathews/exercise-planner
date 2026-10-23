<script setup lang="ts">
import { MAX_TARGET, MIN_TARGET } from '@/lib/storage'

defineProps<{ value: number; name: string }>()
defineEmits<{ change: [delta: number] }>()
</script>

<template>
  <div class="stepper" data-noprint>
    <button
      type="button"
      title="Lower goal"
      :aria-label="`Lower ${name} goal`"
      :disabled="value <= MIN_TARGET"
      @click="$emit('change', -1)"
    >
      −
    </button>
    <div class="divider" />
    <button
      type="button"
      title="Raise goal"
      :aria-label="`Raise ${name} goal`"
      :disabled="value >= MAX_TARGET"
      @click="$emit('change', 1)"
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

button:hover:not(:disabled) {
  background: var(--border);
  color: var(--text);
}

button:disabled {
  color: var(--text-3);
  cursor: default;
}

.divider {
  width: 1px;
  background: var(--border);
}
</style>
