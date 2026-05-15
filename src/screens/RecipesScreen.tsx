import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link, Plus, Search, Flame } from 'lucide-react'
import { Screen } from '../components/layout/Screen'
import { RecipeCard } from '../components/recipes/RecipeCard'
import { useRecipes, useRecipeImageRealtime, useBackfillRecipeImages } from '../hooks/useRecipes'

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
  // Kick off generation for any pending/failed recipes
  useBackfillRecipeImages()

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Flame size={22} color="var(--am)" strokeWidth={2} />
          <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--tp)', margin: 0 }}>
            Recipes
          </h1>
        </div>
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
              fontSize: '15px',
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
              fontSize: '14px',
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
          <RecipeSkeletonGrid />
        ) : recipes.length === 0 ? (
          <EmptyState onAdd={() => navigate('/recipes/new')} onImport={() => navigate('/recipes/import')} />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, 162px)',
              gap: '10px',
              justifyContent: 'start',
            }}
          >
            {recipes.map(r => <RecipeCard key={r.id} recipe={r} />)}
          </div>
        )}
      </div>
    </Screen>
  )
}

function RecipeSkeletonCard() {
  return (
    <div style={{
      borderRadius: '14px', overflow: 'hidden',
      background: 'var(--dkc)', border: '0.5px solid var(--br)',
    }}>
      {/* Image placeholder */}
      <div style={{
        height: '120px',
        background: 'linear-gradient(90deg, var(--dk3) 25%, var(--dkc) 50%, var(--dk3) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.4s infinite',
      }} />
      {/* Text lines */}
      <div style={{ padding: '10px 10px 12px' }}>
        <div style={{
          height: '11px', borderRadius: '4px', marginBottom: '6px', width: '75%',
          background: 'linear-gradient(90deg, var(--dk3) 25%, var(--dkc) 50%, var(--dk3) 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.4s infinite',
        }} />
        <div style={{
          height: '9px', borderRadius: '4px', width: '45%',
          background: 'linear-gradient(90deg, var(--dk3) 25%, var(--dkc) 50%, var(--dk3) 75%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.4s infinite 0.2s',
        }} />
      </div>
    </div>
  )
}

function RecipeSkeletonGrid() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
      {[0,1,2,3].map(i => <RecipeSkeletonCard key={i} />)}
    </div>
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
      <span style={{ fontSize: '42px' }}>🍴</span>
      <div>
        <p style={{ fontSize: '16px', fontWeight: 500, color: 'var(--tp)', margin: '0 0 4px' }}>
          No recipes yet
        </p>
        <p style={{ fontSize: '14px', color: 'var(--ts)', margin: 0 }}>
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
            fontSize: '15px',
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
            fontSize: '15px',
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
