import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { Screen } from '../components/layout/Screen'
import { useUserSettings, useUpdatePlanStartDow } from '../hooks/useUserSettings'
import { useSlotsForWeek, useAddDish, useRemoveDish, groupBySlot, dishDisplayName, dishEmoji } from '../hooks/useMealPlan'
import type { SlotDish } from '../hooks/useMealPlan'
import {
  getWeekStart, shiftWeek, getWeekDays, formatWeekRange,
  toISODate, isToday, DOW_NAMES,
} from '../lib/weekUtils'
import type { MealType } from '../types'
import { useAppStore } from '../stores/appStore'

// ── Constants ────────────────────────────────────────────────────────────────

const MEAL_TYPES: { key: MealType; label: string }[] = [
  { key: 'breakfast', label: 'B' },
  { key: 'lunch',     label: 'L' },
  { key: 'dinner',    label: 'D' },
]

// ── PlannerScreen ─────────────────────────────────────────────────────────────

export function PlannerScreen() {
  const navigate = useNavigate()

  // ── Settings / plan start dow ──
  const { data: settings }  = useUserSettings()
  const updateDow           = useUpdatePlanStartDow()
  const planDow             = settings?.plan_start_dow ?? 5   // default Friday

  // ── Week navigation ──
  const [weekStartDate, setWeekStartDate] = useState<Date>(() => getWeekStart(planDow))
  const weekStart = toISODate(weekStartDate)
  const weekDays  = useMemo(() => getWeekDays(weekStartDate), [weekStartDate])
  const weekLabel = formatWeekRange(weekStartDate)

  // Sync weekStart when settings load for the first time
  const [lastAppliedDow, setLastAppliedDow] = useState<number | null>(null)
  if (settings && settings.plan_start_dow !== lastAppliedDow) {
    setLastAppliedDow(settings.plan_start_dow)
    setWeekStartDate(getWeekStart(settings.plan_start_dow))
  }

  // ── Sync current week to global store so Prep tab stays in sync ──
  const setPlannerWeekStart = useAppStore(s => s.setPlannerWeekStart)
  useEffect(() => { setPlannerWeekStart(weekStart) }, [weekStart, setPlannerWeekStart])

  // ── Column visibility — Breakfast hidden by default ──
  const [colVisible, setColVisible] = useState({ breakfast: false, lunch: true, dinner: true })

  // ── Slot popover state ──
  const [popover, setPopover] = useState<PopoverState | null>(null)

  // ── Data ──
  const { data: slots = [], isLoading: slotsLoading } = useSlotsForWeek(weekStart)
  const slotMap = useMemo(() => groupBySlot(slots), [slots])
  const addDish    = useAddDish()
  const removeDish = useRemoveDish()

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleDowChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const dow = parseInt(e.target.value, 10)
    updateDow.mutate(dow)
    setLastAppliedDow(dow)
    setWeekStartDate(getWeekStart(dow))
  }

  function openSlot(slotDate: string, mealType: MealType) {
    const key    = `${slotDate}_${mealType}`
    const dishes = slotMap.get(key) ?? []
    setPopover({ slotDate, mealType, dishes, inputVal: '', confirmDeleteId: null })
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
      return remaining.length === 0
        ? null
        : { ...p, dishes: remaining, confirmDeleteId: null }
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
      slotDate:     popover.slotDate,
      mealType:     popover.mealType,
      freeformName: name,
      sortOrder:    existing.length,
    })
    setPopover(p => p ? { ...p, inputVal: '' } : p)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const visibleCols = MEAL_TYPES.filter(m => colVisible[m.key])

  return (
    <Screen style={{ paddingBottom: 'calc(68px + 56px + env(safe-area-inset-bottom))' }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 130px' }}>

          {/* Header */}
          <h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--tp)', margin: '0 0 14px' }}>
            Meal Planner
          </h1>

          {/* Week nav row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <button onClick={() => setWeekStartDate(d => shiftWeek(d, -1))} style={navBtnStyle}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--tp)' }}>{weekLabel}</span>
            <button onClick={() => setWeekStartDate(d => shiftWeek(d, 1))} style={navBtnStyle}>
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Start day dropdown + column toggles on one row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <span style={{ fontSize: '10px', color: 'var(--ts)', whiteSpace: 'nowrap' }}>Start day</span>
            <select
              value={planDow}
              onChange={handleDowChange}
              style={{
                background: 'var(--dk3)', border: '0.5px solid var(--brh)',
                borderRadius: '6px', padding: '3px 7px',
                color: 'var(--tp)', fontSize: '10px',
                fontFamily: 'inherit', flexShrink: 0, cursor: 'pointer',
              }}
            >
              {DOW_NAMES.map((name, i) => (
                <option key={i} value={i}>{name}</option>
              ))}
            </select>

            <div style={{ flex: 1 }} />

            {/* Column visibility toggles — ABOVE the table, never inside header */}
            <div style={{ display: 'flex', gap: '5px' }}>
              {MEAL_TYPES.map(m => {
                const on = colVisible[m.key]
                return (
                  <button
                    key={m.key}
                    onClick={() => setColVisible(prev => ({ ...prev, [m.key]: !prev[m.key] }))}
                    style={{
                      fontSize: '10px', fontWeight: 500,
                      padding: '4px 10px', borderRadius: '18px',
                      border: `0.5px solid ${on ? 'var(--brh)' : 'var(--br)'}`,
                      background: on ? 'var(--dkc)' : 'none',
                      color: on ? 'var(--tp)' : 'var(--tm)',
                      textDecoration: on ? 'none' : 'line-through',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {m.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Plan with Claude — dashed sage button */}
          <button
            onClick={() => navigate('/planner/claude', {
              state: { weekStart, weekDays: weekDays.map(toISODate) },
            })}
            style={{
              width: '100%', background: 'rgba(123,175,138,0.06)',
              border: '0.5px dashed rgba(123,175,138,0.35)',
              borderRadius: '11px', padding: '9px 13px',
              display: 'flex', alignItems: 'center', gap: '9px',
              marginBottom: '12px', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <Sparkles size={16} color="var(--am)" style={{ flexShrink: 0 }} />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--am)' }}>
                Plan my week with Claude →
              </div>
              <div style={{ fontSize: '10px', color: 'var(--ts)', marginTop: '1px' }}>
                Describe meals and Claude fills the grid
              </div>
            </div>
          </button>

          {/* Slots loading indicator */}
          {slotsLoading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0' }}>
              <div style={{ width: '16px', height: '16px', border: '2px solid var(--br)', borderTopColor: 'var(--am)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            </div>
          )}

          {/* Planner grid table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4px', opacity: slotsLoading ? 0.4 : 1, transition: 'opacity 0.2s' }}>
            <thead>
              <tr>
                <th style={thDayStyle} />
                {visibleCols.map(m => (
                  <th key={m.key} style={thColStyle}>{m.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekDays.map(day => {
                const dateStr = toISODate(day)
                const today   = isToday(day)
                const label   = day.toLocaleString('default', { weekday: 'short' })
                return (
                  <tr key={dateStr}>
                    <td style={{
                      fontSize: '9px', fontWeight: 500,
                      padding: '4px 4px 4px 0',
                      textAlign: 'left', verticalAlign: 'top',
                      whiteSpace: 'nowrap',
                      color: today ? 'var(--am)' : 'var(--tm)',
                    }}>
                      <div>{label}</div>
                      <div style={{ fontSize: '8px', marginTop: '1px', opacity: 0.7 }}>
                        {day.getDate()}
                      </div>
                    </td>
                    {visibleCols.map(m => {
                      const dishes = slotMap.get(`${dateStr}_${m.key}`) ?? []
                      return (
                        <td key={m.key} style={{ padding: '2px', verticalAlign: 'top' }}>
                          <SlotCell
                            dishes={dishes}
                            onClick={() => openSlot(dateStr, m.key)}
                          />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Generate grocery list — pinned above bottom nav */}
        <div style={{
          position: 'fixed', bottom: 'calc(68px + env(safe-area-inset-bottom))', left: 0, right: 0,
          padding: '8px 16px',
          background: 'var(--dk)',
          borderTop: '0.5px solid var(--br)',
          zIndex: 5,
        }}>
          <button
            onClick={() => navigate('/staging', { state: { weekStart, from: 'planner' } })}
            style={{
              width: '100%', padding: '12px',
              background: 'var(--am)',
              color: '#141820',
              border: 'none', borderRadius: '11px',
              fontSize: '13px', fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
            }}
          >
            <Sparkles size={15} /> Generate grocery list
          </button>
        </div>
      </div>

      {/* Backdrop + slot popover */}
      {popover && (
        <>
          <div
            onClick={closePopover}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 39 }}
          />
          <SlotPopover
            popover={popover}
            onInputChange={v => setPopover(p => p ? { ...p, inputVal: v } : p)}
            onAdd={handleAddDish}
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

// ── SlotCell ──────────────────────────────────────────────────────────────────

function SlotCell({ dishes, onClick }: { dishes: SlotDish[]; onClick: () => void }) {
  const filled = dishes.length > 0
  return (
    <div
      onClick={onClick}
      style={{
        background: filled ? 'var(--dkc)' : 'var(--dk3)',
        border: `0.5px solid ${filled ? 'var(--brh)' : 'var(--br)'}`,
        borderRadius: '8px',
        minHeight: '72px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: filled ? 'flex-start' : 'center',
        padding: filled ? '5px 3px 4px' : '0',
        gap: '2px',
        transition: 'border-color 0.15s',
      }}
    >
      {filled ? (
        <>
          {dishes.map((d, idx) => (
            <div
              key={d.id}
              style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}
            >
              {idx > 0 && (
                <div style={{ width: '75%', height: '0.5px', background: 'rgba(255,255,255,0.1)', margin: '2px 0' }} />
              )}
              <span style={{ fontSize: '15px', lineHeight: 1 }}>{dishEmoji(d)}</span>
              <span style={{
                fontSize: '6px', color: 'var(--ts)', textAlign: 'center', lineHeight: 1.2,
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxWidth: '100%',
              }}>
                {dishDisplayName(d)}
              </span>
            </div>
          ))}
          <span style={{ fontSize: '8px', color: 'var(--am)', opacity: 0.7, marginTop: '1px' }}>
            · add
          </span>
        </>
      ) : (
        <span style={{ fontSize: '17px', color: 'var(--tm)' }}>+</span>
      )}
    </div>
  )
}

// ── SlotPopover ───────────────────────────────────────────────────────────────

interface PopoverState {
  slotDate:        string
  mealType:        MealType
  dishes:          SlotDish[]
  inputVal:        string
  confirmDeleteId: string | null
}

function SlotPopover({
  popover, onInputChange, onAdd,
  onDeleteClick, onDeleteConfirm, onDeleteCancel, onClose,
}: {
  popover:         PopoverState
  onInputChange:   (v: string) => void
  onAdd:           () => void
  onDeleteClick:   (id: string) => void
  onDeleteConfirm: (id: string) => void
  onDeleteCancel:  () => void
  onClose:         () => void
}) {
  const dayLabel  = new Date(popover.slotDate + 'T12:00:00').toLocaleString('default', { weekday: 'long' })
  const mealLabel = popover.mealType.charAt(0).toUpperCase() + popover.mealType.slice(1)

  return (
    <div style={{
      position: 'fixed',
      left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
      zIndex: 40,
      width: 'min(280px, calc(100vw - 32px))',
      background: 'var(--dk2)',
      border: '0.5px solid var(--brh)',
      borderRadius: '14px',
      padding: '14px',
    }}>
      {/* Title */}
      <div style={{
        fontSize: '10px', fontWeight: 500, color: 'var(--tm)',
        textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px',
      }}>
        {dayLabel} · {mealLabel}
      </div>

      {/* Dish list */}
      <div>
        {popover.dishes.length === 0 && (
          <p style={{ fontSize: '12px', color: 'var(--tm)', margin: '0 0 10px', textAlign: 'center' }}>
            No dishes yet
          </p>
        )}
        {popover.dishes.map(d => {
          const isConfirming = popover.confirmDeleteId === d.id
          return (
            <div
              key={d.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '7px 0',
                borderBottom: '0.5px solid var(--br)',
              }}
            >
              <span style={{ fontSize: '16px' }}>{dishEmoji(d)}</span>
              {isConfirming ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--ts)' }}>
                    Remove "{dishDisplayName(d)}"?
                  </span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={onDeleteCancel} style={cancelBtnStyle}>Cancel</button>
                    <button onClick={() => onDeleteConfirm(d.id)} style={removeBtnStyle}>Remove</button>
                  </div>
                </div>
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: '12px', color: 'var(--tp)', fontWeight: 500 }}>
                    {dishDisplayName(d)}
                  </span>
                  <button
                    onClick={() => onDeleteClick(d.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', fontSize: '14px', padding: '2px 4px' }}
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Add row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', paddingTop: '10px' }}>
        <input
          value={popover.inputVal}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onAdd() }}
          placeholder="Add another dish…"
          style={{
            flex: 1, background: 'var(--dk3)',
            border: '0.5px solid var(--brh)', borderRadius: '8px',
            padding: '6px 9px', color: 'var(--tp)',
            fontSize: '11px', fontFamily: 'inherit', outline: 'none',
          }}
        />
        <button
          onClick={onAdd}
          disabled={!popover.inputVal.trim()}
          style={{
            background: popover.inputVal.trim() ? 'var(--am)' : 'var(--dk3)',
            border: 'none', borderRadius: '7px',
            padding: '6px 10px',
            color: popover.inputVal.trim() ? '#141820' : 'var(--tm)',
            fontSize: '11px', fontWeight: 500,
            fontFamily: 'inherit',
            cursor: popover.inputVal.trim() ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s',
          }}
        >
          Add
        </button>
      </div>

      {/* Done */}
      <button
        onClick={onClose}
        style={{
          width: '100%', marginTop: '10px',
          background: 'none', border: '0.5px solid var(--brh)',
          borderRadius: '9px', padding: '7px',
          color: 'var(--ts)', fontSize: '11px',
          fontFamily: 'inherit', cursor: 'pointer',
        }}
      >
        Done
      </button>
    </div>
  )
}

// ── Shared button styles ──────────────────────────────────────────────────────

const navBtnStyle: React.CSSProperties = {
  background: 'none', border: '0.5px solid var(--br)',
  borderRadius: '7px', padding: '5px 8px',
  color: 'var(--ts)', cursor: 'pointer',
  display: 'flex', alignItems: 'center',
}

const thColStyle: React.CSSProperties = {
  fontSize: '9px', fontWeight: 500, color: 'var(--tm)',
  textAlign: 'center', padding: '4px 2px', letterSpacing: '0.3px',
}

const thDayStyle: React.CSSProperties = {
  ...thColStyle, width: '28px', textAlign: 'left',
}

const cancelBtnStyle: React.CSSProperties = {
  background: 'none', border: '0.5px solid var(--br)',
  borderRadius: '6px', padding: '3px 8px',
  fontSize: '10px', fontFamily: 'inherit', cursor: 'pointer',
  color: 'var(--ts)',
}

const removeBtnStyle: React.CSSProperties = {
  background: 'rgba(192,98,90,0.1)', border: '0.5px solid var(--rd)',
  borderRadius: '6px', padding: '3px 8px',
  fontSize: '10px', fontFamily: 'inherit', cursor: 'pointer',
  color: 'var(--rd)',
}

