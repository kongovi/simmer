import { supabase } from '../supabase'

/**
 * Nano Banana 2 adapter — calls the `generate-image` Supabase Edge Function.
 * Uses Gemini Flash models (with Imagen 3 fallback) server-side.
 *
 * Returns the public Storage URL on success, or '' on failure (non-blocking caller
 * should not care — Realtime will push the update when the image is ready).
 */
export async function callNanoBanana2(prompt: string, recipeId: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    console.warn('nanoBanana: no session — skipping image generation')
    return ''
  }

  // The edge function prefers its GOOGLE_AI_API_KEY server secret.
  // Pass the client key too as a fallback (for local dev without the secret set).
  const clientApiKey = import.meta.env.VITE_DEV_GOOGLE_AI_KEY as string | undefined

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-image`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
      body: JSON.stringify({ recipeId, prompt, apiKey: clientApiKey }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    console.error('nanoBanana: Edge Function error', res.status, err)
    return ''
  }

  const json = await res.json() as { url?: string; error?: string }
  if (json.error) {
    console.error('nanoBanana: generation error', json.error)
    return ''
  }

  return json.url ?? ''
}
