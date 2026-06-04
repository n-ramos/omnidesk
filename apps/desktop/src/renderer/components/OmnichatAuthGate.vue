<script setup lang="ts">
import { computed, ref } from 'vue'
import { KeyRound, LogIn, MessageCircle, UserPlus } from 'lucide-vue-next'
import Spinner from '@renderer/components/ui/Spinner.vue'
import { useSessionStore } from '@renderer/stores/sessionStore'

const session = useSessionStore()

// Une seule carte, plusieurs modes. login par defaut ; forgot -> reset enchaine apres
// l'envoi du code ; register pour creer un compte.
type Mode = 'login' | 'register' | 'forgot' | 'reset'
const mode = ref<Mode>('login')

const email = ref('')
const password = ref('')
const displayName = ref('')
const code = ref('')
const newPassword = ref('')
// Message neutre (ex. apres "mot de passe oublie" : anti-enumeration).
const notice = ref('')

const isEmailValid = computed(() => /.+@.+\..+/.test(email.value.trim()))

const canSubmit = computed(() => {
  if (session.working) {
    return false
  }
  switch (mode.value) {
    case 'login':
      return isEmailValid.value && password.value.length > 0
    case 'register':
      return isEmailValid.value && password.value.length >= 8 && displayName.value.trim().length > 0
    case 'forgot':
      return isEmailValid.value
    case 'reset':
      return isEmailValid.value && code.value.trim().length >= 4 && newPassword.value.length >= 8
    default:
      return false
  }
})

const title = computed(() => {
  switch (mode.value) {
    case 'register':
      return 'Creer un compte'
    case 'forgot':
      return 'Mot de passe oublie'
    case 'reset':
      return 'Nouveau mot de passe'
    default:
      return 'Se connecter'
  }
})

const setMode = (next: Mode): void => {
  mode.value = next
  session.error = undefined
  notice.value = ''
}

const submit = async (): Promise<void> => {
  if (!canSubmit.value) {
    return
  }
  notice.value = ''
  if (mode.value === 'login') {
    await session.login(email.value, password.value)
    return
  }
  if (mode.value === 'register') {
    await session.register(email.value, password.value, displayName.value)
    return
  }
  if (mode.value === 'forgot') {
    const ok = await session.forgotPassword(email.value)
    if (ok) {
      // Message generique (ne revele pas si le compte existe) puis on passe a la saisie du code.
      notice.value = 'Si un compte existe, un code a ete envoye a cette adresse.'
      mode.value = 'reset'
    }
    return
  }
  // reset
  const ok = await session.resetPassword(email.value, code.value, newPassword.value)
  if (ok) {
    password.value = ''
    newPassword.value = ''
    code.value = ''
    notice.value = 'Mot de passe change. Connecte-toi avec ton nouveau mot de passe.'
    mode.value = 'login'
  }
}
</script>

<template>
  <div class="px-3 py-6">
    <div class="mx-auto grid size-12 place-items-center rounded-2xl bg-accent-mint/15 text-accent-mint">
      <MessageCircle :size="22" />
    </div>
    <h3 class="mt-3 text-center text-sm font-semibold text-white">{{ title }}</h3>
    <p class="mt-1 text-center text-xs leading-5 text-zinc-500">
      <template v-if="mode === 'forgot'">
        Saisis ton adresse email : si un compte existe, tu recevras un code a 6 chiffres.
      </template>
      <template v-else-if="mode === 'reset'">
        Saisis le code recu par email et choisis un nouveau mot de passe.
      </template>
      <template v-else>
        Ton adresse email est ton identite OmniChat (messages directs, presence, appels).
      </template>
    </p>

    <form class="mt-4 space-y-2" @submit.prevent="submit">
      <input
        v-model="email"
        class="w-full rounded-lg bg-ink-950/55 px-3 py-2 text-sm text-white placeholder-zinc-600 shadow-line outline-none focus:ring-1 focus:ring-accent-mint/40"
        placeholder="Adresse email"
        type="email"
        autocomplete="email"
        maxlength="320"
      />

      <input
        v-if="mode === 'register'"
        v-model="displayName"
        class="w-full rounded-lg bg-ink-950/55 px-3 py-2 text-sm text-white placeholder-zinc-600 shadow-line outline-none focus:ring-1 focus:ring-accent-mint/40"
        placeholder="Nom affiche (pseudo)"
        type="text"
        autocomplete="name"
        maxlength="80"
      />

      <input
        v-if="mode === 'reset'"
        v-model="code"
        class="w-full rounded-lg bg-ink-950/55 px-3 py-2 text-center text-base tracking-[0.4em] text-white placeholder-zinc-600 shadow-line outline-none focus:ring-1 focus:ring-accent-mint/40"
        placeholder="Code a 6 chiffres"
        inputmode="numeric"
        autocomplete="one-time-code"
        maxlength="6"
      />

      <input
        v-if="mode === 'login' || mode === 'register'"
        v-model="password"
        class="w-full rounded-lg bg-ink-950/55 px-3 py-2 text-sm text-white placeholder-zinc-600 shadow-line outline-none focus:ring-1 focus:ring-accent-mint/40"
        :placeholder="mode === 'register' ? 'Mot de passe (8 caracteres min.)' : 'Mot de passe'"
        type="password"
        :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
        maxlength="200"
      />

      <input
        v-if="mode === 'reset'"
        v-model="newPassword"
        class="w-full rounded-lg bg-ink-950/55 px-3 py-2 text-sm text-white placeholder-zinc-600 shadow-line outline-none focus:ring-1 focus:ring-accent-mint/40"
        placeholder="Nouveau mot de passe (8 min.)"
        type="password"
        autocomplete="new-password"
        maxlength="200"
      />

      <button
        class="flex w-full items-center justify-center gap-2 rounded-lg bg-accent-mint px-3 py-2 text-sm font-semibold text-ink-950 transition hover:brightness-110 disabled:opacity-40"
        type="submit"
        :disabled="!canSubmit"
      >
        <Spinner v-if="session.working" :size="15" label="Patiente" />
        <component
          :is="mode === 'register' ? UserPlus : mode === 'login' ? LogIn : KeyRound"
          v-else
          :size="15"
        />
        {{
          mode === 'register'
            ? 'Creer le compte'
            : mode === 'forgot'
              ? 'Envoyer le code'
              : mode === 'reset'
                ? 'Reinitialiser'
                : 'Connexion'
        }}
      </button>
    </form>

    <p v-if="notice" class="mt-2 text-center text-xs text-accent-mint">{{ notice }}</p>
    <p v-if="session.error" class="mt-2 text-center text-xs text-accent-coral">{{ session.error }}</p>

    <div class="mt-4 flex flex-col items-center gap-1.5">
      <button
        v-if="mode === 'login'"
        class="text-xs text-zinc-500 transition hover:text-zinc-300"
        type="button"
        @click="setMode('forgot')"
      >
        Mot de passe oublie ?
      </button>
      <button
        v-if="mode === 'login'"
        class="text-xs text-zinc-500 transition hover:text-zinc-300"
        type="button"
        @click="setMode('register')"
      >
        Pas de compte ? En creer un
      </button>
      <button
        v-if="mode === 'register' || mode === 'forgot' || mode === 'reset'"
        class="text-xs text-zinc-500 transition hover:text-zinc-300"
        type="button"
        @click="setMode('login')"
      >
        Retour a la connexion
      </button>
    </div>
  </div>
</template>
