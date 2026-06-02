<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { CalendarClock, Settings2 } from 'lucide-vue-next'

interface CountdownConfig {
  targetDate?: string
  label?: string
}

const props = defineProps<{
  config?: CountdownConfig
  editMode: boolean
}>()

const emit = defineEmits<{
  (event: 'update:config', value: CountdownConfig): void
}>()

const dateDraft = ref(props.config?.targetDate ?? '')
const labelDraft = ref(props.config?.label ?? '')
const userOpenedEditor = ref(false)
const now = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | undefined

const targetDate = computed(() => props.config?.targetDate ?? '')
const isEditing = computed(() => userOpenedEditor.value || !targetDate.value)

const targetTimestamp = computed(() => {
  if (!targetDate.value) {
    return null
  }
  const parsed = new Date(targetDate.value).getTime()
  return Number.isNaN(parsed) ? null : parsed
})

const remaining = computed(() => {
  if (targetTimestamp.value === null) {
    return null
  }
  const diff = targetTimestamp.value - now.value
  const absDiff = Math.abs(diff)
  const days = Math.floor(absDiff / (24 * 3_600_000))
  const hours = Math.floor((absDiff / 3_600_000) % 24)
  const minutes = Math.floor((absDiff / 60_000) % 60)
  const seconds = Math.floor((absDiff / 1_000) % 60)
  return { days, hours, minutes, seconds, past: diff < 0 }
})

const formattedTarget = computed(() => {
  if (targetTimestamp.value === null) {
    return ''
  }
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(targetTimestamp.value))
})

onMounted(() => {
  tickTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (tickTimer) {
    clearInterval(tickTimer)
  }
})

const submit = (): void => {
  const value = dateDraft.value.trim()
  if (!value) {
    return
  }
  const parsed = new Date(value).getTime()
  if (Number.isNaN(parsed)) {
    return
  }
  emit('update:config', {
    targetDate: new Date(value).toISOString(),
    label: labelDraft.value.trim() || undefined,
  })
  userOpenedEditor.value = false
}

const openEdit = (): void => {
  if (targetTimestamp.value !== null) {
    const date = new Date(targetTimestamp.value)
    const isoLocal = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
      .toISOString()
      .slice(0, 16)
    dateDraft.value = isoLocal
  }
  labelDraft.value = props.config?.label ?? ''
  userOpenedEditor.value = true
}

const heading = computed(() => props.config?.label || 'Compte a rebours')
</script>

<template>
  <div class="flex h-full flex-col p-5">
    <div class="mb-3 flex items-center justify-between gap-2">
      <span class="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        <CalendarClock :size="13" class="shrink-0" />
        <span class="truncate normal-case tracking-normal text-zinc-300">{{ heading }}</span>
      </span>
      <button
        v-if="!isEditing"
        class="grid size-7 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
        title="Modifier"
        type="button"
        @click="openEdit"
      >
        <Settings2 :size="13" />
      </button>
    </div>

    <form
      v-if="isEditing"
      class="flex flex-1 flex-col justify-center gap-3"
      @submit.prevent="submit"
    >
      <div class="grid gap-1">
        <label class="text-xs text-zinc-400" for="countdown-date">Date cible</label>
        <input
          id="countdown-date"
          v-model="dateDraft"
          class="rounded-lg bg-ink-950/70 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-white/5 focus:ring-accent-mint/40"
          type="datetime-local"
        />
      </div>
      <div class="grid gap-1">
        <label class="text-xs text-zinc-400" for="countdown-label">Libelle (optionnel)</label>
        <input
          id="countdown-label"
          v-model="labelDraft"
          class="rounded-lg bg-ink-950/70 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-white/5 focus:ring-accent-mint/40"
          placeholder="Release v1.0"
          type="text"
        />
      </div>
      <button
        class="rounded-lg bg-accent-mint px-3 py-2 text-sm font-medium text-ink-950 disabled:opacity-50"
        :disabled="!dateDraft.trim()"
        type="submit"
      >
        Lancer le compte a rebours
      </button>
    </form>

    <div v-else-if="remaining" class="flex flex-1 flex-col justify-between">
      <div class="grid grid-cols-4 gap-2">
        <div class="rounded-lg bg-ink-950/55 p-2 text-center">
          <p class="text-2xl font-semibold tabular-nums text-white">{{ remaining.days }}</p>
          <p class="text-[10px] uppercase tracking-wider text-zinc-500">Jours</p>
        </div>
        <div class="rounded-lg bg-ink-950/55 p-2 text-center">
          <p class="text-2xl font-semibold tabular-nums text-white">{{ remaining.hours }}</p>
          <p class="text-[10px] uppercase tracking-wider text-zinc-500">Heures</p>
        </div>
        <div class="rounded-lg bg-ink-950/55 p-2 text-center">
          <p class="text-2xl font-semibold tabular-nums text-white">{{ remaining.minutes }}</p>
          <p class="text-[10px] uppercase tracking-wider text-zinc-500">Min</p>
        </div>
        <div class="rounded-lg bg-ink-950/55 p-2 text-center">
          <p class="text-2xl font-semibold tabular-nums text-white">{{ remaining.seconds }}</p>
          <p class="text-[10px] uppercase tracking-wider text-zinc-500">Sec</p>
        </div>
      </div>
      <p
        class="mt-3 text-center text-xs"
        :class="remaining.past ? 'text-accent-coral' : 'text-zinc-500'"
      >
        {{ remaining.past ? 'Echeance depassee depuis' : 'Echeance' }} :
        {{ formattedTarget }}
      </p>
    </div>
  </div>
</template>
