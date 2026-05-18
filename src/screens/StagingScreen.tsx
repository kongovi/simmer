import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, ShoppingCart, ArrowLeftRight, X } from 'lucide-react'
import {
  useStagingIngredients,
  useStaplePredictions,
  useConfirmStagingList,
} from '../hooks/useStaples'
import type { StapleWithHistory, StagingIngredient } from '../hooks/useStaples'
import { useActiveGroceryList, useHasActiveList, useIngredientSuggestions } from '../hooks/useGroceryList'
import { detectAisleOrder } from '../lib/aisleUtils'

// ── StagingScreen ─────────────────────────────────────────────────────────────

export function StagingScreen() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const state     = location.state as { from?: 'planner' | 'grocery'; weekStart?: string } | null
  const from      = state?.from ?? 'planner'
  const weekStartFromState = state?.weekStart ?? null

  // Determine weekStart — planner passes it in state; grocery derives it from active list
  const { data: activeList } = useActiveGroceryList()
  const weekStart = weekStartFromState ?? activeList?.week_start ?? null

  // ── Data ──
  const { data: stagingIng, isLoading: ingLoading } = useStagingIngredients(weekStart)
  const { data: staplePreds, isLoading: staplesLoading } = useStaplePredictions()
  const { data: hasActiveList = false } = useHasActiveList(weekStart ?? '')

  const zone1Items          = stagingIng?.zone1 ?? []
  const zone2Items          = stagingIng?.zone2 ?? []
  const zone3PredictedItems = staplePreds?.zone3Predicted ?? []
  const zone3OtherItems     = staplePreds?.zone3Other ?? []

  // ── Selections ──
  // Zone 1: ingredient_ids the user chose "Skip" — default: none (all Need it)
  const [zone1Skip,          setZone1Skip]          = useState<Set<string>>(new Set())
  // Zone 2: ingredient_ids the user chose "Need it" — default: none (all Skip)
  const [zone2NeedIt,        setZone2NeedIt]        = useState<Set<string>>(new Set())
  // Zone 3 Predicted: ingredient_ids the user chose "Skip" — default: none (all Need it)
  const [zone3PredictedSkip, setZone3PredictedSkip] = useState<Set<string>>(new Set())
  // Zone 3 Other: ingredient_ids the user chose "Need it" — default: none (all Skip)
  const [zone3OtherNeedIt,   setZone3OtherNeedIt]   = useState<Set<string>>(new Set())

  // ── Zone 1 item swap ──
  // Maps original ingredient_id → replacement catalog item
  type Zone1Override = Pick<StagingIngredient, 'ingredient_id' | 'name' | 'emoji' | 'image_url' | 'image_status' | 'default_store' | 'aisle_order'>
  const [zone1Overrides, setZone1Overrides] = useState<Map<string, Zone1Override>>(new Map())
  const [swapTargetId, setSwapTargetId]     = useState<string | null>(null) // original ingredient_id being swapped
  const [swapSearch,   setSwapSearch]       = useState('')
  const swapSearchRef = useRef<HTMLInputElement>(null)

  const { data: swapSuggestions = [] } = useIngredientSuggestions(swapSearch)

  useEffect(() => {
    if (swapTargetId) setTimeout(() => swapSearchRef.current?.focus(), 80)
  }, [swapTargetId])

  function openSwap(originalId: string) {
    setSwapTargetId(originalId)
    setSwapSearch('')
  }

  function applySwap(sug: typeof swapSuggestions[number]) {
    if (!swapTargetId) return
    setZone1Overrides(prev => {
      const next = new Map(prev)
      next.set(swapTargetId, {
        ingredient_id: sug.id,
        name:          sug.name,
        emoji:         sug.emoji,
        image_url:     sug.image_url ?? null,
        image_status:  sug.image_status ?? null,
        default_store: sug.default_store ?? null,
        aisle_order:   sug.default_aisle_order ?? detectAisleOrder(sug.name, sug.emoji),
      })
      return next
    })
    setSwapTargetId(null)
  }

  function clearSwap(originalId: string) {
    setZone1Overrides(prev => {
      const next = new Map(prev)
      next.delete(originalId)
      return next
    })
  }

  // ── Overwrite warning ──
  const [showOverwrite, setShowOverwrite] = useState(false)

  // ── Confirm mutation ──
  const confirmList = useConfirmStagingList()

  function handleConfirm() {
    if (from === 'planner' && hasActiveList) {
      setShowOverwrite(true)
    } else {
      runConfirm()
    }
  }

  function runConfirm() {
    setShowOverwrite(false)
    confirmList.mutate(
      {
        weekStart:      weekStart!,
        from,
        zone1Items:     zone1Items
          .filter(i => !zone1Skip.has(i.ingredient_id))
          .map(i => {
            const ov = zone1Overrides.get(i.ingredient_id)
            return ov ? { ...i, ...ov } : i
          }),
        zone2Selected:  zone2Items.filter(i => zone2NeedIt.has(i.ingredient_id)),
        zone3Selected: [
          ...zone3PredictedItems.filter(i => !zone3PredictedSkip.has(i.ingredient_id)),
          ...zone3OtherItems.filter(i => zone3OtherNeedIt.has(i.ingredient_id)),
        ],
        existingListId: from === 'grocery' ? (activeList?.id ?? null) : null,
      },
      { onSuccess: () => navigate('/grocery') },
    )
  }

  // ── Helper: toggle Set ──
  function toggle(set: Set<string>, id: string): Set<string> {
    const next = new Set(set)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  }

  // ── Back navigation ──
  function goBack() {
    if (from === 'grocery') navigate('/grocery')
    else navigate('/planner')
  }

  const backLabel = from === 'grocery' ? 'Grocery' : 'Planner'

  const isLoading  = ingLoading || staplesLoading
  const isGenerating = confirmList.isPending

  const confirmLabel = from === 'grocery' ? 'Add to grocery list' : 'Generate grocery list'
  const noWeekStart  = !weekStart

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--dk)' }}>

      {/* Header */}
      <div style={{ padding: '16px 16px 0', flexShrink: 0 }}>
        <button
          onClick={goBack}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--ts)', display: 'flex', alignItems: 'center',
            gap: '5px', fontSize: '15px', padding: 0, marginBottom: '12px',
            fontFamily: 'inherit',
          }}
        >
          <ArrowLeft size={15} /> {backLabel}
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--tp)', margin: '0 0 2px' }}>
              Review &amp; stage
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--ts)', margin: 0 }}>
              Confirm what to buy this week
            </p>
          </div>
          {/* Claude badge — decorative, matches prototype */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            background: 'rgba(123,175,138,0.12)',
            border: '0.5px solid rgba(123,175,138,0.3)',
            borderRadius: '16px', padding: '5px 9px',
            fontSize: '12px', fontWeight: 500, color: 'var(--am)',
          }}>
            ✦ Claude
          </div>
        </div>
      </div>

      {/* Scrollable zones */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px calc(120px + env(safe-area-inset-bottom))' }}>

        {/* No week selected (came from grocery with no active list) */}
        {noWeekStart && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ts)', fontSize: '15px' }}>
            <p style={{ margin: '0 0 12px' }}>No active grocery list found.</p>
            <button
              onClick={() => navigate('/planner')}
              style={{
                background: 'var(--am)', color: '#141820', border: 'none',
                borderRadius: '10px', padding: '9px 18px',
                fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              Go to Planner →
            </button>
          </div>
        )}

        {!noWeekStart && (
          <>
            {/* ── Zone 1 — Buy this week ── */}
            <Zone
              variant="buy"
              title="Zone 1 — Buy this week"
              subtitle="Perishables and recipe-specific quantities — skip any you already have"
              isLoading={ingLoading}
            >
              {zone1Items.length === 0 && !ingLoading && (
                <EmptyZone>
                  {stagingIng?.hasRecipes === false
                    ? 'No recipes planned — add meals to your planner to see ingredients here.'
                    : 'No perishables found for this week.'}
                </EmptyZone>
              )}
              {zone1Items.map(item => {
                const skip = zone1Skip.has(item.ingredient_id)
                const ov   = zone1Overrides.get(item.ingredient_id)
                const displayName      = ov?.name       ?? item.name
                const displayEmoji     = ov?.emoji      ?? item.emoji
                const displayImageUrl  = ov?.image_url  ?? item.image_url
                const displayImageStatus = ov?.image_status ?? item.image_status
                const displayNote      = ov
                  ? `Subbing for ${item.name}${item.recipe_note ? ' · ' + item.recipe_note : ''}`
                  : item.recipe_note
                return (
                  <ZoneItem
                    key={item.ingredient_id}
                    emoji={displayEmoji}
                    name={displayName}
                    note={displayNote}
                    imageUrl={displayImageUrl}
                    imageStatus={displayImageStatus}
                    onEdit={() => openSwap(item.ingredient_id)}
                  >
                    <YNButtons
                      leftLabel="Need it" leftSelected={!skip}  onLeft={() => setZone1Skip(s => toggle(s, item.ingredient_id))}
                      rightLabel="Skip"   rightSelected={skip}  onRight={() => setZone1Skip(s => toggle(s, item.ingredient_id))}
                      leftIsGreen
                    />
                  </ZoneItem>
                )
              })}
            </Zone>

            {/* ── Zone 2 — Check your pantry ── */}
            <Zone
              variant="check"
              title="Zone 2 — Check your pantry"
              subtitle="Claude thinks you likely have these — skip any you don't need"
              isLoading={ingLoading}
              hint="Skipped items stay tracked — Claude resurfaces them when you're likely running low."
            >
              {zone2Items.length === 0 && !ingLoading && (
                <EmptyZone>No pantry items needed from this week's recipes.</EmptyZone>
              )}
              {zone2Items.map(item => {
                const needIt = zone2NeedIt.has(item.ingredient_id)
                return (
                  <ZoneItem key={item.ingredient_id} emoji={item.emoji} name={item.name} imageUrl={item.image_url} imageStatus={item.image_status}>
                    <YNButtons
                      leftLabel="Need it" leftSelected={needIt}   onLeft={() => setZone2NeedIt(s => toggle(s, item.ingredient_id))}
                      rightLabel="Skip"   rightSelected={!needIt} onRight={() => setZone2NeedIt(s => toggle(s, item.ingredient_id))}
                      leftIsGreen
                    />
                  </ZoneItem>
                )
              })}
            </Zone>

            {/* ── Zone 3 — Staples ── */}
            <Zone
              variant="staples"
              title="Zone 3 — Staples"
              subtitle="Items flagged as pantry staples in your catalog"
              isLoading={staplesLoading}
            >
              {zone3PredictedItems.length === 0 && zone3OtherItems.length === 0 && !staplesLoading && (
                <EmptyZone>
                  No staples set up yet. Go to Settings → Ingredient Catalog and toggle "Pantry staple" on any items you buy regularly.
                </EmptyZone>
              )}

              {/* ── Recommended this week ── */}
              {zone3PredictedItems.length > 0 && (
                <>
                  <div style={{
                    fontSize: '11px', fontWeight: 600, color: 'var(--gl)',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    marginBottom: '6px', marginTop: '2px',
                  }}>
                    ✦ Recommended this week
                  </div>
                  {zone3PredictedItems.map(item => {
                    const skip = zone3PredictedSkip.has(item.ingredient_id)
                    return (
                      <ZoneItem
                        key={item.ingredient_id}
                        emoji={item.emoji}
                        name={item.name}
                        note={formatLastBought(item)}
                        imageUrl={item.image_url}
                        imageStatus={item.image_status}
                      >
                        <YNButtons
                          leftLabel="Need it" leftSelected={!skip}  onLeft={() => setZone3PredictedSkip(s => toggle(s, item.ingredient_id))}
                          rightLabel="Skip"   rightSelected={skip}  onRight={() => setZone3PredictedSkip(s => toggle(s, item.ingredient_id))}
                          leftIsGreen
                        />
                      </ZoneItem>
                    )
                  })}
                </>
              )}

              {/* ── Other staples ── */}
              {zone3OtherItems.length > 0 && (
                <>
                  <div style={{
                    fontSize: '11px', fontWeight: 600, color: 'var(--ts)',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    marginBottom: '6px',
                    marginTop: zone3PredictedItems.length > 0 ? '14px' : '2px',
                  }}>
                    Other staples
                  </div>
                  {zone3OtherItems.map(item => {
                    const needIt = zone3OtherNeedIt.has(item.ingredient_id)
                    return (
                      <ZoneItem
                        key={item.ingredient_id}
                        emoji={item.emoji}
                        name={item.name}
                        note={formatLastBought(item)}
                        imageUrl={item.image_url}
                        imageStatus={item.image_status}
                      >
                        <YNButtons
                          leftLabel="Need it" leftSelected={needIt}   onLeft={() => setZone3OtherNeedIt(s => toggle(s, item.ingredient_id))}
                          rightLabel="Skip"   rightSelected={!needIt} onRight={() => setZone3OtherNeedIt(s => toggle(s, item.ingredient_id))}
                          leftIsGreen
                        />
                      </ZoneItem>
                    )
                  })}
                </>
              )}
            </Zone>
          </>
        )}
      </div>

      {/* ── Pinned confirm button ── */}
      {!noWeekStart && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          padding: '10px 16px',
          paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
          background: 'var(--dk)',
          borderTop: '0.5px solid var(--br)',
          zIndex: 5,
        }}>
          <button
            onClick={handleConfirm}
            disabled={isGenerating || isLoading}
            style={{
              width: '100%', padding: '13px',
              background: (isGenerating || isLoading) ? 'rgba(123,175,138,0.5)' : 'var(--am)',
              color: '#141820', border: 'none', borderRadius: '11px',
              fontSize: '15px', fontWeight: 600,
              fontFamily: 'inherit',
              cursor: (isGenerating || isLoading) ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}
          >
            {isGenerating ? (
              <>
                <div style={{
                  width: '13px', height: '13px',
                  border: '2px solid rgba(20,24,32,0.3)',
                  borderTopColor: '#141820', borderRadius: '50%',
                  animation: 'spin 0.7s linear infinite',
                }} />
                Generating…
              </>
            ) : (
              <><ShoppingCart size={15} /> {confirmLabel}</>
            )}
          </button>
        </div>
      )}

      {/* ── Zone 1 item swap sheet ── */}
      {swapTargetId && (() => {
        const original = zone1Items.find(i => i.ingredient_id === swapTargetId)
        const hasOverride = zone1Overrides.has(swapTargetId)
        return (
          <>
            <div
              onClick={() => setSwapTargetId(null)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 49 }}
            />
            <div style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              background: 'var(--dk2)', borderRadius: '20px 20px 0 0',
              borderTop: '0.5px solid var(--brh)',
              padding: '16px 16px 32px',
              zIndex: 50,
              maxHeight: '72vh',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Drag handle */}
              <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: '10px' }}>
                <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'var(--br)' }} />
              </div>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--tp)' }}>
                    Replace item
                  </div>
                  {original && (
                    <div style={{ fontSize: '12px', color: 'var(--ts)', marginTop: '1px' }}>
                      Swapping out: {original.name}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setSwapTargetId(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ts)', padding: '4px' }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Search input */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'var(--dk3)', border: '0.5px solid var(--brh)',
                borderRadius: '10px', padding: '8px 12px',
                marginBottom: '10px',
              }}>
                <span style={{ color: 'var(--tm)', fontSize: '14px' }}>🔍</span>
                <input
                  ref={swapSearchRef}
                  value={swapSearch}
                  onChange={e => setSwapSearch(e.target.value)}
                  placeholder="Search your catalog…"
                  style={{
                    flex: 1, background: 'none', border: 'none',
                    color: 'var(--tp)', fontSize: '14px',
                    fontFamily: 'inherit', outline: 'none',
                  }}
                />
                {swapSearch && (
                  <button onClick={() => setSwapSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', padding: 0 }}>
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Results */}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {/* Restore original if currently overridden */}
                {hasOverride && (
                  <button
                    onClick={() => { clearSwap(swapTargetId); setSwapTargetId(null) }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                      background: 'rgba(255,255,255,0.04)', border: '0.5px solid var(--br)',
                      borderRadius: '10px', padding: '10px 12px',
                      marginBottom: '6px', cursor: 'pointer', fontFamily: 'inherit',
                      color: 'var(--ts)', fontSize: '13px',
                    }}
                  >
                    <span style={{ fontSize: '16px' }}>↩</span>
                    Restore original ({original?.name})
                  </button>
                )}

                {swapSuggestions.length === 0 && swapSearch.trim() && (
                  <div style={{ fontSize: '13px', color: 'var(--tm)', fontStyle: 'italic', padding: '8px 0' }}>
                    No matches in your catalog
                  </div>
                )}

                {swapSuggestions.map(sug => (
                  <button
                    key={sug.id}
                    onClick={() => applySwap(sug)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                      background: 'none', border: 'none', borderBottom: '0.5px solid rgba(255,255,255,0.05)',
                      padding: '9px 0', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                    }}
                  >
                    <div style={{ width: '32px', height: '32px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {sug.image_status === 'done' && sug.image_url ? (
                        <img src={sug.image_url} alt={sug.name} style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
                      ) : (
                        <span style={{ fontSize: '22px', lineHeight: 1 }}>{sug.emoji ?? '🛒'}</span>
                      )}
                    </div>
                    <span style={{ fontSize: '14px', color: 'var(--tp)', fontWeight: 500 }}>{sug.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )
      })()}

      {/* ── Overwrite warning modal ── */}
      {showOverwrite && (
        <>
          <div
            onClick={() => setShowOverwrite(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 49 }}
          />
          <div style={{
            position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 50,
            width: 'min(300px, calc(100vw - 32px))',
            background: 'var(--dk2)', border: '0.5px solid var(--brh)',
            borderRadius: '14px', padding: '18px',
          }}>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--tp)', marginBottom: '8px' }}>
              Replace existing list?
            </div>
            <p style={{ fontSize: '14px', color: 'var(--ts)', margin: '0 0 16px', lineHeight: 1.5 }}>
              You already have a grocery list for this week. Generating a new one will replace it, including any items you've already checked off.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setShowOverwrite(false)}
                style={modalCancelStyle}
              >
                Cancel
              </button>
              <button onClick={runConfirm} style={modalConfirmStyle}>
                Replace
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Zone wrapper ──────────────────────────────────────────────────────────────

type ZoneVariant = 'buy' | 'check' | 'staples' | 'all'

const ZONE_STYLES: Record<ZoneVariant, { bg: string; border: string; titleColor: string; subColor: string }> = {
  buy: {
    bg:         'rgba(99,153,34,0.08)',
    border:     '0.5px solid rgba(99,153,34,0.25)',
    titleColor: 'var(--gl)',
    subColor:   'rgba(93,202,165,0.7)',
  },
  check: {
    bg:         'rgba(239,159,39,0.08)',
    border:     '0.5px solid rgba(239,159,39,0.25)',
    titleColor: 'var(--am)',
    subColor:   'rgba(239,159,39,0.6)',
  },
  staples: {
    bg:         'rgba(29,158,117,0.08)',
    border:     '0.5px solid rgba(29,158,117,0.2)',
    titleColor: '#5DCAA5',
    subColor:   'rgba(29,158,117,0.6)',
  },
  all: {
    bg:         'var(--dkc)',
    border:     '0.5px solid var(--br)',
    titleColor: 'var(--ts)',
    subColor:   'var(--tm)',
  },
}

function Zone({
  variant, title, subtitle, hint, isLoading, children,
}: {
  variant:   ZoneVariant
  title?:    string
  subtitle?: string
  hint?:     string
  isLoading?: boolean
  children?: React.ReactNode
}) {
  const s = ZONE_STYLES[variant]
  return (
    <div style={{
      background: s.bg, border: s.border,
      borderRadius: '12px', padding: '11px', marginBottom: '10px',
    }}>
      {title && (
        <div style={{ fontSize: '13px', fontWeight: 500, color: s.titleColor, marginBottom: '2px' }}>
          {title}
        </div>
      )}
      {subtitle && (
        <div style={{ fontSize: '12px', color: s.subColor, marginBottom: '9px', lineHeight: 1.5 }}>
          {subtitle}
        </div>
      )}
      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
          <div style={{
            width: '16px', height: '16px',
            border: '2px solid var(--br)',
            borderTopColor: s.titleColor,
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }} />
        </div>
      ) : children}
      {hint && (
        <div style={{
          fontSize: '11px', fontStyle: 'italic', color: 'var(--tm)',
          marginTop: '7px', paddingTop: '7px',
          borderTop: '0.5px solid rgba(255,255,255,0.05)',
        }}>
          {hint}
        </div>
      )}
    </div>
  )
}

// ── ZoneItem ──────────────────────────────────────────────────────────────────

function ZoneItem({
  emoji, name, note, children, imageUrl, imageStatus, onEdit,
}: {
  emoji?:       string | null
  name:         string
  note?:        string | null
  children?:    React.ReactNode
  imageUrl?:    string | null
  imageStatus?: string | null
  onEdit?:      () => void
}) {
  const showImg = imageStatus === 'done' && imageUrl
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '9px',
      padding: '7px 0',
      borderBottom: '0.5px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ position: 'relative', width: '24px', flexShrink: 0 }}>
        {showImg ? (
          <img src={imageUrl!} alt={name} style={{ width: '24px', height: '24px', objectFit: 'contain', display: 'block' }} />
        ) : (
          <span style={{ fontSize: '18px', width: '24px', textAlign: 'center', display: 'block' }}>
            {emoji ?? '🛒'}
          </span>
        )}
        {imageStatus === 'generating' && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0,
            width: '6px', height: '6px', borderRadius: '50%',
            background: 'var(--am)',
            animation: 'nb2-pulse 1.2s ease-in-out infinite',
          }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          onClick={onEdit}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            cursor: onEdit ? 'pointer' : 'default',
          }}
        >
          <span style={{
            fontSize: '14px', color: 'var(--tp)', fontWeight: 500,
            borderBottom: onEdit ? '0.5px dashed rgba(255,255,255,0.25)' : 'none',
          }}>
            {name}
          </span>
          {onEdit && <ArrowLeftRight size={11} color="var(--ts)" />}
        </div>
        {note && (
          <div style={{ fontSize: '11px', color: 'var(--ts)', marginTop: '1px' }}>{note}</div>
        )}
      </div>
      {children}
    </div>
  )
}

// ── YNButtons ─────────────────────────────────────────────────────────────────

function YNButtons({
  leftLabel, leftSelected, onLeft,
  rightLabel, rightSelected, onRight,
  leftIsGreen = false,
  rightIsGreen = false,
}: {
  leftLabel:    string
  leftSelected: boolean
  onLeft:       () => void
  rightLabel:   string
  rightSelected: boolean
  onRight:      () => void
  leftIsGreen?: boolean
  rightIsGreen?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
      <button
        onClick={() => { if (!leftSelected) onLeft() }}
        style={{
          background: leftSelected
            ? (leftIsGreen ? 'rgba(99,153,34,0.35)' : 'rgba(255,255,255,0.1)')
            : (leftIsGreen ? 'rgba(99,153,34,0.07)' : 'rgba(255,255,255,0.06)'),
          border: `0.5px solid ${leftSelected
            ? (leftIsGreen ? 'var(--gl)' : 'var(--ts)')
            : (leftIsGreen ? 'rgba(99,153,34,0.2)' : 'var(--brh)')}`,
          borderRadius: '7px', padding: '4px 9px',
          fontSize: '12px', fontWeight: 500,
          cursor: leftSelected ? 'default' : 'pointer',
          fontFamily: 'inherit',
          color: leftSelected
            ? (leftIsGreen ? 'var(--gl)' : 'var(--ts)')
            : (leftIsGreen ? 'var(--gl)' : 'var(--tm)'),
          transition: 'all 0.15s',
        }}
      >
        {leftLabel}
      </button>
      <button
        onClick={() => { if (!rightSelected) onRight() }}
        style={{
          background: rightSelected
            ? (rightIsGreen ? 'rgba(99,153,34,0.35)' : 'rgba(255,255,255,0.1)')
            : (rightIsGreen ? 'rgba(99,153,34,0.2)' : 'rgba(255,255,255,0.06)'),
          border: `0.5px solid ${rightSelected
            ? (rightIsGreen ? 'var(--gl)' : 'var(--ts)')
            : (rightIsGreen ? 'rgba(99,153,34,0.4)' : 'var(--brh)')}`,
          borderRadius: '7px', padding: '4px 9px',
          fontSize: '12px', fontWeight: 500,
          cursor: rightSelected ? 'default' : 'pointer',
          fontFamily: 'inherit',
          color: rightSelected
            ? (rightIsGreen ? 'var(--gl)' : 'var(--ts)')
            : (rightIsGreen ? 'var(--gl)' : 'var(--tm)'),
          transition: 'all 0.15s',
        }}
      >
        {rightLabel}
      </button>
    </div>
  )
}

// ── EmptyZone ─────────────────────────────────────────────────────────────────

function EmptyZone({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: '13px', color: 'var(--tm)', fontStyle: 'italic', padding: '4px 0 2px' }}>
      {children}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatLastBought(item: StapleWithHistory): string {
  if (item.days_since_purchase === null) return 'Never purchased'
  if (item.days_since_purchase === 0)    return 'Bought today'
  if (item.days_since_purchase === 1)    return 'Bought yesterday'
  return `Last bought ${item.days_since_purchase} days ago`
}

// ── Modal button styles ───────────────────────────────────────────────────────

const modalCancelStyle: React.CSSProperties = {
  flex: 1, background: 'none', border: '0.5px solid var(--brh)',
  borderRadius: '9px', padding: '9px',
  fontSize: '14px', fontFamily: 'inherit', cursor: 'pointer',
  color: 'var(--ts)',
}

const modalConfirmStyle: React.CSSProperties = {
  flex: 2, background: 'var(--am)', border: 'none',
  borderRadius: '9px', padding: '9px',
  fontSize: '14px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
  color: '#141820',
}
