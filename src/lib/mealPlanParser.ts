import { aiCall } from './ai'
import type { MealType } from '../types'

export interface ParsedDish {
  name: string
  emoji: string
}

export interface ParsedMealEntry {
  day: string       // full day name e.g. "Friday"
  meal_type: MealType
  dishes: ParsedDish[]
}

const SYSTEM_PROMPT = `You are a meal planning assistant. Parse the user's freeform weekly meal plan into structured JSON.

Return a JSON array. Each element must have:
- "day": one of ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]
- "meal_type": one of ["breakfast","lunch","dinner"]
- "dishes": array of objects with "name" (string) and "emoji" (single relevant food emoji)

Rules:
- Only include days and meal types explicitly mentioned
- If a meal serves different groups (e.g. "paneer for adults, nuggets for kids"), list each as a separate dish
- Normalise day abbreviations: "Fri" → "Friday", "Sat nite" → "Saturday", etc.
- Choose a fitting emoji for each dish
- Return ONLY a valid JSON array — no markdown fences, no explanation

Example:
[
  {"day":"Friday","meal_type":"dinner","dishes":[{"name":"Adana Kebabs","emoji":"🥙"},{"name":"Green Salad","emoji":"🥗"}]},
  {"day":"Sunday","meal_type":"dinner","dishes":[{"name":"Butter Paneer","emoji":"🍛"},{"name":"Chicken Nuggets","emoji":"🍗"}]}
]`

export async function parseMealPlanText(text: string): Promise<ParsedMealEntry[]> {
  const raw = await aiCall('meal_plan_parsing', text, {
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 1024,
  })

  // Extract JSON array from response (handles any stray text / fences)
  const match = raw.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('Claude did not return a JSON array — try rephrasing your description')

  const parsed = JSON.parse(match[0]) as ParsedMealEntry[]
  if (!Array.isArray(parsed)) throw new Error('Unexpected response format')
  return parsed
}

// ── NOTE FOR FUTURE SESSION ───────────────────────────────────────────────────
// parseMealPlanText() currently stores everything as freeform_name on the slot.
// A future session should add catalog matching: after parsing, attempt to match
// each dish name against the family's recipes (ingredients_catalog) and set
// recipe_id on the slot when a match is found. This enables the grocery list
// generator to pull structured ingredient data for AI-planned meals.
// ─────────────────────────────────────────────────────────────────────────────
