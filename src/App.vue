<script setup lang="ts">
import { onBeforeUnmount, onMounted, watchEffect } from 'vue'
import { usePlannerStore } from '@/stores/planner'
import TitleBar from '@/components/TitleBar.vue'
import WeekHeader from '@/components/WeekHeader.vue'
import PlannerGrid from '@/components/PlannerGrid.vue'
import AddExerciseForm from '@/components/AddExerciseForm.vue'

const store = usePlannerStore()

// The accent is a user setting, so it lives in a CSS variable rather than in the stylesheets.
watchEffect(() => document.documentElement.style.setProperty('--accent', store.accent))

function onVisible(): void {
  if (document.visibilityState === 'visible') store.refreshNow()
}
onMounted(() => document.addEventListener('visibilitychange', onVisible))
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible))
</script>

<template>
  <div class="page">
    <main class="window" data-window>
      <TitleBar />
      <WeekHeader />
      <PlannerGrid />
      <AddExerciseForm />
    </main>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  padding: 40px 24px 64px;
  background: radial-gradient(1200px 600px at 50% -10%, #26262a, var(--bg-page));
}

@media (max-width: 600px) {
  .page {
    padding: 16px 12px 32px;
  }
}

.window {
  max-width: 1120px;
  margin: 0 auto;
  background: var(--window);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  box-shadow:
    0 30px 80px rgba(0, 0, 0, 0.55),
    0 0 0 0.5px rgba(0, 0, 0, 0.8);
}
</style>
