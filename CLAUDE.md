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
- "Generate grocery list" sage button pinned above nav → navigates to `/staging`.

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
**Status:** Not started  
**Depends on:** Sessions 2 + 4 (need recipes and meal plan slots)

### Session 6 — Staging screen (pantry intelligence)
**Status:** Not started  
**Depends on:** Sessions 5 (grocery list exists), Session 1 (purchase_history table)

### Session 7 — Meal prep screen
**Status:** Not started  
**Depends on:** Sessions 2 + 4 (recipes with ingredients + meal plan)

### Session 8 — Settings: model selection + family + catalog
**Status:** Not started  
**Depends on:** Session 1 (user_settings table), all AI integrations working

### Session 9 — Onboarding + PWA + polish
**Status:** Not started  
**Depends on:** All previous sessions complete

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
