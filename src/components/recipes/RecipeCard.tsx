import { useNavigate } from 'react-router-dom'
import { Clock } from 'lucide-react'
import type { Recipe } from '../../types'

// 6 retro-pop placeholder bg colors from the prototype
const CARD_COLORS = ['#d4e8d4', '#f0e8d0', '#f0e0d8', '#d8e0ea', '#dce8e0', '#ecdae2']

function cardColor(recipeId: string): string {
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

/** Pick best emoji — use recipe-level emoji field, fall back to meal_type */
function getRecipeEmoji(recipe: Recipe): string {
  if (recipe.emoji) return recipe.emoji
  const fallbacks: Record<string, string> = {
    breakfast: '🍳',
    lunch: '🥗',
    dinner: '🍽️',
  }
  return fallbacks[recipe.meal_type ?? ''] ?? '🍴'
}

interface RecipeCardProps {
  recipe: Recipe
}

export function RecipeCard({ recipe }: RecipeCardProps) {
  const navigate = useNavigate()
  const hasImage = !!recipe.image_url
  const bg = hasImage ? undefined : cardColor(recipe.id)
  const cookTime = formatTime(recipe.cook_time_minutes)
  const isGenerating = recipe.image_status === 'generating'

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
        {hasImage ? (
          <img
            src={`${recipe.image_url}?t=${Date.parse(recipe.updated_at)}`}
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
              opacity: isGenerating ? 0.6 : 0.45,
              animation: isGenerating ? 'nb2-pulse 1.8s ease-in-out infinite' : undefined,
            }}
          >
            <span style={{ fontSize: '34px', lineHeight: 1 }}>
              {getRecipeEmoji(recipe)}
            </span>
            <span
              style={{
                fontSize: '7px',
                fontWeight: 500,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                color: isGenerating ? 'var(--am)' : 'var(--ts)',
              }}
            >
              {isGenerating ? 'NB2 · rendering…' : recipe.image_status === 'failed' ? 'NB2 · failed' : 'NB2 · queued'}
            </span>
          </div>
        )}

        {/* Pulsing dot — visible on top of image OR placeholder while generating */}
        {isGenerating && (
          <div
            style={{
              position: 'absolute', bottom: '6px', left: '6px',
              width: '8px', height: '8px', borderRadius: '50%',
              background: 'var(--am)', animation: 'nb2-pulse 1.2s ease-in-out infinite',
              zIndex: 2,
            }}
          />
        )}

        {/* NB2 badge — only when no real image */}
        {!hasImage && (
          <div
            style={{
              position: 'absolute',
              top: '5px',
              left: '5px',
              background: 'rgba(0,0,0,0.28)',
              borderRadius: '4px',
              padding: '2px 5px',
              fontSize: '7px',
              color: isGenerating ? 'rgba(239,159,39,0.8)' : 'rgba(255,255,255,0.55)',
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
            fontSize: '14px',
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
                fontSize: '11px',
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
                fontSize: '11px',
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
