import os from 'node:os'
import { AppError } from '@shared/errors'
import type { OmnichatTokenResult } from '@shared/ipc'
import { accountAuthService } from '@main/account/accountAuthService'
import { omniProxyClient } from '@main/proxy/omniProxyClient'

// Les appels utilisent des salles ad-hoc (omnichat:call:<uuid>) decorrelees des
// conversations. L'acces est autorise par OmniProxy (hote/invites uniquement), donc
// connaitre l'id de salle ne suffit pas a rejoindre. Identite LiveKit = email du
// compte connecte (impose par OmniProxy via le JWT du champ `auth`).
const CALL_ROOM_PREFIX = 'omnichat:call:'

export class OmnichatService {
  private ensureConfigured(): void {
    if (!omniProxyClient.isConfigured()) {
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        "L'omnichat necessite OmniProxy. Configurez OMNIDESK_PROXY_URL pour activer les appels.",
      )
    }
  }

  // Identite LiveKit = email du compte connecte. OmniProxy l'exige (403 IDENTITY_INVALID
  // si `identity` != email du jeton) : aucun appel possible sans session active.
  private livekitIdentity(): string {
    const email = accountAuthService.currentEmail()
    if (!email) {
      throw new AppError('ACCOUNT_NOT_AUTHENTICATED', 'Connectez-vous pour passer un appel.')
    }
    return email
  }

  private livekitName(): string {
    return accountAuthService.currentDisplayName() || os.userInfo().username || 'Invite'
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
