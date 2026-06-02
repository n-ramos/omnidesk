import { nextTick, reactive } from 'vue'
import { Room, RoomEvent, Track, type Participant, type RemoteTrack } from 'livekit-client'
import {
  playOutgoingRingback,
  stopOutgoingRingback,
  playCallConnectedSound,
  playCallEndedSound,
} from '@renderer/utils/sounds'

export type CallVideoSource = 'camera' | 'screen'

export interface CallTile {
  key: string
  identity: string
  name: string
  isLocal: boolean
  source: CallVideoSource
}

export interface CallRosterEntry {
  identity: string
  name: string
  isLocal: boolean
  micOn: boolean
  cameraOn: boolean
  speaking: boolean
}

interface OmnichatState {
  active: boolean
  connecting: boolean
  // Appel ad-hoc : identifiant + salle propres a l'appel (decorreles des conversations).
  callId: string | null
  room: string | null
  title: string
  // Invites a qui le ring a ete envoye mais qui n'ont pas encore rejoint la salle.
  pendingInvites: string[]
  error: string | null
  micOn: boolean
  cameraOn: boolean
  screenShareOn: boolean
  recording: boolean
  recordingBusy: boolean
  tiles: CallTile[]
  roster: CallRosterEntry[]
}

const createState = (): OmnichatState => ({
  active: false,
  connecting: false,
  callId: null,
  room: null,
  title: '',
  pendingInvites: [],
  error: null,
  micOn: false,
  cameraOn: false,
  screenShareOn: false,
  recording: false,
  recordingBusy: false,
  tiles: [],
  roster: [],
})

const state = reactive<OmnichatState>(createState())

// Objets LiveKit gardes HORS de la reactivite Vue (ce sont des instances de
// classes complexes ; les rendre reactifs casserait leur fonctionnement).
let room: Room | null = null
let recordingEgressId: string | null = null
const videoTracks = new Map<string, Track>() // tile.key -> piste video (camera/screen)
const videoEls = new Map<string, HTMLVideoElement>() // tile.key -> <video> monte
const audioEls = new Map<string, HTMLMediaElement>() // trackSid -> <audio> cache

const tileKey = (identity: string, source: CallVideoSource): string => `${identity}:${source}`

// Deconnexion auto apres 5 min sans activite audio (personne ne parle).
const INACTIVITY_LIMIT_MS = 5 * 60 * 1000
const INACTIVITY_CHECK_MS = 15 * 1000
let lastAudioActivityAt = 0
let inactivityTimer: ReturnType<typeof setInterval> | null = null

const noteAudioActivity = (): void => {
  lastAudioActivityAt = Date.now()
}

const startInactivityWatch = (): void => {
  noteAudioActivity()
  if (inactivityTimer !== null) {
    return
  }
  inactivityTimer = setInterval(() => {
    if (!room) {
      return
    }
    // Quelqu'un parle (ou a parle dans l'intervalle) : on repousse l'echeance.
    if (room.activeSpeakers.length > 0) {
      noteAudioActivity()
      return
    }
    if (Date.now() - lastAudioActivityAt >= INACTIVITY_LIMIT_MS) {
      void leave()
    }
  }, INACTIVITY_CHECK_MS)
}

const stopInactivityWatch = (): void => {
  if (inactivityTimer !== null) {
    clearInterval(inactivityTimer)
    inactivityTimer = null
  }
}

const toMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "L'appel a echoue."

const api = () => {
  if (!window.omnidesk) {
    throw new Error('API Omnidesk indisponible.')
  }
  return window.omnidesk
}

const resetState = (): void => {
  Object.assign(state, createState())
}

const collectParticipants = (): Participant[] => {
  if (!room) {
    return []
  }
  return [room.localParticipant, ...room.remoteParticipants.values()]
}

// Recalcule tuiles + roster a partir de l'etat courant de la room, et met a jour
// la table des pistes video a attacher.
const syncFromRoom = (): void => {
  if (!room) {
    return
  }

  const tiles: CallTile[] = []
  const roster: CallRosterEntry[] = []
  const liveKeys = new Set<string>()

  for (const participant of collectParticipants()) {
    const isLocal = participant === room.localParticipant
    const name = participant.name || participant.identity

    const cameraPub = participant.getTrackPublication(Track.Source.Camera)
    const cameraTrack = cameraPub?.track
    const cameraOn = Boolean(cameraTrack && !cameraPub?.isMuted)
    if (cameraTrack && cameraOn) {
      const key = tileKey(participant.identity, 'camera')
      videoTracks.set(key, cameraTrack)
      liveKeys.add(key)
      tiles.push({ key, identity: participant.identity, name, isLocal, source: 'camera' })
    }

    const screenPub = participant.getTrackPublication(Track.Source.ScreenShare)
    const screenTrack = screenPub?.track
    if (screenTrack) {
      const key = tileKey(participant.identity, 'screen')
      videoTracks.set(key, screenTrack)
      liveKeys.add(key)
      tiles.push({ key, identity: participant.identity, name, isLocal, source: 'screen' })
    }

    const micPub = participant.getTrackPublication(Track.Source.Microphone)
    roster.push({
      identity: participant.identity,
      name,
      isLocal,
      micOn: Boolean(micPub && !micPub.isMuted),
      cameraOn,
      speaking: participant.isSpeaking,
    })
  }

  // Oublie les pistes video disparues.
  for (const key of [...videoTracks.keys()]) {
    if (!liveKeys.has(key)) {
      videoTracks.delete(key)
    }
  }

  state.tiles = tiles
  state.roster = roster

  const local = room.localParticipant
  state.micOn = Boolean(local.getTrackPublication(Track.Source.Microphone)?.track
    && !local.getTrackPublication(Track.Source.Microphone)?.isMuted)
  state.cameraOn = Boolean(local.getTrackPublication(Track.Source.Camera)?.track
    && !local.getTrackPublication(Track.Source.Camera)?.isMuted)
  state.screenShareOn = Boolean(local.getTrackPublication(Track.Source.ScreenShare)?.track)
}

const reattachVideo = (): void => {
  for (const [key, el] of videoEls) {
    const track = videoTracks.get(key)
    if (track) {
      track.attach(el)
    }
  }
}

const scheduleSync = (): void => {
  syncFromRoom()
  void nextTick(reattachVideo)
}

// Pistes audio distantes : on les attache a des elements <audio> caches pour les
// entendre. On n'attache jamais l'audio local (pas d'echo).
const attachAudio = (track: RemoteTrack): void => {
  if (track.kind !== Track.Kind.Audio || !track.sid) {
    return
  }
  const element = track.attach()
  element.style.display = 'none'
  document.body.appendChild(element)
  audioEls.set(track.sid, element)
}

const detachAudio = (track: RemoteTrack): void => {
  if (!track.sid) {
    return
  }
  const element = audioEls.get(track.sid)
  if (element) {
    track.detach(element)
    element.remove()
    audioEls.delete(track.sid)
  }
}

const teardownMedia = (): void => {
  for (const element of audioEls.values()) {
    element.remove()
  }
  audioEls.clear()
  videoTracks.clear()
  videoEls.clear()
}

const wireEvents = (target: Room): void => {
  target
    .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        attachAudio(track)
      } else {
        scheduleSync()
      }
    })
    .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        detachAudio(track)
      } else {
        scheduleSync()
      }
    })
    .on(RoomEvent.LocalTrackPublished, scheduleSync)
    .on(RoomEvent.LocalTrackUnpublished, scheduleSync)
    .on(RoomEvent.ParticipantConnected, (participant: Participant) => {
      // Un invite a rejoint : appel connecte -> on coupe le ringback, on joue le son de
      // decroche, et on le retire des invitations en attente.
      stopOutgoingRingback()
      playCallConnectedSound()
      state.pendingInvites = state.pendingInvites.filter(
        (id) => id.toLowerCase() !== participant.identity.toLowerCase(),
      )
      scheduleSync()
    })
    .on(RoomEvent.ParticipantDisconnected, () => {
      scheduleSync()
      // Si on se retrouve VRAIMENT seul (plus aucun participant distant ET aucune
      // invitation en attente), on raccroche aussi (1-a-1 : l'autre a quitte/raccroche).
      // Demarrer seul n'est pas affecte (aucun evenement de depart) ; tant qu'on attend
      // des invites (pending) on reste.
      if (room && room.remoteParticipants.size === 0 && state.pendingInvites.length === 0) {
        void leave()
      }
    })
    .on(RoomEvent.TrackMuted, scheduleSync)
    .on(RoomEvent.TrackUnmuted, scheduleSync)
    .on(RoomEvent.ActiveSpeakersChanged, () => {
      noteAudioActivity()
      scheduleSync()
    })
    .on(RoomEvent.Disconnected, () => {
      // Fin d'appel (raccroche manuel, depart du pair ou inactivite) : point de
      // passage unique pour jouer le son de raccroche.
      stopInactivityWatch()
      stopOutgoingRingback()
      playCallEndedSound()
      teardownMedia()
      room = null
      resetState()
    })
}

const stopRecordingIfAny = async (): Promise<void> => {
  if (!recordingEgressId) {
    return
  }
  const egressId = recordingEgressId
  recordingEgressId = null
  try {
    await api().omnichat.stopRecording(egressId)
  } catch {
    // L'egress s'arrete de toute facon quand la room se vide cote serveur.
  }
}

// Connexion bas-niveau a une salle d'appel (jeton obtenu via getCallToken). `ringback`
// = on attend que des invites decrochent (sonnerie). Renvoie true si connecte.
const connectToRoom = async (
  callId: string,
  roomName: string,
  title: string,
  ringback: boolean,
): Promise<boolean> => {
  if (state.active || state.connecting) {
    return false
  }
  state.connecting = true
  state.error = null
  state.callId = callId
  state.room = roomName
  state.title = title

  try {
    const { url, token } = await api().omnichat.getCallToken(callId, roomName)
    const next = new Room({ adaptiveStream: true, dynacast: true })
    wireEvents(next)
    await next.connect(url, token)
    room = next
    state.active = true

    // On rejoint micro ouvert, camera fermee (comportement le moins intrusif).
    await next.localParticipant.setMicrophoneEnabled(true)
    scheduleSync()
    startInactivityWatch()
    if (ringback && next.remoteParticipants.size === 0) {
      // On attend que les invites decrochent.
      playOutgoingRingback()
    } else if (next.remoteParticipants.size > 0) {
      // On rejoint un appel deja peuple -> son de decroche.
      playCallConnectedSound()
    }
    return true
  } catch (error) {
    state.error = toMessage(error)
    if (room) {
      await room.disconnect()
    }
    room = null
    teardownMedia()
    const message = state.error
    resetState()
    state.error = message
    return false
  } finally {
    state.connecting = false
  }
}

// Invite (ou ajoute) quelqu'un a l'appel en cours. Ringback seulement si on etait seul
// (on n'entend pas deja d'autres participants).
const addParticipant = async (
  userId: string,
  media: 'audio' | 'video' = 'audio',
): Promise<void> => {
  const callId = state.callId
  const roomName = state.room
  if (!room || !callId || !roomName) {
    return
  }
  const wasAlone = room.remoteParticipants.size === 0
  if (!state.pendingInvites.includes(userId)) {
    state.pendingInvites = [...state.pendingInvites, userId]
  }
  try {
    await api().omnichat.callInvite({ callId, room: roomName, userId, media })
    if (wasAlone) {
      playOutgoingRingback()
    }
  } catch (error) {
    state.error = toMessage(error)
    state.pendingInvites = state.pendingInvites.filter((id) => id !== userId)
  }
}

// Demarre un appel ad-hoc : nouvelle salle propre, puis on invite (eventuellement) des
// pairs un par un. Demarrer seul (sans invite) est permis (on ajoute ensuite).
const startCall = async (opts: {
  media?: 'audio' | 'video'
  inviteUserIds?: string[]
  title?: string
}): Promise<void> => {
  const callId = crypto.randomUUID()
  const roomName = `omnichat:call:${callId}`
  const invites = opts.inviteUserIds ?? []
  const ok = await connectToRoom(callId, roomName, opts.title ?? 'Appel', invites.length > 0)
  if (!ok) {
    return
  }
  for (const userId of invites) {
    await addParticipant(userId, opts.media ?? 'audio')
  }
}

// Rejoint un appel ad-hoc existant (sur invitation recue).
const acceptCall = async (opts: { callId: string; room: string; title?: string }): Promise<void> => {
  await connectToRoom(opts.callId, opts.room, opts.title ?? 'Appel', false)
}

// Un invite a refuse/quitte la sonnerie : on le retire des invitations en attente et,
// s'il ne reste personne a faire sonner (salle vide), on coupe le ringback sortant.
const handleInviteResolved = (userId: string): void => {
  state.pendingInvites = state.pendingInvites.filter(
    (id) => id.toLowerCase() !== userId.toLowerCase(),
  )
  if (state.pendingInvites.length === 0 && (!room || room.remoteParticipants.size === 0)) {
    stopOutgoingRingback()
  }
}

const leave = async (): Promise<void> => {
  // Si on raccroche alors que des invites sonnent encore, on les annule : leur appel
  // entrant se ferme (de l'autre cote, ca raccroche aussi).
  const callId = state.callId
  if (callId) {
    for (const userId of state.pendingInvites) {
      void window.omnidesk?.omnichat.callCancel(userId, callId)
    }
  }
  stopOutgoingRingback()
  stopInactivityWatch()
  await stopRecordingIfAny()
  if (room) {
    await room.disconnect()
  }
  room = null
  teardownMedia()
  resetState()
}

const toggleMic = async (): Promise<void> => {
  if (!room) {
    return
  }
  await room.localParticipant.setMicrophoneEnabled(!state.micOn)
  scheduleSync()
}

const toggleCamera = async (): Promise<void> => {
  if (!room) {
    return
  }
  try {
    await room.localParticipant.setCameraEnabled(!state.cameraOn)
  } catch (error) {
    state.error = toMessage(error)
  }
  scheduleSync()
}

const toggleScreenShare = async (): Promise<void> => {
  if (!room) {
    return
  }
  try {
    await room.localParticipant.setScreenShareEnabled(!state.screenShareOn)
  } catch (error) {
    // L'utilisateur a pu annuler le selecteur de fenetre : pas une vraie erreur.
    state.error = toMessage(error)
  }
  scheduleSync()
}

const toggleRecording = async (): Promise<void> => {
  const callId = state.callId
  const roomName = state.room
  if (!callId || !roomName || state.recordingBusy) {
    return
  }
  state.recordingBusy = true
  try {
    if (state.recording) {
      await stopRecordingIfAny()
      state.recording = false
    } else {
      const { egressId } = await api().omnichat.startRecording(callId, roomName)
      recordingEgressId = egressId
      state.recording = true
    }
  } catch (error) {
    state.error = toMessage(error)
  } finally {
    state.recordingBusy = false
  }
}

// Ref callback du <video> de chaque tuile : attache (ou detache) la piste.
const bindVideo = (key: string, element: HTMLVideoElement | null): void => {
  if (element) {
    videoEls.set(key, element)
    const track = videoTracks.get(key)
    if (track) {
      track.attach(element)
    }
    return
  }

  const existing = videoEls.get(key)
  const track = videoTracks.get(key)
  if (existing && track) {
    track.detach(existing)
  }
  videoEls.delete(key)
}

export const useOmnichat = () => ({
  state,
  startCall,
  acceptCall,
  addParticipant,
  handleInviteResolved,
  leave,
  toggleMic,
  toggleCamera,
  toggleScreenShare,
  toggleRecording,
  bindVideo,
})
