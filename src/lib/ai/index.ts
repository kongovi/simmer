import type { AITask, AIModel } from '../../types'
import { callAnthropic } from './anthropic'

// Reads model preference from user settings — full implementation in Session 8
function getModelForTask(_task: AITask): AIModel {
  return 'claude'
}

async function callOpenAI(_prompt: string): Promise<string> {
  throw new Error('OpenAI adapter not yet implemented')
}

async function callGemini(_prompt: string): Promise<string> {
  throw new Error('Gemini adapter not yet implemented')
}

async function callOllama(_prompt: string): Promise<string> {
  throw new Error('Ollama adapter not yet implemented')
}

export async function aiCall(
  task: AITask,
  prompt: string,
  opts?: { systemPrompt?: string; maxTokens?: number }
): Promise<string> {
  const model = getModelForTask(task)
  switch (model) {
    case 'claude':  return callAnthropic(prompt, opts)
    case 'gpt4':    return callOpenAI(prompt)
    case 'gemini':  return callGemini(prompt)
    case 'local':   return callOllama(prompt)
    default:        return callAnthropic(prompt, opts)
  }
}
