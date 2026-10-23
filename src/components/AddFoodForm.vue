<script setup lang="ts">
import { ref } from 'vue'
import { useDietStore } from '@/stores/diet'

const store = useDietStore()
const name = ref('')

function submit(): void {
  if (store.addFood(name.value)) name.value = ''
}
</script>

<template>
  <form class="flex flex-wrap items-center gap-2 pt-4" data-noprint @submit.prevent="submit">
    <input
      v-model="name"
      class="field min-w-0 flex-[1_1_220px]"
      placeholder="New food"
      aria-label="New food name"
    />
    <button type="submit" class="btn-primary">Add Food</button>
  </form>
</template>
