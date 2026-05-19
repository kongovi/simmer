import { useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
import { generateDishImage, generateIngredientImage, buildImagePrompt } from '../lib/images'
import { callNanoBanana2 } from '../lib/images/nanoBanana'
import { normalizeIngredientName } from '../lib/ingredientNormalize'
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
        .order('name', { ascending: true })

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
    section?: string | null
  }[]
  steps: { step_number: number; instruction: string; section?: string | null }[]
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
        // Normalize name: "ground cumin" → "Cumin powder" (spices only, not meats)
        const ingName = normalizeIngredientName(ing.name)

        if (ing.catalogId) {
          // Already resolved — just check whether image gen is needed
          ingredientIds.push(ing.catalogId)
          const { data: cat } = await supabase
            .from('ingredients_catalog')
            .select('id, image_url')
            .eq('id', ing.catalogId)
            .maybeSingle()
          if (cat && !cat.image_url) needsImageGen.push({ id: ing.catalogId, name: ingName })
          continue
        }

        // Optimistic insert: try INSERT first; on unique violation look up existing
        const { data: inserted, error: insertErr } = await supabase
          .from('ingredients_catalog')
          .insert({ family_id: familyId, name: ingName, emoji: ing.emoji })
          .select('id, image_url')
          .single()

        if (insertErr) {
          // Unique violation — look up the existing row by normalized name
          const { data: existing } = await supabase
            .from('ingredients_catalog')
            .select('id, image_url')
            .eq('family_id', familyId)
            .ilike('name', ingName)
            .limit(1)
            .maybeSingle()
          if (existing?.id) {
            ingredientIds.push(existing.id as string)
            if (!existing.image_url) needsImageGen.push({ id: existing.id as string, name: ingName })
          }
          continue
        }

        ingredientIds.push(inserted.id as string)
        needsImageGen.push({ id: inserted.id as string, name: ingName }) // new entry always needs image
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
          image_status: 'generating',
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
            section: ing.section ?? null,
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
            section: s.section ?? null,
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

      // 1. Resolve ingredients_catalog — optimistic insert with fallback lookup
      const ingredientIds: string[] = []
      for (const ing of payload.ingredients) {
        if (ing.catalogId) { ingredientIds.push(ing.catalogId); continue }

        const ingName = normalizeIngredientName(ing.name)

        const { data: inserted, error: insertErr } = await supabase
          .from('ingredients_catalog')
          .insert({ family_id: familyId, name: ingName, emoji: ing.emoji })
          .select('id')
          .single()

        if (insertErr) {
          const { data: existing } = await supabase
            .from('ingredients_catalog')
            .select('id')
            .eq('family_id', familyId)
            .ilike('name', ingName)
            .limit(1)
            .maybeSingle()
          if (existing?.id) ingredientIds.push(existing.id as string)
          continue
        }
        if (inserted?.id) ingredientIds.push(inserted.id as string)
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

/**
 * On mount, finds all recipes with image_status 'pending' or 'failed' that have
 * a stored nb2_prompt and fires image generation for each one. Uses a ref so it
 * only runs once per session even if the component re-renders.
 */
/**
 * Mark a recipe as actively generating in the DB so the pulsing dot shows
 * immediately on both the recipe tile and hero image (before the edge function
 * finishes and Realtime delivers the 'done' update).
 */
export async function markRecipeGenerating(recipeId: string) {
  await supabase
    .from('recipes')
    .update({ image_status: 'generating' })
    .eq('id', recipeId)
}

export function useBackfillRecipeImages() {
  const familyId = useAppStore(s => s.familyId)
  const didRun   = useRef(false)

  useEffect(() => {
    if (!familyId || didRun.current) return
    didRun.current = true

    async function backfill() {
      const { data, error } = await supabase
        .from('recipes')
        .select('id, nb2_prompt')
        .eq('family_id', familyId)
        .in('image_status', ['pending', 'failed'])
        .not('nb2_prompt', 'is', null)

      if (error || !data?.length) return

      console.log(`[backfill] Generating images for ${data.length} recipe(s)…`)

      // Mark as 'generating' in the DB first so the pulsing dot shows immediately
      const ids = data.map(r => r.id)
      await supabase.from('recipes').update({ image_status: 'generating' }).in('id', ids)

      // Fire all in parallel — each call is non-blocking and updates the DB itself
      for (const recipe of data) {
        callNanoBanana2(recipe.nb2_prompt as string, recipe.id).catch(() => {})
      }
    }

    backfill()
  }, [familyId])
}
