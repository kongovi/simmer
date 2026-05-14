import { supabase } from '../supabase'
import { getApiKeyForModel } from './settingsCache'

/** Call the ai-call Edge Function which proxies to Anthropic server-side (avoids CORS). */
export async function callAnthropic(
  prompt: string,
  opts?: { systemPrompt?: string; maxTokens?: number }
): Promise<string> {
  const apiKey = getApiKeyForModel('claude')
  if (!apiKey) throw new Error('No Anthropic API key configured. Add it in Settings → AI Models.')

  const { data, error } = await supabase.functions.invoke('ai-call', {
    body: {
      prompt,
      apiKey,
      model: 'claude-sonnet-4-5',
      maxTokens: opts?.maxTokens ?? 4096,
      systemPrompt: opts?.systemPrompt,
    },
  })

  if (error) throw new Error(`ai-call edge function error: ${error.message}`)
  if (data?.error) throw new Error(`Anthropic error: ${data.error}`)

  return data.text as string
}
