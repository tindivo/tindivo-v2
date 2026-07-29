'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import type { CustomerAppealListResponse, OrderStatus } from '@tindivo/contracts'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Address, OrderRow, Profile } from '@/features/account/types'
import { api } from '@/lib/api'
import { clearOnboardingResume } from '@/lib/onboarding-store'
import { getSupabaseBrowser } from '@/lib/supabase/client'

const ACTIVE_STATUSES: OrderStatus[] = [
  'validando',
  'pending_acceptance',
  'confirmed',
  'preparing',
  'waiting_driver',
  'heading_to_restaurant',
  'waiting_at_restaurant',
  'picked_up',
]

export interface AccountStats {
  activeOrdersCount: number
  appealsCount: number
  pendingAppealsCount: number
  completedAppealsCount: number
}

export interface ProfileProgress {
  total: number
  completed: number
  missing: string[]
}

export function useAccountPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<Profile>({ name: '', email: '', phone: '' })
  const [addresses, setAddresses] = useState<Address[]>([])
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [activeOrdersCount, setActiveOrdersCount] = useState(0)
  const [appeals, setAppeals] = useState<CustomerAppealListResponse['items']>([])

  const loadData = useCallback(async () => {
    const supabase = getSupabaseBrowser()
    const { data: session } = await supabase.auth.getSession()
    if (!session.session) return
    const userId = session.session.user.id

    const [{ data: addrs }, { data: ords }, { data: activeRows }, appealsRes] = await Promise.all([
      supabase
        .from('customer_addresses')
        .select('id,label,line,reference,is_default,coordinates_lat,coordinates_lng')
        .order('is_default', { ascending: false }),
      supabase
        .from('orders')
        .select('id,short_id,status,order_amount,created_at')
        .eq('customer_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(3),
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('customer_user_id', userId)
        .in('status', ACTIVE_STATUSES),
      api.get<ApiEnvelope<CustomerAppealListResponse>>('/customer/appeals').catch(() => null),
    ])

    setAddresses((addrs ?? []) as Address[])
    setOrders((ords ?? []) as OrderRow[])
    setActiveOrdersCount(activeRows?.length ?? 0)
    setAppeals(appealsRes?.data.items ?? [])
  }, [])

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/entrar?next=/cuenta')
        return
      }
      const meta = data.session.user.user_metadata as { full_name?: string } | undefined
      const { data: prof } = await supabase
        .from('customer_profiles')
        .select('full_name,phone')
        .maybeSingle()
      setProfile({
        name: prof?.full_name ?? meta?.full_name ?? '',
        email: data.session.user.email ?? '',
        phone: prof?.phone ?? '',
      })
      await loadData()
      setReady(true)
    })
  }, [router, loadData])

  const stats = useMemo<AccountStats>(() => {
    const pending = appeals.filter(
      (a) => a.appealStatus === 'pending' || a.appealStatus === 'in_review',
    ).length
    const completed = appeals.filter(
      (a) => a.appealStatus === 'approved' && a.refundStatus === 'completed',
    ).length
    return {
      activeOrdersCount,
      appealsCount: appeals.length,
      pendingAppealsCount: pending,
      completedAppealsCount: completed,
    }
  }, [activeOrdersCount, appeals])

  const progress = useMemo<ProfileProgress>(() => {
    const missing: string[] = []
    if (!profile.name.trim()) missing.push('Añade tu nombre')
    if (!profile.phone.trim()) missing.push('Verifica tu celular')
    if (!addresses.some((a) => a.is_default)) missing.push('Elige una dirección por defecto')
    const total = 3
    return { total, completed: total - missing.length, missing }
  }, [profile, addresses])

  async function setDefault(id: string) {
    const supabase = getSupabaseBrowser()
    await supabase.from('customer_addresses').update({ is_default: false }).neq('id', id)
    await supabase.from('customer_addresses').update({ is_default: true }).eq('id', id)
    await loadData()
  }

  async function remove(id: string) {
    await getSupabaseBrowser().from('customer_addresses').delete().eq('id', id)
    await loadData()
  }

  async function updateName(name: string) {
    const supabase = getSupabaseBrowser()
    const { data: session } = await supabase.auth.getSession()
    const userId = session.session?.user.id
    if (!userId) return
    await supabase.from('customer_profiles').upsert({ user_id: userId, full_name: name })
    await supabase.auth.updateUser({ data: { full_name: name } })
    setProfile((p) => ({ ...p, name }))
  }

  async function signOut() {
    await getSupabaseBrowser().auth.signOut({ scope: 'local' })
    clearOnboardingResume()
    router.replace('/')
  }

  return {
    ready,
    profile,
    addresses,
    orders,
    appeals,
    stats,
    progress,
    loadData,
    setDefault,
    remove,
    updateName,
    signOut,
  }
}
