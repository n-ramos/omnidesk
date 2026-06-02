import os from 'node:os'
import { randomUUID } from 'node:crypto'
import type { Database } from 'better-sqlite3'
import { AppError } from '@shared/errors'
import type { OmnichatTokenResult } from '@shared/ipc'
import { AppSettingsRepository } from '@main/database/repositories/appSettingsRepository'
import { OmnichatIdentityService } from '@main/omnichat/omnichatIdentityService'
import { omniProxyClient } from '@main/proxy/omniProxyClient'

// Les appels utilisent des salles ad-hoc (omnichat:call:<uuid>) decorrelees des
// conversations. L'acces est autorise par OmniProxy (hote/invites uniquement), donc
// connaitre l'id de salle ne suffit pas a rejoindre. Identite LiveKit = identite
// omnichat si definie, sinon UUID de poste stable et persistant.
const IDENTITY_KEY = 'omnichatIdentity'
const CALL_ROOM_PREFIX = 'omnichat:call:'

export class OmnichatService {
  private readonly settings: AppSettingsRepository
  private readonly identityService: OmnichatIdentityService

  constructor(db: Database) {
    this.settings = new AppSettingsRepository(db)
    this.identityService = new OmnichatIdentityService(db)
  }

  private ensureConfigured(): void {
    if (!omniProxyClient.isConfigured()) {
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        "L'omnichat necessite OmniProxy. Configurez OMNIDESK_PROXY_URL pour activer les appels.",
      )
    }
  }

  // Identite LiveKit : identite omnichat (id) si choisie, sinon un UUID de poste stable
  // (genere et persiste une fois). Doit correspondre a l'identite prouvee par HMAC quand
  // la signature OmniProxy est active (cf. audit S6).
  private livekitIdentity(): string {
    const existing = this.settings.get<string>(IDENTITY_KEY)
    const fallback = existing ?? randomUUID()
    if (!existing) {
      this.settings.set<string>(IDENTITY_KEY, fallback)
    }
    return this.identityService.peek()?.id ?? fallback
  }

  private livekitName(): string {
    return this.identityService.peek()?.pseudo || os.userInfo().username || 'Invite'
  }

  // Jeton LiveKit pour rejoindre la salle d'un appel ad-hoc. Le proxy (autorite) ne
  // mint que pour l'hote/les invites de CET appel : connaitre la salle ne suffit pas.
  async getCallToken(callId: string, room: string): Promise<OmnichatTokenResult> {
    this.ensureConfigured()
    if (!room.startsWith(CALL_ROOM_PREFIX)) {
      throw new AppError('PROVIDER_UNAVAILABLE', "Salle d'appel invalide.")
    }
    const identity = this.livekitIdentity()
    const minted = await omniProxyClient.callToken({ callId, room, identity, name: this.livekitName() })
    return { url: minted.url, token: minted.token, roomName: minted.room, identity }
  }

  async startRecording(callId: string, room: string): Promise<{ egressId: string }> {
    this.ensureConfigured()
    return omniProxyClient.startRecording(callId, room, this.livekitIdentity())
  }

  async stopRecording(egressId: string): Promise<{ ok: true }> {
    this.ensureConfigured()
    return omniProxyClient.stopRecording(egressId, this.livekitIdentity())
  }

  // Indique si les appels sont utilisables (proxy configure). Sert au renderer a afficher
  // l'etat sans tenter un appel voue a echouer.
  isAvailable(): boolean {
    return omniProxyClient.isConfigured()
  }
}
