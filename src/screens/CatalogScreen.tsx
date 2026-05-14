import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Store } from 'lucide-react'
import { Screen } from '../components/layout/Screen'
import { useCatalogItems, useUpdateCatalogItem } from '../hooks/useCatalog'
import { useFamilyStores } from '../hooks/useFamilyStores'
import { useIngredientImageRealtime } from '../hooks/useIngredientImages'
import { detectAisleOrder } from '../lib/aisleUtils'
import type { IngredientCatalog } from '../types'

// ── Edit sheet ────────────────────────────────────────────────────────────────

function EditSheet({
  item,
  stores,
  onClose,
}: {
  item:   IngredientCatalog
  stores: string[]
  onClose: () => void
}) {
  const update = useUpdateCatalogItem()

  const [store,        setStore]        = useState(item.default_store ?? '')
  const [brandNote,    setBrandNote]    = useState(item.brand_note ?? '')
  const [isPantry,     setIsPantry]     = useState(item.is_pantry_staple)
  const [isBulk,       setIsBulk]       = useState(item.is_bulk_staple)

  async function handleSave() {
    await update.mutateAsync({
      id: item.id,
      update: {
        default_store:    store    || null,
        brand_note:       brandNote || null,
        is_pantry_staple: isPantry,
        is_bulk_staple:   isBulk,
      },
    })
    onClose()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'flex-end',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--dk2)', borderRadius: '20px 20px 0 0',
        padding: '20px 16px 32px', width: '100%',
        borderTop: '0.5px solid var(--brh)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
          <span style={{ fontSize: '22px' }}>{item.emoji ?? '🥄'}</span>
          <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--tp)' }}>{item.name}</span>
        </div>

        {/* Store */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '11px', color: 'var(--ts)', display: 'block', marginBottom: '6px' }}>
            Default store
          </label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {stores.map(s => (
              <button
                key={s}
                onClick={() => setStore(store === s ? '' : s)}
                style={{
                  padding: '6px 12px',
                  background: store === s ? 'var(--am)' : 'var(--dk3)',
                  border: `0.5px solid ${store === s ? 'var(--am)' : 'var(--br)'}`,
                  borderRadius: '8px',
                  color: store === s ? '#141820' : 'var(--tp)',
                  fontSize: '12px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {s}
              </button>
            ))}
            {/* Custom store input */}
            <input
              value={stores.includes(store) ? '' : store}
              onChange={e => setStore(e.target.value)}
              placeholder="Other…"
              style={{
                background: 'var(--dk3)', border: '0.5px solid var(--brh)',
                borderRadius: '8px', padding: '6px 10px',
                color: 'var(--tp)', fontSize: '12px',
                fontFamily: 'inherit', outline: 'none', width: '80px',
              }}
            />
          </div>
        </div>

        {/* Brand note */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '11px', color: 'var(--ts)', display: 'block', marginBottom: '6px' }}>
            Brand note
          </label>
          <input
            value={brandNote}
            onChange={e => setBrandNote(e.target.value)}
            placeholder={`e.g. "TJ's organic"`}
            style={{
              width: '100%', background: 'var(--dk3)',
              border: '0.5px solid var(--brh)', borderRadius: '8px',
              padding: '9px 12px', color: 'var(--tp)', fontSize: '13px',
              fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Toggles */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
          <Toggle label="Pantry staple" checked={isPantry} onToggle={() => setIsPantry(p => !p)} />
          <Toggle label="Bulk staple"   checked={isBulk}   onToggle={() => setIsBulk(p => !p)} />
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={update.isPending}
          style={{
            width: '100%', padding: '13px',
            background: 'var(--am)', border: 'none',
            borderRadius: '12px', color: '#141820',
            fontSize: '14px', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function Toggle({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '7px 12px',
        background: checked ? 'rgba(123,175,138,0.15)' : 'var(--dk3)',
        border: `0.5px solid ${checked ? 'var(--am)' : 'var(--br)'}`,
        borderRadius: '8px',
        color: checked ? 'var(--am)' : 'var(--ts)',
        fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      <span>{checked ? '✓' : '○'}</span>
      {label}
    </button>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function CatalogScreen() {
  const navigate         = useNavigate()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<IngredientCatalog | null>(null)

  useIngredientImageRealtime()

  const { data: items = [],  isLoading } = useCatalogItems(search)
  const { data: storeRows = [] } = useFamilyStores()
  const stores = storeRows.map(s => s.name)

  // Group by aisle
  type AisleGroup = { aisle: number; label: string; items: IngredientCatalog[] }
  const AISLE_LABELS: Record<number, string> = {
    1: '🥦 Produce', 2: '🥩 Meat & Fish', 3: '🥛 Dairy & Eggs',
    4: '🥫 Canned & Dry', 5: '🫒 Oils, Spices & Pantry',
    6: '🧃 Beverages', 7: '🛒 Other',
  }

  const grouped: AisleGroup[] = []
  const aisleMap = new Map<number, IngredientCatalog[]>()
  for (const item of items) {
    const a = detectAisleOrder(item.name, item.emoji ?? null)
    if (!aisleMap.has(a)) aisleMap.set(a, [])
    aisleMap.get(a)!.push(item)
  }
  for (const [aisle, aisleItems] of [...aisleMap.entries()].sort((a, b) => a[0] - b[0])) {
    grouped.push({ aisle, label: AISLE_LABELS[aisle] ?? '🛒 Other', items: aisleItems })
  }

  return (
    <Screen>
      <div style={{ padding: '16px 16px 0', maxWidth: '480px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <button
            onClick={() => navigate('/settings')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0, color: 'var(--am)' }}
          >
            <ArrowLeft size={20} />
          </button>
          <span style={{ fontSize: '17px', fontWeight: 600, color: 'var(--tp)' }}>Ingredient Catalog</span>
        </div>

        {/* Search */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'var(--dk3)', border: '0.5px solid var(--brh)',
          borderRadius: '10px', padding: '8px 12px', marginBottom: '16px',
        }}>
          <Search size={14} color="var(--tm)" style={{ flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search ingredients…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontSize: '13px', color: 'var(--tp)', fontFamily: 'inherit',
            }}
          />
        </div>

        {/* Loading */}
        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
            <div style={{ width: '20px', height: '20px', border: '2px solid var(--br)', borderTopColor: 'var(--am)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          </div>
        )}

        {/* Empty */}
        {!isLoading && items.length === 0 && (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <div style={{ fontSize: '36px', marginBottom: '12px' }}>📦</div>
            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--tp)', marginBottom: '6px' }}>
              {search ? `No ingredients matching "${search}"` : 'No ingredients yet'}
            </div>
            <p style={{ fontSize: '12px', color: 'var(--ts)', margin: 0 }}>
              Ingredients are added when you save recipes.
            </p>
          </div>
        )}

        {/* Grouped list */}
        {!isLoading && grouped.map(group => (
          <div key={group.aisle} style={{ marginBottom: '20px' }}>
            <div style={{
              fontSize: '11px', fontWeight: 600, color: 'var(--tm)',
              textTransform: 'uppercase', letterSpacing: '0.8px',
              marginBottom: '6px', paddingLeft: '4px',
            }}>
              {group.label}
            </div>
            <div style={{
              background: 'var(--dkc)', border: '0.5px solid var(--br)',
              borderRadius: '12px', overflow: 'hidden',
            }}>
              {group.items.map((item, idx) => (
                <div
                  key={item.id}
                  onClick={() => setEditing(item)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '11px 14px',
                    borderBottom: idx < group.items.length - 1 ? '0.5px solid var(--br)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  {item.image_status === 'done' && item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.name}
                      style={{ width: '24px', height: '24px', objectFit: 'contain', flexShrink: 0, borderRadius: '4px' }}
                    />
                  ) : (
                    <span style={{ fontSize: '18px', width: '24px', textAlign: 'center', flexShrink: 0 }}>
                      {item.emoji ?? '🥄'}
                    </span>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', color: 'var(--tp)', fontWeight: 500 }}>{item.name}</div>
                    {item.brand_note && (
                      <div style={{ fontSize: '11px', color: 'var(--ts)', fontStyle: 'italic' }}>{item.brand_note}</div>
                    )}
                  </div>
                  {item.default_store && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      background: 'rgba(255,255,255,0.05)', borderRadius: '6px',
                      padding: '3px 7px', flexShrink: 0,
                    }}>
                      <Store size={10} color="var(--ts)" />
                      <span style={{ fontSize: '10px', color: 'var(--ts)' }}>{item.default_store}</span>
                    </div>
                  )}
                  {item.is_pantry_staple && (
                    <div style={{
                      background: 'rgba(123,175,138,0.12)', borderRadius: '6px',
                      padding: '3px 7px', flexShrink: 0,
                    }}>
                      <span style={{ fontSize: '10px', color: 'var(--am)' }}>staple</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Edit sheet */}
      {editing && (
        <EditSheet
          item={editing}
          stores={stores}
          onClose={() => setEditing(null)}
        />
      )}
    </Screen>
  )
}
