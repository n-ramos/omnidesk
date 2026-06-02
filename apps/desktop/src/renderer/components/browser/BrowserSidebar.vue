<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  Globe,
  Layers,
  Plus,
  X,
} from 'lucide-vue-next'
import BrowserTabRow from '@renderer/components/browser/BrowserTabRow.vue'
import { useBrowserStore } from '@renderer/stores/browserStore'
import type { BrowserBookmark, UUID } from '@shared/models'

const TAB_DND_MIME = 'application/x-omnibrowser-tab'

const store = useBrowserStore()

const newSpaceOpen = ref(false)
const newSpaceName = ref('')
const newCategoryOpen = ref(false)
const newCategoryName = ref('')
const newGroupOpen = ref(false)
const newGroupName = ref('')
const collapsed = reactive<Record<string, boolean>>({})
const dropTarget = ref<string | null>(null)

const spaces = computed(() => store.spaces)
const tabGroups = computed(() => store.tabGroups)
const ungroupedTabs = computed(() => store.ungroupedTabs)
const categories = computed(() => store.categories)
const uncategorized = computed(() => store.bookmarks.filter((bookmark) => !bookmark.categoryId))

const bookmarksFor = (categoryId: UUID): BrowserBookmark[] =>
  store.bookmarks.filter((bookmark) => bookmark.categoryId === categoryId)

const openUrl = (url: string): void => {
  const tab = store.activeTab
  if (tab && tab.initialUrl === '') {
    void store.navigateTab(tab, url)
  } else {
    void store.openTab(url, { activate: true })
  }
}

const submitNewSpace = (): void => {
  const name = newSpaceName.value.trim()
  if (name.length > 0) {
    void store.createSpace(name)
  }
  newSpaceName.value = ''
  newSpaceOpen.value = false
}

const submitNewCategory = (): void => {
  const name = newCategoryName.value.trim()
  if (name.length > 0) {
    void store.createCategory(name)
  }
  newCategoryName.value = ''
  newCategoryOpen.value = false
}

const submitNewGroup = (): void => {
  const name = newGroupName.value.trim()
  if (name.length > 0) {
    void store.createTabGroup(name)
  }
  newGroupName.value = ''
  newGroupOpen.value = false
}

const toggleCategory = (id: string): void => {
  collapsed[id] = !collapsed[id]
}

const spaceGlyph = (name: string, icon?: string): string =>
  icon && icon.length > 0 ? icon : name.slice(0, 1).toUpperCase()

const onDropTab = (event: DragEvent, groupId: UUID | null): void => {
  dropTarget.value = null
  const tabId = event.dataTransfer?.getData(TAB_DND_MIME)
  if (tabId) {
    void store.setTabGroup(tabId, groupId)
  }
}
</script>

<template>
  <aside class="flex h-full min-h-0 flex-col gap-3 overflow-hidden border-r border-white/[0.04] bg-ink-925/92 p-3">
    <!-- Espaces -->
    <div class="shrink-0">
      <div class="mb-2 flex items-center justify-between">
        <span class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          <Layers :size="13" /> Espaces
        </span>
        <button
          type="button"
          class="grid size-6 place-items-center rounded-md text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
          title="Nouvel espace"
          @click="newSpaceOpen = !newSpaceOpen"
        >
          <Plus :size="14" />
        </button>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="space in spaces"
          :key="space.id"
          type="button"
          class="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition"
          :class="
            space.id === store.activeSpaceId
              ? 'bg-accent-mint/15 text-accent-mint shadow-[inset_0_0_0_1px_rgba(45,184,128,0.5)]'
              : 'bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]'
          "
          @click="store.switchSpace(space.id)"
        >
          <span class="grid size-4 place-items-center text-xs font-semibold">{{ spaceGlyph(space.name, space.icon) }}</span>
          <span class="max-w-[120px] truncate">{{ space.name }}</span>
        </button>
      </div>
      <form v-if="newSpaceOpen" class="mt-2" @submit.prevent="submitNewSpace">
        <input
          v-model="newSpaceName"
          autofocus
          placeholder="Nom de l'espace"
          class="h-8 w-full rounded-lg bg-ink-950/70 px-2.5 text-sm text-white outline-none shadow-line"
          @keydown.esc="newSpaceOpen = false"
        />
      </form>
    </div>

    <div class="h-px w-full bg-white/[0.06]" />

    <!-- Onglets + groupes -->
    <div class="flex min-h-0 shrink-0 flex-col">
      <div class="mb-2 flex items-center justify-between">
        <span
          class="text-[11px] font-semibold uppercase tracking-[0.14em]"
          :class="store.privateMode ? 'text-violet-400' : 'text-zinc-500'"
        >
          {{ store.privateMode ? 'Onglets privés' : 'Onglets' }}
        </span>
        <div class="flex items-center gap-0.5">
          <button
            v-if="!store.privateMode"
            type="button"
            class="grid size-6 place-items-center rounded-md text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
            title="Nouveau groupe"
            @click="newGroupOpen = !newGroupOpen"
          >
            <FolderPlus :size="14" />
          </button>
          <button
            type="button"
            class="grid size-6 place-items-center rounded-md text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
            title="Nouvel onglet"
            @click="store.openTab('')"
          >
            <Plus :size="14" />
          </button>
        </div>
      </div>

      <form v-if="newGroupOpen" class="mb-2" @submit.prevent="submitNewGroup">
        <input
          v-model="newGroupName"
          autofocus
          placeholder="Nom du groupe"
          class="h-8 w-full rounded-lg bg-ink-950/70 px-2.5 text-sm text-white outline-none shadow-line"
          @keydown.esc="newGroupOpen = false"
        />
      </form>

      <div class="scroll-thin flex max-h-[42vh] flex-col gap-1 overflow-y-auto">
        <!-- Mode normal : groupes + onglets sans groupe -->
        <template v-if="!store.privateMode">
        <!-- Groupes (menus déroulants), zones de dépôt d'onglets -->
        <div
          v-for="group in tabGroups"
          :key="group.id"
          class="rounded-lg transition"
          :class="dropTarget === group.id ? 'bg-accent-mint/10 ring-1 ring-accent-mint/40' : ''"
          @dragover.prevent="dropTarget = group.id"
          @dragleave="dropTarget = null"
          @drop="onDropTab($event, group.id)"
        >
          <div class="group flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-zinc-300">
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-medium"
              @click="store.toggleTabGroupCollapsed(group.id)"
            >
              <component :is="group.isCollapsed ? ChevronRight : ChevronDown" :size="13" class="shrink-0 text-zinc-500" />
              <span class="truncate">{{ group.name }}</span>
              <span class="text-xs text-zinc-600">{{ store.tabsInGroup(group.id).length }}</span>
            </button>
            <button
              type="button"
              class="grid size-5 shrink-0 place-items-center rounded text-zinc-600 opacity-0 transition hover:bg-white/[0.1] hover:text-accent-coral group-hover:opacity-100"
              title="Supprimer le groupe"
              @click="store.deleteTabGroup(group.id)"
            >
              <X :size="12" />
            </button>
          </div>
          <div v-if="!group.isCollapsed" class="ml-2 flex flex-col gap-0.5 border-l border-white/[0.06] pl-1.5">
            <BrowserTabRow v-for="tab in store.tabsInGroup(group.id)" :key="tab.id" :tab="tab" />
            <p v-if="store.tabsInGroup(group.id).length === 0" class="px-2 py-1 text-xs text-zinc-600">
              Glissez un onglet ici
            </p>
          </div>
        </div>

        <!-- Onglets sans groupe (zone de dépôt pour dégrouper) -->
        <div
          class="flex flex-col gap-0.5 rounded-lg transition"
          :class="dropTarget === 'ungrouped' ? 'bg-accent-mint/10 ring-1 ring-accent-mint/40' : ''"
          @dragover.prevent="dropTarget = 'ungrouped'"
          @dragleave="dropTarget = null"
          @drop="onDropTab($event, null)"
        >
          <BrowserTabRow v-for="tab in ungroupedTabs" :key="tab.id" :tab="tab" />
        </div>
        </template>

        <!-- Mode privé : liste plate des onglets privés (pas de groupes) -->
        <template v-else>
          <BrowserTabRow v-for="tab in store.visibleTabs" :key="tab.id" :tab="tab" />
          <p v-if="store.visibleTabs.length === 0" class="px-2 py-2 text-xs text-zinc-600">
            Aucun onglet privé. Ouvrez-en un avec « + ».
          </p>
        </template>
      </div>
    </div>

    <div class="h-px w-full bg-white/[0.06]" />

    <!-- Favoris -->
    <div class="flex min-h-0 flex-1 flex-col">
      <div class="mb-2 flex items-center justify-between">
        <span class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Favoris</span>
        <button
          type="button"
          class="grid size-6 place-items-center rounded-md text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-200"
          title="Nouvelle catégorie"
          @click="newCategoryOpen = !newCategoryOpen"
        >
          <FolderPlus :size="14" />
        </button>
      </div>

      <form v-if="newCategoryOpen" class="mb-2" @submit.prevent="submitNewCategory">
        <input
          v-model="newCategoryName"
          autofocus
          placeholder="Nom de la catégorie"
          class="h-8 w-full rounded-lg bg-ink-950/70 px-2.5 text-sm text-white outline-none shadow-line"
          @keydown.esc="newCategoryOpen = false"
        />
      </form>

      <div class="scroll-thin flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        <div v-for="category in categories" :key="category.id">
          <div class="group flex items-center gap-1.5 rounded-lg px-1.5 py-1 text-zinc-300">
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-medium"
              @click="toggleCategory(category.id)"
            >
              <component :is="collapsed[category.id] ? ChevronRight : ChevronDown" :size="13" class="shrink-0 text-zinc-500" />
              <span class="truncate">{{ category.name }}</span>
            </button>
            <button
              type="button"
              class="grid size-5 shrink-0 place-items-center rounded text-zinc-600 opacity-0 transition hover:bg-white/[0.1] hover:text-accent-coral group-hover:opacity-100"
              title="Supprimer la catégorie"
              @click="store.deleteCategory(category.id)"
            >
              <X :size="12" />
            </button>
          </div>
          <div v-if="!collapsed[category.id]" class="ml-3 flex flex-col gap-0.5 border-l border-white/[0.06] pl-2">
            <div
              v-for="bookmark in bookmarksFor(category.id)"
              :key="bookmark.id"
              class="group flex items-center gap-2 rounded-md px-2 py-1 text-sm text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-200"
              @click="openUrl(bookmark.url)"
            >
              <img
                v-if="bookmark.faviconUrl"
                :src="bookmark.faviconUrl"
                alt=""
                referrerpolicy="no-referrer"
                class="size-4 shrink-0 rounded-sm object-contain"
              />
              <Globe v-else :size="13" class="shrink-0 text-zinc-600" />
              <span class="min-w-0 flex-1 truncate">{{ bookmark.title }}</span>
              <button
                type="button"
                class="grid size-5 shrink-0 place-items-center rounded text-zinc-600 opacity-0 transition hover:bg-white/[0.1] hover:text-accent-coral group-hover:opacity-100"
                title="Retirer"
                @click.stop="store.removeBookmark(bookmark.id)"
              >
                <X :size="11" />
              </button>
            </div>
          </div>
        </div>

        <!-- Favoris sans catégorie -->
        <div
          v-for="bookmark in uncategorized"
          :key="bookmark.id"
          class="group flex items-center gap-2 rounded-md px-2 py-1 text-sm text-zinc-400 transition hover:bg-white/[0.05] hover:text-zinc-200"
          @click="openUrl(bookmark.url)"
        >
          <img
            v-if="bookmark.faviconUrl"
            :src="bookmark.faviconUrl"
            alt=""
            referrerpolicy="no-referrer"
            class="size-4 shrink-0 rounded-sm object-contain"
          />
          <Globe v-else :size="13" class="shrink-0 text-zinc-600" />
          <span class="min-w-0 flex-1 truncate">{{ bookmark.title }}</span>
          <button
            type="button"
            class="grid size-5 shrink-0 place-items-center rounded text-zinc-600 opacity-0 transition hover:bg-white/[0.1] hover:text-accent-coral group-hover:opacity-100"
            title="Retirer"
            @click.stop="store.removeBookmark(bookmark.id)"
          >
            <X :size="11" />
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
