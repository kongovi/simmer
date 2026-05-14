import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, ShoppingCart } from 'lucide-react'
import {
  useStagingIngredients,
  useStaplePredictions,
  useConfirmStagingList,
} from '../hooks/useStaples'
import type { StapleWithHistory } from '../hooks/useStaples'
import { useActiveGroceryList, useHasActiveList } from '../hooks/useGroceryList'

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

  const zone1Items = stagingIng?.zone1 ?? []
  const zone2Items = stagingIng?.zone2 ?? []
  const zone3Items = staplePreds?.zone3 ?? []
  const zone4Items = staplePreds?.zone4 ?? []

  // ── Selections ──
  // Zone 2: ingredient_ids the user chose "Need it" — default: none (all Skip)
  const [zone2NeedIt, setZone2NeedIt] = useState<Set<string>>(new Set())
  // Zone 3: ingredient_ids the user chose "No" — default: none (all Yes)
  const [zone3No, setZone3No]         = useState<Set<string>>(new Set())
  // Zone 4: ingredient_ids the user chose "Add"
  const [zone4Added, setZone4Added]   = useState<Set<string>>(new Set())
  // Zone 4 expanded
  const [zone4Open, setZone4Open]     = useState(false)

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
        zone1Items,
        zone2Selected:  zone2Items.filter(i => zone2NeedIt.has(i.ingredient_id)),
        zone3Selected:  zone3Items.filter(i => !zone3No.has(i.ingredient_id)),
        zone4Selected:  zone4Items.filter(i => zone4Added.has(i.ingredient_id)),
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
            gap: '5px', fontSize: '13px', padding: 0, marginBottom: '12px',
            fontFamily: 'inherit',
          }}
        >
          <ArrowLeft size={15} /> {backLabel}
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--tp)', margin: '0 0 2px' }}>
              Review &amp; stage
            </h1>
            <p style={{ fontSize: '11px', color: 'var(--ts)', margin: 0 }}>
              Confirm what to buy this week
            </p>
          </div>
          {/* Claude badge — decorative, matches prototype */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            background: 'rgba(123,175,138,0.12)',
            border: '0.5px solid rgba(123,175,138,0.3)',
            borderRadius: '16px', padding: '5px 9px',
            fontSize: '10px', fontWeight: 500, color: 'var(--am)',
          }}>
            ✦ Claude
          </div>
        </div>
      </div>

      {/* Scrollable zones */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 120px' }}>

        {/* No week selected (came from grocery with no active list) */}
        {noWeekStart && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--ts)', fontSize: '13px' }}>
            <p style={{ margin: '0 0 12px' }}>No active grocery list found.</p>
            <button
              onClick={() => navigate('/planner')}
              style={{
                background: 'var(--am)', color: '#141820', border: 'none',
                borderRadius: '10px', padding: '9px 18px',
                fontSize: '12px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
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
              subtitle="Perishables and recipe-specific quantities — always on the list"
              isLoading={ingLoading}
            >
              {zone1Items.length === 0 && !ingLoading && (
                <EmptyZone>
                  {stagingIng?.hasRecipes === false
                    ? 'No recipes planned — add meals to your planner to see ingredients here.'
                    : 'No perishables found for this week.'}
                </EmptyZone>
              )}
              {zone1Items.map(item => (
                <ZoneItem key={item.ingredient_id} emoji={item.emoji} name={item.name} note={item.recipe_note} />
              ))}
            </Zone>

            {/* ── Zone 2 — Check your pantry ── */}
            <Zone
              variant="check"
              title="Zone 2 — Check your pantry"
              subtitle="Claude thinks you likely have these — confirm if you need them"
              isLoading={ingLoading}
              hint="Skipped items stay tracked — Claude resurfaces them when you're likely running low."
            >
              {zone2Items.length === 0 && !ingLoading && (
                <EmptyZone>No pantry items needed from this week's recipes.</EmptyZone>
              )}
              {zone2Items.map(item => {
                const needIt = zone2NeedIt.has(item.ingredient_id)
                return (
                  <ZoneItem key={item.ingredient_id} emoji={item.emoji} name={item.name}>
                    <YNButtons
                      leftLabel="Skip"     leftSelected={!needIt}  onLeft={() => setZone2NeedIt(s => toggle(s, item.ingredient_id))}
                      rightLabel="Need it" rightSelected={needIt}  onRight={() => setZone2NeedIt(s => toggle(s, item.ingredient_id))}
                      rightIsGreen
                    />
                  </ZoneItem>
                )
              })}
            </Zone>

            {/* ── Zone 3 — Staples prediction ── */}
            <Zone
              variant="staples"
              title="Zone 3 — Staples prediction"
              subtitle="Regular buys — Claude's guess based on your history"
              isLoading={staplesLoading}
            >
              {zone3Items.length === 0 && !staplesLoading && (
                <EmptyZone>No staples predicted this week. Check Zone 4 to add items manually.</EmptyZone>
              )}
              {zone3Items.map(item => {
                const isNo = zone3No.has(item.ingredient_id)
                return (
                  <ZoneItem
                    key={item.ingredient_id}
                    emoji={item.emoji}
                    name={item.name}
                    note={formatLastBought(item)}
                  >
                    <YNButtons
                      leftLabel="Yes"  leftSelected={!isNo}  onLeft={() => setZone3No(s => toggle(s, item.ingredient_id))}
                      rightLabel="No"  rightSelected={isNo}  onRight={() => setZone3No(s => toggle(s, item.ingredient_id))}
                      leftIsGreen
                    />
                  </ZoneItem>
                )
              })}
            </Zone>

            {/* ── Zone 4 — All other staples (collapsed) ── */}
            <Zone variant="all" isLoading={staplesLoading}>
              {/* Header row — always visible */}
              <div
                onClick={() => setZone4Open(o => !o)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
              >
                <div style={{
                  fontSize: '11px', fontWeight: 500, color: 'var(--ts)',
                  display: 'flex', alignItems: 'center', gap: '6px',
                }}>
                  <span style={{
                    display: 'inline-block',
                    transform: zone4Open ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                    fontSize: '12px',
                  }}>▶</span>
                  All other staples
                </div>
                <span style={{
                  background: 'rgba(255,255,255,0.08)', borderRadius: '9px',
                  padding: '2px 8px', fontSize: '10px', color: 'var(--ts)',
                }}>
                  {zone4Items.length} item{zone4Items.length !== 1 ? 's' : ''}
                </span>
              </div>

              <div style={{ fontSize: '10px', color: 'var(--tm)', marginTop: '4px', marginBottom: zone4Open ? '8px' : 0 }}>
                Not predicted this week — add any you need
              </div>

              {zone4Open && zone4Items.map(item => {
                const added = zone4Added.has(item.ingredient_id)
                return (
                  <ZoneItem
                    key={item.ingredient_id}
                    emoji={item.emoji}
                    name={item.name}
                    note={formatLastBought(item)}
                  >
                    <button
                      onClick={() => setZone4Added(s => toggle(s, item.ingredient_id))}
                      style={{
                        background: added ? 'rgba(99,153,34,0.35)' : 'rgba(99,153,34,0.2)',
                        border: `0.5px solid ${added ? 'var(--gl)' : 'rgba(99,153,34,0.4)'}`,
                        borderRadius: '7px', padding: '4px 9px',
                        fontSize: '10px', fontWeight: 500, color: 'var(--gl)',
                        cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'all 0.15s',
                      }}
                    >
                      {added ? '✓ Added' : 'Add'}
                    </button>
                  </ZoneItem>
                )
              })}
            </Zone>
          </>
        )}
      </div>

      {/* ── Pinned confirm button ── */}
      {!noWeekStart && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          padding: '10px 16px 20px',
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
              fontSize: '13px', fontWeight: 600,
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
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--tp)', marginBottom: '8px' }}>
              Replace existing list?
            </div>
            <p style={{ fontSize: '12px', color: 'var(--ts)', margin: '0 0 16px', lineHeight: 1.5 }}>
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
        <div style={{ fontSize: '11px', fontWeight: 500, color: s.titleColor, marginBottom: '2px' }}>
          {title}
        </div>
      )}
      {subtitle && (
        <div style={{ fontSize: '10px', color: s.subColor, marginBottom: '9px', lineHeight: 1.5 }}>
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
          fontSize: '9px', fontStyle: 'italic', color: 'var(--tm)',
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
  emoji, name, note, children,
}: {
  emoji?:    string | null
  name:      string
  note?:     string | null
  children?: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '9px',
      padding: '7px 0',
      borderBottom: '0.5px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{ fontSize: '16px', width: '24px', textAlign: 'center', flexShrink: 0 }}>
        {emoji ?? '🛒'}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '12px', color: 'var(--tp)', fontWeight: 500 }}>{name}</div>
        {note && (
          <div style={{ fontSize: '9px', color: 'var(--ts)', marginTop: '1px' }}>{note}</div>
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
        onClick={onLeft}
        style={{
          background: leftSelected
            ? (leftIsGreen ? 'rgba(99,153,34,0.35)' : 'rgba(255,255,255,0.1)')
            : (leftIsGreen ? 'rgba(99,153,34,0.2)' : 'rgba(255,255,255,0.06)'),
          border: `0.5px solid ${leftSelected
            ? (leftIsGreen ? 'var(--gl)' : 'var(--ts)')
            : (leftIsGreen ? 'rgba(99,153,34,0.4)' : 'var(--brh)')}`,
          borderRadius: '7px', padding: '4px 9px',
          fontSize: '10px', fontWeight: 500, cursor: 'pointer',
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
        onClick={onRight}
        style={{
          background: rightSelected
            ? (rightIsGreen ? 'rgba(99,153,34,0.35)' : 'rgba(255,255,255,0.1)')
            : (rightIsGreen ? 'rgba(99,153,34,0.2)' : 'rgba(255,255,255,0.06)'),
          border: `0.5px solid ${rightSelected
            ? (rightIsGreen ? 'var(--gl)' : 'var(--ts)')
            : (rightIsGreen ? 'rgba(99,153,34,0.4)' : 'var(--brh)')}`,
          borderRadius: '7px', padding: '4px 9px',
          fontSize: '10px', fontWeight: 500, cursor: 'pointer',
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
    <div style={{ fontSize: '11px', color: 'var(--tm)', fontStyle: 'italic', padding: '4px 0 2px' }}>
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
  fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer',
  color: 'var(--ts)',
}

const modalConfirmStyle: React.CSSProperties = {
  flex: 2, background: 'var(--am)', border: 'none',
  borderRadius: '9px', padding: '9px',
  fontSize: '12px', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
  color: '#141820',
}
