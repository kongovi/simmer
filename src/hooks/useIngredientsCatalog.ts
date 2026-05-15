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
 * Match an ingredient name against the catalog, returning both the match and
 * whether it was an inferred merge (i.e. the names differ).
 *
 * Matching order:
 *   1. Exact match on original name
 *   2. Exact match on normalized name (ground X → X powder)
 *   3. Contains match on original name
 *   4. Contains match on normalized name
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

  // 3. Contains on original
  const containsOrig = catalog.find(c => {
    const cn = c.name.toLowerCase()
    return cn.includes(orig) || orig.includes(cn)
  })
  if (containsOrig) {
    const isMerge = containsOrig.name.toLowerCase() !== orig
    return { catalog: containsOrig, isMerge }
  }

  // 4. Contains on normalized
  if (normalized !== orig) {
    const containsNorm = catalog.find(c => {
      const cn = c.name.toLowerCase()
      return cn.includes(normalized) || normalized.includes(cn)
    })
    if (containsNorm) return { catalog: containsNorm, isMerge: true }
  }

  return { catalog: null, isMerge: false }
}
