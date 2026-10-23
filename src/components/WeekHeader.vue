<script setup lang="ts">
import { usePlannerStore } from '@/stores/planner'

const store = usePlannerStore()
</script>

<template>
  <section class="flex flex-wrap items-end justify-between gap-3 pt-8 pb-2 print:pt-0">
    <div class="flex flex-col gap-1">
      <h1 class="text-3xl font-bold tracking-tight">{{ store.label }}</h1>
      <p class="text-sm text-muted" data-testid="pick-hint">
        Pick {{ store.dailyPick }} exercises a day. Click a cell when it’s done.
      </p>
    </div>
    <div class="flex items-baseline gap-1.5">
      <div class="font-mono text-3xl font-semibold text-accent-fg" data-testid="grand-total">
        {{ store.grandTotal }}
      </div>
      <div class="text-sm text-muted">sessions this week</div>
    </div>
  </section>
</template>
