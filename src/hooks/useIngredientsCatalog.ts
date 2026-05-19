import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
import { normalizeIngredientName } from '../lib/ingredientNormalize'
import type { IngredientCatalog } from '../types'

export function useIngredientsCatalog() {
  const familyId = useAppStore(s => s.familyId)

  return useQuery({
    queryKey: ['ingredients-catalog', familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ingredients_catalog')
        .select('*')
        .eq('family_id', familyId!)
        .order('name')
      if (error) throw error
      return (data ?? []) as IngredientCatalog[]
    },
  })
}

/** Fuzzy-match a name against the catalog. Returns matched entry or null. */
export function matchIngredient(
  name: string,
  catalog: IngredientCatalog[]
): IngredientCatalog | null {
  return matchIngredientFull(name, catalog).catalog
}

export interface IngredientMatchResult {
  /** The matched catalog entry, or null if no match */
  catalog: IngredientCatalog | null
  /**
   * True when the matched catalog name differs from the incoming name.
   * This covers two cases:
   *   1. Normalization: "ground cumin" normalized to "Cumin powder" which exists in catalog
   *   2. Fuzzy/contains: "extra virgin olive oil" fuzzy-matched to "Olive oil"
   */
  isMerge: boolean
}

/**
 * Length-guarded substring check.
 *
 * Returns true only when the shorter of the two strings is at least 4 chars
 * AND at least 60% as long as the other, then checks that the longer contains
 * the shorter.
 *
 * Why: raw `a.includes(b)` produces false positives when a short word ("butter",
 * "onion", "cloves") appears inside a completely different compound ingredient
 * ("peanut butter", "spring onion", "garlic cloves").  The ratio guard means a
 * single-word catalog entry can only match another name that is mostly the same
 * string — not a longer phrase that merely contains it.
 *
 * Examples blocked by this guard:
 *   "butter"  (6) vs "peanut butter"  (13) → 46% → blocked
 *   "onion"   (5) vs "spring onion"   (12) → 42% → blocked
 *   "cloves"  (6) vs "garlic cloves"  (13) → 46% → blocked
 *   "garlic"  (6) vs "garlic powder"  (13) → 46% → blocked
 *   "cream"   (5) vs "sour cream"     (10) → 50% → blocked
 *   "beef"    (4) vs "beef broth"     (10) → 40% → blocked
 *
 * Examples that still pass (genuinely close names):
 *   "whipping cream" (14) vs "heavy cream"      (11) → 79% → passes
 *   "cherry tomato"  (13) vs "cherry tomatoes"  (15) → 87% → passes
 */
function safeContains(a: string, b: string): boolean {
  const shorter = a.length <= b.length ? a : b
  const longer  = a.length <= b.length ? b : a
  if (shorter.length < 4) return false
  if (shorter.length / longer.length < 0.6) return false
  return longer.includes(shorter)
}

/**
 * Match an ingredient name against the catalog, returning both the match and
 * whether it was an inferred merge (i.e. the names differ).
 *
 * Matching order:
 *   1. Exact match on original name
 *   2. Exact match on normalized name (ground X → X powder)
 *   3. Length-guarded contains match on original name
 *   4. Length-guarded contains match on normalized name
 */
export function matchIngredientFull(
  name: string,
  catalog: IngredientCatalog[]
): IngredientMatchResult {
  const orig       = name.toLowerCase().trim()
  const normalized = normalizeIngredientName(name).toLowerCase().trim()

  // 1. Exact on original — not a merge
  const exactOrig = catalog.find(c => c.name.toLowerCase() === orig)
  if (exactOrig) return { catalog: exactOrig, isMerge: false }

  // 2. Exact on normalized — is a merge when names differ
  if (normalized !== orig) {
    const exactNorm = catalog.find(c => c.name.toLowerCase() === normalized)
    if (exactNorm) return { catalog: exactNorm, isMerge: true }
  }

  // 3. Length-guarded contains on original
  const containsOrig = catalog.find(c => safeContains(c.name.toLowerCase(), orig))
  if (containsOrig) {
    const isMerge = containsOrig.name.toLowerCase() !== orig
    return { catalog: containsOrig, isMerge }
  }

  // 4. Length-guarded contains on normalized
  if (normalized !== orig) {
    const containsNorm = catalog.find(c => safeContains(c.name.toLowerCase(), normalized))
    if (containsNorm) return { catalog: containsNorm, isMerge: true }
  }

  return { catalog: null, isMerge: false }
}
