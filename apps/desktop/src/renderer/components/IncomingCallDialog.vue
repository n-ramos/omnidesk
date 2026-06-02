<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { Phone, PhoneOff, Video } from 'lucide-vue-next'
import { openCallOverlay } from '@renderer/composables/useCallOverlay'
import { useOmnichatStore } from '@renderer/stores/omnichatStore'
import {
  playIncomingRingtone as startRingtone,
  stopIncomingRingtone as stopRingtone,
} from '@renderer/utils/sounds'

const omnichatStore = useOmnichatStore()

const call = computed(() => omnichatStore.incomingCall)

// Sonnerie tant qu'un appel est en attente. On suit le callId : un appel actif
// declenche la sonnerie, et sa disparition (reponse / refus / annulation) la coupe.
watch(
  () => call.value?.callId ?? null,
  (callId) => {
    if (callId) {
      startRingtone()
    } else {
      stopRingtone()
    }
  },
  { immediate: true },
)
onBeforeUnmount(stopRingtone)

const callerName = computed(() => {
  const current = call.value
  if (!current) {
    return ''
  }
  // Pseudo porte par le ring, sinon contact/membre de groupe connu, sinon l'identifiant.
  return (
    current.fromPseudo
    || omnichatStore.peersById[current.from.toLowerCase()]?.pseudo
    || current.from
  )
})

const initial = computed(() => callerName.value.trim().slice(0, 1).toUpperCase() || '?')

const accept = async (): Promise<void> => {
  if (!call.value) {
    return
  }
  // acceptIncomingCall rejoint la salle ad-hoc (acceptCall) ET previent l'appelant.
  openCallOverlay()
  await omnichatStore.acceptIncomingCall()
}

const decline = async (): Promise<void> => {
  await omnichatStore.declineIncomingCall()
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="call"
        class="fixed inset-x-0 top-6 z-[70] flex justify-center px-4"
        role="dialog"
        aria-label="Appel entrant"
      >
        <div class="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-accent-mint/30 bg-ink-900/95 p-4 shadow-lift backdrop-blur">
          <span class="relative grid size-12 shrink-0 place-items-center rounded-full bg-accent-mint/15 text-base font-semibold text-accent-mint">
            {{ initial }}
            <span class="absolute inset-0 animate-ping rounded-full ring-2 ring-accent-mint/40" />
          </span>
          <div class="min-w-0 flex-1">
            <p class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-mint">
              <component :is="call.media === 'video' ? Video : Phone" :size="12" />
              Appel entrant
            </p>
            <p class="truncate text-sm font-semibold text-white">{{ callerName }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <button
              class="grid size-10 place-items-center rounded-full bg-accent-coral text-white transition hover:brightness-110"
              type="button"
              title="Refuser"
              @click="decline"
            >
              <PhoneOff :size="18" />
            </button>
            <button
              class="grid size-10 place-items-center rounded-full bg-accent-mint text-ink-950 transition hover:brightness-110"
              type="button"
              title="Repondre"
              @click="accept"
            >
              <Phone :size="18" />
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
