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
  <section class="diet" aria-labelledby="diet-heading">
    <div class="heading">
      <div class="left">
        <h2 id="diet-heading">Diet</h2>
        <div class="sub">Click a cell on each day you ate it.</div>
      </div>
      <div class="total">
        <div class="mono value" data-testid="diet-goals-met">
          {{ diet.goalsMet }}<span class="of"> / {{ diet.foods.length }}</span>
        </div>
        <div class="sub">goals met</div>
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
      :counts="counts"
      :grand-total="diet.grandTotal"
      data-testid="diet-grid"
      @toggle="diet.toggle"
      @change-target="diet.changeTarget"
      @remove="diet.removeFood"
    />
    <AddFoodForm />
  </section>
</template>

<style scoped>
.diet {
  border-top: 1px solid var(--border-subtle);
}

.heading {
  padding: 28px 28px 8px;
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

h2 {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.sub {
  font-size: 13px;
  color: var(--text-2);
}

.total {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.value {
  font-size: 20px;
  font-weight: 600;
  color: var(--accent);
}

.of {
  font-size: 13px;
  color: var(--text-3);
}
</style>
