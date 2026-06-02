<script setup lang="ts">
import { computed } from 'vue'
import { GripVertical, X } from 'lucide-vue-next'
import type { HomeWidgetInstance } from '@shared/models'
import { getWidgetDefinition } from './registry'

const props = defineProps<{
  instance: HomeWidgetInstance
  editMode: boolean
}>()

const emit = defineEmits<{
  (event: 'remove', id: string): void
  (event: 'update:config', id: string, config: Record<string, unknown>): void
}>()

const definition = computed(() => getWidgetDefinition(props.instance.widgetId))

const onUpdateConfig = (value: Record<string, unknown>): void => {
  emit('update:config', props.instance.id, value)
}
</script>

<template>
  <div class="relative h-full overflow-hidden rounded-2xl bg-white/[0.045] shadow-line">
    <div
      v-if="editMode"
      class="pointer-events-none absolute inset-0 z-10 rounded-2xl ring-1 ring-inset ring-accent-mint/30"
    />
    <div
      v-if="editMode"
      class="widget-drag-handle absolute left-2 top-2 z-20 grid size-7 cursor-grab place-items-center rounded-md bg-ink-950/80 text-zinc-400 transition hover:text-zinc-100 active:cursor-grabbing"
      title="Deplacer"
    >
      <GripVertical :size="14" />
    </div>
    <button
      v-if="editMode"
      class="absolute right-2 top-2 z-20 grid size-7 place-items-center rounded-md bg-ink-950/80 text-zinc-400 transition hover:bg-accent-coral/15 hover:text-accent-coral"
      title="Retirer ce widget"
      type="button"
      @click="emit('remove', instance.id)"
    >
      <X :size="14" />
    </button>

    <div v-if="!definition" class="flex h-full items-center justify-center p-4 text-sm text-zinc-500">
      Widget inconnu : {{ instance.widgetId }}
    </div>
    <component
      :is="definition.component"
      v-else
      :config="instance.config"
      :edit-mode="editMode"
      @update:config="onUpdateConfig"
    />
  </div>
</template>
