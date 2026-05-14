import { useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
import { parseOrderCSV, fuzzyMatchIngredient } from '../lib/csvImport'

export interface ImportResult {
  imported:     number
  newToCatalog: number
  skipped:      number
}

export function useOrderImport() {
  const familyId = useAppStore(s => s.familyId)

  return useMutation({
    mutationFn: async (csvText: string): Promise<ImportResult> => {
      if (!familyId) throw new Error('No family ID')

      // 1. Parse CSV
      const rows = parseOrderCSV(csvText)
      if (rows.length === 0) throw new Error('No items found in CSV. Check the file format.')

      // 2. Fetch existing catalog
      const { data: catalog, error: catErr } = await supabase
        .from('ingredients_catalog')
        .select('id, name')
        .eq('family_id', familyId)
      if (catErr) throw catErr

      // 3. Match or create catalog entries, build purchase_history inserts
      let newToCatalog = 0
      let skipped      = 0
      const historyRows: { family_id: string; ingredient_id: string; purchased_at: string; source: string }[] = []

      // Work in batches to avoid huge single inserts
      const currentCatalog = [...(catalog ?? [])]

      for (const row of rows) {
        let ingredientId = fuzzyMatchIngredient(row.name, currentCatalog)

        if (!ingredientId) {
          // Create new catalog entry
          const { data: newIng, error: ingErr } = await supabase
            .from('ingredients_catalog')
            .insert({ family_id: familyId, name: row.name })
            .select('id, name')
            .single()

          if (ingErr) { skipped++; continue }
          ingredientId = newIng.id
          currentCatalog.push({ id: newIng.id, name: newIng.name })
          newToCatalog++
        }

        if (!ingredientId) { skipped++; continue }

        historyRows.push({
          family_id:     familyId,
          ingredient_id: ingredientId,
          purchased_at:  row.purchasedAt,
          source:        'order_import',
        })
      }

      // 4. Batch insert purchase_history (chunks of 200)
      const CHUNK = 200
      for (let i = 0; i < historyRows.length; i += CHUNK) {
        const chunk = historyRows.slice(i, i + CHUNK)
        const { error: phErr } = await supabase
          .from('purchase_history')
          .insert(chunk)
        if (phErr) throw phErr
      }

      return {
        imported:     historyRows.length,
        newToCatalog,
        skipped,
      }
    },
  })
}
