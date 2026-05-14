-- Fix infinite recursion in RLS policies.
-- Root cause: all table policies referenced family_members via a subquery,
-- which triggered family_members' own SELECT policy → self-referential infinite recursion.
-- Fix: SECURITY DEFINER helper function to look up family_id without triggering RLS.

-- 1. Helper: bypass RLS to get the current user's family_id
create or replace function get_my_family_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select family_id from family_members where user_id = auth.uid() limit 1;
$$;

-- 2. family_members: replace self-referencing policies with simple user_id checks
drop policy if exists "family_members: members can read own family" on family_members;
drop policy if exists "family_members: planner can insert" on family_members;

create policy "family_members: read own row"
  on family_members for select
  using (user_id = auth.uid());

create policy "family_members: insert own row"
  on family_members for insert
  with check (user_id = auth.uid());

-- 3. ingredients_catalog
drop policy if exists "ingredients_catalog: family access" on ingredients_catalog;
create policy "ingredients_catalog: family access"
  on ingredients_catalog for all
  using  (family_id = get_my_family_id())
  with check (family_id = get_my_family_id());

-- 4. recipes
drop policy if exists "recipes: family access" on recipes;
create policy "recipes: family access"
  on recipes for all
  using  (family_id = get_my_family_id())
  with check (family_id = get_my_family_id());

-- 5. recipe_ingredients (access via recipe's family_id)
drop policy if exists "recipe_ingredients: family access via recipe" on recipe_ingredients;
create policy "recipe_ingredients: family access via recipe"
  on recipe_ingredients for all
  using  (recipe_id in (select id from recipes where family_id = get_my_family_id()))
  with check (recipe_id in (select id from recipes where family_id = get_my_family_id()));

-- 6. recipe_steps
drop policy if exists "recipe_steps: family access via recipe" on recipe_steps;
create policy "recipe_steps: family access via recipe"
  on recipe_steps for all
  using  (recipe_id in (select id from recipes where family_id = get_my_family_id()))
  with check (recipe_id in (select id from recipes where family_id = get_my_family_id()));

-- 7. meal_plan_slots
drop policy if exists "meal_plan_slots: family access" on meal_plan_slots;
create policy "meal_plan_slots: family access"
  on meal_plan_slots for all
  using  (family_id = get_my_family_id())
  with check (family_id = get_my_family_id());

-- 8. grocery_lists
drop policy if exists "grocery_lists: family access" on grocery_lists;
create policy "grocery_lists: family access"
  on grocery_lists for all
  using  (family_id = get_my_family_id())
  with check (family_id = get_my_family_id());

-- 9. grocery_list_items (access via grocery_list's family_id)
drop policy if exists "grocery_list_items: family access via list" on grocery_list_items;
create policy "grocery_list_items: family access via list"
  on grocery_list_items for all
  using  (grocery_list_id in (select id from grocery_lists where family_id = get_my_family_id()))
  with check (grocery_list_id in (select id from grocery_lists where family_id = get_my_family_id()));

-- 10. staples
drop policy if exists "staples: family access" on staples;
create policy "staples: family access"
  on staples for all
  using  (family_id = get_my_family_id())
  with check (family_id = get_my_family_id());

-- 11. purchase_history
drop policy if exists "purchase_history: family access" on purchase_history;
create policy "purchase_history: family access"
  on purchase_history for all
  using  (family_id = get_my_family_id())
  with check (family_id = get_my_family_id());
