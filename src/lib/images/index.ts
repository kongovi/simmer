import type { ImageModel } from '../../types'
import { getAISettingsCache } from '../ai/settingsCache'
import { callNanoBanana2 } from './nanoBanana'
import { callDallE3 } from './dalle'
import { callFlux } from './flux'

const IMAGE_PROMPT_TEMPLATE = `
A professional, isometric 3/4 view food illustration for a mobile recipe app,
rendered in a Retro-Pop art style. The central focus is a large, geometrically
formed {DISH_NAME} resting on a simplified circular plate. The dish is accompanied
by {KEY_SIDES}.

Artistic Style Guidelines: Use thick, clean black outlines for all objects.
Apply a vintage, muted color palette consisting of cream, teal, burnt orange,
and mustard yellow. All shadows must be rendered using a distinct halftone (dot)
texture for a classic printed feel. The background is a solid, warm off-white,
ensuring the food remains the hero of the composition. No text or labels.
`

export function buildImagePrompt(dishName: string, keySides: string): string {
  return IMAGE_PROMPT_TEMPLATE
    .replace('{DISH_NAME}', dishName)
    .replace('{KEY_SIDES}', keySides)
}

/** Reads the image model from the settings cache, defaulting to nano-banana-2. */
function getImageModel(): ImageModel {
  return getAISettingsCache()?.ai_image_model ?? 'nano-banana-2'
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
