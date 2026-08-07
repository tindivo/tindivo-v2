'use client'

import type { BusinessPrimaryCapability } from '@tindivo/contracts'
import { Button, Card, CardBody, Icon } from '@tindivo/ui'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { getBackoffDelayMs, useChannelHealth } from '@/hooks/use-channel-health'
import { useIconFontReady } from '@/hooks/use-icon-font-ready'
import { usePolledQuery } from '@/hooks/use-polled-query'
import {
  getColumn,
  isBusinessPaused,
  ORDER_SELECT,
  type OrderRow,
  type OrderVM,
  pauseMinutesLeft,
  toOrderVM,
} from '@/lib/orders/view-model'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { speak, unlockAudio, useDashboardSounds } from '@/lib/use-audio-alert'
import { DashboardSkeleton } from './dashboard-skeleton'
import { SuccessToastHost } from './toast'

// ── Debounce hook ─────────────────────────────────────────────────────────────
function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, delay: number): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn

  return useCallback(
    ((...args: any[]) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => fnRef.current(...args), delay)
    }) as any as T,
    [delay],
  )
}

// ── Navegación (fuente única; el activo se deriva de la ruta) ─────────────────
export type NavId = 'pedidos' | 'menu' | 'add' | 'efectivo' | 'historial' | 'deuda' | 'config'

const NAV_ITEMS: { id: NavId; label: string; icon: string; href: string }[] = [
  { id: 'pedidos', label: 'Pedidos', icon: 'receipt_long', href: '/' },
  { id: 'menu', label: 'Menú', icon: 'restaurant_menu', href: '/menu' },
  { id: 'add', label: 'Pedir moto', icon: 'two_wheeler', href: '/nuevo' },
  { id: 'efectivo', label: 'Liquidaciones', icon: 'payments', href: '/efectivo' },
  { id: 'historial', label: 'Historial', icon: 'history', href: '/historial' },
  { id: 'deuda', label: 'Mi cuenta', icon: 'account_balance_wallet', href: '/deuda' },
  { id: 'config', label: 'Config', icon: 'settings', href: '/configuracion' },
]

// Modo solo-catálogo (WhatsApp): el negocio no opera delivery en la plataforma,
// así que su panel se reduce a gestionar el menú y la configuración.
const CATALOG_ONLY_NAV: NavId[] = ['menu', 'config']

const ACCENT_DEFAULT = 'var(--color-brand)'

function activeIdFor(pathname: string): NavId {
  if (pathname === '/') return 'pedidos'
  if (pathname.startsWith('/menu')) return 'menu'
  if (pathname.startsWith('/nuevo')) return 'add'
  if (pathname.startsWith('/efectivo')) return 'efectivo'
  if (pathname.startsWith('/historial')) return 'historial'
  if (pathname.startsWith('/deuda')) return 'deuda'
  if (pathname.startsWith('/configuracion')) return 'config'
  return 'pedidos'
}

// ── Contexto del dashboard (negocio + pedidos + sonido, compartido por TODA sección) ──
export interface DashboardCtx {
  bizId: string
  bizName: string
  accent: string
  qrUrl: string | null
  capability: BusinessPrimaryCapability | null
  paused: boolean
  pauseMinLeft: number | null
  blocked: boolean
  blockReason: string | null
  rows: OrderRow[]
  vms: OrderVM[]
  counts: { new: number; cooking: number; route: number; today: number }
  now: number
  soundOn: boolean
  toggleSound: () => void
  refetchOrders: () => Promise<void>
  refetchBiz: () => Promise<void>
}

const Ctx = createContext<DashboardCtx | null>(null)

export function useDashboard(): DashboardCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useDashboard fuera de DashboardChrome')
  return v
}

interface BizState {
  name: string
  accent: string
  qrUrl: string | null
  capability: BusinessPrimaryCapability | null
  until: string | null
  blocked: boolean
  reason: string | null
}

// ── Login (sin sesión: pantalla completa, sin chrome) ─────────────────────────
const inputCls =
  'mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-[15px] outline-none focus:border-brand'
const labelCls = 'font-mono text-[11px] text-ink-subtle uppercase tracking-wide'

function Login({ onAuthed }: { onAuthed: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error: err } = await getSupabaseBrowser().auth.signInWithPassword({ email, password })
    if (err) {
      setError(err.message)
      setLoading(false)
    } else onAuthed()
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center px-4">
      <h1 className="mb-1 font-display font-semibold text-[26px] text-ink">Panel del negocio</h1>
      <p className="mb-6 text-[15px] text-ink-muted">Ingresa con la cuenta que te dio Tindivo.</p>
      <Card>
        <CardBody>
          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className={labelCls}>Correo</span>
              <input
                type="email"
                className={inputCls}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
            <label className="block">
              <span className={labelCls}>Contraseña</span>
              <input
                type="password"
                className={inputCls}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            {error && <p className="text-danger text-sm">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Entrando…' : 'Entrar'}
            </Button>
          </form>
        </CardBody>
      </Card>
    </main>
  )
}

// ── Sidebar (desktop, persistente) ────────────────────────────────────────────
function Sidebar({ active, onSignOut }: { active: NavId; onSignOut: () => void }) {
  const { bizName, accent, capability, paused, counts, soundOn, toggleSound } = useDashboard()
  const catalogOnly = capability === 'catalog_only'
  // Excepción (DECISIONS §18): con pedidos delivery en vuelo (de antes del
  // cambio de modo), Pedidos sigue accesible desde la nav para no perderlos.
  const hasActiveOrders = counts.new + counts.cooking + counts.route > 0
  const catalogNav: NavId[] = hasActiveOrders ? ['pedidos', ...CATALOG_ONLY_NAV] : CATALOG_ONLY_NAV
  const navItems = catalogOnly ? NAV_ITEMS.filter((it) => catalogNav.includes(it.id)) : NAV_ITEMS
  return (
    <aside className="flex h-dvh w-[240px] shrink-0 flex-col border-r border-border bg-white px-3.5 py-5 pb-4">
      <div className="flex items-center gap-2.5 px-1.5 pb-[18px]">
        <div
          className="flex h-[38px] w-[38px] items-center justify-center rounded-xl text-[17px] font-bold text-white"
          style={{ background: accent || ACCENT_DEFAULT }}
        >
          {bizName[0] ?? 'T'}
        </div>
        <div className="min-w-0">
          <div className="font-display text-base font-bold leading-[1.1] tracking-tight">
            {bizName}
          </div>
          <div className="mt-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-ink-muted">
            SAN JACINTO · ÁNCASH
          </div>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5">
        {navItems.map((it) => {
          const on = it.id === active
          const badge = it.id === 'pedidos' ? counts.new : undefined
          return (
            <Link
              key={it.id}
              href={it.href}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[14px] font-medium no-underline ${
                on ? 'bg-ink text-white' : 'bg-transparent text-ink'
              }`}
            >
              <Icon name={it.icon} size={20} filled={on} />
              <span className="flex-1">{it.label}</span>
              {badge != null && badge > 0 && (
                <span
                  className={`inline-flex min-h-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white ${
                    on ? 'bg-brand' : 'bg-danger'
                  }`}
                >
                  {badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
      <div className="flex-1" />
      {/* Toggle de alertas (sonido) — accesible desde cualquier sección */}
      <button
        type="button"
        onClick={toggleSound}
        className={`mb-2.5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold transition-transform active:scale-[0.98] ${
          soundOn ? 'bg-brand text-white' : 'bg-ink/[0.06] text-ink'
        } ${counts.new > 0 && soundOn ? 'animate-pulse' : ''}`}
      >
        <Icon
          name={soundOn ? 'notifications_active' : 'notifications_off'}
          size={16}
          filled={soundOn}
        />
        Alertas {soundOn ? 'ON' : 'OFF'}
      </button>
      <div className="mb-2.5 rounded-2xl bg-brand-soft p-3">
        <div className="flex items-center gap-2">
          <Icon
            name="circle"
            size={10}
            filled
            className={catalogOnly ? 'text-success' : paused ? 'text-amber-700' : 'text-success'}
          />
          <div className="text-[13px] font-semibold">
            {catalogOnly ? 'Pedidos por WhatsApp' : paused ? 'Pausado' : 'Plataforma abierta'}
          </div>
        </div>
        <div className="mt-1 font-mono text-[9px] font-semibold uppercase tracking-wide text-ink-muted">
          {catalogOnly
            ? 'MODO CATÁLOGO ACTIVO'
            : paused
              ? 'NO RECIBE PEDIDOS WEB'
              : 'RECIBIENDO PEDIDOS'}
        </div>
      </div>
      <div className="flex items-center gap-2.5 border-t border-border px-1.5 py-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-[13px] font-bold text-brand-dark">
          {bizName[0] ?? 'T'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-ink">Caja</div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          title="Salir"
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border-none bg-ink/[0.06] transition-colors hover:bg-ink/[0.10]"
        >
          <Icon name="logout" size={18} />
        </button>
      </div>
    </aside>
  )
}

// ── Bottom nav (mobile, persistente) ──────────────────────────────────────────
function NavLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-0.5 rounded-[10px] px-1 py-1.5 text-[10px] font-semibold no-underline ${
        active ? 'text-brand' : 'text-ink-muted'
      }`}
    >
      {children}
    </Link>
  )
}

function FabLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex h-14 w-14 -translate-y-5 items-center justify-center self-center rounded-full bg-brand text-white shadow-[0_8px_20px_-6px_rgba(249,115,22,0.6)]"
    >
      {children}
    </Link>
  )
}

function BottomNav({ active }: { active: NavId }) {
  const { capability, counts } = useDashboard()
  const mas = active === 'historial' || active === 'deuda' || active === 'config'

  // Modo catálogo: solo Menú y Configuración (sin FAB "pedir moto").
  // Excepción (DECISIONS §18): con pedidos delivery en vuelo, Pedidos sigue visible.
  if (capability === 'catalog_only') {
    const hasActiveOrders = counts.new + counts.cooking + counts.route > 0
    return (
      <nav className="grid grid-cols-3 border-t border-border bg-white px-1 pb-[max(18px,env(safe-area-inset-bottom))] pt-1.5 lg:hidden">
        {hasActiveOrders && (
          <NavLink href="/" active={active === 'pedidos'}>
            <Icon name="receipt_long" size={22} filled={active === 'pedidos'} />
            <span>Pedidos</span>
          </NavLink>
        )}
        <NavLink href="/menu" active={active === 'menu'}>
          <Icon name="restaurant_menu" size={22} filled={active === 'menu'} />
          <span>Menú</span>
        </NavLink>
        <NavLink href="/configuracion" active={active === 'config'}>
          <Icon name="settings" size={22} filled={active === 'config'} />
          <span>Config</span>
        </NavLink>
      </nav>
    )
  }

  return (
    <nav className="grid grid-cols-5 border-t border-border bg-white px-1 pb-[max(18px,env(safe-area-inset-bottom))] pt-1.5 lg:hidden">
      <NavLink href="/" active={active === 'pedidos'}>
        <Icon name="receipt_long" size={22} filled={active === 'pedidos'} />
        <span>Pedidos</span>
      </NavLink>
      <NavLink href="/menu" active={active === 'menu'}>
        <Icon name="restaurant_menu" size={22} filled={active === 'menu'} />
        <span>Menú</span>
      </NavLink>
      <FabLink href="/nuevo">
        <Icon name="add" size={28} filled />
      </FabLink>
      <NavLink href="/efectivo" active={active === 'efectivo'}>
        <Icon name="payments" size={22} filled={active === 'efectivo'} />
        <span>Efectivo</span>
      </NavLink>
      <NavLink href="/configuracion" active={mas}>
        <Icon name="more_horiz" size={22} filled={mas} />
        <span>Más</span>
      </NavLink>
    </nav>
  )
}

// ── Toast de pedido nuevo (notificación visual en cualquier sección) ──────────
function NewOrderToast({ count }: { count: number }) {
  const prev = useRef(count)
  const [show, setShow] = useState(false)
  const [n, setN] = useState(0)
  useEffect(() => {
    if (count > prev.current) {
      setN(count - prev.current)
      setShow(true)
      const t = setTimeout(() => setShow(false), 6000)
      prev.current = count
      return () => clearTimeout(t)
    }
    prev.current = count
    return undefined
  }, [count])
  if (!show) return null
  return (
    <Link
      href="/"
      onClick={() => setShow(false)}
      className="fixed left-1/2 top-3.5 z-[300] flex -translate-x-1/2 animate-pulse items-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-bold text-white no-underline shadow-[0_8px_24px_-6px_rgba(249,115,22,0.6)]"
    >
      <Icon name="notifications_active" size={18} filled />
      {n === 1 ? 'Nuevo pedido' : `${n} pedidos nuevos`} · ver
    </Link>
  )
}

// ── Gate del modo catálogo ─────────────────────────────────────────────────────
/** Secciones de operación delivery bloqueadas cuando el negocio está en modo
 *  solo-catálogo: los pedidos le llegan por WhatsApp, fuera de la plataforma. */
function CatalogOnlyGate() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft text-brand-dark">
        <Icon name="chat" size={30} filled />
      </span>
      <h1 className="font-display font-semibold text-[22px] text-ink">Modo catálogo activo</h1>
      <p className="max-w-[420px] text-[14px] text-ink-muted">
        Tu negocio publica su catálogo en Tindivo y los pedidos te llegan directo por WhatsApp. El
        servicio de delivery de la plataforma no está disponible por ahora.
      </p>
      <div className="mt-2 flex gap-2">
        <Link
          href="/menu"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-3 text-[15px] font-semibold text-white transition-transform active:scale-[0.98]"
        >
          <Icon name="restaurant_menu" size={16} /> Mi menú
        </Link>
        <Link
          href="/configuracion"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink/[0.06] px-5 py-3 text-[15px] font-semibold text-ink transition-transform active:scale-[0.98]"
        >
          <Icon name="settings" size={16} /> Configuración
        </Link>
      </div>
    </main>
  )
}

function NotificationGate({ onActivate }: { onActivate: () => void }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-5">
      <div className="w-full max-w-[420px] rounded-3xl bg-white p-8 px-7 text-center">
        {/* Icono grande de campana */}
        <div className="mx-auto mb-4 flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-brand-soft text-brand">
          <Icon name="notifications_active" size={36} filled />
        </div>

        <h2 className="mb-2 text-[22px] font-bold text-ink">Activa las notificaciones</h2>

        <div className="mb-2 text-[15px] leading-relaxed text-ink-muted">
          Para recibir pedidos necesitas activar las alertas de sonido y notificaciones del
          navegador.
        </div>

        <div className="mb-6 flex items-center gap-2 rounded-xl bg-warning-soft px-4 py-3 text-[13px] text-amber-800">
          <Icon name="warning" size={16} filled />
          Sin notificaciones activas, los pedidos pueden perderse y cancelarse automáticamente.
        </div>

        <button
          type="button"
          onClick={onActivate}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-5 text-lg font-semibold text-white transition-transform active:scale-[0.98]"
        >
          <Icon name="notifications_active" size={22} filled />
          Activar notificaciones
        </button>

        <div className="mt-3 text-[11px] text-ink-muted">
          Puedes ajustar el volumen desde la configuración del navegador
        </div>
      </div>
    </div>
  )
}

// ── Chrome autenticado: sidebar + realtime + sonido persistentes ──────────────
function AuthedChrome({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  const pathname = usePathname()
  const active = activeIdFor(pathname)

  const [ready, setReady] = useState(false)
  const fontsReady = useIconFontReady()
  const [bizId, setBizId] = useState<string | null>(null)
  const [biz, setBiz] = useState<BizState>({
    name: 'Mi negocio',
    accent: ACCENT_DEFAULT,
    qrUrl: null,
    capability: null,
    until: null,
    blocked: false,
    reason: null,
  })
  const [rows, setRows] = useState<OrderRow[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [soundOn, setSoundOn] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tindivo_sound_on') === 'true'
    }
    return false
  })
  const [gateDismissed, setGateDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tindivo_notifications_gate_dismissed') === 'true'
    }
    return false
  })
  const [gateShown, setGateShown] = useState(false)

  // Mostrar gate en la carga inicial si sonido está desactivado y no ha sido descartado antes.
  useEffect(() => {
    if (!soundOn && !gateDismissed) {
      setGateShown(true)
    }
  }, []) // Solo en el montaje

  const handleActivateNotifications = useCallback(async () => {
    // 1. Activar sonido + unlockAudio (gesto del usuario)
    setSoundOn(true)
    unlockAudio()
    if (typeof window !== 'undefined') {
      localStorage.setItem('tindivo_sound_on', 'true')
    }

    // 2. Habla de prueba para validar que la voz funciona
    speak('Notificaciones activadas')

    // 3. Pedir permiso de push/Notification si no está concedido
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission()
    }

    // 4. Cerrar el modal y persistir
    setGateShown(false)
    setGateDismissed(true)
    if (typeof window !== 'undefined') {
      localStorage.setItem('tindivo_notifications_gate_dismissed', 'true')
    }
  }, [])

  const refetchBiz = useCallback(async () => {
    const { data } = await getSupabaseBrowser()
      .from('businesses')
      .select(
        'id,name,accent_color,qr_url,primary_capability,accepting_orders_until,is_blocked,block_reason',
      )
      .maybeSingle()
    if (data) {
      setBizId(data.id as string)
      setBiz({
        name: (data.name as string | null) ?? 'Mi negocio',
        accent: data.accent_color ? `#${data.accent_color}` : ACCENT_DEFAULT,
        qrUrl: (data.qr_url as string | null) ?? null,
        capability: (data.primary_capability as BusinessPrimaryCapability | null) ?? null,
        until: (data.accepting_orders_until as string | null) ?? null,
        blocked: (data.is_blocked as boolean | null) ?? false,
        reason: (data.block_reason as string | null) ?? null,
      })
    }
  }, [])

  const { setChannelState, refetchIntervalMs, healthStatus } = useChannelHealth()

  const fetchOrdersQuery = useCallback(async () => {
    const { data } = await getSupabaseBrowser()
      .from('orders')
      .select(ORDER_SELECT)
      .order('created_at', { ascending: false })
      .limit(100)
    const fetched = (data ?? []) as unknown as OrderRow[]
    setRows(fetched)
    return fetched
  }, [])

  const { refetch: refetchOrders } = usePolledQuery({
    queryKey: `biz-orders-${bizId ?? 'none'}`,
    queryFn: fetchOrdersQuery,
    refetchInterval: refetchIntervalMs,
    enabled: !!bizId,
  })

  const debouncedRefetchOrders = useDebouncedCallback(refetchOrders, 500)
  const debouncedRefetchBiz = useDebouncedCallback(refetchBiz, 500)

  // Carga inicial: solo esperamos el negocio para pintar el shell.
  // Los pedidos se cargan vía usePolledQuery una vez que bizId está disponible.
  useEffect(() => {
    refetchBiz().finally(() => setReady(true))
  }, [refetchBiz])

  // Suscripción Realtime ÚNICA (filtrada por bizId) con auto-reconstrucción de canal quemado y backoff exponencial.
  useEffect(() => {
    if (!bizId) return
    const supabase = getSupabaseBrowser()
    let activeChannel: any = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let retryAttempt = 0
    let destroyed = false

    function subscribeChannel() {
      if (destroyed) return
      if (activeChannel) {
        supabase.removeChannel(activeChannel)
        activeChannel = null
      }

      const channel = supabase
        .channel(`biz-orders-${bizId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `business_id=eq.${bizId}`,
          },
          () => debouncedRefetchOrders(),
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'businesses',
            filter: `id=eq.${bizId}`,
          },
          () => debouncedRefetchBiz(),
        )

      channel.subscribe((status, err) => {
        if (destroyed) return
        setChannelState(status)
        if (status === 'SUBSCRIBED') {
          retryAttempt = 0 // Reset de contador al conectar exitosamente
          console.log(
            '[realtime] suscrito a',
            `biz-orders-${bizId}`,
            'Salud:',
            'healthy (90s polling)',
          )
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
          const delayMs = getBackoffDelayMs(retryAttempt)
          retryAttempt++
          console.warn(
            `[realtime] estado degradado: ${status} (intento ${retryAttempt}). Re-creando en ${delayMs / 1000}s...`,
            err,
          )
          // Destruir canal quemado y solicitar instancia limpia con backoff exponencial
          if (reconnectTimer) clearTimeout(reconnectTimer)
          reconnectTimer = setTimeout(() => {
            if (!destroyed) subscribeChannel()
          }, delayMs)
        }
      })

      activeChannel = channel
    }

    subscribeChannel()

    return () => {
      destroyed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (activeChannel) {
        supabase.removeChannel(activeChannel)
        activeChannel = null
      }
      setChannelState('CLOSED')
    }
  }, [bizId, debouncedRefetchOrders, debouncedRefetchBiz, setChannelState])

  const vms = useMemo(() => rows.map((r) => toOrderVM(r, now)), [rows, now])
  const counts = useMemo(() => {
    const n = { new: 0, cooking: 0, route: 0, today: 0 }
    for (const v of vms) {
      const col = getColumn(v.status)
      if (col === 'nuevos') n.new++
      else if (col === 'cocina') n.cooking++
      else if (col === 'reparto') n.route++
      if (v.status === 'delivered') n.today++
    }
    return n
  }, [vms])

  // Tick inteligente: solo si hay countdowns o buffer activos.
  const needsTickRef = useRef(false)
  const lastExpireTriggerRef = useRef<number>(0)

  useEffect(() => {
    const hasTicking = vms.some(
      (v) =>
        v.status === 'pending_acceptance' ||
        v.status === 'awaiting_payment' ||
        v.status === 'validando' ||
        v.state === 'cooking' ||
        v.state === 'heading' ||
        v.state === 'waiting' ||
        v.state === 'buffer_p1' ||
        v.state === 'buffer_p2' ||
        v.state === 'buffer_p3' ||
        v.state === 'picked_up',
    )
    needsTickRef.current = hasTicking
  }, [vms])

  useEffect(() => {
    const t = setInterval(() => {
      if (needsTickRef.current) setNow(Date.now())
    }, 1000)
    return () => clearInterval(t)
  }, [])

  // Auto-expiración instantánea cuando el contador llega a 0:00
  useEffect(() => {
    const hasExpired = vms.some(
      (v) =>
        (v.status === 'pending_acceptance' ||
          v.status === 'awaiting_payment' ||
          v.status === 'validando') &&
        v.countdownSec <= 0,
    )

    if (hasExpired && Date.now() - lastExpireTriggerRef.current > 5000) {
      lastExpireTriggerRef.current = Date.now()
      const supabase = getSupabaseBrowser()
      ;(supabase as any)
        .rpc('cancel_expired_prepay_orders')
        .then(() => {
          debouncedRefetchOrders()
        })
        .catch(() => {
          debouncedRefetchOrders()
        })
    }
  }, [vms, debouncedRefetchOrders])

  const paused = isBusinessPaused(biz.until, now)
  const pauseMin = pauseMinutesLeft(biz.until, now)
  const hasWaiting = vms.some((o) => o.state === 'waiting')
  const hasBufferP3 = vms.some((o) => o.state === 'buffer_p2' || o.state === 'buffer_p3')
  const actionRequiredCount = useMemo(
    () => vms.filter((o) => o.status === 'pending_acceptance' || o.status === 'validando').length,
    [vms],
  )

  // Sonido persistente (corre en el chrome → suena en cualquier sección).
  useDashboardSounds({
    hasPending: actionRequiredCount > 0,
    pendingCount: actionRequiredCount,
    hasWaiting,
    hasBufferP3,
    soundOn,
  })

  const toggleSound = useCallback(() => {
    setSoundOn((s) => {
      const next = !s
      if (!s) unlockAudio()
      if (typeof window !== 'undefined') {
        localStorage.setItem('tindivo_sound_on', String(next))
      }
      return next
    })
  }, [])

  const value = useMemo<DashboardCtx | null>(() => {
    if (!bizId) return null
    return {
      bizId,
      bizName: biz.name,
      accent: biz.accent,
      qrUrl: biz.qrUrl,
      capability: biz.capability,
      paused,
      pauseMinLeft: pauseMin,
      blocked: biz.blocked,
      blockReason: biz.reason,
      rows,
      vms,
      counts,
      now,
      soundOn,
      toggleSound,
      refetchOrders,
      refetchBiz,
    }
  }, [
    bizId,
    biz,
    paused,
    pauseMin,
    rows,
    vms,
    counts,
    now,
    soundOn,
    toggleSound,
    refetchOrders,
    refetchBiz,
  ])

  if (!ready || !value || !fontsReady) return <DashboardSkeleton />

  // Gate del modo catálogo: solo Menú y Config son operables. Excepción: si aún
  // hay pedidos delivery en vuelo (de antes del cambio de modo), la sección de
  // pedidos sigue visible con un aviso para no dejarlos inaccesibles.
  const catalogOnly = value.capability === 'catalog_only'
  const activeOrders = counts.new + counts.cooking + counts.route
  const legacyOrdersVisible = active === 'pedidos' && activeOrders > 0
  const gated = catalogOnly && !CATALOG_ONLY_NAV.includes(active) && !legacyOrdersVisible

  return (
    <Ctx.Provider value={value}>
      {gateShown && <NotificationGate onActivate={handleActivateNotifications} />}
      <div className="flex h-dvh bg-surface">
        <div className="hidden shrink-0 lg:block">
          <Sidebar active={active} onSignOut={onSignOut} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col h-dvh">
          {catalogOnly && legacyOrdersVisible && (
            <div className="flex items-center gap-2 bg-warning-soft px-4 py-2 text-[13px] font-semibold text-amber-800">
              <Icon name="info" size={16} filled />
              Modo catálogo activo: estos pedidos son del modo delivery anterior.
            </div>
          )}
          {gated ? <CatalogOnlyGate /> : children}
          <div className="lg:hidden">
            <BottomNav active={active} />
          </div>
        </div>
      </div>
      <NewOrderToast count={counts.new} />
      <SuccessToastHost />
    </Ctx.Provider>
  )
}

// ── Chrome raíz: gate de sesión + chrome persistente ──────────────────────────
export function DashboardChrome({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!ready) return <DashboardSkeleton />
  if (!authed) return <Login onAuthed={() => setAuthed(true)} />
  return (
    <AuthedChrome
      onSignOut={async () => {
        await getSupabaseBrowser().auth.signOut()
        setAuthed(false)
      }}
    >
      {children}
    </AuthedChrome>
  )
}
