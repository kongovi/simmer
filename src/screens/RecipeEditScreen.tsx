import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Plus, Trash2 } from 'lucide-react'
import { useRecipe, useRecipeIngredients, useRecipeSteps, useUpdateRecipe } from '../hooks/useRecipes'
import { useIngredientsCatalog, matchIngredient } from '../hooks/useIngredientsCatalog'

interface EditIngredient {
  catalogId:    string | undefined
  name:         string
  emoji:        string
  quantity:     number | null
  unit:         string | null
  prep_note:    string | null
  serving_note: string | null
}

interface EditStep {
  step_number: number
  instruction: string
}

export function RecipeEditScreen() {
  const { id }     = useParams<{ id: string }>()
  const navigate   = useNavigate()

  const { data: recipe,      isLoading: rLoading } = useRecipe(id)
  const { data: dbIngredients, isLoading: iLoading } = useRecipeIngredients(id)
  const { data: dbSteps,     isLoading: sLoading }  = useRecipeSteps(id)
  const { data: catalog = [] } = useIngredientsCatalog()
  const updateRecipe = useUpdateRecipe()

  // Editable fields — initialised once data arrives
  const [name,        setName]        = useState('')
  const [servings,    setServings]    = useState(4)
  const [cookTime,    setCookTime]    = useState('')
  const [mealType,    setMealType]    = useState('')
  const [ingredients, setIngredients] = useState<EditIngredient[]>([])
  const [steps,       setSteps]       = useState<EditStep[]>([])
  const [initialized, setInitialized] = useState(false)

  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)

  // Populate state once all data is loaded
  useEffect(() => {
    if (initialized || !recipe || !dbIngredients || !dbSteps) return
    setName(recipe.name)
    setServings(recipe.servings ?? 4)
    setCookTime(recipe.cook_time_minutes != null ? String(recipe.cook_time_minutes) : '')
    setMealType((recipe as { meal_type?: string }).meal_type ?? '')
    setIngredients(
      (dbIngredients as Array<{
        ingredient: { id: string; name: string; emoji: string | null } | null
        quantity:     number | null
        unit:         string | null
        prep_note:    string | null
        serving_note: string | null
      }>).map(row => ({
        catalogId:   row.ingredient?.id ?? undefined,
        name:        row.ingredient?.name ?? '',
        emoji:       row.ingredient?.emoji ?? '🥄',
        quantity:    row.quantity,
        unit:        row.unit,
        prep_note:   row.prep_note,
        serving_note: row.serving_note,
      }))
    )
    setSteps(
      (dbSteps as Array<{ step_number: number; instruction: string }>)
        .map(s => ({ step_number: s.step_number, instruction: s.instruction }))
    )
    setInitialized(true)
  }, [recipe, dbIngredients, dbSteps, initialized])

  const isLoading = rLoading || iLoading || sLoading

  if (isLoading || !initialized) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: 'var(--dk)' }}>
        <span style={{ fontSize: '13px', color: 'var(--ts)' }}>Loading…</span>
      </div>
    )
  }

  if (!recipe) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: 'var(--dk)' }}>
        <span style={{ fontSize: '13px', color: 'var(--ts)' }}>Recipe not found</span>
      </div>
    )
  }

  // ── Ingredient helpers ──────────────────────────────────────────────────────

  function updateIngQty(idx: number, val: string) {
    setIngredients(prev => prev.map((ing, i) =>
      i === idx ? { ...ing, quantity: val ? parseFloat(val) : null } : ing
    ))
  }
  function updateIngUnit(idx: number, val: string) {
    setIngredients(prev => prev.map((ing, i) =>
      i === idx ? { ...ing, unit: val || null } : ing
    ))
  }
  function updateIngPrepNote(idx: number, val: string) {
    setIngredients(prev => prev.map((ing, i) =>
      i === idx ? { ...ing, prep_note: val || null } : ing
    ))
  }
  function removeIngredient(idx: number) {
    setIngredients(prev => prev.filter((_, i) => i !== idx))
  }
  function addIngredient() {
    setIngredients(prev => [...prev, { catalogId: undefined, name: '', emoji: '🥄', quantity: null, unit: null, prep_note: null, serving_note: null }])
  }
  function updateIngName(idx: number, val: string) {
    const match = matchIngredient(val, catalog)
    setIngredients(prev => prev.map((ing, i) =>
      i === idx ? {
        ...ing,
        name:      val,
        catalogId: match?.id ?? undefined,
        emoji:     match?.emoji ?? ing.emoji,
      } : ing
    ))
  }

  // ── Step helpers ────────────────────────────────────────────────────────────

  function updateStep(idx: number, instruction: string) {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, instruction } : s))
  }
  function addStep() {
    setSteps(prev => [...prev, { step_number: prev.length + 1, instruction: '' }])
  }
  function removeStep(idx: number) {
    setSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_number: i + 1 })))
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!name.trim() || !id) return
    setSaving(true)
    setSaveError(null)
    try {
      await updateRecipe.mutateAsync({
        id,
        name: name.trim(),
        servings,
        cook_time_minutes: cookTime ? parseInt(cookTime) : null,
        meal_type: mealType || null,
        tags: (recipe as { tags?: string[] }).tags ?? [],
        difficulty: (recipe as { difficulty?: string }).difficulty ?? null,
        ingredients: ingredients.filter(ing => ing.name.trim()).map(ing => ({
          catalogId:    ing.catalogId,
          name:         ing.name,
          emoji:        ing.emoji,
          quantity:     ing.quantity,
          unit:         ing.unit,
          prep_note:    ing.prep_note,
          serving_note: ing.serving_note,
        })),
        steps: steps.filter(s => s.instruction.trim()),
      })
      navigate(`/recipes/${id}`, { replace: true })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save changes')
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
            onClick={() => navigate(`/recipes/${id}`)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ts)', padding: '4px' }}
          >
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '17px', fontWeight: 600, color: 'var(--tp)' }}>Edit recipe</div>
            <div style={{ fontSize: '11px', color: 'var(--ts)', marginTop: '1px' }}>{recipe.name}</div>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '10px 14px', borderBottom: '0.5px solid var(--br)' }}>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--ts)', marginBottom: '5px', fontWeight: 500 }}>Servings</div>
              <input
                type="number"
                value={servings}
                onChange={e => setServings(parseInt(e.target.value) || 4)}
                min={1}
                style={inputStyle}
              />
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--ts)', marginBottom: '5px', fontWeight: 500 }}>Cook time (min)</div>
              <input
                type="number"
                value={cookTime}
                onChange={e => setCookTime(e.target.value)}
                placeholder="45"
                style={inputStyle}
              />
            </div>
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
        <Section title="Ingredients">
          {ingredients.map((ing, idx) => {
            const catalogMatch = matchIngredient(ing.name, catalog)
            const isNew        = !catalogMatch && !ing.catalogId

            return (
              <div
                key={idx}
                style={{
                  padding: '10px 14px',
                  borderBottom: '0.5px solid var(--br)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                {/* Name row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '16px', flexShrink: 0 }}>{ing.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        value={ing.name}
                        onChange={e => updateIngName(idx, e.target.value)}
                        placeholder="Ingredient name"
                        style={{ ...inputStyle, padding: '4px 8px', fontSize: '13px' }}
                      />
                      {!isNew && (
                        <Check size={12} color="var(--gl)" style={{ flexShrink: 0 }} />
                      )}
                      {isNew && ing.name.trim() && (
                        <span style={{ fontSize: '9px', color: 'var(--gl)', backgroundColor: 'rgba(93,202,165,0.12)', borderRadius: '3px', padding: '1px 4px', flexShrink: 0 }}>
                          + new
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => removeIngredient(idx)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: '2px', flexShrink: 0 }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {/* Qty + unit + prep row */}
                <div style={{ display: 'flex', gap: '6px', paddingLeft: '24px' }}>
                  <input
                    type="number"
                    value={ing.quantity ?? ''}
                    onChange={e => updateIngQty(idx, e.target.value)}
                    placeholder="Qty"
                    style={{ ...inputStyle, width: '64px', padding: '3px 7px', fontSize: '12px' }}
                  />
                  <input
                    value={ing.unit ?? ''}
                    onChange={e => updateIngUnit(idx, e.target.value)}
                    placeholder="unit"
                    style={{ ...inputStyle, width: '72px', padding: '3px 7px', fontSize: '12px' }}
                  />
                  <input
                    value={ing.prep_note ?? ''}
                    onChange={e => updateIngPrepNote(idx, e.target.value)}
                    placeholder="prep note"
                    style={{ ...inputStyle, flex: 1, padding: '3px 7px', fontSize: '12px' }}
                  />
                </div>
              </div>
            )
          })}

          {/* Add ingredient */}
          <button
            onClick={addIngredient}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              width: '100%', padding: '11px 14px',
              background: 'none', border: 'none',
              cursor: 'pointer', fontSize: '12px', color: 'var(--ts)',
            }}
          >
            <Plus size={13} /> Add ingredient
          </button>
        </Section>

        {/* Steps */}
        <Section title="Steps">
          {steps.map((step, idx) => (
            <div
              key={idx}
              style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--br)' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--am)', letterSpacing: '0.8px', paddingTop: '3px', flexShrink: 0, minWidth: '40px' }}>
                  STEP {step.step_number}
                </div>
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={e => updateStep(idx, e.currentTarget.textContent ?? '')}
                  style={{
                    flex: 1, fontSize: '13px', color: 'var(--tp)',
                    lineHeight: 1.5, outline: 'none', minHeight: '20px',
                  }}
                >
                  {step.instruction}
                </div>
                <button
                  onClick={() => removeStep(idx)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: '2px', flexShrink: 0 }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}

          <button
            onClick={addStep}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              width: '100%', padding: '11px 14px',
              background: 'none', border: 'none',
              borderTop: steps.length > 0 ? '0.5px solid var(--br)' : 'none',
              cursor: 'pointer', fontSize: '12px', color: 'var(--ts)',
            }}
          >
            <Plus size={13} /> Add a step
          </button>
        </Section>

        {saveError && (
          <p style={{ fontSize: '12px', color: 'var(--rd)', padding: '0 16px 12px', margin: 0 }}>
            {saveError}
          </p>
        )}
      </div>

      {/* Pinned bottom bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        backgroundColor: 'var(--dk2)', borderTop: '0.5px solid var(--br)',
        padding: '12px 16px', display: 'flex', gap: '10px',
      }}>
        <button
          onClick={() => navigate(`/recipes/${id}`)}
          style={{
            flex: 0, padding: '12px 16px',
            backgroundColor: 'transparent',
            border: '0.5px solid var(--br)', borderRadius: '11px',
            color: 'var(--ts)', fontSize: '13px',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          style={{
            flex: 1, padding: '12px',
            backgroundColor: saving || !name.trim() ? 'var(--dk3)' : 'var(--am)',
            color: saving || !name.trim() ? 'var(--tm)' : '#1a1612',
            border: 'none', borderRadius: '11px',
            fontSize: '14px', fontWeight: 600,
            cursor: saving || !name.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

// ── Small UI helpers ────────────────────────────────────────────────────────

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
  boxSizing: 'border-box',
}
