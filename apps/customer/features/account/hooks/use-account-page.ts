'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import type { Address, OrderRow, Profile } from '@/features/account/types'
import { clearOnboardingResume } from '@/lib/onboarding-store'
import { getSupabaseBrowser } from '@/lib/supabase/client'

export function useAccountPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<Profile>({ name: '', email: '', phone: '' })
  const [addresses, setAddresses] = useState<Address[]>([])
  const [orders, setOrders] = useState<OrderRow[]>([])

  const loadData = useCallback(async () => {
    const supabase = getSupabaseBrowser()
    const [{ data: addrs }, { data: ords }] = await Promise.all([
      supabase
        .from('customer_addresses')
        .select('id,label,line,reference,is_default,coordinates_lat,coordinates_lng')
        .order('is_default', { ascending: false }),
      supabase
        .from('orders')
        .select('id,short_id,status,order_amount,created_at')
        .order('created_at', { ascending: false })
        .limit(20),
    ])
    setAddresses((addrs ?? []) as Address[])
    setOrders((ords ?? []) as OrderRow[])
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
    loadData,
    setDefault,
    remove,
    signOut,
  }
}
