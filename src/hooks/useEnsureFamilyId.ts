import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'

/**
 * Runs once after auth. If the user has no family_id yet, calls the
 * create_initial_family() DB function (security definer) to bootstrap one.
 * Stores the result in Zustand so the whole app can read it.
 * Also syncs the user's Google display_name and avatar_url into family_members.
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

      let resolvedFamilyId: string | null = settings?.family_id ?? null

      if (!resolvedFamilyId) {
        // 2. Create the initial family via security-definer function
        const { data: newId, error } = await supabase.rpc('create_initial_family')
        if (error) {
          console.error('Failed to bootstrap family:', error.message)
          return
        }
        resolvedFamilyId = newId as string
      }

      setFamilyId(resolvedFamilyId)

      // 3. Sync Google profile (name + avatar) into family_members on every sign-in
      // user_metadata from Google OAuth contains full_name and avatar_url
      const meta        = user!.user_metadata ?? {}
      const displayName = (meta.full_name ?? meta.name ?? '') as string
      const avatarUrl   = (meta.avatar_url ?? meta.picture ?? '') as string

      if (displayName || avatarUrl) {
        const profileUpdate: Record<string, string> = {}
        if (displayName) profileUpdate.display_name = displayName
        if (avatarUrl)   profileUpdate.avatar_url   = avatarUrl

        await supabase
          .from('family_members')
          .update(profileUpdate)
          .eq('user_id', user!.id)
          .eq('family_id', resolvedFamilyId)
      }
    }

    bootstrap()
  }, [user, familyId, setFamilyId])
}
