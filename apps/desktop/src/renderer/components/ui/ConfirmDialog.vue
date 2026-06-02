<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { AlertTriangle, HelpCircle } from 'lucide-vue-next'
import BaseButton from '@renderer/components/ui/BaseButton.vue'
import { confirmState, resolveConfirm } from '@renderer/composables/useConfirm'

const confirmButtonRef = ref<HTMLButtonElement | null>(null)

const isDanger = computed(() => confirmState.tone === 'danger')
const confirmLabel = computed(() => confirmState.confirmLabel ?? 'Confirmer')
const cancelLabel = computed(() => confirmState.cancelLabel ?? 'Annuler')

const cancel = (): void => {
  resolveConfirm(false)
}

const accept = (): void => {
  resolveConfirm(true)
}

const onKeydown = (event: KeyboardEvent): void => {
  if (!confirmState.open) {
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    cancel()
  } else if (event.key === 'Enter') {
    event.preventDefault()
    accept()
  }
}

document.addEventListener('keydown', onKeydown)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
})

watch(
  () => confirmState.open,
  async (open) => {
    if (open) {
      await nextTick()
      confirmButtonRef.value?.focus()
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
      v-if="confirmState.open"
      class="app-no-drag absolute inset-0 z-[60] grid place-items-center bg-black/52 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      @click.self="cancel"
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
          v-if="confirmState.open"
          class="w-full max-w-sm overflow-hidden rounded-2xl bg-ink-900 shadow-soft shadow-line"
        >
          <div class="flex items-start gap-3 px-5 pt-5">
            <span
              class="grid size-10 shrink-0 place-items-center rounded-xl"
              :class="
                isDanger
                  ? 'bg-accent-coral/15 text-accent-coral'
                  : 'bg-accent-mint/15 text-accent-mint'
              "
            >
              <AlertTriangle v-if="isDanger" :size="18" />
              <HelpCircle v-else :size="18" />
            </span>
            <div class="min-w-0 flex-1 pt-0.5">
              <h2 class="text-base font-semibold text-white">
                {{ confirmState.title }}
              </h2>
              <p
                v-if="confirmState.message"
                class="mt-1.5 text-sm leading-6 text-zinc-400"
              >
                {{ confirmState.message }}
              </p>
            </div>
          </div>

          <div class="mt-5 flex justify-end gap-2 border-t border-white/[0.04] bg-ink-925/40 px-5 py-3">
            <BaseButton variant="ghost" type="button" @click="cancel">
              {{ cancelLabel }}
            </BaseButton>
            <button
              ref="confirmButtonRef"
              type="button"
              class="app-no-drag inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium tracking-normal transition duration-150"
              :class="
                isDanger
                  ? 'bg-accent-coral text-ink-950 shadow-lift hover:bg-[#ffb39d]'
                  : 'bg-accent-mint text-ink-950 shadow-lift hover:bg-[#a5f0ce]'
              "
              @click="accept"
            >
              {{ confirmLabel }}
            </button>
          </div>
        </section>
      </Transition>
    </div>
  </Transition>
</template>
