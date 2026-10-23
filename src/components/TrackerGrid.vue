<script setup lang="ts">
import type { Day } from '@/stores/planner'
import type { CountTone, Tracked } from '@/lib/tracker'
import TrackerRow from '@/components/TrackerRow.vue'

defineProps<{
  /** First-column header: "Exercise" or "Food". */
  label: string
  tableLabel: string
  items: Tracked[]
  days: Day[]
  flagsFor: (id: string) => boolean[]
  totalFor: (id: string) => number
  detailFor?: (item: Tracked) => string
  footerLabel: string
  counts: { text: string; tone: CountTone }[]
  grandTotal: number
}>()
const LABEL =
  'flex items-center py-2.5 text-[11px] font-semibold tracking-wider text-muted uppercase'
const HEAD = 'border-b border-line'
const COUNT = 'border-l bg-subtle px-1 py-2.5 text-center font-mono text-sm font-semibold'
const TONE: Record<CountTone, string> = {
  met: 'text-accent-fg',
  over: 'text-warn',
  under: 'text-faint',
  plain: 'text-muted',
}

defineEmits<{
  toggle: [id: string, day: number]
  changeTarget: [id: string, delta: number]
  remove: [id: string]
}>()
</script>

<template>
  <div
    class="mt-4 overflow-x-auto rounded-xl border border-line bg-surface shadow-xs print:break-inside-avoid print:overflow-visible"
  >
    <div
      class="grid min-w-[780px] grid-cols-[minmax(220px,1.7fr)_repeat(7,minmax(64px,1fr))_minmax(124px,0.9fr)]"
      role="table"
      :aria-label="tableLabel"
    >
      <div role="row" class="contents">
        <div role="columnheader" :class="[LABEL, HEAD, 'bg-subtle px-4']">{{ label }}</div>
        <div
          v-for="d in days"
          :key="d.key"
          role="columnheader"
          :class="[
            HEAD,
            'flex flex-col gap-px border-l border-l-line-subtle px-1 py-2 text-center',
            // Not both: Tailwind's own utility order, not class order, would let bg-subtle win.
            d.isToday ? 'bg-accent/10 text-accent-fg' : 'bg-subtle',
          ]"
          :data-today="d.isToday"
          data-testid="day-head"
        >
          <div class="text-xs font-semibold">{{ d.name }}</div>
          <div class="font-mono text-[11px]" :class="d.isToday ? 'text-accent-fg' : 'text-muted'">
            {{ d.date }}
          </div>
        </div>
        <div
          role="columnheader"
          :class="[LABEL, HEAD, 'justify-center border-l border-l-line-strong bg-subtle px-3']"
        >
          Week
        </div>
      </div>

      <TrackerRow
        v-for="it in items"
        :key="it.id"
        :item="it"
        :detail="detailFor?.(it)"
        :days="days"
        :flags="flagsFor(it.id)"
        :total="totalFor(it.id)"
        @toggle="$emit('toggle', it.id, $event)"
        @change-target="$emit('changeTarget', it.id, $event)"
        @remove="$emit('remove', it.id)"
      />

      <div role="row" class="contents">
        <div role="rowheader" :class="[LABEL, 'bg-subtle px-4']">{{ footerLabel }}</div>
        <div
          v-for="(c, i) in counts"
          :key="i"
          role="cell"
          :class="[COUNT, 'border-l-line-subtle', TONE[c.tone]]"
          :data-tone="c.tone"
          data-testid="day-count"
        >
          {{ c.text }}
        </div>
        <div role="cell" :class="[COUNT, 'border-l-line-strong text-fg']">{{ grandTotal }}</div>
      </div>
    </div>
  </div>
</template>
