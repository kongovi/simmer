import { aiCall } from './ai'
import type { Recipe } from '../types'

// Implemented in Session 2
export async function parseRecipeFromText(_rawText: string): Promise<Partial<Recipe>> {
  await aiCall('recipe_structuring', _rawText)
  throw new Error('Recipe parser not yet implemented (Session 2)')
}
