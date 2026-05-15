import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronDown, CalendarDays, ArrowDown, ArrowUp } from 'lucide-react'
import { Screen } from '../components/layout/Screen'
import { useAppStore } from '../stores/appStore'
import { useUserSettings } from '../hooks/useUserSettings'
import { useMealPrep, formatTotals, slotDayLabel } from '../hooks/useMealPrep'
import type { PrepIngredient } from '../hooks/useMealPrep'
import { getWeekStart, toISODate, formatWeekRange } from '../lib/weekUtils'

// ── Prep heuristic ────────────────────────────────────────────────────────────

/** Returns true if an ingredient typically requires hands-on prep (chopping, trimming, etc.) */
function defaultNeedsPrep(name: string, emoji: string | null): boolean {
  const n = name.toLowerCase()

  // Dry goods, pantry staples, sauces → no prep
  if (/\b(salt|pepper|oil|butter|flour|sugar|breadcrumb|panko|spice|powder|dried|canned|sauce|stock|broth|vinegar|honey|syrup|extract|seasoning|coconut milk|soy sauce|fish sauce|worcestershire|hot sauce|ketchup|mustard|mayo|cream|condensed|bouillon|seasoning|ground cumin|ground coriander|ground cinnamon|ground sage|ground white|garlic powder|onion powder|chili powder|turmeric|paprika|harissa|lavash|noodle|pasta|rice|sugar|puff pastry|shaoxing|palm sugar|white sugar|distilled|dark soy)\b/.test(n)) return false

  // Fresh veg, alliums, herbs, whole proteins → needs prep
  if (/\b(onion|garlic|carrot|celery|shallot|scallion|leek|cucumber|zucchini|tomato|potato|mushroom|spinach|kale|chard|cabbage|broccoli|cauliflower|fennel|beet|parsnip|squash|eggplant|lemon|lime|orange|ginger|parsley|cilantro|basil|mint|thyme|rosemary|chive|dill|pepper|bell pepper|bean sprout|bok choy|corn|avocado|mango|egg|eggs|chicken|beef|lamb|pork|fish|salmon|shrimp|turkey|duck|steak|fillet|thigh|breast|rack|sausage|tofu|scallion)\b/.test(n)) return true

  // Emoji fallback
  const prepEmoji = new Set(['🧅','🧄','🥕','🫑','🌶','🥒','🍅','🥬','🥦','🧅','🌿','🥚','🍋','🥩','🍖','🍗','🐟','🦐','🥑','🧆'])
  if (emoji && prepEmoji.has(emoji)) return true

  return false
}

/** Get a numeric sort weight from totals (sum of all quantities, for ordering) */
function sortWeight(item: PrepIngredient): number {
  return item.totals.reduce((sum, t) => sum + (t.quantity ?? 0), 0)
}

// ── MealPrepScreen ────────────────────────────────────────────────────────────

export function MealPrepScreen() {
  const navigate = useNavigate()

  const plannerWeekStart = useAppStore(s => s.plannerWeekStart)
  const { data: settings } = useUserSettings()
  const planDow = settings?.plan_start_dow ?? 5

  const weekStart = plannerWeekStart ?? toISODate(getWeekStart(planDow))
  const weekStartDate = new Date(`${weekStart}T12:00:00`)
  const weekLabel = formatWeekRange(weekStartDate)

  const { data: prepItems = [], isLoading } = useMealPrep(weekStart)

  const [search,    setSearch]    = useState('')
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set())
  const [noPrepOpen, setNoPrepOpen] = useState(false)

  // Manual overrides: 'noprep' = user moved to no-prep, 'prep' = user moved to prep
  const [overrides, setOverrides] = useState<Record<string, 'prep' | 'noprep'>>(() => {
    try { return JSON.parse(localStorage.getItem('prep-section-overrides') ?? '{}') }
    catch { return {} }
  })

  function toggleCard(ingredientId: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(ingredientId)) next.delete(ingredientId)
      else next.add(ingredientId)
      return next
    })
  }

  function moveItem(id: string, to: 'prep' | 'noprep') {
    setOverrides(prev => {
      const next = { ...prev, [id]: to }
      localStorage.setItem('prep-section-overrides', JSON.stringify(next))
      return next
    })
  }

  function getSection(item: PrepIngredient): 'prep' | 'noprep' {
    if (overrides[item.ingredient_id]) return overrides[item.ingredient_id]
    return defaultNeedsPrep(item.name, item.emoji) ? 'prep' : 'noprep'
  }

  const filtered = search.trim()
    ? prepItems.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : prepItems

  const prepSection   = filtered.filter(i => getSection(i) === 'prep')
    .sort((a, b) => sortWeight(b) - sortWeight(a))
  const noPrepSection = filtered.filter(i => getSection(i) === 'noprep')
    .sort((a, b) => sortWeight(b) - sortWeight(a))

  return (
    <Screen>
      <div style={{ padding: '16px 16px 0' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--tp)', margin: '0 0 3px' }}>
          Meal Prep
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--ts)', margin: '0 0 14px' }}>
          Week of {weekLabel} — ingredient totals
        </p>

        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'var(--dk3)', border: '0.5px solid var(--brh)',
          borderRadius: '10px', padding: '8px 12px',
          marginBottom: '16px',
        }}>
          <Search size={14} color="var(--tm)" style={{ flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Find an ingredient…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontSize: '13px', color: 'var(--tp)', fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{
            width: '20px', height: '20px',
            border: '2px solid var(--br)', borderTopColor: 'var(--am)',
            borderRadius: '50%', animation: 'spin 0.7s linear infinite',
          }} />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && prepItems.length === 0 && (
        <div style={{ padding: '0 16px', textAlign: 'center', paddingTop: '32px' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>🍽️</div>
          <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--tp)', marginBottom: '6px' }}>
            No meals planned this week
          </div>
          <p style={{ fontSize: '13px', color: 'var(--ts)', margin: '0 0 20px', lineHeight: 1.5 }}>
            Add recipes to your meal plan and come back here to see your ingredient prep list.
          </p>
          <button
            onClick={() => navigate('/planner')}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '10px 20px',
              background: 'var(--am)', color: '#141820',
              border: 'none', borderRadius: '10px',
              fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <CalendarDays size={14} /> Plan this week
          </button>
        </div>
      )}

      {/* No search results */}
      {!isLoading && prepItems.length > 0 && filtered.length === 0 && (
        <div style={{ padding: '32px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', color: 'var(--ts)' }}>
            No ingredients matching "{search}"
          </p>
        </div>
      )}

      {/* Sections */}
      {!isLoading && filtered.length > 0 && (
        <div style={{ padding: '0 16px 32px' }}>

          {/* ── Needs Prep ── */}
          {prepSection.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>
                Needs prep · {prepSection.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {prepSection.map(item => (
                  <PrepCard
                    key={item.ingredient_id}
                    item={item}
                    isOpen={expanded.has(item.ingredient_id)}
                    onToggle={() => toggleCard(item.ingredient_id)}
                    section="prep"
                    onMove={() => moveItem(item.ingredient_id, 'noprep')}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── No Prep ── */}
          {noPrepSection.length > 0 && (
            <div>
              {/* Collapsible header */}
              <button
                onClick={() => setNoPrepOpen(o => !o)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'none', border: 'none', padding: '0 0 8px', cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  No prep needed · {noPrepSection.length}
                </span>
                <ChevronDown
                  size={14}
                  color="var(--tm)"
                  style={{ transition: 'transform 0.2s', transform: noPrepOpen ? 'rotate(180deg)' : 'none' }}
                />
              </button>
              {noPrepOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {noPrepSection.map(item => (
                    <PrepCard
                      key={item.ingredient_id}
                      item={item}
                      isOpen={expanded.has(item.ingredient_id)}
                      onToggle={() => toggleCard(item.ingredient_id)}
                      section="noprep"
                      onMove={() => moveItem(item.ingredient_id, 'prep')}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Screen>
  )
}

// ── PrepCard ──────────────────────────────────────────────────────────────────

function PrepCard({
  item, isOpen, onToggle, section, onMove,
}: {
  item:     PrepIngredient
  isOpen:   boolean
  onToggle: () => void
  section:  'prep' | 'noprep'
  onMove:   () => void
}) {
  const totalLabel = formatTotals(item.totals, item.dishes.length)

  return (
    <div
      style={{
        background: 'var(--dkc)',
        border: `0.5px solid ${isOpen ? 'var(--brh)' : 'var(--br)'}`,
        borderRadius: '12px',
        overflow: 'hidden',
        transition: 'border-color 0.15s',
      }}
    >
      {/* Card header */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 14px',
          cursor: 'pointer',
        }}
      >
        {/* Ingredient image — 15% wider than original 36px = ~42px, full-width image */}
        <div style={{ position: 'relative', width: '42px', flexShrink: 0 }}>
          <div style={{
            width: '42px',
            minHeight: '42px',
            background: item.image_status === 'done' && item.image_url ? 'transparent' : 'var(--dk3)',
            borderRadius: '9px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '22px', overflow: 'hidden',
          }}>
            {item.image_status === 'done' && item.image_url ? (
              <img
                src={item.image_url}
                alt={item.name}
                style={{ width: '42px', height: 'auto', display: 'block' }}
              />
            ) : (
              item.emoji ?? '🥄'
            )}
          </div>
          {item.image_status === 'generating' && (
            <div style={{
              position: 'absolute', bottom: 0, left: 0,
              width: '7px', height: '7px', borderRadius: '50%',
              background: 'var(--am)',
              animation: 'nb2-pulse 1.2s ease-in-out infinite',
            }} />
          )}
        </div>

        {/* Name + total */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--tp)' }}>
            {item.name}
          </div>
          {totalLabel && (
            <div style={{ fontSize: '11px', color: 'var(--am)', marginTop: '1px' }}>
              {totalLabel}
            </div>
          )}
        </div>

        <ChevronDown
          size={16}
          color="var(--tm)"
          style={{
            flexShrink: 0,
            transition: 'transform 0.2s',
            transform: isOpen ? 'rotate(180deg)' : 'none',
          }}
        />
      </div>

      {/* Expanded body */}
      {isOpen && (
        <div style={{ borderTop: '0.5px solid var(--br)' }}>
          {item.consolidated_prep && (
            <div style={{
              padding: '8px 14px',
              fontSize: '11px', fontStyle: 'italic', color: 'var(--am)',
              borderBottom: '0.5px solid var(--br)',
              lineHeight: 1.5,
            }}>
              {item.consolidated_prep}
            </div>
          )}

          {item.dishes.map((dish, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex', alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '9px 14px',
                borderBottom: '0.5px solid var(--br)',
              }}
            >
              <span style={{ fontSize: '12px', color: 'var(--tp)', fontWeight: 500, minWidth: 0 }}>
                {dish.recipe_name}
                <span style={{ fontSize: '10px', color: 'var(--ts)', fontWeight: 400, marginLeft: '4px' }}>
                  · {slotDayLabel(dish.slot_date)}
                </span>
              </span>
              <span style={{ fontSize: '11px', color: 'var(--ts)', flexShrink: 0, textAlign: 'right' }}>
                {dish.quantity != null ? (
                  <>
                    {formatTotals([{ quantity: dish.quantity, unit: dish.unit }], 1)}
                    {dish.prep_note && (
                      <span style={{ color: 'var(--tm)' }}> — {dish.prep_note}</span>
                    )}
                  </>
                ) : dish.prep_note ? (
                  <span style={{ color: 'var(--tm)' }}>{dish.prep_note}</span>
                ) : '—'}
              </span>
            </div>
          ))}

          {/* Move button */}
          <button
            onClick={e => { e.stopPropagation(); onMove() }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
              padding: '9px 14px',
              background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              color: 'var(--ts)', fontSize: '11px',
            }}
          >
            {section === 'prep' ? (
              <><ArrowDown size={11} /> Move to "No Prep"</>
            ) : (
              <><ArrowUp size={11} /> Move to "Needs Prep"</>
            )}
          </button>
        </div>
      )}
    </div>
  )
}
