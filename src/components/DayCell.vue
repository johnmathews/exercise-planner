<script setup lang="ts">
defineProps<{ on: boolean; today: boolean; label: string }>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <div role="cell" class="cell" :class="{ today }">
    <!-- A real button, so the grid works from the keyboard (the prototype used a clickable div). -->
    <button
      type="button"
      class="hit"
      :aria-pressed="on"
      :aria-label="label"
      @click="$emit('toggle')"
    >
      <span class="box" :class="{ on }" :data-on="on">{{ on ? '✓' : '' }}</span>
    </button>
  </div>
</template>

<style scoped>
.cell {
  border-bottom: 1px solid var(--border-subtle);
  border-left: 1px solid var(--border-subtle);
  display: flex;
}

.cell.today {
  background: var(--today-col);
}

.hit {
  flex: 1;
  display: flex;
  padding: 6px;
  border: none;
  background: transparent;
  color: inherit;
}

.box {
  flex: 1;
  min-height: 38px;
  border-radius: 6px;
  background: var(--window);
  border: 1px solid var(--border);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  transition: background-color 120ms;
}

.box.on {
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
}
</style>
