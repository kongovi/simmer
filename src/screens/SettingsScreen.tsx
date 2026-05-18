import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LogOut, User, ChevronRight, Flame,
  Bot, BookOpen, Users, Plus, Trash2, Copy, Check, X, Upload,
  ChevronUp, ChevronDown,
} from 'lucide-react'
import { StoreIcon } from '../lib/storeIcons'
import { Screen } from '../components/layout/Screen'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
import { useUserSettings, useUpdatePlanStartDow } from '../hooks/useUserSettings'
import { useFamilyMembers, useFamilyInvites, useCreateInvite, useDeleteInvite, buildInviteUrl } from '../hooks/useFamilyMembers'
import { useFamilyStores, useAddFamilyStore, useDeleteFamilyStore, useUpdateFamilyStoreEmoji, useReorderFamilyStore } from '../hooks/useFamilyStores'
import { useOrderImport } from '../hooks/useOrderImport'
import type { ImportResult } from '../hooks/useOrderImport'

// ── Constants ─────────────────────────────────────────────────────────────────

const DOW_OPTIONS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{
        fontSize: '13px', fontWeight: 600, color: 'var(--tm)',
        textTransform: 'uppercase', letterSpacing: '0.8px',
        marginBottom: '8px', paddingLeft: '4px',
      }}>
        {title}
      </div>
      <div style={{
        background: 'var(--dkc)', border: '0.5px solid var(--br)',
        borderRadius: '12px', overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  )
}

function NavRow({
  label, value, onClick, icon,
}: {
  label: string; value?: string; onClick?: () => void; icon?: React.ReactNode
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', padding: '12px 14px',
        borderBottom: '0.5px solid var(--br)', gap: '10px',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {icon && <div style={{ color: 'var(--tm)', lineHeight: 0 }}>{icon}</div>}
      <span style={{ flex: 1, fontSize: '15px', color: 'var(--tp)' }}>{label}</span>
      {value && <span style={{ fontSize: '14px', color: 'var(--ts)' }}>{value}</span>}
      {onClick && <ChevronRight size={14} color="var(--tm)" />}
    </div>
  )
}

// ── Member avatar ─────────────────────────────────────────────────────────────

function MemberAvatar({ name, role, avatarUrl }: { name: string | null; role: string; avatarUrl?: string | null }) {
  const initials = (name ?? '?').slice(0, 2).toUpperCase()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '0.5px solid var(--br)' }}>
      <div style={{
        width: '32px', height: '32px', borderRadius: '50%',
        background: role === 'planner' ? 'rgba(123,175,138,0.25)' : 'rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '14px', fontWeight: 600, color: role === 'planner' ? 'var(--am)' : 'var(--tp)',
        flexShrink: 0, overflow: 'hidden',
      }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={name ?? ''} style={{ width: '32px', height: '32px', objectFit: 'cover' }} />
        ) : initials}
      </div>
      <span style={{ flex: 1, fontSize: '15px', color: 'var(--tp)' }}>{name ?? 'Unknown'}</span>
      <span style={{
        fontSize: '12px', fontWeight: 500, letterSpacing: '0.3px',
        color: role === 'planner' ? 'var(--am)' : 'var(--ts)',
        background: role === 'planner' ? 'rgba(123,175,138,0.12)' : 'rgba(255,255,255,0.06)',
        padding: '3px 8px', borderRadius: '6px',
      }}>
        {role}
      </span>
    </div>
  )
}

// ── Invite row ────────────────────────────────────────────────────────────────

function InviteRow({ token, onDelete }: { token: string; onDelete: () => void }) {
  const [copied, setCopied] = useState(false)
  const url = buildInviteUrl(token)

  function handleCopy() {
    navigator.clipboard.writeText(url).catch(() => {
      // Fallback: select
    })
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '10px 14px', borderBottom: '0.5px solid var(--br)',
    }}>
      <div style={{
        flex: 1, fontSize: '13px', color: 'var(--ts)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontFamily: 'monospace',
      }}>
        {url}
      </div>
      <button
        onClick={handleCopy}
        style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          padding: '5px 10px', flexShrink: 0,
          background: copied ? 'rgba(123,175,138,0.15)' : 'var(--dk3)',
          border: `0.5px solid ${copied ? 'var(--am)' : 'var(--brh)'}`,
          borderRadius: '7px', cursor: 'pointer',
          color: copied ? 'var(--am)' : 'var(--tp)',
          fontSize: '13px', fontWeight: 500, fontFamily: 'inherit',
          transition: 'all 0.15s',
        }}
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <button
        onClick={onDelete}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '4px', color: 'var(--tm)', lineHeight: 0,
        }}
      >
        <X size={14} />
      </button>
    </div>
  )
}

// ── Import order history sheet ────────────────────────────────────────────────

function ImportSheet({ onClose }: { onClose: () => void }) {
  const fileRef      = useRef<HTMLInputElement>(null)
  const importOrders = useOrderImport()
  const [result, setResult] = useState<ImportResult | null>(null)

  async function handleFile(file: File) {
    const text = await file.text()
    importOrders.mutate(text, { onSuccess: r => setResult(r) })
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--dk2)', borderRadius: '20px 20px 0 0', padding: '20px 16px 32px', width: '100%', borderTop: '0.5px solid var(--brh)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--tp)' }}>Import order history</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--tm)' }}>
            <X size={20} />
          </button>
        </div>

        {result ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ fontSize: '34px', marginBottom: '10px' }}>✅</div>
            <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--tp)', margin: '0 0 4px' }}>
              {result.imported} item{result.imported !== 1 ? 's' : ''} imported
            </p>
            {result.newToCatalog > 0 && (
              <p style={{ fontSize: '14px', color: 'var(--am)', margin: '0 0 20px' }}>
                {result.newToCatalog} new ingredient{result.newToCatalog !== 1 ? 's' : ''} added to catalog
              </p>
            )}
            <button onClick={onClose} style={{ padding: '11px 24px', background: 'var(--am)', border: 'none', borderRadius: '10px', color: '#141820', fontSize: '15px', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
              Done
            </button>
          </div>
        ) : (
          <>
            <p style={{ fontSize: '14px', color: 'var(--ts)', margin: '0 0 14px', lineHeight: 1.5 }}>
              Upload a CSV export from Instacart, Amazon Fresh, or Kroger to seed your staple predictions.
            </p>
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                border: '2px dashed var(--br)', borderRadius: '14px',
                padding: '28px 16px', textAlign: 'center', cursor: 'pointer',
                background: 'var(--dk3)', marginBottom: '12px',
              }}
            >
              {importOrders.isPending ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '20px', height: '20px', border: '2px solid var(--br)', borderTopColor: 'var(--am)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  <span style={{ fontSize: '14px', color: 'var(--ts)' }}>Importing…</span>
                </div>
              ) : (
                <>
                  <Upload size={22} color="var(--tm)" style={{ marginBottom: '8px' }} />
                  <div style={{ fontSize: '15px', color: 'var(--tp)', marginBottom: '3px' }}>Drop CSV or tap to browse</div>
                  <div style={{ fontSize: '13px', color: 'var(--ts)' }}>Instacart · Amazon Fresh · Kroger</div>
                </>
              )}
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} style={{ display: 'none' }} />
            </div>
            {importOrders.error && (
              <p style={{ fontSize: '14px', color: 'var(--rd)', margin: '0 0 10px' }}>
                {importOrders.error instanceof Error ? importOrders.error.message : 'Import failed'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export function SettingsScreen() {
  const navigate     = useNavigate()
  const user         = useAppStore(s => s.user)
  const familyId     = useAppStore(s => s.familyId)

  const { data: settings } = useUserSettings()
  const updateDow           = useUpdatePlanStartDow()

  const { data: members  = [] } = useFamilyMembers()
  const { data: invites  = [] } = useFamilyInvites()
  const createInvite             = useCreateInvite()
  const deleteInvite             = useDeleteInvite()

  const { data: stores  = [] } = useFamilyStores()
  const addStore                = useAddFamilyStore()
  const deleteStore             = useDeleteFamilyStore()
  const updateStoreEmoji        = useUpdateFamilyStoreEmoji()
  const reorderStore            = useReorderFamilyStore()

  const [newStoreName,   setNewStoreName]   = useState('')
  const [editEmojiId,    setEditEmojiId]    = useState<string | null>(null)
  const [editEmojiValue, setEditEmojiValue] = useState('')
  const [showImport,    setShowImport]    = useState(false)

  const displayName = user?.user_metadata?.full_name
    ?? user?.user_metadata?.name
    ?? user?.email?.split('@')[0]
    ?? 'You'
  const email     = user?.email ?? ''
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined

  const aiModelLabel: Record<string, string> = {
    claude: 'Claude', gpt4: 'GPT-4o', gemini: 'Gemini', local: 'Ollama',
  }
  const imageModelLabel: Record<string, string> = {
    'nano-banana-2': 'Nano Banana 2', 'nano-banana-pro': 'NB Pro',
    'nano-banana': 'Nano Banana', dalle: 'DALL·E 3', flux: 'FLUX',
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  async function handleAddStore() {
    const name = newStoreName.trim()
    if (!name) return
    await addStore.mutateAsync(name)
    setNewStoreName('')
  }

  return (
    <Screen>
      <div style={{ padding: '20px 16px', maxWidth: '480px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
          <Flame size={20} color="var(--am)" strokeWidth={2} />
          <span style={{ fontSize: '20px', fontWeight: 600, color: 'var(--tp)' }}>Settings</span>
        </div>

        {/* Profile card */}
        <div style={{
          background: 'var(--dkc)', border: '0.5px solid var(--br)',
          borderRadius: '14px', padding: '16px',
          display: 'flex', alignItems: 'center', gap: '14px',
          marginBottom: '24px',
        }}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: 'var(--dk3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <User size={22} color="var(--ts)" />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '17px', fontWeight: 600, color: 'var(--tp)', marginBottom: '2px' }}>
              {displayName}
            </div>
            <div style={{ fontSize: '14px', color: 'var(--ts)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {email}
            </div>
          </div>
        </div>

        {/* Meal Planning */}
        <SettingsSection title="Meal Planning">
          <div style={{
            display: 'flex', alignItems: 'center', padding: '12px 14px',
            borderBottom: '0.5px solid var(--br)', gap: '8px',
          }}>
            <span style={{ flex: 1, fontSize: '15px', color: 'var(--tp)' }}>Week starts on</span>
            <select
              value={settings?.plan_start_dow ?? 5}
              onChange={e => updateDow.mutate(Number(e.target.value))}
              style={{
                background: 'var(--dk3)', border: '0.5px solid var(--brh)',
                borderRadius: '7px', padding: '5px 8px',
                color: 'var(--tp)', fontSize: '14px',
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              {DOW_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </SettingsSection>

        {/* AI Models */}
        <SettingsSection title="AI">
          <NavRow
            label="AI Models"
            icon={<Bot size={15} />}
            value={`${aiModelLabel[settings?.ai_structuring_model ?? 'claude'] ?? 'Claude'} · ${imageModelLabel[settings?.ai_image_model ?? 'nano-banana-2'] ?? 'NB2'}`}
            onClick={() => navigate('/settings/models')}
          />
        </SettingsSection>

        {/* Catalog */}
        <SettingsSection title="Ingredients">
          <NavRow
            label="Ingredient catalog"
            icon={<BookOpen size={15} />}
            value={`${familyId ? '…' : '—'}`}
            onClick={() => navigate('/settings/catalog')}
          />
          <NavRow
            label="Import order history"
            icon={<Upload size={15} />}
            onClick={() => setShowImport(true)}
          />
        </SettingsSection>

        {/* Family */}
        <SettingsSection title="Family">
          {/* Members */}
          {members.map(m => (
            <MemberAvatar key={m.id} name={m.display_name} role={m.role} avatarUrl={m.avatar_url} />
          ))}
          {members.length === 0 && (
            <div style={{ padding: '12px 14px', fontSize: '14px', color: 'var(--ts)', borderBottom: '0.5px solid var(--br)' }}>
              No members found.
            </div>
          )}

          {/* Active invites */}
          {invites.map(inv => (
            <InviteRow
              key={inv.id}
              token={inv.token}
              onDelete={() => deleteInvite.mutate(inv.id)}
            />
          ))}

          {/* Invite button */}
          <div
            onClick={() => createInvite.mutate('member')}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '12px 14px', cursor: 'pointer',
              color: createInvite.isPending ? 'var(--tm)' : 'var(--am)',
            }}
          >
            <Users size={15} />
            <span style={{ fontSize: '15px', fontWeight: 500 }}>
              {createInvite.isPending ? 'Creating invite…' : 'Invite someone'}
            </span>
          </div>
        </SettingsSection>

        {/* Stores */}
        <SettingsSection title="Stores">
          {stores.length === 0 && (
            <div style={{ padding: '12px 14px', fontSize: '14px', color: 'var(--ts)', borderBottom: '0.5px solid var(--br)' }}>
              No stores added yet.
            </div>
          )}
          {stores.map((s, idx) => (
            <div
              key={s.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 14px',
                borderBottom: '0.5px solid var(--br)',
              }}
            >
              {/* Reorder buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flexShrink: 0 }}>
                <button
                  onClick={() => reorderStore.mutate({ stores, storeId: s.id, direction: 'up' })}
                  disabled={idx === 0}
                  style={{ background: 'none', border: 'none', cursor: idx === 0 ? 'default' : 'pointer', padding: '1px', color: idx === 0 ? 'var(--tm)' : 'var(--ts)', lineHeight: 0, opacity: idx === 0 ? 0.3 : 1 }}
                >
                  <ChevronUp size={13} />
                </button>
                <button
                  onClick={() => reorderStore.mutate({ stores, storeId: s.id, direction: 'down' })}
                  disabled={idx === stores.length - 1}
                  style={{ background: 'none', border: 'none', cursor: idx === stores.length - 1 ? 'default' : 'pointer', padding: '1px', color: idx === stores.length - 1 ? 'var(--tm)' : 'var(--ts)', lineHeight: 0, opacity: idx === stores.length - 1 ? 0.3 : 1 }}
                >
                  <ChevronDown size={13} />
                </button>
              </div>

              {/* Emoji — tap to edit */}
              {editEmojiId === s.id ? (
                <input
                  autoFocus
                  value={editEmojiValue}
                  onChange={e => setEditEmojiValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === 'Escape') {
                      const val = editEmojiValue.trim() || null
                      updateStoreEmoji.mutate({ storeId: s.id, emoji: val })
                      setEditEmojiId(null)
                    }
                  }}
                  onBlur={() => {
                    const val = editEmojiValue.trim() || null
                    updateStoreEmoji.mutate({ storeId: s.id, emoji: val })
                    setEditEmojiId(null)
                  }}
                  placeholder="emoji"
                  style={{
                    width: '36px', textAlign: 'center',
                    background: 'var(--dk3)', border: '0.5px solid var(--am)',
                    borderRadius: '6px', padding: '3px 4px',
                    fontSize: '16px', fontFamily: 'inherit', outline: 'none', color: 'var(--tp)',
                  }}
                />
              ) : (
                <button
                  title="Tap to change icon"
                  onClick={() => { setEditEmojiId(s.id); setEditEmojiValue(s.emoji ?? '') }}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', lineHeight: 0, flexShrink: 0 }}
                >
                  <StoreIcon name={s.name} emoji={s.emoji} size={18} />
                </button>
              )}

              <span style={{ flex: 1, fontSize: '15px', color: 'var(--tp)' }}>{s.name}</span>
              {s.is_default && (
                <span style={{
                  fontSize: '12px', color: 'var(--am)',
                  background: 'rgba(123,175,138,0.12)', padding: '2px 7px',
                  borderRadius: '5px',
                }}>
                  default
                </span>
              )}
              <button
                onClick={() => deleteStore.mutate(s.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: 'var(--tm)', lineHeight: 0 }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          {/* Add store */}
          <div style={{ display: 'flex', gap: '8px', padding: '10px 14px' }}>
            <input
              value={newStoreName}
              onChange={e => setNewStoreName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddStore() }}
              placeholder="Add a store…"
              style={{
                flex: 1, background: 'var(--dk3)', border: '0.5px solid var(--brh)',
                borderRadius: '8px', padding: '8px 10px',
                color: 'var(--tp)', fontSize: '15px',
                fontFamily: 'inherit', outline: 'none',
              }}
            />
            <button
              onClick={handleAddStore}
              disabled={!newStoreName.trim() || addStore.isPending}
              style={{
                padding: '8px 12px', flexShrink: 0,
                background: newStoreName.trim() ? 'var(--am)' : 'var(--dk3)',
                border: 'none', borderRadius: '8px',
                color: newStoreName.trim() ? '#141820' : 'var(--tm)',
                cursor: newStoreName.trim() ? 'pointer' : 'default',
                lineHeight: 0,
              }}
            >
              <Plus size={16} />
            </button>
          </div>
        </SettingsSection>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          style={{
            width: '100%', marginTop: '8px', marginBottom: '32px',
            padding: '13px',
            background: 'transparent', border: '0.5px solid var(--rd)',
            borderRadius: '12px', color: 'var(--rd)',
            fontSize: '16px', fontWeight: 500, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '8px', fontFamily: 'inherit',
          }}
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
      {showImport && <ImportSheet onClose={() => setShowImport(false)} />}
    </Screen>
  )
}
