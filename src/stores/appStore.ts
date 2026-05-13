import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'

interface AppState {
  session:        Session | null
  sessionLoading: boolean          // true until the first getSession() resolves
  user:           User | null
  familyId:       string | null
  setSession:        (session: Session | null) => void
  setSessionLoaded:  () => void
  setFamilyId:       (id: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  session:        null,
  sessionLoading: true,
  user:           null,
  familyId:       null,
  setSession:       (session) => set({ session, user: session?.user ?? null }),
  setSessionLoaded: ()        => set({ sessionLoading: false }),
  setFamilyId:      (familyId) => set({ familyId }),
}))
