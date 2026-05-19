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

export interface BulkCatalogUpdate {
  is_pantry_staple?:   boolean
  default_store?:      string | null
  default_aisle_order?: number | null
}

/** Apply the same field values to multiple catalog items at once. */
export function useBulkUpdateCatalogItems() {
  const queryClient = useQueryClient()
  const familyId    = useAppStore(s => s.familyId)

  return useMutation({
    mutationFn: async ({ ids, update }: { ids: string[]; update: BulkCatalogUpdate }) => {
      if (ids.length === 0) return
      const { error } = await supabase
        .from('ingredients_catalog')
        .update(update)
        .in('id', ids)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['catalog', familyId] })
      queryClient.invalidateQueries({ queryKey: ['staple-predictions', familyId] })
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
      // Collect names + aliases from every ingredient being merged away,
      // so future CSV imports can route those names to this canonical entry.
      const newAliases: string[] = []

      for (const mid of mergeIds) {
        // Fetch the name and existing aliases before deleting
        const { data: dying } = await supabase
          .from('ingredients_catalog')
          .select('name, aliases')
          .eq('id', mid)
          .single()

        if (dying) {
          newAliases.push(dying.name)
          if (Array.isArray(dying.aliases)) newAliases.push(...dying.aliases)
        }

        // Re-point all FK references
        await supabase.from('recipe_ingredients').update({ ingredient_id: canonicalId }).eq('ingredient_id', mid)
        await supabase.from('grocery_list_items').update({ ingredient_id: canonicalId }).eq('ingredient_id', mid)
        await supabase.from('staples').update({ ingredient_id: canonicalId }).eq('ingredient_id', mid)
        await supabase.from('purchase_history').update({ ingredient_id: canonicalId }).eq('ingredient_id', mid)
        // Delete the merged duplicate
        const { error } = await supabase.from('ingredients_catalog').delete().eq('id', mid)
        if (error) throw error
      }

      // Merge the collected aliases into the canonical row (dedup, case-insensitive)
      if (newAliases.length > 0) {
        const { data: canonical } = await supabase
          .from('ingredients_catalog')
          .select('name, aliases')
          .eq('id', canonicalId)
          .single()

        const existing = new Set(
          [canonical?.name, ...(canonical?.aliases ?? [])].map(s => s?.toLowerCase())
        )
        const toAdd = newAliases.filter(a => a && !existing.has(a.toLowerCase()))

        if (toAdd.length > 0) {
          await supabase
            .from('ingredients_catalog')
            .update({ aliases: [...(canonical?.aliases ?? []), ...toAdd] })
            .eq('id', canonicalId)
        }
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
