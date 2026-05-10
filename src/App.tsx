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
import { MealPrepScreen } from './screens/MealPrepScreen'
import { SettingsScreen } from './screens/SettingsScreen'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 5, retry: 1 },
  },
})

function AuthListener() {
  const setSession = useAppStore(s => s.setSession)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [setSession])

  return null
}

// Bottom nav shows only on the 4 primary tab routes (not sub-routes like /recipes/new)
const NAV_ROOTS = ['/grocery', '/planner', '/prep']

function ProtectedLayout() {
  const session = useAppStore(s => s.session)
  const location = useLocation()

  // Bootstrap family after auth
  useEnsureFamilyId()

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Show nav on /grocery, /planner, /prep, and exactly /recipes (not sub-routes)
  const showNav =
    NAV_ROOTS.some(r => location.pathname.startsWith(r)) ||
    location.pathname === '/recipes'

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
        {/* Planner / Prep / Settings */}
        <Route path="/planner"           element={<PlannerScreen />} />
        <Route path="/prep"              element={<MealPrepScreen />} />
        <Route path="/settings"          element={<SettingsScreen />} />
        <Route path="*"                  element={<Navigate to="/grocery" replace />} />
      </Routes>
      {showNav && <BottomNav />}
    </div>
  )
}

function LoginGate() {
  const session = useAppStore(s => s.session)
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
