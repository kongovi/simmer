import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Flame } from 'lucide-react'
import { useAcceptInvite } from '../hooks/useFamilyMembers'

export function JoinScreen() {
  const navigate     = useNavigate()
  const [params]     = useSearchParams()
  const token        = params.get('token') ?? ''
  const acceptInvite = useAcceptInvite()
  const [status, setStatus] = useState<'accepting' | 'error' | 'done'>('accepting')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      setErrorMsg('No invite token found in URL.')
      return
    }

    acceptInvite.mutate(token, {
      onSuccess: () => {
        setStatus('done')
        setTimeout(() => navigate('/grocery', { replace: true }), 1500)
      },
      onError: (err) => {
        setStatus('error')
        setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.')
      },
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'var(--dk)', padding: '24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '32px' }}>
        <Flame size={28} color="var(--am)" strokeWidth={2} />
        <span style={{ fontSize: '22px', fontWeight: 700, color: 'var(--tp)' }}>Simmer</span>
      </div>

      {status === 'accepting' && (
        <>
          <div style={{
            width: '28px', height: '28px',
            border: '2.5px solid var(--br)', borderTopColor: 'var(--am)',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            marginBottom: '16px',
          }} />
          <p style={{ fontSize: '14px', color: 'var(--ts)', margin: 0 }}>
            Joining family…
          </p>
        </>
      )}

      {status === 'done' && (
        <>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
          <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--tp)', margin: '0 0 8px' }}>
            You're in!
          </p>
          <p style={{ fontSize: '13px', color: 'var(--ts)', margin: 0 }}>
            Taking you to your family's grocery list…
          </p>
        </>
      )}

      {status === 'error' && (
        <>
          <div style={{ fontSize: '36px', marginBottom: '16px' }}>😕</div>
          <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--tp)', margin: '0 0 8px', textAlign: 'center' }}>
            Couldn't join
          </p>
          <p style={{ fontSize: '13px', color: 'var(--ts)', margin: '0 0 24px', textAlign: 'center', lineHeight: 1.5 }}>
            {errorMsg}
          </p>
          <button
            onClick={() => navigate('/grocery', { replace: true })}
            style={{
              padding: '11px 24px',
              background: 'var(--am)', border: 'none',
              borderRadius: '10px', color: '#141820',
              fontSize: '13px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Go to Simmer
          </button>
        </>
      )}
    </div>
  )
}
