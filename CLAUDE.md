# Simmer — Project Brief for Claude Code

## What this file is

This is the single source of truth for the Simmer project. Read it at the start of every session. Update it at the end of every session with what was built, decisions made, and anything the next session needs to know.

---

## What we're building

**Simmer** is a family meal planning PWA with three core sections:

- **Recipe Book** — store, import, and cook from recipes
- **Meal Planner** — plan the week's meals on a grid
- **Grocery List** — auto-generated from the meal plan, organized by aisle, managed as a family

Supporting screens: Meal Prep, Staples Staging, Settings, Onboarding.

Primary user: one "Planner" who manages meals. Family members can view and edit the grocery list only.

The app is used mostly on mobile (iOS + Android). It must work as an installable PWA.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + Vite, TypeScript |
| Styling | Tailwind CSS |
| Backend / DB | Supabase (Postgres + Auth + Storage + Realtime) |
| Auth | Google OAuth via Supabase |
| AI text | Anthropic Claude API (default) — model-agnostic via adapter |
| AI images | Google Gemini API — Nano Banana 2 (default) |
| Hosting | Vercel (frontend) + Supabase (backend) |
| PWA | vite-plugin-pwa |

---

## Repository structure

```
simmer/
├── CLAUDE.md                   ← this file — update after every session
├── docs/
│   └── prototype.html          ← interactive HTML prototype — reference for UX/layout
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── BottomNav.tsx
│   │   │   └── Screen.tsx
│   │   ├── grocery/
│   │   ├── recipes/
│   │   ├── planner/
│   │   ├── prep/
│   │   ├── staging/
│   │   ├── settings/
│   │   └── onboarding/
│   ├── screens/
│   │   ├── GroceryScreen.tsx
│   │   ├── RecipesScreen.tsx
│   │   ├── RecipeDetailScreen.tsx
│   │   ├── PlannerScreen.tsx
│   │   ├── MealPrepScreen.tsx
│   │   ├── StagingScreen.tsx
│   │   ├── SettingsScreen.tsx
│   │   └── OnboardingScreen.tsx
│   ├── lib/
│   │   ├── supabase.ts         ← supabase client
│   │   ├── ai/
│   │   │   ├── index.ts        ← aiClient.call(task, prompt) — routes to correct provider
│   │   │   ├── anthropic.ts
│   │   │   ├── openai.ts
│   │   │   ├── gemini.ts
│   │   │   └── ollama.ts
│   │   ├── images/
│   │   │   ├── index.ts        ← generateDishImage(dishName, sides) — routes to correct provider
│   │   │   ├── nanoBanana.ts   ← Nano Banana 2 (default)
│   │   │   ├── dalle.ts
│   │   │   └── flux.ts
│   │   └── recipeParser.ts     ← calls aiClient to structure raw text
│   ├── hooks/
│   │   ├── useRecipes.ts
│   │   ├── useMealPlan.ts
│   │   ├── useGroceryList.ts
│   │   ├── useStaples.ts
│   │   └── useSettings.ts
│   ├── stores/
│   │   └── appStore.ts         ← Zustand global state
│   └── types/
│       └── index.ts            ← all shared TypeScript types
├── supabase/
│   ├── migrations/             ← all DB migrations
│   └── seed.sql                ← sample data for dev
├── public/
│   ├── manifest.json
│   └── icons/
└── .env.example
```

---

## Design system

### Theme

Dark warm tone throughout. CSS variables defined in `src/index.css`:

```css
:root {
  --dk:   #1a1612;   /* page background */
  --dk2:  #241f1a;   /* nav, bottom bars */
  --dk3:  #2e2720;   /* input backgrounds, empty slots */
  --dkc:  #2a2318;   /* cards */
  --am:   #EF9F27;   /* amber — primary accent */
  --aml:  #FAC775;   /* amber light */
  --tp:   #f5efe8;   /* text primary */
  --ts:   #a89880;   /* text secondary */
  --tm:   #6b5c4e;   /* text muted */
  --br:   rgba(255,255,255,0.08);   /* border */
  --brh:  rgba(255,255,255,0.15);   /* border hover */
  --gn:   #639922;   /* green (checked off) */
  --gl:   #5DCAA5;   /* green light (success badges) */
  --tl:   #1D9E75;   /* teal (family avatars) */
  --rd:   #D85A30;   /* red (destructive) */
}
```

### Typography
- Use `font-family: var(--font-sans)` everywhere (system font stack via Tailwind)
- Recipe card titles: 11–12px, weight 500
- Body / list items: 12–13px
- Small labels / badges: 9–10px

### Component patterns (reference prototype.html for exact visual)

**Bottom nav:** 4 tabs — Grocery (cart icon), Recipes (book icon), Planner (calendar icon), Prep (knife icon). Active tab in amber. Absolute positioned, z-10.

**Cards:** `background: var(--dkc)`, `border: 0.5px solid var(--br)`, `border-radius: 12–14px`

**Buttons (primary):** Full amber background, dark text, 11–14px radius, `padding: 11–14px`

**Input fields:** `background: var(--dk3)`, `border: 0.5px solid var(--brh)`, no box shadow

**Badges:** Small pill, 9–10px text, colored background at 10–15% opacity

---

## Visual prototype

`/Users/rajat/Claude/prototype.html` is an interactive HTML prototype showing all screens and interactions. Open it in a browser to see the intended UI. Use it as the reference for:

- Layout and spacing of every screen
- Component visual design (cards, slots, grids, bottom sheets)
- Interaction patterns (how slot popover works, how crossing off items works, etc.)
- Naming conventions (what things are called in the UI)

**Do not port the prototype HTML directly.** Build clean React components that match its visual design. The prototype is a reference, not source code.

---

## Database schema

```sql
-- Users (managed by Supabase Auth)
-- supabase auth.users is used directly

-- Family relationships
create table family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,          -- shared across a family group
  user_id uuid references auth.users,
  role text check (role in ('planner','member')) default 'member',
  display_name text,
  created_at timestamptz default now()
);

-- Ingredients master catalog
create table ingredients_catalog (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  name text not null,               -- standardized: "Ground lamb"
  emoji text,                       -- 🥩
  default_store text,               -- "Trader Joe's"
  brand_note text,                  -- "TJ's mahi mahi"
  is_pantry_staple boolean default false,
  is_bulk_staple boolean default false,  -- salt, olive oil etc — Zone 2
  purchase_frequency_days integer,  -- average days between purchases
  last_purchased_at timestamptz,
  created_at timestamptz default now()
);

-- Recipes
create table recipes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  name text not null,
  source_url text,
  cook_time_minutes integer,
  servings integer default 4,
  meal_type text,                   -- breakfast/lunch/dinner
  image_url text,                   -- generated NB2 image in Supabase Storage
  image_status text default 'pending', -- pending/generating/done/failed
  nb2_prompt text,                  -- the prompt used to generate the image
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Recipe ingredients (join table)
create table recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid references recipes on delete cascade,
  ingredient_id uuid references ingredients_catalog,
  quantity numeric,
  unit text,                        -- tsp/tbsp/cup/oz/lbs/g/ml/whole
  prep_note text,                   -- "grated", "finely diced", "minced"
  serving_note text,                -- "for serving", "optional"
  sort_order integer default 0
);

-- Recipe steps
create table recipe_steps (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid references recipes on delete cascade,
  step_number integer not null,
  instruction text not null,
  ingredient_ids uuid[],            -- ingredients used in this step
  sort_order integer default 0
);

-- Meal plan slots
create table meal_plan_slots (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  week_start date not null,         -- always the plan start day (e.g. Friday)
  slot_date date not null,          -- actual date of this slot
  meal_type text check (meal_type in ('breakfast','lunch','dinner')),
  sort_order integer default 0,     -- for multiple dishes in one slot
  recipe_id uuid references recipes, -- null if freeform
  freeform_name text,               -- "Takeout", "Leftovers" etc
  servings_override integer         -- if different from recipe default
);

-- Grocery lists
create table grocery_lists (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  week_start date not null,
  generated_at timestamptz default now(),
  is_active boolean default true
);

-- Grocery list items
create table grocery_list_items (
  id uuid primary key default gen_random_uuid(),
  grocery_list_id uuid references grocery_lists on delete cascade,
  ingredient_id uuid references ingredients_catalog,
  custom_name text,                 -- for manually added items not in catalog
  quantity numeric,
  unit text,
  source text check (source in ('meal_plan','staple','manual')),
  recipe_ids uuid[],                -- which recipes need this item
  assigned_store text,
  aisle_order integer,              -- silent sort order
  is_checked boolean default false,
  checked_at timestamptz,
  checked_by uuid references auth.users
);

-- Staples (standing list)
create table staples (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  ingredient_id uuid references ingredients_catalog,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Purchase history (for staple intelligence)
create table purchase_history (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null,
  ingredient_id uuid references ingredients_catalog,
  purchased_at timestamptz default now(),
  source text check (source in ('grocery_list','order_import','manual'))
);

-- User settings
create table user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users unique,
  family_id uuid,
  plan_start_dow integer default 5,  -- 0=Sun, 1=Mon ... 5=Fri, 6=Sat
  ai_structuring_model text default 'claude',
  ai_image_model text default 'nano-banana-2',
  -- API keys stored encrypted
  anthropic_api_key_enc text,
  openai_api_key_enc text,
  google_api_key_enc text,
  replicate_api_key_enc text,
  ollama_host text,
  -- Per-task overrides (JSON)
  task_model_overrides jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

---

## AI abstraction layer

**IMPORTANT:** Never call AI provider APIs directly in components or hooks. Always go through the abstraction layer.

### Text AI — `src/lib/ai/index.ts`

```typescript
type AITask = 
  | 'recipe_structuring'
  | 'grocery_intelligence' 
  | 'meal_plan_parsing'
  | 'staple_prediction';

export async function aiCall(task: AITask, prompt: string): Promise<string> {
  const model = getModelForTask(task); // reads from user settings
  switch (model) {
    case 'claude':   return callAnthropic(prompt);
    case 'gpt4':     return callOpenAI(prompt);
    case 'gemini':   return callGemini(prompt);
    case 'local':    return callOllama(prompt);
    default:         return callAnthropic(prompt);
  }
}
```

### Image AI — `src/lib/images/index.ts`

```typescript
export async function generateDishImage(
  dishName: string,
  keySides: string,
  recipeId: string
): Promise<string> {
  const model = getImageModel(); // reads from user settings
  const prompt = buildImagePrompt(dishName, keySides); // uses the retro-pop template
  switch (model) {
    case 'nano-banana-2':   return callNanoBanana2(prompt, recipeId);
    case 'nano-banana-pro': return callNanaBananaPro(prompt, recipeId);
    case 'nano-banana':     return callNanaBanana(prompt, recipeId);
    case 'dalle':           return callDallE3(prompt, recipeId);
    case 'flux':            return callFlux(prompt, recipeId);
    default:                return ''; // no image
  }
}
```

### Image prompt template

```typescript
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
`;
```

---

## Key product decisions (DO NOT change without updating this file)

| Decision | Choice | Reason |
|---|---|---|
| Grocery list organization | Silently ordered by aisle, NO section headers | Feels like a natural store flow, not a database |
| Grocery list UI | 3-column icon grid, not a list | More compact, faster to scan while shopping |
| Crossed-off items | Stay visible at bottom grayed out, tap to restore | Accidental cross-off recovery without a hidden caret |
| Planner layout | Days as rows, B/L/D as columns, scrolls vertically | Maps to how you read a weekly schedule |
| Column visibility | B/L/D toggles always visible above grid (never inside table header) | If inside header, hidden columns have nothing to tap to restore |
| Multi-dish slots | Stacked emoji + name with divider line | More readable than count badge |
| Cooking mode | Full-screen overlay with progress bar, large text, big buttons | Hands-wet / eyes-on-food use case |
| Image generation | Non-blocking: placeholder shows immediately, image replaces when ready | Never block recipe save on image generation |
| Recipe structuring | Claude reviews all, flags uncertain quantities, user reviews before save | Always full manual review — never auto-save |
| Pantry staging | 3 zones (Buy / Check pantry / Staple prediction) + Zone 4 collapsed | Separates always-buy from check-first from staples |
| Week definition | Starts on user-selected day, any day of week | User shops Friday, wants Fri–Thu week |
| Family auth | Google OAuth only, invite by email link | Lowest friction for family sharing |
| Store assignment | Default store per ingredient, user can override, system learns most frequent | Avoids re-assigning every week |

---

## Session log

Update this section at the end of every Claude Code session.

### Session 1 — Scaffold + auth + data model
**Status:** ✅ Complete  
**Completed:** 2026-05-10

**What was built:**
- Vite 8 + React 18 + TypeScript scaffold with `vite-plugin-pwa` (PWA manifest, service worker, icons config)
- Tailwind CSS v4 (`@tailwindcss/vite`) with all Simmer design tokens in `src/index.css`
- Full `src/` folder structure per CLAUDE.md spec (screens, components/layout, lib/ai, lib/images, hooks, stores, types)
- `src/types/index.ts` — all shared TypeScript types matching DB schema
- `src/lib/supabase.ts` — Supabase client
- `src/lib/ai/index.ts` + stubs — AI abstraction layer skeleton
- `src/lib/images/index.ts` + stubs — Image generation abstraction skeleton
- `src/stores/appStore.ts` — Zustand store for session/user/familyId
- Google OAuth login screen (`LoginScreen.tsx`) via Supabase `signInWithOAuth`
- Auth listener in `App.tsx` — hydrates session on mount, listens for changes
- Protected route guard — unauthenticated users redirected to `/login`
- `BottomNav.tsx` — 4 tabs (Grocery, Recipes, Planner, Prep) with amber active state
- 5 screen shells: Grocery, Recipes, Planner, Prep (MealPrep), Settings
- `SettingsScreen.tsx` — shows logged-in user's avatar, name, email; sign-out button
- `supabase/migrations/0001_init.sql` — 11 tables (family_members, ingredients_catalog, recipes, recipe_ingredients, recipe_steps, meal_plan_slots, grocery_lists, grocery_list_items, staples, purchase_history, user_settings) all with RLS policies
- Auto-create `user_settings` row on first sign-in via `handle_new_user()` DB trigger
- `docs/prototype.html` — interactive prototype copied into repo

**Infrastructure:**
- Supabase project ID: `prxexzcyfcwvdhjrcwfw`
- Supabase URL: `https://prxexzcyfcwvdhjrcwfw.supabase.co`
- Vercel URL: `https://simmer-rho-eight.vercel.app`
- GitHub repo: `https://github.com/kongovi/simmer`

**Schema changes from spec:** None — implemented exactly as written in CLAUDE.md

**Action needed before Session 2:**
- In Supabase dashboard → Auth → URL Configuration → add `https://simmer-rho-eight.vercel.app` to Redirect URLs so Google OAuth works in production (localhost is already handled by Supabase defaults)

### Session 2 — Recipe book: data + import flows
**Status:** ✅ Complete  
**Completed:** 2026-05-10

**What was built:**

*Foundation*
- DB migration `0002`: added `tags text[]` + `difficulty text` to `recipes`; added `create_initial_family()` security-definer function for first-user family bootstrap
- 2 Supabase Edge Functions deployed: `fetch-url` (scrapes any URL → plain text, 12k char cap) and `ai-call` (proxies Anthropic API server-side, avoids CORS)
- `src/lib/ai/anthropic.ts` — real Anthropic adapter calling the `ai-call` Edge Function with `VITE_DEV_ANTHROPIC_KEY`
- `src/lib/recipeParser.ts` — full implementation: system prompt + JSON schema, parses Claude's response, sets `flag: "confirm_quantity"` on vague amounts
- `useEnsureFamilyId` hook — bootstraps `family_id` on first login via `create_initial_family()` RPC
- `useRecipes` hook — full React Query implementation: list with filters (mealType, tag, quickOnly, search), `useRecipe`, `useRecipeIngredients`, `useRecipeSteps`, `useSaveRecipe` (upserts ingredients_catalog + inserts recipe + recipe_ingredients + recipe_steps), `useDeleteRecipe`
- `useIngredientsCatalog` hook — catalog list + `matchIngredient()` fuzzy matcher

*Recipe grid (s-recipes)*
- `RecipeCard` — NB2 placeholder with deterministic retro-pop color from recipe ID, emoji, "NB2 · rendering" label, cook time, meal type badge
- `RecipesScreen` — 2-col grid, search bar, filter pills (All / Dinner / Lunch / Breakfast / Quick), link + plus header icons, empty state

*Add/import flow*
- `RecipeEntryScreen` — textarea, "Structure with Claude" → `/recipes/loading`
- `RecipeImportScreen` — URL input, "Import & review" → `/recipes/loading` with sourceUrl
- `RecipeLoadingScreen` — calls AI, animates 5-step progress, navigates to review on completion, "Skip to review →" + error handling
- `RecipeReviewScreen` — NB2 placeholder, editable basics, ingredient flags (✓ catalog match / ⚠ confirm quantity / + new), inline qty edit, editable steps, "Edit text" + "Save recipe" → Supabase

*Recipe detail + cooking mode*
- `RecipeDetailScreen` — hero image/placeholder, cook time + servings badges, servings scaler with live quantity math, Ingredients/Instructions tab switcher, ingredient rows with scaled quantities, step list, "Add to meal plan" stub sheet, "Start cooking" button
- `CookingMode` overlay — full-screen, progress bar, step counter, large text, ingredient chips, Prev/Next nav, "Done ✓" exits

**Schema changes:** Added `tags text[]` and `difficulty text` to `recipes` table (migration 0002)

**Notes for Session 3:**
- `VITE_DEV_ANTHROPIC_KEY` must be set in `.env.local` (already done) and in Vercel env vars for production (do this before Session 3)
- NB2 image generation is stubbed — `image_status: 'pending'` on all saved recipes; Session 3 implements actual generation
- Ingredient emoji on RecipeCard uses meal_type fallback — a recipe-level emoji field would be cleaner (consider adding in Session 3)
- Cooking mode ingredient chips show all ingredients on step 1 only; wire `ingredient_ids[]` per step in Session 4

### Session 3 — Recipe book: image generation + cooking mode
**Status:** ✅ Complete  
**Completed:** 2026-05-10

**What was built:**

*DB changes*
- Migration `0003_recipe_emoji_image_bucket`: added `emoji text` column to `recipes`; created `recipe-images` public Storage bucket (5MB limit, image MIME types) with RLS policies

*Supabase Edge Function: `generate-image`*
- Accepts `{ recipeId, prompt, apiKey }` with JWT verification
- Tries Gemini Flash models first: `gemini-2.0-flash-preview-image-generation` → `gemini-2.0-flash-exp-image-generation`
- Falls back to `imagen-3.0-generate-002` if both Flash models fail
- Uses service-role client to upload JPEG to `recipe-images/{recipeId}.jpg` in Storage
- Updates `recipes.image_url`, `image_status: 'done'`, `nb2_prompt` on success
- Sets `image_status: 'failed'` on error (best-effort)

*Image adapters (`src/lib/images/`)*
- `nanoBanana.ts` — calls `generate-image` Edge Function with `VITE_DEV_GOOGLE_AI_KEY`
- `dalle.ts`, `flux.ts` — stubs for Session 8
- `index.ts` — wired: `callNanoBanana2()` is live, `getImageModel()` defaults to `'nano-banana-2'`

*`useSaveRecipe` updates (`src/hooks/useRecipes.ts`)*
- `pickRecipeEmoji()` — picks first non-staple ingredient emoji; saved as `recipes.emoji`
- `buildKeySides()` — builds "key sides" string from top 3 non-staple ingredient names for image prompt
- `matchIngredientIds()` — name-matching pass to populate `ingredient_ids[]` per step
- Saves `nb2_prompt` alongside the recipe row
- Fires `generateDishImage(name, keySides, recipeId)` **without `await`** after save — non-blocking

*Realtime (`useRecipeImageRealtime`)*
- `useRecipeImageRealtime()` hook: Supabase Realtime channel on `recipes` table (UPDATE, filtered by `family_id`)
- On update: patches React Query caches (`['recipes', familyId]` list + `['recipe', id]` individual) in-place — no full refetch needed
- Mounted in both `RecipesScreen` and `RecipeDetailScreen`

*UI polish*
- `RecipeCard`: uses `recipe.emoji` field (falls back to meal_type emoji); `nb2-pulse` CSS animation while `image_status === 'generating'`; amber "NB2 · rendering…" label; "NB2 · failed" state
- `RecipeDetailScreen`: same emoji + pulse on hero placeholder; Realtime subscription
- `CookingMode`: `ingredientsForStep()` now filters by `step.ingredient_ids[]` set membership — shows exactly the ingredients used in each step

*`src/index.css`*
- Added `@keyframes spin` and `@keyframes nb2-pulse`

**Schema changes:** Added `emoji text` column to `recipes` (migration 0003)

**Environment variables added:**
- `VITE_DEV_GOOGLE_AI_KEY` added to Vercel production env

**Notes for Session 4:**
- Image generation is live end-to-end; test with a new recipe save
- Realtime channel name is `recipe-images-{familyId}` — only one channel needed per session
- `getImageModel()` in `images/index.ts` is hardcoded to `'nano-banana-2'`; full user-settings wiring in Session 8
- Ingredient chip matching is text-based (name substring); good enough for now, can be improved with `ingredient_ids[]` from the AI parser in a future session

### Session 4 — Meal planner
**Status:** ✅ Complete  
**Completed:** 2026-05-12

**What was built:**

*Global theme change: Slate & Sage*
- `index.css` updated: `--dk #141820`, `--dk2 #1a2028`, `--dk3/dkc #1e2330`, `--am #7BAF8A` (sage), `--aml #A8CDB5`, `--tp #EEF0F4`, `--ts #8A95A8`, `--tm #4A5568`, `--rd #C0625A`, `--tl #4A8A6A`

*Utilities*
- `src/lib/weekUtils.ts`: `getWeekStart(dow)`, `shiftWeek`, `getWeekDays`, `formatWeekRange`, `toISODate`, `isToday`, `dayNameToDate`
- `src/lib/mealPlanParser.ts`: `parseMealPlanText(text)` → calls `aiCall('meal_plan_parsing', text, { systemPrompt })` → returns `ParsedMealEntry[]`
  - **NOTE FOR FUTURE SESSION**: Currently stores all dishes as `freeform_name`. A future session should add catalog matching: after parsing, match dish names against the family's saved recipes and set `recipe_id` on slots when a match is found. This enables the grocery list generator to pull structured ingredient data for AI-planned meals.

*Hooks*
- `useUserSettings.ts`: `useUserSettings()` + `useUpdatePlanStartDow()` — reads/writes `user_settings.plan_start_dow`
- `useMealPlan.ts`: `useSlotsForWeek(weekStart)` (joins `recipes` for name+emoji), `useAddDish()`, `useRemoveDish()`, `groupBySlot()`, `dishDisplayName()`, `dishEmoji()`

*PlannerScreen (`/planner`)*
- 7-row × up to 3-col grid. Week nav (← date range →). Days as rows with date label.
- Plan start day `<select>` + B/L/D column toggles on same row, above the table. Breakfast hidden by default.
- Column toggles use on/off styling (filled dark chip vs. strikethrough text); toggling a column removes it from the grid but not from the DB.
- Today's day row label highlighted in sage `var(--am)`.
- SlotCell: empty = `+` centered; filled = stacked emoji+name dishes with hairline dividers and `· add` affordance.
- SlotPopover: centered fixed modal, dish list with ✕ delete. Clicking ✕ shows inline confirmation ("Remove '...'? [Cancel] [Remove]") before calling `useRemoveDish`. Input + Add button to insert freeform dishes. "Done" closes.
- "Plan my week with Claude →" dashed sage button above table.
- "Generate grocery list" sage button pinned above nav → runs pre-generation checks, then generates + navigates to `/grocery`.

*PlanWithClaudeScreen (`/planner/claude`)*
- Textarea + "Fill my planner" button. Passes `weekStart` + `weekDays` via location.state.
- Calls `parseMealPlanText()` → maps day names to the current week's dates → calls `useAddDish` for each dish.
- Loading state with spinner. Error display. `useRef(didRun)` guard.
- Footer note: "Dishes are added as freeform entries. Recipe linking coming in a future update."

*AddToPlanScreen (`/planner/add`)*
- Receives `{ recipeId, recipeName, recipeEmoji }` via location.state.
- Shows mini recipe card ("Tap any slot to place · tap filled to stack") + simplified full grid (all 3 cols always visible).
- Tap slot → `useAddDish()` → navigate back. Tap filled slot → stacks (adds another dish row).

*StagingScreen (`/staging`)*
- Placeholder for Session 6. "Three-zone smart list: Buy now · Check pantry · Staple predictions."

*App.tsx*
- New routes: `/planner/claude`, `/planner/add`, `/staging`
- Bottom nav logic changed to exact-match only: shows on `/grocery`, `/recipes`, `/planner`, `/prep`
- `RecipeDetailScreen` "Add to meal plan" button now navigates to `/planner/add` with recipe state

**Schema:** No new migrations — `meal_plan_slots` was already in `0001_init.sql`

**Notes for Session 5 (Grocery List):**
- `useSlotsForWeek` returns slots joined with recipe name+emoji; the grocery list generator can use `recipe_id` to pull structured ingredient data
- AI-planned meals have `recipe_id = null` and `freeform_name` only — the grocery list will need to handle these as manual line items until catalog matching is added
- `week_start` = the user's plan-start-day date for that week (not always Monday)

### Session 5 — Grocery list: generation + grid UI
**Status:** ✅ Complete  
**Completed:** 2026-05-12

**What was built:**

*DB*
- Migration `0004_grocery_list_index`: two perf indexes on `grocery_list_items(grocery_list_id)` and `grocery_lists(family_id, week_start, is_active)`

*`src/hooks/useGroceryList.ts`* (full implementation)
- `detectAisleOrder(name, emoji)` — keyword + emoji regex to assign silent aisle sort 1–7 (Produce→Meat→Dairy→Canned→Oils/Spices→Beverages→Other)
- `itemDisplayName()`, `itemEmoji()`, `itemQtyLabel()` — display helpers
- `useActiveGroceryList()` — fetches most recent active list for family (no week param — always shows latest)
- `useGroceryListItems(listId)` — items with `ingredient:ingredients_catalog` join, sorted by `is_checked ASC, aisle_order ASC`
- `useHasActiveList(weekStart)` — used by PlannerScreen to gate overwrite warning
- `useKnownStores()` — distinct `default_store` from `ingredients_catalog` for the family
- `useIngredientSuggestions(search)` — catalog items for KB pane, filtered by search text
- `useGenerateGroceryList()` — generates list: fetches recipe slots → batch-fetches `recipe_ingredients` → consolidates by (ingredient_id, unit) → deactivates old list → inserts `grocery_lists` + `grocery_list_items` rows
- `useToggleItem()` — sets `is_checked`, `checked_at`, `checked_by`
- `useAddManualItem()` — inserts `source: 'manual'` item with catalog ref or `custom_name`
- `useUpdateItemStore()` — updates `assigned_store` on item + persists to `ingredients_catalog.default_store`
- `useGroceryListRealtime(listId)` — Supabase Realtime channel on `grocery_list_items` invalidates React Query cache on any change

*`GroceryScreen`* (full rewrite)
- **Empty state**: friendly message + "Go to Planner →" button when no active list
- **Header**: "Grocery" + week range label + "X left" count
- **Store tabs**: horizontal scroll, "All" + distinct stores from `ingredients_catalog.default_store` + "+ Store" input (adds to local state for the session)
- **Action row**: "✦ Review staples" (sage → `/staging`) + "＋ Add item" (opens KB pane)
- **3-col grid**: `GroceryBox` components, filtered by active store tab. Items sorted by aisle silently.
- **`GroceryBox`**: 80px min-height card, 26px emoji, 10px name, 9px qty in sage, 8px brand italic. Long-press (500ms) opens store assignment sheet. Tap toggles checked.
- **"Got it" section**: sage "✓ Got it" label + same 3-col grid of checked items at 38% opacity with strikethrough name + sage ✓ badge top-right. Tap to restore.
- **Add bar** (pinned at `bottom: 58px`): "＋ Add an item…" tap target opens KB pane
- **KB pane** (slides up, z-index 20): search input, "Suggestions" label, 4-col catalog grid. Tapping suggestion adds catalog item. If search text doesn't match any suggestion exactly, shows "＋ Add '[name]'" free-text button.
- **Store assignment sheet** (long-press → bottom sheet, z-index 50): item header, store radio list, new store text input. Saves to `grocery_list_items.assigned_store` + `ingredients_catalog.default_store`.
- **Realtime**: `useGroceryListRealtime` mounted, all family devices see live updates

*`PlannerScreen`* (updated)
- Replaced simple `navigate('/staging')` with 3-step generate flow:
  1. **Freeform warning**: if any slots lack `recipe_id`, shows modal listing their names with [Go back &amp; link] / [Generate without them]
  2. **Overwrite warning**: if an active list already exists for the week, shows [Cancel] / [Replace]
  3. **Generating state**: spinner in button, calls `useGenerateGroceryList()`, navigates to `/grocery` on success
- Imports `useGenerateGroceryList`, `useHasActiveList` from `useGroceryList`

**Schema:** No new table columns — indexes only

**Notes for Session 6 (Staging Screen):**
- `GroceryScreen` "Review staples" button already navigates to `/staging`
- The active grocery list is the most recently generated one; no week picker on grocery screen
- Store tabs are ephemeral (from catalog `default_store`); `+ Store` adds to local state only until items are assigned to it
- Freeform slots that aren't linked to a recipe are skipped at generation time — their ingredients are never added. The warning modal lets the user go back and link them first.

### Session 6 — Staging screen (pantry intelligence)
**Status:** ✅ Complete  
**Completed:** 2026-05-12

**What was built:**

*New shared utility: `src/lib/aisleUtils.ts`*
- Extracted `detectAisleOrder(name, emoji)` from `useGroceryList.ts` into a standalone file so it can be used by both the grocery and staging hooks
- `useGroceryList.ts` now imports from `aisleUtils` and re-exports for backward compatibility

*New AI classifier: `src/lib/groceryIntelligence.ts`*
- `classifyIngredients(items)`: sends ingredient list to Claude via `aiCall('grocery_intelligence', ...)` with a system prompt that distinguishes perishables (Zone 1) from long-shelf-life pantry items (Zone 2)
- Falls back to heuristic (aisle order 5 = Zone 2, all else = Zone 1) if AI call fails or returns unparseable JSON
- No AI failure can block the user — staging always renders

*Full rewrite: `src/hooks/useStaples.ts`*
- `useStagingIngredients(weekStart)`: fetches meal_plan_slots → recipe_ids → recipes (for names) → recipe_ingredients with catalog join → consolidates by ingredient_id (sums qtys per unit, collects recipe names) → calls `classifyIngredients()` → returns `{ zone1, zone2, hasRecipes }` sorted by aisle_order. `retry: 0` to avoid retrying AI calls.
- `useStaplePredictions()`: fetches active staples with ingredient join → all purchase_history for those ingredient_ids → computes `daysSince` + `avgFreq` per ingredient → Zone 3 if `count >= 2 AND daysSince >= 0.8 × avgFreq`, else Zone 4
- `useConfirmStagingList()`: Planner mode — deactivates old list, creates fresh `grocery_lists` row, inserts Zone1+Zone2 as `source: 'meal_plan'` and Zone3+Zone4 as `source: 'staple'`. Grocery mode — gets existing list, checks existing ingredient_ids, appends only Zone2/3/4 items not already present. Both modes fire-and-forget `purchase_history` insert for all included ingredient_ids.

*Full rewrite: `src/screens/StagingScreen.tsx`*
- Context-aware entry: reads `location.state.from` (`'planner'` | `'grocery'`) and `location.state.weekStart`; falls back to active grocery list's `week_start` for grocery mode
- Back button: "← Planner" or "← Grocery" depending on entry point
- **Zone 1 — Buy this week**: green border/bg, display-only, recipe note shown per item, empty state when no meal plan
- **Zone 2 — Check your pantry**: amber border/bg, Skip/Need it toggles, all default to Skip; hint about pantry tracking
- **Zone 3 — Staple predictions**: teal border/bg, Yes/No toggles, all default to Yes, shows last-bought info per item
- **Zone 4 — All other staples**: collapsed with count badge (click to expand), individual Add buttons, "safety net" subtitle
- Overwrite warning modal (planner mode only): confirms before replacing existing list
- Confirm button: "Generate grocery list" (planner) or "Add to grocery list" (grocery); disabled + spinner while mutating
- On success: navigates to `/grocery`
- Sub-components: `Zone`, `ZoneItem`, `YNButtons`, `EmptyZone` — all inline

*Updated: `src/screens/PlannerScreen.tsx`*
- Removed the entire multi-step generate flow: `GenerateStep` type, `startGenerate`, `afterFreeformConfirm`, `runGenerate` functions, freeform-warning modal, overwrite-warning modal, `generateList`/`hasActiveList`/`freeformSlots` state
- "Generate grocery list" button now simply: `navigate('/staging', { state: { weekStart, from: 'planner' } })`
- Removed `useGenerateGroceryList` and `useHasActiveList` imports

*Updated: `src/screens/GroceryScreen.tsx`*
- "Review staples" button now passes state: `navigate('/staging', { state: { from: 'grocery' } })`

**Key design decisions:**
- Zone 2 defaults to all **Skip** (safer; user opts in to buying rather than accidentally buying duplicates)
- Zone 3 defaults to all **Yes** (predicted due; user opts out if already have it)
- Grocery mode is **append-only** — never replaces the existing list; duplicate ingredient_ids are skipped
- Planner mode always goes through staging — no direct generation bypass
- AI classification is fire-and-forget with heuristic fallback; user never waits on AI to see the screen (React Query suspense not used — everything renders with loading spinners per-zone)

### Session 7 — Meal prep screen
**Status:** ✅ Complete  
**Completed:** 2026-05-13

**What was built:**

*`src/stores/appStore.ts` — shared week state*
- Added `plannerWeekStart: string | null` + `setPlannerWeekStart(weekStart)` so the planner and prep tab stay on the same week without prop-drilling

*`src/screens/PlannerScreen.tsx` — minimal update*
- Added `useEffect` that calls `setPlannerWeekStart(weekStart)` whenever the planner's displayed week changes (navigation or DOW setting change)

*`src/hooks/useMealPrep.ts` — new aggregation hook*
- Two-query approach: (1) `meal_plan_slots` joined to `recipes` for slot_date + recipe name + servings, (2) `recipe_ingredients` joined to `ingredients_catalog` for all ingredients of those recipes
- Client-side aggregation: for each slot × recipe_ingredient pair, emits a `DishOccurrence`; groups by ingredient_id, sums quantities per unit (scaled by `servings_override / recipe.servings`), collects all dish rows
- Computes `consolidated_prep`: if all dishes share the same prep note → show it once; if different → "½ lb minced · 1 lb sliced" format (qty + unit + note per distinct note)
- Sorts by most dish occurrences first
- Exports `formatTotals()` helper ("2 lbs total" / "12 cloves") and `slotDayLabel()` ("Mon", "Tue")

*`src/screens/MealPrepScreen.tsx` — full rewrite*
- Header: "Meal Prep" + "Week of [range] — ingredient totals"
- Search bar: client-side filter by ingredient name, no extra query
- **"This week's prep" label** above card list
- **Ingredient cards** (tap to expand/collapse, chevron rotates):
  - Header: emoji tile + ingredient name + total quantity in sage ("2 lbs total")
  - Body (expanded): consolidated prep note in sage italic, then per-dish rows (recipe name · day on left, qty — prep note on right)
- **Empty state**: emoji + message + "Plan this week" → `/planner` button
- **No-results state**: friendly message when search has no matches
- Freeform slots (no recipe_id) silently skipped

**Key decisions:**
- No independent week navigation on prep screen — mirrors whatever week the planner is showing (via Zustand)
- Quantities scaled by `servings_override / recipe.servings` when a slot overrides servings

### Session 8 — Settings: model selection + family + catalog
**Status:** ✅ Complete  
**Completed:** 2026-05-13

**What was built:**

*DB — migration `0006_session8_settings`*
- `family_stores` table: id, family_id, name, is_default, sort_order — RLS via `get_my_family_id()`
- `family_invites` table: id, family_id, invited_by, token (random hex), role, accepted_by/at, expires_at — RLS: family members can select/insert/delete within own family
- Fixed `family_members` SELECT policy: replaced `user_id = auth.uid()` with `family_id = get_my_family_id()` so all family members can see each other
- `accept_family_invite(p_token)` SECURITY DEFINER RPC: validates token, removes old family membership, inserts into new family, updates `user_settings.family_id`, marks invite accepted

*AI settings cache — `src/lib/ai/settingsCache.ts`*
- Module-level `_cache` holding AI settings (models, keys, host, overrides)
- `setAISettingsCache()` / `getAISettingsCache()` / `getApiKeyForModel(model)` utilities
- Falls back to `VITE_DEV_ANTHROPIC_KEY` / `VITE_DEV_GOOGLE_AI_KEY` env vars when no user key stored

*AI adapters — fully wired*
- `anthropic.ts`: updated to use cache for API key (was hardcoded to env var)
- `openai.ts` (new): direct browser call to `api.openai.com/v1/chat/completions` with user's stored key
- `gemini.ts` (new): direct browser call to `generativelanguage.googleapis.com` with `gemini-2.0-flash`
- `ollama.ts` (new): direct call to configurable host (default `localhost:11434`), `llama3.2` model
- `ai/index.ts`: updated to import and route all four providers; `getModelForTask()` reads per-task overrides → global model → 'claude'
- `images/index.ts`: `getImageModel()` now reads from settings cache instead of hardcoded value

*`useUserSettings.ts` — updated*
- Added `useEffect` to call `setAISettingsCache(data)` whenever settings load/change — keeps module cache in sync
- Added `useUpdateAISettings()` mutation: updates all AI-related columns in `user_settings`

*New hooks*
- `useFamilyMembers.ts`: `useFamilyMembers()`, `useFamilyInvites()`, `useCreateInvite()`, `useDeleteInvite()`, `useAcceptInvite()` (via RPC), `buildInviteUrl(token)`
- `useFamilyStores.ts`: `useFamilyStores()`, `useAddFamilyStore()`, `useDeleteFamilyStore()`, `useSetDefaultStore()`
- `useCatalog.ts`: `useCatalogItems(search)`, `useUpdateCatalogItem()` (store, brand_note, is_pantry_staple, is_bulk_staple)

*New screens*
- `SettingsModelsScreen.tsx` (`/settings/models`): radio picker for text AI (Claude/GPT-4o/Gemini/Ollama) + image AI (NB2/NB Pro/NB/DALL-E/FLUX/None), API key inputs per model (show/hide toggle), Ollama host input, per-task overrides collapsible, Save with "✓ Saved" feedback
- `CatalogScreen.tsx` (`/settings/catalog`): search bar, aisle-grouped ingredient list, tap to open edit sheet (store assignment pill buttons, brand note, pantry/bulk toggles)
- `JoinScreen.tsx` (`/join?token=...`): accepts family invite via token, shows joining/done/error states, redirects to `/grocery` on success

*`SettingsScreen.tsx` — full rewrite*
- Profile card (avatar + name + email)
- Meal Planning: week start DOW select
- AI row → `/settings/models` with current model values shown
- Ingredients row → `/settings/catalog`
- Family section: member list with initials avatar + role badge, active invite rows (truncated URL + Copy button + revoke X), "Invite someone" creates a new invite
- Stores section: list with delete ×, add-store input + Plus button
- Sign out button (red outline)

*`BottomNav.tsx` — updated*
- Added Settings tab (Settings icon) as 5th tab

*`App.tsx` — updated*
- Added routes: `/settings/models`, `/settings/catalog`, `/join`
- Added `/settings` to `showNav` so nav appears on the settings tab

**Key decisions:**
- API keys stored as-is in `user_settings` `_enc` columns — RLS ensures only the user can read their own row (sufficient security for personal-use app)
- OpenAI and Gemini called directly from browser (both allow CORS with valid key); Anthropic continues via Edge Function
- Invite URL format: `https://simmer-rho-eight.vercel.app/join?token={hex16}` — token is 128-bit random, effectively unguessable
- Accepting an invite replaces the user's existing solo family membership (typical case: new user has empty family)
- `family_stores` and `ingredients_catalog.default_store` are independent — GroceryScreen tabs still read from catalog; Settings Stores section manages the standalone list

### Session 9 — Onboarding + PWA + polish
**Status:** ✅ Complete  
**Completed:** 2026-05-13  
**Live URL:** https://simmer-rho-eight.vercel.app

**What was built:**

*DB — migration `0007_session9_onboarding`*
- Added `onboarding_complete boolean NOT NULL DEFAULT false` to `user_settings`
- Immediately `UPDATE user_settings SET onboarding_complete = true` — existing accounts skip onboarding
- Performance indexes: `meal_plan_slots(family_id, week_start)`, `purchase_history(family_id, ingredient_id, purchased_at)`, `ingredients_catalog(family_id, name)`

*Onboarding flow (`/onboarding`)*
- `OnboardingScreen.tsx` — 3-step wizard with animated dot indicator
  - Step 1 (Welcome): Simmer flame logo, tagline, "Get started →", privacy note
  - Step 2 (Plan day): 7 tappable day buttons, selected highlighted sage, saves `plan_start_dow` then advances
  - Step 3 (Import history): drag-and-drop + file picker CSV import with progress spinner and `imported / newToCatalog` summary; "Import & finish" and "Skip for now" both complete onboarding
- `OnboardingGuard` component inside `ProtectedLayout` — `useEffect` checks `settings.onboarding_complete`, redirects to `/onboarding` if false; does nothing once complete (no extra latency for existing users)
- `useCompleteOnboarding()` mutation — sets `onboarding_complete = true` + invalidates settings cache

*CSV order history import*
- `src/lib/csvImport.ts` — column-detection parser (Instacart "Item Name"/"Date Ordered", Amazon "Item"/"Order Date", generic fallback), quoted-field CSV parser, name normalisation (strips size suffixes, brand prefixes, title-cases), ISO date parsing, per-(name, date) deduplication
- `fuzzyMatchIngredient()` — three-tier matching: exact → substring contains → word-overlap ≥ 50%
- `src/hooks/useOrderImport.ts` — loads full catalog, matches each row (creates new entry if no match), batch-inserts `purchase_history` in 200-row chunks, returns `{ imported, newToCatalog, skipped }`
- Settings screen: "Import order history" row opens `ImportSheet` bottom sheet (same drag-and-drop UX, reuses hook)

*PWA*
- `public/icons/icon-192.png` + `icon-512.png` generated programmatically — `#141820` background, sage green circular badge with dark flame symbol
- `vite.config.ts`: fixed `theme_color` + `background_color` from `#1a1612` → `#141820` (matches current Slate palette)
- `index.html`: added `viewport-fit=cover`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style: black-translucent`, `apple-mobile-web-app-title`, `apple-touch-icon`, `theme-color`; updated title to "Simmer"
- PWA service worker now precaches 7 entries including both icons

*Safe-area fixes*
- `Screen.tsx`: added `style` prop; bottom padding changed from `68px` → `calc(68px + env(safe-area-inset-bottom))`
- `GroceryScreen.tsx`: both pinned bars (`bottom: '58px'`) → `calc(68px + env(safe-area-inset-bottom))`
- `PlannerScreen.tsx`: pinned generate button `bottom: '58px'` → `calc(68px + env(safe-area-inset-bottom))`; `<Screen>` gets extra scroll padding for the pinned bar (`68px + 56px + env(safe-area-inset-bottom)`)
- `BottomNav.tsx` already had `paddingBottom: env(safe-area-inset-bottom)` ✓

*Loading states*
- `RecipesScreen`: replaced "Loading…" text with `RecipeSkeletonGrid` — 2-col grid of 4 shimmer cards matching real card proportions
- `PlannerScreen`: spinner while `slotsLoading`, table fades to 40% opacity during load
- `@keyframes shimmer` added to `index.css`

**Known issues / future work:**
- Bundle size is ~649KB gzipped to 176KB — acceptable for now but could benefit from code-splitting (lazy-load per-route)
- Ollama requires the user to configure CORS on their local Ollama instance (`OLLAMA_ORIGINS=*`)
- Recipe structuring "retry" on error works but leaves the user on the loading screen — a future session could add a "Back to entry" button
- `family_members.display_name` is not populated from Google OAuth metadata — members show as initials of their `user_id` sub-string instead of their name. Fix: on `useEnsureFamilyId`, write `user_metadata.full_name` to `display_name`
- CSV import creates new catalog entries without emoji — entries will show 🥄 placeholder until user edits them in the catalog screen

**For a future developer:**
- All Supabase Edge Function secrets must be set: `ANTHROPIC_API_KEY` (for `ai-call`), `GOOGLE_AI_API_KEY` (for `generate-image`)
- Vercel env vars needed: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DEV_ANTHROPIC_KEY`, `VITE_DEV_GOOGLE_AI_KEY`
- The `get_my_family_id()` SECURITY DEFINER function is critical — all RLS policies on 11 tables depend on it
- The `create_initial_family()` RPC bootstraps a new user's family on first sign-in (called by `useEnsureFamilyId`)
- `accept_family_invite(token)` RPC handles the full join flow atomically, including replacing old family membership

---

## Environment variables

```bash
# .env.local (never commit)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# These are stored per-user in the DB (encrypted), not in .env
# But for local dev you can put them here:
VITE_DEV_ANTHROPIC_KEY=
VITE_DEV_GOOGLE_AI_KEY=
```

---

## How to start a Claude Code session

Paste this at the start of every session:

```
Here is the CLAUDE.md for the Simmer project. 

We are working on Session [N]: [session name].

Previous session status: [paste the session log entry for the last completed session, or "Session 1 not started yet"].

Today's goal: [paste the Deliverables list from the project brief for this session].

The interactive HTML prototype is at docs/prototype.html — reference it for layout and interaction details when building UI components.

Please start by reading CLAUDE.md fully, then let me know what you're going to build and in what order before writing any code.
```

---

## Conventions

- All components are functional React with TypeScript
- Use Supabase Realtime for the grocery list so all family devices sync live
- Row Level Security (RLS) on all tables — family_id must match the user's family
- Never hardcode API keys — always read from user_settings (or .env for local dev)
- Use `useQuery`/`useMutation` pattern (React Query or SWR) for all Supabase data
- Images are lazy-loaded — never block recipe display waiting for NB2
- Use `/compact` in Claude Code when context gets large
- Update the Session Log in CLAUDE.md at the end of every session
