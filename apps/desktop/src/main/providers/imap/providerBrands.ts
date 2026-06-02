interface BrandRule {
  name: string
  domains?: string[]
  hostPatterns?: RegExp[]
}

const BRAND_RULES: BrandRule[] = [
  {
    name: 'Gmail',
    domains: ['gmail.com', 'googlemail.com'],
    hostPatterns: [/(^|\.)gmail\.com$/i, /(^|\.)google\.com$/i],
  },
  {
    name: 'Google Workspace',
    hostPatterns: [/imap\.gmail\.com$/i, /smtp\.gmail\.com$/i],
  },
  {
    name: 'Microsoft Exchange',
    hostPatterns: [
      /(^|\.)outlook\.office365\.com$/i,
      /(^|\.)outlook\.office\.com$/i,
      /(^|\.)smtp\.office365\.com$/i,
    ],
  },
  {
    name: 'Outlook.com',
    domains: ['outlook.com', 'outlook.fr', 'hotmail.com', 'hotmail.fr', 'live.com', 'msn.com'],
    hostPatterns: [/(^|\.)hotmail\.com$/i],
  },
  {
    name: 'iCloud Mail',
    domains: ['icloud.com', 'me.com', 'mac.com'],
    hostPatterns: [/(^|\.)mail\.me\.com$/i, /(^|\.)imap\.mail\.me\.com$/i],
  },
  {
    name: 'Yahoo Mail',
    domains: ['yahoo.com', 'yahoo.fr', 'ymail.com', 'rocketmail.com'],
    hostPatterns: [/(^|\.)yahoo\.com$/i, /(^|\.)mail\.yahoo\.com$/i],
  },
  {
    name: 'AOL Mail',
    domains: ['aol.com'],
    hostPatterns: [/(^|\.)aol\.com$/i],
  },
  {
    name: 'Proton Mail',
    domains: ['proton.me', 'protonmail.com', 'protonmail.ch', 'pm.me'],
    hostPatterns: [/(^|\.)protonmail\.ch$/i, /(^|\.)proton\.me$/i],
  },
  {
    name: 'Fastmail',
    domains: ['fastmail.com', 'fastmail.fm'],
    hostPatterns: [/(^|\.)fastmail\.com$/i, /(^|\.)messagingengine\.com$/i],
  },
  {
    name: 'Yandex Mail',
    domains: ['yandex.com', 'yandex.ru', 'yandex.fr'],
    hostPatterns: [/(^|\.)yandex\.(com|ru|net)$/i],
  },
  {
    name: 'OVH',
    hostPatterns: [/(^|\.)ovh\.(net|fr|com)$/i, /^ssl0\.ovh\.net$/i, /^ns0\.ovh\.net$/i],
  },
  {
    name: 'Infomaniak',
    domains: ['infomaniak.com'],
    hostPatterns: [/(^|\.)infomaniak\.com$/i, /(^|\.)infomaniak\.ch$/i],
  },
  {
    name: 'Free',
    domains: ['free.fr', 'aliceadsl.fr'],
    hostPatterns: [/(^|\.)free\.fr$/i],
  },
  {
    name: 'Orange',
    domains: ['orange.fr', 'wanadoo.fr'],
    hostPatterns: [/(^|\.)orange\.fr$/i, /(^|\.)wanadoo\.fr$/i],
  },
  {
    name: 'SFR',
    domains: ['sfr.fr', 'neuf.fr', 'cegetel.net'],
    hostPatterns: [/(^|\.)sfr\.fr$/i],
  },
  {
    name: 'La Poste',
    domains: ['laposte.net'],
    hostPatterns: [/(^|\.)laposte\.net$/i],
  },
  {
    name: 'GMX',
    domains: ['gmx.com', 'gmx.fr', 'gmx.de', 'gmx.net'],
    hostPatterns: [/(^|\.)gmx\.(com|net|de|fr)$/i],
  },
  {
    name: 'Mailbox.org',
    domains: ['mailbox.org'],
    hostPatterns: [/(^|\.)mailbox\.org$/i],
  },
  {
    name: 'Zoho Mail',
    domains: ['zoho.com', 'zohomail.com'],
    hostPatterns: [/(^|\.)zoho\.com$/i, /(^|\.)zohomail\.com$/i],
  },
  {
    name: 'iONOS',
    hostPatterns: [/(^|\.)1and1\.com$/i, /(^|\.)ionos\.(de|fr|com)$/i, /(^|\.)kundenserver\.de$/i],
  },
  {
    name: 'Microsoft Exchange (hosted)',
    hostPatterns: [/(^|\.)mail\.protection\.outlook\.com$/i],
  },
]

const domainFromEmail = (email: string): string | undefined =>
  email.split('@')[1]?.toLowerCase()

export const inferProviderBrand = (
  email: string,
  hosts: Array<string | undefined>,
): string | undefined => {
  const emailDomain = domainFromEmail(email)
  const normalizedHosts = hosts
    .filter((host): host is string => typeof host === 'string' && host.length > 0)
    .map((host) => host.toLowerCase())

  for (const rule of BRAND_RULES) {
    if (emailDomain && rule.domains?.some((domain) => domain === emailDomain)) {
      return rule.name
    }
    if (
      rule.hostPatterns
      && normalizedHosts.some((host) => rule.hostPatterns!.some((pattern) => pattern.test(host)))
    ) {
      return rule.name
    }
  }

  if (emailDomain) {
    return prettyDomain(emailDomain)
  }

  return undefined
}

const prettyDomain = (domain: string): string => {
  const parts = domain.split('.')
  const root = parts.length >= 2 ? parts[parts.length - 2] : parts[0]
  if (!root) {
    return domain
  }
  return root.charAt(0).toUpperCase() + root.slice(1)
}
