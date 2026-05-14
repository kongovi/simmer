import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'

interface CatalogUpdatePayload {
  id: string
  image_url: string | null
  image_status: string
  [key: string]: unknown
}

/**
 * Subscribe to Supabase Realtime updates on the ingredients_catalog table.
 * When image_url / image_status changes, patches React Query caches in-place:
 *   - ['grocery-items', *] — GroceryScreen
 *   - ['staging-ingredients', *] — StagingScreen
 *   - ['meal-prep', *] — MealPrepScreen
 *   - ['catalog', *] — CatalogScreen
 *
 * Mount once near the top of the app (e.g. in ProtectedLayout or GroceryScreen).
 */
export function useIngredientImageRealtime() {
  const familyId = useAppStore(s => s.familyId)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!familyId) return

    const channel = supabase
      .channel(`ingredient-images-${familyId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ingredients_catalog',
          filter: `family_id=eq.${familyId}`,
        },
        (payload) => {
          const updated = payload.new as CatalogUpdatePayload

          // Patch grocery-items cache — GroceryItem.ingredient
          queryClient.setQueriesData<unknown[]>(
            { queryKey: ['grocery-items'] },
            (old) => {
              if (!Array.isArray(old)) return old
              return old.map((item: unknown) => {
                const it = item as { ingredient?: { id?: string } | null }
                if (it?.ingredient?.id === updated.id) {
                  return {
                    ...it,
                    ingredient: {
                      ...it.ingredient,
                      image_url: updated.image_url,
                      image_status: updated.image_status,
                    },
                  }
                }
                return item
              })
            }
          )

          // Invalidate staging + meal-prep (they have their own shape; easier to refetch)
          queryClient.invalidateQueries({ queryKey: ['staging-ingredients', familyId] })
          queryClient.invalidateQueries({ queryKey: ['meal-prep', familyId] })
          queryClient.invalidateQueries({ queryKey: ['catalog', familyId] })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [familyId, queryClient])
}
