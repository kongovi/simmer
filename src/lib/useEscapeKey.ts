import { useEffect, useCallback } from 'react'

/**
 * Calls `onEscape` whenever the user presses the Escape key.
 * Only active when `enabled` is true (default).
 * Handles stable callbacks — wrap the handler in useCallback if needed.
 */
export function useEscapeKey(onEscape: () => void, enabled = true) {
  const handler = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onEscape()
    }
  }, [onEscape])

  useEffect(() => {
    if (!enabled) return
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handler, enabled])
}
