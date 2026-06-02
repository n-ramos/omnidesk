import { PlaceholderProvider } from './baseProvider'

export class WebpageProvider extends PlaceholderProvider {
  readonly descriptor = {
    id: 'webpage',
    name: 'webpage',
    displayName: 'Page web',
    capabilities: ['embedded-webview'],
    authReady: true,
  } as const
}
