export interface WebServicePreset {
  /** Sert aussi d'identifiant de logo (ProviderLogo). */
  id: 'slack' | 'teams' | 'outlook'
  label: string
  url: string
  description: string
}

// Services accessibles en mode web : ils s'ouvrent dans une webview persistante (session
// geree par le site lui-meme, isolee par compte). Remplacent les anciennes integrations
// OAuth Slack/Teams -- plus simple a gerer, aucun secret ni jeton cote app. Cliquer sur
// l'un d'eux cree un compte de type "webpage" preconfigure sur l'URL ci-dessous.
export const WEB_SERVICE_PRESETS: readonly WebServicePreset[] = [
  {
    id: 'slack',
    label: 'Slack',
    url: 'https://app.slack.com/client',
    description: 'Ouvrir Slack en mode web (session isolee)',
  },
  {
    id: 'teams',
    label: 'Microsoft Teams',
    url: 'https://teams.microsoft.com',
    description: 'Ouvrir Teams en mode web (session isolee)',
  },
  {
    id: 'outlook',
    label: 'Microsoft Outlook',
    url: 'https://outlook.office.com/mail/',
    description: 'Ouvrir Outlook en mode web (session isolee)',
  },
]
