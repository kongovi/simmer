import { useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { useSlotsForWeek, useAddDish, groupBySlot, dishDisplayName, dishEmoji } from '../hooks/useMealPlan'
import type { SlotDish } from '../hooks/useMealPlan'
import { useUserSettings } from '../hooks/useUserSettings'
import {
  getWeekStart, shiftWeek, getWeekDays, formatWeekRange,
  toISODate, isToday,
} from '../lib/weekUtils'
import type { MealType } from '../types'

interface AddToPlanState {
  recipeId:    string
  recipeName:  string
  recipeEmoji: string | null
}

const MEAL_TYPES: { key: MealType; label: string }[] = [
  { key: 'breakfast', label: 'B' },
  { key: 'lunch',     label: 'L' },
  { key: 'dinner',    label: 'D' },
]

export function AddToPlanScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const recipeState = (location.state ?? {}) as Partial<AddToPlanState>

  const { data: settings } = useUserSettings()
  const planDow = settings?.plan_start_dow ?? 5

  const [weekStartDate, setWeekStartDate] = useState<Date>(() => getWeekStart(planDow))
  const weekStart = toISODate(weekStartDate)
  const weekDays  = useMemo(() => getWeekDays(weekStartDate), [weekStartDate])
  const weekLabel = formatWeekRange(weekStartDate)

  const { data: slots = [] } = useSlotsForWeek(weekStart)
  const slotMap = useMemo(() => groupBySlot(slots), [slots])
  const addDish = useAddDish()

  const recipeName  = recipeState.recipeName  ?? 'Recipe'
  const recipeEmoji = recipeState.recipeEmoji ?? '🍽️'
  const recipeId    = recipeState.recipeId

  function handleSlotTap(slotDate: string, mealType: MealType) {
    const existing = slotMap.get(`${slotDate}_${mealType}`) ?? []
    addDish.mutate(
      {
        weekStart,
        slotDate,
        mealType,
        freeformName: recipeName,
        recipeId,
        sortOrder: existing.length,
      },
      {
        onSuccess: () => navigate(-1),
      }
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--dk)' }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 0' }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--ts)', display: 'flex', alignItems: 'center',
            gap: '4px', fontSize: '13px', padding: 0, marginBottom: '12px',
          }}
        >
          <ArrowLeft size={15} /> {recipeName}
        </button>
        <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--tp)', margin: '0 0 2px' }}>
          Add to plan
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--ts)', margin: '0 0 14px' }}>
          Tap any slot to place · tap filled to stack
        </p>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 24px' }}>

        {/* Week nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <button onClick={() => setWeekStartDate(d => shiftWeek(d, -1))} style={navBtnStyle}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--tp)' }}>{weekLabel}</span>
          <button onClick={() => setWeekStartDate(d => shiftWeek(d, 1))} style={navBtnStyle}>
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Recipe being placed */}
        <div style={{
          marginBottom: '12px', padding: '9px 11px',
          background: 'var(--dkc)', borderRadius: '10px',
          border: '0.5px solid var(--br)',
          display: 'flex', alignItems: 'center', gap: '9px',
        }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: 'var(--dk3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '18px', flexShrink: 0,
          }}>
            {recipeEmoji}
          </div>
          <div>
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--tp)' }}>{recipeName}</div>
            <div style={{ fontSize: '10px', color: 'var(--ts)' }}>
              Tap any slot to place · tap filled to stack
            </div>
          </div>
        </div>

        {/* Grid table — all 3 columns always visible */}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '28px', textAlign: 'left' }} />
              {MEAL_TYPES.map(m => (
                <th key={m.key} style={thStyle}>{m.label}</th>
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
                  {MEAL_TYPES.map(m => {
                    const dishes = slotMap.get(`${dateStr}_${m.key}`) ?? []
                    return (
                      <td key={m.key} style={{ padding: '2px', verticalAlign: 'top' }}>
                        <AddSlotCell
                          dishes={dishes}
                          onClick={() => handleSlotTap(dateStr, m.key)}
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
    </div>
  )
}

// ── AddSlotCell — simplified, no popover, just tap-to-place ──────────────────

function AddSlotCell({ dishes, onClick }: { dishes: SlotDish[]; onClick: () => void }) {
  const filled = dishes.length > 0
  return (
    <div
      onClick={onClick}
      style={{
        background: filled ? 'var(--dkc)' : 'var(--dk3)',
        border: `0.5px solid ${filled ? 'var(--brh)' : 'var(--br)'}`,
        borderRadius: '8px',
        minHeight: '60px',
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
              <span style={{ fontSize: '14px', lineHeight: 1 }}>{dishEmoji(d)}</span>
              <span style={{
                fontSize: '6px', color: 'var(--ts)', textAlign: 'center', lineHeight: 1.2,
                overflow: 'hidden', display: '-webkit-box',
                WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', maxWidth: '100%',
              }}>
                {dishDisplayName(d)}
              </span>
            </div>
          ))}
          <span style={{ fontSize: '7px', color: 'var(--am)', opacity: 0.7, marginTop: '1px' }}>
            + stack
          </span>
        </>
      ) : (
        <span style={{ fontSize: '17px', color: 'var(--tm)' }}>+</span>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const navBtnStyle: React.CSSProperties = {
  background: 'none', border: '0.5px solid var(--br)',
  borderRadius: '7px', padding: '5px 8px',
  color: 'var(--ts)', cursor: 'pointer',
  display: 'flex', alignItems: 'center',
}

const thStyle: React.CSSProperties = {
  fontSize: '9px', fontWeight: 500, color: 'var(--tm)',
  textAlign: 'center', padding: '4px 2px', letterSpacing: '0.3px',
}
