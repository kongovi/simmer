/**
 * scripts/backfill-ingredient-images.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * PURPOSE
 *   Trigger AI image generation for a batch of ingredients_catalog rows that
 *   have no image yet (image_url IS NULL / image_status = 'pending'|'failed').
 *   Typically needed after a CSV order-history import, which creates catalog
 *   entries without auto-generating images (unlike recipe-save, which fires
 *   generation automatically).
 *
 * WHEN TO USE THIS AGAIN
 *   Run this whenever a bulk import (onboarding CSV, manual data load, etc.)
 *   leaves many ingredients with image_status = 'pending' or 'failed'.
 *   The ingredient list in the catalog will show pulsing amber dots for each
 *   row while generation is in flight.
 *
 * HOW TO REGENERATE THE `ingredients` ARRAY
 *   Run this SQL in the Supabase dashboard (SQL editor) to get the IDs/names
 *   of all catalog rows that still need images:
 *
 *     SELECT id, name
 *     FROM   ingredients_catalog
 *     WHERE  image_url IS NULL
 *       AND  image_status IN ('pending', 'failed')
 *     ORDER  BY name;
 *
 *   Copy the results into the `ingredients` array below as
 *   { id: '...uuid...', name: '...' } objects.
 *
 *   (The current list is from the May 2026 Instacart/Amazon CSV import
 *   for the Simmer family account — kept for historical reference.)
 *
 * USAGE
 *   node scripts/backfill-ingredient-images.mjs
 *
 * PREREQUISITES
 *   - .env.local must contain VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 *   - The generate-image Edge Function must be deployed
 *     (supabase functions deploy generate-image)
 *   - VITE_DEV_GOOGLE_AI_KEY is optional; the Edge Function uses its own
 *     GOOGLE_AI_API_KEY secret if not passed from the client
 *
 * BEHAVIOUR
 *   1. Bulk-PATCHes all listed ingredients to image_status='generating' so
 *      the app shows pulsing dots immediately
 *   2. POSTs to the generate-image Edge Function for each ingredient,
 *      staggered 350 ms apart to avoid rate-limit errors
 *   3. Images appear in the app in real-time via Supabase Realtime as each
 *      generation completes (no page refresh needed)
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// --- Load .env.local ---
const envPath = resolve(__dirname, '../.env.local')
const env = {}
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const [key, ...rest] = line.split('=')
  if (key && rest.length) env[key.trim()] = rest.join('=').trim()
}

const SUPABASE_URL  = env['VITE_SUPABASE_URL']
const ANON_KEY      = env['VITE_SUPABASE_ANON_KEY']
const GOOGLE_KEY    = env['VITE_DEV_GOOGLE_AI_KEY'] // fallback; edge fn uses its own secret

if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${ANON_KEY}`,
  'apikey': ANON_KEY,
}

// --- Fetch pending imported ingredients ---
// Ingredients without images — from direct DB query (RLS blocks anon REST reads).
// Regenerate this list by running:
//   SELECT id, name FROM ingredients_catalog
//   WHERE id IN (SELECT DISTINCT ingredient_id FROM purchase_history WHERE source='order_import')
//   AND image_url IS NULL AND image_status IN ('pending','failed') ORDER BY name;
const ingredients = [
  { id: '1e925ca2-d607-4263-9aa5-7336b74c32a3', name: 'Apple' },
  { id: 'bd217fcb-9759-4a0f-a7e5-5da6d65a5b10', name: 'Bacon' },
  { id: '141ded54-8196-4870-b4a1-a5313cf9e802', name: 'Banana' },
  { id: '388a11ee-b6a0-451f-aaec-0fc63b4be987', name: 'Blueberries' },
  { id: 'c5be64d3-3a99-40f6-81a7-f72a0b5856fb', name: 'Brioche Dinner Rolls' },
  { id: 'e777e7fe-04cc-4e41-80d4-5e2f44f58966', name: 'Broccoli' },
  { id: 'b02a449d-28d4-457b-94ee-575e17d123f9', name: 'Canned Corn' },
  { id: 'be9c19e9-c6a4-409f-9cce-b1a7d00527f5', name: 'Canned Kidney Beans' },
  { id: '24b9672a-4584-47a5-ace9-13d7ef0624ae', name: 'Carrots' },
  { id: '9ceb6326-0ddc-446b-8d99-2b634196b538', name: 'Cauliflower' },
  { id: '80fee0b4-7130-4670-a16f-b86e009c0f08', name: 'Dinosaur Kale' },
  { id: 'e1d80c65-754a-4c9a-8272-b91b0c391a71', name: 'French Fries' },
  { id: 'b2a0e8c3-35a6-498d-a32a-337fdf3b2aaa', name: 'Grapes' },
  { id: 'af716942-3632-403e-b015-e5052214ed77', name: 'Hot Dog Buns' },
  { id: '089aefee-d619-4a5a-a54d-df3757de59c0', name: 'Jalapeno' },
  { id: '06df3d79-e9ae-45c0-bd56-d5df676b80ac', name: 'Kiwi' },
  { id: '22ee4019-9c69-4d8c-ab3c-d881b0733ca3', name: 'Macaroni' },
  { id: '7616d839-3a9f-4812-a6e3-2ee19f7d3d23', name: 'Mandarin' },
  { id: 'f13cba23-051d-4a7e-9992-a2f28a51839a', name: 'Mushrooms' },
  { id: 'd2fc116c-3688-474e-9c8d-27c59eec542d', name: 'Naan' },
  { id: '03a866ea-c238-4bd6-80fb-1f13dc1517b5', name: 'Oatmeal' },
  { id: '64b6fd01-38ed-4049-9795-487177a0c248', name: 'Pancake Mix' },
  { id: 'd338d000-9703-4725-87bd-095d8334ece9', name: 'Pear' },
  { id: 'e70f9540-457f-4897-9df2-822f03fc4bc8', name: 'Peas' },
  { id: 'a09307ba-2d08-42cc-9169-68145686f6f2', name: 'Penne' },
  { id: '39ef6859-254b-4ea2-af63-3d74b8b95c13', name: 'Pepperoni' },
  { id: '883e0444-acfa-4965-82fe-bf570531fb53', name: 'Pesto' },
  { id: '2e688758-07ff-4980-85ff-6fbd27e73077', name: 'Popcorn' },
  { id: '093c0d9a-4d76-4bec-97db-68402987871f', name: 'Salad Dressing' },
  { id: 'd6ed9bae-9d12-4b0f-98eb-c6947d4c3883', name: 'Spaghetti' },
  { id: '318748c1-cd08-4466-b887-650277b38049', name: 'Spinach' },
  { id: 'ef97b599-5dc1-4dbe-ae1d-a421e78ef6af', name: 'Tater Tots' },
  { id: 'e6978b39-b078-4f37-b2ff-f7d1a314bb65', name: 'Thai Red Curry Paste' },
  { id: '214ad6b5-b4cd-4f7e-8420-a0d697da9e12', name: 'Tortillas' },
]

if (!ingredients.length) {
  console.log('No pending ingredients found — all already have images.')
  process.exit(0)
}

console.log(`Found ${ingredients.length} ingredients without images. Starting generation...\n`)

// --- Bulk-mark as 'generating' so the app shows pulsing dots immediately ---
const ids = ingredients.map(i => `"${i.id}"`).join(',')
await fetch(
  `${SUPABASE_URL}/rest/v1/ingredients_catalog?id=in.(${ingredients.map(i => i.id).join(',')})`,
  {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ image_status: 'generating' }),
  }
)
console.log(`Marked ${ingredients.length} ingredients as 'generating'\n`)

// --- Stagger edge function calls 350ms apart ---
const STAGGER_MS = 350
const edgeFnUrl  = `${SUPABASE_URL}/functions/v1/generate-image`

let succeeded = 0
let failed    = 0

for (let i = 0; i < ingredients.length; i++) {
  const ing = ingredients[i]
  await new Promise(r => setTimeout(r, i === 0 ? 0 : STAGGER_MS))

  const body = {
    ingredient: true,
    ingredientId: ing.id,
    ingredientName: ing.name,
    ...(GOOGLE_KEY ? { apiKey: GOOGLE_KEY } : {}),
  }

  try {
    const r = await fetch(edgeFnUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (r.status === 202 || r.ok) {
      console.log(`[${i + 1}/${ingredients.length}] ✓ queued  ${ing.name}`)
      succeeded++
    } else {
      const txt = await r.text()
      console.warn(`[${i + 1}/${ingredients.length}] ✗ failed  ${ing.name}  (${r.status}) ${txt.slice(0, 120)}`)
      failed++
    }
  } catch (err) {
    console.warn(`[${i + 1}/${ingredients.length}] ✗ error   ${ing.name}  ${err.message}`)
    failed++
  }
}

console.log(`\nDone — ${succeeded} queued, ${failed} failed.`)
console.log('Images will appear in the app as Realtime pushes each completion.')
