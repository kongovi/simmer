-- Session 9: onboarding_complete flag + performance indexes

-- ── 1. onboarding_complete on user_settings ───────────────────────────────────

alter table user_settings
  add column if not exists onboarding_complete boolean not null default false;

-- Existing accounts have already been through setup — mark them done
update user_settings set onboarding_complete = true;

-- ── 2. Performance indexes ────────────────────────────────────────────────────

-- Planner: fetch current week's slots by family + week
create index if not exists idx_meal_plan_slots_family_week
  on meal_plan_slots (family_id, week_start);

-- Purchase history: staple prediction lookups by family + ingredient
create index if not exists idx_purchase_history_family_ingredient
  on purchase_history (family_id, ingredient_id, purchased_at desc);

-- Ingredients catalog: name search within a family
create index if not exists idx_ingredients_catalog_family_name
  on ingredients_catalog (family_id, name);
