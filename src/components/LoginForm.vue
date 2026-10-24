<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSessionStore, type AuthProblem } from '@/stores/session'
import { describeProblem } from '@/lib/problems'
import AuthCard from '@/components/AuthCard.vue'

const session = useSessionStore()
const username = ref(session.user ?? '')
const password = ref('')
const busy = ref(false)
const problem = ref<AuthProblem | null>(null)
const LABEL = 'mb-1 block text-sm font-medium'

const intro = computed(() =>
  session.expired
    ? 'Your session has ended. Sign in again to keep syncing; changes made on this device are kept.'
    : 'Sign in to see your plans and log on any device.',
)

async function submit(): Promise<void> {
  if (busy.value) return
  busy.value = true
  problem.value = await session.login(username.value.trim(), password.value)
  busy.value = false
  if (!problem.value) password.value = ''
}
</script>

<template>
  <AuthCard title="Sign in">
    <p class="mb-5 text-sm text-muted">{{ intro }}</p>
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <div>
        <label for="login-username" :class="LABEL">Username</label>
        <input
          id="login-username"
          v-model="username"
          class="field w-full"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          required
        />
      </div>
      <div>
        <label for="login-password" :class="LABEL">Password</label>
        <input
          id="login-password"
          v-model="password"
          class="field w-full"
          type="password"
          autocomplete="current-password"
          required
        />
      </div>
      <p v-if="problem" role="alert" class="text-sm text-warn" data-testid="login-problem">
        {{ describeProblem(problem) }}
      </p>
      <button type="submit" class="btn-primary justify-center" :aria-busy="busy">Sign in</button>
    </form>
    <p class="mt-5 text-xs text-faint">Accounts are by invitation.</p>
  </AuthCard>
</template>
