import { getAISettingsCache } from './settingsCache'
import { useUserSettings } from '../../hooks/useUserSettings'

/** Human-readable name for each text AI model key. */
export const AI_MODEL_LABELS: Record<string, string> = {
  claude:  'Claude',
  gpt4:    'GPT-4o',
  gemini:  'Gemini',
  local:   'AI',
}

/** Returns the display label for the currently configured text AI model. */
export function getAIModelLabel(): string {
  const model = getAISettingsCache()?.ai_structuring_model ?? 'claude'
  return AI_MODEL_LABELS[model] ?? 'AI'
}

/**
 * React hook — returns the display label for the text AI model currently
 * stored in user settings. Re-renders whenever settings change.
 */
export function useAIModelLabel(): string {
  const { data: settings } = useUserSettings()
  const model = settings?.ai_structuring_model ?? getAISettingsCache()?.ai_structuring_model ?? 'claude'
  return AI_MODEL_LABELS[model] ?? 'AI'
}
