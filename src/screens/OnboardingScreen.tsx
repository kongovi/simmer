import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Flame, Upload, ChevronRight } from 'lucide-react'
import { useCompleteOnboarding, useUpdatePlanStartDow } from '../hooks/useUserSettings'
import { useOrderImport } from '../hooks/useOrderImport'
import type { ImportResult } from '../hooks/useOrderImport'

// ── Day picker data ───────────────────────────────────────────────────────────

const DAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

// ── Step indicator ────────────────────────────────────────────────────────────

function Dots({ step, total }: { step: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '32px' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === step ? '18px' : '6px',
          height: '6px', borderRadius: '3px',
          background: i === step ? 'var(--am)' : 'var(--br)',
          transition: 'width 0.25s, background 0.25s',
        }} />
      ))}
    </div>
  )
}

// ── Step 1: Welcome ───────────────────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '32px 28px', textAlign: 'center',
    }}>
      <div style={{
        width: '72px', height: '72px', borderRadius: '20px',
        background: 'rgba(123,175,138,0.15)',
        border: '0.5px solid rgba(123,175,138,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '24px',
      }}>
        <Flame size={36} color="var(--am)" strokeWidth={1.8} />
      </div>

      <h1 style={{
        fontSize: '28px', fontWeight: 700, color: 'var(--tp)',
        margin: '0 0 12px', lineHeight: 1.2,
      }}>
        Welcome to Simmer
      </h1>

      <p style={{
        fontSize: '14px', color: 'var(--ts)', lineHeight: 1.65,
        margin: '0 0 40px', maxWidth: '280px',
      }}>
        Plan meals, manage recipes, and generate smart grocery lists — for the whole family.
      </p>

      <button
        onClick={onNext}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          width: '100%', maxWidth: '280px', padding: '15px',
          background: 'var(--am)', border: 'none', borderRadius: '14px',
          color: '#141820', fontSize: '15px', fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        Get started <ChevronRight size={16} />
      </button>

      <p style={{ fontSize: '11px', color: 'var(--tm)', margin: '16px 0 0' }}>
        Your data is private and never shared.
      </p>
    </div>
  )
}

// ── Step 2: Plan start day ────────────────────────────────────────────────────

function StepPlanDay({ onNext }: { onNext: (dow: number) => void }) {
  const [selected, setSelected] = useState(5) // Friday default

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 24px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--tp)', margin: '0 0 8px' }}>
          When does your week start?
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--ts)', margin: 0, lineHeight: 1.5 }}>
          We'll use this as the start of your weekly meal plan. Most families plan from the day before they shop.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
        {DAYS.map(day => (
          <button
            key={day.value}
            onClick={() => setSelected(day.value)}
            style={{
              padding: '14px 16px',
              background: selected === day.value ? 'rgba(123,175,138,0.1)' : 'var(--dkc)',
              border: `${selected === day.value ? '1.5px' : '0.5px'} solid ${selected === day.value ? 'var(--am)' : 'var(--br)'}`,
              borderRadius: '12px',
              color: selected === day.value ? 'var(--am)' : 'var(--tp)',
              fontSize: '14px', fontWeight: selected === day.value ? 600 : 400,
              cursor: 'pointer', fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              transition: 'all 0.15s',
            }}
          >
            {day.label}
            {selected === day.value && (
              <span style={{ fontSize: '16px', lineHeight: 1 }}>✓</span>
            )}
          </button>
        ))}
      </div>

      <button
        onClick={() => onNext(selected)}
        style={{
          marginTop: '20px',
          width: '100%', padding: '15px',
          background: 'var(--am)', border: 'none', borderRadius: '14px',
          color: '#141820', fontSize: '15px', fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}
      >
        Continue <ChevronRight size={16} />
      </button>
    </div>
  )
}

// ── Step 3: Import order history ──────────────────────────────────────────────

function StepImport({ onFinish }: { onFinish: () => void }) {
  const importOrders = useOrderImport()
  const [result, setResult] = useState<ImportResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      return
    }
    const text = await file.text()
    importOrders.mutate(text, {
      onSuccess: r => setResult(r),
    })
  }, [importOrders])

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  if (result) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '32px 24px', textAlign: 'center',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
        <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--tp)', margin: '0 0 8px' }}>
          Import complete!
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--ts)', margin: '0 0 6px' }}>
          {result.imported} item{result.imported !== 1 ? 's' : ''} imported
        </p>
        {result.newToCatalog > 0 && (
          <p style={{ fontSize: '12px', color: 'var(--am)', margin: '0 0 32px' }}>
            {result.newToCatalog} new ingredient{result.newToCatalog !== 1 ? 's' : ''} added to your catalog
          </p>
        )}
        <button
          onClick={onFinish}
          style={{
            width: '100%', maxWidth: '280px', padding: '15px',
            background: 'var(--am)', border: 'none', borderRadius: '14px',
            color: '#141820', fontSize: '15px', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Let's go 🚀
        </button>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 24px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '22px', fontWeight: 700, color: 'var(--tp)', margin: '0 0 8px' }}>
          Seed your staples
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--ts)', margin: 0, lineHeight: 1.5 }}>
          Import your order history from Instacart, Amazon Fresh, or Kroger. Simmer uses it to predict when you're running low on staples.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          flex: 1, minHeight: '160px',
          border: `2px dashed ${dragOver ? 'var(--am)' : 'var(--br)'}`,
          borderRadius: '16px',
          background: dragOver ? 'rgba(123,175,138,0.06)' : 'var(--dkc)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '12px',
          cursor: 'pointer', transition: 'all 0.15s',
          marginBottom: '16px',
        }}
      >
        {importOrders.isPending ? (
          <>
            <div style={{
              width: '24px', height: '24px',
              border: '2.5px solid var(--br)', borderTopColor: 'var(--am)',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            }} />
            <span style={{ fontSize: '13px', color: 'var(--ts)' }}>Importing…</span>
          </>
        ) : (
          <>
            <Upload size={28} color="var(--tm)" />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--tp)' }}>
                Drop CSV here or tap to browse
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ts)', marginTop: '4px' }}>
                Instacart · Amazon Fresh · Kroger
              </div>
            </div>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={onFileChange}
          style={{ display: 'none' }}
        />
      </div>

      {importOrders.error && (
        <div style={{
          padding: '10px 14px', borderRadius: '10px', marginBottom: '12px',
          background: 'rgba(192,98,90,0.12)', border: '0.5px solid rgba(192,98,90,0.3)',
          fontSize: '12px', color: 'var(--rd)',
        }}>
          {importOrders.error instanceof Error ? importOrders.error.message : 'Import failed'}
        </div>
      )}

      <button
        onClick={onFinish}
        disabled={importOrders.isPending}
        style={{
          width: '100%', padding: '15px',
          background: 'var(--am)', border: 'none', borderRadius: '14px',
          color: '#141820', fontSize: '15px', fontWeight: 600,
          cursor: 'pointer', fontFamily: 'inherit',
          marginBottom: '10px',
        }}
      >
        Import & finish setup
      </button>

      <button
        onClick={onFinish}
        disabled={importOrders.isPending}
        style={{
          width: '100%', padding: '13px',
          background: 'transparent', border: '0.5px solid var(--br)', borderRadius: '14px',
          color: 'var(--ts)', fontSize: '14px', fontWeight: 500,
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        Skip for now
      </button>
    </div>
  )
}

// ── Main OnboardingScreen ─────────────────────────────────────────────────────

export function OnboardingScreen() {
  const navigate          = useNavigate()
  const completeOnboarding = useCompleteOnboarding()
  const updateDow          = useUpdatePlanStartDow()
  const [step, setStep]   = useState(0)

  async function handleFinish() {
    await completeOnboarding.mutateAsync()
    navigate('/grocery', { replace: true })
  }

  async function handlePlanDay(dow: number) {
    await updateDow.mutateAsync(dow)
    setStep(2)
  }

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      background: 'var(--dk)',
      paddingTop: 'env(safe-area-inset-top)',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      <div style={{ padding: '20px 0 0', flexShrink: 0 }}>
        <Dots step={step} total={3} />
      </div>

      {step === 0 && <StepWelcome onNext={() => setStep(1)} />}
      {step === 1 && <StepPlanDay onNext={handlePlanDay} />}
      {step === 2 && <StepImport onFinish={handleFinish} />}
    </div>
  )
}
