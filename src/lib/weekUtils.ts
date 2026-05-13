export const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const DOW_NAMES  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/**
 * Returns the most recent date (≤ today) whose day-of-week === startDow.
 * e.g. getWeekStart(5) when today is Mon May 12 → Fri May 9
 */
export function getWeekStart(startDow: number, reference?: Date): Date {
  const ref = reference ? new Date(reference) : new Date()
  ref.setHours(0, 0, 0, 0)
  const diff = (ref.getDay() - startDow + 7) % 7
  ref.setDate(ref.getDate() - diff)
  return ref
}

/** Shift a weekStart forward (+7) or backward (-7) by one week. */
export function shiftWeek(weekStart: Date, dir: 1 | -1): Date {
  const d = new Date(weekStart)
  d.setDate(d.getDate() + dir * 7)
  return d
}

/** Returns 7 consecutive Date objects starting from weekStart. */
export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })
}

/** "May 9 – 15, 2026" — smart cross-month handling. */
export function formatWeekRange(weekStart: Date): string {
  const end = new Date(weekStart)
  end.setDate(weekStart.getDate() + 6)
  const sm = weekStart.toLocaleString('default', { month: 'short' })
  const em = end.toLocaleString('default', { month: 'short' })
  const year = end.getFullYear()
  return sm === em
    ? `${sm} ${weekStart.getDate()} – ${end.getDate()}, ${year}`
    : `${sm} ${weekStart.getDate()} – ${em} ${end.getDate()}, ${year}`
}

/** Returns "2026-05-09" from a Date. */
export function toISODate(d: Date): string {
  const y  = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

/** True if d is today. */
export function isToday(d: Date): boolean {
  const t = new Date()
  return d.getFullYear() === t.getFullYear() &&
    d.getMonth()    === t.getMonth() &&
    d.getDate()     === t.getDate()
}

/**
 * Given a day name like "Friday" or "Fri" and a 7-day array,
 * returns the matching Date or null.
 */
export function dayNameToDate(name: string, weekDays: Date[]): Date | null {
  const lower = name.toLowerCase().trim()
  const idx = DOW_NAMES.findIndex(n => n.toLowerCase().startsWith(lower.slice(0, 3)))
  if (idx === -1) return null
  return weekDays.find(d => d.getDay() === idx) ?? null
}
