<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  AlertTriangle,
  CircleDot,
  Maximize2,
  MonitorUp,
  PhoneOff,
  ShieldCheck,
  Users,
  Video,
} from 'lucide-vue-next'
import BaseButton from '@renderer/components/ui/BaseButton.vue'
import StatusBadge from '@renderer/components/ui/StatusBadge.vue'
import { openCallOverlay } from '@renderer/composables/useCallOverlay'
import { useOmnichat } from '@renderer/composables/useOmnichat'
import { useSessionStore } from '@renderer/stores/sessionStore'

const omnichat = useOmnichat()
const state = omnichat.state
const session = useSessionStore()

// Proxy present mais pas connecte : la messagerie et les appels exigent un compte.
const needsLogin = computed(() => session.isConfigured && !session.isAuthenticated)

// Les appels passent par OmniProxy. Sur une installation sans proxy (ex. la
// distribution grand public), ils sont indisponibles : on le signale ici plutot
// que de laisser l'utilisateur lancer un appel voue a echouer.
const availability = ref<'unknown' | 'available' | 'unavailable'>('unknown')

onMounted(async () => {
  void session.init()
  try {
    const result = await window.omnidesk?.omnichat.availability()
    availability.value = result?.available ? 'available' : 'unavailable'
  } catch {
    availability.value = 'unavailable'
  }
})

const resume = (): void => {
  openCallOverlay()
}

const hangUp = async (): Promise<void> => {
  await omnichat.leave()
}

const features = [
  { icon: Video, label: 'Audio et video', detail: 'Appels de groupe en direct, micro et camera.' },
  { icon: MonitorUp, label: "Partage d'ecran", detail: 'Diffuse une fenetre ou ton ecran entier.' },
  { icon: CircleDot, label: 'Enregistrement', detail: "Capture l'appel cote serveur a la demande." },
]
</script>

<template>
  <section class="min-h-0 flex-1 overflow-auto p-5">
    <header class="mb-5 flex items-center justify-between">
      <div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Omnichat
        </p>
        <h2 class="mt-1 text-xl font-semibold text-white">Centre d'appels</h2>
      </div>
      <StatusBadge
        :tone="
          needsLogin
            ? 'neutral'
            : availability === 'available'
              ? 'success'
              : availability === 'unavailable'
                ? 'danger'
                : 'neutral'
        "
      >
        {{
          needsLogin
            ? 'Connexion requise'
            : availability === 'available'
              ? 'Pret'
              : availability === 'unavailable'
                ? 'Indisponible'
                : 'Verification...'
        }}
      </StatusBadge>
    </header>

    <!-- Appel en cours : seul point de retour quand l'overlay a ete reduit. -->
    <article
      v-if="state.active || state.connecting"
      class="mb-4 flex flex-col gap-4 rounded-2xl border border-accent-mint/25 bg-accent-mint/[0.06] p-5 shadow-line sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="flex min-w-0 items-center gap-3">
        <span class="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-mint/15 text-accent-mint">
          <Video :size="20" />
        </span>
        <div class="min-w-0">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-mint">
            {{ state.connecting ? 'Connexion...' : 'Appel en cours' }}
          </p>
          <h3 class="truncate text-base font-semibold text-white">
            {{ state.title || 'Appel' }}
          </h3>
          <p class="mt-0.5 flex items-center gap-1.5 text-xs text-zinc-400">
            <Users :size="13" />
            {{ state.roster.length }} participant{{ state.roster.length > 1 ? 's' : '' }}
            <span
              v-if="state.recording"
              class="ml-1 inline-flex items-center gap-1 text-accent-coral"
            >
              <span class="size-1.5 animate-pulse rounded-full bg-accent-coral" />
              Enregistrement
            </span>
          </p>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <BaseButton variant="primary" @click="resume">
          <Maximize2 :size="16" />
          Revenir a l'appel
        </BaseButton>
        <BaseButton variant="secondary" @click="hangUp">
          <PhoneOff :size="16" />
          Raccrocher
        </BaseButton>
      </div>
    </article>

    <!-- Proxy absent : appels impossibles sur cette installation. -->
    <div
      v-if="availability === 'unavailable'"
      class="mb-4 flex items-start gap-2.5 rounded-2xl border border-accent-gold/25 bg-accent-gold/[0.07] px-4 py-3 text-sm text-accent-gold"
    >
      <AlertTriangle :size="16" class="mt-0.5 shrink-0" />
      <span>Les appels sont indisponibles : OmniProxy n'est pas configure sur cette installation.</span>
    </div>

    <!-- Proxy present mais pas connecte : la messagerie et les appels exigent un compte. -->
    <div
      v-if="needsLogin"
      class="mb-4 flex items-start gap-2.5 rounded-2xl border border-accent-mint/25 bg-accent-mint/[0.07] px-4 py-3 text-sm text-accent-mint"
    >
      <AlertTriangle :size="16" class="mt-0.5 shrink-0" />
      <span>Connecte-toi a ton compte dans le volet OmniChat (a gauche) pour utiliser la messagerie et les appels.</span>
    </div>

    <div class="grid gap-3 sm:grid-cols-3">
      <article
        v-for="feature in features"
        :key="feature.label"
        class="rounded-2xl bg-white/[0.04] p-4 shadow-line"
      >
        <span class="mb-3 grid size-10 place-items-center rounded-xl bg-accent-mint/10 text-accent-mint">
          <component :is="feature.icon" :size="18" />
        </span>
        <h3 class="text-sm font-semibold text-zinc-100">{{ feature.label }}</h3>
        <p class="mt-1 text-sm leading-6 text-zinc-500">{{ feature.detail }}</p>
      </article>
    </div>

    <div class="mt-4 flex items-start gap-3 rounded-2xl bg-white/[0.035] p-4 shadow-line">
      <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-zinc-300">
        <ShieldCheck :size="17" />
      </span>
      <div>
        <h3 class="text-sm font-semibold text-zinc-100">Comment lancer un appel</h3>
        <p class="mt-1 text-sm leading-6 text-zinc-500">
          Ouvre une conversation puis clique sur l'icone telephone en haut a droite. L'appel
          s'affiche ici et reste accessible meme si tu reduis la fenetre.
        </p>
      </div>
    </div>
  </section>
</template>
