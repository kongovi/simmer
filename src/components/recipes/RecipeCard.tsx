import { useNavigate } from 'react-router-dom'
import { Clock } from 'lucide-react'
import type { Recipe } from '../../types'

// 6 retro-pop placeholder bg colors from the prototype
const CARD_COLORS = ['#d4e8d4', '#f0e8d0', '#f0e0d8', '#d8e0ea', '#dce8e0', '#ecdae2']

function cardColor(recipeId: string): string {
  // Deterministic: sum char codes mod 6
  let sum = 0
  for (let i = 0; i < recipeId.length; i++) sum += recipeId.charCodeAt(i)
  return CARD_COLORS[sum % CARD_COLORS.length]
}

function formatTime(minutes: number | null): string | null {
  if (!minutes) return null
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

interface RecipeCardProps {
  recipe: Recipe
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const navigate = useNavigate()
  const bg = recipe.image_url ? undefined : cardColor(recipe.id)
  const cookTime = formatTime(recipe.cook_time_minutes)

  return (
    <div
      onClick={() => navigate(`/recipes/${recipe.id}`)}
      style={{
        backgroundColor: 'var(--dkc)',
        border: '0.5px solid var(--br)',
        borderRadius: '13px',
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Image / placeholder area */}
      <div
        style={{
          width: '100%',
          height: '130px',
          backgroundColor: bg,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        {recipe.image_url ? (
          <img
            src={recipe.image_url}
            alt={recipe.name}
            loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              opacity: 0.45,
            }}
          >
            <span style={{ fontSize: '32px', lineHeight: 1 }}>
              {getRecipeEmoji(recipe)}
            </span>
            <span
              style={{
                fontSize: '7px',
                fontWeight: 500,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                color: 'var(--ts)',
              }}
            >
              {recipe.image_status === 'generating' ? 'NB2 · rendering' : 'NB2 · queued'}
            </span>
          </div>
        )}

        {/* NB2 badge */}
        {!recipe.image_url && (
          <div
            style={{
              position: 'absolute',
              top: '5px',
              left: '5px',
              background: 'rgba(0,0,0,0.28)',
              borderRadius: '4px',
              padding: '2px 5px',
              fontSize: '7px',
              color: 'rgba(255,255,255,0.55)',
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
            }}
          >
            ✦ NB2
          </div>
        )}
      </div>

      {/* Info row */}
      <div style={{ padding: '9px 10px 10px' }}>
        <h3
          style={{
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--tp)',
            margin: '0 0 5px',
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {recipe.name}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
          {cookTime && (
            <span
              style={{
                fontSize: '9px',
                color: 'var(--ts)',
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
              }}
            >
              <Clock size={9} />
              {cookTime}
            </span>
          )}
          {recipe.meal_type && (
            <span
              style={{
                fontSize: '9px',
                color: 'var(--am)',
                backgroundColor: 'rgba(239,159,39,0.12)',
                borderRadius: '4px',
                padding: '1px 5px',
                fontWeight: 500,
                textTransform: 'capitalize',
              }}
            >
              {recipe.meal_type}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

/** Pick the best emoji from the recipe — use first ingredient emoji if no dedicated field */
function getRecipeEmoji(recipe: Recipe): string {
  // In future we'll have a recipe-level emoji; for now use meal_type fallback
  const fallbacks: Record<string, string> = {
    breakfast: '🍳',
    lunch: '🥗',
    dinner: '🍽️',
  }
  return fallbacks[recipe.meal_type ?? ''] ?? '🍴'
}
