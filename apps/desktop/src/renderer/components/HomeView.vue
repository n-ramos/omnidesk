<script setup lang="ts">
import { ArrowRight, Bell, Inbox, Send, ShieldCheck } from 'lucide-vue-next'
import BaseButton from '@renderer/components/ui/BaseButton.vue'
import ProviderLogo from '@renderer/components/ui/ProviderLogo.vue'
import StatusBadge from '@renderer/components/ui/StatusBadge.vue'
import { confirm } from '@renderer/composables/useConfirm'
import { useAppStore } from '@renderer/stores/appStore'
import type { ProviderKind } from '@shared/models'
import {
  APP_SERVICE_PRESETS,
  WEB_SERVICE_PRESETS,
  type AppServicePreset,
  type WebServicePreset,
} from '@shared/webServices'

const store = useAppStore()

// Teinte de la pastille de chaque service (le logo porte la couleur de marque, ceci n'est
// qu'un fond discret).
const iconTint = (id: ProviderKind): string => {
  switch (id) {
    case 'slack':
      return 'bg-accent-mint/12 text-accent-mint'
    case 'teams':
      return 'bg-accent-lilac/12 text-accent-lilac'
    case 'outlook':
      return 'bg-accent-sky/12 text-accent-sky'
    case 'imap':
      return 'bg-accent-gold/12 text-accent-gold'
    case 'webpage':
      return 'bg-accent-coral/12 text-accent-coral'
    case 'omnichat':
      return 'bg-accent-mint/12 text-accent-mint'
    case 'github':
      return 'bg-accent-lilac/12 text-accent-lilac'
  }
}

// Slack, Teams... : raccourcis "mode web" qui creent un compte webpage preconfigure (meme
// logique que AddAccountDialog). Garde la page d'accueil alignee sur la liste complete des
// services proposes par l'application. Confirmation explicite avant l'ajout pour eviter
// les ajouts accidentels (le bouton ressemble a une carte d'info au premier coup d'oeil).
const connectWebService = async (preset: WebServicePreset): Promise<void> => {
  const ok = await confirm({
    title: `Ajouter ${preset.label} ?`,
    message: `${preset.label} sera ajoute a vos comptes en mode web. Vous pourrez vous y connecter dans la page (session isolee).`,
    confirmLabel: 'Ajouter',
    tone: 'primary',
  })
  if (!ok) {
    return
  }
  await store.connectWebpageAccount({ label: preset.label, url: preset.url })
}

const connectAppService = async (preset: AppServicePreset): Promise<void> => {
  await store.connectProvider(preset.id)
}
</script>

<template>
  <section class="scroll-thin flex min-h-0 flex-1 flex-col overflow-auto">
    <div class="border-b border-white/[0.06] px-8 py-8">
      <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-mint">
        Bienvenue
      </p>
      <h1 class="mt-3 text-3xl font-semibold tracking-tight text-white">
        Ajoutez votre premier service
      </h1>
      <p class="mt-3 max-w-2xl text-[15px] leading-7 text-zinc-300">
        Omnidesk sera votre espace unique pour retrouver vos messages. Choisissez un service
        ci-dessous pour commencer.
      </p>
      <div class="mt-6">
        <BaseButton variant="secondary" @click="store.openAccountWorkflow()">
          <ShieldCheck :size="16" />
          Voir tous les services
        </BaseButton>
      </div>
    </div>

    <div class="grid flex-1 gap-6 p-8 xl:grid-cols-[minmax(0,1.2fr)_340px]">
      <div class="grid content-start gap-4">
        <h2 class="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
          Services disponibles
        </h2>

        <button
          v-for="provider in store.availableProviders"
          :key="provider.id"
          class="group rounded-2xl bg-white/[0.045] p-5 text-left shadow-line transition duration-150 hover:-translate-y-0.5 hover:bg-white/[0.08] hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mint/40"
          type="button"
          @click="store.connectProvider(provider.id)"
        >
          <div class="flex items-start gap-4">
            <div
              class="grid size-12 shrink-0 place-items-center rounded-2xl"
              :class="iconTint(provider.id)"
            >
              <ProviderLogo :provider-id="provider.id" :size="22" />
            </div>
            <div class="flex min-w-0 flex-1 items-start justify-between gap-3">
              <div class="min-w-0">
                <h3 class="text-base font-semibold text-white">{{ provider.displayName }}</h3>
                <p class="mt-1.5 text-sm leading-6 text-zinc-400">
                  {{
                    provider.id === 'imap'
                      ? 'Ajoutez une boite mail classique avec IMAP et SMTP.'
                      : `Connectez votre compte ${provider.displayName}.`
                  }}
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-3">
                <StatusBadge :tone="provider.authReady ? 'success' : 'neutral'">
                  {{ provider.authReady ? 'Pret' : 'A preparer' }}
                </StatusBadge>
                <ArrowRight
                  :size="16"
                  class="text-zinc-500 transition group-hover:translate-x-0.5 group-hover:text-zinc-200"
                />
              </div>
            </div>
          </div>
        </button>

        <button
          v-for="service in WEB_SERVICE_PRESETS"
          :key="service.id"
          class="group rounded-2xl bg-white/[0.045] p-5 text-left shadow-line transition duration-150 hover:-translate-y-0.5 hover:bg-white/[0.08] hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mint/40"
          type="button"
          @click="connectWebService(service)"
        >
          <div class="flex items-start gap-4">
            <div
              class="grid size-12 shrink-0 place-items-center rounded-2xl"
              :class="iconTint(service.id)"
            >
              <ProviderLogo :provider-id="service.id" :size="22" />
            </div>
            <div class="flex min-w-0 flex-1 items-start justify-between gap-3">
              <div class="min-w-0">
                <h3 class="text-base font-semibold text-white">{{ service.label }}</h3>
                <p class="mt-1.5 text-sm leading-6 text-zinc-400">{{ service.description }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-3">
                <StatusBadge tone="success">Mode web</StatusBadge>
                <ArrowRight
                  :size="16"
                  class="text-zinc-500 transition group-hover:translate-x-0.5 group-hover:text-zinc-200"
                />
              </div>
            </div>
          </div>
        </button>

        <button
          v-for="service in APP_SERVICE_PRESETS"
          :key="service.id"
          class="group rounded-2xl bg-white/[0.045] p-5 text-left shadow-line transition duration-150 hover:-translate-y-0.5 hover:bg-white/[0.08] hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-mint/40"
          type="button"
          @click="connectAppService(service)"
        >
          <div class="flex items-start gap-4">
            <div
              class="grid size-12 shrink-0 place-items-center rounded-2xl"
              :class="iconTint(service.id)"
            >
              <ProviderLogo :provider-id="service.id" :size="22" />
            </div>
            <div class="flex min-w-0 flex-1 items-start justify-between gap-3">
              <div class="min-w-0">
                <h3 class="text-base font-semibold text-white">{{ service.label }}</h3>
                <p class="mt-1.5 text-sm leading-6 text-zinc-400">{{ service.description }}</p>
              </div>
              <div class="flex shrink-0 items-center gap-3">
                <StatusBadge tone="success">{{ service.badge }}</StatusBadge>
                <ArrowRight
                  :size="16"
                  class="text-zinc-500 transition group-hover:translate-x-0.5 group-hover:text-zinc-200"
                />
              </div>
            </div>
          </div>
        </button>
      </div>

      <aside class="self-start rounded-2xl bg-white/[0.045] p-5 shadow-line">
        <h2 class="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
          Ce que vous aurez ici
        </h2>
        <div class="mt-4 space-y-3">
          <div class="flex gap-3 rounded-xl bg-ink-950/60 p-4">
            <div class="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-mint/12 text-accent-mint">
              <Inbox :size="16" />
            </div>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-white">Messages reunis</p>
              <p class="mt-1 text-sm leading-6 text-zinc-400">
                Tous vos messages au meme endroit, sans changer de fenetre.
              </p>
            </div>
          </div>
          <div class="flex gap-3 rounded-xl bg-ink-950/60 p-4">
            <div class="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-sky/12 text-accent-sky">
              <Bell :size="16" />
            </div>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-white">Notifications utiles</p>
              <p class="mt-1 text-sm leading-6 text-zinc-400">
                Les alertes importantes, sans le bruit inutile.
              </p>
            </div>
          </div>
          <div class="flex gap-3 rounded-xl bg-ink-950/60 p-4">
            <div class="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-coral/12 text-accent-coral">
              <Send :size="16" />
            </div>
            <div class="min-w-0">
              <p class="text-sm font-semibold text-white">Reponse rapide</p>
              <p class="mt-1 text-sm leading-6 text-zinc-400">
                Une vue simple pour lire et repondre plus vite.
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>
