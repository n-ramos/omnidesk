<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useBrowserStore } from '@renderer/stores/browserStore'

// Placeholder qui reserve l'espace du panneau DevTools et transmet ses dimensions au main.
// La vraie UI DevTools est rendue par-dessus dans une WebContentsView native (cote main).
const props = defineProps<{ visible: boolean }>()
const store = useBrowserStore()

const rootRef = ref<HTMLElement | null>(null)
let attached = false
let observer: ResizeObserver | undefined

const measure = (): { x: number; y: number; width: number; height: number } | null => {
  const el = rootRef.value
  if (!el) {
    return null
  }
  const rect = el.getBoundingClientRect()
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
}

const sync = (): void => {
  const bounds = measure()
  if (!bounds || bounds.width === 0 || bounds.height === 0) {
    return
  }
  if (!attached) {
    store.attachDevtools(bounds)
    attached = true
  } else {
    store.updateDevtoolsBounds(bounds, true)
  }
}

const onResize = (): void => {
  if (props.visible) {
    sync()
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      void nextTick(sync)
    } else {
      store.updateDevtoolsBounds(measure() ?? { x: 0, y: 0, width: 0, height: 0 }, false)
    }
  },
)

// Changement d'onglet inspecte : on force une nouvelle attache (bascule de cible cote main).
watch(
  () => store.devtoolsTabId,
  () => {
    attached = false
    if (props.visible) {
      void nextTick(sync)
    }
  },
)

onMounted(() => {
  observer = new ResizeObserver(onResize)
  if (rootRef.value) {
    observer.observe(rootRef.value)
  }
  window.addEventListener('resize', onResize)
  if (props.visible) {
    void nextTick(sync)
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', onResize)
  store.closeDevtools()
})
</script>

<template>
  <div ref="rootRef" class="h-full w-full" />
</template>
