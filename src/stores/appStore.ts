import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'

interface AppState {
  session: Session | null
  user: User | null
  familyId: string | null
  setSession: (session: Session | null) => void
  setFamilyId: (id: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  session: null,
  user: null,
  familyId: null,
  setSession: (session) => set({ session, user: session?.user ?? null }),
  setFamilyId: (familyId) => set({ familyId }),
}))
