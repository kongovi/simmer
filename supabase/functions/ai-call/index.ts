import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { prompt, apiKey, model = 'claude-sonnet-4-5', maxTokens = 4096, systemPrompt } =
      await req.json() as { prompt: string; apiKey: string; model?: string; maxTokens?: number; systemPrompt?: string }

    if (!prompt) return new Response(JSON.stringify({ error: 'prompt required' }), { status: 400, headers: CORS })
    if (!apiKey)  return new Response(JSON.stringify({ error: 'apiKey required' }),  { status: 400, headers: CORS })

    const requestBody: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }
    if (systemPrompt) requestBody.system = systemPrompt

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody),
    })

    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`Anthropic ${res.status}: ${errBody}`)
    }

    const data = await res.json() as { content: { type: string; text: string }[] }
    const text = data.content.find(c => c.type === 'text')?.text ?? ''

    return new Response(JSON.stringify({ text }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: CORS })
  }
})
