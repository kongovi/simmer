import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Gemini models that support native image output (responseModalities: IMAGE).
// Try in order — first success wins; Imagen 3 is the final fallback.
const _CODE_DEFAULT_MODELS = ['gemini-3.1-flash-image-preview', 'gemini-2.0-flash-exp', 'gemini-2.0-flash-preview']
const _envModels = (Deno.env.get('GEMINI_IMAGE_MODELS') ?? '')
  .split(',').map(s => s.trim()).filter(Boolean)
const _seen = new Set<string>()
const FLASH_MODELS = [..._envModels, ..._CODE_DEFAULT_MODELS]
  .filter(m => !_seen.has(m) && !!_seen.add(m))

/** Ingredient image prompt template */
function buildIngredientPrompt(name: string): string {
  return `A single ${name}, isometric 3/4 view, the subject filling 80% of the frame, 512x512 pixels, rendered in Retro-Pop art style. Thick clean black outlines. Vintage muted color palette: cream, teal, burnt orange, mustard yellow. Shadows rendered as halftone dot texture. Solid warm off-white background #F5F0E8. No text, no labels, no other objects, no plate or surface — just the ingredient itself.`
}

/** Safe chunked bytes → base64 (avoids stack overflow on large arrays) */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

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

/** Generate image bytes via NB2 model chain (Flash models → Imagen 3 fallback). */
async function generateImageBytes(prompt: string, apiKey: string): Promise<Uint8Array> {
  const errors: string[] = []

  for (const model of FLASH_MODELS) {
    try {
      const bytes = await callGeminiFlash(model, prompt, apiKey)
      console.log(`Image generated with ${model}`)
      return bytes
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`${model}: ${msg}`)
      console.warn(`Flash model failed [${model}]:`, msg)
    }
  }

  try {
    const bytes = await callImagen3(prompt, apiKey)
    console.log('Image generated with Imagen 3')
    return bytes
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    errors.push(`imagen-3: ${msg}`)
    throw new Error(`All image models failed: ${errors.join('; ')}`)
  }
}

/**
 * Remove background using Replicate's 851-labs/background-remover model.
 * Uses "Prefer: wait" for a synchronous response (falls back to polling).
 * Returns PNG bytes with transparent background, or throws.
 */
async function removeBackground(imageBytes: Uint8Array, replicateKey: string): Promise<Uint8Array> {
  const dataUri = `data:image/jpeg;base64,${bytesToBase64(imageBytes)}`

  console.log(`Replicate bg-remove: sending ${imageBytes.length} bytes`)

  // Create prediction — "Prefer: wait" requests synchronous response (≤60s)
  const createRes = await fetch(
    'https://api.replicate.com/v1/models/851-labs/background-remover/predictions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${replicateKey}`,
        'Content-Type': 'application/json',
        Prefer: 'wait=60',
      },
      body: JSON.stringify({ input: { image: dataUri } }),
    }
  )

  if (!createRes.ok) {
    const body = await createRes.text()
    throw new Error(`Replicate HTTP ${createRes.status}: ${body}`)
  }

  let prediction = await createRes.json() as {
    id: string
    status: string
    output?: string
    error?: string
  }

  // If "Prefer: wait" already resolved it, use the output directly
  if (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
    // Poll until done (max 30 attempts × 2s = 60s)
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise(r => setTimeout(r, 2000))

      const pollRes = await fetch(
        `https://api.replicate.com/v1/predictions/${prediction.id}`,
        { headers: { Authorization: `Bearer ${replicateKey}` } }
      )
      if (pollRes.ok) {
        prediction = await pollRes.json()
        if (prediction.status === 'succeeded' || prediction.status === 'failed') break
      }
    }
  }

  if (prediction.status === 'failed' || !prediction.output) {
    throw new Error(`Replicate bg-remove failed: ${prediction.error ?? 'no output'}`)
  }

  console.log(`Replicate bg-remove succeeded, downloading output`)

  // Download the resulting PNG (transparent background)
  const imgRes = await fetch(prediction.output)
  if (!imgRes.ok) throw new Error(`Failed to download Replicate output: ${imgRes.status}`)
  const buf = await imgRes.arrayBuffer()
  console.log(`Replicate bg-remove: received ${buf.byteLength} bytes PNG`)
  return new Uint8Array(buf)
}

/**
 * Resize image bytes so neither dimension exceeds maxDimension.
 * asJpeg=true → re-encodes as JPEG (for opaque fallback images)
 * asJpeg=false → re-encodes as PNG (preserves transparency from bg-remove)
 */
async function resizeImage(bytes: Uint8Array, maxDimension: number, asJpeg: boolean): Promise<Uint8Array> {
  const img = await Image.decode(bytes)
  const longest = Math.max(img.width, img.height)
  if (longest > maxDimension) {
    const scale = maxDimension / longest
    img.resize(Math.round(img.width * scale), Math.round(img.height * scale))
  }
  const resized = asJpeg
    ? await img.encodeJPEG(85)
    : await img.encode(3) // PNG compression level 3
  console.log(`Resized: ${img.width}×${img.height} → ${bytes.length}B → ${resized.length}B`)
  return resized
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })

  let body: {
    recipeId?: string
    prompt?: string
    apiKey?: string
    ingredient?: boolean
    ingredientId?: string
    ingredientName?: string
    customPromptAddition?: string
  } = {}
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const { recipeId, prompt, apiKey: clientApiKey, ingredient, ingredientId, ingredientName, customPromptAddition } = body

  // ── INGREDIENT MODE ────────────────────────────────────────────────────────
  if (ingredient === true) {
    try {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return new Response(JSON.stringify({ error: 'No authorization header' }), {
          status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        })
      }

      if (!ingredientId || !ingredientName) {
        return new Response(JSON.stringify({ error: 'Missing ingredientId or ingredientName' }), {
          status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        })
      }

      const apiKey = Deno.env.get('GOOGLE_AI_API_KEY') || clientApiKey
      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'No Google API key' }), {
          status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        })
      }

      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      )

      // Mark as generating
      await supabaseAdmin
        .from('ingredients_catalog')
        .update({ image_status: 'generating' })
        .eq('id', ingredientId)

      // Generate image — base prompt + optional custom addition
      const baseIngredientPrompt = buildIngredientPrompt(ingredientName)
      const imgPrompt = customPromptAddition?.trim()
        ? `${baseIngredientPrompt}\n\nAdditional guidance: ${customPromptAddition.trim()}`
        : baseIngredientPrompt
      const jpegBytes = await generateImageBytes(imgPrompt, apiKey)

      // Try Replicate background removal
      let finalBytes = jpegBytes
      let fileName = `${ingredientId}.png`
      let contentType = 'image/png'

      const replicateKey = Deno.env.get('REPLICATE_API_KEY')
      console.log(`REPLICATE_API_KEY present: ${!!replicateKey}`)
      if (replicateKey) {
        try {
          finalBytes = await removeBackground(jpegBytes, replicateKey)
          console.log(`Replicate bg-remove success for ingredient ${ingredientId}`)
        } catch (bgErr) {
          console.error(`Replicate bg-remove failed for ${ingredientId}:`, bgErr instanceof Error ? bgErr.message : String(bgErr))
          // Fall back to original JPEG
          finalBytes = jpegBytes
          contentType = 'image/jpeg'
          fileName = `${ingredientId}.jpg`
        }
      } else {
        console.warn('REPLICATE_API_KEY not set — skipping background removal')
        contentType = 'image/jpeg'
        fileName = `${ingredientId}.jpg`
      }

      // Resize to 256×256 max before uploading
      finalBytes = await resizeImage(finalBytes, 256, contentType === 'image/jpeg')

      // Upload to ingredient-images bucket
      const { error: uploadErr } = await supabaseAdmin.storage
        .from('ingredient-images')
        .upload(fileName, finalBytes, { contentType, upsert: true })
      if (uploadErr) throw uploadErr

      const { data: { publicUrl } } = supabaseAdmin.storage
        .from('ingredient-images')
        .getPublicUrl(fileName)

      // Update catalog row
      const { error: updateErr } = await supabaseAdmin
        .from('ingredients_catalog')
        .update({ image_url: publicUrl, image_status: 'done' })
        .eq('id', ingredientId)
      if (updateErr) throw updateErr

      return new Response(JSON.stringify({ url: publicUrl }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })

    } catch (err) {
      console.error('generate-image ingredient error:', err)

      if (ingredientId) {
        try {
          const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
          )
          await supabaseAdmin
            .from('ingredients_catalog')
            .update({ image_status: 'failed' })
            .eq('id', ingredientId)
        } catch (e2) {
          console.error('Failed to mark ingredient as failed:', e2)
        }
      }

      return new Response(
        JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
      )
    }
  }

  // ── RECIPE MODE ────────────────────────────────────────────────────────────
  try {
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

    const apiKey = Deno.env.get('GOOGLE_AI_API_KEY') || clientApiKey
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'No Google API key — set GOOGLE_AI_API_KEY secret or pass apiKey in body' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }
    console.log('Using API key source:', Deno.env.get('GOOGLE_AI_API_KEY') ? 'server secret' : 'client-passed')

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Mark as generating
    await supabaseAdmin
      .from('recipes')
      .update({ image_status: 'generating', updated_at: new Date().toISOString() })
      .eq('id', recipeId)

    // Generate image — append custom addition if provided (without polluting nb2_prompt in DB)
    const fullPrompt = customPromptAddition?.trim()
      ? `${prompt}\n\nAdditional guidance: ${customPromptAddition.trim()}`
      : prompt
    const rawBytes = await generateImageBytes(fullPrompt, apiKey)
    // Resize to 512×512 max
    const imageBytes = await resizeImage(rawBytes, 512, true)

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
