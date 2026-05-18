import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { useAIModelLabel } from '../lib/ai/modelLabel'
import { useEscapeKey } from '../lib/useEscapeKey'

export function RecipeEntryScreen() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const aiLabel = useAIModelLabel()

  useEscapeKey(() => navigate('/recipes'))

  function handleStructure() {
    if (!text.trim()) return
    navigate('/recipes/loading', { state: { rawText: text.trim() } })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--dk)' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 16px 0' }}>
        <button
          onClick={() => navigate('/recipes')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ts)', padding: '4px' }}
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <div style={{ fontSize: '11px', color: 'var(--ts)', fontWeight: 500 }}>Recipes</div>
          <div style={{ fontSize: '17px', fontWeight: 600, color: 'var(--tp)' }}>Paste or type</div>
        </div>
      </div>
      <div style={{ padding: '4px 20px 12px 46px' }}>
        <p style={{ fontSize: '12px', color: 'var(--ts)', margin: 0 }}>
          {aiLabel} will extract and structure it
        </p>
      </div>

      {/* Textarea */}
      <div style={{ flex: 1, padding: '0 16px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={`Paste any recipe here — from a website, a photo transcription, a family card, or just describe it in your own words.\n\nExample:\nAdana Kebabs\nServes 4, 45 min\n\n2 lbs ground lamb\n1 tsp salt\n2 tsp cumin…`}
          autoFocus
          style={{
            flex: 1,
            width: '100%',
            resize: 'none',
            backgroundColor: 'var(--dk3)',
            border: '0.5px solid var(--brh)',
            borderRadius: '12px',
            padding: '14px',
            fontSize: '13px',
            color: 'var(--tp)',
            outline: 'none',
            lineHeight: 1.6,
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* CTA */}
      <div style={{ padding: '16px' }}>
        <button
          onClick={handleStructure}
          disabled={!text.trim()}
          style={{
            width: '100%',
            padding: '14px',
            backgroundColor: text.trim() ? 'var(--am)' : 'var(--dk3)',
            color: text.trim() ? '#1a1612' : 'var(--tm)',
            border: 'none',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: text.trim() ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'background-color 0.15s',
          }}
        >
          <Sparkles size={16} />
          Structure with {aiLabel}
        </button>
      </div>
    </div>
  )
}
