import { getApiKeyForModel } from './settingsCache'

interface GeminiPart {
  text: string
}

interface GeminiContent {
  role?: string
  parts: GeminiPart[]
}

interface GeminiResponse {
  candidates?: Array<{
    content: { parts: GeminiPart[] }
  }>
  error?: { message: string }
}

export async function callGemini(
  prompt: string,
  opts?: { systemPrompt?: string; maxTokens?: number }
): Promise<string> {
  const apiKey = getApiKeyForModel('gemini')
  if (!apiKey) throw new Error('No Google AI API key configured. Add it in Settings → AI Models.')

  const contents: GeminiContent[] = [{ role: 'user', parts: [{ text: prompt }] }]

  const body: Record<string, unknown> = {
    contents,
    generationConfig: { maxOutputTokens: opts?.maxTokens ?? 4096 },
  }
  if (opts?.systemPrompt) {
    body.systemInstruction = { parts: [{ text: opts.systemPrompt }] }
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`
  const res  = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })

  const data = await res.json() as GeminiResponse
  if (!res.ok || data.error) {
    throw new Error(`Gemini error: ${data.error?.message ?? res.statusText}`)
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned no content')
  return text
}
