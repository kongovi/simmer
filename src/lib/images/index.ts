import type { ImageModel } from '../../types'
import { getAISettingsCache } from '../ai/settingsCache'
import { callNanoBanana2, callNanoBanana2Ingredient } from './nanoBanana'
import { callDallE3 } from './dalle'
import { callFlux } from './flux'

const IMAGE_PROMPT_TEMPLATE = `
A professional, isometric 3/4 view food illustration for a mobile recipe app,
rendered in a Retro-Pop art style. The central focus is a beautifully plated
{DISH_NAME}, fully composed and ready to serve, displayed on a simplified
circular plate. Show the complete dish as it appears when brought to the table —
all components integrated on the plate, not as separate raw ingredients.

Artistic Style Guidelines: Use thick, clean black outlines for all objects.
Apply a vintage, muted color palette consisting of cream, teal, burnt orange,
and mustard yellow. All shadows must be rendered using a distinct halftone (dot)
texture for a classic printed feel. The background is a solid, warm off-white,
ensuring the plated dish remains the hero of the composition. No text or labels.
No raw or loose ingredients outside the plate.
`

export function buildImagePrompt(dishName: string, _keySides: string): string {
  return IMAGE_PROMPT_TEMPLATE.replace('{DISH_NAME}', dishName)
}

/** Reads the image model from the settings cache, defaulting to nano-banana-2. */
function getImageModel(): ImageModel {
  return getAISettingsCache()?.ai_image_model ?? 'nano-banana-2'
}

/**
 * Fire-and-forget ingredient image generation.
 * Always uses NB2 (ingredient mode hits the same Edge Function).
 * @param customPromptAddition  Optional free-text appended after the base style prompt.
 */
export async function generateIngredientImage(
  ingredientId: string,
  ingredientName: string,
  customPromptAddition?: string,
): Promise<string> {
  return callNanoBanana2Ingredient(ingredientId, ingredientName, customPromptAddition)
}

export async function generateDishImage(
  dishName: string,
  keySides: string,
  recipeId: string
): Promise<string> {
  const model = getImageModel()
  const prompt = buildImagePrompt(dishName, keySides)
  switch (model) {
    case 'nano-banana-2':
    case 'nano-banana-pro':
    case 'nano-banana':   return callNanoBanana2(prompt, recipeId)
    case 'dalle':         return callDallE3(prompt, recipeId)
    case 'flux':          return callFlux(prompt, recipeId)
    default:              return ''
  }
}
