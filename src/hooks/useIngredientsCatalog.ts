import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
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
  const norm = name.toLowerCase().trim()
  // Exact match first
  const exact = catalog.find(c => c.name.toLowerCase() === norm)
  if (exact) return exact
  // Contains match
  const contains = catalog.find(c =>
    c.name.toLowerCase().includes(norm) || norm.includes(c.name.toLowerCase())
  )
  return contains ?? null
}
