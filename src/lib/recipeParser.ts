import { aiCall } from './ai'

export interface ParsedIngredient {
  name: string
  emoji: string
  quantity: number | null
  unit: string | null
  prep_note: string | null
  serving_note: string | null
  /** Set when Claude couldn't confidently extract quantity */
  flag: 'confirm_quantity' | null
  /** Component/section this ingredient belongs to (e.g. "Dough", "Sauce") */
  section?: string | null
}

export interface ParsedStep {
  step_number: number
  instruction: string
  /** Component/section this step belongs to (e.g. "Dough", "Sauce") */
  section?: string | null
}

export interface ParsedRecipe {
  name: string
  servings: number
  cook_time_minutes: number | null
  meal_type: 'breakfast' | 'lunch' | 'dinner' | null
  tags: string[]
  difficulty: string | null
  ingredients: ParsedIngredient[]
  steps: ParsedStep[]
  /**
   * Named components for multi-part recipes (e.g. ["Dough", "Sauce", "Pizza"]).
   * When present, every ingredient and step carries a matching `section` field.
   * Omit (or leave empty) for single-component recipes.
   */
  components?: string[]
}

const SYSTEM_PROMPT = `You are a recipe structuring assistant. Your job is to extract and structure recipe text into clean JSON.

RULES:
- Return ONLY valid JSON — no markdown fences, no explanation, no preamble.
- Standardize ingredient names: "Ground lamb" not "lamb (ground)", "Olive oil, extra virgin" not "EVOO".
- For emoji: pick the single most relevant food emoji for each ingredient.
- For tags: include cuisine style (e.g. "Indian", "Mexican", "Italian"), dietary notes ("Vegetarian", "Vegan", "Gluten-free"), and "Quick" if total cook time ≤ 30 min.
- For flag: set "confirm_quantity" when the original text had vague measures like "a knob of", "to taste", "some", "handful", or any non-numeric amount. Leave null otherwise.
- For difficulty: "Easy", "Medium", or "Hard". Null if unclear.
- For meal_type: infer from context if not stated. Null if genuinely ambiguous.
- MULTI-COMPONENT RECIPES: If the recipe has distinct components that are made separately (e.g. Pizza → Dough + Sauce + Assembly; Burger → Patty + Bun + Assembly; Layer cake → Sponge + Frosting + Assembly), add a "components" array naming each part in logical order, and set the "section" field on every ingredient and step to the matching component name. For simple single-step recipes, omit "components" entirely and leave "section" as null on all items.`

const USER_PROMPT_TEMPLATE = `Structure this recipe into JSON matching this exact schema:

{
  "name": string,
  "servings": number,
  "cook_time_minutes": number | null,
  "meal_type": "breakfast" | "lunch" | "dinner" | null,
  "tags": string[],
  "difficulty": "Easy" | "Medium" | "Hard" | null,
  "components": string[] | null,
  "ingredients": [
    {
      "name": string,
      "emoji": string,
      "quantity": number | null,
      "unit": "tsp" | "tbsp" | "cup" | "oz" | "lbs" | "g" | "ml" | "whole" | null,
      "prep_note": string | null,
      "serving_note": string | null,
      "flag": "confirm_quantity" | null,
      "section": string | null
    }
  ],
  "steps": [
    {
      "step_number": number,
      "instruction": string,
      "section": string | null
    }
  ]
}

"components" is the ordered list of component names (e.g. ["Dough","Sauce","Pizza"]) or null for simple recipes.
"section" on each ingredient/step must exactly match one of the component names, or null for simple recipes.

Recipe text:
---
{RAW_TEXT}
---`

export async function parseRecipeFromText(rawText: string): Promise<ParsedRecipe> {
  const prompt = USER_PROMPT_TEMPLATE.replace('{RAW_TEXT}', rawText)

  const raw = await aiCall('recipe_structuring', prompt, {
    systemPrompt: SYSTEM_PROMPT,
    maxTokens: 4096,
  })

  // Strip any accidental markdown fences
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()

  let parsed: ParsedRecipe
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`Claude returned invalid JSON. Response was:\n${raw.slice(0, 500)}`)
  }

  // Minimal validation
  if (!parsed.name) throw new Error('Claude did not return a recipe name')
  if (!Array.isArray(parsed.ingredients)) parsed.ingredients = []
  if (!Array.isArray(parsed.steps)) parsed.steps = []
  if (!Array.isArray(parsed.tags)) parsed.tags = []

  return parsed
}

/** Fetch a URL via the fetch-url Edge Function, then parse it */
export async function parseRecipeFromUrl(url: string, accessToken: string): Promise<{ rawText: string; parsed: ParsedRecipe }> {
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-url`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
      body: JSON.stringify({ url }),
    }
  )
  const json = await res.json() as { text?: string; error?: string }
  if (json.error) throw new Error(`URL fetch failed: ${json.error}`)
  if (!json.text) throw new Error('URL returned no text content')

  const parsed = await parseRecipeFromText(json.text)
  return { rawText: json.text, parsed }
}
