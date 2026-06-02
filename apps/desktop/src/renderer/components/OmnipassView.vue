<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  AlertTriangle,
  Copy,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  KeySquare,
  Lock,
  Pencil,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  Trash2,
} from 'lucide-vue-next'
import Spinner from '@renderer/components/ui/Spinner.vue'
import PassStrengthBar from '@renderer/components/PassStrengthBar.vue'
import OmnipassEntryDialog from '@renderer/components/OmnipassEntryDialog.vue'
import OmnipassChangeMasterDialog from '@renderer/components/OmnipassChangeMasterDialog.vue'
import OmnipassSettingsDialog from '@renderer/components/OmnipassSettingsDialog.vue'
import { confirm } from '@renderer/composables/useConfirm'
import { useAppStore } from '@renderer/stores/appStore'
import { useOmnipassStore } from '@renderer/stores/omnipassStore'
import type { PassEntrySecret, PassEntrySummary } from '@shared/models'

const store = useOmnipassStore()
const appStore = useAppStore()

const MIN_MASTER = 8

const masterPassword = ref('')
const masterConfirm = ref('')
const unlockPassword = ref('')

const dialogOpen = ref(false)
const editing = ref<PassEntrySummary | null>(null)
const revealed = ref<Record<string, PassEntrySecret>>({})
const changeMasterOpen = ref(false)
const settingsOpen = ref(false)
const recoveryMode = ref(false)
const recoveryCode = ref('')

// Copie locale reordonnable des entrees visibles (resynchronisee hors glissement).
const localEntries = ref<PassEntrySummary[]>([])
const draggingEntryId = ref<string | null>(null)

watch(
  () => store.visibleEntries,
  (next) => {
    if (!draggingEntryId.value) {
      localEntries.value = [...next]
    }
  },
  { immediate: true },
)

const canCreate = computed(
  () =>
    masterPassword.value.length >= MIN_MASTER &&
    masterPassword.value === masterConfirm.value &&
    !store.working,
)

const fieldClass =
  'w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none transition focus:border-accent-mint/50 focus:bg-white/[0.06]'
const primaryClass =
  'inline-flex h-9 items-center justify-center gap-2 rounded-md bg-accent-mint px-3.5 text-sm font-medium text-ink-950 shadow-lift transition hover:bg-[#a5f0ce] disabled:cursor-not-allowed disabled:opacity-45'
const iconButtonClass =
  'grid size-8 place-items-center rounded-md text-zinc-500 transition hover:bg-white/[0.08] hover:text-zinc-100'

onMounted(() => {
  void store.init()
})

const submitCreate = async (): Promise<void> => {
  if (!canCreate.value) {
    return
  }
  await store.createVault(masterPassword.value)
  if (store.status === 'unlocked') {
    masterPassword.value = ''
    masterConfirm.value = ''
  }
}

const submitUnlock = async (): Promise<void> => {
  if (!unlockPassword.value || store.working) {
    return
  }
  await store.unlock(unlockPassword.value)
  if (store.status === 'unlocked') {
    unlockPassword.value = ''
  }
}

const submitRecovery = async (): Promise<void> => {
  if (!recoveryCode.value || store.working) {
    return
  }
  await store.unlockWithRecovery(recoveryCode.value)
  if (store.status === 'unlocked') {
    recoveryCode.value = ''
    recoveryMode.value = false
  }
}

const openCreate = (): void => {
  editing.value = null
  dialogOpen.value = true
}

const openEdit = (entry: PassEntrySummary): void => {
  editing.value = entry
  dialogOpen.value = true
}

const forgetRevealed = (id: string): void => {
  if (!revealed.value[id]) {
    return
  }
  const next = { ...revealed.value }
  delete next[id]
  revealed.value = next
}

const toggleReveal = async (id: string): Promise<void> => {
  if (revealed.value[id]) {
    forgetRevealed(id)
    return
  }
  const secret = await store.reveal(id)
  if (secret) {
    revealed.value = { ...revealed.value, [id]: secret }
  }
}

const copy = async (entry: PassEntrySummary): Promise<void> => {
  await store.copy(entry.id)
  appStore.actionFeedback = 'Mot de passe copie (efface du presse-papier dans 20 s)'
}

const remove = async (entry: PassEntrySummary): Promise<void> => {
  const ok = await confirm({
    title: `Supprimer ${entry.title} ?`,
    message: 'Cette entree sera definitivement supprimee du coffre.',
    confirmLabel: 'Supprimer',
    tone: 'danger',
  })
  if (ok) {
    forgetRevealed(entry.id)
    await store.deleteEntry(entry.id)
  }
}

const toggleFavorite = (entry: PassEntrySummary): void => {
  void store.toggleFavorite(entry.id, !entry.favorite)
}

const onSaved = (): void => {
  appStore.actionFeedback = 'Entree enregistree'
}

const onMasterChanged = (): void => {
  appStore.actionFeedback = 'Mot de passe maitre mis a jour'
}

// Source du glisser-deposer : depot sur un dossier (rail) = ranger ; depot sur une entree = reordonner.
const onEntryDragStart = (event: DragEvent, id: string): void => {
  draggingEntryId.value = id
  event.dataTransfer?.setData('application/x-omnipass-entry', id)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

const onEntryDragOver = (overId: string): void => {
  if (!store.entriesReorderable || !draggingEntryId.value || draggingEntryId.value === overId) {
    return
  }
  const ids = localEntries.value.map((entry) => entry.id)
  const from = ids.indexOf(draggingEntryId.value)
  const to = ids.indexOf(overId)
  if (from === -1 || to === -1 || from === to) {
    return
  }
  const moved = localEntries.value.splice(from, 1)[0]
  if (moved) {
    localEntries.value.splice(to, 0, moved)
  }
}

const onEntryDrop = (): void => {
  if (store.entriesReorderable && draggingEntryId.value) {
    void store.reorderEntries(
      store.selectedFolderId,
      localEntries.value.map((entry) => entry.id),
    )
  }
  draggingEntryId.value = null
}
</script>

<template>
  <section class="min-h-0 flex-1 overflow-auto p-5">
    <!-- Creation du coffre (premiere utilisation) -->
    <div
      v-if="store.status === 'uninitialized'"
      class="mx-auto flex min-h-full max-w-md flex-col justify-center"
    >
      <header class="mb-5 text-center">
        <span
          class="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-accent-mint/15 text-accent-mint"
        >
          <KeyRound :size="24" />
        </span>
        <h2 class="text-xl font-semibold text-white">Creer votre coffre</h2>
        <p class="mt-1 text-sm text-zinc-500">
          Choisissez un mot de passe maitre : il protege l'ensemble de vos entrees.
        </p>
      </header>
      <div class="space-y-3">
        <input
          v-model="masterPassword"
          :class="fieldClass"
          type="password"
          placeholder="Mot de passe maitre"
          autocomplete="new-password"
          @keyup.enter="submitCreate"
        />
        <input
          v-model="masterConfirm"
          :class="fieldClass"
          type="password"
          placeholder="Confirmer le mot de passe maitre"
          autocomplete="new-password"
          @keyup.enter="submitCreate"
        />
        <PassStrengthBar v-if="masterPassword.length > 0" :password="masterPassword" />
        <div
          class="flex items-start gap-2 rounded-lg border border-accent-gold/20 bg-accent-gold/10 px-3 py-2.5 text-xs text-accent-gold"
        >
          <AlertTriangle :size="15" class="mt-0.5 shrink-0" />
          <span>
            Aucune recuperation possible : si vous oubliez ce mot de passe, les donnees du coffre
            seront definitivement perdues. Choisissez-en un solide (au moins {{ MIN_MASTER }}
            caracteres).
          </span>
        </div>
        <p
          v-if="masterConfirm.length > 0 && masterPassword !== masterConfirm"
          class="text-xs text-accent-coral"
        >
          Les mots de passe ne correspondent pas.
        </p>
        <p v-if="store.error" class="text-xs text-accent-coral">{{ store.error }}</p>
        <button :class="[primaryClass, 'w-full']" type="button" :disabled="!canCreate" @click="submitCreate">
          <Spinner v-if="store.working" :size="14" />
          <span>Creer le coffre</span>
        </button>
      </div>
    </div>

    <!-- Deverrouillage -->
    <div
      v-else-if="store.status === 'locked'"
      class="mx-auto flex min-h-full max-w-md flex-col justify-center"
    >
      <header class="mb-5 text-center">
        <span
          class="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-white/[0.06] text-zinc-300"
        >
          <Lock :size="24" />
        </span>
        <h2 class="text-xl font-semibold text-white">Coffre verrouille</h2>
        <p class="mt-1 text-sm text-zinc-500">
          Saisissez votre mot de passe maitre pour deverrouiller omniPass.
        </p>
      </header>
      <div class="space-y-3">
        <input
          v-model="unlockPassword"
          :class="fieldClass"
          type="password"
          placeholder="Mot de passe maitre"
          autocomplete="current-password"
          @keyup.enter="submitUnlock"
        />
        <p v-if="store.error" class="text-xs text-accent-coral">{{ store.error }}</p>
        <button
          :class="[primaryClass, 'w-full']"
          type="button"
          :disabled="unlockPassword.length === 0 || store.working"
          @click="submitUnlock"
        >
          <Spinner v-if="store.working" :size="14" />
          <span>Deverrouiller</span>
        </button>
        <button
          v-if="store.biometricEnabled"
          class="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-white/[0.055] text-sm font-medium text-zinc-100 shadow-line transition hover:bg-white/[0.085]"
          type="button"
          @click="store.unlockWithBiometric()"
        >
          <Fingerprint :size="16" />
          <span>Deverrouiller avec Touch ID</span>
        </button>
        <template v-if="store.recoveryEnabled">
          <button
            v-if="!recoveryMode"
            class="w-full text-center text-xs font-medium text-zinc-500 transition hover:text-zinc-300"
            type="button"
            @click="recoveryMode = true"
          >
            Mot de passe maitre oublie ? Utiliser un code de recuperation
          </button>
          <div v-else class="space-y-2 border-t border-white/[0.05] pt-3">
            <input
              v-model="recoveryCode"
              :class="fieldClass"
              type="text"
              placeholder="Code de recuperation"
              autocomplete="off"
              @keyup.enter="submitRecovery"
            />
            <button
              :class="[primaryClass, 'w-full']"
              type="button"
              :disabled="recoveryCode.length === 0 || store.working"
              @click="submitRecovery"
            >
              <Spinner v-if="store.working" :size="14" />
              <span>Deverrouiller avec le code</span>
            </button>
          </div>
        </template>
      </div>
    </div>

    <!-- Coffre ouvert -->
    <div v-else>
      <header class="mb-5 flex items-center justify-between gap-3">
        <div>
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Omnipass</p>
          <h2 class="mt-1 text-xl font-semibold text-white">
            {{ store.view === 'favorites' ? 'Favoris' : store.selectedFolder ? store.selectedFolder.name : 'Mes mots de passe' }}
          </h2>
        </div>
        <div class="flex items-center gap-2">
          <button
            :class="iconButtonClass"
            type="button"
            title="Parametres du coffre"
            @click="settingsOpen = true"
          >
            <SlidersHorizontal :size="18" />
          </button>
          <button
            :class="iconButtonClass"
            type="button"
            title="Changer le mot de passe maitre"
            @click="changeMasterOpen = true"
          >
            <KeySquare :size="18" />
          </button>
          <button :class="primaryClass" type="button" @click="openCreate">
            <Plus :size="16" />
            <span>Nouvelle entree</span>
          </button>
        </div>
      </header>

      <div
        v-if="localEntries.length === 0"
        class="rounded-xl border border-white/[0.05] bg-white/[0.02] p-10 text-center"
      >
        <ShieldCheck :size="28" class="mx-auto mb-3 text-zinc-600" />
        <p class="text-sm text-zinc-400">
          {{
            store.view === 'favorites'
              ? 'Aucun favori pour le moment.'
              : store.entries.length === 0
                ? 'Votre coffre est vide.'
                : 'Aucune entree ne correspond a la recherche.'
          }}
        </p>
        <button
          v-if="store.entries.length === 0 && store.view !== 'favorites'"
          class="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-accent-mint transition hover:underline"
          type="button"
          @click="openCreate"
        >
          <Plus :size="15" />
          Ajouter une entree
        </button>
      </div>

      <ul v-else class="space-y-2">
        <li
          v-for="entry in localEntries"
          :key="entry.id"
          class="cursor-grab rounded-xl border border-white/[0.05] bg-white/[0.025] p-3 transition hover:border-white/[0.1] active:cursor-grabbing"
          :class="draggingEntryId === entry.id ? 'opacity-40' : ''"
          draggable="true"
          @dragstart="onEntryDragStart($event, entry.id)"
          @dragover.prevent="onEntryDragOver(entry.id)"
          @drop.prevent="onEntryDrop"
          @dragend="draggingEntryId = null"
        >
          <div class="flex items-center gap-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-zinc-300">
              <KeyRound :size="16" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-white">{{ entry.title }}</p>
              <p v-if="entry.username" class="truncate text-xs text-zinc-500">{{ entry.username }}</p>
            </div>
            <div class="flex items-center gap-1">
              <button
                :class="iconButtonClass"
                type="button"
                :title="entry.favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'"
                @click="toggleFavorite(entry)"
              >
                <Star
                  :size="15"
                  :fill="entry.favorite ? 'currentColor' : 'none'"
                  :class="entry.favorite ? 'text-accent-gold' : ''"
                />
              </button>
              <button
                :class="iconButtonClass"
                type="button"
                :title="revealed[entry.id] ? 'Masquer' : 'Afficher'"
                @click="toggleReveal(entry.id)"
              >
                <component :is="revealed[entry.id] ? EyeOff : Eye" :size="15" />
              </button>
              <button :class="iconButtonClass" type="button" title="Copier le mot de passe" @click="copy(entry)">
                <Copy :size="15" />
              </button>
              <button :class="iconButtonClass" type="button" title="Modifier" @click="openEdit(entry)">
                <Pencil :size="15" />
              </button>
              <button
                class="grid size-8 place-items-center rounded-md text-zinc-500 transition hover:bg-accent-coral/10 hover:text-accent-coral"
                type="button"
                title="Supprimer"
                @click="remove(entry)"
              >
                <Trash2 :size="15" />
              </button>
            </div>
          </div>
          <div
            v-if="revealed[entry.id]"
            class="mt-2.5 space-y-1.5 border-t border-white/[0.05] pt-2.5"
          >
            <p class="break-all font-mono text-sm text-accent-mint">{{ revealed[entry.id]?.password }}</p>
            <p v-if="entry.url" class="truncate text-xs text-zinc-500">{{ entry.url }}</p>
            <p
              v-if="revealed[entry.id]?.notes"
              class="whitespace-pre-wrap text-xs text-zinc-400"
            >
              {{ revealed[entry.id]?.notes }}
            </p>
          </div>
        </li>
      </ul>
    </div>

    <OmnipassEntryDialog
      :open="dialogOpen"
      :entry="editing"
      :folder-id="store.selectedFolderId"
      @close="dialogOpen = false"
      @saved="onSaved"
    />
    <OmnipassChangeMasterDialog
      :open="changeMasterOpen"
      @close="changeMasterOpen = false"
      @changed="onMasterChanged"
    />
    <OmnipassSettingsDialog :open="settingsOpen" @close="settingsOpen = false" />
  </section>
</template>
