import { aiCall } from './ai/index'
import { detectAisleOrder } from './aisleUtils'

export interface ClassifiableItem {
  ingredient_id: string
  name: string
  emoji: string | null
}

export interface ClassificationResult {
  zone1: Set<string>  // ingredient_ids → always buy (perishables, proteins, fresh produce)
  zone2: Set<string>  // ingredient_ids → check pantry (oils, spices, dry goods)
}

/** Heuristic fallback: aisle 5 (oils/spices) → zone2, everything else → zone1. */
function heuristicClassify(items: ClassifiableItem[]): ClassificationResult {
  const zone1 = new Set<string>()
  const zone2 = new Set<string>()
  for (const item of items) {
    if (detectAisleOrder(item.name, item.emoji) === 5) {
      zone2.add(item.ingredient_id)
    } else {
      zone1.add(item.ingredient_id)
    }
  }
  return { zone1, zone2 }
}

/**
 * Ask Claude to classify a list of ingredients into Zone 1 (always buy) vs
 * Zone 2 (check your pantry first). Falls back to a name-based heuristic if
 * the AI call fails or returns unparseable output.
 */
export async function classifyIngredients(
  items: ClassifiableItem[],
): Promise<ClassificationResult> {
  if (items.length === 0) return { zone1: new Set(), zone2: new Set() }

  const systemPrompt = `You are a kitchen expert classifying grocery ingredients into two shopping zones.

Zone 1 (Always Buy): Fresh produce, proteins (meat/poultry/fish/seafood), dairy, eggs, fresh herbs, fresh bread — perishables that must be purchased every week.

Zone 2 (Check Pantry): Dry spices, oils, vinegars, salt, sugar, flour, canned goods, sauces, condiments, dry pasta/rice/grains — long shelf-life items most households already have.

When uncertain, lean toward Zone 1 (safer to buy than to run out).

Return ONLY a valid JSON array, no markdown, no explanation:
[{"name": "exact name here", "zone": "zone1"}, {"name": "exact name here", "zone": "zone2"}]`

  const ingredientList = items.map(i => i.name).join('\n')

  try {
    const raw = await aiCall('grocery_intelligence', ingredientList, {
      systemPrompt,
      maxTokens: 512,
    })

    const match = raw.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('No JSON array in response')

    const parsed = JSON.parse(match[0]) as Array<{ name: string; zone: string }>

    const zone1 = new Set<string>()
    const zone2 = new Set<string>()

    // Build lowercase name → ingredient_id lookup
    const nameMap = new Map<string, string>()
    for (const item of items) {
      nameMap.set(item.name.toLowerCase(), item.ingredient_id)
    }

    for (const entry of parsed) {
      const id = nameMap.get((entry.name ?? '').toLowerCase())
      if (!id) continue
      if (entry.zone === 'zone2') {
        zone2.add(id)
      } else {
        zone1.add(id)
      }
    }

    // Any items AI didn't classify → zone1 by default
    for (const item of items) {
      if (!zone1.has(item.ingredient_id) && !zone2.has(item.ingredient_id)) {
        zone1.add(item.ingredient_id)
      }
    }

    return { zone1, zone2 }
  } catch {
    // Fallback to heuristic — no AI call failure should block the user
    return heuristicClassify(items)
  }
}
