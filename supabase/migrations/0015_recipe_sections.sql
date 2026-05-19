-- Add optional section label to recipe_ingredients and recipe_steps
-- so that multi-component recipes (e.g. Pizza → Dough / Sauce / Pizza)
-- can store which component each ingredient / step belongs to.

ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS section text;
ALTER TABLE recipe_steps       ADD COLUMN IF NOT EXISTS section text;
