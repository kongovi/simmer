import { useNavigate } from 'react-router-dom'
import { LogOut, User, ChevronRight, Flame } from 'lucide-react'
import { Screen } from '../components/layout/Screen'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'

export function SettingsScreen() {
  const user = useAppStore((s) => s.user)
  const navigate = useNavigate()

  const displayName = user?.user_metadata?.full_name
    ?? user?.user_metadata?.name
    ?? user?.email?.split('@')[0]
    ?? 'You'

  const email = user?.email ?? ''
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <Screen>
      <div style={{ padding: '20px 16px', maxWidth: '480px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '28px' }}>
          <Flame size={20} color="var(--am)" strokeWidth={2} />
          <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--tp)' }}>Settings</span>
        </div>

        {/* Profile card */}
        <div
          style={{
            backgroundColor: 'var(--dkc)',
            border: '0.5px solid var(--br)',
            borderRadius: '14px',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            marginBottom: '24px',
          }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'var(--dk3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
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

        {/* Settings sections — stubs for future sessions */}
        <SettingsSection title="Meal Planning">
          <SettingsRow label="Week starts on" value="Friday" />
        </SettingsSection>

        <SettingsSection title="AI Models">
          <SettingsRow label="Text AI" value="Claude" />
          <SettingsRow label="Image AI" value="Nano Banana 2" />
        </SettingsSection>

        <SettingsSection title="Family">
          <SettingsRow label="Members" value="Coming in Session 8" />
        </SettingsSection>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          style={{
            width: '100%',
            marginTop: '32px',
            padding: '13px',
            backgroundColor: 'transparent',
            border: '0.5px solid var(--rd)',
            borderRadius: '12px',
            color: 'var(--rd)',
            fontSize: '14px',
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </Screen>
  )
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tm)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px', paddingLeft: '4px' }}>
        {title}
      </div>
      <div style={{ backgroundColor: 'var(--dkc)', border: '0.5px solid var(--br)', borderRadius: '12px', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

function SettingsRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '12px 14px',
        borderBottom: '0.5px solid var(--br)',
        gap: '8px',
      }}
    >
      <span style={{ flex: 1, fontSize: '13px', color: 'var(--tp)' }}>{label}</span>
      <span style={{ fontSize: '12px', color: 'var(--ts)' }}>{value}</span>
      <ChevronRight size={14} color="var(--tm)" />
    </div>
  )
}
