<script setup lang="ts">
const perSide = defineModel<boolean>({ required: true })
</script>

<template>
  <div
    class="flex h-9 rounded-lg border border-line bg-subtle p-0.5"
    role="group"
    aria-label="Reps count"
  >
    <button type="button" class="segment px-2.5" :aria-pressed="!perSide" @click="perSide = false">
      per set
    </button>
    <button type="button" class="segment px-2.5" :aria-pressed="perSide" @click="perSide = true">
      each side, per set
    </button>
  </div>
</template>
