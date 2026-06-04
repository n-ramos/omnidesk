import { EventEmitter } from 'node:events'
import type {
  LocalNotification,
  OmnichatCallActiveEvent,
  OmnichatCallRingEvent,
  OmnichatCallStateEvent,
  OmnichatConnectionEvent,
  OmnichatGroupEvent,
  OmnichatMessageEvent,
  OmnichatPresenceEvent,
  OmnichatReactionEvent,
  OmnichatReceiptEvent,
  OmnichatTypingEvent,
} from '@shared/models'
import type {
  AiChunkEvent,
  AiConfirmRequestEvent,
  AiDoneEvent,
  AiErrorEvent,
  AiToolEndEvent,
  AiToolStartEvent,
} from '@shared/ai'
import type { AuthStatus } from '@shared/auth'

interface AppEventMap {
  'notification:created': LocalNotification
  'reminder:fired': LocalNotification
  'sync:requested': { accountId: string }
  'sync:completed': { accountId: string; conversations: number; messages: number }
  'omnichat:connection': OmnichatConnectionEvent
  'omnichat:message': OmnichatMessageEvent
  'omnichat:presence': OmnichatPresenceEvent
  'omnichat:group': OmnichatGroupEvent
  'omnichat:typing': OmnichatTypingEvent
  'omnichat:receipt': OmnichatReceiptEvent
  'omnichat:call-ring': OmnichatCallRingEvent
  'omnichat:call-state': OmnichatCallStateEvent
  'omnichat:reaction': OmnichatReactionEvent
  'omnichat:call-active': OmnichatCallActiveEvent
  // Coffre omniPass : la cle maitre a ete purgee de la memoire (verrouillage manuel ou auto).
  'passvault:locked': { reason: 'manual' | 'timeout' }
  'passvault:unlocked': Record<string, never>
  // Assistant IA : streaming de la reponse (cf. aiAgent).
  'ai:chunk': AiChunkEvent
  'ai:done': AiDoneEvent
  'ai:error': AiErrorEvent
  'ai:tool-start': AiToolStartEvent
  'ai:tool-end': AiToolEndEvent
  'ai:confirm-request': AiConfirmRequestEvent
  // Accueil personnalise modifie par l'IA (widgets/config) -> le renderer recharge la disposition.
  'home:updated': Record<string, never>
  // Session du compte OmniProxy (mode accounts) : etat de connexion change (login,
  // logout, refresh, purge sur refresh invalide) -> le renderer met a jour le gate.
  'account:session': AuthStatus
}

type AppEventName = keyof AppEventMap

class TypedEventBus {
  private readonly emitter = new EventEmitter()

  on<EventName extends AppEventName>(
    eventName: EventName,
    listener: (payload: AppEventMap[EventName]) => void,
  ): () => void {
    this.emitter.on(eventName, listener)
    return () => this.emitter.off(eventName, listener)
  }

  emit<EventName extends AppEventName>(eventName: EventName, payload: AppEventMap[EventName]): void {
    this.emitter.emit(eventName, payload)
  }
}

export const eventBus = new TypedEventBus()
