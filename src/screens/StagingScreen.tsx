import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ShoppingBasket } from 'lucide-react'

/**
 * Pantry Staging screen — placeholder for Session 6.
 * Full implementation: 3-zone staging (Buy / Check pantry / Staple prediction)
 * with Zone 4 collapsed, purchase history intelligence.
 */
export function StagingScreen() {
  const navigate = useNavigate()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: 'var(--dk)' }}>
      <div style={{ padding: '16px 16px 0' }}>
        <button
          onClick={() => navigate('/planner')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--ts)', display: 'flex', alignItems: 'center',
            gap: '4px', fontSize: '13px', padding: 0, marginBottom: '16px',
          }}
        >
          <ArrowLeft size={15} /> Planner
        </button>
      </div>

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}>
        <div style={{
          width: '56px', height: '56px', borderRadius: '16px',
          background: 'rgba(123,175,138,0.1)',
          border: '0.5px solid rgba(123,175,138,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '16px',
        }}>
          <ShoppingBasket size={24} color="var(--am)" />
        </div>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--tp)', margin: '0 0 6px' }}>
          Pantry Staging
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--ts)', margin: '0 0 4px', textAlign: 'center' }}>
          Coming in Session 6
        </p>
        <p style={{ fontSize: '11px', color: 'var(--tm)', margin: 0, textAlign: 'center', maxWidth: '240px' }}>
          Three-zone smart list: Buy now · Check pantry · Staple predictions
        </p>
      </div>
    </div>
  )
}
