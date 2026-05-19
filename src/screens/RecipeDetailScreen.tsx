import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Clock, Users, Minus, Plus, ChefHat, CalendarDays, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { useRecipe, useRecipeIngredients, useRecipeSteps, useRecipeImageRealtime, useDeleteRecipe, markRecipeGenerating } from '../hooks/useRecipes'
import { CookingMode } from '../components/recipes/CookingMode'
import { callNanoBanana2 } from '../lib/images/nanoBanana'
import { useIsAdmin } from '../hooks/useFamilyMembers'
import { useEscapeKey } from '../lib/useEscapeKey'

// Card colors from prototype
const CARD_COLORS = ['#d4e8d4', '#f0e8d0', '#f0e0d8', '#d8e0ea', '#dce8e0', '#ecdae2']
function cardColor(id: string) {
  let sum = 0; for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i)
  return CARD_COLORS[sum % CARD_COLORS.length]
}
function formatTime(min: number | null) {
  if (!min) return null
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}`
}
function scale(qty: number | null, base: number, current: number): string {
  if (qty === null) return '—'
  const scaled = (qty / base) * current
  if (scaled < 0.25) return '¼'
  if (scaled <= 0.33) return '⅓'
  if (scaled <= 0.5) return '½'
  if (scaled <= 0.67) return '⅔'
  if (scaled <= 0.75) return '¾'
  const rounded = Math.round(scaled * 4) / 4
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '')
}

function useIsWide() {
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 800px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 800px)')
    const handler = (e: MediaQueryListEvent) => setWide(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return wide
}

type Tab = 'ingredients' | 'instructions'

type IngredientRow = {
  id: string
  quantity: number | null
  unit: string | null
  prep_note: string | null
  serving_note: string | null
  section: string | null
  ingredient: { id: string; name: string; emoji: string | null; image_url?: string | null; image_status?: string | null } | null
}
type StepRow = { id: string; step_number: number; instruction: string; ingredient_ids: string[]; section: string | null }

export function RecipeDetailScreen() {
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()
  const isWide    = useIsWide()

  const { data: recipe,      isLoading: rLoading } = useRecipe(id)
  const { data: ingredients, isLoading: iLoading } = useRecipeIngredients(id)
  const { data: steps,       isLoading: sLoading }  = useRecipeSteps(id)

  const [tab,             setTab]             = useState<Tab>('ingredients')
  const [servings,        setServings]        = useState<number | null>(null)
  const [cookingMode,     setCookingMode]     = useState(false)
  const [regenBusy,       setRegenBusy]       = useState(false)
  const [confirmDelete,   setConfirmDelete]   = useState(false)
  const [regenSheetOpen,  setRegenSheetOpen]  = useState(false)
  const [regenCustomText, setRegenCustomText] = useState('')

  const deleteRecipe = useDeleteRecipe()
  const { data: isAdmin = false } = useIsAdmin()
  useRecipeImageRealtime()

  // Escape key closes open sheets
  useEscapeKey(useCallback(() => {
    if (regenSheetOpen)  { setRegenSheetOpen(false); return }
    if (confirmDelete)   { setConfirmDelete(false);  return }
    if (cookingMode)     { setCookingMode(false);    return }
  }, [regenSheetOpen, confirmDelete, cookingMode]), regenSheetOpen || confirmDelete || cookingMode)

  function openRegenSheet() {
    if (!recipe?.nb2_prompt || regenBusy) return
    setRegenCustomText('')
    setRegenSheetOpen(true)
  }
  async function handleRegenImage() {
    if (!recipe?.nb2_prompt || regenBusy) return
    setRegenSheetOpen(false)
    setRegenBusy(true)
    // Mark as 'generating' in the DB immediately so the pulsing dot shows
    markRecipeGenerating(recipe.id).catch(() => {})
    callNanoBanana2(recipe.nb2_prompt, recipe.id, regenCustomText || undefined)
      .finally(() => setRegenBusy(false))
  }

  if (rLoading || iLoading || sLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: 'var(--dk)' }}>
        <span style={{ fontSize: '15px', color: 'var(--ts)' }}>Loading…</span>
      </div>
    )
  }
  if (!recipe) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: 'var(--dk)', flexDirection: 'column', gap: '12px' }}>
        <span style={{ fontSize: '15px', color: 'var(--ts)' }}>Recipe not found</span>
        <button onClick={() => navigate('/recipes')} style={{ fontSize: '14px', color: 'var(--am)', background: 'none', border: 'none', cursor: 'pointer' }}>← Back to recipes</button>
      </div>
    )
  }

  const baseServings    = recipe.servings ?? 4
  const currentServings = servings ?? baseServings
  const bg              = recipe.image_url ? undefined : cardColor(recipe.id)
  const isGenerating    = recipe.image_status === 'generating' || regenBusy

  // ── Shared sub-sections ───────────────────────────────────────────────────

  const metaBadges = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
      {recipe.cook_time_minutes && (
        <span style={{ fontSize: '14px', color: 'var(--ts)', display: 'flex', alignItems: 'center', gap: '3px' }}>
          <Clock size={12} /> {formatTime(recipe.cook_time_minutes)}
        </span>
      )}
      <span style={{ fontSize: '14px', color: 'var(--ts)', display: 'flex', alignItems: 'center', gap: '3px' }}>
        <Users size={12} /> {baseServings} servings
      </span>
      {(recipe as { difficulty?: string }).difficulty && (
        <span style={{ fontSize: '12px', color: 'var(--ts)', backgroundColor: 'var(--dk3)', borderRadius: '5px', padding: '2px 7px' }}>
          {(recipe as { difficulty?: string }).difficulty}
        </span>
      )}
      {recipe.meal_type && (
        <span style={{ fontSize: '12px', color: 'var(--am)', backgroundColor: 'rgba(239,159,39,0.12)', borderRadius: '5px', padding: '2px 7px', textTransform: 'capitalize' }}>
          {recipe.meal_type}
        </span>
      )}
    </div>
  )

  const servingsScaler = (
    <div style={{ backgroundColor: 'var(--dkc)', border: '0.5px solid var(--br)', borderRadius: '12px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: '15px', color: 'var(--tp)', fontWeight: 500 }}>Servings</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <button onClick={() => setServings(Math.max(1, currentServings - 1))} style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--dk3)', border: '0.5px solid var(--br)', cursor: 'pointer', color: 'var(--tp)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Minus size={13} />
        </button>
        <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--tp)', minWidth: '20px', textAlign: 'center' }}>{currentServings}</span>
        <button onClick={() => setServings(currentServings + 1)} style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--dk3)', border: '0.5px solid var(--br)', cursor: 'pointer', color: 'var(--tp)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Plus size={13} />
        </button>
      </div>
    </div>
  )

  // Build section-grouped ingredient and step lists
  const ingRows    = (ingredients ?? []) as IngredientRow[]
  const stepRows   = (steps ?? []) as StepRow[]
  const allSections = (() => {
    const seen = new Set<string>()
    const out: string[] = []
    ;[...ingRows, ...stepRows].forEach(r => {
      if (r.section && !seen.has(r.section)) { seen.add(r.section); out.push(r.section) }
    })
    return out
  })()

  function groupRows<T extends { section: string | null }>(rows: T[]) {
    const buckets = new Map<string | null, T[]>()
    buckets.set(null, [])
    for (const s of allSections) buckets.set(s, [])
    rows.forEach(r => (buckets.get(r.section) ?? buckets.get(null)!).push(r))
    const result: { section: string | null; items: T[] }[] = []
    const nullItems = buckets.get(null)!
    if (nullItems.length > 0 || allSections.length === 0) result.push({ section: null, items: nullItems })
    for (const s of allSections) result.push({ section: s, items: buckets.get(s)! })
    return result
  }

  const detailCardStyle: React.CSSProperties = { backgroundColor: 'var(--dkc)', border: '0.5px solid var(--br)', borderRadius: '12px', overflow: 'hidden' }

  const ingItemRow = (row: IngredientRow, itemIdx: number, totalItems: number) => (
    <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: itemIdx < totalItems - 1 ? '0.5px solid var(--br)' : 'none' }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {row.ingredient?.image_status === 'done' && row.ingredient.image_url ? (
          <img src={row.ingredient.image_url} alt={row.ingredient.name ?? ''} style={{ width: '28px', height: '28px', objectFit: 'contain', display: 'block' }} />
        ) : (
          <span style={{ fontSize: '20px', display: 'block' }}>{row.ingredient?.emoji ?? '🥄'}</span>
        )}
        {row.ingredient?.image_status === 'generating' && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: '6px', height: '6px', borderRadius: '50%', background: 'var(--am)', animation: 'nb2-pulse 1.2s ease-in-out infinite' }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '15px', color: 'var(--tp)', fontWeight: 500 }}>{row.ingredient?.name ?? '—'}</div>
        {row.prep_note && <div style={{ fontSize: '13px', color: 'var(--ts)' }}>{row.prep_note}</div>}
        {row.serving_note && <div style={{ fontSize: '12px', color: 'var(--tm)', fontStyle: 'italic' }}>{row.serving_note}</div>}
      </div>
      <span style={{ fontSize: '15px', color: 'var(--tp)', fontWeight: 500, flexShrink: 0 }}>
        {scale(row.quantity, baseServings, currentServings)}{row.unit ? ` ${row.unit}` : ''}
      </span>
    </div>
  )

  const ingredientsList = (() => {
    const groups = groupRows(ingRows)
    if (allSections.length === 0) {
      return (
        <div style={detailCardStyle}>
          {ingRows.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ts)', fontSize: '15px' }}>No ingredients</div>}
          {groups.flatMap(({ items }) => items.map((row, i) => ingItemRow(row, i, items.length)))}
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {groups.filter(g => g.items.length > 0).map(({ section, items }) => (
          <div key={section ?? '__none'} style={detailCardStyle}>
            {section && (
              <div style={{ padding: '8px 14px 7px', borderBottom: '0.5px solid var(--br)', fontSize: '10px', fontWeight: 700, color: 'var(--tm)', letterSpacing: '0.7px', textTransform: 'uppercase', backgroundColor: 'rgba(255,255,255,0.025)' }}>
                {section}
              </div>
            )}
            {items.map((row, i) => ingItemRow(row, i, items.length))}
          </div>
        ))}
      </div>
    )
  })()

  const instructionsList = (() => {
    const groups = groupRows(stepRows)
    const hasSections = allSections.length > 0

    const stepRow = (step: StepRow, i: number, totalItems: number) => (
      <div key={step.id} style={{ padding: '13px 14px', borderBottom: i < totalItems - 1 ? '0.5px solid var(--br)' : 'none' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--am)', letterSpacing: '1px', marginBottom: '5px' }}>STEP {step.step_number}</div>
        <p style={{ fontSize: '15px', color: 'var(--tp)', margin: 0, lineHeight: 1.6 }}>{step.instruction}</p>
      </div>
    )

    const startCookingBtn = (
      <button
        onClick={() => setCookingMode(true)}
        style={{ width: '100%', padding: '12px', backgroundColor: 'var(--am)', color: '#1a1612', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '10px' }}
      >
        <ChefHat size={16} /> Start cooking
      </button>
    )

    if (!hasSections) {
      return (
        <div style={detailCardStyle}>
          {stepRows.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ts)', fontSize: '15px' }}>No steps</div>}
          {groups.flatMap(({ items }) => items.map((step, i) => stepRow(step, i, items.length)))}
          {stepRows.length > 0 && (
            <div style={{ padding: '12px 14px', borderTop: '0.5px solid var(--br)' }}>
              <button
                onClick={() => setCookingMode(true)}
                style={{ width: '100%', padding: '12px', backgroundColor: 'var(--am)', color: '#1a1612', border: 'none', borderRadius: '10px', fontSize: '16px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <ChefHat size={16} /> Start cooking
              </button>
            </div>
          )}
        </div>
      )
    }

    return (
      <>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {groups.filter(g => g.items.length > 0).map(({ section, items }) => (
            <div key={section ?? '__none'} style={detailCardStyle}>
              {section && (
                <div style={{ padding: '8px 14px 7px', borderBottom: '0.5px solid var(--br)', fontSize: '10px', fontWeight: 700, color: 'var(--tm)', letterSpacing: '0.7px', textTransform: 'uppercase', backgroundColor: 'rgba(255,255,255,0.025)' }}>
                  {section}
                </div>
              )}
              {items.map((step, i) => stepRow(step, i, items.length))}
            </div>
          ))}
        </div>
        {stepRows.length > 0 && startCookingBtn}
      </>
    )
  })()

  const imageArea = (height: string | number, borderRadius?: string) => (
    <div style={{ width: '100%', height, backgroundColor: bg, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius }}>
      {recipe.image_url ? (
        <>
          <img src={`${recipe.image_url}?t=${Date.parse(recipe.updated_at)}`} alt={recipe.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {isGenerating && (
            <div style={{ position: 'absolute', bottom: '10px', left: '10px', width: '9px', height: '9px', borderRadius: '50%', background: 'var(--am)', animation: 'nb2-pulse 1.2s ease-in-out infinite', zIndex: 2 }} />
          )}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', opacity: isGenerating ? 0.6 : 0.35, animation: isGenerating ? 'nb2-pulse 1.8s ease-in-out infinite' : undefined }}>
            <span style={{ fontSize: '54px' }}>{recipe.emoji ?? (recipe.meal_type === 'breakfast' ? '🍳' : recipe.meal_type === 'lunch' ? '🥗' : '🍽️')}</span>
            <span style={{ fontSize: '11px', letterSpacing: '0.5px', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', fontWeight: 500 }}>
              {isGenerating ? 'rendering…' : recipe.image_status === 'failed' ? 'generation failed' : 'queued'}
            </span>
          </div>
          {!isGenerating && recipe.nb2_prompt && isAdmin && (
            <button onClick={openRegenSheet} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'rgba(0,0,0,0.18)', border: 'none', borderRadius: '8px', padding: '5px 10px', color: 'rgba(0,0,0,0.5)', fontSize: '11px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
              <RefreshCw size={10} /> Regenerate image
            </button>
          )}
        </div>
      )}
    </div>
  )

  const overlayButtons = (
    <div style={{ position: 'absolute', top: '12px', right: '12px', display: 'flex', gap: '6px', zIndex: 2 }}>
      {isAdmin && recipe.nb2_prompt && !regenBusy && recipe.image_status !== 'generating' && (
        <button onClick={openRegenSheet} style={{ background: 'rgba(0,0,0,0.35)', border: 'none', borderRadius: '20px', padding: '6px 10px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
          <RefreshCw size={12} />
        </button>
      )}
      <button onClick={() => navigate(`/recipes/${recipe.id}/edit`)} style={{ background: 'rgba(0,0,0,0.35)', border: 'none', borderRadius: '20px', padding: '6px 10px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
        <Pencil size={12} /> Edit
      </button>
    </div>
  )

  // ── Regen sheet + cooking mode (shared) ──────────────────────────────────

  const regenSheet = regenSheetOpen && (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end' }} onClick={e => { if (e.target === e.currentTarget) setRegenSheetOpen(false) }}>
      <div style={{ background: 'var(--dk2)', borderRadius: '20px 20px 0 0', padding: '20px 16px 32px', width: '100%', borderTop: '0.5px solid var(--brh)' }}>
        <div style={{ fontSize: '17px', fontWeight: 600, color: 'var(--tp)', marginBottom: '4px' }}>Regenerate image</div>
        <div style={{ fontSize: '13px', color: 'var(--ts)', marginBottom: '16px' }}>Base style: retro-pop plated dish illustration. Add custom instructions below to adjust the result.</div>
        <textarea autoFocus value={regenCustomText} onChange={e => setRegenCustomText(e.target.value)} placeholder={'e.g. "make the sauce more vibrant", "add fresh herb garnish", "warmer lighting"'} rows={3}
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--dk3)', border: '0.5px solid var(--brh)', borderRadius: '10px', padding: '10px 12px', color: 'var(--tp)', fontSize: '15px', fontFamily: 'inherit', outline: 'none', resize: 'none', marginBottom: '14px' }}
        />
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setRegenSheetOpen(false)} style={{ flex: 1, padding: '13px', background: 'var(--dk3)', border: '0.5px solid var(--br)', borderRadius: '12px', color: 'var(--ts)', fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={handleRegenImage} style={{ flex: 2, padding: '13px', background: 'var(--am)', border: 'none', borderRadius: '12px', color: '#141820', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
            <RefreshCw size={14} /> Generate
          </button>
        </div>
      </div>
    </div>
  )

  const cookingModeOverlay = cookingMode && steps && (
    <CookingMode
      recipeName={recipe.name}
      steps={steps.map((s: StepRow) => ({ id: s.id, step_number: s.step_number, instruction: s.instruction, ingredient_ids: s.ingredient_ids ?? [] }))}
      ingredients={(ingredients ?? []).map((r: IngredientRow) => ({
        id: r.ingredient?.id ?? r.id,
        emoji: r.ingredient?.emoji ?? '🥄',
        name: r.ingredient?.name ?? '—',
        quantity: scale(r.quantity, baseServings, currentServings),
        unit: r.unit,
      }))}
      onDone={() => setCookingMode(false)}
    />
  )

  // ── DESKTOP LAYOUT ────────────────────────────────────────────────────────

  if (isWide) {
    return (
      <>
        <div style={{ backgroundColor: 'var(--dk)', minHeight: '100%' }}>

          {/* ── Top: info (left) + image (right) ── */}
          <div style={{ display: 'flex', minHeight: '420px' }}>

            {/* Left panel */}
            <div style={{ width: '50%', padding: '36px 48px', display: 'flex', flexDirection: 'column', gap: '20px', boxSizing: 'border-box' }}>

              {/* Nav row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button onClick={() => navigate('/recipes')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ts)', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '14px', padding: 0 }}>
                  <ArrowLeft size={14} /> Recipes
                </button>
              </div>

              {/* Title */}
              <h1 style={{ fontSize: '30px', fontWeight: 700, color: 'var(--tp)', margin: 0, lineHeight: 1.2 }}>
                {recipe.name}
              </h1>

              {/* Meta */}
              {metaBadges}

              {/* Servings */}
              {servingsScaler}

              {/* Spacer pushes actions to bottom */}
              <div style={{ flex: 1 }} />

              {/* Action buttons */}
              {confirmDelete ? (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '13px', background: 'var(--dk3)', border: '0.5px solid var(--br)', borderRadius: '12px', color: 'var(--ts)', fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                  <button onClick={async () => { await deleteRecipe.mutateAsync(recipe.id); navigate('/recipes') }} disabled={deleteRecipe.isPending} style={{ flex: 2, padding: '13px', background: 'rgba(208,90,48,0.15)', border: '0.5px solid var(--rd)', borderRadius: '12px', color: 'var(--rd)', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {deleteRecipe.isPending ? 'Deleting…' : 'Delete recipe'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '8px' }}>
                  {isAdmin && (
                    <button onClick={() => setConfirmDelete(true)} style={{ padding: '13px 14px', background: 'none', border: '0.5px solid var(--br)', borderRadius: '12px', color: 'var(--ts)', cursor: 'pointer', lineHeight: 0 }}>
                      <Trash2 size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => navigate('/planner/add', { state: { recipeId: recipe.id, recipeName: recipe.name, recipeEmoji: recipe.emoji ?? (recipe.meal_type === 'breakfast' ? '🍳' : recipe.meal_type === 'lunch' ? '🥗' : '🍽️') } })}
                    style={{ flex: 1, padding: '13px', backgroundColor: 'var(--dk3)', color: 'var(--tp)', border: '0.5px solid var(--brh)', borderRadius: '12px', fontSize: '16px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <CalendarDays size={16} /> Add to meal plan
                  </button>
                </div>
              )}
            </div>

            {/* Right panel: image */}
            <div style={{ width: '50%', padding: '24px 24px 24px 0', boxSizing: 'border-box' }}>
              <div style={{ position: 'relative', height: '100%', borderRadius: '14px', overflow: 'hidden' }}>
                {imageArea('100%')}
                {overlayButtons}
              </div>
            </div>
          </div>

          {/* ── Bottom: ingredients (left) + instructions (right) ── */}
          <div style={{ display: 'flex', gap: '32px', padding: '36px 48px', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ts)', letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 12px' }}>Ingredients</h2>
              {ingredientsList}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ts)', letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 12px' }}>Instructions</h2>
              {instructionsList}
            </div>
          </div>
        </div>

        {regenSheet}
        {cookingModeOverlay}
      </>
    )
  }

  // ── MOBILE LAYOUT ─────────────────────────────────────────────────────────

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--dk)' }}>
        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '72px' }}>

          {/* Hero image area */}
          <div style={{ position: 'relative' }}>
            {imageArea('220px')}

            {/* Back button overlay */}
            <button onClick={() => navigate('/recipes')} style={{ position: 'absolute', top: '12px', left: '12px', background: 'rgba(0,0,0,0.35)', border: 'none', borderRadius: '20px', padding: '6px 10px', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
              <ArrowLeft size={13} /> Recipes
            </button>

            {overlayButtons}
          </div>

          {/* Recipe header */}
          <div style={{ padding: '16px 16px 0' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--tp)', margin: '0 0 8px', lineHeight: 1.2 }}>{recipe.name}</h1>
            {metaBadges}
          </div>

          {/* Servings scaler */}
          <div style={{ margin: '16px 16px 0' }}>{servingsScaler}</div>

          {/* Tab switcher */}
          <div style={{ margin: '16px 16px 0', display: 'flex', gap: '0', backgroundColor: 'var(--dk3)', borderRadius: '10px', padding: '3px' }}>
            {(['ingredients', 'instructions'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '8px', borderRadius: '8px', backgroundColor: tab === t ? 'var(--dkc)' : 'transparent', border: tab === t ? '0.5px solid var(--br)' : 'none', color: tab === t ? 'var(--tp)' : 'var(--ts)', fontSize: '15px', fontWeight: tab === t ? 600 : 400, cursor: 'pointer', textTransform: 'capitalize', transition: 'all 0.15s' }}>
                {t}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: '12px 16px 0' }}>
            {tab === 'ingredients' ? ingredientsList : instructionsList}
          </div>
        </div>

        {/* Pinned bottom bar */}
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: 'var(--dk2)', borderTop: '0.5px solid var(--br)', padding: '12px 16px' }}>
          {confirmDelete ? (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: '13px', background: 'var(--dk3)', border: '0.5px solid var(--br)', borderRadius: '12px', color: 'var(--ts)', fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={async () => { await deleteRecipe.mutateAsync(recipe.id); navigate('/recipes') }} disabled={deleteRecipe.isPending} style={{ flex: 2, padding: '13px', background: 'rgba(208,90,48,0.15)', border: '0.5px solid var(--rd)', borderRadius: '12px', color: 'var(--rd)', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {deleteRecipe.isPending ? 'Deleting…' : 'Delete recipe'}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              {isAdmin && (
                <button onClick={() => setConfirmDelete(true)} style={{ padding: '13px 14px', background: 'none', border: '0.5px solid var(--br)', borderRadius: '12px', color: 'var(--ts)', cursor: 'pointer', lineHeight: 0 }}>
                  <Trash2 size={16} />
                </button>
              )}
              <button
                onClick={() => navigate('/planner/add', { state: { recipeId: recipe.id, recipeName: recipe.name, recipeEmoji: recipe.emoji ?? (recipe.meal_type === 'breakfast' ? '🍳' : recipe.meal_type === 'lunch' ? '🥗' : '🍽️') } })}
                style={{ flex: 1, padding: '13px', backgroundColor: 'var(--dk3)', color: 'var(--tp)', border: '0.5px solid var(--brh)', borderRadius: '12px', fontSize: '16px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                <CalendarDays size={16} /> Add to meal plan
              </button>
            </div>
          )}
        </div>
      </div>

      {regenSheet}
      {cookingModeOverlay}
    </>
  )
}
