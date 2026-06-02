// Sons de l'app charges comme assets Vite (mp3). Les sonneries d'appel bouclent ;
// le son de notification est joue une fois. Joues cote renderer (et non via la
// notif native macOS, qui ne sait pas lire un mp3 arbitraire) : volume controlable
// et fonctionne aussi fenetre en arriere-plan.
import incomingUrl from '@renderer/assets/sounds/incoming-call.mp3'
import outgoingUrl from '@renderer/assets/sounds/outgoing-call.mp3'
import notificationUrl from '@renderer/assets/sounds/notification.mp3'
import connectedUrl from '@renderer/assets/sounds/call-connected.mp3'
import endedUrl from '@renderer/assets/sounds/call-ended.mp3'

// Securite : on coupe la sonnerie entrante au bout de ce delai meme sans signal
// d'arret (au cas ou la signalisation de fin d'appel n'arrive jamais).
const MAX_INCOMING_RING_MS = 35_000

const makeLoop = (src: string): HTMLAudioElement => {
  const audio = new Audio(src)
  audio.loop = true
  return audio
}

const incomingRingtone = makeLoop(incomingUrl)
const outgoingRingback = makeLoop(outgoingUrl)
const notificationSound = new Audio(notificationUrl)
const callConnectedSound = new Audio(connectedUrl)
const callEndedSound = new Audio(endedUrl)

let incomingSafetyTimer: ReturnType<typeof setTimeout> | null = null

const restart = (audio: HTMLAudioElement): void => {
  try {
    audio.currentTime = 0
  } catch {
    // currentTime peut lever si la piste n'est pas encore prete : sans gravite.
  }
  void audio.play().catch(() => {
    // Lecture refusee (rare en Electron, autoplay autorise par defaut) : on ignore.
  })
}

const stop = (audio: HTMLAudioElement): void => {
  audio.pause()
  try {
    audio.currentTime = 0
  } catch {
    // idem restart()
  }
}

/** Coupe la sonnerie d'appel entrant. */
export const stopIncomingRingtone = (): void => {
  if (incomingSafetyTimer !== null) {
    clearTimeout(incomingSafetyTimer)
    incomingSafetyTimer = null
  }
  stop(incomingRingtone)
}

/** Sonnerie d'appel entrant, en boucle (garde-fou auto au bout de 35 s). */
export const playIncomingRingtone = (): void => {
  if (incomingSafetyTimer !== null) {
    clearTimeout(incomingSafetyTimer)
  }
  restart(incomingRingtone)
  incomingSafetyTimer = setTimeout(stopIncomingRingtone, MAX_INCOMING_RING_MS)
}

/** Tonalite d'appel sortant (ringback), en boucle tant que le pair n'a pas rejoint. */
export const playOutgoingRingback = (): void => restart(outgoingRingback)
export const stopOutgoingRingback = (): void => stop(outgoingRingback)

/** Son de notification (hors mascotte Elodie), joue une fois. */
export const playNotificationSound = (): void => restart(notificationSound)

/** Son de decroche : l'appel vient de se connecter (un pair a rejoint). Joue une fois. */
export const playCallConnectedSound = (): void => restart(callConnectedSound)

/** Son de raccroche : l'appel vient de se terminer. Joue une fois. */
export const playCallEndedSound = (): void => restart(callEndedSound)
