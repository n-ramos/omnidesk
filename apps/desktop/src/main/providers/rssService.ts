import Parser from 'rss-parser'
import { AppError } from '@shared/errors'
import type { RssFeed, RssItem } from '@shared/models'

const CACHE_TTL_MS = 5 * 60 * 1000
const REQUEST_TIMEOUT_MS = 8_000

interface CacheEntry {
  fetchedAt: number
  feed: RssFeed
}

const sanitize = (value?: string): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

const stripHtml = (value?: string): string | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || undefined
}

const toIso = (value?: string): string | undefined => {
  if (!value) {
    return undefined
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

export class RssService {
  private parser = new Parser({ timeout: REQUEST_TIMEOUT_MS })
  private cache = new Map<string, CacheEntry>()

  async fetch(url: string, limit = 12): Promise<RssFeed> {
    const normalized = url.trim()
    if (!normalized) {
      throw new AppError('VALIDATION_FAILED', 'Indiquez une URL de flux RSS.')
    }

    let parsed: URL
    try {
      parsed = new URL(normalized)
    } catch {
      throw new AppError('VALIDATION_FAILED', 'URL invalide.')
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new AppError('VALIDATION_FAILED', 'Seuls http(s) sont supportes.')
    }

    const cacheKey = parsed.toString()
    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return { ...cached.feed, items: cached.feed.items.slice(0, limit) }
    }

    try {
      const result = await this.parser.parseURL(cacheKey)
      const items: RssItem[] = (result.items ?? []).slice(0, 50).map((item) => ({
        title: sanitize(item.title) ?? 'Sans titre',
        link: sanitize(item.link),
        publishedAt: toIso(item.isoDate ?? item.pubDate),
        author: sanitize(item.creator ?? item.author),
        summary: stripHtml(item.contentSnippet ?? item.content ?? item.summary),
      }))

      const feed: RssFeed = {
        title: sanitize(result.title) ?? parsed.host,
        link: sanitize(result.link),
        items,
        fetchedAt: new Date().toISOString(),
      }

      this.cache.set(cacheKey, { fetchedAt: Date.now(), feed })
      return { ...feed, items: feed.items.slice(0, limit) }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Impossible de lire le flux.'
      throw new AppError('PROVIDER_UNAVAILABLE', message)
    }
  }
}

export const rssService = new RssService()
