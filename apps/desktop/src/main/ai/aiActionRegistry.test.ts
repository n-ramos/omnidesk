import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { AiToolDefinition } from '@shared/ai'
import { AiActionRegistry, sanitizeToolName } from './aiActionRegistry'

const OPENAI_TOOL_NAME = /^[a-zA-Z0-9_-]+$/

const makeAction = (name: string): AiToolDefinition<{ value: string }> => ({
  name,
  description: 'test',
  parameters: z.object({ value: z.string() }),
  mutating: false,
  category: 'system',
  execute: async () => ({ ok: true, summary: 'ok' }),
})

describe('AiActionRegistry - noms d outils', () => {
  it('assainit les noms (point -> underscore) selon le pattern OpenAI', () => {
    expect(sanitizeToolName('mail.compose')).toBe('mail_compose')
    expect(sanitizeToolName('home.list_widgets')).toBe('home_list_widgets')
    expect(sanitizeToolName('mail_compose')).toBe('mail_compose')
    expect(OPENAI_TOOL_NAME.test(sanitizeToolName('weather.set_city'))).toBe(true)
  })

  it('expose au fournisseur des noms d outils valides', () => {
    const registry = new AiActionRegistry()
    registry.register(makeAction('mail.compose'))
    registry.register(makeAction('home.list_widgets'))
    const names = registry.toProviderTools().map((tool) => tool.name)
    expect(names).toContain('mail_compose')
    expect(names).toContain('home_list_widgets')
    for (const name of names) {
      expect(OPENAI_TOOL_NAME.test(name)).toBe(true)
    }
  })

  it('re-resout un appel d outil par son nom assaini ou exact', () => {
    const registry = new AiActionRegistry()
    registry.register(makeAction('mail.compose'))
    expect(registry.parseArguments('mail_compose', { value: 'x' }).definition.name).toBe('mail.compose')
    expect(registry.parseArguments('mail.compose', { value: 'y' }).definition.name).toBe('mail.compose')
  })
})
