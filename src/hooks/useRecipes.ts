import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
import type { Recipe } from '../types'

export interface RecipeFilters {
  search?: string
  mealType?: 'breakfast' | 'lunch' | 'dinner' | null
  tag?: string | null
  quickOnly?: boolean
}

export function useRecipes(filters: RecipeFilters = {}) {
  const familyId = useAppStore(s => s.familyId)

  return useQuery({
    queryKey: ['recipes', familyId, filters],
    enabled: !!familyId,
    queryFn: async () => {
      let q = supabase
        .from('recipes')
        .select('*')
        .eq('family_id', familyId!)
        .order('created_at', { ascending: false })

      if (filters.search) q = q.ilike('name', `%${filters.search}%`)
      if (filters.mealType) q = q.eq('meal_type', filters.mealType)
      if (filters.tag) q = q.contains('tags', [filters.tag])
      if (filters.quickOnly) q = q.lte('cook_time_minutes', 30)

      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Recipe[]
    },
  })
}

export function useRecipe(id: string | undefined) {
  return useQuery({
    queryKey: ['recipe', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as Recipe
    },
  })
}

export function useRecipeIngredients(recipeId: string | undefined) {
  return useQuery({
    queryKey: ['recipe-ingredients', recipeId],
    enabled: !!recipeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipe_ingredients')
        .select('*, ingredient:ingredients_catalog(id, name, emoji, default_store)')
        .eq('recipe_id', recipeId!)
        .order('sort_order')
      if (error) throw error
      return data ?? []
    },
  })
}

export function useRecipeSteps(recipeId: string | undefined) {
  return useQuery({
    queryKey: ['recipe-steps', recipeId],
    enabled: !!recipeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipe_steps')
        .select('*')
        .eq('recipe_id', recipeId!)
        .order('sort_order')
      if (error) throw error
      return data ?? []
    },
  })
}

export interface SaveRecipePayload {
  name: string
  servings: number
  cook_time_minutes: number | null
  meal_type: string | null
  tags: string[]
  difficulty: string | null
  ingredients: {
    catalogId?: string
    name: string
    emoji: string
    quantity: number | null
    unit: string | null
    prep_note: string | null
    serving_note: string | null
  }[]
  steps: { step_number: number; instruction: string }[]
}

export function useSaveRecipe() {
  const queryClient = useQueryClient()
  const familyId = useAppStore(s => s.familyId)

  return useMutation({
    mutationFn: async (payload: SaveRecipePayload): Promise<string> => {
      if (!familyId) throw new Error('No family ID — cannot save recipe')

      // 1. Upsert ingredients_catalog
      const ingredientIds: string[] = []
      for (const ing of payload.ingredients) {
        if (ing.catalogId) { ingredientIds.push(ing.catalogId); continue }
        const { data: existing } = await supabase
          .from('ingredients_catalog')
          .select('id')
          .eq('family_id', familyId)
          .ilike('name', ing.name)
          .maybeSingle()

        if (existing?.id) {
          ingredientIds.push(existing.id as string)
        } else {
          const { data: newIng, error } = await supabase
            .from('ingredients_catalog')
            .insert({ family_id: familyId, name: ing.name, emoji: ing.emoji })
            .select('id')
            .single()
          if (error) throw error
          ingredientIds.push(newIng.id as string)
        }
      }

      // 2. Insert recipe
      const { data: recipe, error: rErr } = await supabase
        .from('recipes')
        .insert({
          family_id: familyId,
          name: payload.name,
          servings: payload.servings,
          cook_time_minutes: payload.cook_time_minutes,
          meal_type: payload.meal_type,
          tags: payload.tags,
          difficulty: payload.difficulty,
          image_status: 'pending',
        })
        .select('id')
        .single()
      if (rErr) throw rErr

      // 3. Insert recipe_ingredients
      if (payload.ingredients.length > 0) {
        const { error: riErr } = await supabase.from('recipe_ingredients').insert(
          payload.ingredients.map((ing, i) => ({
            recipe_id: recipe.id,
            ingredient_id: ingredientIds[i],
            quantity: ing.quantity,
            unit: ing.unit,
            prep_note: ing.prep_note,
            serving_note: ing.serving_note,
            sort_order: i,
          }))
        )
        if (riErr) throw riErr
      }

      // 4. Insert recipe_steps
      if (payload.steps.length > 0) {
        const { error: sErr } = await supabase.from('recipe_steps').insert(
          payload.steps.map((s, i) => ({
            recipe_id: recipe.id,
            step_number: s.step_number,
            instruction: s.instruction,
            sort_order: i,
          }))
        )
        if (sErr) throw sErr
      }

      return recipe.id as string
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('recipes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}
