import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from './lib/supabase'
import { useAppStore } from './stores/appStore'
import { BottomNav } from './components/layout/BottomNav'
import { LoginScreen } from './screens/LoginScreen'
import { GroceryScreen } from './screens/GroceryScreen'
import { RecipesScreen } from './screens/RecipesScreen'
import { PlannerScreen } from './screens/PlannerScreen'
import { MealPrepScreen } from './screens/MealPrepScreen'
import { SettingsScreen } from './screens/SettingsScreen'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
})

function AuthListener() {
  const setSession = useAppStore((s) => s.setSession)

  useEffect(() => {
    // Hydrate session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    // Keep in sync with auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [setSession])

  return null
}

const NAV_ROUTES = ['/grocery', '/recipes', '/planner', '/prep']

function ProtectedLayout() {
  const session = useAppStore((s) => s.session)
  const location = useLocation()

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  const showNav = NAV_ROUTES.some(r => location.pathname.startsWith(r))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Routes>
        <Route path="/grocery"  element={<GroceryScreen />} />
        <Route path="/recipes"  element={<RecipesScreen />} />
        <Route path="/planner"  element={<PlannerScreen />} />
        <Route path="/prep"     element={<MealPrepScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        <Route path="*"         element={<Navigate to="/grocery" replace />} />
      </Routes>
      {showNav && <BottomNav />}
    </div>
  )
}

/** Redirect already-logged-in users away from /login */
function LoginGate() {
  const session = useAppStore((s) => s.session)
  if (session) return <Navigate to="/grocery" replace />
  return <LoginScreen />
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthListener />
        <Routes>
          <Route path="/login" element={<LoginGate />} />
          <Route path="/*"     element={<ProtectedLayout />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
