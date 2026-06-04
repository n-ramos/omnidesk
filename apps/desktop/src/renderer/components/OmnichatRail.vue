<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { LogOut, MessageCircle, Plus, UserPlus, UserRound, Users, X } from 'lucide-vue-next'
import Spinner from '@renderer/components/ui/Spinner.vue'
import OmnichatCreateGroupDialog from '@renderer/components/OmnichatCreateGroupDialog.vue'
import OmnichatAuthGate from '@renderer/components/OmnichatAuthGate.vue'
import OmnichatVerifyEmail from '@renderer/components/OmnichatVerifyEmail.vue'
import { useAppStore } from '@renderer/stores/appStore'
import { useOmnichatStore } from '@renderer/stores/omnichatStore'
import { useSessionStore } from '@renderer/stores/sessionStore'

const store = useAppStore()
const omnichat = useOmnichatStore()
const session = useSessionStore()

onMounted(() => {
  void session.init()
  void omnichat.init()
})

// La session devient active (connexion, ou restauration au demarrage) -> (re)charge
// l'identite, les conversations et les contacts omnichat.
watch(
  () => session.isAuthenticated,
  (authenticated) => {
    if (authenticated) {
      void omnichat.refresh()
    }
  },
)

// Identite affichee : compte connecte. L'email est l'identite OmniChat (a partager pour
// etre ajoute en contact) ; le nom affiche vient du compte.
const me = computed(() => session.user)

const contactInput = ref('')
const showCreateGroup = ref(false)

const isContactEmail = computed(() => /.+@.+\..+/.test(contactInput.value.trim()))
const canAddContact = computed(() => isContactEmail.value && !omnichat.working)

// On ajoute un contact par son adresse email (= son identifiant OmniChat). Le pseudo
// local par defaut est la partie avant @ ; l'email (minuscule) est l'identifiant de transport.
const addContact = async (): Promise<void> => {
  const email = contactInput.value.trim().toLowerCase()
  if (!isContactEmail.value) {
    omnichat.error = 'Saisis une adresse email valide.'
    return
  }
  try {
    const label = email.split('@')[0] || email
    await omnichat.addContact(label, email)
    contactInput.value = ''
  } catch {
    // L'erreur est exposee via omnichat.error.
  }
}

const copied = ref(false)
const copyMyEmail = async (): Promise<void> => {
  const email = me.value?.email
  if (!email) {
    return
  }
  try {
    await navigator.clipboard.writeText(email)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch {
    // clipboard indisponible : on ignore.
  }
}

const logout = async (): Promise<void> => {
  await session.logout()
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
          v-if="me"
          class="block max-w-full truncate text-left text-xs"
          :class="omnichat.connected ? 'text-accent-mint' : 'text-zinc-500'"
          type="button"
          title="Cliquer pour copier ton email (a partager pour etre ajoute en contact)"
          @click="copyMyEmail"
        >
          {{ me.displayName }}
          - {{ copied ? 'email copie' : omnichat.connected ? 'en ligne' : 'hors-ligne' }}
        </button>
        <p v-else-if="session.state === 'unconfigured'" class="truncate text-xs text-zinc-500">
          Non configure
        </p>
        <p v-else class="truncate text-xs text-zinc-500">Non connecte</p>
      </div>
      <button
        v-if="session.isAuthenticated"
        class="grid size-9 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-white"
        type="button"
        title="Creer un groupe"
        @click="showCreateGroup = true"
      >
        <Plus :size="16" />
      </button>
      <button
        v-if="session.isAuthenticated"
        class="grid size-9 shrink-0 place-items-center rounded-lg text-zinc-400 transition hover:bg-white/[0.06] hover:text-accent-coral"
        type="button"
        title="Se deconnecter"
        :disabled="session.working"
        @click="logout"
      >
        <LogOut :size="16" />
      </button>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto px-2 py-3">
      <!-- OmniProxy absent : ni messagerie ni appels. -->
      <p
        v-if="session.state === 'unconfigured'"
        class="px-3 py-6 text-center text-sm leading-6 text-zinc-500"
      >
        OmniProxy n'est pas configure sur cette installation : la messagerie native et les
        appels sont indisponibles.
      </p>

      <!-- Session ouverte mais email non verifie : ecran de saisie du code a 6 chiffres. -->
      <OmnichatVerifyEmail v-else-if="session.state === 'unverified'" />

      <!-- Proxy present mais pas de session : connexion / inscription par compte. -->
      <OmnichatAuthGate v-else-if="!session.isAuthenticated" />

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

        <!-- Contacts (carnet d'adresses : on ne voit que ceux qu'on a ajoutes, par email) -->
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
                  <span class="block truncate text-sm font-medium text-zinc-100">{{ contact.pseudo }}</span>
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
              ? 'Aucun contact. Ajoute quelqu un par son adresse email ci-dessous, ou cree un groupe.'
              : 'Connexion a OmniChat en cours...'
          }}
        </p>
      </template>
    </div>

    <!-- Ajouter un contact par son adresse email (= son identifiant OmniChat). -->
    <div
      v-if="session.isAuthenticated"
      class="shrink-0 border-t border-white/[0.04] bg-ink-900/95 px-3 py-3"
    >
      <form class="flex items-center gap-2 rounded-lg bg-ink-950/55 px-3 py-2 shadow-line" @submit.prevent="addContact">
        <UserPlus :size="14" class="text-zinc-500" />
        <input
          v-model="contactInput"
          class="w-full bg-transparent text-sm text-white placeholder-zinc-600 outline-none"
          placeholder="Ajouter un contact (email)"
          type="email"
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
