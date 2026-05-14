import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  LogOut, User, ChevronRight, Flame,
  Bot, BookOpen, Users, Store, Plus, Trash2, Copy, Check, X,
} from 'lucide-react'
import { Screen } from '../components/layout/Screen'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
import { useUserSettings, useUpdatePlanStartDow } from '../hooks/useUserSettings'
import { useFamilyMembers, useFamilyInvites, useCreateInvite, useDeleteInvite, buildInviteUrl } from '../hooks/useFamilyMembers'
import { useFamilyStores, useAddFamilyStore, useDeleteFamilyStore } from '../hooks/useFamilyStores'

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
        fontSize: '11px', fontWeight: 600, color: 'var(--tm)',
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
      <span style={{ flex: 1, fontSize: '13px', color: 'var(--tp)' }}>{label}</span>
      {value && <span style={{ fontSize: '12px', color: 'var(--ts)' }}>{value}</span>}
      {onClick && <ChevronRight size={14} color="var(--tm)" />}
    </div>
  )
}

// ── Member avatar ─────────────────────────────────────────────────────────────

function MemberAvatar({ name, role }: { name: string | null; role: string }) {
  const initials = (name ?? '?').slice(0, 2).toUpperCase()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: '0.5px solid var(--br)' }}>
      <div style={{
        width: '32px', height: '32px', borderRadius: '50%',
        background: role === 'planner' ? 'rgba(123,175,138,0.25)' : 'rgba(255,255,255,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '12px', fontWeight: 600, color: role === 'planner' ? 'var(--am)' : 'var(--tp)',
        flexShrink: 0,
      }}>
        {initials}
      </div>
      <span style={{ flex: 1, fontSize: '13px', color: 'var(--tp)' }}>{name ?? 'Unknown'}</span>
      <span style={{
        fontSize: '10px', fontWeight: 500, letterSpacing: '0.3px',
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
        flex: 1, fontSize: '11px', color: 'var(--ts)',
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
          fontSize: '11px', fontWeight: 500, fontFamily: 'inherit',
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

  const [newStoreName, setNewStoreName] = useState('')

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
          <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--tp)' }}>Settings</span>
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
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--tp)', marginBottom: '2px' }}>
              {displayName}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ts)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
            <span style={{ flex: 1, fontSize: '13px', color: 'var(--tp)' }}>Week starts on</span>
            <select
              value={settings?.plan_start_dow ?? 5}
              onChange={e => updateDow.mutate(Number(e.target.value))}
              style={{
                background: 'var(--dk3)', border: '0.5px solid var(--brh)',
                borderRadius: '7px', padding: '5px 8px',
                color: 'var(--tp)', fontSize: '12px',
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
        </SettingsSection>

        {/* Family */}
        <SettingsSection title="Family">
          {/* Members */}
          {members.map(m => (
            <MemberAvatar key={m.id} name={m.display_name} role={m.role} />
          ))}
          {members.length === 0 && (
            <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--ts)', borderBottom: '0.5px solid var(--br)' }}>
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
            <span style={{ fontSize: '13px', fontWeight: 500 }}>
              {createInvite.isPending ? 'Creating invite…' : 'Invite someone'}
            </span>
          </div>
        </SettingsSection>

        {/* Stores */}
        <SettingsSection title="Stores">
          {stores.length === 0 && (
            <div style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--ts)', borderBottom: '0.5px solid var(--br)' }}>
              No stores added yet.
            </div>
          )}
          {stores.map((s, idx) => (
            <div
              key={s.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '11px 14px',
                borderBottom: idx < stores.length - 1 || true ? '0.5px solid var(--br)' : 'none',
              }}
            >
              <Store size={14} color="var(--tm)" style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: '13px', color: 'var(--tp)' }}>{s.name}</span>
              {s.is_default && (
                <span style={{
                  fontSize: '10px', color: 'var(--am)',
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
                color: 'var(--tp)', fontSize: '13px',
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
            fontSize: '14px', fontWeight: 500, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '8px', fontFamily: 'inherit',
          }}
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </Screen>
  )
}
