/**
 * Ingredient name normalization helpers.
 *
 * Goal: unify synonymous spice forms so they share one catalog entry,
 * while keeping genuinely distinct forms separate.
 *
 * ── Unified (same catalog entry) ───────────────────────────────────────────
 *   "ground cumin"    → "Cumin powder"
 *   "cumin powder"    → "Cumin powder"
 *   "cumin, ground"   → "Cumin powder"
 *   "powdered cumin"  → "Cumin powder"
 *
 * ── Kept separate (different catalog entries) ──────────────────────────────
 *   "cumin seed"  ≠  "Cumin powder"   (whole seed vs ground)
 *   "garlic"      ≠  "Garlic powder"  (fresh produce vs dried spice)
 *   "fresh ginger" ≠ "Ginger powder"  (fresh vs dried)
 *
 * ── Never normalized ────────────────────────────────────────────────────────
 *   "ground turkey" — meat word, stays unchanged
 *   "ground beef"   — meat word, stays unchanged
 */

/** Meat words that should never be normalized even when preceded by "ground" */
const MEAT_WORDS = new Set([
  'beef', 'chicken', 'turkey', 'pork', 'lamb', 'veal', 'bison', 'venison',
  'duck', 'buffalo', 'meat', 'moose', 'elk', 'rabbit', 'goat', 'mutton',
])

/**
 * Form-preserving suffixes — if an ingredient name contains one of these words
 * after the base, it represents a distinct physical form and must NOT be merged
 * with the ground/powder canonical form.
 *
 * e.g. "cumin seed", "cumin seeds", "whole cumin", "cumin flakes"
 */
const WHOLE_FORM_WORDS = new Set([
  'seed', 'seeds',
  'whole',
  'leaf', 'leaves',
  'flake', 'flakes',
  'root', 'roots',
  'stalk', 'stalks',
  'berry', 'berries',
  'clove', 'cloves',    // garlic cloves — distinct from garlic powder
  'bulb', 'bulbs',
  'sprig', 'sprigs',
  'stick', 'sticks',    // cinnamon sticks vs cinnamon powder
  'pod', 'pods',
  'grain', 'grains',
])

/**
 * Freshness prefixes — if a name starts with one of these, it's a fresh/raw
 * ingredient and must NOT be merged with the dry powder form.
 *
 * e.g. "fresh ginger" stays "fresh ginger", never merges with "ginger powder"
 */
const FRESH_PREFIXES = new Set(['fresh', 'raw', 'dried'])

function toTitleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/**
 * Returns true if a name contains a whole-form word, meaning it should NOT
 * be normalized to a powder canonical form.
 */
function hasWholeFormWord(words: string[]): boolean {
  return words.some(w => WHOLE_FORM_WORDS.has(w))
}

/**
 * Normalize an ingredient name to its canonical form:
 *
 *  1. "ground X"   → "X powder"  (unless X is a meat or has a whole-form word)
 *  2. "X, ground"  → "X powder"
 *  3. "powdered X" → "X powder"
 *  4. "X powder"   → "X powder"  (canonical casing)
 *
 * Everything else passes through with only whitespace trimmed.
 */
export function normalizeIngredientName(name: string): string {
  const trimmed = name.trim()
  const lower   = trimmed.toLowerCase()

  // ── Pattern 1: "ground X" ─────────────────────────────────────────────────
  const groundPrefix = lower.match(/^ground\s+(.+)$/)
  if (groundPrefix) {
    const rest      = groundPrefix[1].trim()
    const words     = rest.split(/\s+/)
    const firstWord = words[0]

    // Never normalize meats
    if (MEAT_WORDS.has(firstWord)) return trimmed

    // Never normalize if rest contains a whole-form word (e.g. "ground flaxseed")
    if (hasWholeFormWord(words)) return trimmed

    return toTitleCase(rest) + ' powder'
  }

  // ── Pattern 2: "X, ground" ────────────────────────────────────────────────
  const commaGround = lower.match(/^(.+),\s*ground$/)
  if (commaGround) {
    const base      = commaGround[1].trim()
    const words     = base.split(/\s+/)
    const firstWord = words[0]

    if (!MEAT_WORDS.has(firstWord) && !hasWholeFormWord(words)) {
      return toTitleCase(base) + ' powder'
    }
  }

  // ── Pattern 3: "powdered X" ───────────────────────────────────────────────
  const powderedPrefix = lower.match(/^powdered\s+(.+)$/)
  if (powderedPrefix) {
    const rest  = powderedPrefix[1].trim()
    const words = rest.split(/\s+/)
    if (!hasWholeFormWord(words)) {
      return toTitleCase(rest) + ' powder'
    }
  }

  // ── Pattern 4: "X powder" — canonicalize casing only ─────────────────────
  // Guard: don't collapse "X powder" if the base starts with a fresh prefix
  // (e.g. "dried chili powder" should stay as-is — it's already specific enough,
  //  but "garlic powder" → "Garlic powder" with canonical casing)
  const powderSuffix = lower.match(/^(.+)\s+powder$/)
  if (powderSuffix) {
    const base      = powderSuffix[1].trim()
    const words     = base.split(/\s+/)
    const firstWord = words[0]

    // If base starts with a fresh/raw/dried prefix, leave it alone
    if (FRESH_PREFIXES.has(firstWord)) return trimmed

    // Just canonicalize casing: "garlic powder" → "Garlic powder"
    return toTitleCase(base) + ' powder'
  }

  // ── Everything else: trim only ────────────────────────────────────────────
  return trimmed
}

/*
 * ── Matching prompt (used by AI recipe parser + catalog lookup) ─────────────
 *
 * The AI recipe parser receives this system guidance for ingredient names:
 *
 *   "When outputting ingredient names, use the most specific form:
 *    - Powdered/ground spices: use 'X powder' (e.g. 'cumin powder', 'garlic powder')
 *    - Whole/seed forms: include the form word (e.g. 'cumin seeds', 'cinnamon stick')
 *    - Fresh produce: prefix with 'fresh' only when necessary to distinguish
 *      from a dried form (e.g. 'fresh ginger' vs 'ginger powder')
 *    - Never combine 'X seed/seeds' with 'X powder' — they are different ingredients
 *    - Never combine 'garlic' (fresh) with 'garlic powder' (dried spice)"
 *
 * After parsing, normalizeIngredientName() is applied to each ingredient name
 * before catalog lookup / insert, so that:
 *   "ground cumin" → "Cumin powder"  } same catalog entry
 *   "cumin powder" → "Cumin powder"  }
 *   "cumin seeds"  → "cumin seeds"   } different catalog entry
 *   "garlic"       → "garlic"        } different catalog entry
 *   "garlic powder"→ "Garlic powder" } different catalog entry
 */
