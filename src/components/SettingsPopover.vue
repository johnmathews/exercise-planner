<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { usePlannerStore } from '@/stores/planner'
import { useDietStore } from '@/stores/diet'
import { useSessionStore } from '@/stores/session'
import { useSyncStore } from '@/stores/sync'
import { describeProblem } from '@/lib/problems'
import { useImportSummary } from '@/composables/importSummary'
import { ACCENTS, MAX_DAILY_PICK, MIN_DAILY_PICK } from '@/lib/storage'
import { THEMES, type Theme } from '@/lib/theme'
import {
  buildExport,
  downloadExport,
  parseExport,
  type ExportData,
  type ParseError,
} from '@/lib/transfer'
import NumberStepper from '@/components/NumberStepper.vue'

const ACCENT_NAMES: Record<string, string> = {
  '#0a84ff': 'Blue',
  '#30d158': 'Green',
  '#ff9f0a': 'Orange',
  '#bf5af2': 'Purple',
}

const THEME_NAMES: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' }

const IMPORT_ERRORS: Record<ParseError | 'read', string> = {
  json: 'That file isn’t valid JSON.',
  format: 'That file isn’t an Exercise Planner export.',
  version: 'That export comes from a newer version of the app.',
  read: 'That file couldn’t be read.',
}

const store = usePlannerStore()
const diet = useDietStore()
const session = useSessionStore()
const sync = useSyncStore()
const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const panelId = useId()
const LABEL = 'text-[11px] font-semibold tracking-wider text-muted uppercase'

const fileInput = ref<HTMLInputElement | null>(null)
/** A parsed file waiting for "Import". */
const pending = ref<ExportData | null>(null)
const notice = ref<{ tone: 'error' | 'done'; text: string } | null>(null)
const signOutProblem = ref<string | null>(null)
const summary = useImportSummary()

// Each opening starts clean, rather than showing the last import's or sign-out's outcome.
watch(open, () => {
  pending.value = null
  notice.value = null
  signOutProblem.value = null
})

function exportData(): void {
  downloadExport(
    buildExport({
      exercise: { plans: store.plans, log: store.log },
      diet: { plans: diet.plans, log: diet.log },
      settings: { accent: store.accent, dailyPick: store.dailyPick },
    }),
  )
}

async function onFile(ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  // Cleared so that choosing the same file again still fires `change`.
  input.value = ''
  if (!file) return
  pending.value = null
  notice.value = null
  let text: string
  try {
    text = await file.text()
  } catch {
    notice.value = { tone: 'error', text: IMPORT_ERRORS.read }
    return
  }
  const result = parseExport(text)
  if (!result.ok) {
    notice.value = { tone: 'error', text: IMPORT_ERRORS[result.error] }
    return
  }
  if (!summary.addsAnything(result.data)) {
    notice.value = { tone: 'done', text: 'Nothing new: everything in that file is already here.' }
    return
  }
  pending.value = result.data
}

async function signOut(): Promise<void> {
  const n = sync.pending
  const waiting = n === 1 ? '1 change hasn’t' : `${n} changes haven’t`
  if (n && !window.confirm(`${waiting} synced yet. Sign out anyway?`)) return
  const problem = await session.logout()
  signOutProblem.value = problem ? describeProblem(problem) : null
}

const IMPORT_FAILED: Record<'offline' | 'auth' | 'error', string> = {
  offline: 'Can’t reach the server, so nothing was imported. Try again when you’re online.',
  auth: 'Your session has ended. Sign in again, then import the file.',
  error: 'The server refused the import, so nothing changed.',
}
const importing = ref(false)

/** Merge the file on the server (one request, never deleting), then show the result. */
async function confirmImport(data: ExportData): Promise<void> {
  if (importing.value) return
  importing.value = true
  const outcome = await sync.importFile(data)
  importing.value = false
  if (outcome.ok) {
    pending.value = null
    notice.value = { tone: 'done', text: 'Imported.' }
  } else {
    notice.value = { tone: 'error', text: IMPORT_FAILED[outcome.code] }
  }
}

function onPointerDown(ev: PointerEvent): void {
  if (open.value && root.value && !root.value.contains(ev.target as Node)) open.value = false
}
function onKeydown(ev: KeyboardEvent): void {
  if (ev.key !== 'Escape' || !open.value) return
  open.value = false
  // The panel unmounts, so hand focus back rather than letting it fall to <body>.
  trigger.value?.focus()
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="root" class="relative" data-noprint>
    <button
      ref="trigger"
      type="button"
      class="btn aria-expanded:bg-subtle"
      :aria-expanded="open"
      :aria-controls="panelId"
      @click="open = !open"
    >
      <span class="size-2 rounded-full bg-accent" aria-hidden="true" />
      <!-- Below 380px a gear stands in for the word, so the navbar fits a 320px screen. -->
      <span class="hidden max-[379px]:inline" aria-hidden="true">⚙&#xFE0E;</span>
      <span class="max-[379px]:sr-only">Settings</span>
    </button>
    <div
      v-if="open"
      :id="panelId"
      class="absolute top-full right-0 z-30 mt-2 flex w-60 flex-col gap-2 rounded-xl border border-line bg-surface p-3 shadow-lg"
      role="group"
      aria-label="Settings"
    >
      <div :class="LABEL">Account</div>
      <div class="mb-1 flex items-center justify-between gap-2">
        <span class="truncate text-sm" data-testid="signed-in-as">
          <span class="text-muted">Signed in as</span> {{ session.user }}
        </span>
        <button type="button" class="btn shrink-0" @click="signOut">Sign out</button>
      </div>
      <p
        v-if="signOutProblem"
        role="alert"
        class="text-sm text-warn"
        data-testid="sign-out-problem"
      >
        {{ signOutProblem }}
      </p>
      <div :class="LABEL">Appearance</div>
      <div
        class="mb-1 flex rounded-lg border border-line bg-subtle p-0.5"
        role="group"
        aria-label="Theme"
      >
        <button
          v-for="t in THEMES"
          :key="t"
          type="button"
          class="segment h-7 flex-1"
          :aria-pressed="store.theme === t"
          @click="store.setTheme(t)"
        >
          {{ THEME_NAMES[t] }}
        </button>
      </div>
      <div :class="LABEL">Accent</div>
      <div class="flex gap-2.5 px-0.5 pt-0.5 pb-1.5" role="group" aria-label="Accent colour">
        <button
          v-for="c in ACCENTS"
          :key="c"
          type="button"
          class="size-5.5 rounded-full ring-offset-2 ring-offset-surface aria-pressed:ring-2 aria-pressed:ring-fg"
          :style="{ background: c }"
          :aria-pressed="store.accent === c"
          :aria-label="ACCENT_NAMES[c]"
          :title="ACCENT_NAMES[c]"
          @click="store.setAccent(c)"
        />
      </div>
      <div :class="LABEL">Exercises per day</div>
      <div class="flex items-center justify-between">
        <span class="font-mono text-xl font-semibold" aria-live="polite" data-testid="daily-pick">
          {{ store.dailyPick }}
        </span>
        <NumberStepper
          :value="store.dailyPick"
          :min="MIN_DAILY_PICK"
          :max="MAX_DAILY_PICK"
          lower-title="Fewer per day"
          raise-title="More per day"
          lower-label="Fewer exercises per day"
          raise-label="More exercises per day"
          @change="store.changeDailyPick"
        />
      </div>
      <div :class="LABEL" class="mt-1">Data</div>
      <div class="flex gap-2">
        <button type="button" class="btn flex-1 justify-center" @click="exportData">Export</button>
        <button type="button" class="btn flex-1 justify-center" @click="fileInput?.click()">
          Import…
        </button>
        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          class="hidden"
          aria-label="Export file to import"
          data-testid="import-file"
          @change="onFile"
        />
      </div>
      <div v-if="pending" class="flex flex-col gap-2" role="group" aria-label="Confirm import">
        <p class="text-sm text-fg" data-testid="import-summary">{{ summary.describe(pending) }}</p>
        <div class="flex gap-2">
          <button
            type="button"
            class="btn flex-1 justify-center"
            :aria-busy="importing"
            @click="confirmImport(pending)"
          >
            Import
          </button>
          <button type="button" class="btn flex-1 justify-center" @click="pending = null">
            Cancel
          </button>
        </div>
      </div>
      <p
        v-if="notice"
        :role="notice.tone === 'error' ? 'alert' : 'status'"
        :data-tone="notice.tone"
        class="text-sm data-[tone=done]:text-muted data-[tone=error]:text-warn"
      >
        {{ notice.text }}
      </p>
    </div>
  </div>
</template>
