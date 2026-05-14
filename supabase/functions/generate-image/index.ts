import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Gemini models that support native image output (responseModalities: IMAGE).
// Try in order — first success wins; Imagen 3 is the final fallback.
//
// Future-proofing: set the GEMINI_IMAGE_MODELS Supabase secret to a
// comma-separated list of model names to override without redeploying.
// e.g.  gemini-2.5-flash-exp,gemini-2.0-flash-exp
// Models from the secret are tried first; hardcoded defaults follow as fallback.
const _CODE_DEFAULT_MODELS = ['gemini-3.1-flash-image-preview', 'gemini-2.0-flash-exp', 'gemini-2.0-flash-preview']
const _envModels = (Deno.env.get('GEMINI_IMAGE_MODELS') ?? '')
  .split(',').map(s => s.trim()).filter(Boolean)
const _seen = new Set<string>()
const FLASH_MODELS = [..._envModels, ..._CODE_DEFAULT_MODELS]
  .filter(m => !_seen.has(m) && !!_seen.add(m))

/** Call a Gemini Flash image-gen model. Returns JPEG bytes or throws. */
async function callGeminiFlash(model: string, prompt: string, apiKey: string): Promise<Uint8Array> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    }
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`${model} HTTP ${res.status}: ${body}`)
  }

  const json = await res.json()
  // Log the raw response shape to help diagnose unexpected formats
  console.log(`${model} response candidates:`, JSON.stringify(json?.candidates?.[0]?.content?.parts?.map((p: Record<string, unknown>) => Object.keys(p)) ?? []))
  const parts = json?.candidates?.[0]?.content?.parts ?? []
  const imagePart = parts.find((p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData?.mimeType?.startsWith('image/'))
  if (!imagePart?.inlineData?.data) throw new Error(`${model}: no image in response`)

  const b64 = imagePart.inlineData.data
  const raw = atob(b64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** Call Imagen 3 (fallback). Returns JPEG bytes or throws. */
async function callImagen3(prompt: string, apiKey: string): Promise<Uint8Array> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: { sampleCount: 1 },
      }),
    }
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Imagen 3 HTTP ${res.status}: ${body}`)
  }

  const json = await res.json()
  const b64 = json?.predictions?.[0]?.bytesBase64Encoded
  if (!b64) throw new Error('Imagen 3: no image in response')

  const raw = atob(b64)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  // Parse body first (only once)
  let body: { recipeId?: string; prompt?: string; apiKey?: string } = {}
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const { recipeId, prompt, apiKey: clientApiKey } = body

  try {
    // Verify JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    if (!recipeId || !prompt) {
      return new Response(JSON.stringify({ error: 'Missing recipeId or prompt' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // Prefer the server-side Supabase secret (set once in dashboard, never exposed to client).
    // Fall back to the client-passed key so existing callers keep working.
    const apiKey = Deno.env.get('GOOGLE_AI_API_KEY') || clientApiKey
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'No Google API key — set GOOGLE_AI_API_KEY secret or pass apiKey in body' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }
    console.log('Using API key source:', Deno.env.get('GOOGLE_AI_API_KEY') ? 'server secret' : 'client-passed')

    // Service-role admin client for Storage + DB writes
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Mark as generating
    await supabaseAdmin
      .from('recipes')
      .update({ image_status: 'generating', updated_at: new Date().toISOString() })
      .eq('id', recipeId)

    // Generate image — Flash models first, then Imagen fallback
    let imageBytes: Uint8Array | null = null
    const errors: string[] = []

    for (const model of FLASH_MODELS) {
      try {
        imageBytes = await callGeminiFlash(model, prompt, apiKey)
        console.log(`Image generated with ${model}`)
        break
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(`${model}: ${msg}`)
        console.warn(`Flash model failed [${model}]:`, msg)
      }
    }

    if (!imageBytes) {
      try {
        imageBytes = await callImagen3(prompt, apiKey)
        console.log('Image generated with Imagen 3')
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        errors.push(`imagen-3: ${msg}`)
        throw new Error(`All image models failed: ${errors.join('; ')}`)
      }
    }

    // Upload to recipe-images/{recipeId}.jpg
    const fileName = `${recipeId}.jpg`
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('recipe-images')
      .upload(fileName, imageBytes, {
        contentType: 'image/jpeg',
        upsert: true,
      })
    if (uploadErr) throw uploadErr

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('recipe-images')
      .getPublicUrl(fileName)

    // Update recipe with final image_url + status
    const { error: updateErr } = await supabaseAdmin
      .from('recipes')
      .update({
        image_url: publicUrl,
        image_status: 'done',
        nb2_prompt: prompt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', recipeId)
    if (updateErr) throw updateErr

    return new Response(JSON.stringify({ url: publicUrl }), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('generate-image error:', err)

    // Best-effort: mark recipe as failed
    if (recipeId) {
      try {
        const supabaseAdmin = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )
        await supabaseAdmin
          .from('recipes')
          .update({ image_status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', recipeId)
      } catch (e2) {
        console.error('Failed to mark recipe as failed:', e2)
      }
    }

    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )
  }
})
