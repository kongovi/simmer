import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Plus, Trash2, Columns } from 'lucide-react'
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
  section:      string | null
}

interface EditStep {
  step_number: number
  instruction: string
  section:     string | null
}

// ── Grouping helper (same logic as RecipeReviewScreen) ─────────────────────────
function groupBySection<T extends { section?: string | null }>(
  items: T[],
  components: string[]
): Array<{ section: string | null; items: Array<{ item: T; idx: number }> }> {
  const buckets = new Map<string | null, Array<{ item: T; idx: number }>>()
  buckets.set(null, [])
  for (const c of components) buckets.set(c, [])

  items.forEach((item, idx) => {
    const sec = item.section ?? null
    const bucket = buckets.get(sec) ?? buckets.get(null)!
    bucket.push({ item, idx })
  })

  const result: Array<{ section: string | null; items: Array<{ item: T; idx: number }> }> = []
  const nullItems = buckets.get(null)!
  if (nullItems.length > 0 || components.length === 0) result.push({ section: null, items: nullItems })
  for (const c of components) result.push({ section: c, items: buckets.get(c)! })
  return result
}

export function RecipeEditScreen() {
  const { id }     = useParams<{ id: string }>()
  const navigate   = useNavigate()

  const { data: recipe,         isLoading: rLoading } = useRecipe(id)
  const { data: dbIngredients,  isLoading: iLoading } = useRecipeIngredients(id)
  const { data: dbSteps,        isLoading: sLoading } = useRecipeSteps(id)
  const { data: catalog = [] } = useIngredientsCatalog()
  const updateRecipe = useUpdateRecipe()

  const [name,        setName]        = useState('')
  const [servings,    setServings]    = useState(4)
  const [cookTime,    setCookTime]    = useState('')
  const [mealType,    setMealType]    = useState('')
  const [ingredients, setIngredients] = useState<EditIngredient[]>([])
  const [steps,       setSteps]       = useState<EditStep[]>([])
  const [components,  setComponents]  = useState<string[]>([])
  const [initialized, setInitialized] = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [saveError,   setSaveError]   = useState<string | null>(null)

  // "Add section" inline inputs
  const [newSectionDraft,   setNewSectionDraft]   = useState('')
  const [addingSectionFor,  setAddingSectionFor]  = useState<'ingredients' | 'steps' | null>(null)

  // Populate state once all data is loaded
  useEffect(() => {
    if (initialized || !recipe || !dbIngredients || !dbSteps) return

    setName(recipe.name)
    setServings(recipe.servings ?? 4)
    setCookTime(recipe.cook_time_minutes != null ? String(recipe.cook_time_minutes) : '')
    setMealType((recipe as { meal_type?: string }).meal_type ?? '')

    const loadedIngredients = (dbIngredients as Array<{
      ingredient: { id: string; name: string; emoji: string | null } | null
      quantity:     number | null
      unit:         string | null
      prep_note:    string | null
      serving_note: string | null
      section:      string | null
    }>).map(row => ({
      catalogId:    row.ingredient?.id ?? undefined,
      name:         row.ingredient?.name ?? '',
      emoji:        row.ingredient?.emoji ?? '🥄',
      quantity:     row.quantity,
      unit:         row.unit,
      prep_note:    row.prep_note,
      serving_note: row.serving_note,
      section:      row.section ?? null,
    }))

    const loadedSteps = (dbSteps as Array<{
      step_number: number
      instruction: string
      section:     string | null
    }>).map(s => ({
      step_number: s.step_number,
      instruction: s.instruction,
      section:     s.section ?? null,
    }))

    setIngredients(loadedIngredients)
    setSteps(loadedSteps)

    // Derive ordered section list from existing data
    const seen = new Set<string>()
    const orderedSections: string[] = []
    ;[...loadedIngredients, ...loadedSteps].forEach(item => {
      if (item.section && !seen.has(item.section)) {
        seen.add(item.section)
        orderedSections.push(item.section)
      }
    })
    setComponents(orderedSections)

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

  // ── Section management ──────────────────────────────────────────────────────

  function renameSection(oldName: string, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) return
    setComponents(prev => prev.map(c => c === oldName ? trimmed : c))
    setIngredients(prev => prev.map(ing => ing.section === oldName ? { ...ing, section: trimmed } : ing))
    setSteps(prev => prev.map(s => s.section === oldName ? { ...s, section: trimmed } : s))
  }
  function deleteSection(name: string) {
    setComponents(prev => prev.filter(c => c !== name))
    setIngredients(prev => prev.map(ing => ing.section === name ? { ...ing, section: null } : ing))
    setSteps(prev => prev.map(s => s.section === name ? { ...s, section: null } : s))
  }
  function addSection(sectionName: string) {
    const trimmed = sectionName.trim()
    if (!trimmed || components.includes(trimmed)) return
    setComponents(prev => [...prev, trimmed])
  }
  function commitNewSection() {
    if (newSectionDraft.trim()) addSection(newSectionDraft)
    setNewSectionDraft('')
    setAddingSectionFor(null)
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
  function updateIngSection(idx: number, section: string | null) {
    setIngredients(prev => prev.map((ing, i) =>
      i === idx ? { ...ing, section } : ing
    ))
  }
  function removeIngredient(idx: number) {
    setIngredients(prev => prev.filter((_, i) => i !== idx))
  }
  function addIngredient(section: string | null = null) {
    setIngredients(prev => [...prev, {
      catalogId: undefined, name: '', emoji: '🥄',
      quantity: null, unit: null, prep_note: null, serving_note: null, section,
    }])
  }
  function updateIngName(idx: number, val: string) {
    const match = matchIngredient(val, catalog)
    setIngredients(prev => prev.map((ing, i) =>
      i === idx ? { ...ing, name: val, catalogId: match?.id ?? undefined, emoji: match?.emoji ?? ing.emoji } : ing
    ))
  }

  // ── Step helpers ────────────────────────────────────────────────────────────

  function updateStep(idx: number, instruction: string) {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, instruction } : s))
  }
  function updateStepSection(idx: number, section: string | null) {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, section } : s))
  }
  function addStep(section: string | null = null) {
    setSteps(prev => [...prev, { step_number: prev.length + 1, instruction: '', section }])
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
          section:      ing.section,
        })),
        steps: steps.filter(s => s.instruction.trim()).map(s => ({
          step_number: s.step_number,
          instruction: s.instruction,
          section:     s.section,
        })),
      })
      navigate(`/recipes/${id}`, { replace: true })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save changes')
      setSaving(false)
    }
  }

  // ── Section picker shared style ─────────────────────────────────────────────
  const sectionSelectStyle: React.CSSProperties = {
    background: 'var(--dk3)', border: '0.5px solid var(--br)',
    borderRadius: '6px', padding: '3px 6px',
    fontSize: '11px', color: 'var(--tm)',
    fontFamily: 'inherit', outline: 'none',
    cursor: 'pointer', appearance: 'none',
    maxWidth: '90px',
  }
  const SectionSelect = ({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) =>
    components.length === 0 ? null : (
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        style={sectionSelectStyle}
        title="Move to section"
      >
        <option value="">— no section</option>
        {components.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--dk)' }}>
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
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Recipe name" style={inputStyle} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', padding: '10px 14px', borderBottom: '0.5px solid var(--br)' }}>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--ts)', marginBottom: '5px', fontWeight: 500 }}>Servings</div>
              <input type="number" value={servings} onChange={e => setServings(parseInt(e.target.value) || 4)} min={1} style={inputStyle} />
            </div>
            <div>
              <div style={{ fontSize: '10px', color: 'var(--ts)', marginBottom: '5px', fontWeight: 500 }}>Cook time (min)</div>
              <input type="number" value={cookTime} onChange={e => setCookTime(e.target.value)} placeholder="45" style={inputStyle} />
            </div>
          </div>
          <Field label="Meal type">
            <select value={mealType} onChange={e => setMealType(e.target.value)} style={{ ...inputStyle, appearance: 'none' }}>
              <option value="">—</option>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
            </select>
          </Field>
        </Section>

        {/* Ingredients */}
        <Section title="Ingredients">
          {groupBySection(ingredients, components).flatMap(({ section, items }) => {
            const rows: React.ReactNode[] = []

            if (section !== null) {
              rows.push(
                <SectionDivider
                  key={`ing-sec-${section}`}
                  name={section}
                  onRename={n => renameSection(section, n)}
                  onDelete={() => deleteSection(section)}
                />
              )
            }

            items.forEach(({ idx }, itemIdx) => {
              const ing = ingredients[idx]
              const catalogMatch = matchIngredient(ing.name, catalog)
              const isNew = !catalogMatch && !ing.catalogId
              rows.push(
                <div
                  key={idx}
                  style={{
                    padding: '10px 14px',
                    borderBottom: itemIdx < items.length - 1 ? '0.5px solid var(--br)' : 'none',
                    display: 'flex', flexDirection: 'column', gap: '6px',
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
                        {!isNew && ing.name.trim() && <Check size={12} color="var(--gl)" style={{ flexShrink: 0 }} />}
                        {isNew && ing.name.trim() && (
                          <span style={{ fontSize: '9px', color: 'var(--gl)', backgroundColor: 'rgba(93,202,165,0.12)', borderRadius: '3px', padding: '1px 4px', flexShrink: 0 }}>
                            + new
                          </span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => removeIngredient(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: '2px', flexShrink: 0 }}>
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* Qty + unit + prep note + section picker */}
                  <div style={{ display: 'flex', gap: '6px', paddingLeft: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <input
                      type="number"
                      value={ing.quantity ?? ''}
                      onChange={e => updateIngQty(idx, e.target.value)}
                      placeholder="Qty"
                      style={{ ...inputStyle, width: '60px', padding: '3px 7px', fontSize: '12px' }}
                    />
                    <input
                      value={ing.unit ?? ''}
                      onChange={e => updateIngUnit(idx, e.target.value)}
                      placeholder="unit"
                      style={{ ...inputStyle, width: '68px', padding: '3px 7px', fontSize: '12px' }}
                    />
                    <input
                      value={ing.prep_note ?? ''}
                      onChange={e => updateIngPrepNote(idx, e.target.value)}
                      placeholder="prep note"
                      style={{ ...inputStyle, flex: 1, minWidth: '80px', padding: '3px 7px', fontSize: '12px' }}
                    />
                    <SectionSelect value={ing.section} onChange={v => updateIngSection(idx, v)} />
                  </div>
                </div>
              )
            })

            // Per-section "Add ingredient" button
            rows.push(
              <button
                key={`add-ing-${section ?? '__none'}`}
                onClick={() => addIngredient(section)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  width: '100%', padding: '8px 14px 8px 38px',
                  background: 'none', border: 'none',
                  borderTop: items.length > 0 ? '0.5px solid var(--br)' : 'none',
                  cursor: 'pointer', fontSize: '11px', color: 'var(--tm)',
                }}
              >
                <Plus size={11} />
                {section ? `Add to ${section}` : 'Add ingredient'}
              </button>
            )

            return rows
          })}

          {/* Add section footer */}
          {addingSectionFor === 'ingredients' ? (
            <div style={{ display: 'flex', gap: '6px', padding: '9px 14px', borderTop: '0.5px solid var(--br)' }}>
              <input
                autoFocus
                value={newSectionDraft}
                onChange={e => setNewSectionDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitNewSection(); if (e.key === 'Escape') { setNewSectionDraft(''); setAddingSectionFor(null) } }}
                placeholder="Section name (e.g. Dough)"
                style={{ flex: 1, background: 'var(--dk3)', border: '0.5px solid var(--brh)', borderRadius: '7px', padding: '6px 9px', fontSize: '12px', color: 'var(--tp)', fontFamily: 'inherit', outline: 'none' }}
              />
              <button onClick={commitNewSection} style={{ background: 'var(--am)', border: 'none', borderRadius: '7px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, color: '#1a1612', cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
              <button onClick={() => { setNewSectionDraft(''); setAddingSectionFor(null) }} style={{ background: 'none', border: '0.5px solid var(--br)', borderRadius: '7px', padding: '6px 10px', fontSize: '12px', color: 'var(--ts)', cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
            </div>
          ) : (
            <button
              onClick={() => setAddingSectionFor('ingredients')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', padding: '9px 14px', background: 'none', border: 'none', borderTop: '0.5px solid var(--br)', cursor: 'pointer', fontSize: '11px', color: 'var(--tm)' }}
            >
              <Columns size={11} /> Add section
            </button>
          )}
        </Section>

        {/* Steps */}
        <Section title="Steps">
          {groupBySection(steps, components).flatMap(({ section, items }) => {
            const rows: React.ReactNode[] = []

            if (section !== null) {
              rows.push(
                <SectionDivider
                  key={`step-sec-${section}`}
                  name={section}
                  onRename={n => renameSection(section, n)}
                  onDelete={() => deleteSection(section)}
                />
              )
            }

            items.forEach(({ idx }, itemIdx) => {
              const step = steps[idx]
              rows.push(
                <div
                  key={idx}
                  style={{ padding: '10px 14px', borderBottom: itemIdx < items.length - 1 ? '0.5px solid var(--br)' : 'none' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--am)', letterSpacing: '0.8px', paddingTop: '3px', flexShrink: 0, minWidth: '40px' }}>
                      STEP {step.step_number}
                    </div>
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={e => updateStep(idx, e.currentTarget.textContent ?? '')}
                      style={{ flex: 1, fontSize: '13px', color: 'var(--tp)', lineHeight: 1.5, outline: 'none', minHeight: '20px' }}
                    >
                      {step.instruction}
                    </div>
                    <button onClick={() => removeStep(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: '2px', flexShrink: 0 }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {components.length > 0 && (
                    <div style={{ paddingLeft: '48px', marginTop: '5px' }}>
                      <SectionSelect value={step.section} onChange={v => updateStepSection(idx, v)} />
                    </div>
                  )}
                </div>
              )
            })

            // Per-section "Add step" button
            rows.push(
              <button
                key={`add-step-${section ?? '__none'}`}
                onClick={() => addStep(section)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  width: '100%', padding: '8px 14px 8px 52px',
                  background: 'none', border: 'none',
                  borderTop: items.length > 0 ? '0.5px solid var(--br)' : 'none',
                  cursor: 'pointer', fontSize: '11px', color: 'var(--tm)',
                }}
              >
                <Plus size={11} />
                {section ? `Add step to ${section}` : 'Add a step'}
              </button>
            )

            return rows
          })}

          {/* Add section footer */}
          {addingSectionFor === 'steps' ? (
            <div style={{ display: 'flex', gap: '6px', padding: '9px 14px', borderTop: '0.5px solid var(--br)' }}>
              <input
                autoFocus
                value={newSectionDraft}
                onChange={e => setNewSectionDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitNewSection(); if (e.key === 'Escape') { setNewSectionDraft(''); setAddingSectionFor(null) } }}
                placeholder="Section name (e.g. Sauce)"
                style={{ flex: 1, background: 'var(--dk3)', border: '0.5px solid var(--brh)', borderRadius: '7px', padding: '6px 9px', fontSize: '12px', color: 'var(--tp)', fontFamily: 'inherit', outline: 'none' }}
              />
              <button onClick={commitNewSection} style={{ background: 'var(--am)', border: 'none', borderRadius: '7px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, color: '#1a1612', cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
              <button onClick={() => { setNewSectionDraft(''); setAddingSectionFor(null) }} style={{ background: 'none', border: '0.5px solid var(--br)', borderRadius: '7px', padding: '6px 10px', fontSize: '12px', color: 'var(--ts)', cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
            </div>
          ) : (
            <button
              onClick={() => setAddingSectionFor('steps')}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', padding: '9px 14px', background: 'none', border: 'none', borderTop: '0.5px solid var(--br)', cursor: 'pointer', fontSize: '11px', color: 'var(--tm)' }}
            >
              <Columns size={11} /> Add section
            </button>
          )}
        </Section>

        {saveError && (
          <p style={{ fontSize: '12px', color: 'var(--rd)', padding: '0 16px 12px', margin: 0 }}>{saveError}</p>
        )}
      </div>

      {/* Pinned bottom bar */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: 'var(--dk2)', borderTop: '0.5px solid var(--br)', padding: '12px 16px', display: 'flex', gap: '10px' }}>
        <button
          onClick={() => navigate(`/recipes/${id}`)}
          style={{ flex: 0, padding: '12px 16px', backgroundColor: 'transparent', border: '0.5px solid var(--br)', borderRadius: '11px', color: 'var(--ts)', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap' }}
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

// ── Section divider (editable) ──────────────────────────────────────────────
function SectionDivider({ name, onRename, onDelete }: {
  name: string
  onRename: (newName: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(name)

  function commit() { onRename(draft.trim() || name); setEditing(false) }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '6px 14px',
      borderTop: '0.5px solid var(--br)', borderBottom: '0.5px solid var(--br)',
      backgroundColor: 'rgba(255,255,255,0.025)',
    }}>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setDraft(name); setEditing(false) } }}
          style={{
            flex: 1, background: 'none', border: 'none',
            borderBottom: '0.5px solid var(--am)',
            outline: 'none', padding: '0 0 1px',
            fontSize: '10px', fontWeight: 700, color: 'var(--ts)',
            letterSpacing: '0.7px', textTransform: 'uppercase', fontFamily: 'inherit',
          }}
        />
      ) : (
        <div
          onClick={() => { setDraft(name); setEditing(true) }}
          style={{ flex: 1, fontSize: '10px', fontWeight: 700, color: 'var(--tm)', letterSpacing: '0.7px', textTransform: 'uppercase', cursor: 'text' }}
        >
          {name}
        </div>
      )}
      <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: '2px', flexShrink: 0 }} title="Remove section">
        <Trash2 size={11} />
      </button>
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
