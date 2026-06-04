<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { CheckCircle2, MailCheck, RefreshCw } from 'lucide-vue-next'
import Spinner from '@renderer/components/ui/Spinner.vue'
import { useSessionStore } from '@renderer/stores/sessionStore'

const session = useSessionStore()

const code = ref('')
const notice = ref('')
// Cooldown du renvoi (secondes restantes) : pilote par RESEND_TOO_SOON (retryAfterMs) ou
// un delai indicatif apres un envoi reussi.
const cooldown = ref(0)
let timer: ReturnType<typeof setInterval> | undefined

const canVerify = computed(() => code.value.trim().length >= 4 && !session.working)

const startCooldown = (ms: number): void => {
  cooldown.value = Math.max(1, Math.ceil(ms / 1000))
  if (timer) {
    clearInterval(timer)
  }
  timer = setInterval(() => {
    cooldown.value -= 1
    if (cooldown.value <= 0 && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }, 1000)
}

onBeforeUnmount(() => {
  if (timer) {
    clearInterval(timer)
  }
})

const verify = async (): Promise<void> => {
  if (!canVerify.value) {
    return
  }
  notice.value = ''
  // Succes -> session.state passe a 'authenticated' et le rail bascule sur les conversations.
  await session.verifyEmail(code.value)
}

const resend = async (): Promise<void> => {
  if (cooldown.value > 0) {
    return
  }
  notice.value = ''
  const result = await session.resendVerification()
  if (result.ok) {
    notice.value = 'Un nouveau code a ete envoye.'
    startCooldown(60_000)
  } else if (result.retryAfterMs) {
    startCooldown(result.retryAfterMs)
  }
}

const logout = async (): Promise<void> => {
  await session.logout()
}
</script>

<template>
  <div class="px-3 py-6">
    <div class="mx-auto grid size-12 place-items-center rounded-2xl bg-accent-mint/15 text-accent-mint">
      <MailCheck :size="22" />
    </div>
    <h3 class="mt-3 text-center text-sm font-semibold text-white">Verifie ton adresse email</h3>
    <p class="mt-1 text-center text-xs leading-5 text-zinc-500">
      Saisis le code a 6 chiffres envoye a
      <span class="text-zinc-300">{{ session.user?.email }}</span>.
    </p>

    <form class="mt-4 space-y-2" @submit.prevent="verify">
      <input
        v-model="code"
        class="w-full rounded-lg bg-ink-950/55 px-3 py-2 text-center text-base tracking-[0.4em] text-white placeholder-zinc-600 shadow-line outline-none focus:ring-1 focus:ring-accent-mint/40"
        placeholder="Code a 6 chiffres"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
      />
      <button
        class="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-mint px-3 py-2 text-sm font-semibold text-ink-950 transition hover:brightness-110 disabled:opacity-40"
        type="submit"
        :disabled="!canVerify"
      >
        <Spinner v-if="session.working" :size="15" label="Verification" />
        <CheckCircle2 v-else :size="15" />
        Verifier
      </button>
    </form>

    <p v-if="notice" class="mt-2 text-center text-xs text-accent-mint">{{ notice }}</p>
    <p v-if="session.error" class="mt-2 text-center text-xs text-accent-coral">{{ session.error }}</p>

    <div class="mt-4 flex flex-col items-center gap-1.5">
      <button
        class="flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-zinc-300 disabled:opacity-40"
        type="button"
        :disabled="cooldown > 0"
        @click="resend"
      >
        <RefreshCw :size="12" />
        {{ cooldown > 0 ? `Renvoyer le code (${cooldown}s)` : 'Renvoyer le code' }}
      </button>
      <button
        class="text-xs text-zinc-500 transition hover:text-zinc-300"
        type="button"
        @click="logout"
      >
        Changer de compte
      </button>
    </div>
  </div>
</template>
