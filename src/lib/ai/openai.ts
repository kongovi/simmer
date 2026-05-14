import { getApiKeyForModel } from './settingsCache'

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface OpenAIResponse {
  choices: Array<{
    message: { content: string }
  }>
  error?: { message: string }
}

export async function callOpenAI(
  prompt: string,
  opts?: { systemPrompt?: string; maxTokens?: number }
): Promise<string> {
  const apiKey = getApiKeyForModel('gpt4')
  if (!apiKey) throw new Error('No OpenAI API key configured. Add it in Settings → AI Models.')

  const messages: OpenAIMessage[] = []
  if (opts?.systemPrompt) {
    messages.push({ role: 'system', content: opts.systemPrompt })
  }
  messages.push({ role: 'user', content: prompt })

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model:      'gpt-4o',
      messages,
      max_tokens: opts?.maxTokens ?? 4096,
    }),
  })

  const data = await res.json() as OpenAIResponse
  if (!res.ok || data.error) {
    throw new Error(`OpenAI error: ${data.error?.message ?? res.statusText}`)
  }

  return data.choices[0].message.content
}
