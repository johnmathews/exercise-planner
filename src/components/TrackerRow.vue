<script setup lang="ts">
import { computed } from 'vue'
import type { Day } from '@/stores/planner'
import { MAX_TARGET, MIN_TARGET } from '@/lib/storage'
import { goalMet, type Tracked } from '@/lib/tracker'
import DayCell from '@/components/DayCell.vue'
import NumberStepper from '@/components/NumberStepper.vue'

const props = defineProps<{
  item: Tracked
  /** Small chips under the name, e.g. "10 reps / set" and "12 kg". Omitted for foods. */
  details?: string[]
  /** Shows an edit button (in config mode) that emits `edit`. */
  editable?: boolean
  /** Config mode shows the edit and remove buttons and the goal stepper. */
  configMode: boolean
  days: Day[]
  flags: boolean[]
  total: number
}>()
const emit = defineEmits<{
  toggle: [day: number]
  changeTarget: [delta: number]
  remove: []
  edit: []
}>()
const ICON_BUTTON = 'size-6 shrink-0 rounded-md text-faint hover:bg-subtle hover:text-fg'

const met = computed(() => goalMet(props.total, props.item.target))

function remove(): void {
  if (window.confirm(`Remove ${props.item.name}?`)) emit('remove')
}
</script>

<template>
  <!-- display: contents keeps every cell a direct child of the parent grid. -->
  <div role="row" class="contents">
    <div
      role="rowheader"
      class="flex min-h-11 items-center gap-2 border-b border-line-subtle py-2.5 pr-2.5 pl-4"
    >
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <div class="text-sm font-semibold tracking-tight" data-testid="item-name">
          {{ item.name }}
        </div>
        <div v-if="details?.length" class="flex flex-wrap gap-1">
          <span
            v-for="d in details"
            :key="d"
            class="rounded border border-line bg-subtle px-1.5 py-px font-mono text-[11px] whitespace-nowrap text-muted"
            data-testid="item-detail"
          >
            {{ d }}
          </span>
        </div>
      </div>
      <button
        v-if="configMode && editable"
        type="button"
        :class="ICON_BUTTON"
        title="Edit"
        :aria-label="`Edit ${item.name}`"
        data-noprint
        @click="emit('edit')"
      >
        ✎
      </button>
      <button
        v-if="configMode"
        type="button"
        :class="ICON_BUTTON"
        title="Remove"
        :aria-label="`Remove ${item.name}`"
        data-noprint
        @click="remove"
      >
        ×
      </button>
    </div>
    <DayCell
      v-for="(d, i) in days"
      :key="d.key"
      :on="flags[i] === true"
      :today="d.isToday"
      :label="`${item.name}, ${d.name} ${d.date}`"
      @toggle="emit('toggle', i)"
    />
    <div
      role="cell"
      class="flex flex-col items-center justify-center gap-1.5 border-b border-l border-b-line-subtle border-l-line-strong p-2"
    >
      <div
        class="font-mono text-xl font-semibold whitespace-nowrap"
        :class="met ? 'text-accent-fg' : 'text-fg'"
        :data-met="met"
        data-testid="row-total"
      >
        {{ total }}<span class="text-xs text-faint"> / {{ item.target }}</span>
      </div>
      <NumberStepper
        v-if="configMode"
        :value="item.target"
        :min="MIN_TARGET"
        :max="MAX_TARGET"
        lower-title="Lower goal"
        raise-title="Raise goal"
        :lower-label="`Lower ${item.name} goal`"
        :raise-label="`Raise ${item.name} goal`"
        data-noprint
        @change="emit('changeTarget', $event)"
      />
    </div>
  </div>
</template>
