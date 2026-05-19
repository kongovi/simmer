import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Plus, Trash2, Columns, GripVertical } from 'lucide-react'
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
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

  // Drag-and-drop
  const [activeIngDrag,     setActiveIngDrag]     = useState<number | null>(null)
  const [activeStepDrag,    setActiveStepDrag]    = useState<number | null>(null)
  const [activeSectionDrag, setActiveSectionDrag] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as string
    if (id.startsWith('ing-'))     setActiveIngDrag(parseInt(id.replace('ing-', '')))
    else if (id.startsWith('step-')) setActiveStepDrag(parseInt(id.replace('step-', '')))
    else if (id.startsWith('ing-section-') || id.startsWith('step-section-')) setActiveSectionDrag(id)
  }

  function handleDragEnd_Ing(event: DragEndEvent) {
    setActiveIngDrag(null)
    setActiveSectionDrag(null)
    const { active, over } = event
    if (!over) return
    const activeId = active.id as string
    const overId   = over.id as string

    // Section tile reorder
    if (activeId.startsWith('ing-section-')) {
      const from = activeId.replace('ing-section-', '')
      const to   = overId.startsWith('ing-section-') ? overId.replace('ing-section-', '')
                 : overId.startsWith('ing-drop-') && overId !== 'ing-drop-null' ? overId.replace('ing-drop-', '')
                 : null
      if (to && to !== from) {
        setComponents(prev => arrayMove(prev, prev.indexOf(from), prev.indexOf(to!)))
      }
      return
    }

    // Ingredient cross-section move
    const idx = parseInt(activeId.replace('ing-', ''))
    if (isNaN(idx)) return
    const rawSection = overId === 'ing-drop-null' ? null : overId.replace('ing-drop-', '')
    updateIngSection(idx, rawSection)
  }

  function handleDragEnd_Step(event: DragEndEvent) {
    setActiveStepDrag(null)
    setActiveSectionDrag(null)
    const { active, over } = event
    if (!over) return
    const activeId = active.id as string
    const overId   = over.id as string

    // Section tile reorder
    if (activeId.startsWith('step-section-')) {
      const from = activeId.replace('step-section-', '')
      const to   = overId.startsWith('step-section-') ? overId.replace('step-section-', '')
                 : overId.startsWith('step-drop-') && overId !== 'step-drop-null' ? overId.replace('step-drop-', '')
                 : null
      if (to && to !== from) {
        setComponents(prev => arrayMove(prev, prev.indexOf(from), prev.indexOf(to!)))
      }
      return
    }

    // Step cross-section move
    const idx = parseInt(activeId.replace('step-', ''))
    if (isNaN(idx)) return
    const rawSection = overId === 'step-drop-null' ? null : overId.replace('step-drop-', '')
    updateStepSection(idx, rawSection)
  }

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

  function selectCatalogItem(idx: number, item: { id: string; name: string; emoji: string }) {
    setIngredients(prev => prev.map((ing, i) =>
      i === idx ? { ...ing, name: item.name, catalogId: item.id, emoji: item.emoji } : ing
    ))
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

  // SectionChips is defined outside the component (see bottom of file)

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
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>Ingredients</div>
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd_Ing}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {groupBySection(ingredients, components).map(({ section, items }) => {
                const dropId = section === null ? 'ing-drop-null' : `ing-drop-${section}`
                const secDragId = section !== null ? `ing-section-${section}` : null
                return (
                  <IngDropZone key={section ?? '__none'} dropId={dropId} sectionDragId={secDragId}>
                    {/* Section header with sort handle */}
                    {section !== null && (
                      <SectionDivider
                        name={section}
                        onRename={n => renameSection(section, n)}
                        onDelete={() => deleteSection(section)}
                        sortHandle={<SectionDragHandle dragId={`ing-section-${section}`} />}
                      />
                    )}
                    {/* Ingredient rows */}
                    {items.map(({ idx }, itemIdx) => {
                      const ing = ingredients[idx]
                      const catalogMatch = matchIngredient(ing.name, catalog)
                      const isNew = !catalogMatch && !ing.catalogId
                      return (
                        <DraggableIngRow
                          key={idx}
                          dragId={`ing-${idx}`}
                          idx={idx}
                          ing={ing}
                          isNew={isNew}
                          isLast={itemIdx === items.length - 1}
                          components={components}
                          catalog={catalog}
                          onUpdateName={updateIngName}
                          onUpdateQty={updateIngQty}
                          onUpdateUnit={updateIngUnit}
                          onUpdatePrepNote={updateIngPrepNote}
                          onUpdateSection={updateIngSection}
                          onSelectCatalog={selectCatalogItem}
                          onRemove={removeIngredient}
                        />
                      )
                    })}
                    {/* Per-section add button */}
                    <button
                      onClick={() => addIngredient(section)}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', width: '100%', padding: '8px 14px 8px 38px', background: 'none', border: 'none', borderTop: items.length > 0 ? '0.5px solid var(--br)' : 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--tm)' }}
                    >
                      <Plus size={11} />
                      {section ? `Add to ${section}` : 'Add ingredient'}
                    </button>
                  </IngDropZone>
                )
              })}
            </div>
            <DragOverlay>
              {activeIngDrag !== null && ingredients[activeIngDrag] ? (
                <div style={{ backgroundColor: 'var(--dkc)', border: '0.5px solid var(--am)', borderRadius: '10px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.95, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
                  <GripVertical size={13} color="var(--tm)" />
                  <span style={{ fontSize: '15px' }}>{ingredients[activeIngDrag].emoji}</span>
                  <span style={{ fontSize: '13px', color: 'var(--tp)' }}>{ingredients[activeIngDrag].name || 'Ingredient'}</span>
                </div>
              ) : activeSectionDrag?.startsWith('ing-section-') ? (
                <div style={{ backgroundColor: 'var(--dkc)', border: '0.5px solid var(--am)', borderRadius: '10px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.95, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
                  <GripVertical size={13} color="var(--am)" />
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--am)', letterSpacing: '0.7px', textTransform: 'uppercase' }}>{activeSectionDrag.replace('ing-section-', '')}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          {/* Add section footer */}
          <div style={{ marginTop: '10px' }}>
            {addingSectionFor === 'ingredients' ? (
              <div style={{ display: 'flex', gap: '6px' }}>
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
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--tm)' }}
              >
                <Columns size={11} /> Add section
              </button>
            )}
          </div>
        </div>

        {/* Steps */}
        <div style={{ padding: '20px 16px 0' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>Steps</div>
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd_Step}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {groupBySection(steps, components).map(({ section, items }) => {
                const dropId = section === null ? 'step-drop-null' : `step-drop-${section}`
                const secDragId = section !== null ? `step-section-${section}` : null
                return (
                  <StepDropZone key={section ?? '__none'} dropId={dropId} sectionDragId={secDragId}>
                    {section !== null && (
                      <SectionDivider
                        name={section}
                        onRename={n => renameSection(section, n)}
                        onDelete={() => deleteSection(section)}
                        sortHandle={<SectionDragHandle dragId={`step-section-${section}`} />}
                      />
                    )}
                    {items.map(({ idx }, itemIdx) => {
                      const step = steps[idx]
                      return (
                        <DraggableStepRow
                          key={idx}
                          dragId={`step-${idx}`}
                          idx={idx}
                          step={step}
                          isLast={itemIdx === items.length - 1}
                          components={components}
                          onUpdate={updateStep}
                          onUpdateSection={updateStepSection}
                          onRemove={removeStep}
                        />
                      )
                    })}
                    <button
                      onClick={() => addStep(section)}
                      style={{ display: 'flex', alignItems: 'center', gap: '5px', width: '100%', padding: '8px 14px 8px 52px', background: 'none', border: 'none', borderTop: items.length > 0 ? '0.5px solid var(--br)' : 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--tm)' }}
                    >
                      <Plus size={11} />
                      {section ? `Add step to ${section}` : 'Add a step'}
                    </button>
                  </StepDropZone>
                )
              })}
            </div>
            <DragOverlay>
              {activeStepDrag !== null && steps[activeStepDrag] ? (
                <div style={{ backgroundColor: 'var(--dkc)', border: '0.5px solid var(--am)', borderRadius: '10px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.95, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
                  <GripVertical size={13} color="var(--tm)" />
                  <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--am)', letterSpacing: '0.8px' }}>STEP {steps[activeStepDrag].step_number}</span>
                  <span style={{ fontSize: '13px', color: 'var(--tp)', flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{steps[activeStepDrag].instruction}</span>
                </div>
              ) : activeSectionDrag?.startsWith('step-section-') ? (
                <div style={{ backgroundColor: 'var(--dkc)', border: '0.5px solid var(--am)', borderRadius: '10px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px', opacity: 0.95, boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
                  <GripVertical size={13} color="var(--am)" />
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--am)', letterSpacing: '0.7px', textTransform: 'uppercase' }}>{activeSectionDrag.replace('step-section-', '')}</span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
          {/* Add section footer */}
          <div style={{ marginTop: '10px' }}>
            {addingSectionFor === 'steps' ? (
              <div style={{ display: 'flex', gap: '6px' }}>
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
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 4px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: 'var(--tm)' }}
              >
                <Columns size={11} /> Add section
              </button>
            )}
          </div>
        </div>

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
function SectionDivider({ name, onRename, onDelete, sortHandle }: {
  name: string
  onRename: (newName: string) => void
  onDelete: () => void
  sortHandle?: React.ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(name)

  function commit() { onRename(draft.trim() || name); setEditing(false) }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '6px 14px',
      borderBottom: '0.5px solid var(--br)',
      backgroundColor: 'rgba(255,255,255,0.025)',
    }}>
      {sortHandle}
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

// ── Section drag handle ──────────────────────────────────────────────────────
function SectionDragHandle({ dragId }: { dragId: string }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId })
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        background: 'none', border: 'none', cursor: isDragging ? 'grabbing' : 'grab',
        color: 'var(--tm)', padding: '1px', flexShrink: 0,
        touchAction: 'none', lineHeight: 0, opacity: isDragging ? 0.5 : 1,
      }}
      title="Drag to reorder section"
    >
      <GripVertical size={12} />
    </button>
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

// ── Section chips (outside component so it doesn't re-mount on render) ─────────
function SectionChips({ value, onChange, components }: {
  value: string | null
  onChange: (v: string | null) => void
  components: string[]
}) {
  if (components.length === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', marginTop: '4px' }}>
      <span style={{ fontSize: '10px', color: 'var(--tm)', flexShrink: 0 }}>Section:</span>
      {components.map(sec => {
        const active = value === sec
        return (
          <button
            key={sec}
            onClick={() => onChange(active ? null : sec)}
            style={{
              padding: '3px 9px', borderRadius: '10px', border: 'none',
              fontSize: '11px', fontWeight: active ? 600 : 400,
              cursor: 'pointer', fontFamily: 'inherit',
              backgroundColor: active ? 'var(--am)' : 'var(--dk3)',
              color: active ? '#1a1612' : 'var(--ts)',
              transition: 'background 0.1s',
            }}
          >
            {sec}
          </button>
        )
      })}
      {value !== null && (
        <button
          onClick={() => onChange(null)}
          style={{ padding: '3px 9px', borderRadius: '10px', border: '0.5px solid var(--br)', background: 'none', fontSize: '11px', color: 'var(--tm)', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          none
        </button>
      )}
    </div>
  )
}

// ── Droppable zone wrappers ─────────────────────────────────────────────────
// sectionDragId: when set, the card itself also registers as a drop target for
// section reordering (in addition to the ingredient/step drop zone inside).

function IngDropZone({ dropId, sectionDragId, children }: { dropId: string; sectionDragId?: string | null; children: React.ReactNode }) {
  const { setNodeRef: setIngRef, isOver: ingIsOver }     = useDroppable({ id: dropId })
  const { setNodeRef: setSecRef, isOver: secIsOver }     = useDroppable({ id: sectionDragId ?? `__disabled_${dropId}`, disabled: !sectionDragId })
  const isOver = ingIsOver || secIsOver
  return (
    <div
      ref={node => { setIngRef(node); setSecRef(node) }}
      style={{
        backgroundColor: 'var(--dkc)',
        border: `0.5px solid ${isOver ? 'var(--am)' : 'var(--br)'}`,
        borderRadius: '12px',
        overflow: 'hidden',
        transition: 'border-color 0.15s',
        boxShadow: isOver ? '0 0 0 1px var(--am)' : 'none',
      }}
    >
      {children}
    </div>
  )
}

function StepDropZone({ dropId, sectionDragId, children }: { dropId: string; sectionDragId?: string | null; children: React.ReactNode }) {
  const { setNodeRef: setStepRef, isOver: stepIsOver }   = useDroppable({ id: dropId })
  const { setNodeRef: setSecRef,  isOver: secIsOver }    = useDroppable({ id: sectionDragId ?? `__disabled_${dropId}`, disabled: !sectionDragId })
  const isOver = stepIsOver || secIsOver
  return (
    <div
      ref={node => { setStepRef(node); setSecRef(node) }}
      style={{
        backgroundColor: 'var(--dkc)',
        border: `0.5px solid ${isOver ? 'var(--am)' : 'var(--br)'}`,
        borderRadius: '12px',
        overflow: 'hidden',
        transition: 'border-color 0.15s',
        boxShadow: isOver ? '0 0 0 1px var(--am)' : 'none',
      }}
    >
      {children}
    </div>
  )
}

// ── Draggable ingredient row ────────────────────────────────────────────────

type CatalogItem = { id: string; name: string; emoji: string | null }

function DraggableIngRow({ dragId, idx, ing, isNew, isLast, components, catalog, onUpdateName, onUpdateQty, onUpdateUnit, onUpdatePrepNote, onUpdateSection, onSelectCatalog, onRemove }: {
  dragId: string
  idx: number
  ing: EditIngredient
  isNew: boolean
  isLast: boolean
  components: string[]
  catalog: CatalogItem[]
  onUpdateName: (idx: number, val: string) => void
  onUpdateQty: (idx: number, val: string) => void
  onUpdateUnit: (idx: number, val: string) => void
  onUpdatePrepNote: (idx: number, val: string) => void
  onUpdateSection: (idx: number, section: string | null) => void
  onSelectCatalog: (idx: number, item: { id: string; name: string; emoji: string }) => void
  onRemove: (idx: number) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId })
  const [showSugg, setShowSugg] = useState(false)

  const query = ing.name.trim().toLowerCase()
  const suggestions = showSugg && query.length >= 1
    ? catalog
        .filter(c => c.name.toLowerCase().includes(query))
        .slice(0, 6)
    : []

  return (
    <div
      ref={setNodeRef}
      style={{
        padding: '10px 14px',
        borderBottom: isLast ? 'none' : '0.5px solid var(--br)',
        display: 'flex', flexDirection: 'column', gap: '6px',
        opacity: isDragging ? 0.35 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      {/* Name row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          {...listeners}
          {...attributes}
          style={{ background: 'none', border: 'none', cursor: 'grab', color: 'var(--tm)', padding: '2px', flexShrink: 0, touchAction: 'none', lineHeight: 0 }}
        >
          <GripVertical size={13} />
        </button>
        <span style={{ fontSize: '16px', flexShrink: 0 }}>{ing.emoji}</span>
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
              value={ing.name}
              onChange={e => onUpdateName(idx, e.target.value)}
              onFocus={() => setShowSugg(true)}
              onBlur={() => setTimeout(() => setShowSugg(false), 150)}
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
          {/* Autocomplete dropdown */}
          {suggestions.length > 0 && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
              backgroundColor: 'var(--dk2)', border: '0.5px solid var(--brh)',
              borderRadius: '8px', overflow: 'hidden', marginTop: '2px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            }}>
              {suggestions.map((sug, i) => (
                <button
                  key={sug.id}
                  onMouseDown={e => { e.preventDefault(); onSelectCatalog(idx, { id: sug.id, name: sug.name, emoji: sug.emoji ?? '🥄' }) }}
                  style={{
                    width: '100%', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '7px 10px', background: 'none', border: 'none',
                    borderTop: i > 0 ? '0.5px solid var(--br)' : 'none',
                    cursor: 'pointer', fontSize: '13px', color: 'var(--tp)',
                    fontFamily: 'inherit',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--dk3)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <span style={{ fontSize: '15px' }}>{sug.emoji ?? '🥄'}</span>
                  <span>{sug.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={() => onRemove(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: '2px', flexShrink: 0 }}>
          <Trash2 size={13} />
        </button>
      </div>
      {/* Qty + unit + prep note */}
      <div style={{ display: 'flex', gap: '6px', paddingLeft: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="number"
          value={ing.quantity ?? ''}
          onChange={e => onUpdateQty(idx, e.target.value)}
          placeholder="Qty"
          style={{ ...inputStyle, width: '60px', padding: '3px 7px', fontSize: '12px' }}
        />
        <input
          value={ing.unit ?? ''}
          onChange={e => onUpdateUnit(idx, e.target.value)}
          placeholder="unit"
          style={{ ...inputStyle, width: '68px', padding: '3px 7px', fontSize: '12px' }}
        />
        <input
          value={ing.prep_note ?? ''}
          onChange={e => onUpdatePrepNote(idx, e.target.value)}
          placeholder="prep note"
          style={{ ...inputStyle, flex: 1, minWidth: '80px', padding: '3px 7px', fontSize: '12px' }}
        />
      </div>
      {/* Section chips */}
      <div style={{ paddingLeft: '24px' }}>
        <SectionChips value={ing.section} onChange={v => onUpdateSection(idx, v)} components={components} />
      </div>
    </div>
  )
}

// ── Draggable step row ───────────────────────────────────────────────────────

function DraggableStepRow({ dragId, idx, step, isLast, components, onUpdate, onUpdateSection, onRemove }: {
  dragId: string
  idx: number
  step: EditStep
  isLast: boolean
  components: string[]
  onUpdate: (idx: number, instruction: string) => void
  onUpdateSection: (idx: number, section: string | null) => void
  onRemove: (idx: number) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: dragId })
  return (
    <div
      ref={setNodeRef}
      style={{
        padding: '10px 14px',
        borderBottom: isLast ? 'none' : '0.5px solid var(--br)',
        opacity: isDragging ? 0.35 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
        <button
          {...listeners}
          {...attributes}
          style={{ background: 'none', border: 'none', cursor: 'grab', color: 'var(--tm)', padding: '2px', flexShrink: 0, touchAction: 'none', lineHeight: 0, marginTop: '2px' }}
        >
          <GripVertical size={13} />
        </button>
        <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--am)', letterSpacing: '0.8px', paddingTop: '3px', flexShrink: 0, minWidth: '40px' }}>
          STEP {step.step_number}
        </div>
        <div
          contentEditable
          suppressContentEditableWarning
          onBlur={e => onUpdate(idx, e.currentTarget.textContent ?? '')}
          style={{ flex: 1, fontSize: '13px', color: 'var(--tp)', lineHeight: 1.5, outline: 'none', minHeight: '20px' }}
        >
          {step.instruction}
        </div>
        <button onClick={() => onRemove(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: '2px', flexShrink: 0 }}>
          <Trash2 size={13} />
        </button>
      </div>
      <div style={{ paddingLeft: '48px' }}>
        <SectionChips value={step.section} onChange={v => onUpdateSection(idx, v)} components={components} />
      </div>
    </div>
  )
}
