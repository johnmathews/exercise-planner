<script setup lang="ts">
import { computed } from 'vue'
import { usePlannerStore } from '@/stores/planner'
import { useDietStore } from '@/stores/diet'
import TrackerGrid from '@/components/TrackerGrid.vue'
import AddFoodForm from '@/components/AddFoodForm.vue'

const planner = usePlannerStore()
const diet = useDietStore()

// No daily target for foods, so counts are neutral: muted at zero, plain otherwise.
const counts = computed(() =>
  diet.dayCounts.map((n) => ({
    text: String(n),
    tone: n > 0 ? ('plain' as const) : ('under' as const),
  })),
)

function flagsFor(id: string): boolean[] {
  return planner.days.map((_, i) => diet.isEaten(id, i))
}
</script>

<template>
  <section
    class="mt-10 border-t border-line print:mt-6 print:border-0"
    aria-labelledby="diet-heading"
  >
    <div class="flex flex-wrap items-end justify-between gap-3 pt-8 pb-2 print:pt-0">
      <div class="flex flex-col gap-1">
        <h2 id="diet-heading" class="text-xl font-bold tracking-tight">Diet</h2>
        <p class="text-sm text-muted">Click a cell on each day you ate it.</p>
      </div>
      <div class="flex items-baseline gap-1.5">
        <div class="font-mono text-xl font-semibold text-accent-fg" data-testid="diet-goals-met">
          {{ diet.goalsMet }}<span class="text-sm text-faint"> / {{ diet.foods.length }}</span>
        </div>
        <div class="text-sm text-muted">goals met</div>
      </div>
    </div>
    <TrackerGrid
      label="Food"
      table-label="Foods this week"
      :items="diet.foods"
      :days="planner.days"
      :flags-for="flagsFor"
      :total-for="diet.totalFor"
      footer-label="Eaten"
      :config-mode="planner.configMode"
      :counts="counts"
      :grand-total="diet.grandTotal"
      data-testid="diet-grid"
      @toggle="diet.toggle"
      @change-target="diet.changeTarget"
      @remove="diet.removeFood"
    />
    <AddFoodForm v-if="planner.configMode" />
  </section>
</template>
