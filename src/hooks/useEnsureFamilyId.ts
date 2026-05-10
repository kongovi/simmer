import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'

/**
 * Runs once after auth. If the user has no family_id yet, calls the
 * create_initial_family() DB function (security definer) to bootstrap one.
 * Stores the result in Zustand so the whole app can read it.
 */
export function useEnsureFamilyId() {
  const user     = useAppStore(s => s.user)
  const familyId = useAppStore(s => s.familyId)
  const setFamilyId = useAppStore(s => s.setFamilyId)

  useEffect(() => {
    if (!user || familyId) return

    async function bootstrap() {
      // 1. Check whether user_settings already has a family_id
      const { data: settings } = await supabase
        .from('user_settings')
        .select('family_id')
        .eq('user_id', user!.id)
        .single()

      if (settings?.family_id) {
        setFamilyId(settings.family_id as string)
        return
      }

      // 2. Create the initial family via security-definer function
      const { data: newId, error } = await supabase.rpc('create_initial_family')
      if (error) {
        console.error('Failed to bootstrap family:', error.message)
        return
      }
      setFamilyId(newId as string)
    }

    bootstrap()
  }, [user, familyId, setFamilyId])
}
