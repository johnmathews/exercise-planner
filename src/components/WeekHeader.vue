<script setup lang="ts">
import { usePlannerStore } from '@/stores/planner'

const store = usePlannerStore()
</script>

<template>
  <section class="heading">
    <div class="left">
      <h1>{{ store.label }}</h1>
      <div class="sub">
        Pick {{ store.dailyPick }} exercises a day. Click a cell when it’s done.
      </div>
    </div>
    <div class="total">
      <div class="mono value" data-testid="grand-total">{{ store.grandTotal }}</div>
      <div class="sub">sessions this week</div>
    </div>
  </section>
</template>

<style scoped>
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

h1 {
  margin: 0;
  font-size: 30px;
  font-weight: 700;
  letter-spacing: -0.025em;
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
  font-size: 30px;
  font-weight: 600;
  color: var(--accent);
}
</style>
