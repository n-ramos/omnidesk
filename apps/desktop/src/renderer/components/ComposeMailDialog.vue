<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Paperclip, Send, X } from 'lucide-vue-next'
import BaseButton from '@renderer/components/ui/BaseButton.vue'
import Spinner from '@renderer/components/ui/Spinner.vue'
import { useAppStore } from '@renderer/stores/appStore'
import type { OutgoingAttachment } from '@shared/models'

const store = useAppStore()

interface ComposeFormState {
  to: string
  cc: string
  bcc: string
  subject: string
  body: string
  showCcBcc: boolean
}

const form = reactive<ComposeFormState>({
  to: '',
  cc: '',
  bcc: '',
  subject: '',
  body: '',
  showCcBcc: false,
})

const files = ref<File[]>([])
const fileInput = ref<HTMLInputElement | null>(null)

const account = computed(() => store.activeAccount)

const parseAddresses = (raw: string): string[] =>
  raw
    .split(/[,;\n]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.includes('@'))

const canSend = computed(
  () =>
    parseAddresses(form.to).length > 0
    && (form.body.trim().length > 0 || form.subject.trim().length > 0 || files.value.length > 0)
    && !store.isWorking,
)

const resetForm = (): void => {
  form.to = ''
  form.cc = ''
  form.bcc = ''
  form.subject = ''
  form.body = ''
  form.showCcBcc = false
  files.value = []
}

const handleClose = (): void => {
  store.closeCompose()
  resetForm()
}

const fileToOutgoing = (file: File): Promise<OutgoingAttachment> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error(`Impossible de lire ${file.name}.`))
        return
      }
      const separator = result.indexOf(',')
      if (separator === -1) {
        reject(new Error(`Format inattendu pour ${file.name}.`))
        return
      }
      resolve({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        byteSize: file.size,
        bytesBase64: result.slice(separator + 1),
      })
    }
    reader.onerror = () => reject(reader.error ?? new Error(`Echec de lecture de ${file.name}.`))
    reader.readAsDataURL(file)
  })

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

const onPickFiles = (): void => {
  fileInput.value?.click()
}

const onFilesSelected = (event: Event): void => {
  const target = event.target as HTMLInputElement
  if (!target.files) return
  files.value = [...files.value, ...Array.from(target.files)]
  target.value = ''
}

const removeFile = (index: number): void => {
  files.value.splice(index, 1)
}

const submit = async (): Promise<void> => {
  if (!canSend.value) return

  const attachments = files.value.length > 0
    ? await Promise.all(files.value.map(fileToOutgoing))
    : undefined

  const ok = await store.composeImapMail({
    to: parseAddresses(form.to),
    cc: parseAddresses(form.cc),
    bcc: parseAddresses(form.bcc),
    subject: form.subject.trim(),
    body: form.body,
    attachments,
  })

  if (ok) {
    resetForm()
  }
}
</script>

<template>
  <div
    v-if="store.composeOpen"
    class="app-no-drag absolute inset-0 z-40 overflow-auto bg-black/52 p-6 backdrop-blur-sm"
  >
    <section class="mx-auto my-8 w-full max-w-2xl overflow-hidden rounded-2xl bg-ink-900 shadow-soft shadow-line">
      <header class="flex items-center justify-between border-b border-white/[0.04] px-5 py-4">
        <div class="min-w-0">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-mint">
            Nouveau message
          </p>
          <h2 class="mt-1 truncate text-lg font-semibold text-white">
            Depuis {{ account?.label ?? '...' }}
          </h2>
        </div>
        <button
          aria-label="Fermer"
          class="grid size-9 place-items-center rounded-lg text-zinc-500 transition hover:bg-white/[0.06] hover:text-white"
          type="button"
          @click="handleClose"
        >
          <X :size="18" />
        </button>
      </header>

      <form class="grid gap-3 p-5" @submit.prevent="submit">
        <label class="grid gap-1.5 text-sm text-zinc-300">
          A
          <input
            v-model="form.to"
            class="h-10 rounded-lg bg-ink-950/70 px-3 text-sm text-white outline-none shadow-line"
            placeholder="destinataire@exemple.com, autre@exemple.com"
            required
            type="text"
          />
        </label>

        <button
          v-if="!form.showCcBcc"
          class="w-fit text-left text-xs font-medium text-zinc-400 hover:text-zinc-200"
          type="button"
          @click="form.showCcBcc = true"
        >
          + Ajouter Cc / Cci
        </button>

        <div v-else class="grid gap-3">
          <label class="grid gap-1.5 text-sm text-zinc-300">
            Cc
            <input
              v-model="form.cc"
              class="h-10 rounded-lg bg-ink-950/70 px-3 text-sm text-white outline-none shadow-line"
              placeholder="cc@exemple.com"
              type="text"
            />
          </label>
          <label class="grid gap-1.5 text-sm text-zinc-300">
            Cci
            <input
              v-model="form.bcc"
              class="h-10 rounded-lg bg-ink-950/70 px-3 text-sm text-white outline-none shadow-line"
              placeholder="cci@exemple.com"
              type="text"
            />
          </label>
        </div>

        <label class="grid gap-1.5 text-sm text-zinc-300">
          Objet
          <input
            v-model="form.subject"
            class="h-10 rounded-lg bg-ink-950/70 px-3 text-sm text-white outline-none shadow-line"
            placeholder="Sujet du message"
            type="text"
          />
        </label>

        <label class="grid gap-1.5 text-sm text-zinc-300">
          Message
          <textarea
            v-model="form.body"
            class="min-h-[220px] resize-y rounded-lg bg-ink-950/70 px-3 py-2 text-sm text-white outline-none shadow-line"
            placeholder="Ecrivez votre message..."
            rows="10"
          />
        </label>

        <div v-if="files.length > 0" class="grid gap-1.5">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Pieces jointes
          </p>
          <ul class="grid gap-1">
            <li
              v-for="(file, index) in files"
              :key="`${file.name}-${index}`"
              class="flex items-center justify-between gap-3 rounded-lg bg-white/[0.04] px-3 py-2 text-sm"
            >
              <span class="min-w-0 flex-1">
                <span class="block truncate text-zinc-100">{{ file.name }}</span>
                <span class="block text-xs text-zinc-500">{{ formatBytes(file.size) }}</span>
              </span>
              <button
                class="text-xs text-zinc-500 hover:text-accent-coral"
                type="button"
                @click="removeFile(index)"
              >
                Retirer
              </button>
            </li>
          </ul>
        </div>

        <p
          v-if="store.error"
          class="rounded-xl bg-accent-coral/10 px-3 py-2 text-sm text-accent-coral"
        >
          {{ store.error }}
        </p>

        <input
          ref="fileInput"
          class="hidden"
          multiple
          type="file"
          @change="onFilesSelected"
        />

        <div class="flex items-center justify-between gap-2 border-t border-white/[0.04] pt-4">
          <button
            class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/[0.05]"
            type="button"
            @click="onPickFiles"
          >
            <Paperclip :size="14" />
            Ajouter une piece jointe
          </button>
          <div class="flex gap-2">
            <BaseButton variant="ghost" type="button" @click="handleClose">Annuler</BaseButton>
            <BaseButton :disabled="!canSend" variant="primary">
              <Spinner v-if="store.isWorking" :size="14" label="Envoi" />
              <Send v-else :size="14" />
              {{ store.isWorking ? 'Envoi...' : 'Envoyer' }}
            </BaseButton>
          </div>
        </div>
      </form>
    </section>
  </div>
</template>
