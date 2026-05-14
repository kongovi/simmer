import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../stores/appStore'
import type { FamilyInvite, FamilyMember } from '../types'

// ── Members ───────────────────────────────────────────────────────────────────

export function useFamilyMembers() {
  const familyId = useAppStore(s => s.familyId)

  return useQuery({
    queryKey: ['family-members', familyId],
    enabled:  !!familyId,
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('family_members')
        .select('*')
        .eq('family_id', familyId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as FamilyMember[]
    },
  })
}

// ── Invites ───────────────────────────────────────────────────────────────────

export function useFamilyInvites() {
  const familyId = useAppStore(s => s.familyId)

  return useQuery({
    queryKey: ['family-invites', familyId],
    enabled:  !!familyId,
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('family_invites')
        .select('*')
        .eq('family_id', familyId!)
        .is('accepted_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as FamilyInvite[]
    },
  })
}

export function useCreateInvite() {
  const queryClient = useQueryClient()
  const session     = useAppStore(s => s.session)
  const familyId    = useAppStore(s => s.familyId)
  const userId      = session?.user?.id

  return useMutation({
    mutationFn: async (role: 'planner' | 'member' = 'member') => {
      const { data, error } = await supabase
        .from('family_invites')
        .insert({ family_id: familyId!, invited_by: userId!, role })
        .select()
        .single()
      if (error) throw error
      return data as FamilyInvite
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-invites', familyId] })
    },
  })
}

export function useDeleteInvite() {
  const queryClient = useQueryClient()
  const familyId    = useAppStore(s => s.familyId)

  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase
        .from('family_invites')
        .delete()
        .eq('id', inviteId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-invites', familyId] })
    },
  })
}

// ── Accept invite (via SECURITY DEFINER RPC) ──────────────────────────────────

export function useAcceptInvite() {
  const queryClient = useQueryClient()
  const setFamilyId = useAppStore(s => s.setFamilyId)

  return useMutation({
    mutationFn: async (token: string) => {
      const { data, error } = await supabase.rpc('accept_family_invite', { p_token: token })
      if (error) throw error
      const result = data as { success?: boolean; family_id?: string; error?: string; already_member?: boolean }
      if (result.error) throw new Error(result.error)
      return result
    },
    onSuccess: (result) => {
      if (result.family_id) {
        setFamilyId(result.family_id)
      }
      queryClient.invalidateQueries({ queryKey: ['family-members'] })
      queryClient.invalidateQueries({ queryKey: ['user-settings'] })
    },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const APP_URL = import.meta.env.VITE_APP_URL as string | undefined ?? 'https://simmer-rho-eight.vercel.app'

export function buildInviteUrl(token: string): string {
  return `${APP_URL}/join?token=${token}`
}
