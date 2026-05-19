import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Check, AlertTriangle, Plus, Trash2, GitMerge, Columns } from 'lucide-react'
import type { ParsedRecipe, ParsedIngredient, ParsedStep } from '../lib/recipeParser'
import { useSaveRecipe } from '../hooks/useRecipes'
import { useIngredientsCatalog, matchIngredientFull } from '../hooks/useIngredientsCatalog'
import { useEscapeKey } from '../lib/useEscapeKey'
import { useAppStore } from '../stores/appStore'
import { aiMatchIngredients, getAiSuggestionCache, saveAiSuggestionCache } from '../lib/ingredientAiMatch'

// ── Learned-match persistence ──────────────────────────────────────────────────
// Stores explicit user decisions across sessions, keyed by family.
// Value = catalog UUID → always merge; null → always keep separate.
function getStoredMatches(familyId: string): Record<string, string | null> {
  try { return JSON.parse(localStorage.getItem(`simmer_ingredient_matches_${familyId}`) ?? '{}') }
  catch { return {} }
}
function saveStoredMatches(familyId: string, matches: Record<string, string | null>) {
  try { localStorage.setItem(`simmer_ingredient_matches_${familyId}`, JSON.stringify(matches)) }
  catch { /* storage full — ignore */ }
}

// 6 card colors — pick same one used by RecipeCard
const CARD_COLORS = ['#d4e8d4', '#f0e8d0', '#f0e0d8', '#d8e0ea', '#dce8e0', '#ecdae2']
function tempColor() { return CARD_COLORS[Math.floor(Math.random() * CARD_COLORS.length)] }

export function RecipeReviewScreen() {
  const navigate   = useNavigate()
  const location   = useLocation()
  const state      = location.state as { parsed?: ParsedRecipe; rawText?: string; sourceUrl?: string; partial?: boolean } | null

  const parsed     = state?.parsed
  const familyId   = useAppStore(s => s.familyId)
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

  // Named components (sections) for multi-part recipes
  const [components, setComponents] = useState<string[]>(parsed?.components ?? [])

  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)
  const placeholderColor            = useRef(tempColor())
  const matchesInitialized          = useRef(false)
  const prepNotesInitialized        = useRef(false)

  // AI-suggested merges for ingredients that had no deterministic match
  // idx → catalogId (only positive suggestions stored; absence = no suggestion yet)
  const [aiSuggestions, setAiSuggestions] = useState<Map<number, string>>(new Map())
  const [aiLoading,     setAiLoading]     = useState(false)

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
    // Clear any "keep separate" override — user has now chosen an explicit merge target
    setKeepSeparate(prev => { const s = new Set(prev); s.delete(idx); return s })
    setManualMerge(prev => new Map(prev).set(idx, catalogId))
    // Seed the prep note with the original ingredient name if it isn't already set
    setIngredients(prev => prev.map((ing, i) =>
      i === idx && !ing.prep_note ? { ...ing, prep_note: ing.name } : ing
    ))
    setMergePickerIdx(null)
    setMergeSearch('')
  }
  function clearManualMerge(idx: number) {
    setManualMerge(prev => { const m = new Map(prev); m.delete(idx); return m })
  }

  // ── Pre-populate merge decisions from previous sessions ────────────────────
  useEffect(() => {
    if (!catalog.length || !familyId || matchesInitialized.current) return
    matchesInitialized.current = true

    const stored = getStoredMatches(familyId)
    const newManual   = new Map<number, string>()
    const newSeparate = new Set<number>()

    ingredients.forEach((ing, idx) => {
      const norm = ing.name.toLowerCase().trim()
      if (!(norm in stored)) return
      const decision = stored[norm]
      if (decision === null) {
        newSeparate.add(idx)
      } else {
        // Only apply if the catalog item still exists
        if (catalog.find(c => c.id === decision)) newManual.set(idx, decision)
      }
    })

    if (newManual.size > 0)
      setManualMerge(prev => {
        const next = new Map(prev)
        for (const [idx, id] of newManual) {
          if (!next.has(idx)) next.set(idx, id) // never overwrite a decision made this session
        }
        return next
      })
    if (newSeparate.size > 0)
      setKeepSeparate(prev => {
        const next = new Set(prev)
        for (const idx of newSeparate) next.add(idx)
        return next
      })
  }, [catalog, familyId, ingredients])

  // ── AI synonym matching for unresolved ingredients ─────────────────────────
  useEffect(() => {
    if (!catalog.length || !familyId || !matchesInitialized.current) return

    const storedDecisions = getStoredMatches(familyId)
    const aiCache         = getAiSuggestionCache(familyId)

    // Find indices that still have no resolution
    const needsLookup: { idx: number; name: string }[] = []
    const fromCache:   { idx: number; catalogId: string }[] = []

    ingredients.forEach((ing, idx) => {
      const { catalog: autoMatch } = matchIngredientFull(ing.name, catalog)
      const norm = ing.name.toLowerCase().trim()
      // Skip if already resolved: auto-match, manual merge, keep-separate, or user decision
      if (autoMatch) return
      if (manualMerge.has(idx)) return
      if (keepSeparate.has(idx)) return
      if (norm in storedDecisions) return

      // Check the AI suggestions cache first
      if (norm in aiCache) {
        const cachedId = aiCache[norm]
        if (cachedId) fromCache.push({ idx, catalogId: cachedId })
        return // null means Claude found no match — nothing to show
      }

      needsLookup.push({ idx, name: ing.name })
    })

    // Apply any cached suggestions immediately
    if (fromCache.length > 0) {
      setAiSuggestions(prev => {
        const next = new Map(prev)
        for (const { idx, catalogId } of fromCache) {
          if (!next.has(idx)) next.set(idx, catalogId)
        }
        return next
      })
    }

    // Fire AI call for any remaining unknowns
    if (needsLookup.length === 0) return
    const names = needsLookup.map(n => n.name)

    setAiLoading(true)
    aiMatchIngredients(names, catalog).then(results => {
      const updatedCache = { ...getAiSuggestionCache(familyId) }
      const newSuggestions = new Map<number, string>()

      for (const { idx, name } of needsLookup) {
        const norm     = name.toLowerCase().trim()
        const catalogId = results.get(name) ?? null
        updatedCache[norm] = catalogId          // cache even nulls so we don't re-query
        if (catalogId) newSuggestions.set(idx, catalogId)
      }

      saveAiSuggestionCache(familyId, updatedCache)
      if (newSuggestions.size > 0)
        setAiSuggestions(prev => new Map([...prev, ...newSuggestions]))
    }).finally(() => setAiLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, familyId]) // intentionally omits manualMerge/keepSeparate — runs once after init

  // ── Seed prep notes for auto-fuzzy merged ingredients ─────────────────────
  // When catalog first loads, set prep_note = original ingredient name for any
  // ingredient that will be fuzzy-merged, so the note field is pre-filled.
  useEffect(() => {
    if (!catalog.length || prepNotesInitialized.current) return
    prepNotesInitialized.current = true
    setIngredients(prev => prev.map(ing => {
      if (ing.prep_note) return ing  // don't overwrite an existing note
      const { isMerge, catalog: match } = matchIngredientFull(ing.name, catalog)
      return isMerge && match ? { ...ing, prep_note: ing.name } : ing
    }))
  }, [catalog])

  // "Add section" inline input — shared across ingredients + steps panels
  const [newSectionDraft, setNewSectionDraft] = useState('')
  const [addingSectionFor, setAddingSectionFor] = useState<'ingredients' | 'steps' | null>(null)

  function commitNewSection() {
    if (newSectionDraft.trim()) addSection(newSectionDraft)
    setNewSectionDraft('')
    setAddingSectionFor(null)
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
  function updateIngredientUnit(idx: number, unit: string) {
    setIngredients(prev => prev.map((ing, i) =>
      i === idx ? { ...ing, unit: unit || null } : ing
    ))
  }
  function removeIngredient(idx: number) {
    setIngredients(prev => prev.filter((_, i) => i !== idx))
  }
  function updateIngredientName(idx: number, n: string) {
    setIngredients(prev => prev.map((ing, i) =>
      i === idx ? { ...ing, name: n } : ing
    ))
  }
  function updateIngredientPrepNote(idx: number, note: string) {
    setIngredients(prev => prev.map((ing, i) =>
      i === idx ? { ...ing, prep_note: note || null } : ing
    ))
  }

  // ── Step helpers ─────────────────────────────────────────────────
  function updateStep(idx: number, instruction: string) {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, instruction } : s))
  }
  function addStep() {
    // New step goes into the last component (if any)
    const lastSection = components.length > 0 ? components[components.length - 1] : null
    setSteps(prev => [...prev, { step_number: prev.length + 1, instruction: '', section: lastSection }])
  }
  function removeStep(idx: number) {
    setSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step_number: i + 1 })))
  }

  // ── Section / component helpers ───────────────────────────────────
  function renameSection(oldName: string, newName: string) {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) return
    setComponents(prev => prev.map(c => c === oldName ? trimmed : c))
    setIngredients(prev => prev.map(ing =>
      ing.section === oldName ? { ...ing, section: trimmed } : ing
    ))
    setSteps(prev => prev.map(s =>
      s.section === oldName ? { ...s, section: trimmed } : s
    ))
  }
  function deleteSection(name: string) {
    setComponents(prev => prev.filter(c => c !== name))
    // Unassign items — they fall into the "unsectioned" group
    setIngredients(prev => prev.map(ing =>
      ing.section === name ? { ...ing, section: null } : ing
    ))
    setSteps(prev => prev.map(s =>
      s.section === name ? { ...s, section: null } : s
    ))
  }
  function addSection(sectionName: string) {
    const trimmed = sectionName.trim()
    if (!trimmed || components.includes(trimmed)) return
    setComponents(prev => [...prev, trimmed])
  }

  // ── Save ─────────────────────────────────────────────────────────
  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    setSaveError(null)

    // Persist explicit user decisions so future imports start smarter
    if (familyId) {
      const stored = getStoredMatches(familyId)
      ingredients.forEach((ing, idx) => {
        const norm = ing.name.toLowerCase().trim()
        const manualId = manualMerge.get(idx)
        const { catalog: autoMatch } = matchIngredientFull(ing.name, catalog)
        const aiId = aiSuggestions.get(idx)
        if (manualId) {
          stored[norm] = manualId
        } else if (keepSeparate.has(idx) && (autoMatch || aiId)) {
          // User explicitly rejected a match — remember to never auto-merge this name
          stored[norm] = null
        } else if (!autoMatch && aiId && !keepSeparate.has(idx)) {
          // AI match was auto-applied — persist like a manual merge so future imports use it
          stored[norm] = aiId
        }
        // Accepted deterministic auto-match: no change needed (deterministic handles it)
      })
      saveStoredMatches(familyId, stored)
    }

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
          // Priority: manual merge > deterministic auto-match > AI match > new (all respect keepSeparate)
          const manualId  = manualMerge.get(idx)
          const autoId    = match && !keepSeparate.has(idx) ? match.id : undefined
          const aiId      = !match && !keepSeparate.has(idx) ? aiSuggestions.get(idx) : undefined
          const catalogId = manualId ?? autoId ?? aiId
          return {
            catalogId,
            name: ing.name,
            emoji: ing.emoji,
            quantity: ing.quantity,
            unit: ing.unit,
            prep_note: ing.prep_note,
            serving_note: ing.serving_note,
            section: ing.section ?? null,
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
        <Section title={`Ingredients — tap to edit qty & unit`} loading={aiLoading}>
          {groupBySection(ingredients, components).flatMap(({ section, items }, groupIdx) => {
            const rows: React.ReactNode[] = []

            // Section divider header (only for named sections)
            if (section !== null) {
              rows.push(
                <SectionDivider
                  key={`ing-sec-${section}`}
                  name={section}
                  onRename={newName => renameSection(section, newName)}
                  onDelete={() => deleteSection(section)}
                />
              )
            }

            // Ingredient rows for this section
            items.forEach(({ idx }, itemIdx) => {
              const ing = ingredients[idx]
              const { catalog: catalogMatch, isMerge } = matchIngredientFull(ing.name, catalog)
              const userKeptSeparate  = keepSeparate.has(idx)
              const manualCatalogId   = manualMerge.get(idx)
              const manualCatalogItem = manualCatalogId ? catalog.find(c => c.id === manualCatalogId) : null
              const needsReview       = ing.flag === 'confirm_quantity'
              const aiSuggestedId     = aiSuggestions.get(idx)
              const aiSuggestedItem   = aiSuggestedId ? catalog.find(c => c.id === aiSuggestedId) : null
              // AI suggestions are auto-applied (same as fuzzy matches) — user can opt out with Keep separate
              const effectiveIsNew    = !manualCatalogId && (!catalogMatch || userKeptSeparate) && (!aiSuggestedItem || userKeptSeparate)
              const showMergeAlert    = !manualCatalogId && isMerge && !!catalogMatch && !userKeptSeparate
              const showAiMerge       = !manualCatalogId && !!aiSuggestedItem && !catalogMatch && !userKeptSeparate
              const showExactMatch    = !manualCatalogId && !isMerge && !!catalogMatch && !userKeptSeparate
              const showKeptSeparate  = userKeptSeparate && !!(catalogMatch ?? aiSuggestedItem) && !manualCatalogId
              // Show a border unless this is the last item AND there's nothing after this group
              const isLastItem = itemIdx === items.length - 1
              rows.push(
                <div
                  key={idx}
                  style={{
                    padding: '9px 14px',
                    borderBottom: !isLastItem ? '0.5px solid var(--br)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    {/* Status icon */}
                    <div style={{ width: '16px', flexShrink: 0, paddingTop: '1px' }}>
                      {needsReview ? (
                        <AlertTriangle size={13} color="var(--am)" />
                      ) : (showMergeAlert || showAiMerge) ? (
                        <GitMerge size={13} color="#c97d2a" />
                      ) : (
                        <Check size={13} color={effectiveIsNew ? 'var(--ts)' : 'var(--gl)'} />
                      )}
                    </div>

                    {/* Emoji + name + note */}
                    <span style={{ fontSize: '16px', flexShrink: 0 }}>{ing.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {effectiveIsNew && !showAiSuggestion ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <input
                            value={ing.name}
                            onChange={e => updateIngredientName(idx, e.target.value)}
                            style={{
                              flex: 1, minWidth: 0,
                              background: 'none', border: 'none',
                              borderBottom: '0.5px solid var(--am)',
                              outline: 'none', padding: '0 0 1px',
                              fontSize: '13px', fontWeight: 500,
                              color: 'var(--tp)', fontFamily: 'inherit',
                            }}
                          />
                          <span style={{ fontSize: '9px', color: 'var(--gl)', backgroundColor: 'rgba(93,202,165,0.12)', borderRadius: '3px', padding: '1px 4px', flexShrink: 0 }}>
                            + new
                          </span>
                        </div>
                      ) : (
                        <div style={{ fontSize: '13px', color: 'var(--tp)', fontWeight: 500 }}>
                          {ing.name}
                        </div>
                      )}
                      <input
                        value={ing.prep_note ?? ''}
                        onChange={e => updateIngredientPrepNote(idx, e.target.value)}
                        placeholder="add a note…"
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          background: 'none', border: 'none',
                          borderBottom: '0.5px solid transparent',
                          outline: 'none', padding: '2px 0 1px',
                          fontSize: '11px', color: 'var(--ts)',
                          fontFamily: 'inherit', marginTop: '1px',
                        }}
                        onFocus={e => (e.currentTarget.style.borderBottomColor = 'var(--br)')}
                        onBlur={e  => (e.currentTarget.style.borderBottomColor = 'transparent')}
                      />
                      {needsReview && (
                        <div style={{ fontSize: '10px', color: 'var(--am)', marginTop: '1px' }}>confirm quantity</div>
                      )}
                    </div>

                    {/* Quantity + Unit */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0, paddingTop: '1px' }}>
                      <input
                        type="number"
                        value={ing.quantity ?? ''}
                        onChange={e => updateIngredientQty(idx, e.target.value)}
                        placeholder="?"
                        style={{
                          width: '44px',
                          backgroundColor: needsReview ? 'rgba(239,159,39,0.1)' : 'var(--dk3)',
                          border: `0.5px solid ${needsReview ? 'var(--am)' : 'var(--br)'}`,
                          borderRadius: '6px', padding: '3px 5px',
                          fontSize: '12px', color: 'var(--tp)',
                          textAlign: 'right', outline: 'none',
                        }}
                      />
                      <select
                        value={ing.unit ?? ''}
                        onChange={e => updateIngredientUnit(idx, e.target.value)}
                        style={{
                          backgroundColor: 'var(--dk3)', border: '0.5px solid var(--br)',
                          borderRadius: '6px', padding: '3px 4px',
                          fontSize: '11px', color: ing.unit ? 'var(--ts)' : 'var(--tm)',
                          outline: 'none', fontFamily: 'inherit',
                          appearance: 'none', cursor: 'pointer',
                          minWidth: '38px', maxWidth: '56px',
                        }}
                      >
                        <option value="">—</option>
                        <option value="tsp">tsp</option>
                        <option value="tbsp">tbsp</option>
                        <option value="cup">cup</option>
                        <option value="oz">oz</option>
                        <option value="lbs">lbs</option>
                        <option value="g">g</option>
                        <option value="ml">ml</option>
                        <option value="whole">whole</option>
                        <option value="clove">clove</option>
                        <option value="bunch">bunch</option>
                        <option value="can">can</option>
                        <option value="slice">slice</option>
                        <option value="sprig">sprig</option>
                      </select>
                    </div>

                    {/* Remove */}
                    <button
                      onClick={() => removeIngredient(idx)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: '2px', flexShrink: 0, paddingTop: '3px' }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  {/* Merge alert */}
                  {showMergeAlert && (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginTop: '5px', marginLeft: '26px',
                      background: 'rgba(201,125,42,0.1)', border: '0.5px solid rgba(201,125,42,0.35)',
                      borderRadius: '6px', padding: '4px 8px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ fontSize: '10px', color: '#c97d2a' }}>Merging with existing →</span>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#c97d2a' }}>{catalogMatch.name}</span>
                      </div>
                      <button onClick={() => toggleKeepSeparate(idx)} style={subBtnStyle}>Keep separate</button>
                    </div>
                  )}

                  {/* Exact match */}
                  {showExactMatch && (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginTop: '5px', marginLeft: '26px',
                      background: 'rgba(93,202,165,0.06)', border: '0.5px solid rgba(93,202,165,0.2)',
                      borderRadius: '6px', padding: '4px 8px',
                    }}>
                      <span style={{ fontSize: '10px', color: 'var(--gl)' }}>
                        Linked to <strong style={{ fontWeight: 600 }}>{catalogMatch!.name}</strong> in your catalog
                      </span>
                      <button onClick={() => toggleKeepSeparate(idx)} style={subBtnStyle}>Keep separate</button>
                    </div>
                  )}

                  {/* Kept separate */}
                  {showKeptSeparate && (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginTop: '5px', marginLeft: '26px',
                      background: 'rgba(93,202,165,0.08)', border: '0.5px solid rgba(93,202,165,0.25)',
                      borderRadius: '6px', padding: '4px 8px',
                    }}>
                      <span style={{ fontSize: '10px', color: 'var(--gl)' }}>Will be saved as a new ingredient</span>
                      <button onClick={() => toggleKeepSeparate(idx)} style={subBtnStyle}>Undo</button>
                    </div>
                  )}

                  {/* New ingredient */}
                  {effectiveIsNew && !manualCatalogItem && !showAiSuggestion && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '5px', marginLeft: '26px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--ts)' }}>New to your catalog</span>
                      <button onClick={() => { setMergePickerIdx(idx); setMergeSearch('') }} style={{ ...subBtnStyle, color: 'var(--am)' }}>
                        Merge with existing →
                      </button>
                    </div>
                  )}

                  {/* AI auto-merge (same visual as fuzzy merge, with ✦ AI badge) */}
                  {showAiMerge && (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginTop: '5px', marginLeft: '26px',
                      background: 'rgba(201,125,42,0.1)', border: '0.5px solid rgba(201,125,42,0.35)',
                      borderRadius: '6px', padding: '4px 8px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ fontSize: '10px', color: '#c97d2a' }}>Merging with existing →</span>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#c97d2a' }}>{aiSuggestedItem!.name}</span>
                        <span style={{ fontSize: '8px', color: 'var(--ts)', backgroundColor: 'rgba(138,149,168,0.15)', borderRadius: '3px', padding: '1px 4px', flexShrink: 0 }}>✦ AI</span>
                      </div>
                      <button onClick={() => toggleKeepSeparate(idx)} style={subBtnStyle}>Keep separate</button>
                    </div>
                  )}

                  {/* Manual merge */}
                  {manualCatalogItem && (
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginTop: '5px', marginLeft: '26px',
                      background: 'rgba(201,125,42,0.1)', border: '0.5px solid rgba(201,125,42,0.35)',
                      borderRadius: '6px', padding: '4px 8px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ fontSize: '10px', color: '#c97d2a' }}>Merging with →</span>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#c97d2a' }}>{manualCatalogItem.name}</span>
                      </div>
                      <button onClick={() => clearManualMerge(idx)} style={subBtnStyle}>Undo</button>
                    </div>
                  )}
                </div>
              )
            })

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
                style={{
                  flex: 1, background: 'var(--dk3)', border: '0.5px solid var(--brh)',
                  borderRadius: '7px', padding: '6px 9px',
                  fontSize: '12px', color: 'var(--tp)',
                  fontFamily: 'inherit', outline: 'none',
                }}
              />
              <button onClick={commitNewSection} style={{ background: 'var(--am)', border: 'none', borderRadius: '7px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, color: '#1a1612', cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
              <button onClick={() => { setNewSectionDraft(''); setAddingSectionFor(null) }} style={{ background: 'none', border: '0.5px solid var(--br)', borderRadius: '7px', padding: '6px 10px', fontSize: '12px', color: 'var(--ts)', cursor: 'pointer', fontFamily: 'inherit' }}>✕</button>
            </div>
          ) : (
            <button
              onClick={() => setAddingSectionFor('ingredients')}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                width: '100%', padding: '9px 14px',
                background: 'none', border: 'none',
                borderTop: ingredients.length > 0 ? '0.5px solid var(--br)' : 'none',
                cursor: 'pointer', fontSize: '11px', color: 'var(--tm)',
              }}
            >
              <Columns size={11} />
              Add section
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
                  onRename={newName => renameSection(section, newName)}
                  onDelete={() => deleteSection(section)}
                />
              )
            }

            items.forEach(({ idx }, itemIdx) => {
              const step = steps[idx]
              const isLastItem = itemIdx === items.length - 1
              rows.push(
                <div
                  key={idx}
                  style={{
                    padding: '10px 14px',
                    borderBottom: !isLastItem ? '0.5px solid var(--br)' : 'none',
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
                      style={{ flex: 1, fontSize: '13px', color: 'var(--tp)', lineHeight: 1.5, outline: 'none', minHeight: '20px' }}
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
              )
            })

            return rows
          })}

          {/* Add step + Add section row */}
          <div style={{ display: 'flex', borderTop: steps.length > 0 ? '0.5px solid var(--br)' : 'none' }}>
            <button
              onClick={addStep}
              style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', padding: '11px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--ts)' }}
            >
              <Plus size={13} />
              Add a step
            </button>
            {addingSectionFor === 'steps' ? (
              <div style={{ display: 'flex', gap: '5px', padding: '6px 10px', alignItems: 'center', borderLeft: '0.5px solid var(--br)' }}>
                <input
                  autoFocus
                  value={newSectionDraft}
                  onChange={e => setNewSectionDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') commitNewSection(); if (e.key === 'Escape') { setNewSectionDraft(''); setAddingSectionFor(null) } }}
                  placeholder="Section name…"
                  style={{
                    width: '120px', background: 'var(--dk3)', border: '0.5px solid var(--brh)',
                    borderRadius: '6px', padding: '4px 7px',
                    fontSize: '12px', color: 'var(--tp)',
                    fontFamily: 'inherit', outline: 'none',
                  }}
                />
                <button onClick={commitNewSection} style={{ background: 'var(--am)', border: 'none', borderRadius: '6px', padding: '4px 9px', fontSize: '11px', fontWeight: 600, color: '#1a1612', cursor: 'pointer', fontFamily: 'inherit' }}>Add</button>
                <button onClick={() => { setNewSectionDraft(''); setAddingSectionFor(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', fontSize: '13px', padding: '4px 2px' }}>✕</button>
              </div>
            ) : (
              <button
                onClick={() => setAddingSectionFor('steps')}
                style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '11px 14px', background: 'none', border: 'none', borderLeft: '0.5px solid var(--br)', cursor: 'pointer', fontSize: '11px', color: 'var(--tm)', whiteSpace: 'nowrap' }}
              >
                <Columns size={11} />
                Add section
              </button>
            )}
          </div>
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

// ── Grouping helper ─────────────────────────────────────────────
/**
 * Groups a flat item array by section, preserving original indices.
 * Items with null/undefined section go into a leading group with section=null.
 * Named sections follow in the order given by `components`.
 */
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

// ── Section divider row ─────────────────────────────────────────
function SectionDivider({ name, onRename, onDelete }: {
  name: string
  onRename: (newName: string) => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(name)

  function commit() {
    onRename(draft.trim() || name)
    setEditing(false)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '6px 14px',
      borderTop: '0.5px solid var(--br)', borderBottom: '0.5px solid var(--br)',
      backgroundColor: 'rgba(255,255,255,0.025)',
    }}>
      <div style={{ width: '16px', flexShrink: 0 }} />
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
            fontSize: '10px', fontWeight: 700,
            color: 'var(--ts)', letterSpacing: '0.7px',
            textTransform: 'uppercase', fontFamily: 'inherit',
          }}
        />
      ) : (
        <div
          onClick={() => { setDraft(name); setEditing(true) }}
          style={{
            flex: 1, fontSize: '10px', fontWeight: 700,
            color: 'var(--tm)', letterSpacing: '0.7px',
            textTransform: 'uppercase', cursor: 'text',
          }}
        >
          {name}
        </div>
      )}
      <button
        onClick={onDelete}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: '2px', flexShrink: 0 }}
        title="Remove section"
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}

/** Shared style for small inline action buttons (Keep separate, Undo, etc.) */
const subBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: '10px', color: 'var(--ts)', fontFamily: 'inherit',
  padding: '0 2px', textDecoration: 'underline', flexShrink: 0,
}

// ── Small UI helpers ───────────────────────────────────────────
function Section({ title, children, loading }: { title: string; children: React.ReactNode; loading?: boolean }) {
  return (
    <div style={{ padding: '20px 16px 0' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {title}
        {loading && <span style={{ fontSize: '10px', color: 'var(--ts)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>✦ matching…</span>}
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
