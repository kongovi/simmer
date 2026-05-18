import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
import { classifyIngredients } from '../lib/groceryIntelligence'
import { detectAisleOrder } from '../lib/aisleUtils'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StagingIngredient {
  ingredient_id: string
  name:          string
  emoji:         string | null
  image_url:     string | null
  image_status:  string | null
  quantity:      number | null
  unit:          string | null
  recipe_note:   string | null   // "3 lbs · Kebabs + Kofta"
  aisle_order:   number
  default_store: string | null
}

export interface StapleWithHistory {
  staple_id:           string
  ingredient_id:       string
  name:                string
  emoji:               string | null
  image_url:           string | null
  image_status:        string | null
  last_purchased_at:   string | null
  days_since_purchase: number | null
  avg_frequency_days:  number | null
  purchase_count:      number
  default_store:       string | null
}

// ── useStagingIngredients ─────────────────────────────────────────────────────

/** Fetches recipe ingredients for the given week, runs AI classification,
 *  and returns items split into Zone 1 (always buy) and Zone 2 (check pantry). */
export function useStagingIngredients(weekStart: string | null) {
  const familyId = useAppStore(s => s.familyId)

  return useQuery({
    queryKey: ['staging-ingredients', familyId, weekStart],
    enabled:  !!familyId && !!weekStart,
    staleTime: 1000 * 60 * 5,
    retry: 0, // AI call already has its own fallback — don't retry the whole query
    queryFn:  async () => {
      // 1. Fetch slots with a recipe_id for this week
      const { data: slots, error: slotsErr } = await supabase
        .from('meal_plan_slots')
        .select('recipe_id')
        .eq('family_id', familyId!)
        .eq('week_start', weekStart!)
        .not('recipe_id', 'is', null)
      if (slotsErr) throw slotsErr

      const recipeIds = [...new Set((slots ?? []).map(s => s.recipe_id as string))]

      if (recipeIds.length === 0) {
        return { zone1: [] as StagingIngredient[], zone2: [] as StagingIngredient[], hasRecipes: false }
      }

      // 2. Fetch recipe names for the note display
      const { data: recipes } = await supabase
        .from('recipes')
        .select('id, name')
        .in('id', recipeIds)

      const recipeNameMap = new Map<string, string>()
      for (const r of (recipes ?? [])) {
        recipeNameMap.set(r.id as string, r.name as string)
      }

      // 3. Fetch recipe_ingredients with ingredient data
      const { data: ings, error: ingsErr } = await supabase
        .from('recipe_ingredients')
        .select(`
          recipe_id, ingredient_id, quantity, unit,
          ingredient:ingredients_catalog(id, name, emoji, default_store, image_url, image_status)
        `)
        .in('recipe_id', recipeIds)
      if (ingsErr) throw ingsErr

      // 4. Consolidate by ingredient_id
      type Consolidated = {
        ingredient_id: string
        name:          string
        emoji:         string | null
        image_url:     string | null
        image_status:  string | null
        default_store: string | null
        qtys:          Map<string, number>   // unit → summed qty
        recipeIds:     string[]
      }
      const consolidated = new Map<string, Consolidated>()

      for (const ing of (ings ?? [])) {
        if (!ing.ingredient_id) continue
        const ingData = ing.ingredient as unknown as {
          id: string; name: string; emoji: string | null; default_store: string | null
          image_url: string | null; image_status: string | null
        } | null

        const id = ing.ingredient_id as string
        if (!consolidated.has(id)) {
          consolidated.set(id, {
            ingredient_id: id,
            name:          ingData?.name ?? '—',
            emoji:         ingData?.emoji ?? null,
            image_url:     ingData?.image_url ?? null,
            image_status:  ingData?.image_status ?? null,
            default_store: ingData?.default_store ?? null,
            qtys:          new Map(),
            recipeIds:     [],
          })
        }

        const item = consolidated.get(id)!

        if (ing.quantity != null && ing.unit) {
          const cur = item.qtys.get(ing.unit as string) ?? 0
          item.qtys.set(ing.unit as string, cur + (ing.quantity as number))
        }

        const rid = ing.recipe_id as string
        if (rid && !item.recipeIds.includes(rid)) item.recipeIds.push(rid)
      }

      // 5. Build classifiable items for AI
      const classifiable = Array.from(consolidated.values()).map(c => ({
        ingredient_id: c.ingredient_id,
        name:          c.name,
        emoji:         c.emoji,
      }))

      // 6. AI classification (with heuristic fallback built-in)
      const { zone2: zone2Ids } = await classifyIngredients(classifiable)

      // 7. Build StagingIngredient objects
      function buildItem(c: Consolidated): StagingIngredient {
        // Quantity string: "2 lbs" or "1 cup + 2 tbsp"
        const qtyParts = Array.from(c.qtys.entries()).map(([unit, qty]) => {
          const q = qty % 1 === 0 ? String(qty) : qty.toFixed(1).replace(/\.0$/, '')
          return `${q} ${unit}`
        })
        const qtyStr = qtyParts.join(' + ')

        // Recipe note: "Kebabs + Kofta" or "3 recipes"
        const names = c.recipeIds.map(id => recipeNameMap.get(id) ?? '').filter(Boolean)
        const recipeStr = names.length > 2
          ? `${names[0]} + ${names.length - 1} more`
          : names.join(' + ')

        const note = [qtyStr, recipeStr].filter(Boolean).join(' · ') || null

        return {
          ingredient_id: c.ingredient_id,
          name:          c.name,
          emoji:         c.emoji,
          image_url:     c.image_url,
          image_status:  c.image_status,
          quantity:      c.qtys.size === 1 ? Array.from(c.qtys.values())[0] : null,
          unit:          c.qtys.size === 1 ? Array.from(c.qtys.keys())[0] : null,
          recipe_note:   note,
          aisle_order:   detectAisleOrder(c.name, c.emoji),
          default_store: c.default_store,
        }
      }

      const zone1: StagingIngredient[] = []
      const zone2: StagingIngredient[] = []

      for (const c of consolidated.values()) {
        const item = buildItem(c)
        if (zone2Ids.has(c.ingredient_id)) {
          zone2.push(item)
        } else {
          zone1.push(item)
        }
      }

      // Sort both zones by aisle order
      zone1.sort((a, b) => a.aisle_order - b.aisle_order)
      zone2.sort((a, b) => a.aisle_order - b.aisle_order)

      return { zone1, zone2, hasRecipes: true }
    },
  })
}

// ── useStaplePredictions ──────────────────────────────────────────────────────

/** Fetches all ingredients flagged as pantry staples (is_pantry_staple = true),
 *  computes purchase frequency from history, and splits them into:
 *  - zone3Predicted: due for purchase based on history (≥2 purchases, ≥80% of avg freq elapsed)
 *  - zone3Other:     all other pantry staples (less history or not yet due)
 */
export function useStaplePredictions() {
  const familyId = useAppStore(s => s.familyId)

  return useQuery({
    queryKey: ['staple-predictions', familyId],
    enabled:  !!familyId,
    staleTime: 1000 * 60 * 5,
    queryFn:  async () => {
      // 1. Fetch all pantry staples from ingredient catalog
      const { data: catalogItems, error: catErr } = await supabase
        .from('ingredients_catalog')
        .select('id, name, emoji, default_store, image_url, image_status')
        .eq('family_id', familyId!)
        .eq('is_pantry_staple', true)
        .order('name', { ascending: true })
      if (catErr) throw catErr

      if (!catalogItems?.length) {
        return { zone3Predicted: [] as StapleWithHistory[], zone3Other: [] as StapleWithHistory[] }
      }

      const ingredientIds = catalogItems.map(c => c.id as string)

      // 2. Fetch all purchase history for these ingredients (chronological)
      const { data: history, error: histErr } = await supabase
        .from('purchase_history')
        .select('ingredient_id, purchased_at')
        .eq('family_id', familyId!)
        .in('ingredient_id', ingredientIds)
        .order('purchased_at', { ascending: true })
      if (histErr) throw histErr

      // 3. Group purchase dates by ingredient
      const histByIngredient = new Map<string, Date[]>()
      for (const h of (history ?? [])) {
        if (!h.ingredient_id) continue
        const id = h.ingredient_id as string
        if (!histByIngredient.has(id)) histByIngredient.set(id, [])
        histByIngredient.get(id)!.push(new Date(h.purchased_at as string))
      }

      const today = new Date()
      const zone3Predicted: StapleWithHistory[] = []
      const zone3Other:     StapleWithHistory[] = []

      for (const cat of catalogItems) {
        const dates = histByIngredient.get(cat.id as string) ?? []
        const count = dates.length
        const lastDate = count > 0 ? dates[dates.length - 1] : null
        const daysSince = lastDate
          ? Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
          : null

        // Average interval between purchases (needs ≥ 2 data points)
        let avgFreq: number | null = null
        if (count >= 2) {
          const intervals: number[] = []
          for (let i = 1; i < dates.length; i++) {
            intervals.push((dates[i].getTime() - dates[i - 1].getTime()) / (1000 * 60 * 60 * 24))
          }
          avgFreq = intervals.reduce((a, b) => a + b, 0) / intervals.length
        }

        const item: StapleWithHistory = {
          staple_id:           cat.id as string,  // use ingredient_id; no separate staples row
          ingredient_id:       cat.id as string,
          name:                cat.name as string,
          emoji:               cat.emoji as string | null,
          image_url:           cat.image_url as string | null,
          image_status:        cat.image_status as string | null,
          last_purchased_at:   lastDate?.toISOString() ?? null,
          days_since_purchase: daysSince,
          avg_frequency_days:  avgFreq,
          purchase_count:      count,
          default_store:       cat.default_store as string | null,
        }

        // Predicted: at least 2 purchases AND days-since ≥ 80% of average frequency
        if (count >= 2 && daysSince !== null && avgFreq !== null && daysSince >= avgFreq * 0.8) {
          zone3Predicted.push(item)
        } else {
          zone3Other.push(item)
        }
      }

      return { zone3Predicted, zone3Other }
    },
  })
}

// ── useConfirmStagingList ─────────────────────────────────────────────────────

export interface ConfirmStagingPayload {
  weekStart:       string
  from:            'planner' | 'grocery'
  zone1Items:      StagingIngredient[]
  zone2Selected:   StagingIngredient[]
  zone3Selected:   StapleWithHistory[]   // all selected staples (both predicted + other)
  existingListId?: string | null          // required when from === 'grocery'
}

/**
 * Creates (from planner) or appends-to (from grocery) the grocery list using
 * the staging selections, then records purchase_history for all included items.
 */
export function useConfirmStagingList() {
  const queryClient = useQueryClient()
  const familyId    = useAppStore(s => s.familyId)

  return useMutation({
    mutationFn: async (payload: ConfirmStagingPayload): Promise<string> => {
      if (!familyId) throw new Error('No family ID')
      const { weekStart, from, zone1Items, zone2Selected, zone3Selected, existingListId } = payload

      let listId: string

      if (from === 'planner') {
        // ── Full generation: deactivate old list, create fresh one ──
        await supabase
          .from('grocery_lists')
          .update({ is_active: false })
          .eq('family_id', familyId)
          .eq('week_start', weekStart)
          .eq('is_active', true)

        const { data: newList, error: listErr } = await supabase
          .from('grocery_lists')
          .insert({ family_id: familyId, week_start: weekStart, is_active: true })
          .select('id')
          .single()
        if (listErr) throw listErr
        listId = newList.id as string

        // Insert Zone 1 (always buy) + Zone 2 selected (need it)
        const mealPlanRows = [...zone1Items, ...zone2Selected].map(item => ({
          grocery_list_id: listId,
          ingredient_id:   item.ingredient_id,
          quantity:        item.quantity,
          unit:            item.unit,
          source:          'meal_plan' as const,
          recipe_ids:      [] as string[],
          assigned_store:  item.default_store,
          aisle_order:     item.aisle_order,
          is_checked:      false,
        }))

        if (mealPlanRows.length > 0) {
          const { error } = await supabase.from('grocery_list_items').insert(mealPlanRows)
          if (error) throw error
        }

        // Insert Zone 3 selected (both predicted + other)
        const stapleItems = zone3Selected
        if (stapleItems.length > 0) {
          const stapleRows = stapleItems.map(item => ({
            grocery_list_id: listId,
            ingredient_id:   item.ingredient_id,
            source:          'staple' as const,
            recipe_ids:      [] as string[],
            assigned_store:  item.default_store,
            aisle_order:     detectAisleOrder(item.name, item.emoji),
            is_checked:      false,
          }))
          const { error } = await supabase.from('grocery_list_items').insert(stapleRows)
          if (error) throw error
        }
      } else {
        // ── Append mode: add selections to existing list ──
        if (!existingListId) throw new Error('No existing list ID for append mode')
        listId = existingListId

        // Get existing ingredient_ids to avoid duplicates
        const { data: existing } = await supabase
          .from('grocery_list_items')
          .select('ingredient_id')
          .eq('grocery_list_id', listId)
        const existingIds = new Set(
          (existing ?? []).map(e => e.ingredient_id).filter(Boolean) as string[],
        )

        // Append Zone 2 "Need it" items not already in list
        const newZone2 = zone2Selected.filter(i => !existingIds.has(i.ingredient_id))
        if (newZone2.length > 0) {
          const { error } = await supabase.from('grocery_list_items').insert(
            newZone2.map(item => ({
              grocery_list_id: listId,
              ingredient_id:   item.ingredient_id,
              quantity:        item.quantity,
              unit:            item.unit,
              source:          'meal_plan' as const,
              recipe_ids:      [] as string[],
              assigned_store:  item.default_store,
              aisle_order:     item.aisle_order,
              is_checked:      false,
            })),
          )
          if (error) throw error
        }

        // Append Zone 3 selected items not already in list
        const newStaples = zone3Selected.filter(
          i => !existingIds.has(i.ingredient_id),
        )
        if (newStaples.length > 0) {
          const { error } = await supabase.from('grocery_list_items').insert(
            newStaples.map(item => ({
              grocery_list_id: listId,
              ingredient_id:   item.ingredient_id,
              source:          'staple' as const,
              recipe_ids:      [] as string[],
              assigned_store:  item.default_store,
              aisle_order:     detectAisleOrder(item.name, item.emoji),
              is_checked:      false,
            })),
          )
          if (error) throw error
        }
      }

      // ── Record purchase_history (best-effort, don't block on failure) ──
      const allIds = [
        ...zone1Items.map(i => i.ingredient_id),
        ...zone2Selected.map(i => i.ingredient_id),
        ...zone3Selected.map(i => i.ingredient_id),
      ].filter((id, idx, arr) => id && arr.indexOf(id) === idx)

      if (allIds.length > 0) {
        supabase
          .from('purchase_history')
          .insert(
            allIds.map(ingredient_id => ({
              family_id:    familyId,
              ingredient_id,
              purchased_at: new Date().toISOString(),
              source:       'grocery_list' as const,
            })),
          )
          .then()  // fire-and-forget
      }

      return listId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grocery-list',        familyId] })
      queryClient.invalidateQueries({ queryKey: ['grocery-items'] })
      queryClient.invalidateQueries({ queryKey: ['grocery-has-active',  familyId] })
      queryClient.invalidateQueries({ queryKey: ['staple-predictions',  familyId] })
    },
  })
}
