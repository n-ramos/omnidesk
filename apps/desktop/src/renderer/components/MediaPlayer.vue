<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Music, Pause, Play, SkipBack, SkipForward, Volume1, Volume2, VolumeX } from 'lucide-vue-next'
import ProviderLogo from '@renderer/components/ui/ProviderLogo.vue'
import { webpageController } from '@renderer/services/webpageController'
import { useAppStore } from '@renderer/stores/appStore'
import type { AccountSummary } from '@shared/models'

const store = useAppStore()

const faviconFor = (account: AccountSummary): string | undefined => {
  const value = account.settings?.faviconUrl
  return typeof value === 'string' ? value : undefined
}

const audibleAccounts = computed<AccountSummary[]>(() =>
  store.accounts.filter((account) => {
    if (account.providerId !== 'webpage') return false
    const media = store.webpageMedia[account.id]
    return media ? media.audible : false
  }),
)

const activeAccount = computed<AccountSummary | undefined>(() => {
  const explicit = store.webpageMediaActiveId
    ? audibleAccounts.value.find((account) => account.id === store.webpageMediaActiveId)
    : undefined
  return explicit ?? audibleAccounts.value[0]
})

const activeMedia = computed(() =>
  activeAccount.value ? store.webpageMedia[activeAccount.value.id] : undefined,
)

const brokenArtworkUrls = ref(new Set<string>())
const handleArtworkError = (): void => {
  const url = activeMedia.value?.artworkUrl
  if (url) {
    brokenArtworkUrls.value.add(url)
  }
}
const showArtwork = computed(() => {
  const url = activeMedia.value?.artworkUrl
  return Boolean(url) && !brokenArtworkUrls.value.has(url ?? '')
})

const isVisible = computed(() => activeAccount.value !== undefined)

const volumeIcon = computed(() => {
  if (!activeMedia.value || activeMedia.value.muted || activeMedia.value.volume === 0) {
    return VolumeX
  }
  if (activeMedia.value.volume < 0.5) {
    return Volume1
  }
  return Volume2
})

const localVolume = ref(1)
watch(
  () => activeMedia.value?.volume ?? 1,
  (value) => {
    localVolume.value = value
  },
  { immediate: true },
)

const handlePlayPause = (): void => {
  if (!activeAccount.value) return
  void webpageController.togglePlayPause(activeAccount.value.id)
}

const handleNext = (): void => {
  if (!activeAccount.value) return
  void webpageController.nextTrack(activeAccount.value.id)
}

const handlePrev = (): void => {
  if (!activeAccount.value) return
  void webpageController.previousTrack(activeAccount.value.id)
}

const handleMuteToggle = (): void => {
  if (!activeAccount.value || !activeMedia.value) return
  const next = !activeMedia.value.muted
  webpageController.toggleMute(activeAccount.value.id, next)
  store.setWebpageMediaState(activeAccount.value.id, { muted: next })
}

const handleVolumeInput = (event: Event): void => {
  if (!activeAccount.value) return
  const target = event.target as HTMLInputElement
  const value = Number(target.value) / 100
  localVolume.value = value
  void webpageController.setVolume(activeAccount.value.id, value)
  store.setWebpageMediaState(activeAccount.value.id, {
    volume: value,
    muted: value === 0,
  })
}

const handleFocusSource = (): void => {
  if (!activeAccount.value) return
  void store.selectAccount(activeAccount.value.id)
}

const handleSwitchSource = (accountId: string): void => {
  store.setWebpageMediaActive(accountId)
}

const title = computed(() => activeMedia.value?.title ?? activeAccount.value?.label ?? '')
const subtitle = computed(() => {
  const parts = [activeMedia.value?.artist, activeMedia.value?.album].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
  return parts.join(' - ')
})
</script>

<template>
  <Transition
    enter-active-class="transition-all duration-200"
    leave-active-class="transition-all duration-200"
    enter-from-class="translate-y-2 opacity-0"
    leave-to-class="translate-y-2 opacity-0"
  >
    <section
      v-if="isVisible && activeAccount && activeMedia"
      class="app-no-drag relative z-30 mx-1.5 mb-1.5 flex items-center gap-3 rounded-xl border border-white/[0.05] bg-ink-925/95 px-3 py-2 shadow-lift backdrop-blur"
    >
      <button
        type="button"
        class="flex shrink-0 items-center gap-2 rounded-lg pr-2 pl-1 py-1 text-left transition hover:bg-white/[0.05]"
        :title="`Aller a ${activeAccount.label}`"
        @click="handleFocusSource"
      >
        <span class="relative grid size-9 place-items-center rounded-lg bg-white/[0.05] overflow-hidden">
          <img
            v-if="showArtwork"
            :src="activeMedia.artworkUrl"
            :alt="title"
            class="size-9 rounded-lg object-cover"
            referrerpolicy="no-referrer"
            @error="handleArtworkError"
          />
          <Music v-else :size="18" class="text-zinc-300" />
          <span class="absolute -bottom-0.5 -right-0.5 grid size-[14px] place-items-center rounded-full bg-ink-950 ring-1 ring-white/[0.06]">
            <ProviderLogo
              :provider-id="activeAccount.providerId"
              :favicon-url="faviconFor(activeAccount)"
              :size="9"
            />
          </span>
        </span>
        <span class="flex min-w-0 flex-col">
          <span class="truncate text-xs font-semibold text-white max-w-[180px]">
            {{ title }}
          </span>
          <span class="truncate text-[11px] text-zinc-500 max-w-[180px]">
            {{ subtitle || activeAccount.label }}
          </span>
        </span>
      </button>

      <div class="flex items-center gap-1">
        <button
          type="button"
          class="grid size-8 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
          title="Piste precedente"
          @click="handlePrev"
        >
          <SkipBack :size="16" />
        </button>
        <button
          type="button"
          class="grid size-9 place-items-center rounded-full bg-white text-ink-950 transition hover:brightness-110"
          :title="activeMedia.paused ? 'Lecture' : 'Pause'"
          @click="handlePlayPause"
        >
          <component :is="activeMedia.paused ? Play : Pause" :size="16" />
        </button>
        <button
          type="button"
          class="grid size-8 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
          title="Piste suivante"
          @click="handleNext"
        >
          <SkipForward :size="16" />
        </button>
      </div>

      <div class="flex flex-1 items-center gap-2 min-w-0">
        <button
          type="button"
          class="grid size-8 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
          :title="activeMedia.muted ? 'Reactiver le son' : 'Couper le son'"
          @click="handleMuteToggle"
        >
          <component :is="volumeIcon" :size="16" />
        </button>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="Math.round(localVolume * 100)"
          class="omnidesk-volume w-24 max-w-[120px]"
          :style="{
            '--vol-pct': `${activeMedia.muted ? 0 : Math.round(localVolume * 100)}%`,
          }"
          @input="handleVolumeInput"
        />
      </div>

      <div v-if="audibleAccounts.length > 1" class="flex items-center gap-1 border-l border-white/[0.06] pl-2">
        <button
          v-for="account in audibleAccounts"
          :key="account.id"
          type="button"
          class="grid size-7 place-items-center rounded-lg transition"
          :class="
            account.id === activeAccount.id
              ? 'bg-white/[0.12] text-white'
              : 'text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200'
          "
          :title="account.label"
          @click="handleSwitchSource(account.id)"
        >
          <ProviderLogo
            :provider-id="account.providerId"
            :favicon-url="faviconFor(account)"
            :size="14"
          />
        </button>
      </div>
    </section>
  </Transition>
</template>

<style scoped>
.omnidesk-volume {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 999px;
  outline: none;
  cursor: pointer;
  background: linear-gradient(
    to right,
    rgb(45, 184, 128) 0%,
    rgb(45, 184, 128) var(--vol-pct, 0%),
    rgba(255, 255, 255, 0.1) var(--vol-pct, 0%),
    rgba(255, 255, 255, 0.1) 100%
  );
}

.omnidesk-volume::-webkit-slider-runnable-track {
  background: transparent;
  height: 4px;
  border-radius: 999px;
}

.omnidesk-volume::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -4px;
  border-radius: 50%;
  background: white;
  cursor: pointer;
  border: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
</style>
