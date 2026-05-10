import { useState } from 'react'
import { X, ChevronLeft, ChevronRight, Check } from 'lucide-react'

interface CookStep {
  id: string
  step_number: number
  instruction: string
}

interface CookIngredient {
  id: string
  emoji: string
  name: string
  quantity: string
  unit: string | null
}

interface CookingModeProps {
  recipeName: string
  steps: CookStep[]
  ingredients: CookIngredient[]
  onDone: () => void
}

/** Returns the ingredients whose IDs appear in the current step's ingredient_ids (simplified: show all on step 1) */
function ingredientsForStep(_step: CookStep, allIngredients: CookIngredient[], stepIndex: number): CookIngredient[] {
  // ingredient_ids per step wired in Session 4 — show first 4 on step 1 as preview
  if (stepIndex === 0) return allIngredients.slice(0, 4)
  return []
}

export function CookingMode({ steps, ingredients, onDone }: CookingModeProps) {
  const [current, setCurrent] = useState(0)
  const total  = steps.length
  const step   = steps[current]
  const isLast = current === total - 1

  function prev() { if (current > 0) setCurrent(c => c - 1) }
  function next() {
    if (isLast) { onDone(); return }
    setCurrent(c => c + 1)
  }

  const chipIngredients = ingredientsForStep(step, ingredients, current)

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        backgroundColor: 'var(--dk)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Progress bar */}
      <div style={{ height: '3px', backgroundColor: 'var(--dk3)', flexShrink: 0 }}>
        <div
          style={{
            height: '100%',
            backgroundColor: 'var(--am)',
            width: `${((current + 1) / total) * 100}%`,
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      {/* Top bar */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px 0', flexShrink: 0,
        }}
      >
        <button
          onClick={onDone}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--ts)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px',
          }}
        >
          <X size={16} /> Exit
        </button>
        <span style={{ fontSize: '12px', color: 'var(--ts)', fontWeight: 500 }}>
          Step {current + 1} of {total}
        </span>
        {/* spacer */}
        <div style={{ width: '60px' }} />
      </div>

      {/* Step content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '24px 20px 16px', overflow: 'hidden' }}>
        <div
          style={{
            fontSize: '10px', fontWeight: 700, color: 'var(--am)',
            letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '16px',
          }}
        >
          STEP {step.step_number}
        </div>

        <p
          style={{
            fontSize: '20px', fontWeight: 500, color: 'var(--tp)',
            lineHeight: 1.5, margin: 0, flex: 1,
          }}
        >
          {step.instruction}
        </p>

        {/* Ingredient chips */}
        {chipIngredients.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '20px' }}>
            {chipIngredients.map(ing => (
              <div
                key={ing.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  backgroundColor: 'var(--dkc)', border: '0.5px solid var(--br)',
                  borderRadius: '20px', padding: '5px 10px',
                  fontSize: '12px', color: 'var(--tp)',
                }}
              >
                <span style={{ fontSize: '15px' }}>{ing.emoji}</span>
                <span>{ing.quantity}{ing.unit ? ` ${ing.unit}` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div
        style={{
          display: 'flex', gap: '12px',
          padding: '16px', flexShrink: 0,
          borderTop: '0.5px solid var(--br)',
        }}
      >
        <button
          onClick={prev}
          disabled={current === 0}
          style={{
            flex: 1, padding: '16px',
            backgroundColor: current === 0 ? 'var(--dk3)' : 'var(--dkc)',
            color: current === 0 ? 'var(--tm)' : 'var(--tp)',
            border: '0.5px solid var(--br)', borderRadius: '14px',
            fontSize: '14px', fontWeight: 500, cursor: current === 0 ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}
        >
          <ChevronLeft size={18} /> Prev
        </button>

        <button
          onClick={next}
          style={{
            flex: 2, padding: '16px',
            backgroundColor: isLast ? 'var(--gl)' : 'var(--am)',
            color: '#1a1612',
            border: 'none', borderRadius: '14px',
            fontSize: '14px', fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          }}
        >
          {isLast ? (
            <><Check size={18} /> Done ✓</>
          ) : (
            <>Next <ChevronRight size={18} /></>
          )}
        </button>
      </div>
    </div>
  )
}
