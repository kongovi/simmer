import type { AIModel, ImageModel } from '../../types'

export interface AISettingsCache {
  ai_structuring_model:  AIModel
  ai_image_model:        ImageModel
  task_model_overrides:  Record<string, string>
  anthropic_api_key_enc: string | null
  openai_api_key_enc:    string | null
  google_api_key_enc:    string | null
  replicate_api_key_enc: string | null
  ollama_host:           string | null
}

let _cache: AISettingsCache | null = null

export function setAISettingsCache(s: AISettingsCache | null): void {
  _cache = s
}

export function getAISettingsCache(): AISettingsCache | null {
  return _cache
}

/** API key for a given text model. Falls back to dev env vars. */
export function getApiKeyForModel(model: AIModel): string | null {
  const c = _cache
  switch (model) {
    case 'claude':  return c?.anthropic_api_key_enc ?? (import.meta.env.VITE_DEV_ANTHROPIC_KEY as string | undefined) ?? null
    case 'gpt4':    return c?.openai_api_key_enc    ?? null
    case 'gemini':  return c?.google_api_key_enc    ?? (import.meta.env.VITE_DEV_GOOGLE_AI_KEY  as string | undefined) ?? null
    case 'local':   return null  // Ollama needs no key
    default:        return null
  }
}
