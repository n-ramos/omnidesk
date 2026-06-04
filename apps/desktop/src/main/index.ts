import { app, BrowserWindow, desktopCapturer, dialog, Menu, powerMonitor, protocol, screen, session, shell } from 'electron'
import { join } from 'node:path'
import { electronApp, is } from '@electron-toolkit/utils'
import { appConfig } from '@main/config/env'
import { installAppMenu } from '@main/appMenu'
import { databaseClient } from '@main/database/client'
import { eventBus } from '@main/events/eventBus'
import { registerIpcHandlers } from '@main/ipc/registerIpcHandlers'
import { logger } from '@main/logger'
import { NativeNotificationService } from '@main/notifications/nativeNotifications'
import { signalingClient } from '@main/omnichat/signalingClient'
import { accountAuthService } from '@main/account/accountAuthService'
import { ReminderScheduler } from '@main/reminders/reminderScheduler'
import { PassVaultService } from '@main/omnipass/passVaultService'
import { SyncEngine } from '@main/sync/syncEngine'
import { warnIfDiskUnencrypted } from '@main/security/diskEncryption'
import { autoUpdate } from '@main/update/autoUpdater'
import { PRELOAD_EVENTS } from '@shared/ipc'
import type { GithubLinkEvent } from '@shared/github'

let mainWindow: BrowserWindow | null = null
const syncEngine = new SyncEngine()
const nativeNotifications = new NativeNotificationService()
let reminderScheduler: ReminderScheduler | undefined
let passVaultService: PassVaultService | undefined
let stopNativeNotificationsBridge: (() => void) | undefined
let stopSyncBridge: (() => void) | undefined
let stopReminderBridge: (() => void) | undefined
let stopOmnichatConnectionBridge: (() => void) | undefined
let stopOmnichatMessageBridge: (() => void) | undefined
let stopOmnichatPresenceBridge: (() => void) | undefined
let stopOmnichatGroupBridge: (() => void) | undefined
let stopOmnichatTypingBridge: (() => void) | undefined
let stopOmnichatReceiptBridge: (() => void) | undefined
let stopOmnichatCallRingBridge: (() => void) | undefined
let stopOmnichatCallStateBridge: (() => void) | undefined
let stopOmnichatReactionBridge: (() => void) | undefined
let stopOmnichatCallActiveBridge: (() => void) | undefined
let stopPassvaultLockedBridge: (() => void) | undefined
let stopAiChunkBridge: (() => void) | undefined
let stopAiDoneBridge: (() => void) | undefined
let stopAiErrorBridge: (() => void) | undefined
let stopAiToolStartBridge: (() => void) | undefined
let stopAiToolEndBridge: (() => void) | undefined
let stopAiConfirmRequestBridge: (() => void) | undefined
let stopHomeUpdatedBridge: (() => void) | undefined
let stopAccountSessionBridge: (() => void) | undefined
let stopGithubLinkBridge: (() => void) | undefined
let pendingGithubLinkEvent: GithubLinkEvent | undefined
// Id du rebond du dock macOS declenche par un appel entrant (annule a la fin).
let incomingCallBounceId: number | null = null

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: appConfig.OMNIDESK_APP_PROTOCOL,
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: false,
    },
  },
])

let cachedWebviewUserAgent: string | null = null

// L'UA par defaut d'Electron contient les jetons "<AppName>/x.y.z" et "Electron/x.y.z".
// Plusieurs services (Deezer notamment) lisent navigator.userAgent, ne reconnaissent pas
// ces jetons et bloquent la page avec un message "navigateur trop ancien". On les retire
// pour que les pages embarquees voient une UA Chrome standard. La version Chrome reelle est
// conservee, donc l'UA reste coherente avec le moteur embarque.
const getWebviewUserAgent = (): string => {
  if (cachedWebviewUserAgent === null) {
    cachedWebviewUserAgent = app.userAgentFallback
      .replace(/(\(KHTML, like Gecko\)) [^ ]+\/[^ ]+ (Chrome\/)/, '$1 $2')
      .replace(/ Electron\/[^ ]+/, '')
      .replace(/ {2,}/g, ' ')
      .trim()
  }
  return cachedWebviewUserAgent
}

// Permissions media : micro, camera et capture d'ecran ne sont accordes QU'AU
// renderer de l'app (l'omnichat). Les <webview> embarquent des sites tiers
// (OmniBrowser, pages epinglees) : on ne leur ouvre jamais les peripheriques.
// Les autres permissions gardent un comportement permissif (parite avec l'absence
// de handler precedente, sans toucher au media).
const CAPTURE_PERMISSIONS = new Set(['media', 'audioCapture', 'videoCapture', 'display-capture'])

const isAppWebContents = (contents: Electron.WebContents | null | undefined): boolean =>
  Boolean(contents && mainWindow && contents.id === mainWindow.webContents.id)

const isAppFrame = (frame: Electron.WebFrameMain | null | undefined): boolean => {
  const main = mainWindow?.webContents.mainFrame
  return Boolean(
    frame && main && frame.processId === main.processId && frame.routingId === main.routingId,
  )
}

const refocusMainWindow = (): void => {
  if (!mainWindow) {
    return
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }
  mainWindow.focus()
}

// Regles de permission communes a une session : micro/camera/capture restent reserves au
// renderer de l'app (isAppWebContents), tout le reste -- dont 'notifications' -- est accorde.
const applySessionPermissionHandlers = (ses: Electron.Session): void => {
  ses.setPermissionRequestHandler((contents, permission, callback) => {
    if (CAPTURE_PERMISSIONS.has(permission)) {
      callback(isAppWebContents(contents))
      return
    }
    callback(true)
  })

  ses.setPermissionCheckHandler((contents, permission) => {
    if (CAPTURE_PERMISSIONS.has(permission)) {
      return isAppWebContents(contents)
    }
    return true
  })
}

const setupMediaPermissions = (): void => {
  applySessionPermissionHandlers(session.defaultSession)

  // Les <webview> (pages epinglees Slack/Teams/Outlook, onglets OmniBrowser) tournent sur des
  // sessions de partition isolees (persist:webpage-<id>...) qui n'heritent PAS des handlers de
  // la defaultSession. Sans handler explicite, l'octroi de 'notifications' est incertain et la
  // page ne peut pas emettre ses notifications web (donc rien a capter pour le pont). On rejoue
  // donc les memes regles sur chaque session creee ensuite -- le micro/camera y restent refuses
  // car isAppWebContents est faux pour ces guests.
  app.on('session-created', (ses) => {
    if (ses !== session.defaultSession) {
      applySessionPermissionHandlers(ses)
    }
  })

  // Partage d'ecran : seul le renderer de l'app peut capturer. Sur macOS recent,
  // useSystemPicker affiche le selecteur natif ; sinon on retombe sur la premiere
  // source via desktopCapturer. Repondre {} revient a refuser la capture.
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      if (!isAppFrame(request.frame)) {
        callback({})
        return
      }
      desktopCapturer
        .getSources({ types: ['screen', 'window'] })
        .then((sources) => {
          const primary = sources[0]
          callback(primary ? { video: primary } : {})
        })
        .catch(() => callback({}))
    },
    { useSystemPicker: true },
  )
}

const createMainWindow = (): void => {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize
  const isMac = process.platform === 'darwin'
  const initialWidth = isMac
    ? screenWidth
    : Math.min(screenWidth, Math.max(1080, Math.floor(screenWidth * 0.94)))
  const initialHeight = isMac
    ? screenHeight
    : Math.min(screenHeight, Math.max(780, Math.floor(screenHeight * 0.95)))

  mainWindow = new BrowserWindow({
    center: true,
    width: initialWidth,
    height: initialHeight,
    minWidth: 820,
    minHeight: 640,
    useContentSize: true,
    backgroundColor: '#08090b',
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 14, y: 14 } : undefined,
    title: 'Omnidesk',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    if (pendingGithubLinkEvent) {
      mainWindow?.webContents.send(PRELOAD_EVENTS.GITHUB_LINK, pendingGithubLinkEvent)
      pendingGithubLinkEvent = undefined
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (is.dev && url.startsWith('http://localhost')) {
      return
    }

    event.preventDefault()
    void shell.openExternal(url)
  })

  mainWindow.webContents.on('will-attach-webview', (_event, webPreferences, params) => {
    delete webPreferences.preload
    Reflect.deleteProperty(webPreferences as Record<string, unknown>, 'preloadURL')
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    // La webview hote des DevTools n'affiche que l'UI DevTools (pas de contenu web) :
    // le sandbox y empeche le rendu du frontend, on le relache uniquement pour elle.
    webPreferences.sandbox = params.partition !== 'omnibrowser-devtools'
    webPreferences.webSecurity = true
    webPreferences.allowRunningInsecureContent = false

    // Couvre la toute premiere requete de navigation avec une UA Chrome propre.
    ;(params as Record<string, string>).useragent = getWebviewUserAgent()

    if (typeof params.src === 'string') {
      try {
        const target = new URL(params.src)
        if (target.protocol !== 'https:' && target.protocol !== 'http:') {
          params.src = 'about:blank'
        }
      } catch {
        params.src = 'about:blank'
      }
    }
  })

  mainWindow.webContents.on('did-attach-webview', (_event, webContents) => {
    // Garantit que navigator.userAgent est propre avant l'execution du JS de la page,
    // y compris si l'attribut useragent n'a pas ete pris en compte au moment de l'attache.
    webContents.setUserAgent(getWebviewUserAgent())

    webContents.setWindowOpenHandler(({ url }) => {
      try {
        const target = new URL(url)
        if (target.protocol === 'https:' || target.protocol === 'http:') {
          // On delegue au renderer : il sait si la source est un onglet OmniBrowser
          // (=> nouvel onglet) ou une page web epinglee (=> chargement en place).
          mainWindow?.webContents.send(PRELOAD_EVENTS.OMNIBROWSER_OPEN_TAB, {
            sourceWebContentsId: webContents.id,
            url,
          })
        }
      } catch {
        // URL invalide, on refuse silencieusement.
      }
      return { action: 'deny' }
    })

    // Menu contextuel de la PAGE (webContents du guest) : les DevTools ouvertes ici
    // inspectent la page web Chromium, jamais l'app Electron hote.
    webContents.on('context-menu', (_event, params) => {
      const template: Electron.MenuItemConstructorOptions[] = []

      if (params.linkURL) {
        template.push({
          label: 'Ouvrir le lien dans un nouvel onglet',
          click: () => {
            mainWindow?.webContents.send(PRELOAD_EVENTS.OMNIBROWSER_OPEN_TAB, {
              sourceWebContentsId: webContents.id,
              url: params.linkURL,
            })
          },
        })
        template.push({ type: 'separator' })
      }

      if (params.isEditable) {
        template.push({ label: 'Couper', enabled: params.editFlags.canCut, click: () => webContents.cut() })
        template.push({ label: 'Copier', enabled: params.editFlags.canCopy, click: () => webContents.copy() })
        template.push({ label: 'Coller', enabled: params.editFlags.canPaste, click: () => webContents.paste() })
        template.push({ type: 'separator' })
      } else if (params.selectionText) {
        template.push({ label: 'Copier', click: () => webContents.copy() })
        template.push({ type: 'separator' })
      }

      template.push({
        label: 'Précédent',
        enabled: webContents.navigationHistory.canGoBack(),
        click: () => webContents.navigationHistory.goBack(),
      })
      template.push({
        label: 'Suivant',
        enabled: webContents.navigationHistory.canGoForward(),
        click: () => webContents.navigationHistory.goForward(),
      })
      template.push({ label: 'Recharger', click: () => webContents.reload() })
      template.push({ type: 'separator' })
      template.push({
        label: "Inspecter l'élément",
        click: () =>
          mainWindow?.webContents.send(PRELOAD_EVENTS.OMNIBROWSER_INSPECT, {
            sourceWebContentsId: webContents.id,
            x: params.x,
            y: params.y,
          }),
      })

      Menu.buildFromTemplate(template).popup()
    })
  })

  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.on('second-instance', (_event, argv) => {
  const deepLink = argv.find((arg) =>
    arg.startsWith(`${appConfig.OMNIDESK_APP_PROTOCOL}://`),
  )
  if (deepLink) {
    handleDeepLink(deepLink)
  } else {
    refocusMainWindow()
  }
})

// Deep links omnidesk:// (macOS : evenement open-url ; le DMG cible macOS). Un seul cas pour
// l'instant : le retour du flux OAuth GitHub (omnidesk://github/connected?status=ok|error), qui
// ne transporte AUCUN secret -- juste un signal pour ramener l'app au premier plan et faire
// rafraichir le statut GitHub cote renderer.
function handleDeepLink(rawUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return
  }
  if (parsed.protocol !== `${appConfig.OMNIDESK_APP_PROTOCOL}:`) {
    return
  }
  if (parsed.hostname === 'github' && parsed.pathname.replace(/^\/+/, '') === 'connected') {
    const status = parsed.searchParams.get('status') === 'error' ? 'error' : 'ok'
    const reason = parsed.searchParams.get('reason') ?? undefined
    const event: GithubLinkEvent = { status, reason }
    pendingGithubLinkEvent = !mainWindow || mainWindow.webContents.isLoading() ? event : undefined
    eventBus.emit('github:link', event)
  }
  refocusMainWindow()
}

app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

// Nom affiche partout (menu macOS via le role appMenu, notifications natives, dossier
// userData). Sans cela, l'app peut s'afficher sous le nom "Electron" (notamment en dev).
app.setName('Omnidesk')

app.whenReady().then(() => {
  electronApp.setAppUserModelId('app.omnidesk.desktop')
  // Volet "A propos d'Omnidesk" (macOS) : nom + version, sans reference a Electron.
  app.setAboutPanelOptions({
    applicationName: 'Omnidesk',
    applicationVersion: app.getVersion(),
  })
  app.setAsDefaultProtocolClient(appConfig.OMNIDESK_APP_PROTOCOL)

  // Menu applicatif personnalise : les raccourcis navigateur (Cmd+R, Cmd+T, Cmd+L...)
  // sont routes vers la page/onglet actif, et la navigation entre apps (Cmd/Ctrl+1..9)
  // vers le renderer, au lieu de recharger l'app Electron.
  installAppMenu({
    browser: (action) => {
      mainWindow?.webContents.send(PRELOAD_EVENTS.OMNIBROWSER_SHORTCUT, action)
    },
    nav: (action) => {
      mainWindow?.webContents.send(PRELOAD_EVENTS.APP_NAV_SHORTCUT, action)
    },
  })

  // Ouvrir la base est vital : si ca echoue, registerIpcHandlers n'est jamais atteint et TOUS les
  // canaux IPC repondent "No handler registered ..." de maniere opaque (typiquement quand la cle de
  // chiffrement n'est plus dechiffrable par le trousseau apres un changement d'identite de l'app).
  // On echoue donc franchement, avec un message clair, plutot que de laisser l'app a moitie demarree.
  let db: ReturnType<typeof databaseClient.open>
  try {
    db = databaseClient.open()
  } catch (error) {
    logger.error("Demarrage interrompu : impossible d'ouvrir la base de donnees", error)
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'Omnidesk',
      message: "Impossible d'ouvrir la base de donnees.",
      detail:
        "La cle de chiffrement locale n'a pas pu etre lue dans le trousseau du systeme. Cela " +
        "survient si l'identite de l'application (nom ou signature) a change depuis la derniere " +
        "ouverture. Verifiez l'acces au trousseau, ou reinitialisez les donnees locales de l'app.",
      buttons: ['Quitter'],
    })
    app.quit()
    return
  }
  reminderScheduler = new ReminderScheduler(db)
  passVaultService = new PassVaultService(db)
  registerIpcHandlers(syncEngine, reminderScheduler, passVaultService)
  syncEngine.start()
  stopNativeNotificationsBridge = eventBus.on('notification:created', (notification) => {
    // Banniere native + on previent le renderer pour qu'il joue le son de notification
    // (notification.mp3). Banniere silencieuse tant que le renderer peut jouer le son ;
    // sinon (fenetre pas encore prete) banniere sonore pour ne pas rater l'alerte.
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
    nativeNotifications.show(notification, { silent: Boolean(win) })
    win?.webContents.send(PRELOAD_EVENTS.NOTIFICATION_CREATED, notification)
  })
  stopSyncBridge = eventBus.on('sync:completed', (payload) => {
    mainWindow?.webContents.send(PRELOAD_EVENTS.SYNC_UPDATED, payload)
  })
  stopReminderBridge = eventBus.on('reminder:fired', (notification) => {
    // Rappel : on previent le renderer, qui joue le son de notification (de facon fiable,
    // independamment de la mascotte) et affiche en plus la bulle d'Elodie. Banniere native
    // silencieuse tant que le renderer peut jouer le son ; sinon (rappel au demarrage,
    // fenetre pas encore prete) banniere SONORE pour ne pas rater l'echeance.
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
    win?.webContents.send(PRELOAD_EVENTS.REMINDER_FIRED, notification)
    nativeNotifications.show(notification, { silent: Boolean(win) })
  })
  // On demarre le scheduler APRES avoir enregistre le pont reminder:fired : start() lance un
  // premier tick synchrone, et un rappel deja du (echeance atteinte pendant que l'app etait
  // fermee) doit trouver le pont en place, sinon il serait consomme dans le vide (banniere
  // native ET bulle perdues, le rappel etant aussitot marque comme declenche). La fenetre
  // n'existe pas encore a ce stade (createMainWindow plus bas) : pour ce rappel de demarrage la
  // bulle Elodie ne s'affichera pas, mais la banniere native part et la notif est persistee
  // (visible dans le widget notifications recentes).
  reminderScheduler.start()
  // Pont signalisation omnichat -> renderer (meme schema que la synchro).
  stopOmnichatConnectionBridge = eventBus.on('omnichat:connection', (payload) => {
    mainWindow?.webContents.send(PRELOAD_EVENTS.OMNICHAT_CONNECTION, payload)
  })
  stopOmnichatMessageBridge = eventBus.on('omnichat:message', (payload) => {
    mainWindow?.webContents.send(PRELOAD_EVENTS.OMNICHAT_MESSAGE, payload)
  })
  stopOmnichatPresenceBridge = eventBus.on('omnichat:presence', (payload) => {
    mainWindow?.webContents.send(PRELOAD_EVENTS.OMNICHAT_PRESENCE, payload)
  })
  stopOmnichatGroupBridge = eventBus.on('omnichat:group', (payload) => {
    mainWindow?.webContents.send(PRELOAD_EVENTS.OMNICHAT_GROUP, payload)
  })
  stopOmnichatTypingBridge = eventBus.on('omnichat:typing', (payload) => {
    mainWindow?.webContents.send(PRELOAD_EVENTS.OMNICHAT_TYPING_IN, payload)
  })
  stopOmnichatReceiptBridge = eventBus.on('omnichat:receipt', (payload) => {
    mainWindow?.webContents.send(PRELOAD_EVENTS.OMNICHAT_RECEIPT_IN, payload)
  })
  stopOmnichatCallRingBridge = eventBus.on('omnichat:call-ring', (payload) => {
    mainWindow?.webContents.send(PRELOAD_EVENTS.OMNICHAT_CALL_RING, payload)
    // Appel entrant hors focus : on alerte via une notif native (son) et on fait
    // sauter l'icone du dock jusqu'a l'activation. La sonnerie en boucle, elle, est
    // jouee cote renderer. Fenetre deja au premier plan : le dialog in-app suffit.
    if (mainWindow && !mainWindow.isFocused()) {
      nativeNotifications.show({
        title: 'Appel entrant',
        body: payload.media === 'video' ? 'Appel video' : 'Appel audio',
      })
      if (process.platform === 'darwin' && app.dock) {
        incomingCallBounceId = app.dock.bounce('critical')
      }
    }
  })
  stopOmnichatCallStateBridge = eventBus.on('omnichat:call-state', (payload) => {
    mainWindow?.webContents.send(PRELOAD_EVENTS.OMNICHAT_CALL_STATE, payload)
    // Fin d'appel : on stoppe le rebond du dock declenche au call-ring.
    if (process.platform === 'darwin' && app.dock && incomingCallBounceId !== null) {
      app.dock.cancelBounce(incomingCallBounceId)
      incomingCallBounceId = null
    }
  })
  stopOmnichatReactionBridge = eventBus.on('omnichat:reaction', (payload) => {
    mainWindow?.webContents.send(PRELOAD_EVENTS.OMNICHAT_REACTION, payload)
  })
  stopOmnichatCallActiveBridge = eventBus.on('omnichat:call-active', (payload) => {
    mainWindow?.webContents.send(PRELOAD_EVENTS.OMNICHAT_CALL_ACTIVE, payload)
  })
  // Coffre omniPass verrouille (manuel ou auto-lock) -> le renderer repasse en mode verrouille.
  stopPassvaultLockedBridge = eventBus.on('passvault:locked', (payload) => {
    mainWindow?.webContents.send(PRELOAD_EVENTS.PASSVAULT_LOCKED, payload)
  })
  // Pont assistant IA : streaming de la reponse main -> renderer (texte, fin, erreur).
  // Le streaming IA peut etre en cours quand la fenetre se ferme : on garde contre un
  // webContents detruit (sinon send() leve et casse l'emission de l'evenement).
  const sendAiEvent = <Payload>(channel: string, payload: Payload): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload)
    }
  }
  stopAiChunkBridge = eventBus.on('ai:chunk', (payload) => sendAiEvent(PRELOAD_EVENTS.AI_CHUNK, payload))
  stopAiDoneBridge = eventBus.on('ai:done', (payload) => sendAiEvent(PRELOAD_EVENTS.AI_DONE, payload))
  stopAiErrorBridge = eventBus.on('ai:error', (payload) => sendAiEvent(PRELOAD_EVENTS.AI_ERROR, payload))
  stopAiToolStartBridge = eventBus.on('ai:tool-start', (payload) =>
    sendAiEvent(PRELOAD_EVENTS.AI_TOOL_START, payload),
  )
  stopAiToolEndBridge = eventBus.on('ai:tool-end', (payload) =>
    sendAiEvent(PRELOAD_EVENTS.AI_TOOL_END, payload),
  )
  stopAiConfirmRequestBridge = eventBus.on('ai:confirm-request', (payload) =>
    sendAiEvent(PRELOAD_EVENTS.AI_CONFIRM_REQUEST, payload),
  )
  stopHomeUpdatedBridge = eventBus.on('home:updated', (payload) =>
    sendAiEvent(PRELOAD_EVENTS.HOME_UPDATED, payload),
  )
  // Pont session de compte (mode accounts) -> renderer (gate connexion) ET cycle de vie de
  // la signalisation omnichat. On n'agit sur la signalisation qu'aux TRANSITIONS d'/vers
  // 'authenticated' : un simple refresh garde l'etat 'authenticated' et ne doit pas relancer
  // la connexion WS (le jeton n'est requis qu'au hello). webContents.send no-op si la fenetre
  // n'existe pas encore (le renderer amorce son etat via auth.getState au montage).
  let lastAuthState = accountAuthService.status().state
  stopAccountSessionBridge = eventBus.on('account:session', (status) => {
    mainWindow?.webContents.send(PRELOAD_EVENTS.AUTH_STATE, status)
    const previous = lastAuthState
    lastAuthState = status.state
    if (status.state === 'authenticated' && previous !== 'authenticated') {
      signalingClient.restart()
    } else if (status.state !== 'authenticated' && previous === 'authenticated') {
      signalingClient.stop()
    }
  })
  // Pont retour OAuth GitHub -> renderer (rafraichit le statut / tableau de bord GitHub).
  // webContents.send no-op si la fenetre n'existe pas encore.
  stopGithubLinkBridge = eventBus.on('github:link', (payload) => {
    mainWindow?.webContents.send(PRELOAD_EVENTS.GITHUB_LINK, payload)
  })
  // Verrouillage du coffre a la mise en veille et au verrouillage de session OS. L'auto-lock par
  // inactivite (cote service) reste le filet principal. Le verrouillage sur simple perte de focus
  // est volontairement ecarte en M0 : trop agressif tant que le deverrouillage biometrique (M3)
  // ne rend pas la re-saisie indolore.
  powerMonitor.on('suspend', () => passVaultService?.lock())
  powerMonitor.on('lock-screen', () => passVaultService?.lock())
  signalingClient.init(db)
  signalingClient.start()
  // Restaure une eventuelle session de compte puis tente un refresh. Asynchrone a dessein :
  // ne pas bloquer le demarrage sur un appel reseau. Le pont account:session ci-dessus
  // (re)lancera la signalisation omnichat une fois la session authentifiee.
  void accountAuthService.restoreSession()
  setupMediaPermissions()
  createMainWindow()
  autoUpdate.init({ getWindow: () => mainWindow })
  void warnIfDiskUnencrypted()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow()
  }
})

app.on('before-quit', () => {
  stopSyncBridge?.()
  stopReminderBridge?.()
  stopNativeNotificationsBridge?.()
  stopOmnichatConnectionBridge?.()
  stopOmnichatMessageBridge?.()
  stopOmnichatPresenceBridge?.()
  stopOmnichatGroupBridge?.()
  stopOmnichatTypingBridge?.()
  stopOmnichatReceiptBridge?.()
  stopOmnichatCallRingBridge?.()
  stopOmnichatCallStateBridge?.()
  stopOmnichatReactionBridge?.()
  stopOmnichatCallActiveBridge?.()
  stopPassvaultLockedBridge?.()
  stopAiChunkBridge?.()
  stopAiDoneBridge?.()
  stopAiErrorBridge?.()
  stopAiToolStartBridge?.()
  stopAiToolEndBridge?.()
  stopAiConfirmRequestBridge?.()
  stopHomeUpdatedBridge?.()
  stopAccountSessionBridge?.()
  stopGithubLinkBridge?.()
  signalingClient.stop()
  accountAuthService.stop()
  syncEngine.stop()
  reminderScheduler?.stop()
  passVaultService?.lock()
  databaseClient.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error)
})

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason)
})
