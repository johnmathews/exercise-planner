<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useSessionStore, type AuthProblem, type LinkKind } from '@/stores/session'
import { describeProblem } from '@/lib/problems'
import AuthCard from '@/components/AuthCard.vue'

const props = defineProps<{ token: string }>()
const emit = defineEmits<{ done: [] }>()

const MIN = 10
const session = useSessionStore()
const link = ref<{ kind: LinkKind; username: string } | null>(null)
const problem = ref<AuthProblem | null>(null)
const password = ref('')
const confirm = ref('')
const busy = ref(false)
const mismatch = ref(false)
const LABEL = 'mb-1 block text-sm font-medium'

const title = computed(() => {
  if (!link.value) return problem.value ? 'Link not valid' : 'Checking the link…'
  return link.value.kind === 'invite' ? `Welcome, ${link.value.username}` : 'Choose a new password'
})

onMounted(async () => {
  const result = await session.lookup(props.token)
  if ('code' in result) problem.value = result
  else link.value = result
})

async function submit(): Promise<void> {
  mismatch.value = password.value !== confirm.value
  if (mismatch.value || busy.value) return
  busy.value = true
  problem.value = await session.redeem(props.token, password.value)
  busy.value = false
  if (!problem.value) emit('done')
}
</script>

<template>
  <AuthCard :title="title">
    <template v-if="link">
      <p class="mb-5 text-sm text-muted">
        <template v-if="link.kind === 'invite'">
          Choose a password to finish setting up your account.
        </template>
        <template v-else>
          For <strong class="text-fg">{{ link.username }}</strong
          >. This signs you out on every other device.
        </template>
      </p>
      <form class="flex flex-col gap-4" @submit.prevent="submit">
        <input type="hidden" autocomplete="username" :value="link.username" />
        <div>
          <label for="new-password" :class="LABEL">Password</label>
          <input
            id="new-password"
            v-model="password"
            class="field w-full"
            type="password"
            autocomplete="new-password"
            :minlength="MIN"
            maxlength="256"
            required
            aria-describedby="new-password-hint"
          />
          <p id="new-password-hint" class="mt-1 text-xs text-faint">
            At least {{ MIN }} characters.
          </p>
        </div>
        <div>
          <label for="confirm-password" :class="LABEL">Repeat password</label>
          <input
            id="confirm-password"
            v-model="confirm"
            class="field w-full"
            type="password"
            autocomplete="new-password"
            required
          />
        </div>
        <p v-if="mismatch" role="alert" class="text-sm text-warn">The passwords don’t match.</p>
        <p v-else-if="problem" role="alert" class="text-sm text-warn" data-testid="link-problem">
          {{ describeProblem(problem) }}
        </p>
        <button type="submit" class="btn-primary justify-center" :aria-busy="busy">
          Set password
        </button>
      </form>
    </template>
    <p v-else-if="problem" role="alert" class="text-sm text-warn" data-testid="link-problem">
      {{ describeProblem(problem) }}
    </p>
  </AuthCard>
</template>
