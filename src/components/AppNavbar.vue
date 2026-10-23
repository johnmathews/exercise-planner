<script setup lang="ts">
import { usePlannerStore } from '@/stores/planner'
import SettingsPopover from '@/components/SettingsPopover.vue'

const store = usePlannerStore()
const ARROW = 'px-2 text-muted hover:bg-subtle hover:text-fg sm:px-2.5'

function print(): void {
  window.print()
}
</script>

<template>
  <header
    class="sticky top-0 z-20 border-b border-line bg-surface/85 backdrop-blur-md"
    data-noprint
  >
    <div class="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
      <div class="hidden items-center gap-2 font-semibold tracking-tight sm:flex">
        <img src="/favicon.svg" alt="" class="size-7" />
        <span>Workout Log</span>
      </div>
      <div class="ml-auto flex items-center gap-1.5 sm:gap-2">
        <div
          class="flex h-8 items-stretch rounded-lg border border-line bg-surface shadow-xs"
          role="group"
          aria-label="Week navigation"
        >
          <button
            type="button"
            :class="[ARROW, 'rounded-l-[7px]']"
            title="Previous week"
            aria-label="Previous week"
            @click="store.prevWeek"
          >
            ‹
          </button>
          <button
            type="button"
            class="border-x border-line px-2.5 text-sm font-medium whitespace-nowrap hover:bg-subtle sm:px-3"
            @click="store.thisWeek"
          >
            This Week
          </button>
          <button
            type="button"
            :class="[ARROW, 'rounded-r-[7px]']"
            title="Next week"
            aria-label="Next week"
            @click="store.nextWeek"
          >
            ›
          </button>
        </div>
        <button
          type="button"
          role="switch"
          class="flex h-8 items-center gap-2 rounded-lg px-1.5 text-sm font-medium whitespace-nowrap hover:bg-subtle"
          :aria-checked="store.configMode"
          aria-label="Edit plan"
          title="Edit the week's plan: exercises, foods, sets, reps, weights and goals"
          @click="store.setConfigMode(!store.configMode)"
        >
          <span
            class="relative h-5 w-9 shrink-0 rounded-full transition-colors"
            :class="store.configMode ? 'bg-accent' : 'bg-line-strong'"
            aria-hidden="true"
          >
            <span
              class="absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform"
              :class="{ 'translate-x-4': store.configMode }"
            />
          </span>
          <span class="sm:hidden" aria-hidden="true">Edit</span>
          <span class="hidden sm:inline" aria-hidden="true">Edit plan</span>
        </button>
        <SettingsPopover />
        <!-- Printing from a phone is rare, and the bar has no room for it there. -->
        <button type="button" class="btn hidden sm:inline-flex" @click="print">Print…</button>
      </div>
    </div>
  </header>
</template>
