import { NavLink } from 'react-router-dom'
import { ShoppingCart, BookOpen, CalendarDays, ChefHat, Settings } from 'lucide-react'

const tabs = [
  { to: '/grocery',  label: 'Grocery',  Icon: ShoppingCart },
  { to: '/recipes',  label: 'Recipes',   Icon: BookOpen },
  { to: '/planner',  label: 'Planner',   Icon: CalendarDays },
  { to: '/prep',     label: 'Prep',      Icon: ChefHat },
  { to: '/settings', label: 'Settings',  Icon: Settings },
]

export function BottomNav() {
  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '68px',
        backgroundColor: 'var(--dk2)',
        borderTop: '0.5px solid var(--br)',
        display: 'flex',
        alignItems: 'stretch',
        zIndex: 10,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {tabs.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          style={({ isActive }) => ({
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            textDecoration: 'none',
            color: isActive ? 'var(--am)' : 'var(--tm)',
            transition: 'color 0.15s',
          })}
        >
          {({ isActive }) => (
            <>
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
              <span style={{ fontSize: '11px', fontWeight: isActive ? 600 : 400, letterSpacing: '0.2px' }}>
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
