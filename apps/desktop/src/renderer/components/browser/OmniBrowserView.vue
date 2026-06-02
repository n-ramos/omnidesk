<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { X } from 'lucide-vue-next'
import BrowserSidebar from '@renderer/components/browser/BrowserSidebar.vue'
import BrowserOmnibox from '@renderer/components/browser/BrowserOmnibox.vue'
import BrowserPasswordPrompt from '@renderer/components/browser/BrowserPasswordPrompt.vue'
import BrowserSettingsDialog from '@renderer/components/browser/BrowserSettingsDialog.vue'
import BrowserHistoryDialog from '@renderer/components/browser/BrowserHistoryDialog.vue'
import BrowserDevtools from '@renderer/components/browser/BrowserDevtools.vue'
import BrowserTab from '@renderer/components/browser/BrowserTab.vue'
import { useBrowserStore } from '@renderer/stores/browserStore'

const store = useBrowserStore()
const settingsOpen = ref(false)
const historyOpen = ref(false)

const gridColumns = computed(() =>
  store.settings.sidebarCollapsed ? 'minmax(0, 1fr)' : '260px minmax(0, 1fr)',
)

// La vue DevTools native flotte au-dessus du contenu : on ne l'affiche que pour l'onglet
// inspecte actif, et on la masque quand une fenetre modale (reglages/historique) est ouverte.
const devtoolsVisible = computed(
  () =>
    store.devtoolsTabId !== undefined
    && store.devtoolsTabId === store.activeTabId
    && !settingsOpen.value
    && !historyOpen.value,
)

onMounted(() => {
  if (!store.initialized) {
    void store.initBrowser()
  }
})
</script>

<template>
  <section
    class="relative grid h-full min-h-0 overflow-hidden rounded-xl border border-white/[0.04] bg-ink-925/92 shadow-lift"
    :style="{ gridTemplateColumns: gridColumns }"
  >
    <BrowserSidebar v-if="!store.settings.sidebarCollapsed" />

    <div class="flex min-w-0 min-h-0 flex-col">
      <BrowserOmnibox @open-settings="settingsOpen = true" @open-history="historyOpen = true" />
      <BrowserPasswordPrompt />
      <div class="relative flex-1 min-h-0 bg-ink-950">
        <BrowserTab
          v-for="tab in store.tabs"
          v-show="tab.id === store.activeTabId"
          :key="tab.id"
          :tab="tab"
          :active="tab.id === store.activeTabId"
        />
      </div>

      <!-- Panneau DevTools dockable (bas), visible quand l'onglet inspecté est actif -->
      <div
        v-if="store.devtoolsTabId"
        v-show="devtoolsVisible"
        class="flex h-2/5 min-h-0 flex-col border-t border-white/[0.08] bg-ink-950"
      >
        <div class="flex items-center justify-between border-b border-white/[0.04] bg-ink-925 px-3 py-1.5">
          <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Outils de développement
          </span>
          <button
            type="button"
            class="grid size-6 place-items-center rounded text-zinc-500 transition hover:bg-white/[0.08] hover:text-zinc-200"
            title="Fermer les DevTools"
            @click="store.closeDevtools()"
          >
            <X :size="14" />
          </button>
        </div>
        <div class="relative min-h-0 flex-1">
          <BrowserDevtools :visible="devtoolsVisible" />
        </div>
      </div>
    </div>

    <BrowserSettingsDialog :open="settingsOpen" @close="settingsOpen = false" />
    <BrowserHistoryDialog :open="historyOpen" @close="historyOpen = false" />
  </section>
</template>
