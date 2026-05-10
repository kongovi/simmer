import { useState } from 'react'
import { Flame } from 'lucide-react'
import { supabase } from '../lib/supabase'

export function LoginScreen() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleGoogleLogin() {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
    // On success, browser redirects — no need to setLoading(false)
  }

  return (
    <div
      style={{
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        backgroundColor: 'var(--dk)',
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', marginBottom: '48px' }}>
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '20px',
            backgroundColor: 'var(--dkc)',
            border: '0.5px solid var(--br)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Flame size={36} color="var(--am)" strokeWidth={1.8} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--tp)', letterSpacing: '-0.5px' }}>Simmer</div>
          <div style={{ fontSize: '14px', color: 'var(--ts)', marginTop: '4px' }}>
            Family meal planning, made simple
          </div>
        </div>
      </div>

      {/* Sign-in card */}
      <div
        style={{
          width: '100%',
          maxWidth: '340px',
          backgroundColor: 'var(--dkc)',
          border: '0.5px solid var(--br)',
          borderRadius: '16px',
          padding: '24px',
        }}
      >
        <p style={{ fontSize: '13px', color: 'var(--ts)', textAlign: 'center', margin: '0 0 20px' }}>
          Sign in to manage your family's meals
        </p>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            width: '100%',
            padding: '13px',
            backgroundColor: loading ? 'var(--dk3)' : 'var(--am)',
            color: '#1a1612',
            border: 'none',
            borderRadius: '12px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            transition: 'background-color 0.15s',
          }}
        >
          {loading ? (
            <span>Redirecting…</span>
          ) : (
            <>
              <GoogleIcon />
              Continue with Google
            </>
          )}
        </button>

        {error && (
          <p style={{ fontSize: '12px', color: 'var(--rd)', textAlign: 'center', margin: '12px 0 0' }}>
            {error}
          </p>
        )}
      </div>

      <p style={{ fontSize: '11px', color: 'var(--tm)', textAlign: 'center', maxWidth: '260px', marginTop: '24px' }}>
        By continuing, you agree to share your name and email with Simmer.
      </p>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  )
}
