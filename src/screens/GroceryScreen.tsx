import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Flame } from 'lucide-react'
import { Screen } from '../components/layout/Screen'
import {
  useActiveGroceryList, useGroceryListItems, useGroceryListRealtime,
  useToggleItem, useAddManualItem, useUpdateGroceryItem, useUpdateItemStore,
  useKnownStores, useIngredientSuggestions,
  itemDisplayName, itemEmoji, itemQtyLabel,
  detectAisleOrder,
} from '../hooks/useGroceryList'
import { AISLE_LABELS } from '../lib/aisleUtils'
import type { GroceryItem } from '../hooks/useGroceryList'
import { useIngredientImageRealtime, useBackfillIngredientImages, useBackfillAllCatalogImages } from '../hooks/useIngredientImages'
import { generateIngredientImage } from '../lib/images'
import { StoreIcon } from '../lib/storeIcons'
import { useFamilyStores } from '../hooks/useFamilyStores'

// ── GroceryScreen ─────────────────────────────────────────────────────────────

export function GroceryScreen() {
  const navigate = useNavigate()

  // ── Data ──
  const { data: list }  = useActiveGroceryList()
  const { data: items = [] } = useGroceryListItems(list?.id ?? null)
  useGroceryListRealtime(list?.id ?? null)
  useIngredientImageRealtime()
  useBackfillIngredientImages(items)
  useBackfillAllCatalogImages()

  const { data: knownStores = [] } = useKnownStores()
  const { data: familyStores = [] } = useFamilyStores()
  // Build a name → emoji map so user-set emojis propagate to tiles + tabs
  const storeEmojiMap = useMemo(() =>
    Object.fromEntries(familyStores.filter(s => s.emoji).map(s => [s.name, s.emoji!])),
  [familyStores])

  // ── Store tabs ──
  const [activeStore,       setActiveStore]       = useState('All')
  const [extraStores,       setExtraStores]       = useState<string[]>([])
  const [showStoreInput,    setShowStoreInput]     = useState(false)
  const [newStoreName,      setNewStoreName]       = useState('')
  const storeInputRef = useRef<HTMLInputElement>(null)

  // Derive store list ordered by family_stores sort_order, then any catalog
  // stores not in family_stores, then locally-added extras
  const allStores = useMemo(() => {
    const familyNames = familyStores.map(s => s.name)  // already sorted by sort_order
    const catalogExtra = knownStores.filter(s => !familyNames.includes(s)).sort()
    const localExtra   = extraStores.filter(s => !familyNames.includes(s) && !catalogExtra.includes(s))
    return [...familyNames, ...catalogExtra, ...localExtra]
  }, [familyStores, knownStores, extraStores])

  useEffect(() => {
    if (showStoreInput) storeInputRef.current?.focus()
  }, [showStoreInput])

  function submitNewStore() {
    const name = newStoreName.trim()
    if (name && !allStores.includes(name)) {
      setExtraStores(prev => [...prev, name])
    }
    if (name) setActiveStore(name)
    setNewStoreName('')
    setShowStoreInput(false)
  }

  // ── Filter items by store ──
  const filteredItems = useMemo(() => {
    if (activeStore === 'All') return items
    return items.filter(item =>
      (item.assigned_store ?? item.ingredient?.default_store ?? null) === activeStore
    )
  }, [items, activeStore])

  const unchecked = filteredItems.filter(i => !i.is_checked)
  const checked   = filteredItems.filter(i =>  i.is_checked)

  // ── Mutations ──
  const toggleItem  = useToggleItem()
  const addItem     = useAddManualItem()
  const updateItem  = useUpdateGroceryItem()
  const assignStore = useUpdateItemStore()

  /** Right-click / context-menu: cycle the item through available stores. */
  function handleStoreCycle(item: GroceryItem) {
    if (!list) return
    const cycle = [null, ...allStores] as (string | null)[]
    const currentIdx = cycle.indexOf(item.assigned_store ?? null)
    const next = cycle[(currentIdx + 1) % cycle.length]
    assignStore.mutate({
      itemId: item.id,
      listId: list.id,
      store: next ?? '',
      ingredientId: item.ingredient_id,
    })
  }

  // ── Add bar / KB pane ──
  const [showKb,    setShowKb]    = useState(false)
  const [kbSearch,  setKbSearch]  = useState('')
  const kbInputRef = useRef<HTMLInputElement>(null)

  const { data: suggestions = [] } = useIngredientSuggestions(kbSearch)

  function openKb() { setShowKb(true); setKbSearch(''); setTimeout(() => kbInputRef.current?.focus(), 50) }
  function closeKb() { setShowKb(false); setKbSearch('') }

  function handleAddSuggestion(sug: { id: string; name: string; emoji: string | null; image_url?: string | null; image_status?: string | null }) {
    if (!list) return
    addItem.mutate(
      { listId: list.id, name: sug.name, ingredientId: sug.id, emoji: sug.emoji },
      {
        onSuccess: () => {
          // Fire image gen if this catalog item doesn't have one yet
          if (!sug.image_url && sug.image_status !== 'generating') {
            generateIngredientImage(sug.id, sug.name).catch(() => {})
          }
        },
      }
    )
  }

  function handleAddCustom() {
    if (!list || !kbSearch.trim()) return
    const name = kbSearch.trim()
    setKbSearch('')
    addItem.mutate(
      { listId: list.id, name },
      {
        onSuccess: (result) => {
          // useAddManualItem upserted a catalog entry — fire image gen for it
          if (result?.ingredientId && result.needsImage) {
            generateIngredientImage(result.ingredientId, name).catch(() => {})
          }
        },
      }
    )
  }

  // ── Edit item sheet (long-press) ──
  const [editSheetItem, setEditSheetItem] = useState<GroceryItem | null>(null)
  const [editName,      setEditName]      = useState('')
  const [editQty,       setEditQty]       = useState('')
  const [editUnit,      setEditUnit]      = useState('')
  const [editNotes,     setEditNotes]     = useState('')
  const [editAisle,     setEditAisle]     = useState<number>(7)
  const [editStore,     setEditStore]     = useState<string | null>(null)
  const [editNewStore,  setEditNewStore]  = useState('')

  function openEditSheet(item: GroceryItem) {
    setEditSheetItem(item)
    setEditName(itemDisplayName(item))
    setEditQty(item.quantity != null ? String(item.quantity) : '')
    setEditUnit(item.unit ?? '')
    setEditNotes(item.ingredient?.brand_note ?? '')
    setEditAisle(item.aisle_order ?? detectAisleOrder(itemDisplayName(item), item.ingredient?.emoji ?? null))
    setEditStore(item.assigned_store ?? item.ingredient?.default_store ?? null)
    setEditNewStore('')
  }

  function closeEditSheet() { setEditSheetItem(null) }

  function handleSaveEdit() {
    if (!editSheetItem || !list) return
    const qty = editQty.trim() ? parseFloat(editQty.trim()) : null
    updateItem.mutate({
      itemId:            editSheetItem.id,
      listId:            list.id,
      quantity:          qty !== null && !isNaN(qty) ? qty : null,
      unit:              editUnit.trim() || null,
      aisleOrder:        editAisle,
      assignedStore:     editStore || null,
      ingredientId:      editSheetItem.ingredient_id,
      name:              editName.trim(),
      notes:             editNotes.trim() || null,
      defaultAisleOrder: editAisle,
    }, { onSuccess: closeEditSheet })
  }

  function handleAddEditStore() {
    const s = editNewStore.trim()
    if (!s) return
    if (!allStores.includes(s)) setExtraStores(prev => [...prev, s])
    setEditStore(s)
    setEditNewStore('')
  }

  // ── Week range label ──
  const weekLabel = useMemo(() => {
    if (!list) return null
    const d = new Date(list.week_start + 'T12:00:00')
    const end = new Date(d)
    end.setDate(end.getDate() + 6)
    const fmt = (date: Date) => date.toLocaleString('default', { month: 'short', day: 'numeric' })
    return `${fmt(d)} – ${fmt(end)}`
  }, [list])

  // ── Empty state ──
  if (!list) {
    return (
      <Screen>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px 120px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--tp)', margin: '0 0 4px' }}>
              Grocery
            </h1>
            <div style={{
              marginTop: '40px', textAlign: 'center',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px',
            }}>
              <span style={{ fontSize: '42px' }}>🛒</span>
              <p style={{ fontSize: '16px', color: 'var(--ts)', margin: 0 }}>
                No grocery list yet
              </p>
              <p style={{ fontSize: '14px', color: 'var(--tm)', margin: 0 }}>
                Plan meals in the Planner, then tap<br />"Generate grocery list" to build your list.
              </p>
              <button
                onClick={() => navigate('/planner')}
                style={{
                  marginTop: '8px',
                  background: 'var(--am)', color: '#141820',
                  border: 'none', borderRadius: '10px',
                  padding: '10px 20px',
                  fontSize: '15px', fontWeight: 600,
                  fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                Go to Planner →
              </button>
            </div>
          </div>
        </div>
      </Screen>
    )
  }

  return (
    <Screen>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 145px' }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                <Flame size={22} color="var(--am)" strokeWidth={2} />
                <h1 style={{ fontSize: '24px', fontWeight: 600, color: 'var(--tp)', margin: 0 }}>
                  Grocery
                </h1>
              </div>
              {weekLabel && (
                <p style={{ fontSize: '13px', color: 'var(--ts)', margin: 0 }}>{weekLabel}</p>
              )}
            </div>
            <span style={{ fontSize: '13px', color: 'var(--tm)', paddingTop: '4px' }}>
              {unchecked.length} left
            </span>
          </div>

          {/* Store tabs */}
          <div style={{
            display: 'flex', gap: '6px',
            overflowX: 'auto', scrollbarWidth: 'none',
            marginBottom: '12px',
            paddingBottom: '2px',
          }}>
            {(['All', ...allStores] as string[]).map(store => (
              <button
                key={store}
                onClick={() => setActiveStore(store)}
                style={{
                  flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: '5px',
                  fontSize: '13px', fontWeight: 500,
                  padding: '6px 12px', borderRadius: '18px',
                  border: `0.5px solid ${activeStore === store ? 'var(--am)' : 'var(--brh)'}`,
                  background: activeStore === store ? 'var(--am)' : 'none',
                  color: activeStore === store ? '#141820' : 'var(--ts)',
                  cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
              >
                {store !== 'All' && <StoreIcon name={store} emoji={storeEmojiMap[store]} size={14} />}
                {store}
              </button>
            ))}

            {/* + Store */}
            {showStoreInput ? (
              <input
                ref={storeInputRef}
                value={newStoreName}
                onChange={e => setNewStoreName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') submitNewStore(); if (e.key === 'Escape') { setShowStoreInput(false); setNewStoreName('') } }}
                onBlur={submitNewStore}
                placeholder="Store name…"
                style={{
                  flexShrink: 0, width: '100px',
                  background: 'var(--dk3)', border: '0.5px solid var(--am)',
                  borderRadius: '18px', padding: '6px 10px',
                  color: 'var(--tp)', fontSize: '13px',
                  fontFamily: 'inherit', outline: 'none',
                }}
              />
            ) : (
              <button
                onClick={() => setShowStoreInput(true)}
                style={{
                  flexShrink: 0,
                  fontSize: '13px', fontWeight: 500,
                  padding: '6px 12px', borderRadius: '18px',
                  border: '0.5px solid var(--brh)',
                  background: 'none', color: 'var(--ts)',
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                + Store
              </button>
            )}
          </div>

          {/* Action row */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button
              onClick={() => navigate('/staging', { state: { from: 'grocery' } })}
              style={{
                flex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                padding: '8px', borderRadius: '10px',
                border: '0.5px solid rgba(123,175,138,0.3)',
                background: 'rgba(123,175,138,0.08)',
                fontSize: '13px', fontWeight: 500, color: 'var(--am)',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <Sparkles size={13} /> Review staples
            </button>
            <button
              onClick={openKb}
              style={{
                flex: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                padding: '8px', borderRadius: '10px',
                border: '0.5px solid var(--brh)',
                background: 'none',
                fontSize: '13px', fontWeight: 500, color: 'var(--ts)',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              ＋ Add item
            </button>
          </div>

          {/* Grocery grid — unchecked */}
          {unchecked.length === 0 && checked.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--tm)', fontSize: '15px' }}>
              {activeStore === 'All'
                ? 'No items — use "Add item" or regenerate from the Planner.'
                : `No items assigned to ${activeStore}.`}
            </div>
          )}

          {unchecked.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, 122px)',
              gap: '8px',
              marginBottom: '14px',
            }}>
              {unchecked.map(item => (
                <GroceryBox
                  key={item.id}
                  item={item}
                  storeEmojiMap={storeEmojiMap}
                  onTap={() => list && toggleItem.mutate({ id: item.id, listId: list.id, checked: true })}
                  onLongPress={() => openEditSheet(item)}
                  onContextMenu={() => handleStoreCycle(item)}
                />
              ))}
            </div>
          )}

          {/* Got it section — crossed off */}
          {checked.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                fontSize: '13px', fontWeight: 500, color: 'var(--gn)',
                marginBottom: '10px',
              }}>
                <span style={{ fontSize: '14px' }}>✓</span> Got it
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, 122px)',
                gap: '8px',
              }}>
                {checked.map(item => (
                  <GroceryBox
                    key={item.id}
                    item={item}
                    done
                    storeEmojiMap={storeEmojiMap}
                    onTap={() => list && toggleItem.mutate({ id: item.id, listId: list.id, checked: false })}
                    onLongPress={() => openEditSheet(item)}
                    onContextMenu={() => handleStoreCycle(item)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* KB pane — overlays add bar when open */}
        {showKb && (
          <>
            <div
              onClick={closeKb}
              style={{ position: 'absolute', inset: 0, zIndex: 18 }}
            />
            <div style={{
              position: 'absolute', bottom: 'calc(68px + env(safe-area-inset-bottom))', left: 0, right: 0,
              background: 'var(--dk2)',
              borderTop: '0.5px solid var(--brh)',
              zIndex: 20,
              padding: '9px 16px 11px',
              maxHeight: '50vh', overflowY: 'auto',
            }}>
              {/* Search input */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'var(--dk3)', border: '0.5px solid var(--brh)',
                borderRadius: '9px', padding: '6px 10px',
                marginBottom: '10px',
              }}>
                <span style={{ color: 'var(--tm)', fontSize: '15px' }}>🔍</span>
                <input
                  ref={kbInputRef}
                  value={kbSearch}
                  onChange={e => setKbSearch(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') closeKb() }}
                  placeholder="Add an item…"
                  style={{
                    flex: 1, background: 'none', border: 'none',
                    color: 'var(--tp)', fontSize: '14px',
                    fontFamily: 'inherit', outline: 'none',
                  }}
                />
                <button
                  onClick={closeKb}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tm)', fontSize: '13px', fontFamily: 'inherit' }}
                >
                  Done
                </button>
              </div>

              {/* Suggestions label */}
              <div style={{ fontSize: '11px', color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                Suggestions
              </div>

              {/* 4-col suggestion grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                gap: '6px',
                marginBottom: '8px',
              }}>
                {suggestions.map(sug => (
                  <button
                    key={sug.id}
                    onClick={() => { handleAddSuggestion(sug); closeKb() }}
                    style={{
                      background: 'var(--dk3)', border: '0.5px solid var(--br)',
                      borderRadius: '8px', padding: '7px 4px',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    {sug.image_status === 'done' && sug.image_url ? (
                      <img
                        src={sug.image_url}
                        alt={sug.name}
                        style={{ width: '36px', height: '36px', objectFit: 'contain', display: 'block' }}
                      />
                    ) : (
                      <span style={{ fontSize: '22px', lineHeight: 1 }}>{sug.emoji ?? '🛒'}</span>
                    )}
                    <span style={{ fontSize: '10px', color: 'var(--ts)', textAlign: 'center', lineHeight: 1.2 }}>
                      {sug.name}
                    </span>
                  </button>
                ))}
              </div>

              {/* Add free-text item if no exact match */}
              {kbSearch.trim() && !suggestions.some(s => s.name.toLowerCase() === kbSearch.trim().toLowerCase()) && (
                <button
                  onClick={() => { handleAddCustom(); closeKb(); }}
                  style={{
                    width: '100%',
                    background: 'rgba(123,175,138,0.08)',
                    border: '0.5px solid rgba(123,175,138,0.3)',
                    borderRadius: '8px', padding: '7px',
                    color: 'var(--am)', fontSize: '13px', fontWeight: 500,
                    fontFamily: 'inherit', cursor: 'pointer',
                  }}
                >
                  ＋ Add "{kbSearch.trim()}"
                </button>
              )}
            </div>
          </>
        )}

        {/* Add bar — pinned above nav */}
        {!showKb && (
          <div style={{
            position: 'absolute', bottom: 'calc(68px + env(safe-area-inset-bottom))', left: 0, right: 0,
            padding: '6px 16px 7px',
            background: 'var(--dk)',
            borderTop: '0.5px solid var(--br)',
            zIndex: 5,
          }}>
            <button
              onClick={openKb}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                background: 'var(--dk3)', border: '0.5px solid var(--br)',
                borderRadius: '9px', padding: '9px 12px',
                color: 'var(--tm)', fontSize: '14px',
                fontFamily: 'inherit', cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span>＋</span>
              <span>Add an item…</span>
            </button>
          </div>
        )}

        {/* Edit item bottom sheet */}
        {editSheetItem && (
          <>
            <div
              onClick={closeEditSheet}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 49 }}
            />
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'var(--dk2)',
              borderTop: '0.5px solid var(--brh)',
              borderRadius: '16px 16px 0 0',
              zIndex: 50,
              maxHeight: '82vh',
              display: 'flex', flexDirection: 'column',
            }}>
              {/* Drag handle */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 0' }}>
                <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'var(--br)' }} />
              </div>

              {/* Scrollable content */}
              <div style={{ overflowY: 'auto', padding: '12px 16px 32px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

                {/* Header: image + name */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* Image or emoji */}
                  <div style={{ flexShrink: 0, width: '48px', height: '48px', borderRadius: '12px', background: 'var(--dk3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {editSheetItem.ingredient?.image_status === 'done' && editSheetItem.ingredient.image_url ? (
                      <img src={editSheetItem.ingredient.image_url} alt={editName} style={{ width: '48px', height: '48px', objectFit: 'contain' }} />
                    ) : (
                      <span style={{ fontSize: '30px' }}>{itemEmoji(editSheetItem)}</span>
                    )}
                  </div>
                  {/* Editable name */}
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    style={{
                      flex: 1, background: 'var(--dk3)',
                      border: '0.5px solid var(--brh)', borderRadius: '10px',
                      padding: '10px 12px', color: 'var(--tp)',
                      fontSize: '17px', fontWeight: 600, fontFamily: 'inherit', outline: 'none',
                    }}
                  />
                </div>

                {/* Quantity + unit */}
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--ts)', fontWeight: 500, marginBottom: '7px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Quantity</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={editQty}
                      onChange={e => setEditQty(e.target.value)}
                      placeholder="—"
                      style={{
                        width: '80px', background: 'var(--dk3)',
                        border: '0.5px solid var(--brh)', borderRadius: '8px',
                        padding: '8px 10px', color: 'var(--tp)',
                        fontSize: '15px', fontFamily: 'inherit', outline: 'none',
                      }}
                    />
                    <input
                      value={editUnit}
                      onChange={e => setEditUnit(e.target.value)}
                      placeholder="unit (oz, lbs, cup…)"
                      style={{
                        flex: 1, background: 'var(--dk3)',
                        border: '0.5px solid var(--brh)', borderRadius: '8px',
                        padding: '8px 10px', color: 'var(--tp)',
                        fontSize: '15px', fontFamily: 'inherit', outline: 'none',
                      }}
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--ts)', fontWeight: 500, marginBottom: '7px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Notes</div>
                  <input
                    value={editNotes}
                    onChange={e => setEditNotes(e.target.value)}
                    placeholder="Brand, variety, notes…"
                    style={{
                      width: '100%', boxSizing: 'border-box',
                      background: 'var(--dk3)',
                      border: '0.5px solid var(--brh)', borderRadius: '8px',
                      padding: '8px 10px', color: 'var(--tp)',
                      fontSize: '15px', fontFamily: 'inherit', outline: 'none',
                    }}
                  />
                </div>

                {/* Aisle */}
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--ts)', fontWeight: 500, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Aisle</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {Object.entries(AISLE_LABELS).map(([key, label]) => {
                      const a = Number(key)
                      const selected = editAisle === a
                      return (
                        <button
                          key={a}
                          onClick={() => setEditAisle(a)}
                          style={{
                            padding: '6px 11px', borderRadius: '18px',
                            border: `0.5px solid ${selected ? 'var(--am)' : 'var(--brh)'}`,
                            background: selected ? 'rgba(123,175,138,0.15)' : 'none',
                            color: selected ? 'var(--am)' : 'var(--ts)',
                            fontSize: '14px', fontFamily: 'inherit', cursor: 'pointer',
                            fontWeight: selected ? 500 : 400,
                          }}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Store */}
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--ts)', fontWeight: 500, marginBottom: '7px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Store</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '8px' }}>
                    {allStores.map(store => {
                      const selected = editStore === store
                      return (
                        <button
                          key={store}
                          onClick={() => setEditStore(selected ? null : store)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '9px 12px', borderRadius: '10px',
                            background: selected ? 'rgba(123,175,138,0.1)' : 'none',
                            border: `0.5px solid ${selected ? 'rgba(123,175,138,0.35)' : 'transparent'}`,
                            cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          <span style={{
                            width: '14px', height: '14px', borderRadius: '50%',
                            border: `1.5px solid ${selected ? 'var(--am)' : 'var(--brh)'}`,
                            background: selected ? 'var(--am)' : 'none',
                            flexShrink: 0,
                          }} />
                          <StoreIcon name={store} emoji={storeEmojiMap[store]} size={16} />
                          <span style={{ fontSize: '15px', color: selected ? 'var(--tp)' : 'var(--ts)', fontWeight: selected ? 500 : 400 }}>
                            {store}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: '7px' }}>
                    <input
                      value={editNewStore}
                      onChange={e => setEditNewStore(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddEditStore() }}
                      placeholder="New store…"
                      style={{
                        flex: 1, background: 'var(--dk3)',
                        border: '0.5px solid var(--brh)', borderRadius: '8px',
                        padding: '8px 10px', color: 'var(--tp)',
                        fontSize: '14px', fontFamily: 'inherit', outline: 'none',
                      }}
                    />
                    <button
                      onClick={handleAddEditStore}
                      disabled={!editNewStore.trim()}
                      style={{
                        background: editNewStore.trim() ? 'var(--am)' : 'var(--dk3)',
                        border: 'none', borderRadius: '8px', padding: '8px 14px',
                        color: editNewStore.trim() ? '#141820' : 'var(--tm)',
                        fontSize: '13px', fontWeight: 500, fontFamily: 'inherit',
                        cursor: editNewStore.trim() ? 'pointer' : 'default',
                      }}
                    >
                      Add
                    </button>
                  </div>
                </div>

                {/* Save button */}
                <button
                  onClick={handleSaveEdit}
                  disabled={updateItem.isPending}
                  style={{
                    width: '100%', padding: '13px',
                    background: 'var(--am)', border: 'none', borderRadius: '12px',
                    color: '#141820', fontSize: '16px', fontWeight: 600,
                    fontFamily: 'inherit', cursor: 'pointer',
                    opacity: updateItem.isPending ? 0.6 : 1,
                  }}
                >
                  {updateItem.isPending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Screen>
  )
}

// ── GroceryBox ────────────────────────────────────────────────────────────────

function GroceryBox({
  item, done = false, storeEmojiMap = {}, onTap, onLongPress, onContextMenu,
}: {
  item:           GroceryItem
  done?:          boolean
  storeEmojiMap?: Record<string, string>
  onTap:          () => void
  onLongPress:    () => void
  onContextMenu?: () => void
}) {
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPress = useRef(false)

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return          // ignore right-click / middle-click
    didLongPress.current = false
    pressTimer.current = setTimeout(() => {
      didLongPress.current = true
      onLongPress()
    }, 500)
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (e.button !== 0) return          // ignore right-click / middle-click
    if (pressTimer.current) clearTimeout(pressTimer.current)
    if (!didLongPress.current) onTap()
  }

  function handlePointerLeave() {
    if (pressTimer.current) clearTimeout(pressTimer.current)
  }

  const name       = itemDisplayName(item)
  const emoji      = itemEmoji(item)
  const qty        = itemQtyLabel(item)
  const brandNote  = item.ingredient?.brand_note ?? null
  const imgUrl     = item.ingredient?.image_status === 'done' ? item.ingredient.image_url : null
  const storeName  = item.assigned_store ?? item.ingredient?.default_store ?? null

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onContextMenu={e => { e.preventDefault(); onContextMenu?.() }}
      style={{
        position: 'relative',
        background: 'var(--dkc)',
        border: `0.5px solid ${done ? 'var(--br)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: '12px',
        minHeight: '80px',
        padding: '8px 6px 7px',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: '3px',
        cursor: 'pointer',
        opacity: done ? 0.38 : 1,
        transition: 'opacity 0.2s',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* ✓ badge (done) or store favicon (not done) */}
      {done ? (
        <div style={{
          position: 'absolute', top: '5px', right: '5px',
          width: '14px', height: '14px', borderRadius: '50%',
          background: 'var(--gn)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ fontSize: '9px', color: 'white', fontWeight: 600 }}>✓</span>
        </div>
      ) : storeName ? (
        <div style={{ position: 'absolute', top: '5px', right: '5px' }}>
          <StoreIcon name={storeName} emoji={storeEmojiMap[storeName]} size={16} />
        </div>
      ) : null}

      <div style={{ position: 'relative', flexShrink: 0 }}>
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={name}
            style={{ width: '100px', height: '100px', objectFit: 'contain', display: 'block' }}
          />
        ) : (
          <span style={{ fontSize: '54px', lineHeight: 1, display: 'block' }}>{emoji}</span>
        )}
        {item.ingredient?.image_status === 'generating' && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0,
            width: '7px', height: '7px', borderRadius: '50%',
            background: 'var(--am)',
            animation: 'nb2-pulse 1.2s ease-in-out infinite',
          }} />
        )}
      </div>
      <span style={{
        fontSize: '12px', color: done ? 'var(--tm)' : 'var(--tp)',
        fontWeight: 500, textAlign: 'center', lineHeight: 1.3,
        textDecoration: done ? 'line-through' : 'none',
      }}>
        {name}
      </span>
      {qty && (
        <span style={{
          fontSize: '11px', color: done ? 'var(--tm)' : 'var(--am)',
          fontWeight: 500,
        }}>
          {qty}
        </span>
      )}
      {brandNote && (
        <span style={{
          fontSize: '10px', color: 'var(--tm)',
          fontStyle: 'italic', textAlign: 'center', lineHeight: 1.2,
        }}>
          {brandNote}
        </span>
      )}
    </div>
  )
}
