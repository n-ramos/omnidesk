<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Bell, BellOff, Edit2, Plus, Trash2 } from 'lucide-vue-next'
import { errorMessage } from '@shared/errors'
import type {
  Reminder,
  ReminderRecurrence,
  Weekday,
} from '@shared/models'

defineProps<{
  editMode: boolean
}>()

type RecurrenceKind = ReminderRecurrence['kind']

interface FormState {
  open: boolean
  editingId: string | undefined
  title: string
  body: string
  kind: RecurrenceKind
  onceDate: string
  timeOfDay: string
  weekdays: Set<Weekday>
  dayOfMonth: number
  everyMinutes: number
}

const KIND_OPTIONS: Array<{ kind: RecurrenceKind; label: string }> = [
  { kind: 'once', label: 'Une fois' },
  { kind: 'daily', label: 'Quotidien' },
  { kind: 'weekly', label: 'Hebdo' },
  { kind: 'monthly', label: 'Mensuel' },
  { kind: 'interval', label: 'Intervalle' },
]

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7]
const WEEKDAY_SHORT: Record<Weekday, string> = {
  1: 'L', 2: 'M', 3: 'M', 4: 'J', 5: 'V', 6: 'S', 7: 'D',
}
const WEEKDAY_FULL: Record<Weekday, string> = {
  1: 'lundi',
  2: 'mardi',
  3: 'mercredi',
  4: 'jeudi',
  5: 'vendredi',
  6: 'samedi',
  7: 'dimanche',
}

const reminders = ref<Reminder[]>([])
const error = ref<string | undefined>(undefined)

const initialForm = (): FormState => ({
  open: false,
  editingId: undefined,
  title: '',
  body: '',
  kind: 'daily',
  onceDate: '',
  timeOfDay: '09:00',
  weekdays: new Set([1, 2, 3, 4, 5]),
  dayOfMonth: 1,
  everyMinutes: 60,
})

const form = ref<FormState>(initialForm())

const api = computed(() => window.omnidesk?.reminders)

const load = async (): Promise<void> => {
  if (!api.value) return
  try {
    reminders.value = await api.value.list()
  } catch (err) {
    error.value = errorMessage(err, 'Echec du chargement.')
  }
}

let pollTimer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void load()
  pollTimer = setInterval(() => void load(), 60_000)
})
onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
})

const openCreate = (): void => {
  form.value = { ...initialForm(), open: true }
  error.value = undefined
}

const openEdit = (reminder: Reminder): void => {
  const next = initialForm()
  next.open = true
  next.editingId = reminder.id
  next.title = reminder.title
  next.body = reminder.body ?? ''
  next.kind = reminder.recurrence.kind
  if (reminder.recurrence.kind === 'once') {
    const dateValue = new Date(reminder.recurrence.scheduledAt)
    const local = new Date(dateValue.getTime() - dateValue.getTimezoneOffset() * 60_000)
    next.onceDate = local.toISOString().slice(0, 16)
  } else if (
    reminder.recurrence.kind === 'daily'
    || reminder.recurrence.kind === 'weekly'
    || reminder.recurrence.kind === 'monthly'
  ) {
    next.timeOfDay = reminder.recurrence.timeOfDay
  }
  if (reminder.recurrence.kind === 'weekly') {
    next.weekdays = new Set(reminder.recurrence.weekdays)
  }
  if (reminder.recurrence.kind === 'monthly') {
    next.dayOfMonth = reminder.recurrence.dayOfMonth
  }
  if (reminder.recurrence.kind === 'interval') {
    next.everyMinutes = reminder.recurrence.everyMinutes
  }
  form.value = next
  error.value = undefined
}

const closeForm = (): void => {
  form.value = initialForm()
  error.value = undefined
}

const buildRecurrence = (state: FormState): ReminderRecurrence | undefined => {
  switch (state.kind) {
    case 'once': {
      if (!state.onceDate) return undefined
      const parsed = new Date(state.onceDate)
      if (Number.isNaN(parsed.getTime())) return undefined
      return { kind: 'once', scheduledAt: parsed.toISOString() }
    }
    case 'daily':
      return { kind: 'daily', timeOfDay: state.timeOfDay }
    case 'weekly': {
      if (state.weekdays.size === 0) return undefined
      const sorted = [...state.weekdays].sort((a, b) => a - b) as Weekday[]
      return { kind: 'weekly', weekdays: sorted, timeOfDay: state.timeOfDay }
    }
    case 'monthly':
      return { kind: 'monthly', dayOfMonth: state.dayOfMonth, timeOfDay: state.timeOfDay }
    case 'interval':
      return { kind: 'interval', everyMinutes: Math.max(1, state.everyMinutes) }
  }
}

const canSubmit = computed(() => {
  if (!form.value.title.trim()) return false
  return buildRecurrence(form.value) !== undefined
})

const replaceReminder = (reminder: Reminder): void => {
  const index = reminders.value.findIndex((entry) => entry.id === reminder.id)
  if (index === -1) {
    reminders.value = [reminder, ...reminders.value]
  } else {
    reminders.value.splice(index, 1, reminder)
  }
}

const submit = async (): Promise<void> => {
  if (!canSubmit.value || !api.value) return
  const recurrence = buildRecurrence(form.value)
  if (!recurrence) return

  error.value = undefined
  try {
    if (form.value.editingId) {
      const updated = await api.value.update({
        id: form.value.editingId,
        title: form.value.title.trim(),
        body: form.value.body.trim() || undefined,
        recurrence,
      })
      replaceReminder(updated)
    } else {
      const created = await api.value.create({
        title: form.value.title.trim(),
        body: form.value.body.trim() || undefined,
        recurrence,
      })
      replaceReminder(created)
    }
    closeForm()
  } catch (err) {
    error.value = errorMessage(err, "L'enregistrement a echoue.")
  }
}

const removeReminder = async (id: string): Promise<void> => {
  if (!api.value) return
  try {
    await api.value.delete(id)
    reminders.value = reminders.value.filter((entry) => entry.id !== id)
  } catch (err) {
    error.value = errorMessage(err, 'Echec de la suppression.')
  }
}

const toggleReminder = async (reminder: Reminder): Promise<void> => {
  if (!api.value) return
  try {
    const updated = await api.value.update({
      id: reminder.id,
      isEnabled: !reminder.isEnabled,
    })
    replaceReminder(updated)
  } catch (err) {
    error.value = errorMessage(err, 'Echec du changement.')
  }
}

const toggleWeekday = (day: Weekday): void => {
  const next = new Set(form.value.weekdays)
  if (next.has(day)) {
    next.delete(day)
  } else {
    next.add(day)
  }
  form.value.weekdays = next
}

const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth()
  && a.getDate() === b.getDate()

const formatNext = (iso: string): string => {
  const target = new Date(iso)
  if (Number.isNaN(target.getTime())) return ''
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 86_400_000)
  const time = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(target)
  if (sameDay(target, now)) return `aujourd'hui ${time}`
  if (sameDay(target, tomorrow)) return `demain ${time}`
  const diffMs = target.getTime() - now.getTime()
  if (diffMs > 0 && diffMs < 7 * 86_400_000) {
    const weekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'long' }).format(target)
    return `${weekday} ${time}`
  }
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(target)
}

const describeRecurrence = (recurrence: ReminderRecurrence): string => {
  switch (recurrence.kind) {
    case 'once':
      return 'Une seule fois'
    case 'daily':
      return `Tous les jours a ${recurrence.timeOfDay}`
    case 'weekly': {
      const sorted = [...recurrence.weekdays].sort((a, b) => a - b)
      const list = sorted.map((day) => WEEKDAY_FULL[day]).join(', ')
      return `${list} a ${recurrence.timeOfDay}`
    }
    case 'monthly':
      return `Le ${recurrence.dayOfMonth} du mois a ${recurrence.timeOfDay}`
    case 'interval': {
      const total = recurrence.everyMinutes
      if (total < 60) return `Toutes les ${total} min`
      const hours = Math.floor(total / 60)
      const minutes = total % 60
      return minutes === 0
        ? `Toutes les ${hours} h`
        : `Toutes les ${hours} h ${minutes} min`
    }
  }
}
</script>

<template>
  <div class="flex h-full flex-col p-5">
    <div class="mb-3 flex items-center justify-between">
      <span class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        <Bell :size="13" />
        Pense-bete
      </span>
      <button
        v-if="!form.open"
        class="grid size-7 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
        title="Nouveau pense-bete"
        type="button"
        @click="openCreate"
      >
        <Plus :size="14" />
      </button>
    </div>

    <form
      v-if="form.open"
      class="mb-3 grid gap-2 rounded-xl bg-ink-950/55 p-3 shadow-line"
      @submit.prevent="submit"
    >
      <input
        v-model="form.title"
        class="rounded-lg bg-ink-950/70 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-white/5 focus:ring-accent-mint/40"
        placeholder="Titre (ex: Bois de l'eau)"
        type="text"
      />
      <input
        v-model="form.body"
        class="rounded-lg bg-ink-950/70 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-white/5 focus:ring-accent-mint/40"
        placeholder="Note optionnelle"
        type="text"
      />

      <div class="grid grid-cols-5 gap-1">
        <button
          v-for="option in KIND_OPTIONS"
          :key="option.kind"
          class="rounded-md px-1 py-1.5 text-[11px] transition"
          :class="form.kind === option.kind
            ? 'bg-accent-mint font-medium text-ink-950'
            : 'bg-white/[0.04] text-zinc-300 hover:bg-white/[0.07]'"
          type="button"
          @click="form.kind = option.kind"
        >
          {{ option.label }}
        </button>
      </div>

      <input
        v-if="form.kind === 'once'"
        v-model="form.onceDate"
        class="rounded-lg bg-ink-950/70 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-white/5 focus:ring-accent-mint/40"
        type="datetime-local"
      />

      <input
        v-if="form.kind === 'daily' || form.kind === 'weekly' || form.kind === 'monthly'"
        v-model="form.timeOfDay"
        class="rounded-lg bg-ink-950/70 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-white/5 focus:ring-accent-mint/40"
        type="time"
      />

      <div v-if="form.kind === 'weekly'" class="flex gap-1">
        <button
          v-for="day in WEEKDAYS"
          :key="day"
          class="size-8 rounded-md text-xs font-medium transition"
          :class="form.weekdays.has(day)
            ? 'bg-accent-mint text-ink-950'
            : 'bg-white/[0.04] text-zinc-300 hover:bg-white/[0.07]'"
          type="button"
          @click="toggleWeekday(day)"
        >
          {{ WEEKDAY_SHORT[day] }}
        </button>
      </div>

      <label v-if="form.kind === 'monthly'" class="flex items-center gap-2 text-sm text-zinc-300">
        <span>Jour du mois</span>
        <input
          v-model.number="form.dayOfMonth"
          class="w-16 rounded-lg bg-ink-950/70 px-2 py-1 text-sm text-zinc-100 outline-none ring-1 ring-white/5 focus:ring-accent-mint/40"
          max="31"
          min="1"
          type="number"
        />
      </label>

      <label v-if="form.kind === 'interval'" class="flex items-center gap-2 text-sm text-zinc-300">
        <span>Toutes les</span>
        <input
          v-model.number="form.everyMinutes"
          class="w-20 rounded-lg bg-ink-950/70 px-2 py-1 text-sm text-zinc-100 outline-none ring-1 ring-white/5 focus:ring-accent-mint/40"
          min="1"
          type="number"
        />
        <span>min</span>
      </label>

      <p v-if="error" class="rounded-lg bg-accent-coral/10 px-2 py-1 text-xs text-accent-coral">
        {{ error }}
      </p>

      <div class="flex justify-end gap-1 pt-1">
        <button
          class="rounded-md px-2 py-1 text-xs text-zinc-400 transition hover:text-zinc-100"
          type="button"
          @click="closeForm"
        >
          Annuler
        </button>
        <button
          :disabled="!canSubmit"
          class="rounded-md bg-accent-mint px-3 py-1 text-xs font-medium text-ink-950 transition disabled:opacity-40"
          type="submit"
        >
          {{ form.editingId ? 'Enregistrer' : 'Ajouter' }}
        </button>
      </div>
    </form>

    <div
      v-if="reminders.length === 0 && !form.open"
      class="flex flex-1 items-center justify-center text-sm text-zinc-500"
    >
      Aucun pense-bete pour l'instant.
    </div>

    <ul
      v-else-if="reminders.length > 0"
      class="scroll-thin grid min-h-0 flex-1 content-start gap-1 overflow-auto"
    >
      <li
        v-for="reminder in reminders"
        :key="reminder.id"
        class="group grid gap-1 rounded-lg px-2 py-2 transition hover:bg-white/[0.04]"
        :class="{ 'opacity-50': !reminder.isEnabled }"
      >
        <div class="flex items-start gap-2">
          <button
            class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.06]"
            :title="reminder.isEnabled ? 'Desactiver' : 'Activer'"
            type="button"
            @click="toggleReminder(reminder)"
          >
            <Bell v-if="reminder.isEnabled" :size="14" class="text-accent-mint" />
            <BellOff v-else :size="14" />
          </button>
          <div class="min-w-0 flex-1">
            <p class="text-sm text-zinc-100">{{ reminder.title }}</p>
            <p v-if="reminder.body" class="truncate text-xs text-zinc-500">{{ reminder.body }}</p>
            <p class="text-[11px] text-zinc-500">
              {{ describeRecurrence(reminder.recurrence) }}
              <template v-if="reminder.isEnabled"> &middot; {{ formatNext(reminder.nextOccurrenceAt) }}</template>
            </p>
          </div>
          <button
            class="grid size-6 shrink-0 place-items-center rounded-md text-zinc-500 opacity-0 transition hover:bg-white/[0.06] hover:text-zinc-100 group-hover:opacity-100"
            title="Modifier"
            type="button"
            @click="openEdit(reminder)"
          >
            <Edit2 :size="12" />
          </button>
          <button
            class="grid size-6 shrink-0 place-items-center rounded-md text-zinc-500 opacity-0 transition hover:bg-accent-coral/10 hover:text-accent-coral group-hover:opacity-100"
            title="Supprimer"
            type="button"
            @click="removeReminder(reminder.id)"
          >
            <Trash2 :size="12" />
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
