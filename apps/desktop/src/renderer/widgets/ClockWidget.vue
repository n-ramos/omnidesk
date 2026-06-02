<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Clock } from 'lucide-vue-next'

interface ClockConfig {
  showSeconds?: boolean
}

const props = defineProps<{
  config?: ClockConfig
  editMode: boolean
}>()

const emit = defineEmits<{
  (event: 'update:config', value: ClockConfig): void
}>()

const now = ref(new Date())
let timer: ReturnType<typeof setInterval> | undefined

const showSeconds = computed(() => Boolean(props.config?.showSeconds))

const timeFormatter = computed(
  () =>
    new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: showSeconds.value ? '2-digit' : undefined,
    }),
)
const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const time = computed(() => timeFormatter.value.format(now.value))
const date = computed(() => dateFormatter.format(now.value))

onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onBeforeUnmount(() => {
  if (timer) {
    clearInterval(timer)
  }
})

const toggleSeconds = (): void => {
  emit('update:config', { showSeconds: !showSeconds.value })
}
</script>

<template>
  <div class="flex h-full flex-col justify-between p-5">
    <div class="flex items-center justify-between">
      <span class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
        <Clock :size="13" />
        Heure
      </span>
      <button
        v-if="editMode"
        class="rounded-md bg-white/[0.055] px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/[0.085]"
        type="button"
        @click="toggleSeconds"
      >
        {{ showSeconds ? 'Sans secondes' : 'Avec secondes' }}
      </button>
    </div>

    <div>
      <p class="text-4xl font-semibold tracking-tight text-white tabular-nums">{{ time }}</p>
      <p class="mt-1 text-sm capitalize text-zinc-400">{{ date }}</p>
    </div>
  </div>
</template>
