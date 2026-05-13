import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from './lib/supabase'
import { useAppStore } from './stores/appStore'
import { useEnsureFamilyId } from './hooks/useEnsureFamilyId'
import { BottomNav } from './components/layout/BottomNav'
import { LoginScreen } from './screens/LoginScreen'
import { GroceryScreen } from './screens/GroceryScreen'
import { RecipesScreen } from './screens/RecipesScreen'
import { RecipeDetailScreen } from './screens/RecipeDetailScreen'
import { RecipeEntryScreen } from './screens/RecipeEntryScreen'
import { RecipeImportScreen } from './screens/RecipeImportScreen'
import { RecipeLoadingScreen } from './screens/RecipeLoadingScreen'
import { RecipeReviewScreen } from './screens/RecipeReviewScreen'
import { PlannerScreen } from './screens/PlannerScreen'
import { PlanWithClaudeScreen } from './screens/PlanWithClaudeScreen'
import { AddToPlanScreen } from './screens/AddToPlanScreen'
import { StagingScreen } from './screens/StagingScreen'
import { MealPrepScreen } from './screens/MealPrepScreen'
import { SettingsScreen } from './screens/SettingsScreen'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
})

// Resolves the initial session (and any pending OAuth code exchange) before
// the rest of the app renders routing guards.
function AuthListener() {
  const setSession       = useAppStore(s => s.setSession)
  const setSessionLoaded = useAppStore(s => s.setSessionLoaded)

  useEffect(() => {
    // getSession() automatically exchanges a PKCE ?code= in the URL if present.
    // We must NOT navigate away until this resolves — that's why sessionLoading
    // blocks all routing guards below.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setSessionLoaded()
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [setSession, setSessionLoaded])

  return null
}

// Full-screen spinner shown while the initial session check is in flight.
function SplashScreen() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100%', backgroundColor: 'var(--dk)',
    }}>
      <div style={{
        width: '28px', height: '28px',
        border: '2.5px solid var(--br)',
        borderTopColor: 'var(--am)',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  )
}

function ProtectedLayout() {
  const session        = useAppStore(s => s.session)
  const sessionLoading = useAppStore(s => s.sessionLoading)
  const location       = useLocation()

  // Bootstrap family after auth
  useEnsureFamilyId()

  // Wait for the initial getSession() before making any routing decision.
  // This prevents stripping the ?code= from the URL before Supabase can
  // exchange it for a session.
  if (sessionLoading) return <SplashScreen />

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Show nav on primary tabs only — not on sub-screens like /planner/claude
  const showNav =
    location.pathname === '/grocery' ||
    location.pathname === '/recipes' ||
    location.pathname === '/planner' ||
    location.pathname === '/prep'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Routes>
        {/* Grocery */}
        <Route path="/grocery"           element={<GroceryScreen />} />
        {/* Recipes — ordered most-specific first */}
        <Route path="/recipes/new"       element={<RecipeEntryScreen />} />
        <Route path="/recipes/import"    element={<RecipeImportScreen />} />
        <Route path="/recipes/loading"   element={<RecipeLoadingScreen />} />
        <Route path="/recipes/review"    element={<RecipeReviewScreen />} />
        <Route path="/recipes/:id"       element={<RecipeDetailScreen />} />
        <Route path="/recipes"           element={<RecipesScreen />} />
        {/* Planner */}
        <Route path="/planner/claude"    element={<PlanWithClaudeScreen />} />
        <Route path="/planner/add"       element={<AddToPlanScreen />} />
        <Route path="/planner"           element={<PlannerScreen />} />
        {/* Staging / Prep / Settings */}
        <Route path="/staging"           element={<StagingScreen />} />
        <Route path="/prep"              element={<MealPrepScreen />} />
        <Route path="/settings"          element={<SettingsScreen />} />
        <Route path="*"                  element={<Navigate to="/grocery" replace />} />
      </Routes>
      {showNav && <BottomNav />}
    </div>
  )
}

function LoginGate() {
  const session        = useAppStore(s => s.session)
  const sessionLoading = useAppStore(s => s.sessionLoading)

  if (sessionLoading) return <SplashScreen />
  if (session)        return <Navigate to="/grocery" replace />
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
