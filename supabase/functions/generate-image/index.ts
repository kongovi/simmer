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
 * POST to a Replicate predictions endpoint, retrying once after 15s on 429.
 * Uses Prefer: wait=60 for synchronous resolution.
 */
async function replicatePost(
  body: string,
  replicateKey: string,
): Promise<Response> {
  const url = 'https://api.replicate.com/v1/predictions'
  const headers = {
    Authorization: `Bearer ${replicateKey}`,
    'Content-Type': 'application/json',
    Prefer: 'wait=60',
  }
  let res = await fetch(url, { method: 'POST', headers, body })
  if (res.status === 429) {
    console.warn('Replicate 429 rate limit — waiting 15s before retry')
    await new Promise(r => setTimeout(r, 15000))
    res = await fetch(url, { method: 'POST', headers, body })
  }
  return res
}

/**
 * Run a single Replicate prediction for lucataco/remove-bg given a known version hash.
 * Handles polling if Prefer:wait doesn't resolve it in time.
 * Returns PNG bytes or throws.
 */
async function runReplicatePrediction(
  versionId: string,
  dataUri: string,
  replicateKey: string,
): Promise<Uint8Array> {
  console.log(`Trying lucataco/remove-bg version: ${versionId.slice(0, 8)}`)
  const createRes = await replicatePost(
    JSON.stringify({ version: versionId, input: { image: dataUri } }),
    replicateKey,
  )

  if (!createRes.ok) {
    const errBody = await createRes.text()
    throw new Error(`Replicate HTTP ${createRes.status}: ${errBody.slice(0, 300)}`)
  }

  let prediction = await createRes.json() as {
    id: string; status: string; output?: string | string[]; error?: string
  }

  // "Prefer: wait" may have already resolved it; poll if not
  if (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
    for (let i = 0; i < 30; i++) {
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
    throw new Error(`Replicate prediction failed: ${prediction.error ?? 'no output'}`)
  }

  const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output
  const imgRes = await fetch(outputUrl)
  if (!imgRes.ok) throw new Error(`Failed to download Replicate output: ${imgRes.status}`)
  const buf = await imgRes.arrayBuffer()
  console.log(`Replicate bg-remove succeeded: ${buf.byteLength} bytes PNG`)
  return new Uint8Array(buf)
}

/**
 * Scrape https://replicate.com/lucataco/remove-bg/examples to find the current
 * version hash. Tries regex first; falls back to asking Claude if regex misses.
 * Returns the hash string or null if nothing could be found.
 */
async function scrapeVersionFromReplicate(): Promise<string | null> {
  try {
    const pageRes = await fetch('https://replicate.com/lucataco/remove-bg/examples')
    if (!pageRes.ok) {
      console.warn(`Scrape fetch failed: ${pageRes.status}`)
      return null
    }
    const html = await pageRes.text()

    // Try regex first — version hashes are embedded as JSON in the page
    const regexMatch = html.match(/"version":\s*"([a-f0-9]{40,64})"/)
    if (regexMatch) {
      console.log(`Scraped version via regex: ${regexMatch[1].slice(0, 8)}`)
      return regexMatch[1]
    }

    // Fallback: ask Claude to extract it from the page HTML
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) {
      console.warn('Scrape regex found nothing and ANTHROPIC_API_KEY is not set')
      return null
    }

    console.log('Regex found no version — asking Claude to scrape the page')
    const snippet = html.slice(0, 30000) // first 30k chars covers most embedded JSON
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `This is the HTML of a Replicate model page. Extract the model version hash — a 40–64 character lowercase hexadecimal string. Return ONLY the hash, nothing else.\n\n${snippet}`,
        }],
      }),
    })

    if (!aiRes.ok) {
      console.warn(`Claude scrape request failed: ${aiRes.status}`)
      return null
    }

    const aiJson = await aiRes.json()
    const text = (aiJson?.content?.[0]?.text ?? '').trim()
    if (/^[a-f0-9]{40,64}$/i.test(text)) {
      console.log(`Scraped version via Claude: ${text.slice(0, 8)}`)
      return text
    }

    console.warn(`Claude returned non-hash text: "${text.slice(0, 60)}"`)
    return null
  } catch (e) {
    console.warn('scrapeVersionFromReplicate error:', e)
    return null
  }
}

/**
 * Remove background via Replicate lucataco/remove-bg.
 * Attempt 1: resolve latest version via Replicate model API, run prediction.
 * Attempt 2 (on any failure): scrape the examples page (regex → Claude) for the
 *   version hash, then retry once more.
 * If both attempts fail, throws — caller falls back to the original JPEG silently.
 */
async function removeBackground(imageBytes: Uint8Array, replicateKey: string): Promise<Uint8Array> {
  const smallBytes = await resizeImage(imageBytes, 1024, true)
  const dataUri = `data:image/jpeg;base64,${bytesToBase64(smallBytes)}`
  console.log(`Replicate bg-remove: ${smallBytes.length} bytes (resized from ${imageBytes.length})`)

  // ── Attempt 1: version from Replicate model API ────────────────────────────
  try {
    const modelInfoRes = await fetch(
      'https://api.replicate.com/v1/models/lucataco/remove-bg',
      { headers: { Authorization: `Bearer ${replicateKey}` } }
    )
    if (!modelInfoRes.ok) throw new Error(`Model info HTTP ${modelInfoRes.status}`)
    const modelInfo = await modelInfoRes.json() as { latest_version?: { id: string } }
    const versionId = modelInfo.latest_version?.id
    if (!versionId) throw new Error('No latest_version in model info')
    return await runReplicatePrediction(versionId, dataUri, replicateKey)
  } catch (e1) {
    console.warn(`bg-remove attempt 1 failed: ${e1 instanceof Error ? e1.message : e1}`)
  }

  // ── Attempt 2: scrape version from examples page (regex → Claude) ──────────
  console.log('Falling back to scraping replicate.com for version hash')
  const scrapedVersion = await scrapeVersionFromReplicate()
  if (!scrapedVersion) {
    throw new Error('Could not determine Replicate version hash from API or scrape')
  }
  return await runReplicatePrediction(scrapedVersion, dataUri, replicateKey)
  // If this also throws, it propagates up — processIngredient catches it and
  // silently falls back to the original JPEG
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

// ── Background workers ────────────────────────────────────────────────────────
// These run after the 202 response is sent, kept alive by EdgeRuntime.waitUntil.

type SupabaseAdmin = ReturnType<typeof createClient>

async function processIngredient(
  supabaseAdmin: SupabaseAdmin,
  ingredientId: string,
  ingredientName: string,
  apiKey: string,
  replicateKey: string | undefined,
  customPromptAddition: string | undefined,
): Promise<void> {
  try {
    const baseIngredientPrompt = buildIngredientPrompt(ingredientName)
    const imgPrompt = customPromptAddition?.trim()
      ? `${baseIngredientPrompt}\n\nAdditional guidance: ${customPromptAddition.trim()}`
      : baseIngredientPrompt
    const jpegBytes = await generateImageBytes(imgPrompt, apiKey)

    // Background removal via Replicate
    let finalBytes = jpegBytes
    let fileName = `${ingredientId}.png`
    let contentType = 'image/png'

    console.log(`REPLICATE_API_KEY present: ${!!replicateKey}`)

    if (replicateKey) {
      try {
        finalBytes = await removeBackground(jpegBytes, replicateKey)
        console.log(`BG removal success for ingredient ${ingredientId}`)
      } catch (bgErr) {
        console.error(`BG removal failed for ${ingredientId}:`, bgErr instanceof Error ? bgErr.message : String(bgErr))
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

    const { error: uploadErr } = await supabaseAdmin.storage
      .from('ingredient-images')
      .upload(fileName, finalBytes, { contentType, upsert: true })
    if (uploadErr) throw uploadErr

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('ingredient-images')
      .getPublicUrl(fileName)

    const { error: updateErr } = await supabaseAdmin
      .from('ingredients_catalog')
      .update({ image_url: publicUrl, image_status: 'done' })
      .eq('id', ingredientId)
    if (updateErr) throw updateErr

    console.log(`Ingredient ${ingredientId} image done: ${publicUrl}`)
  } catch (err) {
    console.error('processIngredient error:', err)
    try {
      await supabaseAdmin
        .from('ingredients_catalog')
        .update({ image_status: 'failed' })
        .eq('id', ingredientId)
    } catch (e2) {
      console.error('Failed to mark ingredient as failed:', e2)
    }
  }
}

async function processRecipe(
  supabaseAdmin: SupabaseAdmin,
  recipeId: string,
  prompt: string,
  apiKey: string,
  customPromptAddition: string | undefined,
): Promise<void> {
  try {
    const fullPrompt = customPromptAddition?.trim()
      ? `${prompt}\n\nAdditional guidance: ${customPromptAddition.trim()}`
      : prompt
    const rawBytes = await generateImageBytes(fullPrompt, apiKey)
    const imageBytes = await resizeImage(rawBytes, 512, true)

    const fileName = `${recipeId}.jpg`
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('recipe-images')
      .upload(fileName, imageBytes, { contentType: 'image/jpeg', upsert: true })
    if (uploadErr) throw uploadErr

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('recipe-images')
      .getPublicUrl(fileName)

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

    console.log(`Recipe ${recipeId} image done: ${publicUrl}`)
  } catch (err) {
    console.error('processRecipe error:', err)
    try {
      await supabaseAdmin
        .from('recipes')
        .update({ image_status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', recipeId)
    } catch (e2) {
      console.error('Failed to mark recipe as failed:', e2)
    }
  }
}

// ── Request handler ───────────────────────────────────────────────────────────

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

  // Auth check
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'No authorization header' }), {
      status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  // Input validation
  if (ingredient === true && (!ingredientId || !ingredientName)) {
    return new Response(JSON.stringify({ error: 'Missing ingredientId or ingredientName' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
  if (!ingredient && (!recipeId || !prompt)) {
    return new Response(JSON.stringify({ error: 'Missing recipeId or prompt' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const apiKey = Deno.env.get('GOOGLE_AI_API_KEY') || clientApiKey
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'No Google API key' }), {
      status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  const replicateKey = Deno.env.get('REPLICATE_API_KEY')
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Mark as generating (synchronous — happens before we return 202)
  if (ingredient === true) {
    await supabaseAdmin
      .from('ingredients_catalog')
      .update({ image_status: 'generating' })
      .eq('id', ingredientId)
  } else {
    await supabaseAdmin
      .from('recipes')
      .update({ image_status: 'generating', updated_at: new Date().toISOString() })
      .eq('id', recipeId)
  }

  const mode = ingredient === true ? 'ingredient' : 'recipe'
  const targetId = ingredient === true ? ingredientId : recipeId
  console.log(`generate-image: ${mode} ${targetId} — kicking off background work`)

  // Kick off the real work in the background — survives client disconnect
  const workPromise = ingredient === true
    ? processIngredient(supabaseAdmin, ingredientId!, ingredientName!, apiKey, replicateKey, customPromptAddition)
    : processRecipe(supabaseAdmin, recipeId!, prompt!, apiKey, customPromptAddition)

  // EdgeRuntime.waitUntil keeps the isolate alive after the response is sent.
  // Guard with typeof check: if not available (older runtime), run inline instead.
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime
  if (runtime?.waitUntil) {
    runtime.waitUntil(workPromise)
    console.log(`generate-image: returning 202, work continues in background`)
    return new Response(JSON.stringify({ queued: true }), {
      status: 202,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }

  // Fallback: runtime doesn't support waitUntil — process inline
  console.log(`generate-image: EdgeRuntime.waitUntil unavailable, processing inline`)
  await workPromise
  return new Response(JSON.stringify({ done: true }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
})
