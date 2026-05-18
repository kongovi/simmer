import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
import type { MealType } from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SlotDish {
  id: string
  slot_date: string
  meal_type: MealType
  sort_order: number
  recipe_id:    string | null
  freeform_name: string | null
  // joined from recipes (null for freeform)
  recipe: { id: string; name: string; emoji: string | null; image_url: string | null; image_status: string | null } | null
}

export interface AddDishPayload {
  weekStart:    string
  slotDate:     string
  mealType:     MealType
  freeformName: string
  recipeId?:    string
  sortOrder:    number
}

// ── Query ─────────────────────────────────────────────────────────────────────

export function useSlotsForWeek(weekStart: string) {
  const familyId = useAppStore(s => s.familyId)

  return useQuery({
    queryKey: ['meal-plan', familyId, weekStart],
    enabled:  !!familyId && !!weekStart,
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('meal_plan_slots')
        .select('id, slot_date, meal_type, sort_order, recipe_id, freeform_name, recipe:recipes(id, name, emoji, image_url, image_status)')
        .eq('family_id', familyId!)
        .eq('week_start', weekStart)
        .order('sort_order')
      if (error) throw error
      // Supabase infers recipe join as array; cast via unknown since we know the shape
      return (data ?? []) as unknown as SlotDish[]
    },
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export function useAddDish() {
  const queryClient = useQueryClient()
  const familyId    = useAppStore(s => s.familyId)

  return useMutation({
    mutationFn: async (payload: AddDishPayload): Promise<string> => {
      if (!familyId) throw new Error('No family ID')
      const { data, error } = await supabase
        .from('meal_plan_slots')
        .insert({
          family_id:     familyId,
          week_start:    payload.weekStart,
          slot_date:     payload.slotDate,
          meal_type:     payload.mealType,
          freeform_name: payload.freeformName,
          recipe_id:     payload.recipeId ?? null,
          sort_order:    payload.sortOrder,
        })
        .select('id')
        .single()
      if (error) throw error
      return data.id as string
    },
    onSuccess: (_id, payload) => {
      queryClient.invalidateQueries({ queryKey: ['meal-plan', familyId, payload.weekStart] })
    },
  })
}

export function useRemoveDish() {
  const queryClient = useQueryClient()
  const familyId    = useAppStore(s => s.familyId)

  return useMutation({
    mutationFn: async ({ id, weekStart }: { id: string; weekStart: string }) => {
      const { error } = await supabase
        .from('meal_plan_slots')
        .delete()
        .eq('id', id)
      if (error) throw error
      return weekStart
    },
    onSuccess: (_ws, payload) => {
      queryClient.invalidateQueries({ queryKey: ['meal-plan', familyId, payload.weekStart] })
    },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Group a flat list of SlotDish rows into a map keyed by "date_mealtype". */
export function groupBySlot(dishes: SlotDish[]): Map<string, SlotDish[]> {
  const map = new Map<string, SlotDish[]>()
  for (const d of dishes) {
    const key = `${d.slot_date}_${d.meal_type}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(d)
  }
  return map
}

/** Readable display name for a dish row. */
export function dishDisplayName(d: SlotDish): string {
  return d.recipe?.name ?? d.freeform_name ?? '—'
}

/** Emoji for a dish row — falls back to 🍽️. */
export function dishEmoji(d: SlotDish): string {
  return d.recipe?.emoji ?? '🍽️'
}
