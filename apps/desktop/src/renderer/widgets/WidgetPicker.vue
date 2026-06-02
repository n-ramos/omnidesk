<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { widgetDefinitions } from './registry'

defineEmits<{
  (event: 'pick', widgetId: string): void
}>()
</script>

<template>
  <div class="rounded-2xl bg-white/[0.045] p-4 shadow-line">
    <p class="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
      Ajouter un widget
    </p>
    <div class="grid gap-2 sm:grid-cols-2">
      <button
        v-for="definition in widgetDefinitions"
        :key="definition.id"
        class="group flex items-start gap-3 rounded-xl bg-ink-950/55 p-3 text-left transition hover:bg-white/[0.06]"
        type="button"
        @click="$emit('pick', definition.id)"
      >
        <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-mint/12 text-accent-mint">
          <Plus :size="14" />
        </span>
        <span class="min-w-0">
          <span class="block text-sm font-semibold text-zinc-100">{{ definition.name }}</span>
          <span class="mt-0.5 block text-xs leading-5 text-zinc-500">{{ definition.description }}</span>
        </span>
      </button>
    </div>
  </div>
</template>
