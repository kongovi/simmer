import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
import { setAISettingsCache } from '../lib/ai/settingsCache'
import type { UserSettings, AIModel, ImageModel } from '../types'

// ── Base query ────────────────────────────────────────────────────────────────

export function useUserSettings() {
  const session = useAppStore(s => s.session)
  const userId  = session?.user?.id

  const query = useQuery({
    queryKey:  ['user-settings', userId],
    enabled:   !!userId,
    staleTime: 1000 * 60 * 10,  // settings rarely change
    queryFn:   async () => {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId!)
        .single()
      if (error) throw error
      return data as UserSettings
    },
  })

  // Keep the AI settings cache in sync whenever settings are loaded/changed
  useEffect(() => {
    if (query.data) setAISettingsCache(query.data)
  }, [query.data])

  return query
}

// ── Mutations ─────────────────────────────────────────────────────────────────

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

export interface AISettingsUpdate {
  ai_structuring_model?:  AIModel
  ai_image_model?:        ImageModel
  task_model_overrides?:  Record<string, string>
  anthropic_api_key_enc?: string | null
  openai_api_key_enc?:    string | null
  google_api_key_enc?:    string | null
  replicate_api_key_enc?: string | null
  ollama_host?:           string | null
}

export function useUpdateAISettings() {
  const queryClient = useQueryClient()
  const session     = useAppStore(s => s.session)
  const userId      = session?.user?.id

  return useMutation({
    mutationFn: async (update: AISettingsUpdate) => {
      const { error } = await supabase
        .from('user_settings')
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq('user_id', userId!)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-settings', userId] })
    },
  })
}
