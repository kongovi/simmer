import { useMutation } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
import { parseOrderCSV, fuzzyMatchIngredient } from '../lib/csvImport'
import { generateIngredientImage } from '../lib/images'

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
      const newIngredients: { id: string; name: string }[] = []

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
          newIngredients.push({ id: newIng.id, name: newIng.name })
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

      // 5. Kick off image generation for all newly created catalog entries.
      //    Bulk-mark as 'generating' first so pulsing dots appear immediately,
      //    then stagger the actual edge-function calls 300ms apart.
      if (newIngredients.length > 0) {
        const newIds = newIngredients.map(i => i.id)
        await supabase
          .from('ingredients_catalog')
          .update({ image_status: 'generating' })
          .in('id', newIds)

        newIngredients.forEach((ing, i) => {
          setTimeout(() => {
            generateIngredientImage(ing.id, ing.name).catch(err =>
              console.warn(`Import image error [${ing.name}]:`, err)
            )
          }, i * 300) // stagger: 0ms, 300ms, 600ms, …
        })
      }

      return {
        imported:     historyRows.length,
        newToCatalog,
        skipped,
      }
    },
  })
}
