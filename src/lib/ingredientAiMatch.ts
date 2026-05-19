/**
 * AI-powered ingredient synonym matching.
 *
 * Runs AFTER the deterministic matcher returns no result, to catch regional
 * synonyms and common-language variations the rule-based system can't handle:
 *   "double cream"  → "Heavy cream"
 *   "aubergine"     → "Eggplant"
 *   "rocket"        → "Arugula"
 *   "coriander"     → "Cilantro"
 *   "minced beef"   → "Ground beef"
 *   "courgette"     → "Zucchini"
 *
 * Results are cached in localStorage so Claude is only ever called once per
 * (family, ingredient name) pair. User decisions (accept / keep separate)
 * are stored separately and always take precedence over AI suggestions.
 */

import { aiCall } from './ai'
import type { IngredientCatalog } from '../types'

const SYSTEM_PROMPT = `You are a grocery ingredient matching assistant for a shopping app. This task requires careful, precise matching — a wrong match means a shopper buys the wrong item. When in doubt, return null. A missed match is always safer than a wrong match.

Given a catalog of known ingredient names and a list of new ingredient names to check, identify which catalog entry each new ingredient refers to — if any.

STEP 1 — Identify the PRIMARY ingredient in each name (ignore form/prep words like "cloves", "canned", "fresh", "ground", "chopped"). Ask: what is the core food item?

STEP 2 — If the primary ingredients differ between the input and the catalog entry, it is NOT a match — regardless of any shared words.
  ✗ "garlic cloves" ≠ "Cloves"   (primary: garlic vs cloves — completely different foods)
  ✗ "black pepper" ≠ "Pepper"    (could be bell pepper in catalog — too ambiguous, return null)
  ✗ "spring onion" ≠ "Onion"     (different produce item)
  ✓ "spring onion" = "Scallion"  (same primary ingredient, regional name)

STEP 3 — Only match when the primary ingredients are clearly the same thing, accounting for:
- Regional synonyms (aubergine = eggplant, coriander = cilantro, rocket = arugula, courgette = zucchini, double cream = heavy cream)
- Common name variants (spring onion = scallion, minced beef = ground beef, plain flour = all-purpose flour)
- Plural/singular and minor spelling differences
- Fat/salt level differences are the same item (salted butter = butter, full-fat milk = milk)

STEP 4 — Even with matching primary ingredients, NEVER match across different physical forms:
- Fresh vs canned (fresh tomatoes ≠ canned tomatoes)
- Fresh vs frozen (fresh peas ≠ frozen peas)
- Fresh vs dried (fresh ginger ≠ dried ginger, fresh herbs ≠ dried herbs)
- Whole vs processed (whole tomatoes ≠ tomato paste ≠ tomato purée ≠ tomato sauce)
- Different preparations (garlic ≠ garlic powder, coconut milk ≠ coconut cream)
- Qualified vs unqualified: if the input has a form qualifier (canned, frozen, dried, fresh) and the catalog entry does NOT have that same qualifier, return null — the qualifier is part of the ingredient identity. "canned tomatoes" ≠ "Tomatoes" even if both are tomatoes. The shopper needs the canned version, not fresh produce.

Return ONLY a valid JSON object mapping each input name to its matching catalog name, or null if no clear match.
Example: {"double cream":"Heavy cream","rocket":"Arugula","garlic cloves":null,"canned tomatoes":null,"black pepper":null}`

// ── Suggestion cache ──────────────────────────────────────────────────────────
// Stores Claude's raw suggestions (not user decisions).
// { [normalizedName]: catalogId | null }
// null = Claude found no match; absence = not yet queried.

function cacheKey(familyId: string) {
  return `simmer_ai_suggestions_${familyId}`
}

export function getAiSuggestionCache(familyId: string): Record<string, string | null> {
  try { return JSON.parse(localStorage.getItem(cacheKey(familyId)) ?? '{}') }
  catch { return {} }
}

export function saveAiSuggestionCache(familyId: string, cache: Record<string, string | null>) {
  try { localStorage.setItem(cacheKey(familyId), JSON.stringify(cache)) }
  catch { /* storage full — ignore */ }
}

// ── Core matching call ─────────────────────────────────────────────────────────

/**
 * Ask Claude to match `names` against `catalog`.
 * Returns a map of ingredient name → catalog ID (or null if no match).
 * Never throws — returns an empty map on any error.
 */
export async function aiMatchIngredients(
  names: string[],
  catalog: IngredientCatalog[],
): Promise<Map<string, string | null>> {
  if (names.length === 0) return new Map()

  const catalogNames = catalog.map(c => c.name)
  const prompt = `Catalog: ${JSON.stringify(catalogNames)}\n\nMatch these ingredients: ${JSON.stringify(names)}`

  try {
    const raw = await aiCall('ingredient_matching', prompt, {
      systemPrompt: SYSTEM_PROMPT,
      maxTokens:    512,
    })

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return new Map()

    const result = JSON.parse(jsonMatch[0]) as Record<string, string | null>
    const output = new Map<string, string | null>()

    for (const name of names) {
      const matchedName = result[name]
      if (!matchedName) {
        output.set(name, null)
      } else {
        // Resolve catalog name → ID (case-insensitive)
        const item = catalog.find(c => c.name.toLowerCase() === matchedName.toLowerCase())
        output.set(name, item?.id ?? null)
      }
    }

    return output
  } catch {
    return new Map()
  }
}
