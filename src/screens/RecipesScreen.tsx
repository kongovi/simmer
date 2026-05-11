import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link, Plus, Search } from 'lucide-react'
import { Screen } from '../components/layout/Screen'
import { RecipeCard } from '../components/recipes/RecipeCard'
import { useRecipes, useRecipeImageRealtime } from '../hooks/useRecipes'

type FilterKey = 'all' | 'dinner' | 'lunch' | 'breakfast' | 'quick'

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'dinner',    label: 'Dinner' },
  { key: 'lunch',     label: 'Lunch' },
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'quick',     label: 'Quick' },
]

export function RecipesScreen() {
  const navigate  = useNavigate()
  const [search,  setSearch]  = useState('')
  const [filter,  setFilter]  = useState<FilterKey>('all')

  // Subscribe to Realtime image updates so cards swap in the generated image
  useRecipeImageRealtime()

  const { data: recipes = [], isLoading } = useRecipes({
    search: search.trim() || undefined,
    mealType: filter === 'dinner' || filter === 'lunch' || filter === 'breakfast' ? filter : undefined,
    quickOnly: filter === 'quick',
  })

  return (
    <Screen>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 16px 0',
        }}
      >
        <h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--tp)', margin: 0 }}>
          Recipes
        </h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => navigate('/recipes/import')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--ts)' }}
          >
            <Link size={20} />
          </button>
          <button
            onClick={() => navigate('/recipes/new')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--am)' }}
          >
            <Plus size={20} />
          </button>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ padding: '12px 16px 0' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'var(--dk3)',
            border: '0.5px solid var(--brh)',
            borderRadius: '10px',
            padding: '8px 12px',
          }}
        >
          <Search size={14} color="var(--tm)" />
          <input
            type="text"
            placeholder="Search recipes…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              fontSize: '13px',
              color: 'var(--tp)',
            }}
          />
        </div>
      </div>

      {/* Filter pills */}
      <div
        style={{
          display: 'flex',
          gap: '7px',
          padding: '10px 16px 0',
          overflowX: 'auto',
        }}
      >
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              flexShrink: 0,
              padding: '5px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: filter === f.key ? 600 : 400,
              border: filter === f.key ? 'none' : '0.5px solid var(--br)',
              backgroundColor: filter === f.key ? 'var(--am)' : 'transparent',
              color: filter === f.key ? '#1a1612' : 'var(--ts)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Recipe grid */}
      <div style={{ padding: '12px 16px 0' }}>
        {isLoading ? (
          <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>
            Loading…
          </div>
        ) : recipes.length === 0 ? (
          <EmptyState onAdd={() => navigate('/recipes/new')} onImport={() => navigate('/recipes/import')} />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
            }}
          >
            {recipes.map(r => <RecipeCard key={r.id} recipe={r} />)}
          </div>
        )}
      </div>
    </Screen>
  )
}

function EmptyState({ onAdd, onImport }: { onAdd: () => void; onImport: () => void }) {
  return (
    <div
      style={{
        padding: '48px 24px',
        textAlign: 'center',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
      }}
    >
      <span style={{ fontSize: '40px' }}>🍴</span>
      <div>
        <p style={{ fontSize: '14px', fontWeight: 500, color: 'var(--tp)', margin: '0 0 4px' }}>
          No recipes yet
        </p>
        <p style={{ fontSize: '12px', color: 'var(--ts)', margin: 0 }}>
          Paste a recipe or import from a URL
        </p>
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button
          onClick={onAdd}
          style={{
            padding: '10px 18px',
            backgroundColor: 'var(--am)',
            color: '#1a1612',
            border: 'none',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Paste recipe
        </button>
        <button
          onClick={onImport}
          style={{
            padding: '10px 18px',
            backgroundColor: 'var(--dk3)',
            color: 'var(--tp)',
            border: '0.5px solid var(--br)',
            borderRadius: '10px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Import URL
        </button>
      </div>
    </div>
  )
}
