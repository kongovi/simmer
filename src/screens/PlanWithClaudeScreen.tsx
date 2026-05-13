import { useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react'
import { useAddDish } from '../hooks/useMealPlan'
import { parseMealPlanText } from '../lib/mealPlanParser'
import { dayNameToDate, getWeekDays, getWeekStart, toISODate } from '../lib/weekUtils'
import { useUserSettings } from '../hooks/useUserSettings'

export function PlanWithClaudeScreen() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const state     = location.state as { weekStart?: string; weekDays?: string[] } | null

  const { data: settings } = useUserSettings()
  const planDow = settings?.plan_start_dow ?? 5

  // Reconstruct weekDays from state or fall back to current week
  const weekStartDate = state?.weekStart
    ? new Date(state.weekStart + 'T12:00:00')
    : getWeekStart(planDow)
  const weekStart = toISODate(weekStartDate)
  const weekDays  = getWeekDays(weekStartDate)

  const [text,    setText]    = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const addDish  = useAddDish()
  const didRun   = useRef(false)

  async function handleFill() {
    if (!text.trim() || loading) return
    if (didRun.current) return
    didRun.current = true

    setLoading(true)
    setError(null)

    try {
      const entries = await parseMealPlanText(text.trim())

      // Insert each dish into the DB
      for (const entry of entries) {
        const date = dayNameToDate(entry.day, weekDays)
        if (!date) continue

        const slotDate  = toISODate(date)
        const mealType  = entry.meal_type

        for (let i = 0; i < entry.dishes.length; i++) {
          const dish = entry.dishes[i]
          await addDish.mutateAsync({
            weekStart,
            slotDate,
            mealType,
            freeformName: dish.name,
            sortOrder:    i,
          })
        }
      }

      navigate('/planner', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      didRun.current = false
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--dk)' }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 0' }}>
        <button
          onClick={() => navigate('/planner')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--ts)', display: 'flex', alignItems: 'center',
            gap: '4px', fontSize: '13px', padding: 0, marginBottom: '12px',
          }}
        >
          <ArrowLeft size={15} /> Planner
        </button>
        <h1 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--tp)', margin: '0 0 4px' }}>
          Plan with Claude
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--ts)', margin: '0 0 16px' }}>
          Describe your week and Claude fills the grid
        </p>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={`e.g. Friday dinner: adana kebabs and green salad. Saturday brunch: shakshuka. Sunday dinner: butter paneer for adults, nuggets for kids.`}
          disabled={loading}
          style={{
            width: '100%',
            minHeight: '200px',
            background: 'var(--dk3)',
            border: '0.5px solid var(--brh)',
            borderRadius: '12px',
            padding: '12px',
            color: 'var(--tp)',
            fontSize: '13px',
            fontFamily: 'inherit',
            lineHeight: 1.6,
            resize: 'none',
            outline: 'none',
            opacity: loading ? 0.6 : 1,
            boxSizing: 'border-box',
          }}
        />

        {error && (
          <div style={{
            background: 'rgba(192,98,90,0.1)',
            border: '0.5px solid var(--rd)',
            borderRadius: '10px',
            padding: '10px 12px',
            fontSize: '12px', color: 'var(--rd)',
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleFill}
          disabled={!text.trim() || loading}
          style={{
            width: '100%', padding: '13px',
            background: text.trim() && !loading ? 'var(--am)' : 'var(--dk3)',
            color: text.trim() && !loading ? '#141820' : 'var(--tm)',
            border: 'none', borderRadius: '12px',
            fontSize: '14px', fontWeight: 600,
            fontFamily: 'inherit',
            cursor: text.trim() && !loading ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            transition: 'all 0.15s',
          }}
        >
          {loading
            ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Filling your planner…</>
            : <><Sparkles size={16} /> Fill my planner</>
          }
        </button>

        <p style={{ fontSize: '11px', color: 'var(--tm)', textAlign: 'center', margin: 0 }}>
          Dishes are added as freeform entries. Recipe linking coming in a future update.
        </p>
      </div>
    </div>
  )
}
