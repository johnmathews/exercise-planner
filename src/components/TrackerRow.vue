<script setup lang="ts">
import { computed } from 'vue'
import type { Day } from '@/stores/planner'
import { MAX_TARGET, MIN_TARGET } from '@/lib/storage'
import { goalMet, type Tracked } from '@/lib/tracker'
import DayCell from '@/components/DayCell.vue'
import NumberStepper from '@/components/NumberStepper.vue'

const props = defineProps<{
  item: Tracked
  /** Small chip under the name, e.g. "10 reps / set". Omitted for foods. */
  detail?: string
  days: Day[]
  flags: boolean[]
  total: number
}>()
const emit = defineEmits<{ toggle: [day: number]; changeTarget: [delta: number]; remove: [] }>()

const met = computed(() => goalMet(props.total, props.item.target))

function remove(): void {
  if (window.confirm(`Remove ${props.item.name}?`)) emit('remove')
}
</script>

<template>
  <!-- display: contents keeps every cell a direct child of the parent grid. -->
  <div role="row" class="row">
    <div role="rowheader" class="name-cell">
      <div class="name-wrap">
        <div class="name">{{ item.name }}</div>
        <div v-if="detail" class="chip-row">
          <span class="mono chip">{{ detail }}</span>
        </div>
      </div>
      <button
        type="button"
        class="remove"
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
    <div role="cell" class="week-cell">
      <div class="mono total" :class="{ met }" data-testid="row-total">
        {{ total }}<span class="target"> / {{ item.target }}</span>
      </div>
      <NumberStepper
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

<style scoped>
.row {
  display: contents;
}

.name-cell {
  padding: 10px 10px 10px 16px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
}

.name-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.name {
  font-weight: 600;
  font-size: 14px;
  letter-spacing: -0.01em;
}

.chip-row {
  display: flex;
}

.chip {
  font-size: 11px;
  color: var(--text-2);
  background: var(--toolbar);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 1px 6px;
  white-space: nowrap;
}

.remove {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--text-3);
  border-radius: 5px;
  font-size: 15px;
}

.remove:hover {
  background: var(--border);
  color: var(--text);
}

.week-cell {
  border-bottom: 1px solid var(--border-subtle);
  border-left: 1px solid var(--border-strong);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 8px;
}

.total {
  font-size: 20px;
  font-weight: 600;
  white-space: nowrap;
  color: var(--text);
}

.total.met {
  color: var(--accent);
}

.target {
  font-size: 12px;
  color: var(--text-3);
}
</style>
