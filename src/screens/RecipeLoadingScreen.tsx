import { useEffect, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Check, Clock, Loader2 } from 'lucide-react'
import { parseRecipeFromText } from '../lib/recipeParser'
import { supabase } from '../lib/supabase'
import { useAIModelLabel } from '../lib/ai/modelLabel'

type StepState = 'pending' | 'active' | 'done' | 'error'

interface LoadStep {
  id: string
  label: string
  dynamicLabel?: string  // updated after completion (e.g. "Extracted 9 ingredients")
}

const BASE_STEPS: LoadStep[] = [
  { id: 'parse',      label: 'Parsing recipe text' },
  { id: 'extract',    label: 'Extracting ingredients' },
  { id: 'catalog',    label: 'Matching to items catalog…' },
  { id: 'steps',      label: 'Structuring cooking steps' },
  { id: 'image',      label: 'Generating NB2 illustration' },
]

export function RecipeLoadingScreen() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const state     = location.state as { rawText?: string; sourceUrl?: string } | null
  const aiLabel   = useAIModelLabel()

  const [stepStates, setStepStates] = useState<Record<string, StepState>>({
    parse: 'pending', extract: 'pending', catalog: 'pending', steps: 'pending', image: 'pending',
  })
  const [stepLabels, setStepLabels] = useState<Record<string, string>>({})
  const [error, setError]           = useState<string | null>(null)
  const didRun = useRef(false)

  function setStep(id: string, state: StepState, label?: string) {
    setStepStates(prev => ({ ...prev, [id]: state }))
    if (label) setStepLabels(prev => ({ ...prev, [id]: label }))
  }

  useEffect(() => {
    // Guard against StrictMode double-invoke
    if (didRun.current) return
    didRun.current = true

    if (!state?.rawText && !state?.sourceUrl) {
      navigate('/recipes/new', { replace: true })
      return
    }

    async function run() {
      try {
        // Step 1: parse/fetch
        setStep('parse', 'active')
        let rawText = state!.rawText ?? ''

        if (state!.sourceUrl) {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) throw new Error('Not authenticated')
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-url`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
                apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
              },
              body: JSON.stringify({ url: state!.sourceUrl }),
            }
          )
          const json = await res.json() as { text?: string; error?: string }
          if (json.error) throw new Error(json.error)
          rawText = json.text!
        }
        setStep('parse', 'done', 'Parsed recipe text')

        // Step 2–4 happen inside parseRecipeFromText (one AI call).
        // We animate them as the call runs.
        setStep('extract', 'active')

        const parsed = await parseRecipeFromText(rawText)

        setStep('extract', 'done', `Extracted ${parsed.ingredients.length} ingredient${parsed.ingredients.length !== 1 ? 's' : ''}`)
        setStep('catalog', 'active')

        // Small artificial pause so users can see the steps animate
        await delay(400)
        setStep('catalog', 'done', 'Matched to items catalog')
        setStep('steps', 'active')
        await delay(300)
        setStep('steps', 'done', `Structured ${parsed.steps.length} step${parsed.steps.length !== 1 ? 's' : ''}`)

        // Image generation is non-blocking (Session 3) — show as queued
        setStep('image', 'done', 'NB2 · queued')

        await delay(400)
        navigate('/recipes/review', { state: { parsed, rawText, sourceUrl: state!.sourceUrl }, replace: true })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Something went wrong'
        setError(msg)
        // Mark current active step as error
        setStepStates(prev => {
          const updated = { ...prev }
          for (const k of Object.keys(updated)) {
            if (updated[k] === 'active') updated[k] = 'error'
          }
          return updated
        })
      }
    }

    run()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--dk)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
      }}
    >
      <div style={{ width: '100%', maxWidth: '320px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--tp)', margin: '0 0 4px', textAlign: 'center' }}>
          Structuring…
        </h2>
        <p style={{ fontSize: '12px', color: 'var(--ts)', textAlign: 'center', margin: '0 0 28px' }}>
          {aiLabel} is reading your recipe
        </p>

        {/* Steps list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {BASE_STEPS.map(step => {
            const s = stepStates[step.id]
            const label = stepLabels[step.id] ?? step.label
            return (
              <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <StepIcon state={s} />
                <span
                  style={{
                    fontSize: '13px',
                    color: s === 'done' ? 'var(--tp)' : s === 'active' ? 'var(--aml)' : s === 'error' ? 'var(--rd)' : 'var(--tm)',
                    transition: 'color 0.2s',
                  }}
                >
                  {label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Error state */}
        {error && (
          <div
            style={{
              marginTop: '24px',
              backgroundColor: 'rgba(216,90,48,0.1)',
              border: '0.5px solid var(--rd)',
              borderRadius: '10px',
              padding: '12px',
            }}
          >
            <p style={{ fontSize: '12px', color: 'var(--rd)', margin: '0 0 10px' }}>{error}</p>
            <button
              onClick={() => navigate(-1)}
              style={{
                fontSize: '12px',
                color: 'var(--tp)',
                background: 'none',
                border: '0.5px solid var(--br)',
                borderRadius: '8px',
                padding: '6px 12px',
                cursor: 'pointer',
              }}
            >
              Go back
            </button>
          </div>
        )}

        {/* Skip link */}
        {!error && (
          <button
            onClick={() => navigate('/recipes/review', { state: { partial: true }, replace: true })}
            style={{
              display: 'block',
              margin: '28px auto 0',
              background: 'none',
              border: 'none',
              fontSize: '12px',
              color: 'var(--ts)',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Skip to review →
          </button>
        )}
      </div>
    </div>
  )
}

function StepIcon({ state }: { state: StepState }) {
  const size = 22
  if (state === 'done') {
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', backgroundColor: 'rgba(93,202,165,0.15)', border: '1.5px solid var(--gl)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Check size={11} color="var(--gl)" strokeWidth={2.5} />
      </div>
    )
  }
  if (state === 'active') {
    return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Loader2 size={16} color="var(--am)" strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', backgroundColor: 'rgba(216,90,48,0.15)', border: '1.5px solid var(--rd)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ fontSize: '10px', color: 'var(--rd)' }}>✕</span>
      </div>
    )
  }
  // pending
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', border: '1.5px solid var(--br)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Clock size={10} color="var(--tm)" />
    </div>
  )
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }
