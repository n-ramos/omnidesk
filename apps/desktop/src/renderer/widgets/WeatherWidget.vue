<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { CloudSun, Loader2, MapPin, Settings2 } from 'lucide-vue-next'
import type { CitySuggestion, WeatherSnapshot } from '@shared/models'

interface WeatherConfig {
  city?: string
  latitude?: number
  longitude?: number
}

const props = defineProps<{
  config?: WeatherConfig
  editMode: boolean
}>()

const emit = defineEmits<{
  (event: 'update:config', value: WeatherConfig): void
}>()

const snapshot = ref<WeatherSnapshot | null>(null)
const status = ref<'idle' | 'loading' | 'error'>('idle')
const errorMessage = ref<string | undefined>()
const cityDraft = ref(props.config?.city ?? '')
const userOpenedEditor = ref(false)

const suggestions = ref<CitySuggestion[]>([])
const isSuggesting = ref(false)
const activeIndex = ref(-1)
let searchToken = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined

const currentCity = computed(() => props.config?.city ?? '')
const currentCoords = computed(() => {
  const { latitude, longitude } = props.config ?? {}
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    return { latitude, longitude }
  }
  return null
})

const isEditing = computed(() => userOpenedEditor.value || !currentCity.value)

const load = async (config: WeatherConfig): Promise<void> => {
  if (!window.omnidesk?.weather?.fetch) {
    return
  }

  status.value = 'loading'
  errorMessage.value = undefined

  try {
    if (typeof config.latitude === 'number' && typeof config.longitude === 'number') {
      snapshot.value = await window.omnidesk.weather.fetch({
        latitude: config.latitude,
        longitude: config.longitude,
        label: config.city,
      })
    } else if (config.city?.trim()) {
      snapshot.value = await window.omnidesk.weather.fetch({ query: config.city })
    } else {
      return
    }
    status.value = 'idle'
  } catch (error) {
    status.value = 'error'
    errorMessage.value =
      error instanceof Error ? error.message : 'Impossible de recuperer la meteo.'
  }
}

watch(
  [currentCity, currentCoords],
  ([city, coords]) => {
    if (city || coords) {
      void load(props.config ?? {})
    } else {
      snapshot.value = null
    }
  },
  { immediate: true },
)

const formatSuggestion = (suggestion: CitySuggestion): string => {
  const parts = [suggestion.name, suggestion.region, suggestion.country].filter(Boolean)
  return parts.join(', ')
}

const runSearch = async (query: string): Promise<void> => {
  const trimmed = query.trim()
  if (trimmed.length < 2 || !window.omnidesk?.weather?.searchCities) {
    suggestions.value = []
    isSuggesting.value = false
    return
  }

  const token = ++searchToken
  isSuggesting.value = true
  try {
    const results = await window.omnidesk.weather.searchCities(trimmed)
    if (token === searchToken) {
      suggestions.value = results
      activeIndex.value = results.length > 0 ? 0 : -1
    }
  } catch {
    if (token === searchToken) {
      suggestions.value = []
    }
  } finally {
    if (token === searchToken) {
      isSuggesting.value = false
    }
  }
}

const onInput = (): void => {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  searchTimer = setTimeout(() => {
    void runSearch(cityDraft.value)
  }, 220)
}

onBeforeUnmount(() => {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
})

const selectSuggestion = (suggestion: CitySuggestion): void => {
  const label = formatSuggestion(suggestion)
  cityDraft.value = label
  suggestions.value = []
  activeIndex.value = -1
  emit('update:config', {
    city: label,
    latitude: suggestion.latitude,
    longitude: suggestion.longitude,
  })
  userOpenedEditor.value = false
}

const submitCity = (): void => {
  const highlighted =
    activeIndex.value >= 0 ? suggestions.value[activeIndex.value] : undefined
  if (highlighted) {
    selectSuggestion(highlighted)
    return
  }

  const value = cityDraft.value.trim()
  if (!value) {
    return
  }

  emit('update:config', { city: value })
  suggestions.value = []
  userOpenedEditor.value = false
}

const onKeyDown = (event: KeyboardEvent): void => {
  if (suggestions.value.length === 0) {
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % suggestions.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value =
      activeIndex.value <= 0 ? suggestions.value.length - 1 : activeIndex.value - 1
  } else if (event.key === 'Escape') {
    suggestions.value = []
    activeIndex.value = -1
  }
}

const openEdit = (): void => {
  cityDraft.value = currentCity.value
  suggestions.value = []
  activeIndex.value = -1
  userOpenedEditor.value = true
}

const describeCode = (code: number | null, isDay: boolean): string => {
  if (code === null) {
    return ''
  }
  if (code === 0) return isDay ? 'Ciel degage' : 'Nuit claire'
  if (code <= 3) return 'Partiellement nuageux'
  if (code <= 48) return 'Brouillard'
  if (code <= 57) return 'Bruine'
  if (code <= 67) return 'Pluie'
  if (code <= 77) return 'Neige'
  if (code <= 82) return 'Averses'
  if (code <= 86) return 'Averses de neige'
  if (code <= 99) return 'Orages'
  return ''
}

const formattedTemperature = computed(() => {
  if (snapshot.value?.temperature === null || snapshot.value?.temperature === undefined) {
    return '--'
  }
  return `${Math.round(snapshot.value.temperature)}°`
})

const description = computed(() =>
  snapshot.value ? describeCode(snapshot.value.weatherCode, snapshot.value.isDay) : '',
)
</script>

<template>
  <div class="flex h-full flex-col p-5">
    <div class="mb-3 flex items-center justify-between">
      <span class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        <CloudSun :size="13" />
        Meteo
      </span>
      <button
        v-if="!isEditing && currentCity"
        class="grid size-7 place-items-center rounded-md text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
        title="Changer de ville"
        type="button"
        @click="openEdit"
      >
        <Settings2 :size="13" />
      </button>
    </div>

    <form
      v-if="isEditing"
      class="flex flex-1 flex-col justify-center gap-2"
      @submit.prevent="submitCity"
    >
      <label class="text-xs text-zinc-400" for="weather-city">Indiquez une ville</label>
      <div class="relative">
        <input
          id="weather-city"
          v-model="cityDraft"
          autocomplete="off"
          class="w-full rounded-lg bg-ink-950/70 px-3 py-2 text-sm text-zinc-100 outline-none ring-1 ring-white/5 focus:ring-accent-mint/40"
          placeholder="Paris"
          type="text"
          @input="onInput"
          @keydown="onKeyDown"
        />
        <div
          v-if="suggestions.length > 0"
          class="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg bg-ink-900 shadow-lift ring-1 ring-white/5"
        >
          <button
            v-for="(suggestion, index) in suggestions"
            :key="`${suggestion.latitude}-${suggestion.longitude}`"
            class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition"
            :class="
              index === activeIndex
                ? 'bg-accent-mint/15 text-zinc-100'
                : 'text-zinc-200 hover:bg-white/[0.06]'
            "
            type="button"
            @click="selectSuggestion(suggestion)"
            @mouseenter="activeIndex = index"
          >
            <MapPin :size="13" class="shrink-0 text-zinc-500" />
            <span class="min-w-0 truncate">{{ formatSuggestion(suggestion) }}</span>
          </button>
        </div>
        <div
          v-else-if="isSuggesting && cityDraft.trim().length >= 2"
          class="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500"
        >
          <Loader2 :size="14" class="animate-spin" />
        </div>
      </div>
      <button
        class="rounded-lg bg-accent-mint px-3 py-2 text-sm font-medium text-ink-950 disabled:opacity-50"
        :disabled="!cityDraft.trim()"
        type="submit"
      >
        Afficher la meteo
      </button>
    </form>

    <div v-else-if="status === 'loading'" class="flex flex-1 items-center justify-center text-zinc-500">
      <Loader2 :size="18" class="animate-spin" />
    </div>

    <div v-else-if="status === 'error'" class="flex flex-1 flex-col items-start justify-center gap-2 text-sm text-accent-coral">
      <p>{{ errorMessage }}</p>
      <button class="text-xs text-zinc-400 underline hover:text-zinc-100" type="button" @click="openEdit">
        Changer de ville
      </button>
    </div>

    <div v-else-if="snapshot" class="flex flex-1 flex-col justify-between">
      <div>
        <p class="text-5xl font-semibold tracking-tight text-white tabular-nums">
          {{ formattedTemperature }}
        </p>
        <p class="mt-1 text-sm text-zinc-400">{{ description }}</p>
      </div>
      <div class="mt-3 flex items-center gap-2 text-xs text-zinc-500">
        <MapPin :size="13" />
        <span class="truncate">{{ snapshot.locationName }}</span>
      </div>
    </div>
  </div>
</template>
