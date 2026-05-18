import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Link as LinkIcon, Sparkles } from 'lucide-react'
import { useAIModelLabel } from '../lib/ai/modelLabel'
import { useEscapeKey } from '../lib/useEscapeKey'

export function RecipeImportScreen() {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const aiLabel = useAIModelLabel()

  useEscapeKey(() => navigate('/recipes'))

  const isValid = url.trim().startsWith('http')

  function handleImport() {
    if (!isValid) return
    // Pass the URL to LoadingScreen; it handles fetching + parsing
    navigate('/recipes/loading', { state: { sourceUrl: url.trim() } })
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
          <div style={{ fontSize: '17px', fontWeight: 600, color: 'var(--tp)' }}>Import from URL</div>
        </div>
      </div>
      <div style={{ padding: '4px 20px 20px 46px' }}>
        <p style={{ fontSize: '12px', color: 'var(--ts)', margin: 0 }}>
          {aiLabel} imports and structures any recipe page
        </p>
      </div>

      {/* URL input */}
      <div style={{ padding: '0 16px', flex: 1 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: 'var(--dk3)',
            border: '0.5px solid var(--brh)',
            borderRadius: '12px',
            padding: '12px 14px',
          }}
        >
          <LinkIcon size={16} color="var(--ts)" />
          <input
            type="url"
            placeholder="https://example.com/recipe…"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleImport()}
            autoFocus
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              fontSize: '13px',
              color: 'var(--tp)',
              fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Tip */}
        <p style={{ fontSize: '11px', color: 'var(--tm)', margin: '12px 0 0', lineHeight: 1.5 }}>
          Works with most recipe sites — AllRecipes, NYT Cooking, Serious Eats, personal blogs, and more.
        </p>
      </div>

      {/* CTA */}
      <div style={{ padding: '16px' }}>
        <button
          onClick={handleImport}
          disabled={!isValid}
          style={{
            width: '100%',
            padding: '14px',
            backgroundColor: isValid ? 'var(--am)' : 'var(--dk3)',
            color: isValid ? '#1a1612' : 'var(--tm)',
            border: 'none',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: isValid ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'background-color 0.15s',
          }}
        >
          <Sparkles size={16} />
          Import &amp; review
        </button>
      </div>
    </div>
  )
}
