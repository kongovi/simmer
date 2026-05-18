#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write

/**
 * Generates one retro-pop ingredient image per grocery aisle using the
 * existing generate-image edge function (Gemini + Replicate bg removal),
 * then writes the resulting public URLs into src/lib/aisleUtils.ts.
 *
 * Run: deno run --allow-net --allow-read --allow-write scripts/generate-aisle-images.ts
 */

const SUPABASE_URL     = 'https://prxexzcyfcwvdhjrcwfw.supabase.co'
const ANON_KEY         = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByeGV4emN5ZmN3dmRoanJjd2Z3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyOTMwOTcsImV4cCI6MjA5Mzg2OTA5N30.gwx6W45nPsvfC52dDqocj7gBt0kAtHS_pOn3Z6jlqvY'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByeGV4emN5ZmN3dmRoanJjd2Z3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODI5MzA5NywiZXhwIjoyMDkzODY5MDk3fQ.FJ9-YDUbzgsQd37oDb1lMXtoHQLbTqI-ZPwvOZTSPtE'
const STORAGE_BASE     = `${SUPABASE_URL}/storage/v1/object/public/ingredient-images`
const EDGE_FN          = `${SUPABASE_URL}/functions/v1/generate-image`
const AISLE_UTILS_PATH = new URL('../src/lib/aisleUtils.ts', import.meta.url).pathname

// One representative subject per aisle (matches AISLE_LABELS order)
const AISLES = [
  { order: 1,  id: 'aisle-1',  label: 'Produce',        subject: 'fresh broccoli' },
  { order: 2,  id: 'aisle-2',  label: 'Meat & Fish',    subject: 'raw salmon fillet' },
  { order: 3,  id: 'aisle-3',  label: 'Frozen',         subject: 'frozen peas in bag' },
  { order: 4,  id: 'aisle-4',  label: 'Snacks',         subject: 'potato chips bag' },
  { order: 5,  id: 'aisle-5',  label: 'Canned & Dry',   subject: 'tin can of tomatoes' },
  { order: 6,  id: 'aisle-6',  label: 'Oils & Spices',  subject: 'olive oil bottle' },
  { order: 7,  id: 'aisle-7',  label: 'Dairy & Eggs',   subject: 'chicken eggs' },
  { order: 8,  id: 'aisle-8',  label: 'Bread & Bakery', subject: 'sourdough bread loaf' },
  { order: 9,  id: 'aisle-9',  label: 'Deli & Prepared', subject: 'deli turkey slices' },
  { order: 10, id: 'aisle-10', label: 'Beverages',      subject: 'orange juice carton' },
  { order: 11, id: 'aisle-11', label: 'Household',      subject: 'dish soap bottle' },
  { order: 12, id: 'aisle-12', label: 'Other',          subject: 'shopping basket' },
]

// ── Step 1: trigger all generations in parallel ───────────────────────────────

console.log('Triggering image generation for all aisles…\n')

await Promise.all(AISLES.map(async (aisle) => {
  const res = await fetch(EDGE_FN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify({
      ingredient:     true,
      ingredientId:   aisle.id,
      ingredientName: aisle.subject,
    }),
  })
  const text = await res.text()
  console.log(`  [${res.status}] ${aisle.label} (${aisle.subject}): ${text.slice(0, 60)}`)
}))

// ── Step 2: poll storage until all files appear (max 5 min) ──────────────────

console.log('\nPolling storage for completed images (up to 5 min)…\n')

const results = new Map<number, string>()   // aisle order → public URL
const maxAttempts = 30                       // 30 × 10s = 5 min
const done = new Set<string>()

for (let attempt = 0; attempt < maxAttempts; attempt++) {
  await new Promise(r => setTimeout(r, 10_000))

  for (const aisle of AISLES) {
    if (done.has(aisle.id)) continue

    // Check for .png first (bg removal succeeded), then .jpg (fallback)
    for (const ext of ['png', 'jpg']) {
      const url = `${STORAGE_BASE}/${aisle.id}.${ext}`
      const head = await fetch(url, { method: 'HEAD' }).catch(() => null)
      if (head?.ok) {
        results.set(aisle.order, url)
        done.add(aisle.id)
        console.log(`  ✓ ${aisle.label} → ${aisle.id}.${ext}`)
        break
      }
    }
  }

  const remaining = AISLES.length - done.size
  if (remaining === 0) break
  console.log(`  … ${done.size}/${AISLES.length} done (attempt ${attempt + 1}/${maxAttempts})`)
}

if (done.size < AISLES.length) {
  const missing = AISLES.filter(a => !done.has(a.id)).map(a => a.label)
  console.warn(`\n⚠ Timed out — still waiting for: ${missing.join(', ')}`)
  console.warn('Re-run the script or add these URLs manually.\n')
}

if (results.size === 0) {
  console.error('No images generated. Aborting aisleUtils.ts update.')
  Deno.exit(1)
}

// ── Step 3: update aisleUtils.ts ─────────────────────────────────────────────

console.log('\nWriting AISLE_IMAGES to aisleUtils.ts…')

const existing = await Deno.readTextFile(AISLE_UTILS_PATH)

// Build the AISLE_IMAGES constant block
const lines = AISLES.map(a => {
  const url = results.get(a.order)
  return url
    ? `  ${a.order}:  '${url}',`
    : `  ${a.order}:  null, // generation failed — re-run script`
})

const imageBlock = `
export const AISLE_IMAGES: Record<number, string | null> = {
${lines.join('\n')}
}
`

// Remove any existing AISLE_IMAGES block and append the new one
const stripped = existing.replace(
  /\nexport const AISLE_IMAGES[\s\S]*?\n\}\n?/,
  ''
)
const updated = stripped.trimEnd() + '\n' + imageBlock

await Deno.writeTextFile(AISLE_UTILS_PATH, updated)

console.log(`\n✅ Done! ${results.size}/${AISLES.length} aisle images written to aisleUtils.ts`)
console.log('Run: git add src/lib/aisleUtils.ts && git commit -m "Add aisle images"')
