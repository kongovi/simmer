import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
import type { UserSettings } from '../types'

export function useUserSettings() {
  const session = useAppStore(s => s.session)
  const userId  = session?.user?.id

  return useQuery({
    queryKey: ['user-settings', userId],
    enabled:  !!userId,
    staleTime: 1000 * 60 * 10,  // settings rarely change
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId!)
        .single()
      if (error) throw error
      return data as UserSettings
    },
  })
}

export function useUpdatePlanStartDow() {
  const queryClient = useQueryClient()
  const session     = useAppStore(s => s.session)
  const userId      = session?.user?.id

  return useMutation({
    mutationFn: async (dow: number) => {
      const { error } = await supabase
        .from('user_settings')
        .update({ plan_start_dow: dow, updated_at: new Date().toISOString() })
        .eq('user_id', userId!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-settings', userId] })
    },
  })
}
