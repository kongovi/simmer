import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Sparkles, Flame } from 'lucide-react'
import { useAIModelLabel } from '../lib/ai/modelLabel'
import { Screen } from '../components/layout/Screen'
import { useUserSettings, useUpdatePlanStartDow } from '../hooks/useUserSettings'
import { useSlotsForWeek, useAddDish, useRemoveDish, groupBySlot, dishDisplayName, dishEmoji } from '../hooks/useMealPlan'
import type { SlotDish } from '../hooks/useMealPlan'
import { useRecipes } from '../hooks/useRecipes'
import {
  getWeekStart, shiftWeek, getWeekDays, formatWeekRange,
  toISODate, isToday, DOW_NAMES,
} from '../lib/weekUtils'
import type { MealType } from '../types'
import { useAppStore } from '../stores/appStore'

// ── Constants ────────────────────────────────────────────────────────────────

const MEAL_TYPES: { key: MealType; label: string; short: string }[] = [
  { key: 'breakfast', label: 'Breakfast', short: 'Bkfst' },
  { key: 'lunch',     label: 'Lunch',     short: 'Lunch'  },
  { key: 'dinner',    label: 'Dinner',    short: 'Dinner' },
]

// ── useIsWide ─────────────────────────────────────────────────────────────────

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

// ── PlannerScreen ─────────────────────────────────────────────────────────────

export function PlannerScreen() {
  const navigate  = useNavigate()
  const aiLabel   = useAIModelLabel()
  const isWide    = useIsWide()

  // ── Settings / plan start dow ──
  const { data: settings }  = useUserSettings()
  const updateDow           = useUpdatePlanStartDow()
  const planDow             = settings?.plan_start_dow ?? 5

  // ── Week navigation ──
  const [weekStartDate, setWeekStartDate] = useState<Date>(() => getWeekStart(planDow))
  const weekStart = toISODate(weekStartDate)
  const weekDays  = useMemo(() => getWeekDays(weekStartDate), [weekStartDate])
  const weekLabel = formatWeekRange(weekStartDate)

  const [lastAppliedDow, setLastAppliedDow] = useState<number | null>(null)
  if (settings && settings.plan_start_dow !== lastAppliedDow) {
    setLastAppliedDow(settings.plan_start_dow)
    setWeekStartDate(getWeekStart(settings.plan_start_dow))
  }

  const setPlannerWeekStart = useAppStore(s => s.setPlannerWeekStart)
  useEffect(() => { setPlannerWeekStart(weekStart) }, [weekStart, setPlannerWeekStart])

  // ── Column visibility ──
  const [colVisible, setColVisible] = useState({ breakfast: false, lunch: true, dinner: true })
  const visibleCols = MEAL_TYPES.filter(m => colVisible[m.key])

  // ── Mobile: active column + swipe ──
  const [mobileColIdx, setMobileColIdx] = useState(0)
  // Clamp if visible cols shrinks
  const clampedIdx = Math.min(mobileColIdx, Math.max(0, visibleCols.length - 1))
  const activeMobileCol = visibleCols[clampedIdx] ?? visibleCols[0]

  const touchStartX = useRef(0)
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    if (dx < -50) setMobileColIdx(i => Math.min(i + 1, visibleCols.length - 1))
    else if (dx > 50) setMobileColIdx(i => Math.max(i - 1, 0))
  }

  // ── Slot popover ──
  const [popover, setPopover] = useState<PopoverState | null>(null)

  // ── Data ──
  const { data: slots = [], isLoading: slotsLoading } = useSlotsForWeek(weekStart)
  const slotMap = useMemo(() => groupBySlot(slots), [slots])
  const addDish    = useAddDish()
  const removeDish = useRemoveDish()
  const { data: allRecipes = [] } = useRecipes({})

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleDowChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const dow = parseInt(e.target.value, 10)
    updateDow.mutate(dow)
    setLastAppliedDow(dow)
    setWeekStartDate(getWeekStart(dow))
  }

  function openSlot(slotDate: string, mealType: MealType) {
    const key    = `${slotDate}_${mealType}`
    const dishes = slotMap.get(key) ?? []
    setPopover({ slotDate, mealType, dishes, inputVal: '', selectedRecipeId: null, confirmDeleteId: null })
  }

  function closePopover() { setPopover(null) }

  function handleDeleteClick(dishId: string) {
    setPopover(p => p ? { ...p, confirmDeleteId: dishId } : p)
  }

  function handleDeleteConfirm(dishId: string) {
    removeDish.mutate({ id: dishId, weekStart })
    setPopover(p => {
      if (!p) return p
      const remaining = p.dishes.filter(d => d.id !== dishId)
      return remaining.length === 0 ? null : { ...p, dishes: remaining, confirmDeleteId: null }
    })
  }

  function handleDeleteCancel() {
    setPopover(p => p ? { ...p, confirmDeleteId: null } : p)
  }

  function handleAddDish() {
    if (!popover) return
    const name = popover.inputVal.trim()
    if (!name) return
    const existing = slotMap.get(`${popover.slotDate}_${popover.mealType}`) ?? []
    addDish.mutate({
      weekStart,
      slotDate: popover.slotDate, mealType: popover.mealType,
      freeformName: name, recipeId: popover.selectedRecipeId ?? undefined,
      sortOrder: existing.length,
    })
    setPopover(p => p ? { ...p, inputVal: '', selectedRecipeId: null } : p)
  }

  function handleSelectRecipe(recipe: { id: string; name: string }) {
    const existing = slotMap.get(`${popover?.slotDate}_${popover?.mealType}`) ?? []
    addDish.mutate({
      weekStart,
      slotDate: popover!.slotDate, mealType: popover!.mealType,
      freeformName: recipe.name, recipeId: recipe.id,
      sortOrder: existing.length,
    })
    setPopover(p => p ? { ...p, inputVal: '', selectedRecipeId: null } : p)
  }

  // ── Shared grid content ────────────────────────────────────────────────────

  // Desktop: all visible cols; Mobile: single active col
  const displayCols = isWide ? visibleCols : (activeMobileCol ? [activeMobileCol] : [])

  const gridCols = isWide
    ? `48px ${visibleCols.map(() => 'minmax(0,1fr)').join(' ')}`
    : '48px 1fr'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Screen style={{ paddingBottom: 'calc(68px + 56px + env(safe-area-inset-bottom))' }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px 140px' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Flame size={22} color="var(--am)" strokeWidth={2} />
            <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--tp)', margin: 0 }}>Meal Planner</h1>
          </div>

          {/* Week nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <button onClick={() => setWeekStartDate(d => shiftWeek(d, -1))} style={navBtnStyle}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--tp)' }}>{weekLabel}</span>
            <button onClick={() => setWeekStartDate(d => shiftWeek(d, 1))} style={navBtnStyle}>
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Start day + column toggles */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <span style={{ fontSize: '13px', color: 'var(--ts)', whiteSpace: 'nowrap' }}>Start</span>
            <select
              value={planDow}
              onChange={handleDowChange}
              style={{
                background: 'var(--dk3)', border: '0.5px solid var(--brh)',
                borderRadius: '6px', padding: '4px 8px',
                color: 'var(--tp)', fontSize: '13px',
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              {DOW_NAMES.map((name, i) => <option key={i} value={i}>{name}</option>)}
            </select>

            <div style={{ flex: 1 }} />

            <div style={{ display: 'flex', gap: '5px' }}>
              {MEAL_TYPES.map(m => {
                const on = colVisible[m.key]
                return (
                  <button
                    key={m.key}
                    onClick={() => setColVisible(prev => ({ ...prev, [m.key]: !prev[m.key] }))}
                    style={{
                      fontSize: '13px', fontWeight: 500,
                      padding: '5px 11px', borderRadius: '18px',
                      border: `0.5px solid ${on ? 'var(--brh)' : 'var(--br)'}`,
                      background: on ? 'var(--dkc)' : 'none',
                      color: on ? 'var(--tp)' : 'var(--tm)',
                      textDecoration: on ? 'none' : 'line-through',
                      cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
                    }}
                  >
                    {m.short}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Plan with Claude */}
          <button
            onClick={() => navigate('/planner/claude', { state: { weekStart, weekDays: weekDays.map(toISODate) } })}
            style={{
              width: '100%', background: 'rgba(123,175,138,0.06)',
              border: '0.5px dashed rgba(123,175,138,0.35)',
              borderRadius: '11px', padding: '10px 14px',
              display: 'flex', alignItems: 'center', gap: '10px',
              marginBottom: '16px', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Sparkles size={17} color="var(--am)" style={{ flexShrink: 0 }} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--am)' }}>
                Plan my week with {aiLabel} →
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ts)', marginTop: '2px' }}>
                Describe meals and {aiLabel} fills the grid
              </div>
            </div>
          </button>

          {/* Loading */}
          {slotsLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
              <div style={{ width: '18px', height: '18px', border: '2px solid var(--br)', borderTopColor: 'var(--am)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            </div>
          )}

          {/* ── Mobile column switcher tabs ── */}
          {!isWide && visibleCols.length > 1 && (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
              {visibleCols.map((m, idx) => {
                const active = idx === clampedIdx
                return (
                  <button
                    key={m.key}
                    onClick={() => setMobileColIdx(idx)}
                    style={{
                      flex: 1, padding: '8px 4px',
                      borderRadius: '9px',
                      border: `0.5px solid ${active ? 'var(--am)' : 'var(--br)'}`,
                      background: active ? 'rgba(123,175,138,0.12)' : 'none',
                      color: active ? 'var(--am)' : 'var(--ts)',
                      fontSize: '14px', fontWeight: active ? 600 : 400,
                      fontFamily: 'inherit', cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>
          )}

          {/* ── Planner grid ── */}
          <div
            style={{ opacity: slotsLoading ? 0.4 : 1, transition: 'opacity 0.2s' }}
            onTouchStart={!isWide ? handleTouchStart : undefined}
            onTouchEnd={!isWide ? handleTouchEnd : undefined}
          >
            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '6px', marginBottom: '6px' }}>
              <div />
              {displayCols.map(m => (
                <div key={m.key} style={{
                  fontSize: '13px', fontWeight: 600, color: 'var(--ts)',
                  textAlign: 'center', padding: '0 2px',
                }}>
                  {m.label}
                </div>
              ))}
            </div>

            {/* Day rows */}
            {weekDays.map(day => {
              const dateStr = toISODate(day)
              const today   = isToday(day)
              const weekday = day.toLocaleString('default', { weekday: 'short' })
              return (
                <div
                  key={dateStr}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: gridCols,
                    gap: '6px',
                    marginBottom: '10px',
                    alignItems: 'start',
                  }}
                >
                  {/* Day label */}
                  <div style={{
                    paddingTop: '6px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px',
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: today ? 'var(--am)' : 'var(--ts)', lineHeight: 1 }}>
                      {weekday}
                    </span>
                    <span style={{ fontSize: '15px', fontWeight: today ? 700 : 400, color: today ? 'var(--am)' : 'var(--tp)', lineHeight: 1 }}>
                      {day.getDate()}
                    </span>
                  </div>

                  {/* Meal cells */}
                  {displayCols.map(m => {
                    const dishes = slotMap.get(`${dateStr}_${m.key}`) ?? []
                    return (
                      <MealCell
                        key={m.key}
                        dishes={dishes}
                        onOpen={() => openSlot(dateStr, m.key)}
                      />
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {/* Generate grocery list — pinned */}
        <div style={{
          position: 'fixed', bottom: 'calc(68px + env(safe-area-inset-bottom))', left: 0, right: 0,
          padding: '8px 16px', background: 'var(--dk)', borderTop: '0.5px solid var(--br)', zIndex: 5,
        }}>
          <button
            onClick={() => navigate('/staging', { state: { weekStart, from: 'planner' } })}
            style={{
              width: '100%', padding: '13px',
              background: 'var(--am)', color: '#141820',
              border: 'none', borderRadius: '11px',
              fontSize: '15px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
            }}
          >
            <Sparkles size={15} /> Generate grocery list
          </button>
        </div>
      </div>

      {/* Backdrop + popover */}
      {popover && (
        <>
          <div onClick={closePopover} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 39 }} />
          <SlotPopover
            popover={popover}
            recipes={allRecipes}
            onInputChange={v => setPopover(p => p ? { ...p, inputVal: v, selectedRecipeId: null } : p)}
            onAdd={handleAddDish}
            onSelectRecipe={handleSelectRecipe}
            onDeleteClick={handleDeleteClick}
            onDeleteConfirm={handleDeleteConfirm}
            onDeleteCancel={handleDeleteCancel}
            onClose={closePopover}
          />
        </>
      )}
    </Screen>
  )
}

// ── MealCell ──────────────────────────────────────────────────────────────────

function MealCell({ dishes, onOpen }: { dishes: SlotDish[]; onOpen: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '6px', alignItems: 'flex-start' }}>
      {dishes.map(d => (
        <DishTile key={d.id} dish={d} onClick={onOpen} />
      ))}
      <button onClick={onOpen} style={{ ...addLinkStyle, alignSelf: 'center' }}>
        +add
      </button>
    </div>
  )
}

// ── DishTile ──────────────────────────────────────────────────────────────────

function DishTile({ dish, onClick }: { dish: SlotDish; onClick: () => void }) {
  const name   = dishDisplayName(dish)
  const imgUrl = dish.recipe?.image_status === 'done' ? dish.recipe.image_url : null
  const emoji  = dishEmoji(dish)

  return (
    <div
      onClick={onClick}
      style={{
        width: '120px',
        background: 'var(--dkc)',
        border: '0.5px solid var(--brh)',
        borderRadius: '10px',
        overflow: 'hidden',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'border-color 0.15s',
      }}
    >
      {imgUrl ? (
        <img src={imgUrl} alt={name} style={{ width: '120px', display: 'block' }} />
      ) : (
        <div style={{
          width: '120px', height: '100px',
          background: 'var(--dk3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: '42px', lineHeight: 1 }}>{emoji}</span>
        </div>
      )}
      <div style={{ padding: '5px 7px 7px', fontSize: '12px', fontWeight: 500, color: 'var(--tp)', lineHeight: 1.3 }}>
        {name}
      </div>
    </div>
  )
}

// ── SlotPopover ───────────────────────────────────────────────────────────────

interface PopoverState {
  slotDate:         string
  mealType:         MealType
  dishes:           SlotDish[]
  inputVal:         string
  selectedRecipeId: string | null
  confirmDeleteId:  string | null
}

function SlotPopover({
  popover, recipes, onInputChange, onAdd, onSelectRecipe,
  onDeleteClick, onDeleteConfirm, onDeleteCancel, onClose,
}: {
  popover:         PopoverState
  recipes:         { id: string; name: string; emoji: string | null }[]
  onInputChange:   (v: string) => void
  onAdd:           () => void
  onSelectRecipe:  (r: { id: string; name: string }) => void
  onDeleteClick:   (id: string) => void
  onDeleteConfirm: (id: string) => void
  onDeleteCancel:  () => void
  onClose:         () => void
}) {
  const dayLabel  = new Date(popover.slotDate + 'T12:00:00').toLocaleString('default', { weekday: 'long' })
  const mealLabel = popover.mealType.charAt(0).toUpperCase() + popover.mealType.slice(1)

  const query = popover.inputVal.trim().toLowerCase()
  const suggestions = query.length > 0
    ? recipes.filter(r => r.name.toLowerCase().includes(query)).slice(0, 5)
    : []

  return (
    <div style={{
      position: 'fixed',
      left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
      zIndex: 40,
      width: 'min(300px, calc(100vw - 32px))',
      background: 'var(--dk2)',
      border: '0.5px solid var(--brh)',
      borderRadius: '14px',
      padding: '16px',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ts)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
        {dayLabel} · {mealLabel}
      </div>

      <div>
        {popover.dishes.length === 0 && (
          <p style={{ fontSize: '14px', color: 'var(--tm)', margin: '0 0 12px', textAlign: 'center' }}>No dishes yet</p>
        )}
        {popover.dishes.map(d => {
          const isConfirming = popover.confirmDeleteId === d.id
          return (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '0.5px solid var(--br)' }}>
              <span style={{ fontSize: '18px' }}>{dishEmoji(d)}</span>
              {isConfirming ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--ts)' }}>Remove "{dishDisplayName(d)}"?</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={onDeleteCancel} style={cancelBtnStyle}>Cancel</button>
                    <button onClick={() => onDeleteConfirm(d.id)} style={removeBtnStyle}>Remove</button>
                  </div>
                </div>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: '14px', color: 'var(--tp)', fontWeight: 500 }}>{dishDisplayName(d)}</span>
                  <button onClick={() => onDeleteClick(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', fontSize: '16px', padding: '2px 4px' }}>✕</button>
                </>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ paddingTop: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <input
            value={popover.inputVal}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && suggestions.length === 0) onAdd() }}
            placeholder="Add a dish…"
            autoComplete="off"
            style={{
              flex: 1, background: 'var(--dk3)',
              border: '0.5px solid var(--brh)', borderRadius: '8px',
              padding: '8px 10px', color: 'var(--tp)',
              fontSize: '14px', fontFamily: 'inherit', outline: 'none',
            }}
          />
          <button
            onClick={onAdd}
            disabled={!popover.inputVal.trim()}
            style={{
              background: popover.inputVal.trim() ? 'var(--am)' : 'var(--dk3)',
              border: 'none', borderRadius: '7px', padding: '8px 12px',
              color: popover.inputVal.trim() ? '#141820' : 'var(--tm)',
              fontSize: '14px', fontWeight: 600, fontFamily: 'inherit',
              cursor: popover.inputVal.trim() ? 'pointer' : 'not-allowed',
              transition: 'all 0.15s',
            }}
          >
            Add
          </button>
        </div>

        {suggestions.length > 0 && (
          <div style={{ marginTop: '4px', background: 'var(--dk3)', border: '0.5px solid var(--brh)', borderRadius: '8px', overflow: 'hidden' }}>
            {suggestions.map((r, idx) => (
              <button
                key={r.id}
                onMouseDown={e => { e.preventDefault(); onSelectRecipe(r) }}
                style={{
                  width: '100%', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '8px 10px', background: 'none', border: 'none', cursor: 'pointer',
                  borderTop: idx > 0 ? '0.5px solid var(--br)' : 'none',
                  color: 'var(--tp)', fontSize: '14px', fontFamily: 'inherit', transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--dkc)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <span style={{ fontSize: '17px' }}>{r.emoji ?? '🍽️'}</span>
                <span style={{ flex: 1 }}>{r.name}</span>
                <span style={{ fontSize: '12px', color: 'var(--am)', fontWeight: 500 }}>link</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={onClose}
        style={{
          width: '100%', marginTop: '12px',
          background: 'none', border: '0.5px solid var(--brh)',
          borderRadius: '9px', padding: '9px',
          color: 'var(--ts)', fontSize: '14px',
          fontFamily: 'inherit', cursor: 'pointer',
        }}
      >
        Done
      </button>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const navBtnStyle: React.CSSProperties = {
  background: 'none', border: '0.5px solid var(--br)',
  borderRadius: '7px', padding: '6px 9px',
  color: 'var(--ts)', cursor: 'pointer',
  display: 'flex', alignItems: 'center',
}

const addLinkStyle: React.CSSProperties = {
  background: 'none', border: 'none',
  padding: '4px 2px',
  fontSize: '12px', fontWeight: 500,
  color: 'var(--am)', cursor: 'pointer',
  fontFamily: 'inherit', flexShrink: 0,
  opacity: 0.75,
  whiteSpace: 'nowrap',
}

const cancelBtnStyle: React.CSSProperties = {
  background: 'none', border: '0.5px solid var(--br)',
  borderRadius: '6px', padding: '4px 10px',
  fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer',
  color: 'var(--ts)',
}

const removeBtnStyle: React.CSSProperties = {
  background: 'rgba(192,98,90,0.1)', border: '0.5px solid var(--rd)',
  borderRadius: '6px', padding: '4px 10px',
  fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer',
  color: 'var(--rd)',
}
