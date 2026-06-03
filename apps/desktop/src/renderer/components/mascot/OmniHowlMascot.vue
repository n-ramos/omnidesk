<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EyeOff, Volume2, VolumeX } from 'lucide-vue-next'
import OwlSprite from '@renderer/components/mascot/OwlSprite.vue'
import SpeechBubble from '@renderer/components/mascot/SpeechBubble.vue'
import { useAppStore } from '@renderer/stores/appStore'
import {
  nextMascotId,
  useMascotStore,
  type MascotMessage,
} from '@renderer/stores/mascotStore'
import { randomQuote } from '@renderer/data/quotes'
import { playMascotChirp } from '@renderer/utils/mascotSound'
import type { LocalNotification } from '@shared/models'

const store = useMascotStore()
const appStore = useAppStore()

// Le lecteur multimedia est une barre en bas de fenetre : on remonte Elodie au-dessus
// quand il est visible pour ne pas le recouvrir (ni bloquer le volume).
const mediaPlayerVisible = computed(() =>
  appStore.accounts.some(
    (account) =>
      account.providerId === 'webpage' && appStore.webpageMedia[account.id]?.audible === true,
  ),
)

const hover = ref(false)
const peekHover = ref(false)
const sleeping = ref(false)
const lastQuoteText = ref<string | undefined>(undefined)

// Etat "rangee" : Elodie glisse derriere le bord droit, seule sa moitie gauche (un oeil)
// reste visible. Au survol, la languette s'elargit : elle se penche et montre ses deux yeux.
const TUCK_SIZE = 104
const PEEK_REST = 46
const PEEK_HOVER = 74
// Decale la chouette vers la gauche pour gommer la marge transparente d'`object-contain`
// (image portrait centree dans une boite carree) afin qu'elle soit collee au bord.
const PEEK_OWL_OFFSET = -((TUCK_SIZE - (TUCK_SIZE * 460) / 600) / 2)
const peekWidth = computed(() => (peekHover.value ? PEEK_HOVER : PEEK_REST))

let dismissTimer: ReturnType<typeof setTimeout> | undefined
let periodicTimer: ReturnType<typeof setTimeout> | undefined
let greetingTimer: ReturnType<typeof setTimeout> | undefined
let firstAmbientTimer: ReturnType<typeof setTimeout> | undefined
let idleChecker: ReturnType<typeof setInterval> | undefined
let stopReminderListener: (() => void) | undefined
let lastActivity = Date.now()

const PERIOD_MIN_MS = 10 * 60 * 1000
const PERIOD_MAX_MS = 15 * 60 * 1000
const IDLE_SLEEP_MS = 2 * 60 * 1000
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'] as const

const pick = <T,>(items: T[]): T => items[Math.floor(Math.random() * items.length)] as T

const buildGreeting = (): MascotMessage => {
  const hour = new Date().getHours()
  const part =
    hour < 5
      ? 'Hou hou... tu veilles tard'
      : hour < 12
        ? 'Bonjour'
        : hour < 18
          ? 'Bon apres-midi'
          : 'Bonsoir'
  const text = pick([
    `${part} ! Moi c'est Elodie, je veille sur ton bureau.`,
    `${part} ! Je suis la si tu as besoin d'un petit mot.`,
    `${part} ! Clique-moi quand tu veux une citation.`,
  ])
  return { id: nextMascotId(), kind: 'greeting', text, durationMs: 8000 }
}

const buildQuote = (): MascotMessage => {
  const quote = randomQuote(lastQuoteText.value)
  lastQuoteText.value = quote.text
  return {
    id: nextMascotId(),
    kind: 'quote',
    text: quote.text,
    author: quote.author,
    durationMs: 9500,
  }
}

const buildNudge = (): MascotMessage => {
  const candidates: string[] = []
  const unread = appStore.unreadNotificationCount
  if (unread > 0) {
    candidates.push(
      `Tu as ${unread} notification${unread > 1 ? 's' : ''} non lue${unread > 1 ? 's' : ''}. Je te les garde au chaud.`,
    )
  }
  const hour = new Date().getHours()
  if (hour >= 11 && hour < 14) {
    candidates.push('Pense a une vraie pause dejeuner, le travail attendra sagement.')
  }
  if (hour >= 14 && hour < 18) {
    candidates.push("Coup de mou de l'apres-midi ? Une gorgee d'eau et c'est reparti.")
  }
  if (hour >= 18) {
    candidates.push('La journee touche a sa fin. Bravo pour tout ce que tu as accompli.')
  }
  candidates.push('Etire-toi et redresse le dos une minute, il te remerciera.')
  candidates.push('Respire un grand coup. Tout va bien se passer.')
  candidates.push('Regarde au loin quelques secondes : un peu de repos pour tes yeux.')
  return { id: nextMascotId(), kind: 'nudge', text: pick(candidates), durationMs: 8500 }
}

const buildReminder = (notification: LocalNotification): MascotMessage => {
  const body = notification.body?.trim()
  const text = body ? `${notification.title} : ${body}` : notification.title
  return { id: nextMascotId(), kind: 'reminder', text, durationMs: 13000 }
}

const ambientTick = (): void => {
  // Pas de bavardage si Elodie est masquee, rangee, en sourdine, ou endormie (absence).
  if (!store.enabled || store.tucked || store.muted || sleeping.value) return
  const useNudge = Math.random() < 0.45
  store.enqueue(useNudge ? buildNudge() : buildQuote())
}

const scheduleAmbient = (): void => {
  const delay = PERIOD_MIN_MS + Math.random() * (PERIOD_MAX_MS - PERIOD_MIN_MS)
  periodicTimer = setTimeout(() => {
    ambientTick()
    scheduleAmbient()
  }, delay)
}

const onOwlClick = (): void => {
  // Un clic direct fait toujours reagir Elodie, meme en sourdine.
  const message = Math.random() < 0.7 ? buildQuote() : buildNudge()
  store.enqueue(message, { force: true })
}

const toggleMute = (): void => {
  store.toggleMuted()
}

// Le clic sur l'oeil ne masque plus Elodie : il la range contre le bord droit, d'ou
// seul un oeil depasse. Un clic sur ce bout la fait revenir. (Masquage total : Reglages.)
const onTuck = (): void => {
  hover.value = false
  store.setTucked(true)
  appStore.actionFeedback = 'Elodie se range sur le cote. Cliquez-la pour la faire revenir.'
}

const onShow = (): void => {
  peekHover.value = false
  store.setTucked(false)
}

// Reveille Elodie et rearme le compteur d'inactivite.
const wake = (): void => {
  lastActivity = Date.now()
  if (sleeping.value) sleeping.value = false
}

const onActivity = (): void => {
  wake()
}

const REDUCED_MOTION = (() => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
})()

// Ferme la bulle courante et nettoie le filet de securite.
const dismissCurrent = (): void => {
  if (dismissTimer) {
    clearTimeout(dismissTimer)
    dismissTimer = undefined
  }
  store.dismiss()
}

// La bulle se ferme quand sa barre de progression atteint la fin (evenement `elapsed`).
// Ce minuteur n'est qu'un filet de securite si l'animation ne peut pas signaler sa fin
// (mouvement reduit, fenetre en arriere-plan...).
watch(
  () => store.message,
  (message) => {
    if (dismissTimer) {
      clearTimeout(dismissTimer)
      dismissTimer = undefined
    }
    if (message) {
      // Un rappel joue deja le son de notification (cf. appStore) : pas de chirp en plus,
      // sinon double son. Les autres messages d'Elodie gardent leur petit chirp.
      if (!store.muted && message.kind !== 'reminder') playMascotChirp()
      const safety = message.durationMs + (REDUCED_MOTION ? 0 : 700)
      dismissTimer = setTimeout(dismissCurrent, safety)
    }
  },
)

onMounted(() => {
  const api = window.omnidesk
  if (api?.events?.onReminderFired) {
    stopReminderListener = api.events.onReminderFired((notification) => {
      // Un pense-bete reveille toujours Elodie pour le montrer dans une bulle.
      wake()
      store.enqueue(buildReminder(notification), { force: true })
    })
  }

  for (const event of ACTIVITY_EVENTS) {
    window.addEventListener(event, onActivity, { passive: true })
  }
  idleChecker = setInterval(() => {
    if (!sleeping.value && !store.talking && Date.now() - lastActivity > IDLE_SLEEP_MS) {
      sleeping.value = true
    }
  }, 15_000)

  greetingTimer = setTimeout(() => store.enqueue(buildGreeting()), 2500)
  firstAmbientTimer = setTimeout(() => ambientTick(), 45_000)
  scheduleAmbient()
})

onBeforeUnmount(() => {
  if (dismissTimer) clearTimeout(dismissTimer)
  if (periodicTimer) clearTimeout(periodicTimer)
  if (greetingTimer) clearTimeout(greetingTimer)
  if (firstAmbientTimer) clearTimeout(firstAmbientTimer)
  if (idleChecker) clearInterval(idleChecker)
  for (const event of ACTIVITY_EVENTS) {
    window.removeEventListener(event, onActivity)
  }
  stopReminderListener?.()
})
</script>

<template>
  <div
    v-if="store.enabled"
    class="pointer-events-none fixed z-40 transition-[bottom,right] duration-300 ease-out"
    :class="store.tucked ? 'right-0' : 'right-5'"
    :style="{ bottom: mediaPlayerVisible ? '5rem' : '1.25rem' }"
  >
    <Transition name="omnihoowl-swap" mode="out-in">
      <!-- Etat normal : bulle, chouette et boutons au survol. -->
      <div v-if="!store.tucked" key="full" class="flex max-w-[330px] flex-col items-end gap-2.5">
        <Transition name="omnihoowl-pop">
          <SpeechBubble
            v-if="store.message"
            :key="store.message.id"
            class="pointer-events-auto"
            :kind="store.message.kind"
            :title="store.message.title"
            :text="store.message.text"
            :author="store.message.author"
            :duration-ms="store.message.durationMs"
            @close="dismissCurrent"
            @elapsed="dismissCurrent"
          />
        </Transition>

        <div
          class="pointer-events-auto relative"
          @mouseenter="hover = true"
          @mouseleave="hover = false"
        >
          <Transition name="omnihoowl-fade">
            <div v-if="hover" class="absolute -top-2 left-0 z-10 flex gap-1">
              <button
                type="button"
                class="grid size-6 place-items-center rounded-md bg-ink-800/90 text-zinc-400 ring-1 ring-white/10 transition hover:bg-ink-700 hover:text-zinc-100"
                :title="store.muted ? 'Reactiver le son' : 'Couper le son'"
                @click.stop="toggleMute"
              >
                <VolumeX v-if="store.muted" :size="13" />
                <Volume2 v-else :size="13" />
              </button>
              <button
                type="button"
                class="grid size-6 place-items-center rounded-md bg-ink-800/90 text-zinc-400 ring-1 ring-white/10 transition hover:bg-ink-700 hover:text-zinc-100"
                title="Cacher Elodie sur le cote"
                @click.stop="onTuck"
              >
                <EyeOff :size="13" />
              </button>
            </div>
          </Transition>

          <OwlSprite :talking="store.talking" :sleeping="sleeping" @click="onOwlClick" />
        </div>
      </div>

      <!-- Etat range : Elodie se cache derriere le bord droit, un oeil depasse. -->
      <button
        v-else
        key="tucked"
        type="button"
        class="omnihoowl-peek app-no-drag pointer-events-auto group relative block cursor-pointer overflow-hidden rounded-l-2xl border-0 bg-ink-900/70 p-0 shadow-lg shadow-black/40 outline-none ring-1 ring-inset ring-white/10 backdrop-blur-sm transition-[width] duration-200 ease-out hover:bg-ink-850/85"
        :style="{ width: `${peekWidth}px`, height: `${TUCK_SIZE}px` }"
        aria-label="Faire revenir Elodie"
        title="Faire revenir Elodie"
        @mouseenter="peekHover = true"
        @mouseleave="peekHover = false"
        @click="onShow"
      >
        <OwlSprite
          :style="{ position: 'absolute', top: '0px', left: `${PEEK_OWL_OFFSET}px` }"
          :size="TUCK_SIZE"
          decorative
        />
      </button>
    </Transition>
  </div>
</template>

<style>
.omnihoowl-pop-leave-active {
  transition: opacity 160ms ease-in, transform 160ms ease-in;
}
.omnihoowl-pop-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.96);
}
.omnihoowl-fade-enter-active,
.omnihoowl-fade-leave-active {
  transition: opacity 140ms ease;
}
.omnihoowl-fade-enter-from,
.omnihoowl-fade-leave-to {
  opacity: 0;
}

/* Bascule entre Elodie en grand et sa cachette : glissement vers/depuis le bord droit. */
.omnihoowl-swap-enter-active,
.omnihoowl-swap-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}
.omnihoowl-swap-enter-from,
.omnihoowl-swap-leave-to {
  opacity: 0;
  transform: translateX(14px);
}

/* Au survol de la languette, ses yeux verts s'illuminent pour inviter au clic. */
.omnihoowl-peek:hover .omnihoowl-img {
  filter: drop-shadow(0 0 9px rgb(var(--accent-mint) / 0.5)) drop-shadow(0 10px 18px rgba(0, 0, 0, 0.45));
}

@media (prefers-reduced-motion: reduce) {
  .omnihoowl-swap-enter-active,
  .omnihoowl-swap-leave-active {
    transition: opacity 180ms ease;
  }
  .omnihoowl-swap-enter-from,
  .omnihoowl-swap-leave-to {
    transform: none;
  }
}
</style>
