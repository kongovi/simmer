import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Clock, Users, Minus, Plus, ChefHat, CalendarDays, Pencil } from 'lucide-react'
import { useRecipe, useRecipeIngredients, useRecipeSteps, useRecipeImageRealtime } from '../hooks/useRecipes'
import { CookingMode } from '../components/recipes/CookingMode'

// Card colors from prototype
const CARD_COLORS = ['#d4e8d4', '#f0e8d0', '#f0e0d8', '#d8e0ea', '#dce8e0', '#ecdae2']
function cardColor(id: string) {
  let sum = 0; for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i)
  return CARD_COLORS[sum % CARD_COLORS.length]
}
function formatTime(min: number | null) {
  if (!min) return null
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ''}`
}
function scale(qty: number | null, base: number, current: number): string {
  if (qty === null) return '—'
  const scaled = (qty / base) * current
  // Show clean fractions for small numbers
  if (scaled < 0.25) return '¼'
  if (scaled <= 0.33) return '⅓'
  if (scaled <= 0.5) return '½'
  if (scaled <= 0.67) return '⅔'
  if (scaled <= 0.75) return '¾'
  const rounded = Math.round(scaled * 4) / 4
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2).replace(/\.?0+$/, '')
}

type Tab = 'ingredients' | 'instructions'

export function RecipeDetailScreen() {
  const { id }    = useParams<{ id: string }>()
  const navigate  = useNavigate()

  const { data: recipe,      isLoading: rLoading } = useRecipe(id)
  const { data: ingredients, isLoading: iLoading } = useRecipeIngredients(id)
  const { data: steps,       isLoading: sLoading }  = useRecipeSteps(id)

  const [tab,         setTab]         = useState<Tab>('ingredients')
  const [servings,    setServings]    = useState<number | null>(null)
  const [cookingMode, setCookingMode] = useState(false)

  // Realtime: swap in generated image when ready
  useRecipeImageRealtime()

  const isLoading = rLoading || iLoading || sLoading

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: 'var(--dk)' }}>
        <span style={{ fontSize: '13px', color: 'var(--ts)' }}>Loading…</span>
      </div>
    )
  }

  if (!recipe) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', backgroundColor: 'var(--dk)', flexDirection: 'column', gap: '12px' }}>
        <span style={{ fontSize: '13px', color: 'var(--ts)' }}>Recipe not found</span>
        <button onClick={() => navigate('/recipes')} style={{ fontSize: '12px', color: 'var(--am)', background: 'none', border: 'none', cursor: 'pointer' }}>
          ← Back to recipes
        </button>
      </div>
    )
  }

  const baseServings  = recipe.servings ?? 4
  const currentServings = servings ?? baseServings
  const bg = recipe.image_url ? undefined : cardColor(recipe.id)

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--dk)' }}>
        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '72px' }}>

          {/* Hero image area */}
          <div style={{ position: 'relative' }}>
            <div
              style={{
                width: '100%',
                height: '220px',
                backgroundColor: bg,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {recipe.image_url ? (
                <img src={recipe.image_url} alt={recipe.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
                    opacity: recipe.image_status === 'generating' ? 0.6 : 0.35,
                    animation: recipe.image_status === 'generating' ? 'nb2-pulse 1.8s ease-in-out infinite' : undefined,
                  }}
                >
                  <span style={{ fontSize: '52px' }}>
                    {recipe.emoji ?? (recipe.meal_type === 'breakfast' ? '🍳' : recipe.meal_type === 'lunch' ? '🥗' : '🍽️')}
                  </span>
                  <span style={{ fontSize: '9px', letterSpacing: '0.5px', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', fontWeight: 500 }}>
                    {recipe.image_status === 'generating' ? 'NB2 · rendering…' : recipe.image_status === 'failed' ? 'NB2 · failed' : 'NB2 · queued'}
                  </span>
                </div>
              )}
            </div>

            {/* Back button overlay */}
            <button
              onClick={() => navigate('/recipes')}
              style={{
                position: 'absolute', top: '12px', left: '12px',
                background: 'rgba(0,0,0,0.35)', border: 'none', borderRadius: '20px',
                padding: '6px 10px', cursor: 'pointer', color: '#fff',
                display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px',
              }}
            >
              <ArrowLeft size={13} />
              Recipes
            </button>

            {/* Edit button overlay */}
            <button
              onClick={() => navigate(`/recipes/${recipe.id}/edit`)}
              style={{
                position: 'absolute', top: '12px', right: '12px',
                background: 'rgba(0,0,0,0.35)', border: 'none', borderRadius: '20px',
                padding: '6px 10px', cursor: 'pointer', color: '#fff',
                display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px',
              }}
            >
              <Pencil size={12} />
              Edit
            </button>
          </div>

          {/* Recipe header */}
          <div style={{ padding: '16px 16px 0' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--tp)', margin: '0 0 8px', lineHeight: 1.2 }}>
              {recipe.name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {recipe.cook_time_minutes && (
                <span style={{ fontSize: '12px', color: 'var(--ts)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <Clock size={12} /> {formatTime(recipe.cook_time_minutes)}
                </span>
              )}
              <span style={{ fontSize: '12px', color: 'var(--ts)', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Users size={12} /> {baseServings} servings
              </span>
              {(recipe as { difficulty?: string }).difficulty && (
                <span style={{ fontSize: '10px', color: 'var(--ts)', backgroundColor: 'var(--dk3)', borderRadius: '5px', padding: '2px 7px' }}>
                  {(recipe as { difficulty?: string }).difficulty}
                </span>
              )}
              {recipe.meal_type && (
                <span style={{ fontSize: '10px', color: 'var(--am)', backgroundColor: 'rgba(239,159,39,0.12)', borderRadius: '5px', padding: '2px 7px', textTransform: 'capitalize' }}>
                  {recipe.meal_type}
                </span>
              )}
            </div>
          </div>

          {/* Servings scaler */}
          <div style={{ margin: '16px 16px 0', backgroundColor: 'var(--dkc)', border: '0.5px solid var(--br)', borderRadius: '12px', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '13px', color: 'var(--tp)', fontWeight: 500 }}>Servings</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <button
                onClick={() => setServings(Math.max(1, currentServings - 1))}
                style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--dk3)', border: '0.5px solid var(--br)', cursor: 'pointer', color: 'var(--tp)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Minus size={13} />
              </button>
              <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--tp)', minWidth: '20px', textAlign: 'center' }}>
                {currentServings}
              </span>
              <button
                onClick={() => setServings(currentServings + 1)}
                style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: 'var(--dk3)', border: '0.5px solid var(--br)', cursor: 'pointer', color: 'var(--tp)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Plus size={13} />
              </button>
            </div>
          </div>

          {/* Tab switcher */}
          <div style={{ margin: '16px 16px 0', display: 'flex', gap: '0', backgroundColor: 'var(--dk3)', borderRadius: '10px', padding: '3px' }}>
            {(['ingredients', 'instructions'] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1, padding: '8px', borderRadius: '8px',
                  backgroundColor: tab === t ? 'var(--dkc)' : 'transparent',
                  border: tab === t ? '0.5px solid var(--br)' : 'none',
                  color: tab === t ? 'var(--tp)' : 'var(--ts)',
                  fontSize: '13px', fontWeight: tab === t ? 600 : 400,
                  cursor: 'pointer', textTransform: 'capitalize',
                  transition: 'all 0.15s',
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: '12px 16px 0' }}>
            {tab === 'ingredients' ? (
              <div style={{ backgroundColor: 'var(--dkc)', border: '0.5px solid var(--br)', borderRadius: '12px', overflow: 'hidden' }}>
                {(ingredients ?? []).map((row: { id: string; quantity: number | null; unit: string | null; prep_note: string | null; serving_note: string | null; ingredient: { name: string; emoji: string | null } | null }, idx: number) => (
                  <div
                    key={row.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '10px 14px',
                      borderBottom: idx < (ingredients?.length ?? 0) - 1 ? '0.5px solid var(--br)' : 'none',
                    }}
                  >
                    <span style={{ fontSize: '18px', flexShrink: 0 }}>{row.ingredient?.emoji ?? '🥄'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', color: 'var(--tp)', fontWeight: 500 }}>
                        {row.ingredient?.name ?? '—'}
                      </div>
                      {row.prep_note && (
                        <div style={{ fontSize: '11px', color: 'var(--ts)' }}>{row.prep_note}</div>
                      )}
                      {row.serving_note && (
                        <div style={{ fontSize: '10px', color: 'var(--tm)', fontStyle: 'italic' }}>{row.serving_note}</div>
                      )}
                    </div>
                    <span style={{ fontSize: '13px', color: 'var(--tp)', fontWeight: 500, flexShrink: 0 }}>
                      {scale(row.quantity, baseServings, currentServings)}
                      {row.unit ? ` ${row.unit}` : ''}
                    </span>
                  </div>
                ))}
                {(ingredients ?? []).length === 0 && (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>No ingredients</div>
                )}
              </div>
            ) : (
              <div style={{ backgroundColor: 'var(--dkc)', border: '0.5px solid var(--br)', borderRadius: '12px', overflow: 'hidden' }}>
                {(steps ?? []).map((step: { id: string; step_number: number; instruction: string }, idx: number) => (
                  <div
                    key={step.id}
                    style={{
                      padding: '13px 14px',
                      borderBottom: idx < (steps?.length ?? 0) - 1 ? '0.5px solid var(--br)' : 'none',
                    }}
                  >
                    <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--am)', letterSpacing: '1px', marginBottom: '5px' }}>
                      STEP {step.step_number}
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--tp)', margin: 0, lineHeight: 1.6 }}>
                      {step.instruction}
                    </p>
                  </div>
                ))}
                {(steps ?? []).length === 0 && (
                  <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ts)', fontSize: '13px' }}>No steps</div>
                )}

                {/* Start cooking button */}
                {(steps ?? []).length > 0 && (
                  <div style={{ padding: '12px 14px', borderTop: '0.5px solid var(--br)' }}>
                    <button
                      onClick={() => setCookingMode(true)}
                      style={{
                        width: '100%', padding: '12px',
                        backgroundColor: 'var(--am)', color: '#1a1612',
                        border: 'none', borderRadius: '10px',
                        fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      }}
                    >
                      <ChefHat size={16} /> Start cooking
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Pinned bottom: Add to meal plan */}
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: 'var(--dk2)', borderTop: '0.5px solid var(--br)', padding: '12px 16px' }}>
          <button
            onClick={() => navigate('/planner/add', {
              state: {
                recipeId:    recipe.id,
                recipeName:  recipe.name,
                recipeEmoji: recipe.emoji ?? (recipe.meal_type === 'breakfast' ? '🍳' : recipe.meal_type === 'lunch' ? '🥗' : '🍽️'),
              },
            })}
            style={{
              width: '100%', padding: '13px',
              backgroundColor: 'var(--dk3)', color: 'var(--tp)',
              border: '0.5px solid var(--brh)', borderRadius: '12px',
              fontSize: '14px', fontWeight: 500, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            <CalendarDays size={16} /> Add to meal plan
          </button>
        </div>
      </div>

      {/* Cooking mode overlay */}
      {cookingMode && steps && (
        <CookingMode
          recipeName={recipe.name}
          steps={steps.map((s: { id: string; step_number: number; instruction: string; ingredient_ids: string[] }) => ({
            id: s.id,
            step_number: s.step_number,
            instruction: s.instruction,
            ingredient_ids: s.ingredient_ids ?? [],
          }))}
          ingredients={(ingredients ?? []).map((r: { id: string; quantity: number | null; unit: string | null; ingredient: { id: string; name: string; emoji: string | null } | null }) => ({
            id: r.ingredient?.id ?? r.id,
            emoji: r.ingredient?.emoji ?? '🥄',
            name: r.ingredient?.name ?? '—',
            quantity: scale(r.quantity, baseServings, currentServings),
            unit: r.unit,
          }))}
          onDone={() => setCookingMode(false)}
        />
      )}

    </>
  )
}

