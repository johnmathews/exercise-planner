<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { useSessionStore, type AuthProblem, type LinkKind } from '@/stores/session'
import { describeProblem } from '@/lib/problems'
import AuthCard from '@/components/AuthCard.vue'

const props = defineProps<{ token: string }>()
const emit = defineEmits<{
  /** The password is set and the user signed in. */
  done: []
  /** The link can never work (used, expired, unknown), so its token can leave the address bar. */
  spent: []
}>()

const MIN = 10
const session = useSessionStore()
const link = ref<{ kind: LinkKind; username: string } | null>(null)
const problem = ref<AuthProblem | null>(null)
const password = ref('')
const confirm = ref('')
const busy = ref(false)
const mismatch = ref(false)
const confirmInput = ref<HTMLInputElement | null>(null)
const LABEL = 'mb-1 block text-sm font-medium'

const title = computed(() => {
  if (link.value) {
    return link.value.kind === 'invite'
      ? `Welcome, ${link.value.username}`
      : 'Choose a new password'
  }
  if (!problem.value) return 'Checking the link…'
  return problem.value.code === 'gone' ? 'Link not valid' : 'Couldn’t check the link'
})
// Offline or busy: the link may be fine, so offer to try again rather than give up on it.
const canRetry = computed(
  () => !link.value && problem.value !== null && problem.value.code !== 'gone',
)

async function check(): Promise<void> {
  problem.value = null
  const result = await session.lookup(props.token)
  if (!('code' in result)) {
    link.value = result
    return
  }
  problem.value = result
  if (result.code === 'gone') emit('spent')
}

onMounted(check)

async function submit(): Promise<void> {
  mismatch.value = password.value !== confirm.value
  if (mismatch.value) {
    await nextTick()
    confirmInput.value?.focus()
    confirmInput.value?.select()
    return
  }
  if (busy.value) return
  busy.value = true
  problem.value = await session.redeem(props.token, password.value)
  busy.value = false
  if (!problem.value) emit('done')
  else if (problem.value.code === 'gone') emit('spent')
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
        <!-- For password managers, which save the new password against this username. -->
        <input
          type="text"
          name="username"
          autocomplete="username"
          :value="link.username"
          hidden
          readonly
        />
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
            :aria-invalid="problem?.code === 'password'"
          />
          <p id="new-password-hint" class="mt-1 text-xs text-faint">
            At least {{ MIN }} characters.
          </p>
        </div>
        <div>
          <label for="confirm-password" :class="LABEL">Repeat password</label>
          <input
            id="confirm-password"
            ref="confirmInput"
            v-model="confirm"
            class="field w-full"
            type="password"
            autocomplete="new-password"
            required
            :aria-invalid="mismatch"
          />
        </div>
        <p v-if="mismatch" role="alert" class="text-sm text-warn">The passwords don’t match.</p>
        <p v-else-if="problem" role="alert" class="text-sm text-warn" data-testid="link-problem">
          {{ describeProblem(problem) }}
        </p>
        <button type="submit" class="btn-primary justify-center" :aria-busy="busy">
          {{ busy ? 'Saving…' : 'Set password' }}
        </button>
      </form>
    </template>
    <template v-else-if="problem">
      <p role="alert" class="text-sm text-warn" data-testid="link-problem">
        {{ describeProblem(problem) }}
      </p>
      <button v-if="canRetry" type="button" class="btn mt-4" @click="check">Try again</button>
    </template>
  </AuthCard>
</template>
