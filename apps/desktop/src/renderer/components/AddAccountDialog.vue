<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { CheckCircle2, ChevronDown, ChevronRight, Search, X } from 'lucide-vue-next'
import BaseButton from '@renderer/components/ui/BaseButton.vue'
import ProviderLogo from '@renderer/components/ui/ProviderLogo.vue'
import Spinner from '@renderer/components/ui/Spinner.vue'
import StatusBadge from '@renderer/components/ui/StatusBadge.vue'
import { useAppStore } from '@renderer/stores/appStore'
import type {
  ConnectImapAccountInput,
  ConnectWebpageAccountInput,
  MailAutodiscoverResult,
  MailSocketType,
} from '@shared/models'
import {
  APP_SERVICE_PRESETS,
  WEB_SERVICE_PRESETS,
  type AppServicePreset,
  type WebServicePreset,
} from '@shared/webServices'

const store = useAppStore()

interface MailServerForm {
  host: string
  port: number
  socketType: MailSocketType
  username: string
}

interface ImapFormState {
  label: string
  emailAddress: string
  displayName: string
  password: string
  imap: MailServerForm
  smtp: MailServerForm
  detecting: boolean
  detectionSource?: MailAutodiscoverResult['source']
  detectionMessage?: string
  detectionBrand?: string
  showAdvanced: boolean
  testing: boolean
  testStatus: 'idle' | 'passed' | 'failed'
  testMessage?: string
}

const defaultServer = (port: number, socketType: MailSocketType): MailServerForm => ({
  host: '',
  port,
  socketType,
  username: '',
})

const imapForm = reactive<ImapFormState>({
  label: '',
  emailAddress: '',
  displayName: '',
  password: '',
  imap: defaultServer(993, 'SSL'),
  smtp: defaultServer(465, 'SSL'),
  detecting: false,
  detectionSource: undefined,
  detectionMessage: undefined,
  detectionBrand: undefined,
  showAdvanced: false,
  testing: false,
  testStatus: 'idle',
  testMessage: undefined,
})

const lastDetectedEmail = ref<string | undefined>(undefined)

interface WebpageFormState {
  url: string
  label: string
}

const webpageForm = reactive<WebpageFormState>({
  url: '',
  label: '',
})

const isValidHttpUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

const canConnectWebpage = computed(
  () =>
    webpageForm.label.trim().length > 0
    && isValidHttpUrl(webpageForm.url.trim())
    && !store.isWorking,
)

const resetWebpageForm = (): void => {
  webpageForm.url = ''
  webpageForm.label = ''
}

const submitWebpageConnect = async (): Promise<void> => {
  if (!canConnectWebpage.value) {
    return
  }

  const payload: ConnectWebpageAccountInput = {
    label: webpageForm.label.trim(),
    url: webpageForm.url.trim(),
  }

  const ok = await store.connectWebpageAccount(payload)
  if (ok) {
    resetWebpageForm()
  }
}

// Raccourcis "mode web" (Slack, Teams...) : creent un compte webpage preconfigure sur
// l'URL du service. L'authentification se fait dans la page, session isolee par compte.
const connectWebService = async (preset: WebServicePreset): Promise<void> => {
  await store.connectWebpageAccount({ label: preset.label, url: preset.url })
}

const connectAppService = async (preset: AppServicePreset): Promise<void> => {
  await store.connectProvider(preset.id)
}

const selectedProvider = computed(() =>
  store.availableProviders.find((provider) => provider.id === store.activeProviderId),
)

const advancedComplete = computed(
  () =>
    imapForm.imap.host.trim().length > 0
    && imapForm.smtp.host.trim().length > 0
    && imapForm.imap.port > 0
    && imapForm.smtp.port > 0,
)

const canTest = computed(
  () => imapForm.emailAddress.includes('@')
    && imapForm.password.length > 0
    && advancedComplete.value
    && !imapForm.testing,
)

const canConnect = computed(
  () => canTest.value && imapForm.label.trim().length > 0 && !store.isWorking,
)

const resetImapForm = (): void => {
  imapForm.label = ''
  imapForm.emailAddress = ''
  imapForm.displayName = ''
  imapForm.password = ''
  imapForm.imap = defaultServer(993, 'SSL')
  imapForm.smtp = defaultServer(465, 'SSL')
  imapForm.detecting = false
  imapForm.detectionSource = undefined
  imapForm.detectionMessage = undefined
  imapForm.detectionBrand = undefined
  imapForm.showAdvanced = false
  imapForm.testing = false
  imapForm.testStatus = 'idle'
  imapForm.testMessage = undefined
  lastDetectedEmail.value = undefined
}

const labelFromSource = (source?: MailAutodiscoverResult['source']): string => {
  switch (source) {
    case 'mozilla-isp':
      return 'Reglages publies par le fournisseur'
    case 'mozilla-thunderbird':
      return 'Base Thunderbird/Mozilla'
    case 'dns-srv':
      return 'Enregistrements DNS SRV'
    case 'dns-mx':
      return 'Enregistrements DNS MX'
    case 'guess':
      return 'Devinette basee sur le domaine'
    default:
      return ''
  }
}

const markFormDirty = (): void => {
  imapForm.testStatus = 'idle'
  imapForm.testMessage = undefined
}

const applyAutodiscover = (result: MailAutodiscoverResult): void => {
  if (result.imap) {
    imapForm.imap = {
      host: result.imap.host,
      port: result.imap.port,
      socketType: result.imap.socketType,
      username: result.imap.username || imapForm.emailAddress,
    }
  }
  if (result.smtp) {
    imapForm.smtp = {
      host: result.smtp.host,
      port: result.smtp.port,
      socketType: result.smtp.socketType,
      username: result.smtp.username || imapForm.emailAddress,
    }
  }
  imapForm.detectionSource = result.source
  imapForm.detectionMessage = labelFromSource(result.source)
  imapForm.detectionBrand = result.displayName
  if (!imapForm.label && result.displayName) {
    imapForm.label = result.displayName
  }
  if (result.source === 'guess') {
    imapForm.showAdvanced = true
  }
  markFormDirty()
}

const triggerAutodiscover = async (): Promise<void> => {
  const email = imapForm.emailAddress.trim()
  if (!email.includes('@')) {
    return
  }

  if (lastDetectedEmail.value === email) {
    return
  }

  imapForm.detecting = true
  try {
    const result = await store.autodiscoverImap(email)
    if (result) {
      applyAutodiscover(result)
      lastDetectedEmail.value = email
    }
  } finally {
    imapForm.detecting = false
  }
}

const ensureUsernames = (): void => {
  const email = imapForm.emailAddress.trim()
  if (!imapForm.imap.username) {
    imapForm.imap.username = email
  }
  if (!imapForm.smtp.username) {
    imapForm.smtp.username = email
  }
  if (!imapForm.label) {
    imapForm.label = email
  }
}

const buildPayload = (): ConnectImapAccountInput => {
  ensureUsernames()
  const email = imapForm.emailAddress.trim()
  return {
    label: imapForm.label.trim() || email,
    emailAddress: email,
    displayName: imapForm.displayName.trim() || undefined,
    password: imapForm.password,
    imap: {
      host: imapForm.imap.host.trim(),
      port: imapForm.imap.port,
      socketType: imapForm.imap.socketType,
      username: imapForm.imap.username.trim() || email,
    },
    smtp: {
      host: imapForm.smtp.host.trim(),
      port: imapForm.smtp.port,
      socketType: imapForm.smtp.socketType,
      username: imapForm.smtp.username.trim() || email,
    },
  }
}

const runTest = async (): Promise<boolean> => {
  if (!canTest.value) {
    return false
  }

  imapForm.testing = true
  imapForm.testStatus = 'idle'
  imapForm.testMessage = undefined

  try {
    const payload = buildPayload()
    const result = await store.testImapConnection(payload)
    if (result.ok) {
      imapForm.testStatus = 'passed'
      imapForm.testMessage = 'Connexion IMAP et SMTP verifiees.'
      return true
    }
    imapForm.testStatus = 'failed'
    imapForm.testMessage = result.message ?? 'Le test a echoue.'
    return false
  } finally {
    imapForm.testing = false
  }
}

const submitImapConnect = async (): Promise<void> => {
  if (!canConnect.value) {
    return
  }
  const payload = buildPayload()
  const ok = await store.connectImapAccount(payload)
  if (ok) {
    resetImapForm()
  }
}

const closeDialog = (): void => {
  store.closeAccountWorkflow()
  resetImapForm()
  resetWebpageForm()
}

const toggleAdvanced = (): void => {
  imapForm.showAdvanced = !imapForm.showAdvanced
}
</script>

<template>
  <div
    v-if="store.accountWorkflowStep !== 'closed'"
    class="app-no-drag absolute inset-0 z-40 overflow-auto bg-black/52 p-6 backdrop-blur-sm"
  >
    <section class="mx-auto my-8 w-full max-w-xl overflow-hidden rounded-2xl bg-ink-900 shadow-soft shadow-line">
      <header class="flex items-center justify-between border-b border-white/[0.04] px-5 py-4">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-mint">
            Ajouter un compte
          </p>
          <h2 class="mt-1 text-lg font-semibold text-white">
            {{ selectedProvider ? selectedProvider.displayName : 'Choisir un service' }}
          </h2>
        </div>
        <button
          aria-label="Fermer"
          class="grid size-9 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
          type="button"
          @click="closeDialog"
        >
          <X :size="18" />
        </button>
      </header>

      <div v-if="store.accountWorkflowStep === 'choose-provider'" class="grid gap-2 p-4">
        <button
          v-for="provider in store.availableProviders"
          :key="provider.id"
          class="flex items-center justify-between rounded-xl bg-white/[0.04] p-4 text-left transition hover:bg-white/[0.07]"
          type="button"
          @click="store.connectProvider(provider.id)"
        >
          <div class="flex min-w-0 items-center gap-3">
            <span class="grid size-11 place-items-center rounded-xl bg-white/[0.055] text-zinc-100">
              <ProviderLogo :provider-id="provider.id" :size="19" />
            </span>
            <span class="min-w-0">
              <span class="block text-sm font-semibold text-zinc-100">
                {{ provider.displayName }}
              </span>
              <span class="mt-1 block text-sm text-zinc-500">
                {{
                  provider.id === 'imap'
                    ? 'Connexion par mot de passe (autodetection)'
                    : provider.id === 'webpage'
                      ? 'Connexion directement dans la page (session isolee)'
                      : 'Verifier la configuration'
                }}
              </span>
            </span>
          </div>
          <StatusBadge :tone="provider.authReady ? 'success' : 'neutral'">
            {{ provider.authReady ? 'Pret' : 'A preparer' }}
          </StatusBadge>
        </button>

        <button
          v-for="service in WEB_SERVICE_PRESETS"
          :key="service.id"
          class="flex items-center justify-between rounded-xl bg-white/[0.04] p-4 text-left transition hover:bg-white/[0.07]"
          type="button"
          @click="connectWebService(service)"
        >
          <div class="flex min-w-0 items-center gap-3">
            <span class="grid size-11 place-items-center rounded-xl bg-white/[0.055] text-zinc-100">
              <ProviderLogo :provider-id="service.id" :size="19" />
            </span>
            <span class="min-w-0">
              <span class="block text-sm font-semibold text-zinc-100">{{ service.label }}</span>
              <span class="mt-1 block text-sm text-zinc-500">{{ service.description }}</span>
            </span>
          </div>
          <StatusBadge tone="success">Mode web</StatusBadge>
        </button>

        <button
          v-for="service in APP_SERVICE_PRESETS"
          :key="service.id"
          class="flex items-center justify-between rounded-xl bg-white/[0.04] p-4 text-left transition hover:bg-white/[0.07]"
          type="button"
          @click="connectAppService(service)"
        >
          <div class="flex min-w-0 items-center gap-3">
            <span class="grid size-11 place-items-center rounded-xl bg-white/[0.055] text-zinc-100">
              <ProviderLogo :provider-id="service.id" :size="19" />
            </span>
            <span class="min-w-0">
              <span class="block text-sm font-semibold text-zinc-100">{{ service.label }}</span>
              <span class="mt-1 block text-sm text-zinc-500">{{ service.description }}</span>
            </span>
          </div>
          <StatusBadge tone="success">{{ service.badge }}</StatusBadge>
        </button>
      </div>

      <form
        v-else-if="store.accountWorkflowStep === 'imap-form'"
        class="grid gap-4 p-5"
        @submit.prevent="submitImapConnect"
      >
        <div class="rounded-2xl bg-white/[0.04] p-4 shadow-line">
          <h3 class="text-base font-semibold text-white">Connexion IMAP / SMTP</h3>
          <p class="mt-2 text-sm leading-6 text-zinc-500">
            Donnez votre adresse mail et votre mot de passe. Omnidesk detecte automatiquement les
            serveurs (Mozilla autoconfig + DNS SRV). Vous pouvez ajuster les reglages avant de
            tester ou de connecter.
          </p>
        </div>

        <label class="grid gap-1.5 text-sm text-zinc-300">
          Adresse mail
          <input
            v-model="imapForm.emailAddress"
            class="h-10 rounded-lg bg-ink-950/70 px-3 text-sm text-white outline-none shadow-line"
            placeholder="toi@exemple.com"
            required
            type="email"
            @blur="triggerAutodiscover"
            @input="markFormDirty"
          />
        </label>

        <label class="grid gap-1.5 text-sm text-zinc-300">
          Mot de passe
          <input
            v-model="imapForm.password"
            class="h-10 rounded-lg bg-ink-950/70 px-3 text-sm text-white outline-none shadow-line"
            placeholder="Mot de passe ou mot de passe d'application"
            required
            type="password"
            @input="markFormDirty"
          />
        </label>

        <div class="grid grid-cols-2 gap-3">
          <label class="grid gap-1.5 text-sm text-zinc-300">
            Nom du compte
            <input
              v-model="imapForm.label"
              class="h-10 rounded-lg bg-ink-950/70 px-3 text-sm text-white outline-none shadow-line"
              placeholder="Pro, Perso, Infomaniak..."
            />
          </label>
          <label class="grid gap-1.5 text-sm text-zinc-300">
            Nom affiche
            <input
              v-model="imapForm.displayName"
              class="h-10 rounded-lg bg-ink-950/70 px-3 text-sm text-white outline-none shadow-line"
              placeholder="Prenom Nom"
            />
          </label>
        </div>

        <div
          v-if="imapForm.detecting"
          class="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-sm text-zinc-400"
        >
          <Search :size="14" class="animate-pulse" />
          Detection des serveurs IMAP/SMTP en cours...
        </div>

        <div
          v-else-if="imapForm.detectionMessage"
          class="flex items-start gap-2 rounded-xl bg-accent-mint/10 px-3 py-2 text-sm text-accent-mint"
        >
          <CheckCircle2 :size="14" class="mt-0.5 shrink-0" />
          <span class="min-w-0">
            <span class="block font-medium">
              {{ imapForm.detectionBrand ? `Detecte : ${imapForm.detectionBrand}` : 'Reglages detectes' }}
            </span>
            <span class="block text-xs text-accent-mint/80">
              Source : {{ imapForm.detectionMessage }}
            </span>
          </span>
        </div>

        <button
          class="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-left text-sm text-zinc-200 transition hover:bg-white/[0.06]"
          type="button"
          @click="toggleAdvanced"
        >
          <span class="flex items-center gap-2 font-medium">
            <component
              :is="imapForm.showAdvanced ? ChevronDown : ChevronRight"
              :size="14"
              class="text-zinc-400"
            />
            Configuration avancee (hosts, ports, chiffrement)
          </span>
          <span class="text-xs text-zinc-500">
            {{ imapForm.showAdvanced ? 'Replier' : 'Deployer' }}
          </span>
        </button>

        <div v-if="imapForm.showAdvanced" class="grid gap-3">
          <fieldset class="grid gap-3 rounded-2xl bg-white/[0.04] p-4">
            <legend class="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              Serveur entrant (IMAP)
            </legend>
            <div class="grid grid-cols-2 gap-3">
              <label class="grid gap-1.5 text-sm text-zinc-300">
                Adresse
                <input
                  v-model="imapForm.imap.host"
                  class="h-10 rounded-lg bg-ink-950/70 px-3 text-sm text-white outline-none shadow-line"
                  placeholder="imap.exemple.com"
                  @input="markFormDirty"
                />
              </label>
              <label class="grid gap-1.5 text-sm text-zinc-300">
                Port
                <input
                  v-model.number="imapForm.imap.port"
                  class="h-10 rounded-lg bg-ink-950/70 px-3 text-sm text-white outline-none shadow-line"
                  max="65535"
                  min="1"
                  type="number"
                  @input="markFormDirty"
                />
              </label>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <label class="grid gap-1.5 text-sm text-zinc-300">
                Chiffrement
                <select
                  v-model="imapForm.imap.socketType"
                  class="h-10 rounded-lg bg-ink-950/70 px-3 text-sm text-white outline-none shadow-line"
                  @change="markFormDirty"
                >
                  <option value="SSL">SSL/TLS</option>
                  <option value="STARTTLS">STARTTLS</option>
                  <option value="plain">Aucun</option>
                </select>
              </label>
              <label class="grid gap-1.5 text-sm text-zinc-300">
                Nom d'utilisateur
                <input
                  v-model="imapForm.imap.username"
                  class="h-10 rounded-lg bg-ink-950/70 px-3 text-sm text-white outline-none shadow-line"
                  placeholder="toi@exemple.com"
                  @input="markFormDirty"
                />
              </label>
            </div>
          </fieldset>

          <fieldset class="grid gap-3 rounded-2xl bg-white/[0.04] p-4">
            <legend class="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              Serveur sortant (SMTP)
            </legend>
            <div class="grid grid-cols-2 gap-3">
              <label class="grid gap-1.5 text-sm text-zinc-300">
                Adresse
                <input
                  v-model="imapForm.smtp.host"
                  class="h-10 rounded-lg bg-ink-950/70 px-3 text-sm text-white outline-none shadow-line"
                  placeholder="smtp.exemple.com"
                  @input="markFormDirty"
                />
              </label>
              <label class="grid gap-1.5 text-sm text-zinc-300">
                Port
                <input
                  v-model.number="imapForm.smtp.port"
                  class="h-10 rounded-lg bg-ink-950/70 px-3 text-sm text-white outline-none shadow-line"
                  max="65535"
                  min="1"
                  type="number"
                  @input="markFormDirty"
                />
              </label>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <label class="grid gap-1.5 text-sm text-zinc-300">
                Chiffrement
                <select
                  v-model="imapForm.smtp.socketType"
                  class="h-10 rounded-lg bg-ink-950/70 px-3 text-sm text-white outline-none shadow-line"
                  @change="markFormDirty"
                >
                  <option value="SSL">SSL/TLS</option>
                  <option value="STARTTLS">STARTTLS</option>
                  <option value="plain">Aucun</option>
                </select>
              </label>
              <label class="grid gap-1.5 text-sm text-zinc-300">
                Nom d'utilisateur
                <input
                  v-model="imapForm.smtp.username"
                  class="h-10 rounded-lg bg-ink-950/70 px-3 text-sm text-white outline-none shadow-line"
                  placeholder="toi@exemple.com"
                  @input="markFormDirty"
                />
              </label>
            </div>
          </fieldset>
        </div>

        <div
          v-if="imapForm.testStatus === 'passed'"
          class="flex items-center gap-2 rounded-xl bg-accent-mint/10 px-3 py-2 text-sm text-accent-mint"
        >
          <CheckCircle2 :size="14" />
          {{ imapForm.testMessage }}
        </div>
        <div
          v-else-if="imapForm.testStatus === 'failed'"
          class="rounded-xl bg-accent-coral/10 px-3 py-2 text-sm text-accent-coral"
        >
          {{ imapForm.testMessage }}
        </div>

        <p
          v-if="store.error && imapForm.testStatus !== 'failed'"
          class="rounded-xl bg-accent-coral/10 px-3 py-2 text-sm text-accent-coral"
        >
          {{ store.error }}
        </p>

        <div class="flex justify-between gap-2 border-t border-white/[0.04] pt-4">
          <BaseButton variant="ghost" type="button" @click="closeDialog">Annuler</BaseButton>
          <div class="flex gap-2">
            <BaseButton
              :disabled="!canTest"
              variant="ghost"
              type="button"
              @click="runTest"
            >
              <Spinner v-if="imapForm.testing" :size="14" label="Test" />
              {{ imapForm.testing ? 'Test en cours...' : 'Tester' }}
            </BaseButton>
            <BaseButton :disabled="!canConnect" variant="primary">
              <Spinner v-if="store.isWorking" :size="14" label="Connexion" />
              {{ store.isWorking ? 'Connexion...' : 'Connecter' }}
            </BaseButton>
          </div>
        </div>
      </form>

      <form
        v-else-if="store.accountWorkflowStep === 'webpage-form'"
        class="grid gap-4 p-5"
        @submit.prevent="submitWebpageConnect"
      >
        <label class="grid gap-1.5 text-sm text-zinc-300">
          Adresse de la page
          <input
            v-model="webpageForm.url"
            class="h-10 rounded-lg bg-ink-950/70 px-3 text-sm text-white outline-none shadow-line"
            placeholder="https://exemple.com"
            required
            type="url"
          />
        </label>

        <label class="grid gap-1.5 text-sm text-zinc-300">
          Nom du compte
          <input
            v-model="webpageForm.label"
            class="h-10 rounded-lg bg-ink-950/70 px-3 text-sm text-white outline-none shadow-line"
            placeholder="Ex: WhatsApp"
            required
          />
        </label>

        <p
          v-if="store.error"
          class="rounded-xl bg-accent-coral/10 px-3 py-2 text-sm text-accent-coral"
        >
          {{ store.error }}
        </p>

        <div class="flex justify-between gap-2 border-t border-white/[0.04] pt-4">
          <BaseButton variant="ghost" type="button" @click="closeDialog">Annuler</BaseButton>
          <BaseButton :disabled="!canConnectWebpage" variant="primary">
            <Spinner v-if="store.isWorking" :size="14" label="Ajout" />
            {{ store.isWorking ? 'Ajout en cours...' : 'Ajouter' }}
          </BaseButton>
        </div>
      </form>
    </section>
  </div>
</template>
