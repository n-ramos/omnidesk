import type { OmniBrowserSettings } from './models'

export interface SearchEngine {
  id: string
  name: string
  // Gabarit d'URL de recherche : si '%s' est present il est remplace par la
  // requete encodee, sinon celle-ci est concatenee a la fin.
  searchTemplate: string
}

// Identifiant reserve au moteur personnalise saisi par l'utilisateur.
export const CUSTOM_SEARCH_ENGINE_ID = 'custom'

export const DEFAULT_SEARCH_ENGINE: SearchEngine = {
  id: 'duckduckgo',
  name: 'DuckDuckGo',
  searchTemplate: 'https://duckduckgo.com/?q=',
}

export const SEARCH_ENGINES: readonly SearchEngine[] = [
  DEFAULT_SEARCH_ENGINE,
  { id: 'google', name: 'Google', searchTemplate: 'https://www.google.com/search?q=' },
  { id: 'bing', name: 'Bing', searchTemplate: 'https://www.bing.com/search?q=' },
  { id: 'brave', name: 'Brave', searchTemplate: 'https://search.brave.com/search?q=' },
  { id: 'startpage', name: 'Startpage', searchTemplate: 'https://www.startpage.com/sp/search?query=' },
  { id: 'ecosia', name: 'Ecosia', searchTemplate: 'https://www.ecosia.org/search?q=' },
]

export const searchEngineById = (id: string): SearchEngine =>
  SEARCH_ENGINES.find((engine) => engine.id === id) ?? DEFAULT_SEARCH_ENGINE

type SearchEnginePreference = Pick<
  OmniBrowserSettings,
  'searchEngineId' | 'customSearchName' | 'customSearchTemplate'
>

// Insere la requete dans le gabarit : substitution de '%s' si present, sinon
// concatenation a la fin (compatible avec les presets historiques en '?q=').
const fillTemplate = (template: string, query: string): string => {
  const encoded = encodeURIComponent(query)
  return template.includes('%s') ? template.replaceAll('%s', encoded) : `${template}${encoded}`
}

// Resout le moteur effectif depuis les reglages, en gerant le moteur personnalise.
export const resolveSearchEngine = (settings: SearchEnginePreference): SearchEngine => {
  const template = settings.customSearchTemplate?.trim()
  if (settings.searchEngineId === CUSTOM_SEARCH_ENGINE_ID && template) {
    return {
      id: CUSTOM_SEARCH_ENGINE_ID,
      name: settings.customSearchName?.trim() || 'Personnalisé',
      searchTemplate: template,
    }
  }
  return searchEngineById(settings.searchEngineId)
}

export const buildSearchUrl = (settings: SearchEnginePreference, query: string): string =>
  fillTemplate(resolveSearchEngine(settings).searchTemplate, query)
