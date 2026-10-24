<script setup lang="ts">
import { computed } from 'vue'
import { useSyncStore } from '@/stores/sync'

const sync = useSyncStore()

/** One line about the connection, or null when there is nothing worth saying. */
const message = computed(() => {
  if (!sync.loaded) {
    return sync.status === 'offline'
      ? 'Can’t reach the server, and this device has no saved copy of your data yet.'
      : 'Loading your data…'
  }
  if (sync.status !== 'offline') return null
  const n = sync.pending
  return n
    ? `Offline. ${n} change${n === 1 ? '' : 's'} will sync when the connection is back.`
    : 'Offline. Showing the data saved on this device.'
})
const BAR = 'mt-4 flex items-center gap-3 rounded-lg border border-line bg-subtle px-3 py-2 text-sm'
</script>

<template>
  <!-- One live region, always present, so a message appearing in it is announced. -->
  <div data-noprint aria-live="polite">
    <div
      v-if="message"
      :class="BAR"
      data-testid="sync-status"
      :data-state="sync.loaded ? sync.status : 'loading'"
    >
      <span class="flex-1 text-muted">{{ message }}</span>
      <button v-if="sync.status === 'offline'" type="button" class="btn" @click="sync.refresh()">
        Retry
      </button>
    </div>
    <div v-if="sync.notice" :class="BAR" data-testid="sync-notice">
      <span class="flex-1">{{ sync.notice }}</span>
      <button type="button" class="btn" @click="sync.dismissNotice()">Dismiss</button>
    </div>
  </div>
</template>
