<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { GridLayout, GridItem } from 'grid-layout-plus'
import { Pencil, Plus, RotateCcw, X } from 'lucide-vue-next'
import BaseButton from '@renderer/components/ui/BaseButton.vue'
import WidgetHost from '@renderer/widgets/WidgetHost.vue'
import WidgetPicker from '@renderer/widgets/WidgetPicker.vue'
import { confirm } from '@renderer/composables/useConfirm'
import { useHomeStore } from '@renderer/stores/homeStore'

interface GridLayoutItem {
  i: string
  x: number
  y: number
  w: number
  h: number
}

const store = useHomeStore()
const isPickerOpen = ref(false)

onMounted(() => {
  if (!store.isLoaded) {
    void store.loadLayout()
  }
})

const layout = computed<GridLayoutItem[]>(() =>
  store.widgets.map((widget) => ({
    i: widget.id,
    x: widget.x,
    y: widget.y,
    w: widget.w,
    h: widget.h,
  })),
)

const widgetById = computed(() => new Map(store.widgets.map((widget) => [widget.id, widget])))

const onLayoutUpdated = (items: GridLayoutItem[]): void => {
  const normalized = items.map((item) => ({
    i: String(item.i),
    x: item.x,
    y: item.y,
    w: item.w,
    h: item.h,
  }))
  store.applyGridUpdate(normalized)
}

const onPick = (widgetId: string): void => {
  store.addWidget(widgetId)
  isPickerOpen.value = false
}

const confirmReset = async (): Promise<void> => {
  const ok = await confirm({
    title: 'Reinitialiser l\'accueil ?',
    message: 'La disposition par defaut sera restauree et vos widgets actuels seront perdus.',
    confirmLabel: 'Reinitialiser',
    tone: 'danger',
  })
  if (ok) {
    store.resetToDefault()
  }
}
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <div class="flex items-center justify-between border-b border-white/[0.06] px-8 py-5">
      <div>
        <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-accent-mint">
          Accueil
        </p>
        <h1 class="mt-2 text-2xl font-semibold tracking-tight text-white">
          Votre espace personnalise
        </h1>
      </div>
      <div class="flex items-center gap-2">
        <BaseButton v-if="store.isEditing" variant="ghost" @click="confirmReset">
          <RotateCcw :size="15" />
          Reinitialiser
        </BaseButton>
        <BaseButton
          v-if="store.isEditing"
          variant="secondary"
          @click="isPickerOpen = !isPickerOpen"
        >
          <Plus :size="15" />
          Ajouter un widget
        </BaseButton>
        <BaseButton :variant="store.isEditing ? 'primary' : 'secondary'" @click="store.toggleEditMode()">
          <Pencil v-if="!store.isEditing" :size="15" />
          <X v-else :size="15" />
          {{ store.isEditing ? 'Terminer' : 'Personnaliser' }}
        </BaseButton>
      </div>
    </div>

    <div class="scroll-thin flex min-h-0 flex-1 flex-col overflow-auto p-6">
      <div v-if="store.isEditing && isPickerOpen" class="mb-4">
        <WidgetPicker @pick="onPick" />
      </div>

      <div
        v-if="store.widgets.length === 0"
        class="grid flex-1 place-items-center text-sm text-zinc-500"
      >
        <div class="text-center">
          <p>Aucun widget pour le moment.</p>
          <button
            v-if="!store.isEditing"
            class="mt-3 text-sm text-accent-mint hover:underline"
            type="button"
            @click="store.toggleEditMode()"
          >
            Personnaliser l'accueil
          </button>
        </div>
      </div>

      <GridLayout
        v-else
        :layout="layout"
        :col-num="store.columnCount"
        :row-height="48"
        :margin="[14, 14]"
        :is-draggable="store.isEditing"
        :is-resizable="store.isEditing"
        :vertical-compact="true"
        :use-css-transforms="true"
        @layout-updated="onLayoutUpdated"
      >
        <GridItem
          v-for="item in layout"
          :key="item.i"
          :x="item.x"
          :y="item.y"
          :w="item.w"
          :h="item.h"
          :i="item.i"
          :is-draggable="store.isEditing"
          :is-resizable="store.isEditing"
          drag-allow-from=".widget-drag-handle"
        >
          <WidgetHost
            :instance="widgetById.get(String(item.i))!"
            :edit-mode="store.isEditing"
            @remove="store.removeWidget"
            @update:config="store.updateWidgetConfig"
          />
        </GridItem>
      </GridLayout>
    </div>
  </section>
</template>

<style>
.vgl-layout {
  position: relative;
  width: 100%;
}

.vgl-item {
  transition: box-shadow 0.15s ease;
}

.vgl-item--placeholder {
  background: rgb(var(--accent-mint) / 0.12) !important;
  opacity: 1 !important;
  border-radius: 16px;
}

.vgl-item--resizing,
.vgl-item--dragging {
  z-index: 30;
}

.vgl-item > .vgl-item__resizer {
  bottom: 6px;
  right: 6px;
  opacity: 0.5;
}
</style>
