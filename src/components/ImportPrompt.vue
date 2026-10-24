<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ExportData } from '@/lib/transfer'
import { usePlannerStore } from '@/stores/planner'
import { useSyncStore } from '@/stores/sync'
import { useImportSummary } from '@/composables/importSummary'
import {
  readImportMarker,
  readLegacyData,
  writeImportMarker,
  type ImportMarker,
} from '@/lib/legacy'

/**
 * The first-login prompt: this browser holds a log from before accounts, and this user has not
 * answered for it yet. "Add to my account" merges it on the server (never deleting), "Not mine"
 * remembers the answer, and "Later" asks again on the next load.
 */
const props = defineProps<{ user: string }>()
const ADD_FAILED: Record<'offline' | 'server' | 'auth' | 'error', string> = {
  offline: 'Can’t reach the server, so nothing was added. Try again when you’re online.',
  server: 'The server had a problem, so nothing was added. Try again in a while.',
  auth: 'Your session has ended. Sign in again to add it.',
  error: 'Something went wrong, so nothing was added. Try again later.',
}
const planner = usePlannerStore()
const sync = useSyncStore()
const summary = useImportSummary()

// One instance per user (App keys it on the user), so the answer is read once, on mount.
const marker = ref<ImportMarker | null>(readImportMarker(props.user))
const later = ref(false)
const busy = ref(false)
const problem = ref<string | null>(null)
const added = ref(false)

const data = computed(() =>
  // Only against the account as the server holds it: a cached copy could be stale.
  sync.fresh && !marker.value ? readLegacyData(planner.currentWeekKey) : null,
)

// Data already in the account (imported on another device, say) needs no question.
watch(
  () => (data.value ? summary.addsAnything(data.value) : true),
  (addsSomething) => {
    if (!addsSomething && !marker.value) answer('imported')
  },
  { immediate: true },
)

const show = computed(() => added.value || (!later.value && data.value !== null))

function answer(value: ImportMarker): void {
  writeImportMarker(props.user, value)
  marker.value = value
}

async function addToAccount(log: ExportData): Promise<void> {
  if (busy.value) return
  busy.value = true
  problem.value = null
  const outcome = await sync.importFile(log)
  busy.value = false
  if (outcome.ok) {
    answer('imported')
    added.value = true
  } else {
    problem.value = ADD_FAILED[outcome.code]
  }
}
</script>

<template>
  <section
    v-if="show"
    class="mt-4 rounded-xl border border-line bg-surface p-4 shadow-xs"
    aria-labelledby="import-prompt-title"
    data-testid="import-prompt"
    data-noprint
  >
    <h2 id="import-prompt-title" class="font-semibold">
      {{ added ? 'Added to your account' : 'Data from before accounts' }}
    </h2>
    <template v-if="added">
      <p class="mt-1 text-sm text-muted" role="status">
        This browser’s earlier log is now part of your account, on every device.
      </p>
      <button type="button" class="btn mt-3" @click="added = false">Close</button>
    </template>
    <template v-else-if="data">
      <p class="mt-1 text-sm text-muted">
        This browser holds a log saved before accounts existed. If it’s yours, add it to your
        account. {{ summary.describe(data) }}
      </p>
      <p v-if="problem" role="alert" class="mt-2 text-sm text-warn">{{ problem }}</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" class="btn-primary" :aria-busy="busy" @click="addToAccount(data)">
          {{ busy ? 'Adding…' : 'Add to my account' }}
        </button>
        <button type="button" class="btn" @click="answer('dismissed')">Not mine</button>
        <button type="button" class="btn" @click="later = true">Later</button>
      </div>
    </template>
  </section>
</template>
