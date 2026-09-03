'use client'

import { AppealStatusSchema, RefundStatusSchema } from '@tindivo/contracts'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Address,
  AppealSummary,
  OrderRow,
  Profile,
  ProfileStep,
} from '@/features/account/types'
import { useActiveOrders } from '@/lib/active-orders'
import { heirAfterRemoving, pickDefaultAddress, SAVED_ADDRESS_COLUMNS } from '@/lib/address-record'
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

/** Lo que hace falta de la sesión, leído una vez por carga de la página. */
interface SessionInfo {
  userId: string
  email: string
  metaName: string
}

/** Fila de `reports` tal como la devuelve el select del resumen de apelaciones. */
interface AppealRow {
  appeal_status: string | null
  refund_status: string | null
  orders: { short_id: string } | { short_id: string }[] | null
}

function toAppealSummaries(rows: AppealRow[]): AppealSummary[] {
  const summaries: AppealSummary[] = []
  for (const row of rows) {
    const appealStatus = AppealStatusSchema.safeParse(row.appeal_status)
    // Un report sin `appeal_status` todavía no es una apelación: no entra en los
    // contadores. Se descarta en silencio en vez de lanzar, que es lo que hace
    // la API. Allí el DTO es el producto y una fila incompleta es un bug que hay
    // que ver; aquí es un número en un badge, y reventar por él dejaría toda la
    // pantalla de cuenta en blanco.
    if (!appealStatus.success) continue
    const refundStatus = RefundStatusSchema.safeParse(row.refund_status)
    const order = Array.isArray(row.orders) ? row.orders[0] : row.orders
    summaries.push({
      appealStatus: appealStatus.data,
      refundStatus: refundStatus.success ? refundStatus.data : null,
      orderShortId: order?.short_id ?? null,
    })
  }
  return summaries
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
  const [appeals, setAppeals] = useState<AppealSummary[]>([])

  /**
   * Los pedidos en curso salen del store compartido con la BottomNav, que ya
   * los pide para su badge. Antes esta pantalla lanzaba su PROPIA consulta a
   * `orders` con `{ count: 'exact', head: true }` y luego leía `data.length`
   * — que con `head: true` es siempre `null`, así que el contador marcaba 0
   * pasara lo que pasara, y la consulta se pagaba para nada.
   */
  const activeOrders = useActiveOrders()

  const sessionRef = useRef<SessionInfo | null>(null)

  /** La sesión, cacheada por carga: se pedía cuatro veces para leer lo mismo. */
  const readSession = useCallback(async (): Promise<SessionInfo | null> => {
    if (sessionRef.current) return sessionRef.current
    const { data } = await getSupabaseBrowser().auth.getSession()
    const session = data.session
    if (!session) return null
    const meta = session.user.user_metadata as { full_name?: string } | undefined
    sessionRef.current = {
      userId: session.user.id,
      email: session.user.email ?? '',
      metaName: meta?.full_name ?? '',
    }
    return sessionRef.current
  }, [])

  const reloadProfile = useCallback(async () => {
    const session = await readSession()
    if (!session) return
    const { data: prof } = await getSupabaseBrowser()
      .from('customer_profiles')
      .select('full_name,phone,phone_verified_at')
      .maybeSingle()

    setProfile({
      name: prof?.full_name ?? session.metaName,
      email: session.email,
      phone: prof?.phone ?? '',
      phone_verified_at: prof?.phone_verified_at ?? null,
    })
  }, [readSession])

  const loadData = useCallback(async () => {
    const session = await readSession()
    if (!session) return
    const supabase = getSupabaseBrowser()

    const [{ data: addrs }, { data: ords }, { data: reportRows }] = await Promise.all([
      supabase
        .from('customer_addresses')
        .select(SAVED_ADDRESS_COLUMNS)
        .order('is_default', { ascending: false }),
      supabase
        .from('orders')
        .select('id,short_id,status,order_amount,created_at')
        .eq('customer_user_id', session.userId)
        .order('created_at', { ascending: false })
        .limit(3),
      /**
       * El resumen de apelaciones, directo por PostgREST.
       *
       * Antes era `GET apiv2.tindivo.com/customer/appeals`: un salto
       * cross-origin (con su preflight) a una ruta que encadena `getUser` +
       * `user_roles` + `reports` + una URL firmada POR CADA apelación, todo en
       * serie y con `force-dynamic`. Medido contra producción: 470-750 ms solo
       * para la ruta 401, que ni toca la base; PostgREST responde en ~300 ms. Y
       * esa espera iba DENTRO del `Promise.all` que destapa la pantalla, así que
       * el esqueleto duraba lo que durase el enlace más lento — casi siempre
       * para acabar pintando «Sin reclamos».
       *
       * La policy `rep_participant_read` ya deja al cliente leer sus propios
       * reports, y aquí solo se necesitan los contadores y a qué pedido enlazar.
       * El comprobante de devolución (URL firmada, exige `service_role`) se ve
       * en el detalle del pedido y ese sigue pasando por la API.
       */
      supabase
        .from('reports')
        .select('appeal_status,refund_status,orders(short_id)')
        .eq('type', 'rejected_proof_disputed')
        .eq('customer_user_id', session.userId)
        .order('created_at', { ascending: false }),
    ])

    setAddresses((addrs ?? []) as Address[])
    setOrders((ords ?? []) as OrderRow[])
    setAppeals(toAppealSummaries((reportRows ?? []) as AppealRow[]))
  }, [readSession])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const session = await readSession()
      if (!session) {
        router.replace('/entrar?next=/cuenta')
        return
      }
      // Perfil y datos salen a la vez. Antes el perfil iba primero y `loadData`
      // no arrancaba hasta que volvía: un viaje de ida y vuelta entero de espera
      // antes de empezar siquiera a pedir lo demás.
      await Promise.all([reloadProfile(), loadData()])
      if (cancelled) return
      setReady(true)
    })()

    return () => {
      cancelled = true
    }
  }, [router, readSession, reloadProfile, loadData])

  const stats = useMemo<AccountStats>(() => {
    const pending = appeals.filter(
      (a) => a.appealStatus === 'pending' || a.appealStatus === 'in_review',
    ).length
    const completed = appeals.filter(
      (a) => a.appealStatus === 'approved' && a.refundStatus === 'completed',
    ).length
    return {
      activeOrdersCount: activeOrders.length,
      appealsCount: appeals.length,
      pendingAppealsCount: pending,
      completedAppealsCount: completed,
    }
  }, [activeOrders, appeals])

  const progress = useMemo<ProfileProgress>(() => {
    const hasName = Boolean(profile.name.trim())
    const isPhoneVerified = Boolean(profile.phone.trim() && profile.phone_verified_at)
    const defaultAddr = pickDefaultAddress(addresses)
    const hasAddress = defaultAddr != null

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
    const session = await readSession()
    if (!session) return

    setAddresses((prev) =>
      prev.map((a) => ({
        ...a,
        is_default: a.id === id,
      })),
    )

    const supabase = getSupabaseBrowser()
    await supabase
      .from('customer_addresses')
      .update({ is_default: false })
      .eq('user_id', session.userId)
    await supabase.from('customer_addresses').update({ is_default: true }).eq('id', id)
    await loadData()
  }

  /**
   * Borrar tiene que dejar la libreta con una predeterminada.
   *
   * Era un `delete` a secas, y el botón de borrar vive dentro de la hoja de
   * edición de CUALQUIER dirección, la predeterminada incluida. Quien tuviera
   * dos y borrase esa quedaba con direcciones y ninguna marcada: el mismo
   * estado que la 0203 acababa de reparar a mano para dos usuarios, y que deja
   * el mensaje de WhatsApp al negocio sin dirección.
   *
   * La promoción va DESPUÉS del borrado y solo si el borrado no dio error: el
   * índice único parcial no admite dos predeterminadas a la vez, así que entre
   * las dos escrituras el orden es el que hace que quepan.
   */
  async function remove(id: string) {
    const supabase = getSupabaseBrowser()
    const heredera = heirAfterRemoving(addresses, id)
    const { error } = await supabase.from('customer_addresses').delete().eq('id', id)
    if (!error && heredera) {
      await supabase.from('customer_addresses').update({ is_default: true }).eq('id', heredera.id)
    }
    await loadData()
  }

  async function updateName(name: string) {
    const session = await readSession()
    if (!session) return
    const supabase = getSupabaseBrowser()
    await supabase.from('customer_profiles').upsert({ user_id: session.userId, full_name: name })
    await supabase.auth.updateUser({ data: { full_name: name } })
    // El nombre también vive en `user_metadata`, que es de donde sale el
    // fallback mientras no haya fila de perfil: sin refrescar la copia cacheada,
    // un `reloadProfile()` posterior lo devolvería al valor viejo.
    sessionRef.current = { ...session, metaName: name }
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
