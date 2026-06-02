import { EventEmitter } from 'node:events'
import type {
  LocalNotification,
  OmnichatCallRingEvent,
  OmnichatCallStateEvent,
  OmnichatConnectionEvent,
  OmnichatGroupEvent,
  OmnichatMessageEvent,
  OmnichatPresenceEvent,
  OmnichatReceiptEvent,
  OmnichatTypingEvent,
} from '@shared/models'

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
  // Coffre omniPass : la cle maitre a ete purgee de la memoire (verrouillage manuel ou auto).
  'passvault:locked': { reason: 'manual' | 'timeout' }
  'passvault:unlocked': Record<string, never>
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
