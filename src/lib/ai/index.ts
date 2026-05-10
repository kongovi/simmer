import type { AITask, AIModel } from '../../types'

// Reads from user settings store — implemented in Session 8
function getModelForTask(_task: AITask): AIModel {
  return 'claude'
}

async function callAnthropic(_prompt: string): Promise<string> {
  throw new Error('Anthropic adapter not yet implemented (Session 2)')
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

export async function aiCall(task: AITask, prompt: string): Promise<string> {
  const model = getModelForTask(task)
  switch (model) {
    case 'claude':  return callAnthropic(prompt)
    case 'gpt4':    return callOpenAI(prompt)
    case 'gemini':  return callGemini(prompt)
    case 'local':   return callOllama(prompt)
    default:        return callAnthropic(prompt)
  }
}
