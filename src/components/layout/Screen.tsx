import type { CSSProperties, ReactNode } from 'react'

interface ScreenProps {
  children:  ReactNode
  className?: string
  style?:     CSSProperties
  /** If true, add bottom padding to clear the fixed bottom nav */
  withNav?:   boolean
}

export function Screen({ children, className = '', style, withNav = true }: ScreenProps) {
  return (
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
  )
}
