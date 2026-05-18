import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
import { generateIngredientImage } from '../lib/images'

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

          // Invalidate recipe-ingredients so RecipeDetailScreen refreshes
          queryClient.invalidateQueries({ queryKey: ['recipe-ingredients'] })

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

/**
 * Backfill ingredient images for ingredients that are still pending.
 * Fires once per session when the grocery items load. Staggers requests
 * 600ms apart so we don't hammer the Edge Function with 20 concurrent calls.
 *
 * Pass the ingredient list from useGroceryListItems (or any list that has
 * { id, name, image_url, image_status } on the ingredient join).
 */
export function useBackfillIngredientImages(
  items: Array<{
    ingredient: { id: string; name: string; image_url: string | null; image_status: string | null } | null
  }> | undefined
) {
  const firedRef = useRef(false)

  useEffect(() => {
    if (firedRef.current) return
    if (!items || items.length === 0) return

    const pending = items
      .map(i => i.ingredient)
      .filter((ing): ing is { id: string; name: string; image_url: string | null; image_status: string | null } =>
        !!ing && !ing.image_url && ing.image_status !== 'generating' && ing.image_status !== 'done'
      )
      // Deduplicate by id
      .filter((ing, idx, arr) => arr.findIndex(x => x.id === ing.id) === idx)

    if (pending.length === 0) return

    firedRef.current = true
    console.log(`Backfilling images for ${pending.length} ingredients`)

    pending.forEach((ing, i) => {
      setTimeout(() => {
        generateIngredientImage(ing.id, ing.name).catch(err =>
          console.warn(`Backfill image error [${ing.name}]:`, err)
        )
      }, i * 600) // stagger: 0ms, 600ms, 1200ms, ...
    })
  }, [items])
}

/**
 * On mount, queries the full ingredients_catalog for ALL pending/failed items
 * (not just those on the current grocery list) and fires generation for each.
 * Staggers 300ms apart so 50 ingredients take ~15s to kick off rather than
 * flooding the Edge Function with 50 simultaneous requests.
 *
 * Mount this once in GroceryScreen alongside useBackfillIngredientImages.
 */
export function useBackfillAllCatalogImages() {
  const familyId = useAppStore(s => s.familyId)
  const didRun   = useRef(false)

  useEffect(() => {
    if (!familyId || didRun.current) return
    didRun.current = true

    async function run() {
      const { data, error } = await supabase
        .from('ingredients_catalog')
        .select('id, name')
        .eq('family_id', familyId)
        .in('image_status', ['pending', 'failed'])

      if (error || !data?.length) return

      console.log(`[catalog backfill] Generating images for ${data.length} ingredient(s)…`)

      // Mark all as 'generating' immediately so pulsing dots appear at once
      const ids = data.map(r => r.id)
      await supabase
        .from('ingredients_catalog')
        .update({ image_status: 'generating' })
        .in('id', ids)

      // Stagger the actual edge-function calls to avoid flooding.
      // generateIngredientImage will redundantly set 'generating' again — harmless.
      data.forEach((ing, i) => {
        setTimeout(() => {
          generateIngredientImage(ing.id, ing.name).catch(err =>
            console.warn(`Catalog backfill error [${ing.name}]:`, err)
          )
        }, i * 300) // 0ms, 300ms, 600ms, … — 50 items ≈ 15s to kick off
      })
    }

    run()
  }, [familyId])
}
