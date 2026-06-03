<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue'
import { Sparkles, X } from 'lucide-vue-next'
import { useAppStore } from '@renderer/stores/appStore'

const store = useAppStore()

const entries = computed(() => store.changelogEntries)
const isOpen = computed(() => entries.value.length > 0)
const latestVersion = computed(() => entries.value[0]?.version ?? '')

const dismiss = (): void => {
  store.dismissChangelog()
}

const onKeydown = (event: KeyboardEvent): void => {
  if (isOpen.value && event.key === 'Escape') {
    event.preventDefault()
    dismiss()
  }
}

document.addEventListener('keydown', onKeydown)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})
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
      v-if="isOpen"
      class="app-no-drag absolute inset-0 z-[60] grid place-items-center bg-black/52 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      @click.self="dismiss"
    >
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 scale-95"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-95"
      >
        <section
          v-if="isOpen"
          class="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-ink-900 shadow-soft shadow-line"
        >
          <header class="flex items-start gap-3 px-5 pt-5">
            <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-mint/15 text-accent-mint">
              <Sparkles :size="18" />
            </span>
            <div class="min-w-0 flex-1 pt-0.5">
              <h2 class="text-base font-semibold text-white">Nouveautes</h2>
              <p class="mt-0.5 text-xs text-zinc-500">
                Omnidesk a ete mis a jour<span v-if="latestVersion"> en version {{ latestVersion }}</span>.
              </p>
            </div>
            <button
              class="app-no-drag grid size-7 shrink-0 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
              type="button"
              title="Fermer"
              @click="dismiss"
            >
              <X :size="15" />
            </button>
          </header>

          <div class="mt-4 flex-1 overflow-y-auto px-5 pb-1">
            <article
              v-for="entry in entries"
              :key="entry.version"
              class="border-t border-white/[0.04] py-3 first:border-t-0 first:pt-0"
            >
              <div class="flex items-baseline gap-2">
                <h3 class="text-sm font-semibold text-zinc-100">Version {{ entry.version }}</h3>
                <span v-if="entry.date" class="text-[10px] tabular-nums text-zinc-600">{{ entry.date }}</span>
              </div>
              <div v-for="(group, gi) in entry.groups" :key="gi" class="mt-2">
                <p
                  v-if="group.label"
                  class="text-[11px] font-medium uppercase tracking-wide text-zinc-500"
                >
                  {{ group.label }}
                </p>
                <ul class="mt-1 space-y-1">
                  <li
                    v-for="(item, ii) in group.items"
                    :key="ii"
                    class="flex gap-2 text-xs leading-5 text-zinc-300"
                  >
                    <span class="mt-1.5 size-1 shrink-0 rounded-full bg-accent-mint/70" />
                    <span>{{ item }}</span>
                  </li>
                </ul>
              </div>
            </article>
          </div>

          <div class="mt-3 flex justify-end border-t border-white/[0.04] bg-ink-925/40 px-5 py-3">
            <button
              type="button"
              class="app-no-drag inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent-mint px-3.5 text-sm font-medium tracking-normal text-ink-950 shadow-lift transition duration-150 hover:bg-[#a5f0ce]"
              @click="dismiss"
            >
              Continuer
            </button>
          </div>
        </section>
      </Transition>
    </div>
  </Transition>
</template>
