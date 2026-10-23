<script setup lang="ts">
defineProps<{ on: boolean; today: boolean; label: string }>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <div
    role="cell"
    class="flex border-b border-l border-line-subtle"
    :class="{ 'bg-accent/5': today }"
    :data-today="today"
  >
    <!-- A real button, so the grid works from the keyboard (the prototype used a clickable div). -->
    <button
      type="button"
      class="group flex flex-1 p-1.5"
      :aria-pressed="on"
      :aria-label="label"
      @click="$emit('toggle')"
    >
      <span
        class="flex min-h-[38px] flex-1 items-center justify-center rounded-md border text-[15px] font-bold text-white transition-colors"
        :class="
          on
            ? 'border-accent bg-accent'
            : 'border-line bg-well shadow-inner group-hover:border-line-strong'
        "
        :data-on="on"
      >
        {{ on ? '✓' : '' }}
      </span>
    </button>
  </div>
</template>
