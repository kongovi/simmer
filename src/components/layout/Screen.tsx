import type { CSSProperties, ReactNode } from 'react'

const TOP_BAR_H = 44

interface ScreenProps {
  children:  ReactNode
  className?: string
  style?:     CSSProperties
  /** If true, add bottom padding to clear the fixed bottom nav */
  withNav?:   boolean
}

export function Screen({ children, className = '', style, withNav = true }: ScreenProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--dk)' }}>
      {/* ── Top bar ── */}
      <div style={{
        flexShrink: 0,
        height: `calc(${TOP_BAR_H}px + env(safe-area-inset-top))`,
        paddingTop: 'env(safe-area-inset-top)',
        backgroundColor: 'var(--dk2)',
        borderBottom: '0.5px solid var(--br)',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: '14px',
      }}>
        <img
          src="/logo.png"
          alt="Simmer"
          style={{ height: '28px', width: '28px', objectFit: 'contain' }}
        />
      </div>

      {/* ── Scrollable content ── */}
      <div
        className={className}
        style={{
          flex: 1,
          overflowY: 'auto',
          backgroundColor: 'var(--dk)',
          paddingBottom: withNav ? 'calc(68px + env(safe-area-inset-bottom))' : 0,
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  )
}
