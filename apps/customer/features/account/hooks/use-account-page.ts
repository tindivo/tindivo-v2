'use client'

import type { ApiEnvelope } from '@tindivo/api-client'
import { ACTIVE_ORDER_STATUSES, type CustomerAppealListResponse } from '@tindivo/contracts'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Address, OrderRow, Profile, ProfileStep } from '@/features/account/types'
import { api } from '@/lib/api'
import { clearOnboardingResume } from '@/lib/onboarding-store'
import { signOutDevice, signOutEverywhereDevice } from '@/lib/sign-out'
import { getSupabaseBrowser } from '@/lib/supabase/client'

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
  steps: ProfileStep[]
}

export function useAccountPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [profile, setProfile] = useState<Profile>({
    name: '',
    email: '',
    phone: '',
    phone_verified_at: null,
  })
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
        .in('status', [...ACTIVE_ORDER_STATUSES]),
      api.get<ApiEnvelope<CustomerAppealListResponse>>('/customer/appeals').catch(() => null),
    ])

    setAddresses((addrs ?? []) as Address[])
    setOrders((ords ?? []) as OrderRow[])
    setActiveOrdersCount(activeRows?.length ?? 0)
    setAppeals(appealsRes?.data.items ?? [])
  }, [])

  const reloadProfile = useCallback(async () => {
    const supabase = getSupabaseBrowser()
    const { data: session } = await supabase.auth.getSession()
    if (!session.session) return
    const meta = session.session.user.user_metadata as { full_name?: string } | undefined
    const { data: prof } = await supabase
      .from('customer_profiles')
      .select('full_name,phone,phone_verified_at')
      .maybeSingle()

    setProfile({
      name: prof?.full_name ?? meta?.full_name ?? '',
      email: session.session.user.email ?? '',
      phone: prof?.phone ?? '',
      phone_verified_at: prof?.phone_verified_at ?? null,
    })
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
        .select('full_name,phone,phone_verified_at')
        .maybeSingle()
      setProfile({
        name: prof?.full_name ?? meta?.full_name ?? '',
        email: data.session.user.email ?? '',
        phone: prof?.phone ?? '',
        phone_verified_at: prof?.phone_verified_at ?? null,
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
    const hasName = Boolean(profile.name.trim())
    const isPhoneVerified = Boolean(profile.phone.trim() && profile.phone_verified_at)
    const defaultAddr =
      addresses.find((a) => a.is_default) ?? (addresses.length > 0 ? addresses[0] : null)
    const hasAddress = addresses.length > 0 && Boolean(defaultAddr)

    const steps: ProfileStep[] = [
      {
        id: 'name',
        title: 'Nombre completo',
        description: hasName ? profile.name : 'Indícanos cómo llamarte',
        isCompleted: hasName,
        actionLabel: hasName ? 'Editar' : 'Completar',
      },
      {
        id: 'phone',
        title: 'Celular verificado',
        description: isPhoneVerified
          ? `+51 ${profile.phone}`
          : profile.phone.trim()
            ? `+51 ${profile.phone} (sin verificar)`
            : 'Para coordinar la entrega de tus pedidos',
        isCompleted: isPhoneVerified,
        actionLabel: isPhoneVerified ? 'Verificado' : 'Verificar',
      },
      {
        id: 'address',
        title: 'Dirección de entrega',
        description: hasAddress
          ? `${defaultAddr?.label ? `${defaultAddr.label} · ` : ''}${defaultAddr?.line || defaultAddr?.reference || 'Dirección guardada'}`
          : 'Guarda tu casa o trabajo para recibir pedidos',
        isCompleted: hasAddress,
        actionLabel: hasAddress ? 'Gestionar' : 'Agregar',
      },
    ]

    const missing: string[] = []
    if (!hasName) missing.push('Añade tu nombre')
    if (!isPhoneVerified) missing.push('Verifica tu celular')
    if (!hasAddress) missing.push('Añade una dirección de entrega')

    const total = steps.length
    const completed = steps.filter((s) => s.isCompleted).length

    return { total, completed, missing, steps }
  }, [profile, addresses])

  async function setDefault(id: string) {
    const supabase = getSupabaseBrowser()
    const { data: session } = await supabase.auth.getSession()
    const userId = session.session?.user.id
    if (!userId) return

    setAddresses((prev) =>
      prev.map((a) => ({
        ...a,
        is_default: a.id === id,
      })),
    )

    await supabase.from('customer_addresses').update({ is_default: false }).eq('user_id', userId)
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
    await signOutDevice()
    clearOnboardingResume()
    router.replace('/')
  }

  /**
   * Salida de emergencia (teléfono perdido). Confirma antes porque echa a la
   * persona de equipos que no tiene delante, incluido el que está usando.
   */
  async function signOutEverywhere() {
    const ok = confirm(
      '¿Cerrar sesión en TODOS los dispositivos?\n\n' +
        'Saldrás también de cualquier otro teléfono o navegador donde tengas la cuenta abierta, ' +
        'y esos equipos dejarán de recibir avisos de tus pedidos.',
    )
    if (!ok) return
    await signOutEverywhereDevice()
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
    reloadProfile,
    setDefault,
    remove,
    updateName,
    signOut,
    signOutEverywhere,
  }
}
