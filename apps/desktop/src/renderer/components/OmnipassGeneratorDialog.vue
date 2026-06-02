<script setup lang="ts">
import { ref, watch } from 'vue'
import { RefreshCw, Wand2, X } from 'lucide-vue-next'
import PassStrengthBar from '@renderer/components/PassStrengthBar.vue'
import { useOmnipassStore } from '@renderer/stores/omnipassStore'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (event: 'close'): void; (event: 'use', password: string): void }>()

const store = useOmnipassStore()

const mode = ref<'characters' | 'passphrase'>('characters')
// Mode caracteres
const length = ref(20)
const lowercase = ref(true)
const uppercase = ref(true)
const digits = ref(true)
const symbols = ref(true)
const excludeAmbiguous = ref(true)
// Mode passphrase
const words = ref(5)
const separator = ref('-')
const capitalize = ref(true)
const includeNumber = ref(true)

const preview = ref('')

const regenerate = async (): Promise<void> => {
  if (mode.value === 'characters') {
    if (!lowercase.value && !uppercase.value && !digits.value && !symbols.value) {
      preview.value = ''
      return
    }
    preview.value = await store.generate({
      length: length.value,
      lowercase: lowercase.value,
      uppercase: uppercase.value,
      digits: digits.value,
      symbols: symbols.value,
      excludeAmbiguous: excludeAmbiguous.value,
    })
    return
  }
  preview.value = await store.generatePassphrase({
    words: words.value,
    separator: separator.value || '-',
    capitalize: capitalize.value,
    includeNumber: includeNumber.value,
  })
}

// Regenere a l'ouverture et a chaque changement d'option.
watch(
  (): unknown[] => [
    props.open,
    mode.value,
    length.value,
    lowercase.value,
    uppercase.value,
    digits.value,
    symbols.value,
    excludeAmbiguous.value,
    words.value,
    separator.value,
    capitalize.value,
    includeNumber.value,
  ],
  () => {
    if (props.open) {
      void regenerate()
    }
  },
  { immediate: true },
)

const use = (): void => {
  if (preview.value) {
    emit('use', preview.value)
    emit('close')
  }
}

const chipClass = (active: boolean): string =>
  active
    ? 'bg-accent-mint/15 text-accent-mint ring-1 ring-accent-mint/40'
    : 'bg-white/[0.05] text-zinc-400 ring-1 ring-transparent hover:bg-white/[0.08]'
const tabClass = (active: boolean): string =>
  active ? 'bg-white/[0.1] text-white' : 'text-zinc-400 hover:text-zinc-200'
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-[70] grid place-items-center bg-ink-950/70 p-4 backdrop-blur-sm"
        @click.self="emit('close')"
      >
        <div class="w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900 shadow-lift">
          <header class="flex items-center gap-3 border-b border-white/[0.05] px-5 py-4">
            <span class="grid size-9 place-items-center rounded-xl bg-accent-mint/15 text-accent-mint">
              <Wand2 :size="18" />
            </span>
            <h2 class="flex-1 text-base font-semibold text-white">Generer un mot de passe</h2>
            <button
              class="grid size-8 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
              type="button"
              aria-label="Fermer"
              @click="emit('close')"
            >
              <X :size="16" />
            </button>
          </header>

          <div class="space-y-4 px-5 py-4">
            <!-- Apercu -->
            <div class="flex items-center gap-2">
              <div class="min-h-[2.5rem] flex-1 break-all rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2 font-mono text-sm text-accent-mint">
                {{ preview || '...' }}
              </div>
              <button
                class="grid size-9 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-zinc-300 transition hover:bg-white/[0.08] hover:text-accent-mint"
                type="button"
                title="Regenerer"
                @click="regenerate"
              >
                <RefreshCw :size="15" />
              </button>
            </div>
            <PassStrengthBar :password="preview" />

            <!-- Onglets mode -->
            <div class="flex gap-1 rounded-lg bg-white/[0.04] p-1">
              <button class="flex-1 rounded-md py-1.5 text-sm font-medium transition" :class="tabClass(mode === 'characters')" type="button" @click="mode = 'characters'">
                Caracteres
              </button>
              <button class="flex-1 rounded-md py-1.5 text-sm font-medium transition" :class="tabClass(mode === 'passphrase')" type="button" @click="mode = 'passphrase'">
                Phrase secrete
              </button>
            </div>

            <!-- Options caracteres -->
            <div v-if="mode === 'characters'" class="space-y-3">
              <div class="flex items-center gap-3">
                <input v-model.number="length" type="range" min="6" max="64" class="h-1.5 flex-1 cursor-pointer accent-[#8ee6bf]" />
                <span class="w-8 text-right text-sm tabular-nums text-zinc-300">{{ length }}</span>
              </div>
              <div class="flex flex-wrap gap-1.5">
                <button class="rounded-md px-2.5 py-1 text-xs font-medium transition" :class="chipClass(lowercase)" type="button" @click="lowercase = !lowercase">a-z</button>
                <button class="rounded-md px-2.5 py-1 text-xs font-medium transition" :class="chipClass(uppercase)" type="button" @click="uppercase = !uppercase">A-Z</button>
                <button class="rounded-md px-2.5 py-1 text-xs font-medium transition" :class="chipClass(digits)" type="button" @click="digits = !digits">0-9</button>
                <button class="rounded-md px-2.5 py-1 text-xs font-medium transition" :class="chipClass(symbols)" type="button" @click="symbols = !symbols">!@#</button>
                <button class="rounded-md px-2.5 py-1 text-xs font-medium transition" :class="chipClass(excludeAmbiguous)" type="button" @click="excludeAmbiguous = !excludeAmbiguous">Sans ambigus</button>
              </div>
            </div>

            <!-- Options passphrase -->
            <div v-else class="space-y-3">
              <div class="flex items-center gap-3">
                <span class="text-sm text-zinc-400">Mots</span>
                <input v-model.number="words" type="range" min="3" max="10" class="h-1.5 flex-1 cursor-pointer accent-[#8ee6bf]" />
                <span class="w-8 text-right text-sm tabular-nums text-zinc-300">{{ words }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-sm text-zinc-400">Separateur</span>
                <input v-model="separator" maxlength="3" class="w-16 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 py-1 text-center text-sm text-zinc-100 outline-none focus:border-accent-mint/50" />
                <div class="flex flex-wrap gap-1.5">
                  <button class="rounded-md px-2.5 py-1 text-xs font-medium transition" :class="chipClass(capitalize)" type="button" @click="capitalize = !capitalize">Majuscules</button>
                  <button class="rounded-md px-2.5 py-1 text-xs font-medium transition" :class="chipClass(includeNumber)" type="button" @click="includeNumber = !includeNumber">Chiffre</button>
                </div>
              </div>
            </div>
          </div>

          <footer class="flex items-center justify-end gap-2 border-t border-white/[0.05] px-5 py-3.5">
            <button
              class="inline-flex h-9 items-center rounded-md px-3.5 text-sm font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
              type="button"
              @click="emit('close')"
            >
              Annuler
            </button>
            <button
              class="inline-flex h-9 items-center gap-2 rounded-md bg-accent-mint px-3.5 text-sm font-medium text-ink-950 shadow-lift transition hover:bg-[#a5f0ce] disabled:cursor-not-allowed disabled:opacity-45"
              type="button"
              :disabled="!preview"
              @click="use"
            >
              Utiliser
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
