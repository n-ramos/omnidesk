import { zodToJsonSchema } from 'zod-to-json-schema'
import { AppError } from '@shared/errors'
import type { AiProviderTool, AiToolDefinition } from '@shared/ai'

// Registre des actions IA. Le contrat (AiToolDefinition) vit dans shared/ai ; ici on les
// rassemble, on les expose au fournisseur (JSON Schema) et on valide les arguments du modele.
export class AiActionRegistry {
  private readonly actions = new Map<string, AiToolDefinition<unknown>>()

  register<TArgs>(definition: AiToolDefinition<TArgs>): void {
    if (definition.mutating && !definition.preview) {
      throw new Error(`Action mutante ${definition.name} sans preview()`)
    }
    this.actions.set(definition.name, definition as unknown as AiToolDefinition<unknown>)
  }

  clear(): void {
    this.actions.clear()
  }

  get(name: string): AiToolDefinition<unknown> | undefined {
    return this.actions.get(name)
  }

  list(): AiToolDefinition<unknown>[] {
    return [...this.actions.values()]
  }

  // Convertit chaque action en "tool" pour le fournisseur (JSON Schema genere depuis Zod).
  toProviderTools(): AiProviderTool[] {
    return this.list().map((action) => {
      const jsonSchema = zodToJsonSchema(action.parameters, { $refStrategy: 'none' }) as Record<
        string,
        unknown
      >
      // OpenAI n'attend pas la cle $schema dans les parametres d'outil ; on l'enleve.
      delete jsonSchema.$schema
      return { name: action.name, description: action.description, jsonSchema }
    })
  }

  // Valide les arguments produits par le modele AVANT tout preview/execute.
  parseArguments(name: string, raw: unknown): { definition: AiToolDefinition<unknown>; args: unknown } {
    const definition = this.get(name)
    if (!definition) {
      throw new AppError('AI_TOOL_UNKNOWN', `Outil inconnu : ${name}`)
    }
    const parsed = definition.parameters.safeParse(raw)
    if (!parsed.success) {
      const summary = parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '(racine)'}: ${issue.message}`)
        .join('; ')
      throw new AppError('AI_TOOL_INVALID_ARGS', `Arguments invalides pour ${name} : ${summary}`)
    }
    return { definition, args: parsed.data }
  }
}

export const aiActionRegistry = new AiActionRegistry()
