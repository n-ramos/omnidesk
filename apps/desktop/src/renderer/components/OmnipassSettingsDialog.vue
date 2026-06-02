<script setup lang="ts">
import { ref, watch } from 'vue'
import { Copy, Download, Fingerprint, Globe, KeyRound, Upload, X } from 'lucide-vue-next'
import Spinner from '@renderer/components/ui/Spinner.vue'
import { confirm } from '@renderer/composables/useConfirm'
import { useAppStore } from '@renderer/stores/appStore'
import { useOmnipassStore } from '@renderer/stores/omnipassStore'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (event: 'close'): void }>()

const store = useOmnipassStore()
const appStore = useAppStore()

const generatedCode = ref<string | null>(null)
const backupPassword = ref('')
const busy = ref(false)

const fieldClass =
  'w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-accent-mint/50'
const sectionClass = 'rounded-xl border border-white/[0.05] bg-white/[0.02] p-3.5'
const actionClass =
  'inline-flex h-8 items-center gap-1.5 rounded-md bg-white/[0.06] px-3 text-xs font-medium text-zinc-100 transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-45'

watch(
  () => props.open,
  (open) => {
    if (open) {
      store.error = undefined
      generatedCode.value = null
      backupPassword.value = ''
    }
  },
)

const toggleBiometric = async (): Promise<void> => {
  busy.value = true
  if (store.biometricEnabled) {
    await store.disableBiometric()
  } else {
    await store.enableBiometric()
  }
  busy.value = false
}

const generate = async (): Promise<void> => {
  busy.value = true
  generatedCode.value = await store.generateRecovery()
  busy.value = false
}

const disableRecovery = async (): Promise<void> => {
  const ok = await confirm({
    title: 'Desactiver le code de recuperation ?',
    message: 'Le code actuel ne fonctionnera plus.',
    confirmLabel: 'Desactiver',
    tone: 'danger',
  })
  if (ok) {
    await store.disableRecovery()
    generatedCode.value = null
  }
}

const copyCode = (): void => {
  if (generatedCode.value) {
    void navigator.clipboard.writeText(generatedCode.value)
    appStore.actionFeedback = 'Code de recuperation copie'
  }
}

const exportBackup = async (): Promise<void> => {
  if (backupPassword.value.length < 8) {
    store.error = "Le mot de passe de la sauvegarde doit faire au moins 8 caracteres."
    return
  }
  busy.value = true
  const saved = await store.exportBackup(backupPassword.value)
  busy.value = false
  if (saved) {
    appStore.actionFeedback = 'Sauvegarde exportee'
    emit('close')
  }
}

const importBackup = async (): Promise<void> => {
  if (backupPassword.value.length === 0) {
    store.error = 'Saisissez le mot de passe de la sauvegarde a importer.'
    return
  }
  busy.value = true
  const result = await store.importBackup(backupPassword.value)
  busy.value = false
  if (result) {
    appStore.actionFeedback = `Importe : ${result.entries} entree(s), ${result.folders} dossier(s)`
    emit('close')
  }
}

const importBrowser = async (): Promise<void> => {
  busy.value = true
  const count = await store.importFromBrowser()
  busy.value = false
  if (!store.error) {
    appStore.actionFeedback = `${count} identifiant(s) importes depuis le navigateur`
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-[60] grid place-items-center bg-ink-950/70 p-4 backdrop-blur-sm"
        @click.self="emit('close')"
      >
        <div class="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900 shadow-lift">
          <header class="flex items-center gap-3 border-b border-white/[0.05] px-5 py-4">
            <span class="grid size-9 place-items-center rounded-xl bg-accent-mint/15 text-accent-mint">
              <KeyRound :size="18" />
            </span>
            <h2 class="flex-1 text-base font-semibold text-white">Parametres du coffre</h2>
            <button
              class="grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
              type="button"
              aria-label="Fermer"
              @click="emit('close')"
            >
              <X :size="16" />
            </button>
          </header>

          <div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
            <!-- Touch ID -->
            <div :class="sectionClass">
              <div class="flex items-center gap-2.5">
                <Fingerprint :size="16" class="shrink-0 text-accent-mint" />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-white">Deverrouillage Touch ID</p>
                  <p class="text-[11px] text-zinc-500">
                    {{ store.biometricAvailable ? 'Deverrouiller le coffre par biometrie.' : 'Indisponible sur cet appareil.' }}
                  </p>
                </div>
                <button
                  v-if="store.biometricAvailable"
                  type="button"
                  role="switch"
                  :aria-checked="store.biometricEnabled"
                  class="relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50"
                  :class="store.biometricEnabled ? 'bg-accent-mint' : 'bg-white/10'"
                  :disabled="busy"
                  @click="toggleBiometric"
                >
                  <span
                    class="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform"
                    :class="store.biometricEnabled ? 'translate-x-5' : 'translate-x-0'"
                  />
                </button>
              </div>
            </div>

            <!-- Code de recuperation -->
            <div :class="sectionClass">
              <div class="flex items-center gap-2.5">
                <KeyRound :size="16" class="shrink-0 text-accent-gold" />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-white">Code de recuperation</p>
                  <p class="text-[11px] text-zinc-500">Deverrouille le coffre si vous oubliez le mot de passe maitre.</p>
                </div>
                <button v-if="!store.recoveryEnabled" :class="actionClass" type="button" :disabled="busy" @click="generate">
                  Generer
                </button>
                <button v-else :class="actionClass" type="button" :disabled="busy" @click="disableRecovery">
                  Desactiver
                </button>
              </div>
              <div v-if="generatedCode" class="mt-3 space-y-1.5">
                <div class="flex items-center gap-2">
                  <code class="flex-1 select-all rounded-md bg-ink-950/60 px-3 py-2 font-mono text-sm tracking-wide text-accent-mint">
                    {{ generatedCode }}
                  </code>
                  <button :class="actionClass" type="button" @click="copyCode"><Copy :size="13" /></button>
                </div>
                <p class="text-[11px] text-accent-gold">
                  Conservez ce code hors ligne : il donne acces au coffre. Il ne sera plus affiche.
                </p>
              </div>
            </div>

            <!-- Sauvegarde chiffree -->
            <div :class="sectionClass">
              <div class="mb-2 flex items-center gap-2.5">
                <Download :size="16" class="shrink-0 text-accent-sky" />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-white">Sauvegarde chiffree</p>
                  <p class="text-[11px] text-zinc-500">Exporter / importer un fichier chiffre par un mot de passe.</p>
                </div>
              </div>
              <input
                v-model="backupPassword"
                :class="fieldClass"
                type="password"
                placeholder="Mot de passe de la sauvegarde"
                autocomplete="off"
              />
              <div class="mt-2 flex gap-2">
                <button :class="actionClass" type="button" :disabled="busy" @click="exportBackup">
                  <Download :size="13" /> Exporter
                </button>
                <button :class="actionClass" type="button" :disabled="busy" @click="importBackup">
                  <Upload :size="13" /> Importer
                </button>
              </div>
            </div>

            <!-- Import navigateur -->
            <div :class="sectionClass">
              <div class="flex items-center gap-2.5">
                <Globe :size="16" class="shrink-0 text-accent-lilac" />
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-medium text-white">Identifiants du navigateur</p>
                  <p class="text-[11px] text-zinc-500">Importer les identifiants enregistres dans le navigateur integre.</p>
                </div>
                <button :class="actionClass" type="button" :disabled="busy" @click="importBrowser">Importer</button>
              </div>
            </div>

            <p v-if="busy" class="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <Spinner :size="12" /> Operation en cours...
            </p>
            <p v-if="store.error" class="text-xs text-accent-coral">{{ store.error }}</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
