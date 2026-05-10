import type { ReactNode } from 'react'

interface ScreenProps {
  children: ReactNode
  className?: string
  /** If true, add bottom padding to clear the fixed bottom nav */
  withNav?: boolean
}

export function Screen({ children, className = '', withNav = true }: ScreenProps) {
  return (
    <div
      className={className}
      style={{
        flex: 1,
        overflowY: 'auto',
        backgroundColor: 'var(--dk)',
        paddingBottom: withNav ? '68px' : 0,
      }}
    >
      {children}
    </div>
  )
}
