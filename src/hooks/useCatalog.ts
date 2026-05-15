import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
import type { IngredientCatalog } from '../types'

export function useCatalogItems(search?: string) {
  const familyId = useAppStore(s => s.familyId)

  return useQuery({
    queryKey: ['catalog', familyId, search],
    enabled:  !!familyId,
    queryFn:  async () => {
      let q = supabase
        .from('ingredients_catalog')
        .select('*')
        .eq('family_id', familyId!)
        .order('name', { ascending: true })

      if (search?.trim()) {
        q = q.ilike('name', `%${search.trim()}%`)
      }

      const { data, error } = await q
      if (error) throw error
      return data as IngredientCatalog[]
    },
  })
}

export interface CatalogItemUpdate {
  name?:                    string
  default_store?:           string | null
  brand_note?:              string | null
  is_pantry_staple?:        boolean
  is_bulk_staple?:          boolean
  purchase_frequency_days?: number | null
  default_aisle_order?:     number | null
}

export function useUpdateCatalogItem() {
  const queryClient = useQueryClient()
  const familyId    = useAppStore(s => s.familyId)

  return useMutation({
    mutationFn: async ({ id, update }: { id: string; update: CatalogItemUpdate }) => {
      const { error } = await supabase
        .from('ingredients_catalog')
        .update(update)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog', familyId] })
    },
  })
}

export function useDeleteCatalogItem() {
  const queryClient = useQueryClient()
  const familyId    = useAppStore(s => s.familyId)

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('ingredients_catalog')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog', familyId] })
      queryClient.invalidateQueries({ queryKey: ['grocery'] })
    },
  })
}

/**
 * Merge multiple ingredients into a single canonical one.
 * All FK references (recipe_ingredients, grocery_list_items, staples,
 * purchase_history) are re-pointed to canonicalId, then the duplicates
 * are deleted.
 *
 * @param canonicalId  The ingredient to keep
 * @param mergeIds     The ingredient IDs to merge away (will be deleted)
 */
export interface MergeOverrides {
  image_url?:          string | null
  image_status?:       string | null
  default_store?:      string | null
  brand_note?:         string | null
  default_aisle_order?: number | null
}

/**
 * Merge multiple ingredients into a single canonical one.
 * All FK references (recipe_ingredients, grocery_list_items, staples,
 * purchase_history) are re-pointed to canonicalId, then the duplicates
 * are deleted. Optional overrides are written to the canonical row after merge.
 *
 * @param canonicalId  The ingredient to keep
 * @param mergeIds     The ingredient IDs to merge away (will be deleted)
 * @param overrides    Optional field values to write onto the canonical row
 */
export function useMergeIngredients() {
  const queryClient = useQueryClient()
  const familyId    = useAppStore(s => s.familyId)

  return useMutation({
    mutationFn: async ({
      canonicalId,
      mergeIds,
      overrides,
    }: {
      canonicalId: string
      mergeIds:    string[]
      overrides?:  MergeOverrides
    }) => {
      for (const mid of mergeIds) {
        // Re-point all FK references
        await supabase.from('recipe_ingredients').update({ ingredient_id: canonicalId }).eq('ingredient_id', mid)
        await supabase.from('grocery_list_items').update({ ingredient_id: canonicalId }).eq('ingredient_id', mid)
        await supabase.from('staples').update({ ingredient_id: canonicalId }).eq('ingredient_id', mid)
        await supabase.from('purchase_history').update({ ingredient_id: canonicalId }).eq('ingredient_id', mid)
        // Delete the merged duplicate
        const { error } = await supabase.from('ingredients_catalog').delete().eq('id', mid)
        if (error) throw error
      }
      // Apply any chosen field overrides to the surviving canonical row
      if (overrides && Object.keys(overrides).length > 0) {
        await supabase.from('ingredients_catalog').update(overrides).eq('id', canonicalId)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog', familyId] })
      queryClient.invalidateQueries({ queryKey: ['grocery'] })
      queryClient.invalidateQueries({ queryKey: ['recipe-ingredients'] })
    },
  })
}
