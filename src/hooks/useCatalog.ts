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
  default_store?:           string | null
  brand_note?:              string | null
  is_pantry_staple?:        boolean
  is_bulk_staple?:          boolean
  purchase_frequency_days?: number | null
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
