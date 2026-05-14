import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
import { generateDishImage, generateIngredientImage, buildImagePrompt } from '../lib/images'
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
        .select('*, ingredient:ingredients_catalog(id, name, emoji, default_store, image_url, image_status)')
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

// ── Realtime: watch recipe image updates ──────────────────────────────────────

/**
 * Subscribe to Supabase Realtime updates on the recipes table for this family.
 * When image_url or image_status changes, updates the React Query cache in-place
 * so RecipeCard and RecipeDetailScreen re-render without a full refetch.
 *
 * Call this once near the top of the app (e.g. in RecipesScreen or ProtectedLayout).
 */
export function useRecipeImageRealtime() {
  const familyId = useAppStore(s => s.familyId)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!familyId) return

    const channel = supabase
      .channel(`recipe-images-${familyId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'recipes',
          filter: `family_id=eq.${familyId}`,
        },
        (payload) => {
          const updated = payload.new as Recipe

          // Patch the recipe list cache
          queryClient.setQueriesData<Recipe[]>(
            { queryKey: ['recipes', familyId] },
            (old) => old?.map(r => r.id === updated.id ? { ...r, ...updated } : r)
          )

          // Patch the individual recipe cache
          queryClient.setQueryData<Recipe>(
            ['recipe', updated.id],
            (old) => old ? { ...old, ...updated } : old
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [familyId, queryClient])
}

// ── Save recipe ───────────────────────────────────────────────────────────────

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

/** Bulk staples that shouldn't be the recipe's representative emoji */
const STAPLE_NAMES = new Set([
  'salt', 'pepper', 'oil', 'olive oil', 'water', 'butter', 'flour', 'sugar',
  'garlic', 'onion', 'black pepper', 'vegetable oil', 'cooking spray',
])

/** Pick the best representative emoji from the ingredient list */
function pickRecipeEmoji(ingredients: SaveRecipePayload['ingredients']): string | null {
  const nonStaple = ingredients.find(
    ing => ing.emoji && !STAPLE_NAMES.has(ing.name.toLowerCase())
  )
  return nonStaple?.emoji ?? ingredients[0]?.emoji ?? null
}

/** Build keySides string for the image prompt from the top ingredients */
function buildKeySides(ingredients: SaveRecipePayload['ingredients']): string {
  const names = ingredients
    .filter(ing => !STAPLE_NAMES.has(ing.name.toLowerCase()))
    .slice(0, 3)
    .map(ing => ing.name)
  return names.length > 0 ? names.join(', ') : 'seasonal vegetables and herbs'
}

/**
 * For each step, find which ingredient catalog IDs are mentioned in the instruction.
 * Simple case-insensitive word-boundary match on the ingredient name.
 */
function matchIngredientIds(
  stepInstruction: string,
  ingredients: SaveRecipePayload['ingredients'],
  ingredientIds: string[]
): string[] {
  const lower = stepInstruction.toLowerCase()
  return ingredients.reduce<string[]>((acc, ing, i) => {
    // Check if the ingredient name (or first word of it) appears in the instruction
    const nameLower = ing.name.toLowerCase()
    const firstWord = nameLower.split(' ')[0]
    if (lower.includes(nameLower) || (firstWord.length > 3 && lower.includes(firstWord))) {
      acc.push(ingredientIds[i])
    }
    return acc
  }, [])
}

export function useSaveRecipe() {
  const queryClient = useQueryClient()
  const familyId = useAppStore(s => s.familyId)

  return useMutation({
    mutationFn: async (payload: SaveRecipePayload): Promise<string> => {
      if (!familyId) throw new Error('No family ID — cannot save recipe')

      // 1. Upsert ingredients_catalog; track which need image generation.
      // Uses ON CONFLICT on the (family_id, lower(trim(name))) unique index so
      // concurrent saves of the same ingredient never create duplicates.
      const ingredientIds: string[] = []
      const needsImageGen: { id: string; name: string }[] = []

      for (const ing of payload.ingredients) {
        if (ing.catalogId) {
          // Already resolved — just check whether image gen is needed
          ingredientIds.push(ing.catalogId)
          const { data: cat } = await supabase
            .from('ingredients_catalog')
            .select('id, image_url')
            .eq('id', ing.catalogId)
            .maybeSingle()
          if (cat && !cat.image_url) needsImageGen.push({ id: ing.catalogId, name: ing.name })
          continue
        }

        // Upsert: insert or return existing row — never duplicates
        const { data: upserted, error: upsertErr } = await supabase
          .from('ingredients_catalog')
          .upsert(
            { family_id: familyId, name: ing.name, emoji: ing.emoji },
            { onConflict: 'family_id,lower(trim(name))', ignoreDuplicates: false }
          )
          .select('id, image_url')
          .single()

        if (upsertErr) {
          // Upsert returned an error (e.g. conflict wasn't resolved) — fall back to a lookup
          const { data: fallback } = await supabase
            .from('ingredients_catalog')
            .select('id, image_url')
            .eq('family_id', familyId)
            .ilike('name', ing.name)
            .limit(1)
            .maybeSingle()
          if (fallback?.id) {
            ingredientIds.push(fallback.id as string)
            if (!fallback.image_url) needsImageGen.push({ id: fallback.id as string, name: ing.name })
          }
          continue
        }

        ingredientIds.push(upserted.id as string)
        if (!upserted.image_url) needsImageGen.push({ id: upserted.id as string, name: ing.name })
      }

      // 2. Pick recipe emoji + build image prompt parts
      const emoji    = pickRecipeEmoji(payload.ingredients)
      const keySides = buildKeySides(payload.ingredients)
      const nb2Prompt = buildImagePrompt(payload.name, keySides)

      // 3. Insert recipe
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
          emoji,
          image_status: 'pending',
          nb2_prompt: nb2Prompt,
        })
        .select('id')
        .single()
      if (rErr) throw rErr
      const recipeId = recipe.id as string

      // 4. Insert recipe_ingredients
      if (payload.ingredients.length > 0) {
        const { error: riErr } = await supabase.from('recipe_ingredients').insert(
          payload.ingredients.map((ing, i) => ({
            recipe_id: recipeId,
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

      // 5. Insert recipe_steps with ingredient_ids[] populated via name-matching
      if (payload.steps.length > 0) {
        const { error: sErr } = await supabase.from('recipe_steps').insert(
          payload.steps.map((s, i) => ({
            recipe_id: recipeId,
            step_number: s.step_number,
            instruction: s.instruction,
            ingredient_ids: matchIngredientIds(s.instruction, payload.ingredients, ingredientIds),
            sort_order: i,
          }))
        )
        if (sErr) throw sErr
      }

      // 6. Fire image generation non-blocking (don't await — Realtime pushes the update)
      generateDishImage(payload.name, keySides, recipeId).catch(err =>
        console.warn('Image generation error (non-fatal):', err)
      )

      // 7. Fire ingredient image generation for any ingredient without an image
      for (const { id: ingId, name: ingName } of needsImageGen) {
        generateIngredientImage(ingId, ingName).catch(err =>
          console.warn(`Ingredient image gen error (non-fatal) [${ingName}]:`, err)
        )
      }

      return recipeId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes'] })
    },
  })
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient()
  const familyId = useAppStore(s => s.familyId)

  return useMutation({
    mutationFn: async (payload: SaveRecipePayload & { id: string }): Promise<string> => {
      if (!familyId) throw new Error('No family ID — cannot update recipe')

      // 1. Upsert ingredients_catalog — same dedup logic as useSaveRecipe
      const ingredientIds: string[] = []
      for (const ing of payload.ingredients) {
        if (ing.catalogId) { ingredientIds.push(ing.catalogId); continue }

        const { data: upserted, error: upsertErr } = await supabase
          .from('ingredients_catalog')
          .upsert(
            { family_id: familyId, name: ing.name, emoji: ing.emoji },
            { onConflict: 'family_id,lower(trim(name))', ignoreDuplicates: false }
          )
          .select('id')
          .single()

        if (upsertErr) {
          const { data: fallback } = await supabase
            .from('ingredients_catalog')
            .select('id')
            .eq('family_id', familyId)
            .ilike('name', ing.name)
            .limit(1)
            .maybeSingle()
          if (fallback?.id) ingredientIds.push(fallback.id as string)
          continue
        }
        ingredientIds.push(upserted.id as string)
      }

      // 2. Update recipe basics (preserve image_url / image_status / nb2_prompt)
      const emoji = pickRecipeEmoji(payload.ingredients)
      const { error: rErr } = await supabase
        .from('recipes')
        .update({
          name:              payload.name,
          servings:          payload.servings,
          cook_time_minutes: payload.cook_time_minutes,
          meal_type:         payload.meal_type,
          tags:              payload.tags,
          difficulty:        payload.difficulty,
          emoji,
        })
        .eq('id', payload.id)
      if (rErr) throw rErr

      // 3. Replace recipe_ingredients
      await supabase.from('recipe_ingredients').delete().eq('recipe_id', payload.id)
      if (payload.ingredients.length > 0) {
        const { error: riErr } = await supabase.from('recipe_ingredients').insert(
          payload.ingredients.map((ing, i) => ({
            recipe_id:    payload.id,
            ingredient_id: ingredientIds[i],
            quantity:      ing.quantity,
            unit:          ing.unit,
            prep_note:     ing.prep_note,
            serving_note:  ing.serving_note,
            sort_order:    i,
          }))
        )
        if (riErr) throw riErr
      }

      // 4. Replace recipe_steps
      await supabase.from('recipe_steps').delete().eq('recipe_id', payload.id)
      if (payload.steps.length > 0) {
        const { error: sErr } = await supabase.from('recipe_steps').insert(
          payload.steps.map((s, i) => ({
            recipe_id:      payload.id,
            step_number:    s.step_number,
            instruction:    s.instruction,
            ingredient_ids: matchIngredientIds(s.instruction, payload.ingredients, ingredientIds),
            sort_order:     i,
          }))
        )
        if (sErr) throw sErr
      }

      return payload.id
    },
    onSuccess: (_v, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['recipe',             id] })
      queryClient.invalidateQueries({ queryKey: ['recipe-ingredients', id] })
      queryClient.invalidateQueries({ queryKey: ['recipe-steps',       id] })
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
