import { session, type Session } from 'electron'
import { logger } from '@main/logger'

// Domaines reseaux de pub / tracking / fingerprinting bloques quand l'adblock est actif.
// Liste minimaliste, choisie pour couvrir les regies les plus repandues sans casser la
// majorite des sites legitimes. On evite les CDN ambigus (cloudfront, akamai) et les
// scripts d'analytics integres a des produits (Stripe, Intercom, etc.).
const AD_BLOCK_HOSTS: readonly string[] = [
  // Google ads/tracking
  'doubleclick.net',
  'googleadservices.com',
  'googlesyndication.com',
  'googletagservices.com',
  'adservice.google.com',
  'adservice.google.fr',
  'adservice.google.com.au',
  // Analytics generiques (souvent associes au tracking pub)
  'google-analytics.com',
  'analytics.google.com',
  'stats.g.doubleclick.net',
  // Facebook pixel
  'connect.facebook.net',
  'pixel.facebook.com',
  // Regies pub / RTB
  'adnxs.com',
  'adform.net',
  'criteo.com',
  'criteo.net',
  'smartadserver.com',
  'rubiconproject.com',
  'openx.net',
  'pubmatic.com',
  'casalemedia.com',
  'taboola.com',
  'outbrain.com',
  'mgid.com',
  'revcontent.com',
  'media.net',
  'yieldlab.net',
  'yieldmo.com',
  'indexww.com',
  'bidswitch.net',
  'sharethrough.com',
  // Mesure / verification publicitaire
  'scorecardresearch.com',
  'comscore.com',
  'quantserve.com',
  'doubleverify.com',
  'moatads.com',
  'adsafeprotected.com',
  // Trackers comportementaux
  'hotjar.com',
  'mouseflow.com',
  'fullstory.com',
  'segment.io',
  'mixpanel.com',
  // Specifiques presse FR (souvent intercales sur lemonde, lefigaro, lamontagne, etc.)
  'weborama.fr',
  'weborama.com',
  'xiti.com',
  'atinternet.com',
  'omtrdc.net',
]

interface FilterFlags {
  adBlock: boolean
}

const matchesHostList = (hostname: string, list: readonly string[]): boolean => {
  const normalized = hostname.toLowerCase()
  return list.some((entry) => normalized === entry || normalized.endsWith(`.${entry}`))
}

const isAdHost = (hostname: string): boolean => matchesHostList(hostname, AD_BLOCK_HOSTS)

/**
 * Maintient les filtres webRequest par session, cle par chaine de partition
 * Electron complete (ex: "persist:webpage-<id>" ou "persist:omnibrowser-<id>").
 * Une seule instance sert les pages web epinglees et les espaces OmniBrowser.
 */
export class NetworkFilterService {
  private readonly flags = new Map<string, FilterFlags>()
  private readonly installed = new Set<string>()

  setFlags(partition: string, flags: Partial<FilterFlags>): void {
    const current = this.flags.get(partition) ?? { adBlock: false }
    const next: FilterFlags = { ...current, ...flags }
    this.flags.set(partition, next)
    this.ensureInstalled(partition)
  }

  remove(partition: string): void {
    this.flags.delete(partition)
    this.installed.delete(partition)
  }

  getFlags(partition: string): FilterFlags {
    return this.flags.get(partition) ?? { adBlock: false }
  }

  /**
   * Garantit qu'un onBeforeRequest est attache pour cette partition. Une session
   * persistee dans Electron survit a la suppression du webview, donc on
   * n'attache qu'une seule fois et on lit l'etat courant a chaque requete.
   */
  ensureInstalled(partition: string): void {
    if (!partition.startsWith('persist:') || this.installed.has(partition)) {
      return
    }

    let target: Session
    try {
      target = session.fromPartition(partition)
    } catch (error) {
      logger.warn('networkFilterService: impossible de lire la session', { partition, error })
      return
    }

    target.webRequest.onBeforeRequest((details, callback) => {
      const flags = this.flags.get(partition)
      if (!flags?.adBlock) {
        callback({ cancel: false })
        return
      }
      try {
        const url = new URL(details.url)
        if (flags.adBlock && isAdHost(url.hostname)) {
          callback({ cancel: true })
          return
        }
      } catch {
        // URL non parsable (ex: data:, blob:) => on laisse passer.
      }
      callback({ cancel: false })
    })

    this.installed.add(partition)
  }
}

export const webpageFilterService = new NetworkFilterService()
export const networkFilterService = webpageFilterService
