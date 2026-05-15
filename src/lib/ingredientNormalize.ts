/**
 * Ingredient name normalization helpers.
 *
 * Key rule: "ground X" → "X powder" for spices, but NOT for meats.
 * "Ground turkey" stays "Ground turkey"; "ground cumin" becomes "Cumin powder".
 */

const MEAT_WORDS = new Set([
  'beef', 'chicken', 'turkey', 'pork', 'lamb', 'veal', 'bison', 'venison',
  'duck', 'buffalo', 'meat', 'moose', 'elk', 'rabbit', 'goat', 'mutton',
])

/**
 * Normalize an ingredient name so that equivalent spice names unify:
 *   "ground cumin"  → "Cumin powder"
 *   "Ground cinnamon" → "Cinnamon powder"
 *   "ground turkey" → "ground turkey"  (meat — unchanged)
 *
 * All other names pass through unchanged (only casing is trimmed).
 */
export function normalizeIngredientName(name: string): string {
  const trimmed = name.trim()
  const lower   = trimmed.toLowerCase()

  const m = lower.match(/^ground\s+(.+)$/)
  if (m) {
    const rest      = m[1].trim()
    const firstWord = rest.split(/\s+/)[0]
    if (!MEAT_WORDS.has(firstWord)) {
      // Spice — convert to "X powder" with capital first letter
      const capitalised = rest.charAt(0).toUpperCase() + rest.slice(1)
      return `${capitalised} powder`
    }
  }

  return trimmed
}
