import { getAISettingsCache } from './settingsCache'

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface OllamaResponse {
  message?: { content: string }
  error?:   string
}

export async function callOllama(
  prompt: string,
  opts?: { systemPrompt?: string }
): Promise<string> {
  const cache  = getAISettingsCache()
  const host   = cache?.ollama_host?.replace(/\/$/, '') ?? 'http://localhost:11434'
  const model  = 'llama3.2'  // default model; could be made configurable

  const messages: OllamaMessage[] = []
  if (opts?.systemPrompt) {
    messages.push({ role: 'system', content: opts.systemPrompt })
  }
  messages.push({ role: 'user', content: prompt })

  let res: Response
  try {
    res = await fetch(`${host}/api/chat`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model, messages, stream: false }),
    })
  } catch (e) {
    throw new Error(`Cannot reach Ollama at ${host}. Make sure it is running and CORS is allowed.`)
  }

  const data = await res.json() as OllamaResponse
  if (!res.ok || data.error) {
    throw new Error(`Ollama error: ${data.error ?? res.statusText}`)
  }

  if (!data.message?.content) throw new Error('Ollama returned no content')
  return data.message.content
}
