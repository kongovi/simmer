// ── CSV Order History Parser ───────────────────────────────────────────────────
// Supports Instacart, Amazon Fresh, Kroger, and generic grocery CSV exports.
// Returns an array of { name, purchasedAt } records.

export interface ParsedOrderRow {
  name:        string      // normalized ingredient name
  purchasedAt: string      // ISO date string
}

// ── Column name detection ─────────────────────────────────────────────────────

const NAME_COLS  = ['item name', 'item', 'product name', 'product', 'description', 'name', 'title']
const DATE_COLS  = ['date ordered', 'order date', 'date', 'purchased', 'purchase date', 'ordered']
// QTY_COLS kept for future quantity parsing
// const QTY_COLS = ['qty', 'quantity', 'count']

function findCol(headers: string[], candidates: string[]): number {
  const lower = headers.map(h => h.toLowerCase().trim())
  for (const c of candidates) {
    const idx = lower.indexOf(c)
    if (idx !== -1) return idx
  }
  // partial match fallback
  for (const c of candidates) {
    const idx = lower.findIndex(h => h.includes(c))
    if (idx !== -1) return idx
  }
  return -1
}

// ── Name normalisation ────────────────────────────────────────────────────────

// Strip common grocery noise: brand codes, size suffixes, paren qualifiers
const STRIP_RE = /\b(\d+(\.\d+)?\s*(oz|lb|lbs|g|kg|ml|l|ct|pk|pack|count|each|ea)\b|\([^)]*\))/gi
const BRAND_RE = /^(organic|fresh|whole|raw|frozen|dried|cooked|baby|mini|large|small|medium)\s+/i

export function normaliseName(raw: string): string {
  return raw
    .replace(STRIP_RE, '')
    .replace(BRAND_RE, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    // Title-case
    .replace(/\b\w/g, c => c.toUpperCase())
}

// ── Date parsing ──────────────────────────────────────────────────────────────

function parseDate(raw: string): string | null {
  if (!raw) return null
  // Try common formats: MM/DD/YYYY, YYYY-MM-DD, DD MMM YYYY, etc.
  const d = new Date(raw.replace(/(\d{1,2})\/(\d{1,2})\/(\d{4})/, '$3-$1-$2'))
  if (!isNaN(d.getTime())) return d.toISOString()
  return null
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseOrderCSV(text: string): ParsedOrderRow[] {
  // Normalise line endings
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (lines.length < 2) return []

  // Detect delimiter: comma or tab
  const delim = lines[0].includes('\t') ? '\t' : ','

  // Parse CSV row respecting quoted fields
  function parseRow(line: string): string[] {
    const fields: string[] = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
        else inQ = !inQ
      } else if (ch === delim && !inQ) {
        fields.push(cur.trim()); cur = ''
      } else {
        cur += ch
      }
    }
    fields.push(cur.trim())
    return fields
  }

  const headers = parseRow(lines[0])
  const nameIdx = findCol(headers, NAME_COLS)
  const dateIdx = findCol(headers, DATE_COLS)

  if (nameIdx === -1) return []   // can't identify item column

  const results: ParsedOrderRow[] = []
  const seen = new Set<string>()

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const row  = parseRow(line)
    const raw  = row[nameIdx] ?? ''
    if (!raw || raw.toLowerCase() === 'item name') continue

    const name = normaliseName(raw)
    if (!name || name.length < 2) continue

    const rawDate = dateIdx !== -1 ? (row[dateIdx] ?? '') : ''
    const purchasedAt = parseDate(rawDate) ?? new Date().toISOString()

    // De-duplicate same item on same date
    const key = `${name}|${purchasedAt.slice(0, 10)}`
    if (seen.has(key)) continue
    seen.add(key)

    results.push({ name, purchasedAt })
  }

  return results
}

// ── Fuzzy matcher ─────────────────────────────────────────────────────────────

/** Simple normalise + substring match. Returns best catalog id or null. */
export function fuzzyMatchIngredient(
  name: string,
  catalog: { id: string; name: string; aliases?: string[] }[]
): string | null {
  const needle = name.toLowerCase().trim()

  // Tier 0: alias exact match — learned from prior merges, highest confidence
  for (const c of catalog) {
    if (c.aliases?.some(a => a.toLowerCase() === needle)) return c.id
  }

  // Tier 1: exact name match
  const exact = catalog.find(c => c.name.toLowerCase() === needle)
  if (exact) return exact.id

  // Tier 2: alias contains match (needle in alias or alias in needle)
  for (const c of catalog) {
    if (c.aliases?.some(a => {
      const al = a.toLowerCase()
      return al.includes(needle) || needle.includes(al)
    })) return c.id
  }

  // Tier 3: name contains match (needle in catalog name or vice-versa)
  const contains = catalog.find(c => {
    const hay = c.name.toLowerCase()
    return hay.includes(needle) || needle.includes(hay)
  })
  if (contains) return contains.id

  // Tier 4: word-overlap — count shared words, require ≥50% overlap
  const needleWords = new Set(needle.split(/\s+/).filter(w => w.length > 2))
  let bestId: string | null = null
  let bestScore = 0

  for (const c of catalog) {
    const hayWords = c.name.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    const shared   = hayWords.filter(w => needleWords.has(w)).length
    if (shared > 0) {
      const score = shared / Math.max(needleWords.size, hayWords.length)
      if (score > bestScore && score >= 0.5) { bestScore = score; bestId = c.id }
    }
  }

  return bestId
}
