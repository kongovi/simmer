import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
import type { FamilyStore } from '../types'

export function useFamilyStores() {
  const familyId = useAppStore(s => s.familyId)

  return useQuery({
    queryKey: ['family-stores', familyId],
    enabled:  !!familyId,
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('family_stores')
        .select('*')
        .eq('family_id', familyId!)
        .order('sort_order', { ascending: true })
        .order('name',       { ascending: true })
      if (error) throw error
      return data as FamilyStore[]
    },
  })
}

export function useAddFamilyStore() {
  const queryClient = useQueryClient()
  const familyId    = useAppStore(s => s.familyId)

  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from('family_stores')
        .insert({ family_id: familyId!, name: name.trim() })
        .select()
        .single()
      if (error) throw error
      return data as FamilyStore
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-stores', familyId] })
    },
  })
}

export function useDeleteFamilyStore() {
  const queryClient = useQueryClient()
  const familyId    = useAppStore(s => s.familyId)

  return useMutation({
    mutationFn: async (storeId: string) => {
      const { error } = await supabase
        .from('family_stores')
        .delete()
        .eq('id', storeId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-stores', familyId] })
    },
  })
}

export function useSetDefaultStore() {
  const queryClient = useQueryClient()
  const familyId    = useAppStore(s => s.familyId)

  return useMutation({
    mutationFn: async (storeId: string) => {
      // Clear existing defaults then set new one
      await supabase
        .from('family_stores')
        .update({ is_default: false })
        .eq('family_id', familyId!)

      const { error } = await supabase
        .from('family_stores')
        .update({ is_default: true })
        .eq('id', storeId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-stores', familyId] })
    },
  })
}
