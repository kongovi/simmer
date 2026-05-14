import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronDown, CalendarDays } from 'lucide-react'
import { Screen } from '../components/layout/Screen'
import { useAppStore } from '../stores/appStore'
import { useUserSettings } from '../hooks/useUserSettings'
import { useMealPrep, formatTotals, slotDayLabel } from '../hooks/useMealPrep'
import type { PrepIngredient } from '../hooks/useMealPrep'
import { getWeekStart, toISODate, formatWeekRange } from '../lib/weekUtils'

// ── MealPrepScreen ────────────────────────────────────────────────────────────

export function MealPrepScreen() {
  const navigate = useNavigate()

  // Use the planner's current week from global store, fall back to current week
  const plannerWeekStart = useAppStore(s => s.plannerWeekStart)
  const { data: settings } = useUserSettings()
  const planDow = settings?.plan_start_dow ?? 5

  const weekStart = plannerWeekStart ?? toISODate(getWeekStart(planDow))
  const weekStartDate = new Date(`${weekStart}T12:00:00`)
  const weekLabel = formatWeekRange(weekStartDate)

  const { data: prepItems = [], isLoading } = useMealPrep(weekStart)

  const [search,   setSearch]   = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  function toggleCard(ingredientId: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(ingredientId)) next.delete(ingredientId)
      else next.add(ingredientId)
      return next
    })
  }

  const filtered = search.trim()
    ? prepItems.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : prepItems

  return (
    <Screen>
      <div style={{ padding: '16px 16px 0' }}>
        {/* Header */}
        <h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--tp)', margin: '0 0 3px' }}>
          Meal Prep
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--ts)', margin: '0 0 14px' }}>
          Week of {weekLabel} — ingredient totals
        </p>

        {/* Search bar */}
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

      {/* Ingredient card list */}
      {!isLoading && filtered.length > 0 && (
        <div style={{ padding: '0 16px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' }}>
            This week's prep
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {filtered.map(item => (
              <PrepCard
                key={item.ingredient_id}
                item={item}
                isOpen={expanded.has(item.ingredient_id)}
                onToggle={() => toggleCard(item.ingredient_id)}
              />
            ))}
          </div>
        </div>
      )}
    </Screen>
  )
}

// ── PrepCard ──────────────────────────────────────────────────────────────────

function PrepCard({
  item, isOpen, onToggle,
}: {
  item:     PrepIngredient
  isOpen:   boolean
  onToggle: () => void
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
      {/* Card header — always visible, tap to expand */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 14px',
          cursor: 'pointer',
        }}
      >
        {/* Emoji */}
        <div style={{
          width: '36px', height: '36px', flexShrink: 0,
          background: 'var(--dk3)', borderRadius: '9px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '20px',
        }}>
          {item.emoji ?? '🥄'}
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

        {/* Chevron */}
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
          {/* Consolidated prep note */}
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

          {/* Per-dish breakdown */}
          {item.dishes.map((dish, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex', alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '9px 14px',
                borderBottom: idx < item.dishes.length - 1 ? '0.5px solid var(--br)' : 'none',
              }}
            >
              {/* Dish name + day */}
              <span style={{ fontSize: '12px', color: 'var(--tp)', fontWeight: 500, minWidth: 0 }}>
                {dish.recipe_name}
                <span style={{ fontSize: '10px', color: 'var(--ts)', fontWeight: 400, marginLeft: '4px' }}>
                  · {slotDayLabel(dish.slot_date)}
                </span>
              </span>

              {/* Qty + prep note */}
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
        </div>
      )}
    </div>
  )
}
