import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Search, Store, RefreshCw, Trash2, GitMerge, Check, X } from 'lucide-react'
import { Screen } from '../components/layout/Screen'
import { useCatalogItems, useUpdateCatalogItem, useDeleteCatalogItem, useMergeIngredients } from '../hooks/useCatalog'
import { useFamilyStores } from '../hooks/useFamilyStores'
import { useIngredientImageRealtime } from '../hooks/useIngredientImages'
import { generateIngredientImage } from '../lib/images'
import { detectAisleOrder, AISLE_LABELS, AISLE_NAMES, AISLE_IMAGES } from '../lib/aisleUtils'
import type { IngredientCatalog } from '../types'

// ── Edit sheet ────────────────────────────────────────────────────────────────

function EditSheet({
  item,
  stores,
  onClose,
  onDeleted,
}: {
  item:      IngredientCatalog
  stores:    string[]
  onClose:   () => void
  onDeleted: () => void
}) {
  const update  = useUpdateCatalogItem()
  const destroy = useDeleteCatalogItem()

  const [name,             setName]             = useState(item.name ?? '')
  const [aisle,            setAisle]            = useState<number>(item.default_aisle_order ?? detectAisleOrder(item.name, item.emoji ?? null))
  const [store,            setStore]            = useState(item.default_store ?? '')
  const [brandNote,        setBrandNote]        = useState(item.brand_note ?? '')
  const [isPantry,         setIsPantry]         = useState(item.is_pantry_staple)
  const [isBulk,           setIsBulk]           = useState(item.is_bulk_staple)
  const [regenStatus,      setRegenStatus]      = useState<'idle' | 'busy'>('idle')
  const [confirmDelete,    setConfirmDelete]    = useState(false)
  const [regenExpanded,    setRegenExpanded]    = useState(false)
  const [regenCustomText,  setRegenCustomText]  = useState('')

  async function handleRegen() {
    setRegenExpanded(false)
    setRegenStatus('busy')
    await generateIngredientImage(item.id, item.name, regenCustomText || undefined).catch(() => {})
    setRegenStatus('idle')
    setRegenCustomText('')
  }

  async function handleSave() {
    await update.mutateAsync({
      id: item.id,
      update: {
        name:               name.trim() || item.name,
        default_store:      store    || null,
        brand_note:         brandNote || null,
        is_pantry_staple:   isPantry,
        is_bulk_staple:     isBulk,
        default_aisle_order: aisle,
      },
    })
    onClose()
  }

  async function handleDelete() {
    await destroy.mutateAsync(item.id)
    onDeleted()
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
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          {/* Image or emoji */}
          <div style={{
            position: 'relative', flexShrink: 0,
            width: '56px', height: '56px', borderRadius: '14px',
            background: 'var(--dk3)', overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {item.image_status === 'done' && item.image_url ? (
              <img
                src={item.image_url}
                alt={item.name}
                style={{ width: '56px', height: '56px', objectFit: 'contain' }}
              />
            ) : (
              <span style={{ fontSize: '32px', lineHeight: 1 }}>{item.emoji ?? '🥄'}</span>
            )}
            {item.image_status === 'generating' && (
              <div style={{
                position: 'absolute', bottom: '4px', left: '4px',
                width: '7px', height: '7px', borderRadius: '50%',
                background: 'var(--am)', animation: 'nb2-pulse 1.2s ease-in-out infinite',
              }} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: '17px', fontWeight: 600, color: 'var(--tp)', display: 'block' }}>{item.name}</span>
            {/* Regenerate image button */}
            <button
              onClick={() => {
                if (regenStatus === 'busy' || item.image_status === 'generating') return
                setRegenExpanded(e => !e)
                setRegenCustomText('')
              }}
              disabled={regenStatus === 'busy' || item.image_status === 'generating'}
              style={{
                marginTop: '4px',
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                background: 'none', border: 'none', padding: 0,
                color: regenStatus === 'busy' || item.image_status === 'generating' ? 'var(--tm)' : 'var(--ts)',
                fontSize: '12px', cursor: regenStatus === 'busy' || item.image_status === 'generating' ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              <RefreshCw size={11} style={{ animation: regenStatus === 'busy' ? 'spin 0.8s linear infinite' : 'none' }} />
              {regenStatus === 'busy' || item.image_status === 'generating' ? 'Generating…' : 'Regenerate image'}
            </button>
          </div>
        </div>

        {/* Inline regen expansion */}
        {regenExpanded && (
          <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--dk3)', borderRadius: '10px', border: '0.5px solid var(--brh)' }}>
            <div style={{ fontSize: '12px', color: 'var(--ts)', marginBottom: '6px' }}>
              Base style: retro-pop ingredient illustration with transparent background. Add custom instructions below.
            </div>
            <textarea
              autoFocus
              value={regenCustomText}
              onChange={e => setRegenCustomText(e.target.value)}
              placeholder={'e.g. "show it sliced", "add a wooden surface", "make it more vibrant"'}
              rows={2}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--dk2)', border: '0.5px solid var(--brh)',
                borderRadius: '8px', padding: '8px 10px',
                color: 'var(--tp)', fontSize: '14px',
                fontFamily: 'inherit', outline: 'none',
                resize: 'none', marginBottom: '8px', display: 'block',
              }}
            />
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                onClick={() => setRegenExpanded(false)}
                style={{
                  flex: 1, padding: '8px', background: 'none',
                  border: '0.5px solid var(--br)', borderRadius: '8px',
                  color: 'var(--ts)', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleRegen}
                style={{
                  flex: 2, padding: '8px', background: 'var(--am)', border: 'none',
                  borderRadius: '8px', color: '#141820', fontSize: '13px',
                  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                }}
              >
                <RefreshCw size={12} /> Generate
              </button>
            </div>
          </div>
        )}

        {/* Name */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', color: 'var(--ts)', fontWeight: 500, marginBottom: '7px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Name</div>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--dk3)', border: '0.5px solid var(--brh)',
              borderRadius: '8px', padding: '9px 11px',
              color: 'var(--tp)', fontSize: '16px', fontWeight: 500,
              fontFamily: 'inherit', outline: 'none',
            }}
          />
        </div>

        {/* Store */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '13px', color: 'var(--ts)', display: 'block', marginBottom: '6px' }}>
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
                  fontSize: '14px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
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
                color: 'var(--tp)', fontSize: '14px',
                fontFamily: 'inherit', outline: 'none', width: '80px',
              }}
            />
          </div>
        </div>

        {/* Brand note */}
        <div style={{ marginBottom: '14px' }}>
          <label style={{ fontSize: '13px', color: 'var(--ts)', display: 'block', marginBottom: '6px' }}>
            Notes
          </label>
          <input
            value={brandNote}
            onChange={e => setBrandNote(e.target.value)}
            placeholder={`e.g. "TJ's organic"`}
            style={{
              width: '100%', background: 'var(--dk3)',
              border: '0.5px solid var(--brh)', borderRadius: '8px',
              padding: '9px 12px', color: 'var(--tp)', fontSize: '15px',
              fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Aisle */}
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', color: 'var(--ts)', fontWeight: 500, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Aisle</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {Object.entries(AISLE_NAMES).map(([key, name]) => {
              const a = Number(key)
              const selected = aisle === a
              const img = AISLE_IMAGES[a]
              const emoji = AISLE_LABELS[a]?.split(' ')[0] ?? '🛒'
              return (
                <button
                  key={a}
                  onClick={() => setAisle(a)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '5px 10px 5px 6px', borderRadius: '18px',
                    border: `0.5px solid ${selected ? 'var(--am)' : 'var(--br)'}`,
                    background: selected ? 'rgba(123,175,138,0.15)' : 'var(--dk3)',
                    color: selected ? 'var(--am)' : 'var(--ts)',
                    fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer',
                    fontWeight: selected ? 500 : 400,
                  }}
                >
                  {img ? (
                    <img src={img} alt={name} style={{ width: '22px', height: '22px', objectFit: 'contain', flexShrink: 0 }} />
                  ) : (
                    <span style={{ fontSize: '16px', lineHeight: 1 }}>{emoji}</span>
                  )}
                  {name}
                </button>
              )
            })}
          </div>
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
            fontSize: '16px', fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            marginBottom: '10px',
          }}
        >
          {update.isPending ? 'Saving…' : 'Save'}
        </button>

        {/* Delete */}
        {confirmDelete ? (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{
                flex: 1, padding: '11px', background: 'var(--dk3)',
                border: '0.5px solid var(--br)', borderRadius: '10px',
                color: 'var(--ts)', fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={destroy.isPending}
              style={{
                flex: 1, padding: '11px', background: 'rgba(208,90,48,0.15)',
                border: '0.5px solid var(--rd)', borderRadius: '10px',
                color: 'var(--rd)', fontSize: '15px', fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {destroy.isPending ? 'Deleting…' : 'Yes, delete'}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            style={{
              width: '100%', padding: '11px', background: 'none',
              border: '0.5px solid var(--rd)', borderRadius: '10px',
              color: 'var(--rd)', fontSize: '15px', cursor: 'pointer',
              fontFamily: 'inherit', display: 'flex', alignItems: 'center',
              justifyContent: 'center', gap: '6px',
            }}
          >
            <Trash2 size={14} />
            Delete ingredient
          </button>
        )}
      </div>
    </div>
  )
}

// ── Merge sheet ───────────────────────────────────────────────────────────────

const SECTION_LABEL: React.CSSProperties = {
  fontSize: '12px', fontWeight: 600, color: 'var(--tm)',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px',
}

function RadioList({
  items,
  selectedId,
  onSelect,
  renderLabel,
}: {
  items:       { id: string }[]
  selectedId:  string
  onSelect:    (id: string) => void
  renderLabel: (item: { id: string }) => React.ReactNode
}) {
  return (
    <div style={{
      background: 'var(--dkc)', border: '0.5px solid var(--br)',
      borderRadius: '12px', overflow: 'hidden', marginBottom: '20px',
    }}>
      {items.map((item, idx) => (
        <div
          key={item.id}
          onClick={() => onSelect(item.id)}
          style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '12px 14px',
            borderBottom: idx < items.length - 1 ? '0.5px solid var(--br)' : 'none',
            cursor: 'pointer',
            background: selectedId === item.id ? 'rgba(123,175,138,0.1)' : 'transparent',
          }}
        >
          <div style={{
            width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
            border: `2px solid ${selectedId === item.id ? 'var(--am)' : 'var(--br)'}`,
            background: selectedId === item.id ? 'var(--am)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {selectedId === item.id && <Check size={11} color="#141820" strokeWidth={3} />}
          </div>
          {renderLabel(item)}
        </div>
      ))}
    </div>
  )
}

function MergeSheet({
  selected,
  onClose,
  onDone,
}: {
  selected: IngredientCatalog[]
  onClose:  () => void
  onDone:   () => void
}) {
  const merge = useMergeIngredients()

  // ── Name (canonical) ──
  const [canonicalId, _setCanonicalId] = useState(selected[0]?.id ?? '')
  const canonical = selected.find(i => i.id === canonicalId) ?? selected[0]

  // ── Image ──
  const [imageSourceId, setImageSourceId] = useState(canonicalId)
  // ── Store ──
  const [store, setStore] = useState<string | null>(canonical?.default_store ?? null)
  // ── Notes ──
  const [brandNote, setBrandNote] = useState<string | null>(canonical?.brand_note ?? null)
  // ── Aisle ──
  const [aisle, setAisle] = useState<number>(
    canonical?.default_aisle_order ?? detectAisleOrder(canonical?.name ?? '', canonical?.emoji ?? null)
  )

  function setCanonicalId(id: string) {
    _setCanonicalId(id)
    const c = selected.find(i => i.id === id)
    if (!c) return
    setImageSourceId(id)
    setStore(c.default_store ?? null)
    setBrandNote(c.brand_note ?? null)
    setAisle(c.default_aisle_order ?? detectAisleOrder(c.name, c.emoji ?? null))
  }

  // Items with actual images
  const itemsWithImage = selected.filter(i => i.image_status === 'done' && i.image_url)

  // Unique stores / notes across selected (excluding nulls)
  const uniqueStores = [...new Set(selected.map(i => i.default_store).filter(Boolean))] as string[]
  const uniqueNotes  = [...new Set(selected.map(i => i.brand_note).filter(Boolean))]  as string[]

  async function handleMerge() {
    const mergeIds = selected.filter(i => i.id !== canonicalId).map(i => i.id)
    if (mergeIds.length === 0) { onClose(); return }

    const overrides: Record<string, unknown> = {
      default_store:      store,
      brand_note:         brandNote,
      default_aisle_order: aisle,
    }
    // Copy image from chosen source if it differs from the canonical row
    if (imageSourceId !== canonicalId) {
      const src = selected.find(i => i.id === imageSourceId)
      if (src?.image_url) {
        overrides.image_url    = src.image_url
        overrides.image_status = src.image_status
      }
    }

    await merge.mutateAsync({ canonicalId, mergeIds, overrides })
    onDone()
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'flex-end',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--dk2)', borderRadius: '20px 20px 0 0',
        padding: '20px 16px 32px', width: '100%',
        borderTop: '0.5px solid var(--brh)',
        maxHeight: '88vh', overflowY: 'auto',
      }}>
        <div style={{ fontSize: '17px', fontWeight: 600, color: 'var(--tp)', marginBottom: '4px' }}>
          Merge {selected.length} ingredients
        </div>
        <div style={{ fontSize: '13px', color: 'var(--ts)', marginBottom: '20px' }}>
          Pick which value to keep for each field. All recipe and grocery references will be updated.
        </div>

        {/* ── Name ── */}
        <div style={SECTION_LABEL}>Keep this name</div>
        <RadioList
          items={selected}
          selectedId={canonicalId}
          onSelect={setCanonicalId}
          renderLabel={item => {
            const ing = item as IngredientCatalog
            return (
              <>
                <span style={{ fontSize: '18px' }}>{ing.emoji ?? '🥄'}</span>
                <span style={{ fontSize: '15px', color: 'var(--tp)', fontWeight: canonicalId === ing.id ? 600 : 400 }}>
                  {ing.name}
                </span>
              </>
            )
          }}
        />

        {/* ── Image ── */}
        {itemsWithImage.length > 0 && (
          <>
            <div style={SECTION_LABEL}>Keep this image</div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
              {itemsWithImage.map(item => {
                const sel = imageSourceId === item.id
                return (
                  <div
                    key={item.id}
                    onClick={() => setImageSourceId(item.id)}
                    style={{
                      cursor: 'pointer', borderRadius: '12px', overflow: 'hidden',
                      border: `2px solid ${sel ? 'var(--am)' : 'var(--br)'}`,
                      background: 'var(--dk3)', position: 'relative',
                      width: '72px', height: '72px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <img
                      src={item.image_url!}
                      alt={item.name}
                      style={{ width: '68px', height: '68px', objectFit: 'contain' }}
                    />
                    {sel && (
                      <div style={{
                        position: 'absolute', bottom: '4px', right: '4px',
                        width: '18px', height: '18px', borderRadius: '50%',
                        background: 'var(--am)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Check size={10} color="#141820" strokeWidth={3} />
                      </div>
                    )}
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      background: 'rgba(0,0,0,0.55)',
                      fontSize: '9px', color: '#fff', textAlign: 'center',
                      padding: '2px 4px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {item.name}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── Store ── */}
        {uniqueStores.length > 0 && (
          <>
            <div style={SECTION_LABEL}>Default store</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
              {uniqueStores.map(s => (
                <button
                  key={s}
                  onClick={() => setStore(store === s ? null : s)}
                  style={{
                    padding: '7px 13px', borderRadius: '20px',
                    border: `0.5px solid ${store === s ? 'var(--am)' : 'var(--br)'}`,
                    background: store === s ? 'rgba(123,175,138,0.15)' : 'var(--dk3)',
                    color: store === s ? 'var(--am)' : 'var(--tp)',
                    fontSize: '14px', fontWeight: store === s ? 600 : 400,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  {s}
                </button>
              ))}
              <button
                onClick={() => setStore(null)}
                style={{
                  padding: '7px 13px', borderRadius: '20px',
                  border: `0.5px solid ${store === null ? 'var(--am)' : 'var(--br)'}`,
                  background: store === null ? 'rgba(123,175,138,0.15)' : 'var(--dk3)',
                  color: store === null ? 'var(--am)' : 'var(--ts)',
                  fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                None
              </button>
            </div>
          </>
        )}

        {/* ── Notes ── */}
        {uniqueNotes.length > 0 && (
          <>
            <div style={SECTION_LABEL}>Notes</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
              {uniqueNotes.map(n => (
                <button
                  key={n}
                  onClick={() => setBrandNote(brandNote === n ? null : n)}
                  style={{
                    padding: '7px 13px', borderRadius: '20px',
                    border: `0.5px solid ${brandNote === n ? 'var(--am)' : 'var(--br)'}`,
                    background: brandNote === n ? 'rgba(123,175,138,0.15)' : 'var(--dk3)',
                    color: brandNote === n ? 'var(--am)' : 'var(--tp)',
                    fontSize: '14px', fontWeight: brandNote === n ? 600 : 400,
                    cursor: 'pointer', fontFamily: 'inherit', fontStyle: 'italic',
                  }}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setBrandNote(null)}
                style={{
                  padding: '7px 13px', borderRadius: '20px',
                  border: `0.5px solid ${brandNote === null ? 'var(--am)' : 'var(--br)'}`,
                  background: brandNote === null ? 'rgba(123,175,138,0.15)' : 'var(--dk3)',
                  color: brandNote === null ? 'var(--am)' : 'var(--ts)',
                  fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                None
              </button>
            </div>
          </>
        )}

        {/* ── Aisle ── */}
        <div style={SECTION_LABEL}>Aisle</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '24px' }}>
          {Object.entries(AISLE_NAMES).map(([key, name]) => {
            const a = Number(key)
            const sel = aisle === a
            const img = AISLE_IMAGES[a]
            const emoji = AISLE_LABELS[a]?.split(' ')[0] ?? '🛒'
            return (
              <button
                key={a}
                onClick={() => setAisle(a)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '5px 10px 5px 6px', borderRadius: '18px',
                  border: `0.5px solid ${sel ? 'var(--am)' : 'var(--br)'}`,
                  background: sel ? 'rgba(123,175,138,0.15)' : 'var(--dk3)',
                  color: sel ? 'var(--am)' : 'var(--ts)',
                  fontSize: '13px', fontFamily: 'inherit', cursor: 'pointer',
                  fontWeight: sel ? 500 : 400,
                }}
              >
                {img ? (
                  <img src={img} alt={name} style={{ width: '22px', height: '22px', objectFit: 'contain', flexShrink: 0 }} />
                ) : (
                  <span style={{ fontSize: '16px', lineHeight: 1 }}>{emoji}</span>
                )}
                {name}
              </button>
            )
          })}
        </div>

        {/* ── Actions ── */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '13px', background: 'var(--dk3)',
              border: '0.5px solid var(--br)', borderRadius: '12px',
              color: 'var(--ts)', fontSize: '15px', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleMerge}
            disabled={merge.isPending}
            style={{
              flex: 2, padding: '13px', background: 'var(--am)',
              border: 'none', borderRadius: '12px',
              color: '#141820', fontSize: '15px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {merge.isPending ? 'Merging…' : `Merge into "${canonical?.name}"`}
          </button>
        </div>
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
        fontSize: '14px', cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      <span>{checked ? '✓' : '○'}</span>
      {label}
    </button>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function CatalogScreen() {
  const navigate = useNavigate()
  const [search,      setSearch]      = useState('')
  const [editing,     setEditing]     = useState<IngredientCatalog | null>(null)
  const [selectMode,  setSelectMode]  = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [merging,     setMerging]     = useState(false)

  useIngredientImageRealtime()

  const { data: items = [],  isLoading } = useCatalogItems(search)
  const { data: storeRows = [] } = useFamilyStores()
  const stores = storeRows.map(s => s.name)

  // Group by aisle — prefer explicitly-saved default_aisle_order, fall back to auto-detect
  type AisleGroup = { aisle: number; label: string; items: IngredientCatalog[] }

  const grouped: AisleGroup[] = []
  const aisleMap = new Map<number, IngredientCatalog[]>()
  for (const item of items) {
    const a = item.default_aisle_order ?? detectAisleOrder(item.name, item.emoji ?? null)
    if (!aisleMap.has(a)) aisleMap.set(a, [])
    aisleMap.get(a)!.push(item)
  }
  for (const [aisle, aisleItems] of [...aisleMap.entries()].sort((a, b) => a[0] - b[0])) {
    grouped.push({ aisle, label: AISLE_LABELS[aisle] ?? '🛒 Other', items: aisleItems })
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const selectedItems = items.filter(i => selectedIds.has(i.id))

  return (
    <Screen>
      <div style={{ padding: '16px 16px 0', maxWidth: '480px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          {selectMode ? (
            <>
              <button
                onClick={exitSelectMode}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0, color: 'var(--ts)' }}
              >
                <X size={20} />
              </button>
              <span style={{ fontSize: '17px', fontWeight: 600, color: 'var(--tp)', flex: 1 }}>
                {selectedIds.size} selected
              </span>
              {selectedIds.size >= 2 && (
                <button
                  onClick={() => setMerging(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    background: 'var(--am)', border: 'none', borderRadius: '8px',
                    padding: '7px 12px', color: '#141820',
                    fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <GitMerge size={13} />
                  Merge
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={() => navigate('/settings')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0, color: 'var(--am)' }}
              >
                <ArrowLeft size={20} />
              </button>
              <span style={{ fontSize: '19px', fontWeight: 600, color: 'var(--tp)', flex: 1 }}>Ingredient Catalog</span>
              <button
                onClick={() => setSelectMode(true)}
                style={{
                  background: 'none', border: '0.5px solid var(--br)',
                  borderRadius: '8px', padding: '5px 10px',
                  color: 'var(--ts)', fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: '4px',
                }}
              >
                <GitMerge size={13} />
                Merge
              </button>
            </>
          )}
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
              fontSize: '15px', color: 'var(--tp)', fontFamily: 'inherit',
            }}
          />
        </div>

        {selectMode && (
          <div style={{
            fontSize: '13px', color: 'var(--ts)', marginBottom: '12px',
            padding: '8px 12px', background: 'rgba(123,175,138,0.08)',
            borderRadius: '8px', border: '0.5px solid rgba(123,175,138,0.2)',
          }}>
            Tap ingredients to select them, then tap <strong>Merge</strong> to combine into one.
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
            <div style={{ width: '20px', height: '20px', border: '2px solid var(--br)', borderTopColor: 'var(--am)', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          </div>
        )}

        {/* Empty */}
        {!isLoading && items.length === 0 && (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <div style={{ fontSize: '38px', marginBottom: '12px' }}>📦</div>
            <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--tp)', marginBottom: '6px' }}>
              {search ? `No ingredients matching "${search}"` : 'No ingredients yet'}
            </div>
            <p style={{ fontSize: '14px', color: 'var(--ts)', margin: 0 }}>
              Ingredients are added when you save recipes.
            </p>
          </div>
        )}

        {/* Grouped list */}
        {!isLoading && grouped.map(group => (
          <div key={group.aisle} style={{ marginBottom: '20px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '12px', fontWeight: 600, color: 'var(--tm)',
              textTransform: 'uppercase', letterSpacing: '0.8px',
              marginBottom: '6px', paddingLeft: '4px',
            }}>
              {AISLE_IMAGES[group.aisle] ? (
                <img
                  src={AISLE_IMAGES[group.aisle]!}
                  alt={AISLE_NAMES[group.aisle] ?? ''}
                  style={{ width: '20px', height: '20px', objectFit: 'contain', flexShrink: 0 }}
                />
              ) : (
                <span style={{ fontSize: '14px' }}>{group.label.split(' ')[0]}</span>
              )}
              {AISLE_NAMES[group.aisle] ?? group.label}
            </div>
            <div style={{
              background: 'var(--dkc)', border: '0.5px solid var(--br)',
              borderRadius: '12px', overflow: 'hidden',
            }}>
              {group.items.map((item, idx) => {
                const isSelected = selectedIds.has(item.id)
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (selectMode) { toggleSelect(item.id) }
                      else { setEditing(item) }
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '11px 14px',
                      borderBottom: idx < group.items.length - 1 ? '0.5px solid var(--br)' : 'none',
                      cursor: 'pointer',
                      background: isSelected ? 'rgba(123,175,138,0.1)' : 'transparent',
                    }}
                  >
                    {/* Select checkbox in merge mode */}
                    {selectMode && (
                      <div style={{
                        width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                        border: `2px solid ${isSelected ? 'var(--am)' : 'var(--br)'}`,
                        background: isSelected ? 'var(--am)' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {isSelected && <Check size={11} color="#141820" strokeWidth={3} />}
                      </div>
                    )}

                    <div style={{ position: 'relative', width: '24px', flexShrink: 0 }}>
                      {item.image_status === 'done' && item.image_url ? (
                        <img
                          src={item.image_url}
                          alt={item.name}
                          style={{ width: '24px', height: '24px', objectFit: 'contain', display: 'block', borderRadius: '4px' }}
                        />
                      ) : (
                        <span style={{ fontSize: '20px', width: '24px', textAlign: 'center', display: 'block' }}>
                          {item.emoji ?? '🥄'}
                        </span>
                      )}
                      {item.image_status === 'generating' && (
                        <div style={{
                          position: 'absolute', bottom: 0, left: 0,
                          width: '6px', height: '6px', borderRadius: '50%',
                          background: 'var(--am)',
                          animation: 'nb2-pulse 1.2s ease-in-out infinite',
                        }} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '15px', color: 'var(--tp)', fontWeight: 500 }}>{item.name}</div>
                      {item.brand_note && (
                        <div style={{ fontSize: '13px', color: 'var(--ts)', fontStyle: 'italic' }}>{item.brand_note}</div>
                      )}
                    </div>
                    {item.default_store && (
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        background: 'rgba(255,255,255,0.05)', borderRadius: '6px',
                        padding: '3px 7px', flexShrink: 0,
                      }}>
                        <Store size={10} color="var(--ts)" />
                        <span style={{ fontSize: '12px', color: 'var(--ts)' }}>{item.default_store}</span>
                      </div>
                    )}
                    {item.is_pantry_staple && (
                      <div style={{
                        background: 'rgba(123,175,138,0.12)', borderRadius: '6px',
                        padding: '3px 7px', flexShrink: 0,
                      }}>
                        <span style={{ fontSize: '12px', color: 'var(--am)' }}>staple</span>
                      </div>
                    )}
                  </div>
                )
              })}
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
          onDeleted={() => setEditing(null)}
        />
      )}

      {/* Merge sheet */}
      {merging && (
        <MergeSheet
          selected={selectedItems}
          onClose={() => setMerging(false)}
          onDone={() => { setMerging(false); exitSelectMode() }}
        />
      )}
    </Screen>
  )
}
