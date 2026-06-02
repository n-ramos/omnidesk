<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MessageCircle, Plus, Send, UserPlus, UserRound, Users, X } from 'lucide-vue-next'
import Spinner from '@renderer/components/ui/Spinner.vue'
import OmnichatCreateGroupDialog from '@renderer/components/OmnichatCreateGroupDialog.vue'
import { useAppStore } from '@renderer/stores/appStore'
import { useOmnichatStore } from '@renderer/stores/omnichatStore'

const store = useAppStore()
const omnichat = useOmnichatStore()

onMounted(() => {
  void omnichat.init()
})

const contactInput = ref('')
const pseudoInput = ref('')
const showCreateGroup = ref(false)

const canSavePseudo = computed(() => pseudoInput.value.trim().length > 0 && !omnichat.working)

// Identifiant court a afficher (facon "pseudo#1a2b").
const shortId = (id: string): string => id.replace(/-/g, '').slice(0, 4)

// Jeton de contact partage : "pseudo#identifiant" (l'identifiant est un UUID, sans #).
// On separe sur le DERNIER # (le pseudo peut en contenir un). Les deux sont requis :
// sans connaitre pseudo ET identifiant, on ne peut pas ajouter quelqu'un.
const parseContactToken = (raw: string): { pseudo: string; id: string } | null => {
  const value = raw.trim()
  const hash = value.lastIndexOf('#')
  if (hash <= 0 || hash === value.length - 1) {
    return null
  }
  const pseudo = value.slice(0, hash).trim()
  const id = value.slice(hash + 1).trim()
  return pseudo && id ? { pseudo, id } : null
}

const canAddContact = computed(
  () => parseContactToken(contactInput.value) !== null && !omnichat.working,
)

const addContact = async (): Promise<void> => {
  const parsed = parseContactToken(contactInput.value)
  if (!parsed) {
    omnichat.error = 'Format attendu : pseudo#identifiant'
    return
  }
  try {
    await omnichat.addContact(parsed.pseudo, parsed.id)
    contactInput.value = ''
  } catch {
    // L'erreur est exposee via omnichat.error.
  }
}

const savePseudo = async (): Promise<void> => {
  if (!canSavePseudo.value) {
    return
  }
  await omnichat.setIdentity(pseudoInput.value.trim())
  pseudoInput.value = ''
}

const copied = ref(false)
const copyMyId = async (): Promise<void> => {
  const identity = omnichat.identity
  if (!identity) {
    return
  }
  try {
    // Jeton partageable : "pseudo#identifiant" (a coller dans "Ajouter un contact").
    await navigator.clipboard.writeText(`${identity.pseudo}#${identity.id}`)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch {
    // clipboard indisponible : on ignore.
  }
}

const formatTime = (value?: string): string => {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const now = new Date()
  const isToday =
    date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate()
  return isToday
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
}

const formatBadge = (count: number): string => (count > 99 ? '99+' : String(count))

const initialOf = (label: string): string => label.trim().slice(0, 1).toUpperCase() || '?'
</script>

<template>
  <aside class="flex min-w-0 flex-col border-y border-r border-white/[0.04] bg-ink-900/95">
    <header class="flex shrink-0 items-center gap-3 border-b border-white/[0.04] px-4 py-3.5">
      <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-mint/15 text-accent-mint">
        <MessageCircle :size="18" />
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm font-semibold text-white">Omnichat</p>
        <button
          v-if="omnichat.identity"
          class="block max-w-full truncate text-left text-xs"
          :class="omnichat.connected ? 'text-accent-mint' : 'text-zinc-500'"
          type="button"
          title="Cliquer pour copier ton identifiant (pseudo#hash) a partager pour etre ajoute"
          @click="copyMyId"
        >
          {{ omnichat.identity.pseudo }}<span class="text-zinc-600">#{{ shortId(omnichat.identity.id) }}</span>
          - {{ copied ? 'identifiant copie' : omnichat.connected ? 'en ligne' : 'hors-ligne' }}
        </button>
        <p v-else class="truncate text-xs text-zinc-500">Non configure</p>
      </div>
      <button
        v-if="omnichat.identity"
        class="grid size-9 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
        type="button"
        title="Creer un groupe"
        @click="showCreateGroup = true"
      >
        <Plus :size="16" />
      </button>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto px-2 py-3">
      <!-- Pas encore d'identite : on choisit un pseudo (un identifiant unique est
           genere automatiquement, facon Discord). -->
      <div v-if="!omnichat.identity" class="px-3 py-6">
        <div class="mx-auto grid size-12 place-items-center rounded-2xl bg-accent-mint/15 text-accent-mint">
          <MessageCircle :size="22" />
        </div>
        <h3 class="mt-3 text-center text-sm font-semibold text-white">Choisis ton pseudo</h3>
        <p class="mt-1 text-center text-xs leading-5 text-zinc-500">
          Un identifiant unique te sera attribue automatiquement. Aucun compte e-mail requis.
        </p>
        <form class="mt-3 flex items-center gap-2" @submit.prevent="savePseudo">
          <input
            v-model="pseudoInput"
            class="w-full rounded-lg bg-ink-950/55 px-3 py-2 text-sm text-white placeholder-zinc-600 shadow-line outline-none focus:ring-1 focus:ring-accent-mint/40"
            placeholder="Ton pseudo"
            type="text"
            maxlength="80"
          />
          <button
            class="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-mint text-ink-950 transition hover:brightness-110 disabled:opacity-40"
            type="submit"
            title="Valider"
            :disabled="!canSavePseudo"
          >
            <Spinner v-if="omnichat.working" :size="15" label="Enregistrement" />
            <Send v-else :size="15" />
          </button>
        </form>
        <p v-if="omnichat.error" class="mt-2 text-center text-xs text-accent-coral">{{ omnichat.error }}</p>
      </div>

      <template v-else>
        <!-- Groupes -->
        <section v-if="omnichat.groups.length > 0" class="mb-4">
          <div class="mb-1.5 flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            <Users :size="12" />
            <span>Groupes</span>
            <span class="ml-auto text-zinc-600">{{ omnichat.groups.length }}</span>
          </div>
          <div class="space-y-0.5">
            <button
              v-for="conversation in omnichat.groups"
              :key="conversation.id"
              class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition"
              :class="
                store.selectedConversation?.id === conversation.id
                  ? 'bg-accent-mint/15 text-white'
                  : 'text-zinc-300 hover:bg-white/[0.05]'
              "
              type="button"
              @click="omnichat.openConversation(conversation.id)"
            >
              <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.06] text-zinc-300">
                <Users :size="15" />
              </span>
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="flex min-w-0 items-center gap-2">
                  <span
                    class="min-w-0 flex-1 truncate text-sm"
                    :class="conversation.unreadCount > 0 ? 'font-semibold text-white' : 'font-medium'"
                  >{{ conversation.title }}</span>
                  <span class="shrink-0 text-[10px] tabular-nums text-zinc-600">
                    {{ formatTime(conversation.lastMessageAt) }}
                  </span>
                  <span
                    v-if="conversation.unreadCount > 0"
                    class="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent-coral px-1.5 text-[10px] font-bold leading-none tabular-nums text-white"
                  >{{ formatBadge(conversation.unreadCount) }}</span>
                </span>
                <span class="mt-0.5 truncate text-xs text-zinc-500">
                  {{ conversation.lastMessagePreview || 'Aucun apercu' }}
                </span>
              </span>
            </button>
          </div>
        </section>

        <!-- Messages directs -->
        <section v-if="omnichat.dms.length > 0" class="mb-4">
          <div class="mb-1.5 flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            <UserRound :size="12" />
            <span>Messages directs</span>
            <span class="ml-auto text-zinc-600">{{ omnichat.dms.length }}</span>
          </div>
          <div class="space-y-0.5">
            <button
              v-for="conversation in omnichat.dms"
              :key="conversation.id"
              class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition"
              :class="
                store.selectedConversation?.id === conversation.id
                  ? 'bg-accent-mint/15 text-white'
                  : 'text-zinc-300 hover:bg-white/[0.05]'
              "
              type="button"
              @click="omnichat.openConversation(conversation.id)"
            >
              <span class="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.08] text-xs font-semibold text-zinc-200">
                {{ initialOf(conversation.title) }}
              </span>
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="flex min-w-0 items-center gap-2">
                  <span
                    class="min-w-0 flex-1 truncate text-sm"
                    :class="conversation.unreadCount > 0 ? 'font-semibold text-white' : 'font-medium'"
                  >{{ conversation.title }}</span>
                  <span class="shrink-0 text-[10px] tabular-nums text-zinc-600">
                    {{ formatTime(conversation.lastMessageAt) }}
                  </span>
                  <span
                    v-if="conversation.unreadCount > 0"
                    class="inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-accent-coral px-1.5 text-[10px] font-bold leading-none tabular-nums text-white"
                  >{{ formatBadge(conversation.unreadCount) }}</span>
                </span>
                <span class="mt-0.5 truncate text-xs text-zinc-500">
                  {{ conversation.lastMessagePreview || 'Aucun apercu' }}
                </span>
              </span>
            </button>
          </div>
        </section>

        <!-- Contacts (carnet d'adresses : on ne voit que ceux qu'on a ajoutes) -->
        <section v-if="omnichat.contacts.length > 0" class="mb-4">
          <div class="mb-1.5 flex items-center gap-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            <UserRound :size="12" />
            <span>Contacts</span>
            <span class="ml-auto text-zinc-600">{{ omnichat.contacts.length }}</span>
          </div>
          <div class="space-y-0.5">
            <div
              v-for="contact in omnichat.contacts"
              :key="contact.id"
              class="group flex items-center gap-2 rounded-lg px-3 py-2 text-zinc-300 transition hover:bg-white/[0.05]"
            >
              <button
                class="flex min-w-0 flex-1 items-center gap-2 text-left"
                type="button"
                :title="`Demarrer un message direct avec ${contact.pseudo}`"
                @click="omnichat.openDm(contact.id)"
              >
                <span class="relative grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.08] text-xs font-semibold text-zinc-200">
                  {{ initialOf(contact.pseudo) }}
                  <span
                    class="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-ink-900"
                    :class="contact.online ? 'bg-accent-mint' : 'bg-zinc-600'"
                    :title="contact.online ? 'En ligne' : 'Hors ligne'"
                  />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium text-zinc-100">
                    {{ contact.pseudo }}<span class="text-zinc-600">#{{ shortId(contact.id) }}</span>
                  </span>
                  <span
                    class="block text-[11px]"
                    :class="contact.online ? 'text-accent-mint' : 'text-zinc-600'"
                  >{{ contact.online ? 'En ligne' : 'Hors ligne' }}</span>
                </span>
              </button>
              <button
                class="grid size-7 shrink-0 place-items-center rounded-md text-zinc-600 opacity-0 transition hover:bg-white/[0.06] hover:text-accent-coral group-hover:opacity-100"
                type="button"
                :title="`Retirer ${contact.pseudo} des contacts`"
                @click.stop="omnichat.removeContact(contact.id)"
              >
                <X :size="14" />
              </button>
            </div>
          </div>
        </section>

        <p
          v-if="omnichat.groups.length === 0 && omnichat.dms.length === 0 && omnichat.contacts.length === 0"
          class="px-3 py-6 text-center text-sm leading-6 text-zinc-500"
        >
          {{
            omnichat.connected
              ? 'Aucun contact. Ajoute quelqu un par son pseudo#identifiant ci-dessous, ou cree un groupe.'
              : 'Hors-ligne : OmniProxy est requis pour la messagerie omnichat.'
          }}
        </p>
      </template>
    </div>

    <!-- Ajouter un contact par pseudo#identifiant (le "hash" du pair, partage comme sur
         Discord). On ne decouvre personne : il faut connaitre ces deux infos. -->
    <div
      v-if="omnichat.identity"
      class="shrink-0 border-t border-white/[0.04] bg-ink-900/95 px-3 py-3"
    >
      <form class="flex items-center gap-2 rounded-lg bg-ink-950/55 px-3 py-2 shadow-line" @submit.prevent="addContact">
        <UserPlus :size="14" class="text-zinc-500" />
        <input
          v-model="contactInput"
          class="w-full bg-transparent text-sm text-white placeholder-zinc-600 outline-none"
          placeholder="Ajouter un contact (pseudo#identifiant)"
          type="text"
        />
        <button
          class="grid size-7 shrink-0 place-items-center rounded-md text-accent-mint transition hover:bg-accent-mint/15 disabled:opacity-30"
          type="submit"
          title="Ajouter le contact"
          :disabled="!canAddContact"
        >
          <Spinner v-if="omnichat.working" :size="14" label="Ajout" />
          <Plus v-else :size="15" />
        </button>
      </form>
    </div>

    <OmnichatCreateGroupDialog :open="showCreateGroup" @close="showCreateGroup = false" />
  </aside>
</template>
