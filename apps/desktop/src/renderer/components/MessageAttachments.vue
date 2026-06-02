<script setup lang="ts">
import { computed, ref } from 'vue'
import { Download, FileText, Image as ImageIcon } from 'lucide-vue-next'
import Spinner from '@renderer/components/ui/Spinner.vue'
import type { AttachmentSummary } from '@shared/models'

const props = defineProps<{
  attachments?: AttachmentSummary[]
  align?: 'start' | 'end'
}>()

const visibleAttachments = computed(() => props.attachments ?? [])

const alignClass = computed(() => (props.align === 'end' ? 'items-end' : 'items-start'))

const isImage = (mimeType?: string): boolean =>
  Boolean(mimeType && mimeType.startsWith('image/'))

const formatBytes = (bytes?: number): string | undefined => {
  if (typeof bytes !== 'number' || bytes <= 0) {
    return undefined
  }

  if (bytes < 1024) {
    return `${bytes} o`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} Ko`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

const isOpening = ref<Record<string, boolean>>({})
const openError = ref<string | undefined>(undefined)

const canOpenAttachment = (attachment: AttachmentSummary): boolean =>
  attachment.canOpen === true
  || (attachment.canOpen === undefined && Boolean(attachment.downloadUrl))

const openAttachment = async (attachment: AttachmentSummary): Promise<void> => {
  if (!attachment.id || isOpening.value[attachment.id]) {
    return
  }

  openError.value = undefined

  const api = window.omnidesk
  if (!api?.attachments?.open) {
    if (attachment.downloadUrl) {
      void api?.shell?.openExternal(attachment.downloadUrl)
    }
    return
  }

  isOpening.value = { ...isOpening.value, [attachment.id]: true }

  try {
    await api.attachments.open(attachment.id)
  } catch (error) {
    openError.value = error instanceof Error
      ? error.message
      : `Impossible d'ouvrir ${attachment.fileName}.`
  } finally {
    isOpening.value = { ...isOpening.value, [attachment.id]: false }
  }
}
</script>

<template>
  <div
    v-if="visibleAttachments.length > 0"
    class="flex flex-col gap-1.5"
    :class="alignClass"
  >
    <button
      v-for="attachment in visibleAttachments"
      :key="attachment.id"
      class="group/attachment flex max-w-[320px] items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.04] px-3 py-2 text-left text-xs text-zinc-200 shadow-line transition hover:border-white/15 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
      type="button"
      :disabled="!canOpenAttachment(attachment) || isOpening[attachment.id]"
      :title="
        canOpenAttachment(attachment)
          ? `Ouvrir ${attachment.fileName}`
          : `${attachment.fileName} (telechargement indisponible)`
      "
      @click="openAttachment(attachment)"
    >
      <component
        :is="isImage(attachment.mimeType) ? ImageIcon : FileText"
        :size="16"
        class="shrink-0 text-zinc-400"
      />
      <div class="flex min-w-0 flex-col leading-tight">
        <span class="truncate font-medium text-zinc-100">{{ attachment.fileName }}</span>
        <span class="text-[10px] text-zinc-500">
          {{
            isOpening[attachment.id]
              ? 'Telechargement...'
              : (formatBytes(attachment.byteSize) ?? attachment.mimeType ?? 'Fichier')
          }}
        </span>
      </div>
      <Spinner
        v-if="isOpening[attachment.id]"
        :size="14"
        label="Telechargement"
        class="ml-auto shrink-0 text-zinc-300"
      />
      <Download
        v-else-if="canOpenAttachment(attachment)"
        :size="14"
        class="ml-auto shrink-0 text-zinc-500 transition group-hover/attachment:text-zinc-200"
      />
    </button>
    <p v-if="openError" class="text-[10px] text-rose-300">{{ openError }}</p>
  </div>
</template>
