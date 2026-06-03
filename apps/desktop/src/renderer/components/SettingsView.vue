<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  Bell,
  Bird,
  Bot,
  Check,
  Database,
  Download,
  Home as HomeIcon,
  Inbox,
  Keyboard,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MonitorCog,
  PackageCheck,
  PaintBucket,
  Palette,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Unplug,
  Upload,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-vue-next'
import BaseButton from '@renderer/components/ui/BaseButton.vue'
import ProviderLogo from '@renderer/components/ui/ProviderLogo.vue'
import ShortcutCaptureField from '@renderer/components/ui/ShortcutCaptureField.vue'
import Spinner from '@renderer/components/ui/Spinner.vue'
import StatusBadge from '@renderer/components/ui/StatusBadge.vue'
import { confirm } from '@renderer/composables/useConfirm'
import { useAppStore } from '@renderer/stores/appStore'
import { nextMascotId, useMascotStore } from '@renderer/stores/mascotStore'
import { useAiStore } from '@renderer/stores/aiStore'
import { randomQuote } from '@renderer/data/quotes'
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  applyAccentColor,
  hexToHsl,
  hslToHex,
  isValidHex,
  normalizeHex,
} from '@renderer/utils/accentColor'
import { applyBaseColor, BASE_PRESETS, DEFAULT_BASE } from '@renderer/utils/baseColor'
import { formatAccelerator, NAV_SHORTCUT_DEFS, type AppNavShortcutAction } from '@shared/shortcuts'
import type { AccountSetupStatus, StartupView } from '@shared/models'

const store = useAppStore()
const mascot = useMascotStore()
const ai = useAiStore()

// --- Assistant IA ------------------------------------------------------------
const aiTokenInput = ref('')
const aiTokenSaving = ref(false)
const aiTesting = ref(false)
const aiTestResult = ref<{ ok: boolean; message: string } | null>(null)

onMounted(() => {
  void ai.load()
})

const saveAiToken = async (): Promise<void> => {
  const token = aiTokenInput.value.trim()
  if (!token || aiTokenSaving.value) return
  aiTokenSaving.value = true
  aiTestResult.value = null
  try {
    await ai.setToken(token)
    aiTokenInput.value = ''
  } catch (error) {
    aiTestResult.value = {
      ok: false,
      message: error instanceof Error ? error.message : "Impossible d'enregistrer la cle.",
    }
  } finally {
    aiTokenSaving.value = false
  }
}

const clearAiToken = async (): Promise<void> => {
  aiTestResult.value = null
  await ai.clearToken()
}

const toggleAiEnabled = (): void => {
  void ai.save({ enabled: !ai.settings.enabled })
}

const onAiModelChange = (event: Event): void => {
  const value = (event.target as HTMLInputElement).value.trim()
  if (value && value !== ai.settings.model) {
    void ai.save({ model: value })
  }
}

const testAiConnection = async (): Promise<void> => {
  if (aiTesting.value) return
  aiTesting.value = true
  aiTestResult.value = null
  try {
    await ai.testConnection()
    aiTestResult.value = { ok: true, message: 'Connexion reussie.' }
  } catch (error) {
    aiTestResult.value = {
      ok: false,
      message: error instanceof Error ? error.message : 'Echec de la connexion.',
    }
  } finally {
    aiTesting.value = false
  }
}

const isMac = navigator.platform.toUpperCase().includes('MAC')

// --- Raccourcis de navigation entre apps -------------------------------------
const navShortcutError = ref<string | null>(null)

const onNavShortcutChange = (action: AppNavShortcutAction, accelerator: string): void => {
  // Refuse une combinaison deja assignee a un autre slot (eviterait deux apps sur la
  // meme touche). On signale l'app en conflit par son numero de slot.
  const conflictIndex = NAV_SHORTCUT_DEFS.findIndex(
    (def) => def.action !== action && store.resolvedNavShortcuts[def.action] === accelerator,
  )
  if (conflictIndex !== -1) {
    navShortcutError.value = `${formatAccelerator(accelerator, isMac)} est deja utilise par l'app ${conflictIndex + 1}.`
    return
  }
  navShortcutError.value = null
  void store.setNavShortcut(action, accelerator)
}

const resetNavShortcut = (action: AppNavShortcutAction): void => {
  navShortcutError.value = null
  void store.resetNavShortcut(action)
}

const resetAllNavShortcuts = (): void => {
  navShortcutError.value = null
  void store.resetAllNavShortcuts()
}

const toggleMascot = (): void => {
  mascot.setEnabled(!mascot.enabled)
}

const toggleMascotMute = (): void => {
  mascot.toggleMuted()
}

const testMascot = (): void => {
  if (!mascot.enabled) mascot.setEnabled(true)
  if (mascot.muted) mascot.setMuted(false)
  const quote = randomQuote()
  mascot.enqueue(
    {
      id: nextMascotId(),
      kind: 'quote',
      text: quote.text,
      author: quote.author,
      durationMs: 9500,
    },
    { force: true },
  )
}

const statusLabel = (status: AccountSetupStatus): string => {
  switch (status) {
    case 'connected':
      return 'Connecte'
    case 'error':
      return 'A reconnecter'
    case 'pending_setup':
      return 'En attente'
    default:
      return 'Brouillon'
  }
}

const statusTone = (status: AccountSetupStatus): 'success' | 'danger' | 'warning' | 'neutral' => {
  switch (status) {
    case 'connected':
      return 'success'
    case 'error':
      return 'danger'
    case 'pending_setup':
      return 'warning'
    default:
      return 'neutral'
  }
}

const faviconFor = (account: { settings?: Record<string, unknown> }): string | undefined => {
  const value = account.settings?.faviconUrl
  return typeof value === 'string' ? value : undefined
}

interface StartupOption {
  value: StartupView
  label: string
  description: string
  icon: typeof HomeIcon
}

const startupOptions: StartupOption[] = [
  {
    value: 'default-home',
    label: 'Accueil par defaut',
    description: "Conserve la page d'accueil livree avec Omnidesk.",
    icon: HomeIcon,
  },
  {
    value: 'custom-home',
    label: 'Accueil personnalise',
    description: 'Afficher vos widgets et leur disposition au demarrage.',
    icon: LayoutDashboard,
  },
  {
    value: 'inbox',
    label: 'Boite de reception',
    description: 'Ouvrir directement vos conversations.',
    icon: Inbox,
  },
  {
    value: 'notifications',
    label: 'Notifications',
    description: 'Ouvrir directement la vue des notifications.',
    icon: Bell,
  },
]

const connectedAccounts = computed(() =>
  store.accounts.filter((account) => account.setupStatus === 'connected'),
)

const formatLastSync = (value?: string): string => {
  if (!value) {
    return 'Jamais synchronise'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleString()
}

const confirmDisconnect = async (accountId: string, label: string): Promise<void> => {
  const ok = await confirm({
    title: `Deconnecter ${label} ?`,
    message: 'Les conversations locales associees seront supprimees.',
    confirmLabel: 'Deconnecter',
    tone: 'danger',
  })
  if (ok) {
    void store.disconnectAccount(accountId)
  }
}

// --- Sauvegarde et restauration ----------------------------------------------
const backupPassword = ref('')
const backupBusy = ref(false)

const exportBackup = async (): Promise<void> => {
  if (backupPassword.value.length < 8) {
    store.error = 'Le mot de passe de la sauvegarde doit faire au moins 8 caracteres.'
    return
  }
  backupBusy.value = true
  try {
    const saved = await store.exportBackup(backupPassword.value)
    if (saved) {
      store.actionFeedback = 'Sauvegarde exportee'
      backupPassword.value = ''
    }
  } finally {
    backupBusy.value = false
  }
}

const importBackup = async (): Promise<void> => {
  if (backupPassword.value.length === 0) {
    store.error = 'Saisissez le mot de passe de la sauvegarde a restaurer.'
    return
  }
  const ok = await confirm({
    title: 'Restaurer cette sauvegarde ?',
    message:
      'Toutes les donnees actuelles (comptes, messages, reglages, coffre omniPass) seront remplacees par celles de la sauvegarde, puis l\'application redemarrera.',
    confirmLabel: 'Restaurer et redemarrer',
    tone: 'danger',
  })
  if (!ok) {
    return
  }
  backupBusy.value = true
  try {
    const restored = await store.importBackup(backupPassword.value)
    if (restored) {
      store.actionFeedback = 'Sauvegarde restauree, redemarrage...'
    }
  } finally {
    backupBusy.value = false
  }
}

// --- Couleur d'accent --------------------------------------------------------
// store.accentColor = valeur commitee (base, source de verite). Pendant un glissement
// on applique directement au DOM (applyAccentColor) pour un apercu temps reel sans
// committer a chaque frame ; le commit (persistance base + cache via le watcher
// d'AppShell) se fait au relachement (@change) ou au clic (preset/reset).

const accentHexInput = ref(store.accentColor)
const hueValue = ref(hexToHsl(store.accentColor).h)

// Resynchronise les controles quand la couleur commitee change (preset, reset, base).
watch(
  () => store.accentColor,
  (color) => {
    accentHexInput.value = color
    hueValue.value = hexToHsl(color).h
  },
)

// Couleur affichee par la pastille/pioche : suit la saisie en direct si elle est valide.
const swatchColor = computed(() =>
  isValidHex(accentHexInput.value) ? normalizeHex(accentHexInput.value) : store.accentColor,
)

const isActivePreset = (hex: string): boolean =>
  normalizeHex(hex) === normalizeHex(store.accentColor)

const commitAccent = (hex: string): void => {
  if (isValidHex(hex)) {
    void store.setAccentColor(normalizeHex(hex))
  }
}

const onHueInput = (event: Event): void => {
  const hue = Number((event.target as HTMLInputElement).value)
  hueValue.value = hue
  // On fait tourner la teinte en conservant la saturation/luminosite courantes.
  const { s, l } = hexToHsl(store.accentColor)
  const hex = hslToHex(hue, s, l)
  accentHexInput.value = hex
  applyAccentColor(hex)
}

const onHueChange = (event: Event): void => {
  const hue = Number((event.target as HTMLInputElement).value)
  const { s, l } = hexToHsl(store.accentColor)
  commitAccent(hslToHex(hue, s, l))
}

const onPickerInput = (event: Event): void => {
  const hex = (event.target as HTMLInputElement).value
  accentHexInput.value = hex
  applyAccentColor(hex)
}

const onPickerChange = (event: Event): void => {
  commitAccent((event.target as HTMLInputElement).value)
}

const onHexInput = (event: Event): void => {
  const value = (event.target as HTMLInputElement).value
  accentHexInput.value = value
  if (isValidHex(value)) {
    applyAccentColor(normalizeHex(value))
  }
}

const onHexCommit = (): void => {
  if (isValidHex(accentHexInput.value)) {
    commitAccent(accentHexInput.value)
  } else {
    // Saisie invalide : on restaure la derniere couleur commitee (champ + apercu).
    accentHexInput.value = store.accentColor
    applyAccentColor(store.accentColor)
  }
}

const resetAccent = (): void => {
  commitAccent(DEFAULT_ACCENT)
}

// --- Couleur de fond ---------------------------------------------------------
// Meme logique que l'accent (apercu DOM en @input, commit en @change/clic). store.baseColor
// = base ink-950 commitee ; applyBaseColor en derive tout le degrade ink.

const baseHexInput = ref(store.baseColor)
const baseHueValue = ref(hexToHsl(store.baseColor).h)

watch(
  () => store.baseColor,
  (color) => {
    baseHexInput.value = color
    baseHueValue.value = hexToHsl(color).h
  },
)

const baseSwatchColor = computed(() =>
  isValidHex(baseHexInput.value) ? normalizeHex(baseHexInput.value) : store.baseColor,
)

const isActiveBasePreset = (hex: string): boolean =>
  normalizeHex(hex) === normalizeHex(store.baseColor)

const commitBase = (hex: string): void => {
  if (isValidHex(hex)) {
    void store.setBaseColor(normalizeHex(hex))
  }
}

// On plancher la saturation/luminosite pour que la teinte reste visible meme depuis un
// fond quasi noir (sinon toutes les teintes se ressemblent en near-black). La couleur
// exacte plus bas reste libre (liberte totale).
const toBaseTint = (hue: number): string => {
  const { s, l } = hexToHsl(store.baseColor)
  return hslToHex(hue, Math.max(s, 42), Math.max(l, 12))
}

const onBaseHueInput = (event: Event): void => {
  const hue = Number((event.target as HTMLInputElement).value)
  baseHueValue.value = hue
  const hex = toBaseTint(hue)
  baseHexInput.value = hex
  applyBaseColor(hex)
}

const onBaseHueChange = (event: Event): void => {
  commitBase(toBaseTint(Number((event.target as HTMLInputElement).value)))
}

const onBasePickerInput = (event: Event): void => {
  const hex = (event.target as HTMLInputElement).value
  baseHexInput.value = hex
  applyBaseColor(hex)
}

const onBasePickerChange = (event: Event): void => {
  commitBase((event.target as HTMLInputElement).value)
}

const onBaseHexInput = (event: Event): void => {
  const value = (event.target as HTMLInputElement).value
  baseHexInput.value = value
  if (isValidHex(value)) {
    applyBaseColor(normalizeHex(value))
  }
}

const onBaseHexCommit = (): void => {
  if (isValidHex(baseHexInput.value)) {
    commitBase(baseHexInput.value)
  } else {
    // Saisie invalide : on restaure la derniere base commitee (champ + apercu).
    baseHexInput.value = store.baseColor
    applyBaseColor(store.baseColor)
  }
}

const resetBase = (): void => {
  commitBase(DEFAULT_BASE)
}
</script>

<template>
  <section class="min-h-0 flex-1 overflow-auto p-5">
    <header class="mb-5">
      <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Reglages</p>
      <h2 class="mt-1 text-xl font-semibold text-white">Etat de l'application</h2>
    </header>

    <div class="grid gap-4">
      <div class="rounded-2xl bg-white/[0.04] p-4 shadow-line">
        <div class="mb-3 flex items-center gap-3">
          <HomeIcon class="text-accent-mint" :size="19" />
          <h3 class="text-sm font-semibold text-white">Demarrage</h3>
        </div>
        <p class="mb-4 text-sm leading-6 text-zinc-400">
          Choisissez la vue qui s'ouvre au lancement et lorsque vous cliquez sur l'icone d'accueil.
        </p>
        <div class="grid gap-2 sm:grid-cols-2">
          <label
            v-for="option in startupOptions"
            :key="option.value"
            class="flex cursor-pointer items-start gap-3 rounded-xl bg-ink-950/55 p-3 transition hover:bg-white/[0.06]"
            :class="{ 'ring-1 ring-accent-mint/40': store.startupView === option.value }"
          >
            <input
              :checked="store.startupView === option.value"
              class="sr-only"
              name="startup-view"
              type="radio"
              :value="option.value"
              @change="store.setStartupView(option.value)"
            />
            <span
              class="grid size-9 shrink-0 place-items-center rounded-lg"
              :class="
                store.startupView === option.value
                  ? 'bg-accent-mint/15 text-accent-mint'
                  : 'bg-white/[0.05] text-zinc-400'
              "
            >
              <component :is="option.icon" :size="15" />
            </span>
            <span class="min-w-0">
              <span class="block text-sm font-semibold text-zinc-100">{{ option.label }}</span>
              <span class="mt-0.5 block text-xs leading-5 text-zinc-500">{{
                option.description
              }}</span>
            </span>
          </label>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <div class="rounded-2xl bg-white/[0.04] p-4 shadow-line">
          <div class="mb-3 flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <Palette class="text-accent-mint" :size="19" />
              <h3 class="text-sm font-semibold text-white">Couleur de l'app</h3>
            </div>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
              @click="resetAccent"
            >
              <RotateCcw :size="13" />
              Reinitialiser
            </button>
          </div>
          <p class="mb-4 text-sm leading-6 text-zinc-400">
            Choisissez la couleur d'accent de toute l'application. L'apercu et l'interface se
            mettent a jour en direct pendant que vous reglez.
          </p>

          <!-- Apercu en direct : ces elements utilisent les vraies classes accent. -->
          <div class="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-ink-950/55 p-3">
            <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Apercu
            </span>
            <span class="relative h-6 w-11 shrink-0 rounded-full bg-accent-mint">
              <span class="absolute right-0.5 top-0.5 size-5 rounded-full bg-white shadow" />
            </span>
            <span
              class="inline-flex items-center gap-1.5 rounded-lg bg-accent-mint/15 px-2.5 py-1 text-xs font-medium text-accent-mint ring-1 ring-accent-mint/30"
            >
              <Sparkles :size="13" />
              Accent
            </span>
            <HomeIcon class="text-accent-mint" :size="18" />
            <span class="rounded-lg bg-accent-mint px-3 py-1.5 text-xs font-semibold text-ink-950">
              Bouton
            </span>
          </div>

          <!-- Palette de presets -->
          <p class="mb-2 text-xs font-medium text-zinc-500">Palette</p>
          <div class="mb-4 flex flex-wrap gap-2">
            <button
              v-for="preset in ACCENT_PRESETS"
              :key="preset.hex"
              type="button"
              class="grid size-8 place-items-center rounded-full transition"
              :style="{ backgroundColor: preset.hex }"
              :class="
                isActivePreset(preset.hex)
                  ? 'ring-2 ring-white/80 ring-offset-2 ring-offset-ink-900'
                  : 'ring-1 ring-white/10 hover:ring-white/40'
              "
              :title="preset.name"
              :aria-label="preset.name"
              @click="commitAccent(preset.hex)"
            >
              <Check
                v-if="isActivePreset(preset.hex)"
                :size="15"
                :stroke-width="3"
                class="text-ink-950"
              />
            </button>
          </div>

          <!-- Curseur de teinte : apercu temps reel pendant le glissement -->
          <p class="mb-2 text-xs font-medium text-zinc-500">Teinte</p>
          <input
            type="range"
            min="0"
            max="360"
            :value="hueValue"
            aria-label="Teinte de la couleur d'accent"
            class="accent-hue-slider mb-4 h-2.5 w-full cursor-pointer rounded-full"
            @input="onHueInput"
            @change="onHueChange"
          />

          <!-- Couleur exacte : pioche native + saisie hex (liberte totale) -->
          <p class="mb-2 text-xs font-medium text-zinc-500">Couleur exacte</p>
          <div class="flex items-center gap-2">
            <label
              class="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-lg ring-1 ring-white/15 transition hover:ring-white/40"
              :style="{ backgroundColor: swatchColor }"
              title="Choisir une couleur"
            >
              <input
                type="color"
                :value="swatchColor"
                class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Choisir une couleur exacte"
                @input="onPickerInput"
                @change="onPickerChange"
              />
            </label>
            <input
              type="text"
              :value="accentHexInput"
              spellcheck="false"
              maxlength="7"
              placeholder="#8ee6bf"
              class="w-28 rounded-lg bg-ink-950/55 px-2.5 py-1.5 font-mono text-sm text-zinc-200 outline-none ring-1 ring-white/10 transition focus:ring-accent-mint/50"
              aria-label="Code couleur hexadecimal"
              @input="onHexInput"
              @change="onHexCommit"
              @keydown.enter="onHexCommit"
            />
          </div>
        </div>

        <div class="rounded-2xl bg-white/[0.04] p-4 shadow-line">
          <div class="mb-3 flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <PaintBucket class="text-accent-mint" :size="19" />
              <h3 class="text-sm font-semibold text-white">Couleur de fond</h3>
            </div>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
              @click="resetBase"
            >
              <RotateCcw :size="13" />
              Reinitialiser
            </button>
          </div>
          <p class="mb-4 text-sm leading-6 text-zinc-400">
            Changez le fond sombre de l'application. Tout le degrade se derive de la couleur choisie
            et se met a jour en direct. Liberte totale : une couleur claire reste possible (le texte
            peut alors devenir peu lisible).
          </p>

          <!-- Apercu : profondeur du fond (ces surfaces utilisent les nuances ink). -->
          <div class="mb-4 overflow-hidden rounded-xl ring-1 ring-white/10">
            <div class="bg-ink-950 p-3">
              <div class="rounded-lg bg-ink-900 p-3 shadow-line">
                <p class="text-xs font-semibold text-white">Panneau</p>
                <p class="mt-1 text-xs text-zinc-400">Texte secondaire sur le fond.</p>
                <div class="mt-2 flex gap-1.5">
                  <span class="h-5 w-10 rounded bg-ink-800"></span>
                  <span class="h-5 w-10 rounded bg-ink-700"></span>
                  <span class="h-5 w-10 rounded bg-white/[0.06]"></span>
                </div>
              </div>
            </div>
          </div>

          <!-- Ambiances sombres pretes a l'emploi -->
          <p class="mb-2 text-xs font-medium text-zinc-500">Ambiances</p>
          <div class="mb-4 flex flex-wrap gap-2">
            <button
              v-for="preset in BASE_PRESETS"
              :key="preset.hex"
              type="button"
              class="grid size-8 place-items-center rounded-full transition"
              :style="{ backgroundColor: preset.hex }"
              :class="
                isActiveBasePreset(preset.hex)
                  ? 'ring-2 ring-white/80 ring-offset-2 ring-offset-ink-900'
                  : 'ring-1 ring-white/15 hover:ring-white/40'
              "
              :title="preset.name"
              :aria-label="preset.name"
              @click="commitBase(preset.hex)"
            >
              <Check
                v-if="isActiveBasePreset(preset.hex)"
                :size="14"
                :stroke-width="3"
                class="text-white"
              />
            </button>
          </div>

          <!-- Curseur de teinte -->
          <p class="mb-2 text-xs font-medium text-zinc-500">Teinte</p>
          <input
            type="range"
            min="0"
            max="360"
            :value="baseHueValue"
            aria-label="Teinte du fond"
            class="accent-hue-slider mb-4 h-2.5 w-full cursor-pointer rounded-full"
            @input="onBaseHueInput"
            @change="onBaseHueChange"
          />

          <!-- Couleur exacte : pioche native + saisie hex (liberte totale) -->
          <p class="mb-2 text-xs font-medium text-zinc-500">Couleur exacte</p>
          <div class="flex items-center gap-2">
            <label
              class="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-lg ring-1 ring-white/15 transition hover:ring-white/40"
              :style="{ backgroundColor: baseSwatchColor }"
              title="Choisir une couleur de fond"
            >
              <input
                type="color"
                :value="baseSwatchColor"
                class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Choisir une couleur de fond exacte"
                @input="onBasePickerInput"
                @change="onBasePickerChange"
              />
            </label>
            <input
              type="text"
              :value="baseHexInput"
              spellcheck="false"
              maxlength="7"
              placeholder="#090a0d"
              class="w-28 rounded-lg bg-ink-950/55 px-2.5 py-1.5 font-mono text-sm text-zinc-200 outline-none ring-1 ring-white/10 transition focus:ring-accent-mint/50"
              aria-label="Code couleur de fond hexadecimal"
              @input="onBaseHexInput"
              @change="onBaseHexCommit"
              @keydown.enter="onBaseHexCommit"
            />
          </div>
        </div>
      </div>

      <div class="rounded-2xl bg-white/[0.04] p-4 shadow-line">
        <div class="mb-3 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3">
            <Keyboard class="text-accent-mint" :size="19" />
            <h3 class="text-sm font-semibold text-white">Raccourcis des apps</h3>
          </div>
          <button
            type="button"
            class="rounded-lg px-2.5 py-1 text-xs text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
            @click="resetAllNavShortcuts"
          >
            Reinitialiser tout
          </button>
        </div>
        <p class="mb-4 text-sm leading-6 text-zinc-400">
          Sautez directement vers une app du rail. Cliquez sur un raccourci puis appuyez sur la
          combinaison voulue (avec au moins {{ isMac ? 'Cmd' : 'Ctrl' }}, Alt ou Maj). Echap pour
          annuler.
        </p>
        <div class="grid gap-1.5">
          <div
            v-for="(def, index) in NAV_SHORTCUT_DEFS"
            :key="def.action"
            class="flex items-center gap-3 rounded-xl bg-ink-950/55 px-3 py-2"
          >
            <span
              class="grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-xs font-semibold tabular-nums text-zinc-300"
            >
              {{ index + 1 }}
            </span>
            <div class="min-w-0 flex-1">
              <p
                class="truncate text-sm"
                :class="store.slotAccounts[index] ? 'text-zinc-200' : 'text-zinc-500 italic'"
              >
                {{ store.slotAccounts[index]?.label ?? 'Slot vide' }}
              </p>
            </div>
            <ShortcutCaptureField
              :model-value="store.resolvedNavShortcuts[def.action]"
              @update:model-value="(value) => onNavShortcutChange(def.action, value)"
            />
            <button
              type="button"
              class="grid size-7 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
              title="Reinitialiser ce raccourci"
              @click="resetNavShortcut(def.action)"
            >
              <RotateCcw :size="14" />
            </button>
          </div>
        </div>
        <p v-if="navShortcutError" class="mt-2 text-xs text-accent-coral">{{ navShortcutError }}</p>
      </div>

      <div class="rounded-2xl bg-white/[0.04] p-4 shadow-line">
        <div class="mb-3 flex items-center gap-3">
          <Bird class="text-accent-mint" :size="19" />
          <h3 class="text-sm font-semibold text-white">Elodie</h3>
        </div>
        <p class="mb-4 text-sm leading-6 text-zinc-400">
          La petite chouette qui veille sur votre bureau : citations, rappels bienveillants et
          pense-betes affiches dans une bulle, en plus des notifications.
        </p>

        <div class="flex items-center justify-between gap-3 rounded-xl bg-ink-950/55 p-3">
          <span class="min-w-0">
            <span class="block text-sm font-semibold text-zinc-100">Afficher Elodie</span>
            <span class="mt-0.5 block text-xs leading-5 text-zinc-500">
              Perchee en bas a droite, discrete et toujours la.
            </span>
          </span>
          <button
            type="button"
            role="switch"
            :aria-checked="mascot.enabled"
            aria-label="Afficher Elodie"
            class="relative h-6 w-11 shrink-0 rounded-full transition"
            :class="mascot.enabled ? 'bg-accent-mint' : 'bg-white/10'"
            @click="toggleMascot"
          >
            <span
              class="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform"
              :class="mascot.enabled ? 'translate-x-5' : 'translate-x-0'"
            />
          </button>
        </div>

        <div v-if="mascot.enabled" class="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg bg-accent-mint/15 px-3 py-1.5 text-xs font-medium text-accent-mint ring-1 ring-accent-mint/30 transition hover:bg-accent-mint/25"
            @click="testMascot"
          >
            <Bird :size="14" />
            Faire parler Elodie
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-zinc-200 ring-1 ring-white/10 transition hover:bg-white/[0.09]"
            @click="toggleMascotMute"
          >
            <Volume2 v-if="mascot.muted" :size="14" />
            <VolumeX v-else :size="14" />
            {{ mascot.muted ? 'Reactiver le son' : 'Couper le son' }}
          </button>
        </div>
      </div>

      <div class="rounded-2xl bg-white/[0.04] p-4 shadow-line">
        <div class="mb-3 flex items-center gap-3">
          <Bot class="text-accent-mint" :size="19" />
          <h3 class="text-sm font-semibold text-white">Assistant IA</h3>
        </div>
        <p class="mb-4 text-sm leading-6 text-zinc-400">
          Donnez une cle OpenAI a Elodie pour qu'elle reponde a vos questions dans une bulle de
          conversation. Votre cle est chiffree et ne quitte jamais cet ordinateur (sauf vers OpenAI).
        </p>

        <div class="flex items-center justify-between gap-3 rounded-xl bg-ink-950/55 p-3">
          <span class="min-w-0">
            <span class="block text-sm font-semibold text-zinc-100">Activer l'assistant</span>
            <span class="mt-0.5 block text-xs leading-5 text-zinc-500">
              Elodie pourra discuter et, plus tard, agir avec votre accord.
            </span>
          </span>
          <button
            type="button"
            role="switch"
            :aria-checked="ai.settings.enabled"
            aria-label="Activer l'assistant IA"
            class="relative h-6 w-11 shrink-0 rounded-full transition"
            :class="ai.settings.enabled ? 'bg-accent-mint' : 'bg-white/10'"
            @click="toggleAiEnabled"
          >
            <span
              class="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform"
              :class="ai.settings.enabled ? 'translate-x-5' : 'translate-x-0'"
            />
          </button>
        </div>

        <div class="mt-2 rounded-xl bg-ink-950/55 p-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-sm font-semibold text-zinc-100">Cle API OpenAI</span>
            <span
              v-if="ai.hasToken"
              class="inline-flex items-center gap-1.5 rounded-lg bg-accent-mint/15 px-2.5 py-1 text-xs font-medium text-accent-mint ring-1 ring-accent-mint/30"
            >
              <ShieldCheck :size="13" />
              Cle enregistree
            </span>
          </div>
          <div class="mt-2 flex items-center gap-2">
            <input
              v-model="aiTokenInput"
              type="password"
              autocomplete="off"
              spellcheck="false"
              :placeholder="ai.hasToken ? 'Remplacer la cle (sk-...)' : 'sk-...'"
              class="min-w-0 flex-1 rounded-lg bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-white/10 transition focus:ring-accent-mint/40"
              @keydown.enter="saveAiToken"
            />
            <BaseButton
              variant="primary"
              :disabled="!aiTokenInput.trim() || aiTokenSaving"
              @click="saveAiToken"
            >
              Enregistrer
            </BaseButton>
            <button
              v-if="ai.hasToken"
              type="button"
              class="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-zinc-300 ring-1 ring-white/10 transition hover:bg-accent-coral/10 hover:text-accent-coral"
              @click="clearAiToken"
            >
              Supprimer
            </button>
          </div>
          <p class="mt-2 text-xs leading-5 text-zinc-500">
            Creez une cle sur platform.openai.com. Elle est chiffree par votre systeme.
          </p>
        </div>

        <div class="mt-2 rounded-xl bg-ink-950/55 p-3">
          <label class="block text-sm font-semibold text-zinc-100" for="ai-model">Modele</label>
          <input
            id="ai-model"
            :value="ai.settings.model"
            placeholder="gpt-4o-mini"
            spellcheck="false"
            class="mt-2 w-full rounded-lg bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-white/10 transition focus:ring-accent-mint/40"
            @change="onAiModelChange"
          />
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <BaseButton
              variant="secondary"
              :disabled="aiTesting || !ai.hasToken"
              @click="testAiConnection"
            >
              <Spinner v-if="aiTesting" :size="14" label="Test en cours" />
              Tester la connexion
            </BaseButton>
            <span
              v-if="aiTestResult"
              class="text-xs"
              :class="aiTestResult.ok ? 'text-accent-mint' : 'text-accent-coral'"
            >
              {{ aiTestResult.message }}
            </span>
          </div>
        </div>
      </div>

      <div v-if="store.accounts.length > 0" class="rounded-2xl bg-white/[0.04] p-4 shadow-line">
        <div class="mb-3 flex items-center gap-3">
          <Users class="text-accent-mint" :size="19" />
          <h3 class="text-sm font-semibold text-white">Comptes connectes</h3>
        </div>
        <div class="grid gap-2">
          <div
            v-for="account in store.accounts"
            :key="account.id"
            class="flex items-center justify-between gap-3 rounded-xl bg-ink-950/55 px-3 py-2.5"
          >
            <div class="flex min-w-0 items-center gap-3">
              <span class="grid size-9 place-items-center rounded-lg bg-white/[0.05]">
                <ProviderLogo
                  :provider-id="account.providerId"
                  :favicon-url="faviconFor(account)"
                  :size="16"
                />
              </span>
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-zinc-100">{{ account.label }}</p>
                <p class="truncate text-xs text-zinc-500">
                  {{ formatLastSync(account.lastSyncAt) }}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <StatusBadge :tone="statusTone(account.setupStatus)">
                {{ statusLabel(account.setupStatus) }}
              </StatusBadge>
              <button
                v-if="account.setupStatus === 'connected'"
                class="grid size-8 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                :disabled="store.isWorking"
                title="Synchroniser ce compte"
                type="button"
                @click="store.refreshAccount(account.id)"
              >
                <Spinner v-if="store.isWorking" :size="15" label="Synchronisation" />
                <RefreshCw v-else :size="15" />
              </button>
              <button
                class="grid size-8 place-items-center rounded-lg text-zinc-400 transition hover:bg-accent-coral/10 hover:text-accent-coral disabled:opacity-40"
                :disabled="store.isWorking"
                title="Deconnecter ce compte"
                type="button"
                @click="confirmDisconnect(account.id, account.label)"
              >
                <Unplug :size="15" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-2xl bg-white/[0.04] p-4 shadow-line">
        <div class="mb-3 flex items-center gap-3">
          <Database class="text-accent-sky" :size="19" />
          <h3 class="text-sm font-semibold text-white">Emplacement des donnees</h3>
        </div>
        <p class="break-all text-sm leading-6 text-zinc-500">
          {{ store.localStatus?.databasePath }}
        </p>
      </div>

      <div class="rounded-2xl bg-white/[0.04] p-4 shadow-line">
        <div class="mb-3 flex items-center gap-3">
          <Download class="text-accent-mint" :size="19" />
          <h3 class="text-sm font-semibold text-white">Sauvegarde et restauration</h3>
        </div>
        <p class="text-sm leading-6 text-zinc-400">
          Exporte toutes vos donnees (comptes, messages, reglages, coffre omniPass, navigateur)
          dans un fichier chiffre par un mot de passe. La restauration remplace les donnees
          actuelles et redemarre l'application.
        </p>
        <input
          v-model="backupPassword"
          class="mt-3 h-10 w-full rounded-lg bg-ink-950/70 px-3 text-sm text-white outline-none shadow-line"
          type="password"
          placeholder="Mot de passe de la sauvegarde (8 caracteres min.)"
          autocomplete="off"
        />
        <div class="mt-3 flex flex-wrap gap-2">
          <BaseButton variant="secondary" type="button" :disabled="backupBusy" @click="exportBackup">
            <Spinner v-if="backupBusy" :size="14" label="Sauvegarde" />
            <Download v-else :size="15" />
            Exporter une sauvegarde
          </BaseButton>
          <BaseButton variant="ghost" type="button" :disabled="backupBusy" @click="importBackup">
            <Upload :size="15" />
            Restaurer une sauvegarde
          </BaseButton>
        </div>
        <p v-if="store.error" class="mt-3 text-xs text-accent-coral">{{ store.error }}</p>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div class="rounded-2xl bg-white/[0.04] p-4 shadow-line">
          <ShieldCheck class="mb-4 text-accent-mint" :size="20" />
          <p class="text-sm font-semibold text-white">Protection active</p>
          <p class="mt-1 text-sm text-zinc-500">
            La partie visible reste separee du coeur de l'app.
          </p>
        </div>
        <div class="rounded-2xl bg-white/[0.04] p-4 shadow-line">
          <KeyRound class="mb-4 text-accent-gold" :size="20" />
          <p class="text-sm font-semibold text-white">Acces sensibles</p>
          <p class="mt-1 text-sm text-zinc-500">Les informations sensibles restent protegees.</p>
        </div>
      </div>

      <div class="rounded-2xl bg-white/[0.04] p-4 shadow-line">
        <div class="mb-3 flex items-center gap-3">
          <MonitorCog class="text-accent-lilac" :size="19" />
          <h3 class="text-sm font-semibold text-white">Services disponibles</h3>
        </div>
        <div class="grid gap-2">
          <div
            v-for="provider in (store.localStatus?.providers?.length
              ? store.localStatus.providers
              : store.availableProviders
            ).filter((p) => p.id !== 'omnichat')"
            :key="provider.id"
            class="flex items-center justify-between rounded-xl bg-ink-950/55 px-3 py-2.5"
          >
            <span class="flex items-center gap-3 text-sm text-zinc-300">
              <span class="grid size-8 place-items-center rounded-lg bg-white/[0.05]">
                <ProviderLogo :provider-id="provider.id" :size="15" />
              </span>
              <span>{{ provider.displayName }}</span>
            </span>
            <StatusBadge :tone="provider.authReady ? 'success' : 'neutral'">
              {{ provider.authReady ? 'Configure' : 'A preparer' }}
            </StatusBadge>
          </div>
        </div>
      </div>

      <div v-if="connectedAccounts.length > 1" class="rounded-2xl bg-white/[0.04] p-4 shadow-line">
        <div class="mb-3 flex items-center gap-3">
          <LogOut class="text-zinc-400" :size="19" />
          <h3 class="text-sm font-semibold text-white">Tout synchroniser</h3>
        </div>
        <BaseButton
          variant="ghost"
          :disabled="store.isWorking"
          @click="connectedAccounts.forEach((account) => store.refreshAccount(account.id))"
        >
          <RefreshCw :size="15" />
          Lancer la synchronisation
        </BaseButton>
      </div>

      <div class="rounded-2xl bg-white/[0.04] p-4 shadow-line">
        <div class="mb-3 flex items-center gap-3">
          <PackageCheck class="text-accent-mint" :size="19" />
          <h3 class="text-sm font-semibold text-white">Version</h3>
        </div>
        <p class="text-sm leading-6 text-zinc-400">Omnidesk {{ store.localStatus?.appVersion }}</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Curseur de teinte : piste arc-en-ciel + pouce rond clair. */
.accent-hue-slider {
  -webkit-appearance: none;
  appearance: none;
  background-image: linear-gradient(
    to right,
    hsl(0, 75%, 62%),
    hsl(60, 75%, 62%),
    hsl(120, 75%, 62%),
    hsl(180, 75%, 62%),
    hsl(240, 75%, 62%),
    hsl(300, 75%, 62%),
    hsl(360, 75%, 62%)
  );
}

.accent-hue-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  background: #ffffff;
  border: 2px solid rgba(9, 10, 13, 0.35);
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.45);
  cursor: pointer;
}

.accent-hue-slider:focus-visible {
  outline: 2px solid rgb(var(--accent-mint) / 0.6);
  outline-offset: 2px;
}
</style>
