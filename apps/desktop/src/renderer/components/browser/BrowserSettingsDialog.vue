<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Check, KeyRound, Puzzle, RotateCcw, Trash2, X } from 'lucide-vue-next'
import { CUSTOM_SEARCH_ENGINE_ID, SEARCH_ENGINES } from '@shared/searchEngines'
import { formatAccelerator, SHORTCUT_DEFS, type OmniBrowserShortcutAction } from '@shared/shortcuts'
import { useBrowserStore } from '@renderer/stores/browserStore'
import ShortcutCaptureField from '@renderer/components/ui/ShortcutCaptureField.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (event: 'close'): void }>()

const store = useBrowserStore()
const isMac = navigator.platform.toUpperCase().includes('MAC')

// --- Moteur de recherche personnalise ---------------------------------------
const customName = ref('')
const customTemplate = ref('')
const customError = ref<string | null>(null)
const isCustomActive = computed(() => store.settings.searchEngineId === CUSTOM_SEARCH_ENGINE_ID)

const syncCustomFields = (): void => {
  customName.value = store.settings.customSearchName ?? ''
  customTemplate.value = store.settings.customSearchTemplate ?? ''
  customError.value = null
}

// Resynchronise les champs depuis les reglages a chaque ouverture du dialogue.
watch(
  () => props.open,
  (open) => {
    if (open) {
      syncCustomFields()
      void store.loadCredentials()
    }
  },
  { immediate: true },
)

// Affiche l'hote (sans le schema) d'une origine enregistree, pour la lisibilite.
const displayHost = (origin: string): string => {
  try {
    return new URL(origin).host
  } catch {
    return origin
  }
}

// Active le mode perso et revele le formulaire. La persistance du gabarit passe
// uniquement par Enregistrer (saveCustomEngine), apres validation.
const selectCustomEngine = (): void => {
  void store.setSearchEngine(CUSTOM_SEARCH_ENGINE_ID)
}

const saveCustomEngine = (): void => {
  const template = customTemplate.value.trim()
  if (!/^https?:\/\//i.test(template)) {
    customError.value = "L'URL doit commencer par http:// ou https://."
    return
  }
  customError.value = null
  void store.setCustomSearchEngine({ name: customName.value.trim(), template })
}

// --- Raccourcis clavier ------------------------------------------------------
const shortcutError = ref<string | null>(null)

const onShortcutChange = (action: OmniBrowserShortcutAction, accelerator: string): void => {
  const conflict = SHORTCUT_DEFS.find(
    (def) => def.action !== action && store.resolvedShortcuts[def.action] === accelerator,
  )
  if (conflict) {
    shortcutError.value = `${formatAccelerator(accelerator, isMac)} est déjà utilisé par « ${conflict.label} ».`
    return
  }
  shortcutError.value = null
  void store.setShortcut(action, accelerator)
}

const resetShortcut = (action: OmniBrowserShortcutAction): void => {
  shortcutError.value = null
  void store.resetShortcut(action)
}

const resetAllShortcuts = (): void => {
  shortcutError.value = null
  void store.resetAllShortcuts()
}

onMounted(() => {
  void store.loadExtensions()
})
</script>

<template>
  <div
    v-if="open"
    class="app-no-drag absolute inset-0 z-40 overflow-auto bg-black/52 p-6 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <section class="mx-auto my-8 w-full max-w-xl overflow-hidden rounded-2xl bg-ink-900 shadow-soft shadow-line">
      <header class="flex items-center justify-between border-b border-white/[0.04] px-5 py-4">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-mint">OmniBrowser</p>
          <h2 class="mt-1 text-lg font-semibold text-white">Paramètres</h2>
        </div>
        <button
          aria-label="Fermer"
          class="grid size-9 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
          type="button"
          @click="emit('close')"
        >
          <X :size="18" />
        </button>
      </header>

      <div class="grid gap-6 p-5">
        <!-- Moteur de recherche -->
        <div>
          <h3 class="mb-3 text-sm font-semibold text-white">Moteur de recherche</h3>
          <div class="grid gap-1.5">
            <button
              v-for="engine in SEARCH_ENGINES"
              :key="engine.id"
              type="button"
              class="flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-2.5 text-left transition hover:bg-white/[0.07]"
              @click="store.setSearchEngine(engine.id)"
            >
              <span class="text-sm text-zinc-200">{{ engine.name }}</span>
              <Check
                v-if="store.settings.searchEngineId === engine.id"
                :size="16"
                class="text-accent-mint"
              />
            </button>

            <!-- Moteur personnalisé -->
            <button
              type="button"
              class="flex items-center justify-between rounded-xl bg-white/[0.04] px-4 py-2.5 text-left transition hover:bg-white/[0.07]"
              @click="selectCustomEngine"
            >
              <span class="text-sm text-zinc-200">Personnalisé</span>
              <Check v-if="isCustomActive" :size="16" class="text-accent-mint" />
            </button>
          </div>

          <!-- Formulaire du moteur personnalisé -->
          <div v-if="isCustomActive" class="mt-2 grid gap-2 rounded-xl bg-white/[0.03] p-3">
            <input
              v-model="customName"
              type="text"
              spellcheck="false"
              placeholder="Nom (optionnel)"
              class="h-9 w-full rounded-lg bg-white/[0.04] px-3 text-sm text-zinc-100 outline-none transition focus:bg-white/[0.07]"
            />
            <input
              v-model="customTemplate"
              type="text"
              spellcheck="false"
              placeholder="https://exemple.com/search?q=%s"
              class="h-9 w-full rounded-lg bg-white/[0.04] px-3 text-sm text-zinc-100 outline-none transition focus:bg-white/[0.07]"
              @keydown.enter.prevent="saveCustomEngine"
            />
            <p class="text-xs leading-5 text-zinc-500">
              Utilisez <code class="rounded bg-white/[0.08] px-1 text-zinc-300">%s</code> pour la
              position de la requête ; sinon elle est ajoutée à la fin de l'URL.
            </p>
            <p v-if="customError" class="text-xs text-accent-coral">{{ customError }}</p>
            <div class="flex justify-end">
              <button
                type="button"
                class="rounded-lg bg-accent-mint/15 px-3 py-1.5 text-sm text-accent-mint transition hover:bg-accent-mint/25"
                @click="saveCustomEngine"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>

        <!-- Raccourcis clavier -->
        <div>
          <div class="mb-2 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-white">Raccourcis clavier</h3>
            <button
              type="button"
              class="rounded-lg px-2.5 py-1 text-xs text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
              @click="resetAllShortcuts"
            >
              Réinitialiser tout
            </button>
          </div>
          <p class="mb-3 text-xs leading-5 text-zinc-500">
            Cliquez sur un raccourci puis appuyez sur la combinaison souhaitée (avec au moins
            ⌘/Ctrl, Alt ou ⇧). Échap pour annuler.
          </p>

          <div class="grid gap-1.5">
            <div
              v-for="def in SHORTCUT_DEFS"
              :key="def.action"
              class="flex items-center gap-3 rounded-xl bg-white/[0.04] px-4 py-2"
            >
              <span class="min-w-0 flex-1 truncate text-sm text-zinc-200">{{ def.label }}</span>
              <ShortcutCaptureField
                :model-value="store.resolvedShortcuts[def.action]"
                @update:model-value="(value) => onShortcutChange(def.action, value)"
              />
              <button
                type="button"
                class="grid size-7 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
                title="Réinitialiser ce raccourci"
                @click="resetShortcut(def.action)"
              >
                <RotateCcw :size="14" />
              </button>
            </div>
          </div>
          <p v-if="shortcutError" class="mt-2 text-xs text-accent-coral">{{ shortcutError }}</p>
        </div>

        <!-- Extensions -->
        <div>
          <div class="mb-2 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-white">Extensions</h3>
            <button
              type="button"
              class="flex items-center gap-1.5 rounded-lg bg-accent-mint/15 px-3 py-1.5 text-sm text-accent-mint transition hover:bg-accent-mint/25"
              @click="store.addExtension()"
            >
              <Puzzle :size="14" /> Ajouter
            </button>
          </div>
          <p class="mb-3 text-xs leading-5 text-zinc-500">
            Electron ne donne pas accès au Chrome Web Store. Ajoutez une extension
            <strong class="text-zinc-400">décompressée</strong> en choisissant son dossier. Elle
            s'applique à tous les espaces et est rechargée à chaque démarrage.
          </p>

          <div v-if="store.extensions.length === 0" class="rounded-xl bg-white/[0.03] px-4 py-6 text-center text-sm text-zinc-500">
            Aucune extension chargée.
          </div>

          <div v-else class="grid gap-1.5">
            <div
              v-for="extension in store.extensions"
              :key="extension.id"
              class="flex items-center gap-3 rounded-xl bg-white/[0.04] px-4 py-2.5"
            >
              <Puzzle :size="16" class="shrink-0 text-zinc-400" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm text-zinc-200">
                  {{ extension.name }}
                  <span v-if="extension.version" class="text-xs text-zinc-500">v{{ extension.version }}</span>
                </p>
                <p class="truncate text-xs text-zinc-600">{{ extension.path }}</p>
              </div>
              <label class="flex cursor-pointer items-center" :title="extension.isEnabled ? 'Activée' : 'Désactivée'">
                <input
                  type="checkbox"
                  class="peer sr-only"
                  :checked="extension.isEnabled"
                  @change="store.toggleExtension(extension.id, !extension.isEnabled)"
                />
                <span class="relative h-5 w-9 rounded-full bg-white/[0.12] transition peer-checked:bg-accent-mint after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-4" />
              </label>
              <button
                type="button"
                class="grid size-7 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-accent-coral/10 hover:text-accent-coral"
                title="Retirer"
                @click="store.removeExtension(extension.id)"
              >
                <Trash2 :size="15" />
              </button>
            </div>
          </div>
        </div>

        <!-- Mots de passe enregistrés -->
        <div>
          <h3 class="mb-2 text-sm font-semibold text-white">Mots de passe enregistrés</h3>
          <p class="mb-3 text-xs leading-5 text-zinc-500">
            Stockés chiffrés sur cet appareil (trousseau du système) et proposés automatiquement
            sur les sites correspondants. Jamais en navigation privée.
          </p>

          <div v-if="store.credentials.length === 0" class="rounded-xl bg-white/[0.03] px-4 py-6 text-center text-sm text-zinc-500">
            Aucun mot de passe enregistré.
          </div>

          <div v-else class="grid gap-1.5">
            <div
              v-for="credential in store.credentials"
              :key="credential.id"
              class="flex items-center gap-3 rounded-xl bg-white/[0.04] px-4 py-2.5"
            >
              <KeyRound :size="16" class="shrink-0 text-zinc-400" />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm text-zinc-200">{{ displayHost(credential.origin) }}</p>
                <p class="truncate text-xs text-zinc-500">{{ credential.username || '—' }}</p>
              </div>
              <button
                type="button"
                class="grid size-7 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-accent-coral/10 hover:text-accent-coral"
                title="Supprimer"
                @click="store.deleteCredential(credential.id)"
              >
                <Trash2 :size="15" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
