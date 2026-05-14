import type { AITask, AIModel } from '../../types'
import { getAISettingsCache }  from './settingsCache'
import { callAnthropic }       from './anthropic'
import { callOpenAI }          from './openai'
import { callGemini }          from './gemini'
import { callOllama }          from './ollama'

export { setAISettingsCache, getAISettingsCache } from './settingsCache'

/** Read model preference: per-task override → global model → fallback 'claude' */
function getModelForTask(task: AITask): AIModel {
  const cache = getAISettingsCache()
  if (!cache) return 'claude'
  const override = cache.task_model_overrides?.[task] as AIModel | undefined
  return override ?? cache.ai_structuring_model ?? 'claude'
}

export async function aiCall(
  task: AITask,
  prompt: string,
  opts?: { systemPrompt?: string; maxTokens?: number }
): Promise<string> {
  const model = getModelForTask(task)
  switch (model) {
    case 'claude':  return callAnthropic(prompt, opts)
    case 'gpt4':    return callOpenAI(prompt, opts)
    case 'gemini':  return callGemini(prompt, opts)
    case 'local':   return callOllama(prompt, opts)
    default:        return callAnthropic(prompt, opts)
  }
}
