<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  AlertTriangle,
  Loader2,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  PhoneOff,
  ScreenShare,
  ScreenShareOff,
  Settings,
  UserPlus,
  Users,
  Video,
  VideoOff,
} from 'lucide-vue-next'
import { callOverlayState, closeCallOverlay } from '@renderer/composables/useCallOverlay'
import { useOmnichat, type CallVideoSource } from '@renderer/composables/useOmnichat'
import { useOmnichatStore } from '@renderer/stores/omnichatStore'
import CallMediaSettingsDialog from '@renderer/components/CallMediaSettingsDialog.vue'

interface DisplayCell {
  key: string
  tileKey: string | null
  name: string
  isLocal: boolean
  source: CallVideoSource | null
  micOn: boolean
  speaking: boolean
}

const omnichat = useOmnichat()
const state = omnichat.state
const omnichatStore = useOmnichatStore()

// --- Ajouter quelqu'un a l'appel (modele Teams : on construit l'appel) ---------
const showAddPicker = ref(false)
const contactToken = ref('')

// Dialog de selection des peripheriques audio/video + test micro.
const showMediaSettings = ref(false)

// Candidats : contacts + membres du groupe ouvert, hors participants deja presents et soi.
const addCandidates = computed(() => {
  const present = new Set(state.roster.map((entry) => entry.identity.toLowerCase()))
  const self = omnichatStore.identity?.id?.toLowerCase()
  return Object.values(omnichatStore.peersById)
    .filter((peer) => {
      const id = peer.id.toLowerCase()
      return id !== self && !present.has(id)
    })
    .sort((a, b) => Number(b.online) - Number(a.online) || a.pseudo.localeCompare(b.pseudo))
})

const invitePeer = async (id: string): Promise<void> => {
  showAddPicker.value = false
  await omnichat.addParticipant(id)
}

// Invitation par adresse email (= identifiant OmniChat). Enregistre aussi le contact
// (best-effort) pour retrouver son libelle plus tard.
const inviteByToken = async (): Promise<void> => {
  const email = contactToken.value.trim().toLowerCase()
  if (!/.+@.+\..+/.test(email)) {
    return
  }
  const label = email.split('@')[0] || email
  void omnichatStore.addContact(label, email)
  contactToken.value = ''
  showAddPicker.value = false
  await omnichat.addParticipant(email)
}

const initialOf = (name: string): string => name.trim().slice(0, 1).toUpperCase() || '?'

const cells = computed<DisplayCell[]>(() => {
  const result: DisplayCell[] = []
  for (const entry of state.roster) {
    const cameraTile = state.tiles.find(
      (tile) => tile.identity === entry.identity && tile.source === 'camera',
    )
    result.push({
      key: entry.identity,
      tileKey: cameraTile?.key ?? null,
      name: entry.isLocal ? `${entry.name} (vous)` : entry.name,
      isLocal: entry.isLocal,
      source: cameraTile ? 'camera' : null,
      micOn: entry.micOn,
      speaking: entry.speaking,
    })
  }
  for (const tile of state.tiles) {
    if (tile.source === 'screen') {
      result.push({
        key: tile.key,
        tileKey: tile.key,
        name: `${tile.name} - ecran`,
        isLocal: tile.isLocal,
        source: 'screen',
        micOn: true,
        speaking: false,
      })
    }
  }
  return result
})

const columns = computed(() => {
  const count = Math.max(cells.value.length, 1)
  if (count === 1) return 1
  if (count <= 4) return 2
  if (count <= 9) return 3
  return 4
})

const initials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  const text = parts.map((part) => part[0] ?? '').join('')
  return text ? text.toUpperCase() : '?'
}

const hangUp = async (): Promise<void> => {
  await omnichat.leave()
  closeCallOverlay()
}

// Si l'appel se termine (raccroche cote serveur, deconnexion), on referme l'overlay.
watch(
  () => state.active,
  (active, previous) => {
    if (previous && !active) {
      closeCallOverlay()
    }
  },
)
</script>

<template>
  <Transition
    enter-active-class="transition duration-150 ease-out"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition duration-100 ease-in"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="callOverlayState.open"
      class="app-no-drag absolute inset-0 z-[70] flex flex-col bg-ink-950/97 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <!-- En-tete -->
      <header class="flex h-16 shrink-0 items-center justify-between border-b border-white/[0.05] px-5">
        <div class="flex min-w-0 items-center gap-3">
          <span class="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-mint/15 text-accent-mint">
            <Video :size="18" />
          </span>
          <div class="min-w-0">
            <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Appel omnichat
            </p>
            <h2 class="truncate text-base font-semibold text-white">
              {{ state.title || 'Appel' }}
            </h2>
          </div>
          <span
            v-if="state.recording"
            class="ml-2 inline-flex items-center gap-1.5 rounded-full bg-accent-coral/15 px-2.5 py-1 text-xs font-medium text-accent-coral"
          >
            <span class="size-2 animate-pulse rounded-full bg-accent-coral" />
            Enregistrement
          </span>
        </div>

        <div class="flex items-center gap-2">
          <span class="inline-flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-2.5 py-1 text-xs text-zinc-300">
            <Users :size="13" />
            {{ state.roster.length }}
          </span>
          <div class="relative">
            <button
              class="grid size-9 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
              :class="{ 'bg-white/[0.08] text-white': showAddPicker }"
              title="Ajouter quelqu'un a l'appel"
              type="button"
              :disabled="!state.active"
              @click="showAddPicker = !showAddPicker"
            >
              <UserPlus :size="18" />
            </button>
            <div
              v-if="showAddPicker"
              class="absolute right-0 top-11 z-10 w-72 overflow-hidden rounded-xl border border-white/[0.08] bg-ink-900 shadow-lift"
            >
              <div class="border-b border-white/[0.05] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                Ajouter a l'appel
              </div>
              <div class="max-h-60 overflow-y-auto py-1">
                <button
                  v-for="peer in addCandidates"
                  :key="peer.id"
                  class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-200 transition hover:bg-white/[0.05]"
                  type="button"
                  @click="invitePeer(peer.id)"
                >
                  <span class="relative grid size-7 shrink-0 place-items-center rounded-full bg-white/[0.08] text-xs font-semibold">
                    {{ initialOf(peer.pseudo) }}
                    <span
                      class="absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-ink-900"
                      :class="peer.online ? 'bg-accent-mint' : 'bg-zinc-600'"
                    />
                  </span>
                  <span class="min-w-0 flex-1 truncate">{{ peer.pseudo }}</span>
                  <span
                    class="shrink-0 text-[10px]"
                    :class="peer.online ? 'text-accent-mint' : 'text-zinc-600'"
                  >{{ peer.online ? 'en ligne' : 'hors ligne' }}</span>
                </button>
                <p v-if="addCandidates.length === 0" class="px-3 py-2 text-xs leading-5 text-zinc-500">
                  Aucun contact disponible. Ajoute par email ci-dessous.
                </p>
              </div>
              <form
                class="flex items-center gap-2 border-t border-white/[0.05] px-3 py-2"
                @submit.prevent="inviteByToken"
              >
                <input
                  v-model="contactToken"
                  class="w-full rounded-md bg-ink-950/55 px-2 py-1.5 text-xs text-white placeholder-zinc-600 outline-none"
                  placeholder="Email du contact"
                  type="email"
                />
                <button
                  class="shrink-0 rounded-md bg-accent-mint px-2 py-1.5 text-xs font-semibold text-ink-950 transition hover:brightness-110 disabled:opacity-40"
                  type="submit"
                  :disabled="!contactToken.trim()"
                >
                  Inviter
                </button>
              </form>
            </div>
          </div>
          <button
            class="grid size-9 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
            :class="{ 'bg-white/[0.08] text-white': showMediaSettings }"
            title="Peripheriques audio/video"
            type="button"
            @click="showMediaSettings = true"
          >
            <Settings :size="18" />
          </button>
          <button
            class="grid size-9 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
            title="Reduire (l'appel continue)"
            type="button"
            @click="closeCallOverlay"
          >
            <Minimize2 :size="18" />
          </button>
        </div>
      </header>

      <!-- Zone video / participants -->
      <div class="relative min-h-0 flex-1 overflow-y-auto p-5">
        <div
          v-if="state.connecting"
          class="absolute inset-0 z-10 grid place-items-center bg-ink-950/60"
        >
          <div class="flex flex-col items-center gap-3 text-zinc-300">
            <Loader2 :size="28" class="animate-spin text-accent-mint" />
            <p class="text-xs uppercase tracking-[0.18em] text-zinc-500">Connexion...</p>
          </div>
        </div>

        <div
          v-if="state.error"
          class="mb-4 flex items-start gap-2 rounded-xl border border-accent-coral/30 bg-accent-coral/10 px-4 py-3 text-sm text-accent-coral"
        >
          <AlertTriangle :size="16" class="mt-0.5 shrink-0" />
          <span class="min-w-0">{{ state.error }}</span>
        </div>

        <div
          class="grid gap-3"
          :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }"
        >
          <div
            v-for="cell in cells"
            :key="cell.key"
            class="group relative aspect-video overflow-hidden rounded-2xl bg-ink-900 shadow-line ring-1 ring-inset transition"
            :class="cell.speaking ? 'ring-accent-mint/70' : 'ring-white/[0.04]'"
          >
            <video
              v-if="cell.tileKey"
              :ref="(el) => omnichat.bindVideo(cell.tileKey as string, el as HTMLVideoElement | null)"
              autoplay
              playsinline
              :muted="cell.isLocal"
              class="size-full object-cover"
              :class="{ '-scale-x-100': cell.isLocal && cell.source === 'camera' }"
              @dblclick="omnichat.requestTileFullscreen(cell.tileKey as string)"
            />
            <div v-else class="grid size-full place-items-center">
              <span class="grid size-16 place-items-center rounded-full bg-white/[0.06] text-xl font-semibold text-zinc-200">
                {{ initials(cell.name) }}
              </span>
            </div>

            <!-- Plein ecran de la tuile (double-clic aussi). Utile pour un partage d'ecran. -->
            <button
              v-if="cell.tileKey"
              class="absolute right-2 top-2 grid size-8 place-items-center rounded-lg bg-black/40 text-white opacity-0 transition hover:bg-black/60 group-hover:opacity-100"
              type="button"
              :title="cell.source === 'screen' ? 'Plein ecran (partage d ecran)' : 'Plein ecran'"
              @click="omnichat.requestTileFullscreen(cell.tileKey as string)"
            >
              <Maximize2 :size="15" />
            </button>

            <div class="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
              <span class="truncate text-sm font-medium text-white">{{ cell.name }}</span>
              <MicOff v-if="!cell.micOn && cell.source !== 'screen'" :size="15" class="shrink-0 text-accent-coral" />
            </div>
          </div>
        </div>

        <p
          v-if="cells.length === 0 && !state.connecting"
          class="grid h-full place-items-center text-sm text-zinc-500"
        >
          En attente de participants...
        </p>
      </div>

      <!-- Barre de controle -->
      <footer class="flex shrink-0 items-center justify-center gap-3 border-t border-white/[0.05] px-5 py-4">
        <button
          class="grid size-12 place-items-center rounded-full transition disabled:opacity-40"
          :class="state.micOn ? 'bg-white/[0.08] text-white hover:bg-white/[0.12]' : 'bg-accent-coral/20 text-accent-coral hover:bg-accent-coral/30'"
          :title="state.micOn ? 'Couper le micro' : 'Activer le micro'"
          type="button"
          :disabled="!state.active"
          @click="omnichat.toggleMic"
        >
          <Mic v-if="state.micOn" :size="20" />
          <MicOff v-else :size="20" />
        </button>

        <button
          class="grid size-12 place-items-center rounded-full transition disabled:opacity-40"
          :class="state.cameraOn ? 'bg-white/[0.08] text-white hover:bg-white/[0.12]' : 'bg-white/[0.05] text-zinc-300 hover:bg-white/[0.1]'"
          :title="state.cameraOn ? 'Couper la camera' : 'Activer la camera'"
          type="button"
          :disabled="!state.active"
          @click="omnichat.toggleCamera"
        >
          <Video v-if="state.cameraOn" :size="20" />
          <VideoOff v-else :size="20" />
        </button>

        <button
          class="grid size-12 place-items-center rounded-full transition disabled:opacity-40"
          :class="state.screenShareOn ? 'bg-accent-mint/20 text-accent-mint hover:bg-accent-mint/30' : 'bg-white/[0.05] text-zinc-300 hover:bg-white/[0.1]'"
          :title="state.screenShareOn ? 'Arreter le partage' : 'Partager l\'ecran'"
          type="button"
          :disabled="!state.active"
          @click="omnichat.toggleScreenShare"
        >
          <ScreenShare v-if="!state.screenShareOn" :size="20" />
          <ScreenShareOff v-else :size="20" />
        </button>

        <button
          class="grid size-12 place-items-center rounded-full transition disabled:opacity-40"
          :class="state.recording ? 'bg-accent-coral/20 text-accent-coral hover:bg-accent-coral/30' : 'bg-white/[0.05] text-zinc-300 hover:bg-white/[0.1]'"
          :title="state.recording ? 'Arreter l\'enregistrement' : 'Enregistrer l\'appel'"
          type="button"
          :disabled="!state.active || state.recordingBusy"
          @click="omnichat.toggleRecording"
        >
          <span
            class="size-4 rounded-full border-2 transition"
            :class="state.recording ? 'border-accent-coral bg-accent-coral' : 'border-current'"
          />
        </button>

        <button
          class="ml-2 grid h-12 items-center gap-2 rounded-full bg-accent-coral px-5 text-ink-950 shadow-lift transition hover:bg-[#ffb39d]"
          title="Raccrocher"
          type="button"
          @click="hangUp"
        >
          <PhoneOff :size="20" />
        </button>
      </footer>

      <CallMediaSettingsDialog
        :open="showMediaSettings"
        @close="showMediaSettings = false"
      />
    </div>
  </Transition>
</template>

<style>
/* En plein ecran, on n'affiche pas la video en "cover" (qui rognerait) : un partage
   d'ecran doit etre visible en entier. Fond noir pour les bords letterboxes. */
video:fullscreen {
  object-fit: contain;
  background: #000;
}
</style>
