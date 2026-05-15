import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
import { detectAisleOrder } from '../lib/aisleUtils'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GroceryList {
  id:           string
  family_id:    string
  week_start:   string
  generated_at: string
  is_active:    boolean
}

export interface GroceryItem {
  id:              string
  grocery_list_id: string
  ingredient_id:   string | null
  custom_name:     string | null
  quantity:        number | null
  unit:            string | null
  source:          'meal_plan' | 'staple' | 'manual'
  recipe_ids:      string[]
  assigned_store:  string | null
  aisle_order:     number | null
  is_checked:      boolean
  checked_at:      string | null
  checked_by:      string | null
  // joined from ingredients_catalog (null for custom items)
  ingredient: {
    id:            string
    name:          string
    emoji:         string | null
    brand_note:    string | null
    default_store: string | null
    image_url:     string | null
    image_status:  string | null
  } | null
}

interface ConsolidatedItem {
  ingredient_id:  string
  quantity:       number | null
  unit:           string | null
  source:         'meal_plan'
  recipe_ids:     string[]
  assigned_store: string | null
  aisle_order:    number
}

// re-export so callers that import detectAisleOrder from here still work
export { detectAisleOrder } from '../lib/aisleUtils'

// ── Display helpers ───────────────────────────────────────────────────────────

export function itemDisplayName(item: GroceryItem): string {
  return item.ingredient?.name ?? item.custom_name ?? '—'
}

export function itemEmoji(item: GroceryItem): string {
  return item.ingredient?.emoji ?? '🛒'
}

export function itemQtyLabel(item: GroceryItem): string {
  if (!item.quantity && !item.unit) return ''
  if (!item.quantity) return item.unit ?? ''
  const qty = item.quantity % 1 === 0
    ? String(item.quantity)
    : item.quantity.toFixed(2).replace(/\.?0+$/, '')
  return item.unit ? `${qty} ${item.unit}` : qty
}

// ── Queries ───────────────────────────────────────────────────────────────────

/** Returns the most recently generated active list for this family. */
export function useActiveGroceryList() {
  const familyId = useAppStore(s => s.familyId)

  return useQuery({
    queryKey: ['grocery-list', familyId],
    enabled:  !!familyId,
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('grocery_lists')
        .select('id, family_id, week_start, generated_at, is_active')
        .eq('family_id', familyId!)
        .eq('is_active', true)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as GroceryList | null
    },
  })
}

/** Returns all items for a grocery list, sorted by aisle then checked status. */
export function useGroceryListItems(listId: string | null) {
  return useQuery({
    queryKey: ['grocery-items', listId],
    enabled:  !!listId,
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('grocery_list_items')
        .select(`
          id, grocery_list_id, ingredient_id, custom_name,
          quantity, unit, source, recipe_ids, assigned_store,
          aisle_order, is_checked, checked_at, checked_by,
          ingredient:ingredients_catalog(id, name, emoji, brand_note, default_store, image_url, image_status)
        `)
        .eq('grocery_list_id', listId!)
        .order('is_checked',  { ascending: true })
        .order('aisle_order', { ascending: true, nullsFirst: false })
      if (error) throw error
      return (data ?? []) as unknown as GroceryItem[]
    },
  })
}

/** Check whether an active list already exists for the given week. */
export function useHasActiveList(weekStart: string) {
  const familyId = useAppStore(s => s.familyId)

  return useQuery({
    queryKey: ['grocery-has-active', familyId, weekStart],
    enabled:  !!familyId && !!weekStart,
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('grocery_lists')
        .select('id')
        .eq('family_id', familyId!)
        .eq('week_start', weekStart)
        .eq('is_active', true)
        .maybeSingle()
      if (error) throw error
      return !!data
    },
  })
}

/** Distinct store names from this family's ingredients_catalog. */
export function useKnownStores() {
  const familyId = useAppStore(s => s.familyId)

  return useQuery({
    queryKey: ['known-stores', familyId],
    enabled:  !!familyId,
    staleTime: 1000 * 60 * 2,
    queryFn:  async () => {
      // Pull from both sources and merge: family_stores (managed in Settings)
      // and ingredients_catalog.default_store (inferred from ingredient assignments)
      const [storesRes, catalogRes] = await Promise.all([
        supabase
          .from('family_stores')
          .select('name')
          .eq('family_id', familyId!)
          .order('sort_order', { ascending: true }),
        supabase
          .from('ingredients_catalog')
          .select('default_store')
          .eq('family_id', familyId!)
          .not('default_store', 'is', null),
      ])

      const fromSettings = (storesRes.data ?? []).map(s => s.name as string)
      const fromCatalog  = (catalogRes.data ?? []).map(d => d.default_store as string)

      // Settings stores come first (respecting sort_order), then any catalog-only stores appended
      const seen = new Set(fromSettings.map(s => s.toLowerCase()))
      const extra = fromCatalog.filter(s => s && !seen.has(s.toLowerCase()))
      return [...fromSettings, ...new Set(extra)].filter(Boolean)
    },
  })
}

/** Catalog items for the KB suggestion pane, filtered by search term. */
export function useIngredientSuggestions(search: string) {
  const familyId = useAppStore(s => s.familyId)

  return useQuery({
    queryKey: ['ingredient-suggestions', familyId, search],
    enabled:  !!familyId,
    staleTime: 1000 * 60 * 10,
    queryFn:  async () => {
      let q = supabase
        .from('ingredients_catalog')
        .select('id, name, emoji, default_store, image_url, image_status')
        .eq('family_id', familyId!)
        .order('name')
        .limit(24)

      if (search.trim()) {
        q = q.ilike('name', `%${search.trim()}%`)
      }

      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/** Generate (or regenerate) the grocery list for a given week. */
export function useGenerateGroceryList() {
  const queryClient = useQueryClient()
  const familyId    = useAppStore(s => s.familyId)

  return useMutation({
    mutationFn: async ({ weekStart }: { weekStart: string }): Promise<string> => {
      if (!familyId) throw new Error('No family ID')

      // 1. Fetch slots that have a recipe_id
      const { data: slots, error: slotsErr } = await supabase
        .from('meal_plan_slots')
        .select('recipe_id')
        .eq('family_id', familyId)
        .eq('week_start', weekStart)
        .not('recipe_id', 'is', null)
      if (slotsErr) throw slotsErr

      const recipeIds = [...new Set((slots ?? []).map(s => s.recipe_id as string))]

      // 2. Fetch recipe_ingredients with ingredient details, consolidate
      const consolidated = new Map<string, ConsolidatedItem>()

      if (recipeIds.length > 0) {
        const { data: ings, error: ingsErr } = await supabase
          .from('recipe_ingredients')
          .select(`
            recipe_id, ingredient_id, quantity, unit,
            ingredient:ingredients_catalog(id, name, emoji, default_store)
          `)
          .in('recipe_id', recipeIds)
        if (ingsErr) throw ingsErr

        for (const ing of (ings ?? [])) {
          if (!ing.ingredient_id) continue
          const key     = `${ing.ingredient_id}_${ing.unit ?? ''}`
          const ingData = ing.ingredient as unknown as { id: string; name: string; emoji: string | null; default_store: string | null } | null

          if (consolidated.has(key)) {
            const ex = consolidated.get(key)!
            if (ing.quantity != null) {
              ex.quantity = (ex.quantity ?? 0) + ing.quantity
            }
            if (ing.recipe_id && !ex.recipe_ids.includes(ing.recipe_id as string)) {
              ex.recipe_ids.push(ing.recipe_id as string)
            }
          } else {
            consolidated.set(key, {
              ingredient_id:  ing.ingredient_id as string,
              quantity:       ing.quantity as number | null,
              unit:           ing.unit as string | null,
              source:         'meal_plan',
              recipe_ids:     ing.recipe_id ? [ing.recipe_id as string] : [],
              assigned_store: ingData?.default_store ?? null,
              aisle_order:    detectAisleOrder(ingData?.name ?? '', ingData?.emoji ?? null),
            })
          }
        }
      }

      // 3. Deactivate any existing active lists for this week
      await supabase
        .from('grocery_lists')
        .update({ is_active: false })
        .eq('family_id', familyId)
        .eq('week_start', weekStart)
        .eq('is_active', true)

      // 4. Create new list
      const { data: list, error: listErr } = await supabase
        .from('grocery_lists')
        .insert({ family_id: familyId, week_start: weekStart, is_active: true })
        .select('id')
        .single()
      if (listErr) throw listErr

      // 5. Insert items
      const items = Array.from(consolidated.values())
      if (items.length > 0) {
        const rows = items.map(item => ({
          grocery_list_id: list.id,
          ingredient_id:   item.ingredient_id,
          quantity:        item.quantity,
          unit:            item.unit,
          source:          item.source,
          recipe_ids:      item.recipe_ids,
          assigned_store:  item.assigned_store,
          aisle_order:     item.aisle_order,
          is_checked:      false,
        }))
        const { error: itemsErr } = await supabase
          .from('grocery_list_items')
          .insert(rows)
        if (itemsErr) throw itemsErr
      }

      return list.id as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grocery-list',      familyId] })
      queryClient.invalidateQueries({ queryKey: ['grocery-has-active', familyId] })
    },
  })
}

/** Toggle checked/unchecked state on a list item. */
export function useToggleItem() {
  const queryClient = useQueryClient()
  const userId      = useAppStore(s => s.user?.id)

  return useMutation({
    mutationFn: async ({ id, listId: _listId, checked }: { id: string; listId: string; checked: boolean }) => {
      const { error } = await supabase
        .from('grocery_list_items')
        .update({
          is_checked: checked,
          checked_at: checked ? new Date().toISOString() : null,
          checked_by: checked ? (userId ?? null) : null,
        })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_v, { listId }) => {
      queryClient.invalidateQueries({ queryKey: ['grocery-items', listId] })
    },
  })
}

/** Add a manual item — from catalog (with ingredientId) or free-text (custom_name). */
export function useAddManualItem() {
  const queryClient = useQueryClient()
  const familyId = useAppStore(s => s.familyId)

  return useMutation({
    mutationFn: async ({
      listId, name, quantity, unit, ingredientId, emoji,
    }: {
      listId:        string
      name:          string
      quantity?:     number | null
      unit?:         string | null
      ingredientId?: string | null
      emoji?:        string | null
    }): Promise<{ ingredientId: string | null; needsImage: boolean }> => {
      let resolvedIngredientId = ingredientId ?? null
      let needsImage = false

      // If no catalog entry yet, create one so the item gets dedup + image gen.
      // Optimistic insert: try INSERT first; if a unique violation occurs (same
      // name already exists), fall back to a SELECT of the existing row.
      if (!resolvedIngredientId && familyId) {
        const { data: inserted, error: insertErr } = await supabase
          .from('ingredients_catalog')
          .insert({ family_id: familyId, name, emoji: emoji ?? null })
          .select('id, image_url')
          .single()

        if (insertErr) {
          // Could be a unique violation (duplicate name) — look up the existing row.
          // Log non-duplicate errors so they're visible during debugging.
          const isUniqueViolation = insertErr.code === '23505' || insertErr.message?.includes('unique')
          if (!isUniqueViolation) {
            console.error(`useAddManualItem: catalog insert failed for "${name}":`, insertErr.code, insertErr.message)
          }
          const { data: existing, error: lookupErr } = await supabase
            .from('ingredients_catalog')
            .select('id, image_url')
            .eq('family_id', familyId)
            .ilike('name', name)
            .limit(1)
            .maybeSingle()
          if (lookupErr) {
            console.error(`useAddManualItem: catalog lookup failed for "${name}":`, lookupErr.code, lookupErr.message)
          }
          if (existing?.id) {
            resolvedIngredientId = existing.id as string
            needsImage = !existing.image_url
          }
        } else if (inserted?.id) {
          resolvedIngredientId = inserted.id as string
          needsImage = true // brand-new entry always needs an image
        } else {
          // Insert succeeded but returned no data — shouldn't happen, log it
          console.error(`useAddManualItem: catalog insert returned no data for "${name}"`)
        }
      } else if (!familyId) {
        console.error(`useAddManualItem: familyId is null — cannot create catalog entry for "${name}"`)
      }

      const { error } = await supabase
        .from('grocery_list_items')
        .insert({
          grocery_list_id: listId,
          ingredient_id:   resolvedIngredientId,
          custom_name:     resolvedIngredientId ? null : name,
          quantity:        quantity ?? null,
          unit:            unit ?? null,
          source:          'manual',
          recipe_ids:      [],
          aisle_order:     detectAisleOrder(name, emoji ?? null),
          is_checked:      false,
        })
      if (error) throw error

      return { ingredientId: resolvedIngredientId, needsImage }
    },
    onSuccess: (_v, { listId }) => {
      queryClient.invalidateQueries({ queryKey: ['grocery-items', listId] })
    },
  })
}

/** Update the assigned_store on an item and persist preference to ingredients_catalog. */
export function useUpdateItemStore() {
  const queryClient = useQueryClient()
  const familyId    = useAppStore(s => s.familyId)

  return useMutation({
    mutationFn: async ({
      itemId, listId: _listId, store, ingredientId,
    }: {
      itemId:        string
      listId:        string
      store:         string
      ingredientId?: string | null
    }) => {
      const { error } = await supabase
        .from('grocery_list_items')
        .update({ assigned_store: store })
        .eq('id', itemId)
      if (error) throw error

      // Persist preference so future lists auto-assign this store
      if (ingredientId) {
        await supabase
          .from('ingredients_catalog')
          .update({ default_store: store })
          .eq('id', ingredientId)
        queryClient.invalidateQueries({ queryKey: ['known-stores', familyId] })
      }
    },
    onSuccess: (_v, { listId }) => {
      queryClient.invalidateQueries({ queryKey: ['grocery-items', listId] })
    },
  })
}

/** Update all editable fields on a grocery item and persist preferences to the catalog. */
export function useUpdateGroceryItem() {
  const queryClient = useQueryClient()
  const familyId    = useAppStore(s => s.familyId)

  return useMutation({
    mutationFn: async ({
      itemId, listId: _listId,
      quantity, unit, aisleOrder, assignedStore,
      ingredientId, name, notes, defaultAisleOrder,
    }: {
      itemId:            string
      listId:            string
      quantity?:         number | null
      unit?:             string | null
      aisleOrder?:       number | null
      assignedStore?:    string | null
      ingredientId?:     string | null
      name?:             string
      notes?:            string | null
      defaultAisleOrder?: number | null
    }) => {
      const { error: itemErr } = await supabase
        .from('grocery_list_items')
        .update({
          quantity:       quantity ?? null,
          unit:           unit     || null,
          aisle_order:    aisleOrder ?? null,
          assigned_store: assignedStore || null,
        })
        .eq('id', itemId)
      if (itemErr) throw itemErr

      if (ingredientId) {
        const catUpdate: Record<string, unknown> = {}
        if (name             !== undefined) catUpdate.name               = name.trim()
        if (notes            !== undefined) catUpdate.brand_note         = notes || null
        if (defaultAisleOrder !== undefined) catUpdate.default_aisle_order = defaultAisleOrder
        if (assignedStore    !== undefined) catUpdate.default_store      = assignedStore || null
        if (Object.keys(catUpdate).length > 0) {
          await supabase.from('ingredients_catalog').update(catUpdate).eq('id', ingredientId)
        }
      }
    },
    onSuccess: (_v, { listId }) => {
      queryClient.invalidateQueries({ queryKey: ['grocery-items', listId] })
      queryClient.invalidateQueries({ queryKey: ['catalog',       familyId] })
      queryClient.invalidateQueries({ queryKey: ['known-stores',  familyId] })
    },
  })
}

// ── Realtime ──────────────────────────────────────────────────────────────────

/** Live updates: any change to this list's items invalidates the cache. */
export function useGroceryListRealtime(listId: string | null) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!listId) return

    const channel = supabase
      .channel(`grocery-items-${listId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'grocery_list_items',
          filter: `grocery_list_id=eq.${listId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['grocery-items', listId] })
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [listId, queryClient])
}
