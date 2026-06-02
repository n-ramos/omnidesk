import { AppError } from '@shared/errors'
import type { CitySuggestion, WeatherSnapshot } from '@shared/models'
import { logger } from '@main/logger'

interface GeocodingHit {
  name: string
  country?: string
  country_code?: string
  admin1?: string
  latitude: number
  longitude: number
}

interface GeocodingResult {
  results?: GeocodingHit[]
}

interface ForecastResult {
  current?: {
    temperature_2m?: number
    weather_code?: number
    wind_speed_10m?: number
    relative_humidity_2m?: number
    is_day?: number
  }
  current_units?: {
    temperature_2m?: string
    wind_speed_10m?: string
  }
}

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'
const CACHE_TTL_MS = 10 * 60 * 1000

interface CacheEntry {
  fetchedAt: number
  snapshot: WeatherSnapshot
}

export class WeatherService {
  private cache = new Map<string, CacheEntry>()

  async searchCities(query: string, limit = 5): Promise<CitySuggestion[]> {
    const normalized = query.trim()
    if (normalized.length < 2) {
      return []
    }

    const hits = await this.geocodeMany(normalized, limit)
    return hits.map((hit) => ({
      name: hit.name,
      region: hit.admin1,
      country: hit.country,
      countryCode: hit.country_code,
      latitude: hit.latitude,
      longitude: hit.longitude,
    }))
  }

  async fetch(input: {
    query?: string
    latitude?: number
    longitude?: number
    label?: string
  }): Promise<WeatherSnapshot> {
    if (typeof input.latitude === 'number' && typeof input.longitude === 'number') {
      return this.fetchAt(input.latitude, input.longitude, input.label)
    }

    const normalized = input.query?.trim() ?? ''
    if (!normalized) {
      throw new AppError('VALIDATION_FAILED', 'Indiquez une ville pour la meteo.')
    }

    const cacheKey = `q:${normalized.toLocaleLowerCase()}`
    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.snapshot
    }

    const place = await this.geocode(normalized)
    const snapshot = await this.buildSnapshot(
      place.latitude,
      place.longitude,
      place.country ? `${place.name}, ${place.country}` : place.name,
    )

    this.cache.set(cacheKey, { fetchedAt: Date.now(), snapshot })
    return snapshot
  }

  private async fetchAt(
    latitude: number,
    longitude: number,
    label?: string,
  ): Promise<WeatherSnapshot> {
    const cacheKey = `c:${latitude.toFixed(3)}:${longitude.toFixed(3)}`
    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.snapshot
    }

    const snapshot = await this.buildSnapshot(latitude, longitude, label ?? '')
    this.cache.set(cacheKey, { fetchedAt: Date.now(), snapshot })
    return snapshot
  }

  private async buildSnapshot(
    latitude: number,
    longitude: number,
    locationName: string,
  ): Promise<WeatherSnapshot> {
    const forecast = await this.forecast(latitude, longitude)
    return {
      locationName,
      latitude,
      longitude,
      temperature: forecast.current?.temperature_2m ?? null,
      temperatureUnit: forecast.current_units?.temperature_2m ?? 'C',
      windSpeed: forecast.current?.wind_speed_10m ?? null,
      windUnit: forecast.current_units?.wind_speed_10m ?? 'km/h',
      humidity: forecast.current?.relative_humidity_2m ?? null,
      weatherCode: forecast.current?.weather_code ?? null,
      isDay: forecast.current?.is_day === 1,
      fetchedAt: new Date().toISOString(),
    }
  }

  private async geocode(query: string): Promise<GeocodingHit> {
    const hits = await this.geocodeMany(query, 1)
    const first = hits[0]
    if (!first) {
      throw new AppError('VALIDATION_FAILED', `Aucune ville trouvee pour "${query}".`)
    }
    return first
  }

  private async geocodeMany(query: string, count: number): Promise<GeocodingHit[]> {
    const url = new URL(GEOCODING_URL)
    url.searchParams.set('name', query)
    url.searchParams.set('count', String(count))
    url.searchParams.set('language', 'fr')
    url.searchParams.set('format', 'json')

    const response = await fetch(url, { method: 'GET' })
    if (!response.ok) {
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        `Le service de localisation a refuse la requete (HTTP ${response.status}).`,
      )
    }

    const payload = (await response.json()) as GeocodingResult
    return payload.results ?? []
  }

  private async forecast(latitude: number, longitude: number): Promise<ForecastResult> {
    const url = new URL(FORECAST_URL)
    url.searchParams.set('latitude', String(latitude))
    url.searchParams.set('longitude', String(longitude))
    url.searchParams.set(
      'current',
      'temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,is_day',
    )
    url.searchParams.set('timezone', 'auto')

    const response = await fetch(url, { method: 'GET' })
    if (!response.ok) {
      throw new AppError(
        'PROVIDER_UNAVAILABLE',
        `Le service meteo a refuse la requete (HTTP ${response.status}).`,
      )
    }

    try {
      return (await response.json()) as ForecastResult
    } catch (error) {
      logger.warn('Weather forecast parse failed', { error })
      throw new AppError('PROVIDER_UNAVAILABLE', 'Reponse meteo illisible.')
    }
  }
}

export const weatherService = new WeatherService()
