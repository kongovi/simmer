import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DishOccurrence {
  recipe_name: string
  slot_date:   string        // ISO "2026-05-11" — displayed as short day name
  quantity:    number | null // already scaled to slot servings
  unit:        string | null
  prep_note:   string | null
}

export interface PrepIngredient {
  ingredient_id:     string
  name:              string
  emoji:             string | null
  image_url:         string | null
  image_status:      string | null
  /** Summed quantities per unit, e.g. [{quantity:2,unit:'lbs'}] */
  totals:            { quantity: number; unit: string | null }[]
  /** Human-readable consolidated prep note, e.g. "½ lb minced · 1 lb sliced" */
  consolidated_prep: string | null
  dishes:            DishOccurrence[]
}

// ── Helper: pretty-print a quantity number ────────────────────────────────────

function fmtQty(q: number): string {
  // common fractions
  if (Math.abs(q - 0.25) < 0.01) return '¼'
  if (Math.abs(q - 0.33) < 0.02) return '⅓'
  if (Math.abs(q - 0.5)  < 0.01) return '½'
  if (Math.abs(q - 0.67) < 0.02) return '⅔'
  if (Math.abs(q - 0.75) < 0.01) return '¾'
  return q % 1 === 0 ? String(q) : q.toFixed(1).replace(/\.0$/, '')
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useMealPrep(weekStart: string | null) {
  const familyId = useAppStore(s => s.familyId)

  return useQuery({
    queryKey: ['meal-prep', familyId, weekStart],
    enabled:  !!familyId && !!weekStart,
    queryFn:  async (): Promise<PrepIngredient[]> => {
      // 1. Fetch slots that have a recipe, joined with recipe name + servings
      const { data: slots, error: slotsErr } = await supabase
        .from('meal_plan_slots')
        .select('slot_date, recipe_id, servings_override, recipe:recipes(id, name, servings)')
        .eq('family_id', familyId!)
        .eq('week_start', weekStart!)
        .not('recipe_id', 'is', null)
        .order('slot_date', { ascending: true })
      if (slotsErr) throw slotsErr
      if (!slots || slots.length === 0) return []

      const recipeIds = [...new Set(slots.map(s => s.recipe_id as string))]

      // 2. Fetch all ingredients for those recipes
      const { data: riRows, error: riErr } = await supabase
        .from('recipe_ingredients')
        .select(`
          recipe_id, ingredient_id, quantity, unit, prep_note,
          ingredient:ingredients_catalog(id, name, emoji, image_url, image_status)
        `)
        .in('recipe_id', recipeIds)
      if (riErr) throw riErr

      // 3. Build aggregated map keyed by ingredient_id
      const map = new Map<string, PrepIngredient>()

      for (const slot of slots) {
        const recipe = slot.recipe as unknown as { id: string; name: string; servings: number | null } | null
        if (!recipe) continue

        const baseServings = recipe.servings ?? 4
        const slotServings = (slot.servings_override as number | null) ?? baseServings
        const scaleFactor  = baseServings > 0 ? slotServings / baseServings : 1

        const slotRis = (riRows ?? []).filter(r => r.recipe_id === slot.recipe_id)

        for (const ri of slotRis) {
          if (!ri.ingredient_id) continue
          const ing = ri.ingredient as unknown as { id: string; name: string; emoji: string | null; image_url: string | null; image_status: string | null } | null
          if (!ing) continue

          const scaledQty = ri.quantity != null ? (ri.quantity as number) * scaleFactor : null

          const dish: DishOccurrence = {
            recipe_name: recipe.name,
            slot_date:   slot.slot_date as string,
            quantity:    scaledQty,
            unit:        ri.unit as string | null,
            prep_note:   ri.prep_note as string | null,
          }

          const existing = map.get(ri.ingredient_id as string)
          if (existing) {
            existing.dishes.push(dish)
            if (scaledQty != null) {
              const tot = existing.totals.find(t => t.unit === dish.unit)
              if (tot) {
                tot.quantity += scaledQty
              } else {
                existing.totals.push({ quantity: scaledQty, unit: dish.unit })
              }
            }
          } else {
            map.set(ri.ingredient_id as string, {
              ingredient_id:     ri.ingredient_id as string,
              name:              ing.name,
              emoji:             ing.emoji,
              image_url:         ing.image_url ?? null,
              image_status:      ing.image_status ?? null,
              totals:            scaledQty != null ? [{ quantity: scaledQty, unit: dish.unit }] : [],
              consolidated_prep: null,
              dishes:            [dish],
            })
          }
        }
      }

      // 4. Compute consolidated_prep per ingredient
      for (const entry of map.values()) {
        const notedDishes = entry.dishes.filter(d => d.prep_note)
        if (notedDishes.length === 0) {
          entry.consolidated_prep = null
          continue
        }

        const uniqueNotes = [...new Set(notedDishes.map(d => d.prep_note!))]
        if (uniqueNotes.length === 1) {
          // All dishes share the same prep note — show it once
          entry.consolidated_prep = uniqueNotes[0]
        } else {
          // Multiple distinct prep notes — summarise as "Xunit note · Xunit note"
          // Group by prep_note and accumulate qty
          const noteAcc = new Map<string, { quantity: number | null; unit: string | null }>()
          for (const d of notedDishes) {
            const note = d.prep_note!
            if (noteAcc.has(note)) {
              const acc = noteAcc.get(note)!
              if (d.quantity != null && acc.quantity != null) acc.quantity += d.quantity
              else acc.quantity = null   // mixed nullability → drop qty
            } else {
              noteAcc.set(note, { quantity: d.quantity, unit: d.unit })
            }
          }
          entry.consolidated_prep = Array.from(noteAcc.entries())
            .map(([note, { quantity, unit }]) => {
              if (quantity == null) return note
              const qStr = fmtQty(quantity)
              return unit ? `${qStr} ${unit} ${note}` : `${qStr} ${note}`
            })
            .join(' · ')
        }
      }

      // 5. Sort: most dish occurrences first
      return Array.from(map.values()).sort((a, b) => b.dishes.length - a.dishes.length)
    },
  })
}

// ── Display helpers ────────────────────────────────────────────────────────────

/** "2 lbs total", "12 cloves total", "4 whole" */
export function formatTotals(totals: PrepIngredient['totals'], dishCount: number): string {
  if (totals.length === 0) return ''
  const parts = totals.map(({ quantity, unit }) => {
    const qStr = fmtQty(quantity)
    return unit ? `${qStr} ${unit}` : qStr
  })
  const joined = parts.join(' + ')
  return dishCount > 1 ? `${joined} total` : joined
}

/** "Mon", "Tue", etc. from an ISO date string */
export function slotDayLabel(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00`).toLocaleString('default', { weekday: 'short' })
}
