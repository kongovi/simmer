export type UserRole = 'planner' | 'member'
export type MealType = 'breakfast' | 'lunch' | 'dinner'
export type GrocerySource = 'meal_plan' | 'staple' | 'manual'
export type PurchaseSource = 'grocery_list' | 'order_import' | 'manual'
export type ImageStatus = 'pending' | 'generating' | 'done' | 'failed'
export type AITask = 'recipe_structuring' | 'grocery_intelligence' | 'meal_plan_parsing' | 'staple_prediction'
export type AIModel = 'claude' | 'gpt4' | 'gemini' | 'local'
export type ImageModel = 'nano-banana-2' | 'nano-banana-pro' | 'nano-banana' | 'dalle' | 'flux'

export interface FamilyMember {
  id: string
  family_id: string
  user_id: string | null
  role: UserRole
  display_name: string | null
  created_at: string
}

export interface IngredientCatalog {
  id: string
  family_id: string
  name: string
  emoji: string | null
  default_store: string | null
  brand_note: string | null
  is_pantry_staple: boolean
  is_bulk_staple: boolean
  purchase_frequency_days: number | null
  default_aisle_order: number | null
  last_purchased_at: string | null
  image_url: string | null
  image_status: string
  created_at: string
}

export interface Recipe {
  id: string
  family_id: string
  name: string
  source_url: string | null
  cook_time_minutes: number | null
  servings: number
  meal_type: MealType | null
  emoji: string | null
  image_url: string | null
  image_status: ImageStatus
  nb2_prompt: string | null
  created_at: string
  updated_at: string
}

export interface RecipeIngredient {
  id: string
  recipe_id: string
  ingredient_id: string
  quantity: number | null
  unit: string | null
  prep_note: string | null
  serving_note: string | null
  sort_order: number
}

export interface RecipeStep {
  id: string
  recipe_id: string
  step_number: number
  instruction: string
  ingredient_ids: string[]
  sort_order: number
}

export interface MealPlanSlot {
  id: string
  family_id: string
  week_start: string
  slot_date: string
  meal_type: MealType | null
  sort_order: number
  recipe_id: string | null
  freeform_name: string | null
  servings_override: number | null
}

export interface GroceryList {
  id: string
  family_id: string
  week_start: string
  generated_at: string
  is_active: boolean
}

export interface GroceryListItem {
  id: string
  grocery_list_id: string
  ingredient_id: string | null
  custom_name: string | null
  quantity: number | null
  unit: string | null
  source: GrocerySource
  recipe_ids: string[]
  assigned_store: string | null
  aisle_order: number | null
  is_checked: boolean
  checked_at: string | null
  checked_by: string | null
}

export interface Staple {
  id: string
  family_id: string
  ingredient_id: string | null
  is_active: boolean
  created_at: string
}

export interface PurchaseHistory {
  id: string
  family_id: string
  ingredient_id: string | null
  purchased_at: string
  source: PurchaseSource
}

export interface FamilyStore {
  id: string
  family_id: string
  name: string
  emoji: string | null
  is_default: boolean
  sort_order: number
  created_at: string
}

export interface FamilyInvite {
  id: string
  family_id: string
  invited_by: string | null
  token: string
  email: string | null
  role: UserRole
  accepted_by: string | null
  accepted_at: string | null
  expires_at: string
  created_at: string
}

export interface UserSettings {
  id: string
  user_id: string
  family_id: string | null
  plan_start_dow: number
  ai_structuring_model: AIModel
  ai_image_model: ImageModel
  anthropic_api_key_enc: string | null
  openai_api_key_enc: string | null
  google_api_key_enc: string | null
  replicate_api_key_enc: string | null
  ollama_host: string | null
  task_model_overrides: Record<string, string>
  onboarding_complete: boolean
  created_at: string
  updated_at: string
}
