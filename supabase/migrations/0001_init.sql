-- =============================================================
-- Simmer — Initial schema
-- Session 1: all core tables
-- =============================================================

-- ── 1. Family members ────────────────────────────────────────
create table if not exists family_members (
  id          uuid primary key default gen_random_uuid(),
  family_id   uuid not null,
  user_id     uuid references auth.users on delete set null,
  role        text check (role in ('planner', 'member')) default 'member',
  display_name text,
  created_at  timestamptz default now()
);

alter table family_members enable row level security;

create policy "family_members: members can read own family"
  on family_members for select
  using (
    family_id in (
      select family_id from family_members fm2
      where fm2.user_id = auth.uid()
    )
  );

create policy "family_members: planner can insert"
  on family_members for insert
  with check (
    family_id in (
      select family_id from family_members fm2
      where fm2.user_id = auth.uid() and fm2.role = 'planner'
    )
  );

-- ── 2. Ingredients catalog ────────────────────────────────────
create table if not exists ingredients_catalog (
  id                      uuid primary key default gen_random_uuid(),
  family_id               uuid not null,
  name                    text not null,
  emoji                   text,
  default_store           text,
  brand_note              text,
  is_pantry_staple        boolean default false,
  is_bulk_staple          boolean default false,
  purchase_frequency_days integer,
  last_purchased_at       timestamptz,
  created_at              timestamptz default now()
);

alter table ingredients_catalog enable row level security;

create policy "ingredients_catalog: family access"
  on ingredients_catalog for all
  using (
    family_id in (
      select family_id from family_members
      where user_id = auth.uid()
    )
  )
  with check (
    family_id in (
      select family_id from family_members
      where user_id = auth.uid()
    )
  );

-- ── 3. Recipes ────────────────────────────────────────────────
create table if not exists recipes (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid not null,
  name              text not null,
  source_url        text,
  cook_time_minutes integer,
  servings          integer default 4,
  meal_type         text,
  image_url         text,
  image_status      text default 'pending' check (image_status in ('pending','generating','done','failed')),
  nb2_prompt        text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

alter table recipes enable row level security;

create policy "recipes: family access"
  on recipes for all
  using (
    family_id in (
      select family_id from family_members
      where user_id = auth.uid()
    )
  )
  with check (
    family_id in (
      select family_id from family_members
      where user_id = auth.uid()
    )
  );

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger recipes_updated_at
  before update on recipes
  for each row execute function update_updated_at();

-- ── 4. Recipe ingredients ─────────────────────────────────────
create table if not exists recipe_ingredients (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid references recipes on delete cascade,
  ingredient_id uuid references ingredients_catalog on delete set null,
  quantity      numeric,
  unit          text,
  prep_note     text,
  serving_note  text,
  sort_order    integer default 0
);

alter table recipe_ingredients enable row level security;

create policy "recipe_ingredients: family access via recipe"
  on recipe_ingredients for all
  using (
    recipe_id in (
      select id from recipes r
      where r.family_id in (
        select family_id from family_members where user_id = auth.uid()
      )
    )
  )
  with check (
    recipe_id in (
      select id from recipes r
      where r.family_id in (
        select family_id from family_members where user_id = auth.uid()
      )
    )
  );

-- ── 5. Recipe steps ───────────────────────────────────────────
create table if not exists recipe_steps (
  id             uuid primary key default gen_random_uuid(),
  recipe_id      uuid references recipes on delete cascade,
  step_number    integer not null,
  instruction    text not null,
  ingredient_ids uuid[] default '{}',
  sort_order     integer default 0
);

alter table recipe_steps enable row level security;

create policy "recipe_steps: family access via recipe"
  on recipe_steps for all
  using (
    recipe_id in (
      select id from recipes r
      where r.family_id in (
        select family_id from family_members where user_id = auth.uid()
      )
    )
  )
  with check (
    recipe_id in (
      select id from recipes r
      where r.family_id in (
        select family_id from family_members where user_id = auth.uid()
      )
    )
  );

-- ── 6. Meal plan slots ────────────────────────────────────────
create table if not exists meal_plan_slots (
  id                uuid primary key default gen_random_uuid(),
  family_id         uuid not null,
  week_start        date not null,
  slot_date         date not null,
  meal_type         text check (meal_type in ('breakfast','lunch','dinner')),
  sort_order        integer default 0,
  recipe_id         uuid references recipes on delete set null,
  freeform_name     text,
  servings_override integer
);

alter table meal_plan_slots enable row level security;

create policy "meal_plan_slots: family access"
  on meal_plan_slots for all
  using (
    family_id in (
      select family_id from family_members where user_id = auth.uid()
    )
  )
  with check (
    family_id in (
      select family_id from family_members where user_id = auth.uid()
    )
  );

-- ── 7. Grocery lists ─────────────────────────────────────────
create table if not exists grocery_lists (
  id           uuid primary key default gen_random_uuid(),
  family_id    uuid not null,
  week_start   date not null,
  generated_at timestamptz default now(),
  is_active    boolean default true
);

alter table grocery_lists enable row level security;

create policy "grocery_lists: family access"
  on grocery_lists for all
  using (
    family_id in (
      select family_id from family_members where user_id = auth.uid()
    )
  )
  with check (
    family_id in (
      select family_id from family_members where user_id = auth.uid()
    )
  );

-- ── 8. Grocery list items ────────────────────────────────────
create table if not exists grocery_list_items (
  id               uuid primary key default gen_random_uuid(),
  grocery_list_id  uuid references grocery_lists on delete cascade,
  ingredient_id    uuid references ingredients_catalog on delete set null,
  custom_name      text,
  quantity         numeric,
  unit             text,
  source           text check (source in ('meal_plan','staple','manual')),
  recipe_ids       uuid[] default '{}',
  assigned_store   text,
  aisle_order      integer,
  is_checked       boolean default false,
  checked_at       timestamptz,
  checked_by       uuid references auth.users on delete set null
);

alter table grocery_list_items enable row level security;

create policy "grocery_list_items: family access via list"
  on grocery_list_items for all
  using (
    grocery_list_id in (
      select id from grocery_lists gl
      where gl.family_id in (
        select family_id from family_members where user_id = auth.uid()
      )
    )
  )
  with check (
    grocery_list_id in (
      select id from grocery_lists gl
      where gl.family_id in (
        select family_id from family_members where user_id = auth.uid()
      )
    )
  );

-- ── 9. Staples ───────────────────────────────────────────────
create table if not exists staples (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null,
  ingredient_id uuid references ingredients_catalog on delete set null,
  is_active     boolean default true,
  created_at    timestamptz default now()
);

alter table staples enable row level security;

create policy "staples: family access"
  on staples for all
  using (
    family_id in (
      select family_id from family_members where user_id = auth.uid()
    )
  )
  with check (
    family_id in (
      select family_id from family_members where user_id = auth.uid()
    )
  );

-- ── 10. Purchase history ─────────────────────────────────────
create table if not exists purchase_history (
  id            uuid primary key default gen_random_uuid(),
  family_id     uuid not null,
  ingredient_id uuid references ingredients_catalog on delete set null,
  purchased_at  timestamptz default now(),
  source        text check (source in ('grocery_list','order_import','manual'))
);

alter table purchase_history enable row level security;

create policy "purchase_history: family access"
  on purchase_history for all
  using (
    family_id in (
      select family_id from family_members where user_id = auth.uid()
    )
  )
  with check (
    family_id in (
      select family_id from family_members where user_id = auth.uid()
    )
  );

-- ── 11. User settings ────────────────────────────────────────
create table if not exists user_settings (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users on delete cascade unique,
  family_id             uuid,
  plan_start_dow        integer default 5,
  ai_structuring_model  text default 'claude',
  ai_image_model        text default 'nano-banana-2',
  anthropic_api_key_enc text,
  openai_api_key_enc    text,
  google_api_key_enc    text,
  replicate_api_key_enc text,
  ollama_host           text,
  task_model_overrides  jsonb default '{}',
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

alter table user_settings enable row level security;

create policy "user_settings: own row only"
  on user_settings for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger user_settings_updated_at
  before update on user_settings
  for each row execute function update_updated_at();

-- ── Auto-create user_settings on first sign-in ───────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
