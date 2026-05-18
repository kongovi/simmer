import { useState, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Check, AlertTriangle, Plus, Trash2, GitMerge } from 'lucide-react'
import type { ParsedRecipe, ParsedIngredient, ParsedStep } from '../lib/recipeParser'
import { useSaveRecipe } from '../hooks/useRecipes'
import { useIngredientsCatalog, matchIngredientFull } from '../hooks/useIngredientsCatalog'
import { useEscapeKey } from '../lib/useEscapeKey'

// 6 card colors — pick same one used by RecipeCard
const CARD_COLORS = ['#d4e8d4', '#f0e8d0', '#f0e0d8', '#d8e0ea', '#dce8e0', '#ecdae2']
function tempColor() { return CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)] }

export function RecipeReviewScreen() {
  const navigate   = useNavigate()
  const location   = useLocation()
  const state      = location.state as { parsed?: ParsedRecipe; rawText?: string; sourceUrl?: string; partial?: boolean } | null

  const parsed     = state?.parsed
  const { data: catalog = [] } = useIngredientsCatalog()
  const saveRecipe = useSaveRecipe()

  // Editable recipe basics
  const [name,       setName]       = useState(parsed?.name ?? '')
  const [servings,   setServings]   = useState(parsed?.servings ?? 4)
  const [cookTime,   setCookTime]   = useState<string>(parsed?.cook_time_minutes != null ? String(parsed.cook_time_minutes) : '')
  const [mealType,   setMealType]   = useState(parsed?.meal_type ?? '')

  // Editable ingredients
  const [ingredients, setIngredients] = useState<ParsedIngredient[]>(parsed?.ingredients ?? [])

  // Editable steps
  const [steps, setSteps]           = useState<ParsedStep[]>(parsed?.steps ?? [])

  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)
  const placeholderColor            = useRef(tempColor())

  // Indices where the user chose "Keep separate" — override any inferred merge
  const [keepSeparate, setKeepSeparate] = useState<Set<number>>(new Set())
  function toggleKeepSeparate(idx: number) {
    setKeepSeparate(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }

  // Manual merges — user-chosen catalog item for a "new" ingredient
  const [manualMerge, setManualMerge] = useState<Map<number, string>>(new Map()) // idx → catalogId
  const [mergePickerIdx, setMergePickerIdx] = useState<number | null>(null)
  const [mergeSearch, setMergeSearch] = useState('')

  useEscapeKey(useCallback(() => {
    if (mergePickerIdx !== null) {
      setMergePickerIdx(null)
      setMergeSearch('')
      return
    }
    navigate('/recipes')
  }, [mergePickerIdx, navigate]))

  function pickManualMerge(idx: number, catalogId: string) {
    setManualMerge(prev => new Map(prev).set(idx, catalogId))
    setMergePickerIdx(null)
    setMergeSearch('')
  }
  function clearManualMerge(idx: number) {
    setManualMerge(prev => { const m = new Map(prev); m.delete(idx); return m })
  }

  const mergePickerResults = mergePickerIdx !== null
    ? catalog.filter(c => c.name.toLowerCase().includes(mergeSearch.toLowerCase())).slice(0, 8)
    : []

  if (!parsed && !state?.partial) {
    // No state — redirect back
    navigate('/recipes/new', { replace: true })
    return null
  }

  const flaggedCount = ingredients.filter(i => i.flag === 'confirm_quantity').length

  // Count inferred merges the user hasn't dismissed yet
  const mergeCount = ingredients.filter((ing, idx) => {
    const { catalog: m, isMerge } = matchIngredientFull(ing.name, catalog)
    return isMerge && !!m && !keepSeparate.has(idx)
  }).length

  // ── Ingredient helpers ──────────────────────────────────────────
  function updateIngredientQty(idx: number, qty: string) {
    setIngredients(prev => prev.map((ing, i) =>
      i === idx ? { ...ing, quantity: qty ? parseFloat(qty) : null, flag: null } : ing
    ))
  }
  function removeIngredient(idx: number) {
    setIngredients(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Step helpers ─────────────────────────────────────────────────
  function updateStep(idx: number, instruction: string) {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, instruction } : s))
  }
  function addStep() {
    setSteps(prev => [...prev, { step_number: prev.length + 1, instruction: '' }])
  }
  function removeStep(idx: number) {
    setSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_number: i + 1 })))
  }

  // ── Save ─────────────────────────────────────────────────────────
  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setSaveError(null)
    try {
      const id = await saveRecipe.mutateAsync({
        name: name.trim(),
        servings,
        cook_time_minutes: cookTime ? parseInt(cookTime) : null,
        meal_type: mealType || null,
        tags: parsed?.tags ?? [],
        difficulty: parsed?.difficulty ?? null,
        ingredients: ingredients.map((ing, idx) => {
          const { catalog: match } = matchIngredientFull(ing.name, catalog)
          // Priority: manual merge > auto-match (unless user kept separate) > new
          const manualId = manualMerge.get(idx)
          const autoId   = match && !keepSeparate.has(idx) ? match.id : undefined
          const catalogId = manualId ?? autoId
          return {
            catalogId,
            name: ing.name,
            emoji: ing.emoji,
            quantity: ing.quantity,
            unit: ing.unit,
            prep_note: ing.prep_note,
            serving_note: ing.serving_note,
          }
        }),
        steps,
      })
      navigate(`/recipes/${id}`, { replace: true })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save recipe')
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--dk)' }}>
      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '80px' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 16px 0' }}>
          <button
            onClick={() => navigate(-1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ts)', padding: '4px' }}
          >
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1 }}>
            {flaggedCount > 0 && (
              <div style={{ fontSize: '11px', color: 'var(--am)', fontWeight: 500, marginBottom: '2px' }}>
                ⚠ {flaggedCount} quantity{flaggedCount > 1 ? 's' : ''} need review
              </div>
            )}
            {mergeCount > 0 && (
              <div style={{ fontSize: '11px', color: '#c97d2a', fontWeight: 500, marginBottom: '2px' }}>
                ⇢ {mergeCount} ingredient{mergeCount > 1 ? 's' : ''} merged with existing
              </div>
            )}
            <div style={{ fontSize: '17px', fontWeight: 600, color: 'var(--tp)' }}>Review &amp; save</div>
          </div>
        </div>

        {/* NB2 placeholder image */}
        <div style={{ margin: '16px 16px 0', borderRadius: '13px', overflow: 'hidden' }}>
          <div
            style={{
              width: '100%',
              height: '180px',
              backgroundColor: placeholderColor.current,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              position: 'relative',
            }}
          >
            <span style={{ fontSize: '48px', opacity: 0.4 }}>
              {parsed?.meal_type === 'breakfast' ? '🍳' : parsed?.meal_type === 'lunch' ? '🥗' : '🍽️'}
            </span>
            <span style={{ fontSize: '9px', letterSpacing: '0.5px', textTransform: 'uppercase', color: 'rgba(0,0,0,0.35)', fontWeight: 500 }}>
              NB2 · queued
            </span>
          </div>
        </div>

        {/* Recipe basics */}
        <Section title="Recipe basics">
          <Field label="Recipe name">
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Recipe name"
              style={inputStyle}
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <Field label="Servings">
              <input
                type="number"
                value={servings}
                onChange={e => setServings(parseInt(e.target.value) || 4)}
                min={1}
                style={inputStyle}
              />
            </Field>
            <Field label="Cook time (min)">
              <input
                type="number"
                value={cookTime}
                onChange={e => setCookTime(e.target.value)}
                placeholder="45"
                style={inputStyle}
              />
            </Field>
          </div>
          <Field label="Meal type">
            <select
              value={mealType}
              onChange={e => setMealType(e.target.value)}
              style={{ ...inputStyle, appearance: 'none' }}
            >
              <option value="">—</option>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
            </select>
          </Field>
        </Section>

        {/* Ingredients */}
        <Section title={`Ingredients — tap qty to edit`}>
          {ingredients.map((ing, idx) => {
            const { catalog: catalogMatch, isMerge } = matchIngredientFull(ing.name, catalog)
            const userKeptSeparate  = keepSeparate.has(idx)
            const manualCatalogId   = manualMerge.get(idx)
            const manualCatalogItem = manualCatalogId ? catalog.find(c => c.id === manualCatalogId) : null
            // Effective state after user overrides
            const effectiveIsNew    = !manualCatalogId && (!catalogMatch || userKeptSeparate)
            // Fuzzy match: show amber "Merging with →" alert
            const showMergeAlert    = !manualCatalogId && isMerge && !!catalogMatch && !userKeptSeparate
            // Exact match: show subtle "Linked to catalog" row so user can opt out
            const showExactMatch    = !manualCatalogId && !isMerge && !!catalogMatch && !userKeptSeparate
            // Kept separate confirmation (covers both fuzzy and exact)
            const showKeptSeparate  = userKeptSeparate && !!catalogMatch
            const needsReview       = ing.flag === 'confirm_quantity'

            return (
              <div
                key={idx}
                style={{
                  padding: '9px 14px',
                  borderBottom: idx < ingredients.length - 1 ? '0.5px solid var(--br)' : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {/* Status icon */}
                  <div style={{ width: '16px', flexShrink: 0 }}>
                    {needsReview ? (
                      <AlertTriangle size={13} color="var(--am)" />
                    ) : showMergeAlert ? (
                      <GitMerge size={13} color="#c97d2a" />
                    ) : (
                      <Check size={13} color={effectiveIsNew ? 'var(--ts)' : 'var(--gl)'} />
                    )}
                  </div>

                  {/* Emoji + name */}
                  <span style={{ fontSize: '16px', flexShrink: 0 }}>{ing.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', color: 'var(--tp)', fontWeight: 500 }}>
                      {ing.name}
                      {effectiveIsNew && !showMergeAlert && (
                        <span style={{ fontSize: '9px', color: 'var(--gl)', marginLeft: '5px', backgroundColor: 'rgba(93,202,165,0.12)', borderRadius: '3px', padding: '1px 4px' }}>
                          + new
                        </span>
                      )}
                    </div>
                    {ing.prep_note && (
                      <div style={{ fontSize: '11px', color: 'var(--ts)' }}>{ing.prep_note}</div>
                    )}
                    {needsReview && (
                      <div style={{ fontSize: '10px', color: 'var(--am)', marginTop: '1px' }}>confirm quantity</div>
                    )}
                  </div>

                  {/* Quantity */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                    <input
                      type="number"
                      value={ing.quantity ?? ''}
                      onChange={e => updateIngredientQty(idx, e.target.value)}
                      placeholder="?"
                      style={{
                        width: '44px',
                        backgroundColor: needsReview ? 'rgba(239,159,39,0.1)' : 'var(--dk3)',
                        border: `0.5px solid ${needsReview ? 'var(--am)' : 'var(--br)'}`,
                        borderRadius: '6px',
                        padding: '3px 5px',
                        fontSize: '12px',
                        color: 'var(--tp)',
                        textAlign: 'right',
                        outline: 'none',
                      }}
                    />
                    {ing.unit && (
                      <span style={{ fontSize: '11px', color: 'var(--ts)' }}>{ing.unit}</span>
                    )}
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removeIngredient(idx)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: '2px', flexShrink: 0 }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Merge alert row */}
                {showMergeAlert && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginTop: '5px', marginLeft: '26px',
                    background: 'rgba(201,125,42,0.1)',
                    border: '0.5px solid rgba(201,125,42,0.35)',
                    borderRadius: '6px', padding: '4px 8px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '10px', color: '#c97d2a' }}>
                        Merging with existing →
                      </span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#c97d2a' }}>
                        {catalogMatch.name}
                      </span>
                    </div>
                    <button
                      onClick={() => toggleKeepSeparate(idx)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '10px', color: 'var(--ts)', fontFamily: 'inherit',
                        padding: '0 2px', textDecoration: 'underline', flexShrink: 0,
                      }}
                    >
                      Keep separate
                    </button>
                  </div>
                )}

                {/* Exact match row — subtle affordance to opt out */}
                {showExactMatch && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginTop: '5px', marginLeft: '26px',
                    background: 'rgba(93,202,165,0.06)',
                    border: '0.5px solid rgba(93,202,165,0.2)',
                    borderRadius: '6px', padding: '4px 8px',
                  }}>
                    <span style={{ fontSize: '10px', color: 'var(--gl)' }}>
                      Linked to <strong style={{ fontWeight: 600 }}>{catalogMatch!.name}</strong> in your catalog
                    </span>
                    <button
                      onClick={() => toggleKeepSeparate(idx)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '10px', color: 'var(--ts)', fontFamily: 'inherit',
                        padding: '0 2px', textDecoration: 'underline', flexShrink: 0,
                      }}
                    >
                      Keep separate
                    </button>
                  </div>
                )}

                {/* "Kept separate" confirmation row (exact or fuzzy) */}
                {showKeptSeparate && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginTop: '5px', marginLeft: '26px',
                    background: 'rgba(93,202,165,0.08)',
                    border: '0.5px solid rgba(93,202,165,0.25)',
                    borderRadius: '6px', padding: '4px 8px',
                  }}>
                    <span style={{ fontSize: '10px', color: 'var(--gl)' }}>
                      Will be saved as a new ingredient
                    </span>
                    <button
                      onClick={() => toggleKeepSeparate(idx)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '10px', color: 'var(--ts)', fontFamily: 'inherit',
                        padding: '0 2px', textDecoration: 'underline', flexShrink: 0,
                      }}
                    >
                      Undo
                    </button>
                  </div>
                )}

                {/* New ingredient — offer to merge with existing */}
                {effectiveIsNew && !manualCatalogItem && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginTop: '5px', marginLeft: '26px',
                  }}>
                    <span style={{ fontSize: '10px', color: 'var(--ts)' }}>New to your catalog</span>
                    <button
                      onClick={() => { setMergePickerIdx(idx); setMergeSearch('') }}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '10px', color: 'var(--am)', fontFamily: 'inherit',
                        padding: '0 2px', textDecoration: 'underline', flexShrink: 0,
                      }}
                    >
                      Merge with existing →
                    </button>
                  </div>
                )}

                {/* Manual merge chosen */}
                {manualCatalogItem && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    marginTop: '5px', marginLeft: '26px',
                    background: 'rgba(201,125,42,0.1)',
                    border: '0.5px solid rgba(201,125,42,0.35)',
                    borderRadius: '6px', padding: '4px 8px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <span style={{ fontSize: '10px', color: '#c97d2a' }}>Merging with →</span>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#c97d2a' }}>{manualCatalogItem.name}</span>
                    </div>
                    <button
                      onClick={() => clearManualMerge(idx)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '10px', color: 'var(--ts)', fontFamily: 'inherit',
                        padding: '0 2px', textDecoration: 'underline', flexShrink: 0,
                      }}
                    >
                      Undo
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </Section>

        {/* Steps */}
        <Section title="Steps">
          {steps.map((step, idx) => (
            <div
              key={idx}
              style={{
                padding: '10px 14px',
                borderBottom: idx < steps.length - 1 ? '0.5px solid var(--br)' : 'none',
              }}
            >
              <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--am)', letterSpacing: '0.8px', marginBottom: '4px' }}>
                STEP {step.step_number}
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={e => updateStep(idx, e.currentTarget.textContent ?? '')}
                  style={{
                    flex: 1,
                    fontSize: '13px',
                    color: 'var(--tp)',
                    lineHeight: 1.5,
                    outline: 'none',
                    minHeight: '20px',
                  }}
                >
                  {step.instruction}
                </div>
                <button
                  onClick={() => removeStep(idx)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: '2px', flexShrink: 0, marginTop: '1px' }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}

          {/* Add step */}
          <button
            onClick={addStep}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              width: '100%',
              padding: '11px 14px',
              background: 'none',
              border: 'none',
              borderTop: steps.length > 0 ? '0.5px solid var(--br)' : 'none',
              cursor: 'pointer',
              fontSize: '12px',
              color: 'var(--ts)',
            }}
          >
            <Plus size={13} />
            Add a step
          </button>
        </Section>

        {saveError && (
          <p style={{ fontSize: '12px', color: 'var(--rd)', padding: '0 16px 12px', margin: 0 }}>
            {saveError}
          </p>
        )}
      </div>

      {/* Merge picker modal */}
      {mergePickerIdx !== null && (
        <>
          <div
            onClick={() => { setMergePickerIdx(null); setMergeSearch('') }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 59 }}
          />
          <div style={{
            position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 60, width: 'min(320px, calc(100vw - 32px))',
            background: 'var(--dk2)', border: '0.5px solid var(--brh)',
            borderRadius: '14px', padding: '16px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tp)', marginBottom: '4px' }}>
              Merge "{ingredients[mergePickerIdx]?.name}" with…
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ts)', marginBottom: '12px' }}>
              Search your ingredient catalog
            </div>
            <input
              autoFocus
              value={mergeSearch}
              onChange={e => setMergeSearch(e.target.value)}
              placeholder="Search catalog…"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--dk3)', border: '0.5px solid var(--brh)',
                borderRadius: '8px', padding: '8px 10px',
                color: 'var(--tp)', fontSize: '14px',
                fontFamily: 'inherit', outline: 'none',
                marginBottom: '8px',
              }}
            />
            <div style={{ maxHeight: '240px', overflowY: 'auto', borderRadius: '8px', border: '0.5px solid var(--br)', overflow: 'hidden' }}>
              {mergePickerResults.length === 0 ? (
                <div style={{ padding: '12px', fontSize: '13px', color: 'var(--tm)', textAlign: 'center' }}>
                  {mergeSearch ? 'No matches' : 'Type to search…'}
                </div>
              ) : mergePickerResults.map((c, i) => (
                <button
                  key={c.id}
                  onClick={() => pickManualMerge(mergePickerIdx, c.id)}
                  style={{
                    width: '100%', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '9px 12px', background: 'none', border: 'none',
                    borderTop: i > 0 ? '0.5px solid var(--br)' : 'none',
                    cursor: 'pointer', fontFamily: 'inherit',
                    color: 'var(--tp)', fontSize: '13px',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--dkc)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ fontSize: '16px' }}>{c.emoji ?? '🥄'}</span>
                  <span>{c.name}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setMergePickerIdx(null); setMergeSearch('') }}
              style={{
                width: '100%', marginTop: '10px',
                background: 'none', border: '0.5px solid var(--brh)',
                borderRadius: '9px', padding: '8px',
                color: 'var(--ts)', fontSize: '13px',
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* Pinned bottom bar */}
      <div
        style={{
          position: 'fixed',
          bottom: 0, left: 0, right: 0,
          backgroundColor: 'var(--dk2)',
          borderTop: '0.5px solid var(--br)',
          padding: '12px 16px',
          display: 'flex',
          gap: '10px',
        }}
      >
        <button
          onClick={() => navigate(-1)}
          style={{
            flex: 0,
            padding: '12px 16px',
            backgroundColor: 'transparent',
            border: '0.5px solid var(--br)',
            borderRadius: '11px',
            color: 'var(--ts)',
            fontSize: '13px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Edit text
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          style={{
            flex: 1,
            padding: '12px',
            backgroundColor: saving || !name.trim() ? 'var(--dk3)' : 'var(--am)',
            color: saving || !name.trim() ? 'var(--tm)' : '#1a1612',
            border: 'none',
            borderRadius: '11px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: saving || !name.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Save recipe'}
        </button>
      </div>
    </div>
  )
}

// ── Small UI helpers ───────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '20px 16px 0' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>
        {title}
      </div>
      <div style={{ backgroundColor: 'var(--dkc)', border: '0.5px solid var(--br)', borderRadius: '12px', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--br)' }}>
      <div style={{ fontSize: '10px', color: 'var(--ts)', marginBottom: '5px', fontWeight: 500 }}>{label}</div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: 'var(--dk3)',
  border: '0.5px solid var(--brh)',
  borderRadius: '8px',
  padding: '8px 10px',
  fontSize: '13px',
  color: 'var(--tp)',
  outline: 'none',
  fontFamily: 'inherit',
}
