<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { ArrowDownToLine, AlertTriangle, RefreshCw } from 'lucide-vue-next'
import { useAppStore } from '@renderer/stores/appStore'

const store = useAppStore()
const isOpen = ref(false)
const isInstalling = ref(false)
const wrapperRef = ref<HTMLElement | null>(null)

const status = computed(() => store.updateStatus)
const phase = computed(() => status.value.phase)

// L'indicateur reste masque tant qu'aucune MAJ n'est en jeu (idle / verification en cours).
const isVisible = computed(
  () =>
    phase.value === 'available' ||
    phase.value === 'downloading' ||
    phase.value === 'downloaded' ||
    phase.value === 'error',
)

const percent = computed(() =>
  status.value.phase === 'downloading' ? status.value.percent : 0,
)
const version = computed(() =>
  status.value.phase === 'available' || status.value.phase === 'downloaded'
    ? status.value.version
    : '',
)
const message = computed(() =>
  status.value.phase === 'error' ? status.value.message : '',
)

const isReady = computed(() => phase.value === 'downloaded')
const isError = computed(() => phase.value === 'error')

const tooltip = computed(() => {
  switch (phase.value) {
    case 'available':
      return version.value ? `Mise a jour disponible (v${version.value})` : 'Mise a jour disponible'
    case 'downloading':
      return `Telechargement de la mise a jour... ${percent.value}%`
    case 'downloaded':
      return version.value ? `Mise a jour prete (v${version.value})` : 'Mise a jour prete'
    case 'error':
      return 'Echec de la mise a jour'
    default:
      return 'Mises a jour'
  }
})

const toggle = (): void => {
  isOpen.value = !isOpen.value
}

const close = (): void => {
  isOpen.value = false
}

const install = async (): Promise<void> => {
  isInstalling.value = true
  // quitAndInstall redemarre l'app : pas de retour, on laisse l'etat "en cours".
  await store.installUpdate()
}

const retry = async (): Promise<void> => {
  await store.checkForUpdates()
  close()
}

const onDocumentClick = (event: MouseEvent): void => {
  if (!isOpen.value) {
    return
  }
  const target = event.target as Node | null
  if (target && wrapperRef.value && !wrapperRef.value.contains(target)) {
    close()
  }
}

const onKeydown = (event: KeyboardEvent): void => {
  if (event.key === 'Escape' && isOpen.value) {
    close()
  }
}

document.addEventListener('mousedown', onDocumentClick)
document.addEventListener('keydown', onKeydown)

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div v-if="isVisible" ref="wrapperRef" class="relative">
    <button
      class="app-no-drag relative grid size-8 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
      :class="{
        'bg-white/[0.08] text-zinc-100': isOpen,
        'text-accent-mint': isReady && !isOpen,
        'text-rose-300': isError && !isOpen,
      }"
      type="button"
      :title="tooltip"
      :aria-expanded="isOpen"
      @click="toggle"
    >
      <AlertTriangle v-if="isError" :size="16" />
      <ArrowDownToLine v-else :size="16" />
      <span
        v-if="isReady"
        class="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-accent-mint shadow-[0_0_0_2px_rgba(20,20,24,0.95)]"
      />
    </button>

    <div
      v-if="isOpen"
      class="absolute right-0 top-full z-50 mt-1.5 flex w-[300px] flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-ink-925 shadow-lift"
    >
      <!-- MAJ prete : proposer le redemarrage -->
      <div v-if="phase === 'downloaded'" class="p-4">
        <div class="flex items-center gap-2">
          <span class="grid size-7 place-items-center rounded-lg bg-accent-mint/10 text-accent-mint">
            <ArrowDownToLine :size="15" />
          </span>
          <div class="min-w-0">
            <p class="text-sm font-semibold text-zinc-100">Mise a jour prete</p>
            <p v-if="version" class="text-[11px] text-zinc-500">Version {{ version }}</p>
          </div>
        </div>
        <p class="mt-2 text-xs text-zinc-400">
          Omnidesk va redemarrer pour installer la nouvelle version.
        </p>
        <div class="mt-3 flex items-center justify-end gap-1.5">
          <button
            class="rounded-md px-2.5 py-1.5 text-[12px] text-zinc-300 transition hover:bg-white/[0.08]"
            type="button"
            @click="close"
          >
            Plus tard
          </button>
          <button
            class="rounded-md bg-accent-mint/90 px-2.5 py-1.5 text-[12px] font-semibold text-ink-950 transition hover:bg-accent-mint disabled:opacity-60"
            type="button"
            :disabled="isInstalling"
            @click="install"
          >
            {{ isInstalling ? 'Redemarrage...' : 'Redemarrer et installer' }}
          </button>
        </div>
      </div>

      <!-- Telechargement en cours -->
      <div v-else-if="phase === 'downloading'" class="p-4">
        <p class="text-sm font-semibold text-zinc-100">Telechargement de la mise a jour</p>
        <div class="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            class="h-full rounded-full bg-accent-mint transition-[width] duration-300"
            :style="{ width: `${percent}%` }"
          />
        </div>
        <p class="mt-1.5 text-[11px] tabular-nums text-zinc-500">{{ percent }}%</p>
      </div>

      <!-- MAJ detectee, telechargement imminent -->
      <div v-else-if="phase === 'available'" class="p-4">
        <p class="text-sm font-semibold text-zinc-100">Mise a jour disponible</p>
        <p v-if="version" class="mt-0.5 text-[11px] text-zinc-500">Version {{ version }}</p>
        <p class="mt-2 text-xs text-zinc-400">Telechargement en cours...</p>
      </div>

      <!-- Erreur -->
      <div v-else-if="phase === 'error'" class="p-4">
        <div class="flex items-center gap-2">
          <span class="grid size-7 place-items-center rounded-lg bg-rose-500/10 text-rose-300">
            <AlertTriangle :size="15" />
          </span>
          <p class="text-sm font-semibold text-zinc-100">Echec de la mise a jour</p>
        </div>
        <p v-if="message" class="mt-2 line-clamp-3 text-xs text-zinc-400">{{ message }}</p>
        <div class="mt-3 flex items-center justify-end">
          <button
            class="flex items-center gap-1.5 rounded-md bg-white/[0.06] px-2.5 py-1.5 text-[12px] font-medium text-zinc-200 transition hover:bg-white/[0.1]"
            type="button"
            @click="retry"
          >
            <RefreshCw :size="12" />
            Reessayer
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
