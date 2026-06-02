import { AppError } from '@shared/errors'
import type { TenorGifResult } from '@shared/models'
import { appConfig } from '@main/config/env'

interface TenorMediaFormat {
  url?: string
  dims?: [number, number]
}

interface TenorResult {
  id?: string
  title?: string
  content_description?: string
  media_formats?: {
    tinygif?: TenorMediaFormat
    gif?: TenorMediaFormat
    nanogif?: TenorMediaFormat
    mediumgif?: TenorMediaFormat
  }
}

interface TenorResponse {
  results?: TenorResult[]
  next?: string
}

const TENOR_BASE_URL = 'https://tenor.googleapis.com/v2'

const mapResult = (result: TenorResult, index: number): TenorGifResult | null => {
  const preview = result.media_formats?.tinygif ?? result.media_formats?.nanogif
  const full = result.media_formats?.gif ?? result.media_formats?.mediumgif ?? preview

  if (!preview?.url || !full?.url) {
    return null
  }

  return {
    id: result.id ?? `gif-${index}`,
    title: result.title ?? result.content_description ?? 'GIF',
    previewUrl: preview.url,
    previewWidth: preview.dims?.[0] ?? 200,
    previewHeight: preview.dims?.[1] ?? 200,
    fullUrl: full.url,
    fullWidth: full.dims?.[0] ?? 400,
    fullHeight: full.dims?.[1] ?? 400,
  }
}

const ensureApiKey = (): string => {
  if (!appConfig.OMNIDESK_TENOR_API_KEY) {
    throw new AppError(
      'PROVIDER_UNAVAILABLE',
      "Aucune cle Tenor configuree. Renseignez OMNIDESK_TENOR_API_KEY dans .env.",
    )
  }
  return appConfig.OMNIDESK_TENOR_API_KEY
}

export class TenorService {
  isReady(): boolean {
    return Boolean(appConfig.OMNIDESK_TENOR_API_KEY)
  }

  async featured(limit = 24): Promise<TenorGifResult[]> {
    const apiKey = ensureApiKey()
    const url = new URL(`${TENOR_BASE_URL}/featured`)
    url.searchParams.set('key', apiKey)
    url.searchParams.set('client_key', appConfig.OMNIDESK_TENOR_CLIENT_KEY)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('media_filter', 'tinygif,gif,nanogif')

    return this.fetchResults(url)
  }

  async search(query: string, limit = 24): Promise<TenorGifResult[]> {
    const trimmed = query.trim()
    if (!trimmed) {
      return this.featured(limit)
    }

    const apiKey = ensureApiKey()
    const url = new URL(`${TENOR_BASE_URL}/search`)
    url.searchParams.set('key', apiKey)
    url.searchParams.set('client_key', appConfig.OMNIDESK_TENOR_CLIENT_KEY)
    url.searchParams.set('q', trimmed)
    url.searchParams.set('limit', String(limit))
    url.searchParams.set('media_filter', 'tinygif,gif,nanogif')

    return this.fetchResults(url)
  }

  private async fetchResults(url: URL): Promise<TenorGifResult[]> {
    const response = await fetch(url, { method: 'GET' })

    if (!response.ok) {
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        `Tenor a refuse la requete (HTTP ${response.status}).`,
      )
    }

    const payload = (await response.json()) as TenorResponse
    const results: TenorGifResult[] = []

    for (const [index, result] of (payload.results ?? []).entries()) {
      const mapped = mapResult(result, index)
      if (mapped) {
        results.push(mapped)
      }
    }

    return results
  }
}

export const tenorService = new TenorService()
