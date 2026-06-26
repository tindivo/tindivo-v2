'use client'

import { Button, Card, CardBody } from '@tindivo/ui'
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
import { unlockAudio, useDashboardSounds } from '@/lib/use-audio-alert'
import { MS } from './primitives'

// ── Navegación (fuente única; el activo se deriva de la ruta) ─────────────────
export type NavId = 'pedidos' | 'menu' | 'add' | 'efectivo' | 'historial' | 'deuda' | 'config'

const NAV_ITEMS: { id: NavId; label: string; icon: string; href: string }[] = [
  { id: 'pedidos', label: 'Pedidos', icon: 'receipt_long', href: '/' },
  { id: 'menu', label: 'Menú', icon: 'restaurant_menu', href: '/menu' },
  { id: 'add', label: 'Pedir moto', icon: 'two_wheeler', href: '/nuevo' },
  { id: 'efectivo', label: 'Efectivo', icon: 'payments', href: '/efectivo' },
  { id: 'historial', label: 'Historial', icon: 'history', href: '/historial' },
  { id: 'deuda', label: 'Deuda', icon: 'account_balance_wallet', href: '/deuda' },
  { id: 'config', label: 'Config', icon: 'settings', href: '/configuracion' },
]

const ACCENT_DEFAULT = '#F472B6'

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
  const { bizName, accent, paused, counts, soundOn, toggleSound } = useDashboard()
  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        background: '#fff',
        borderRight: '1px solid var(--tv-border)',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 14px 16px',
        height: '100dvh',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 6px 18px' }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            background: accent || ACCENT_DEFAULT,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 17,
            fontFamily: 'var(--tv-font-display)',
          }}
        >
          {bizName[0] ?? 'T'}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="tv-display" style={{ fontSize: 16, lineHeight: 1.1 }}>
            {bizName}
          </div>
          <div className="tv-label" style={{ marginTop: 2, fontSize: 9 }}>
            SAN JACINTO · ÁNCASH
          </div>
        </div>
      </div>
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV_ITEMS.map((it) => {
          const on = it.id === active
          const badge = it.id === 'pedidos' ? counts.new : undefined
          return (
            <Link
              key={it.id}
              href={it.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 12,
                background: on ? 'var(--tv-ink)' : 'transparent',
                color: on ? '#fff' : 'var(--tv-ink)',
                textDecoration: 'none',
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              <MS name={it.icon} size={20} filled={on} />
              <span style={{ flex: 1 }}>{it.label}</span>
              {badge != null && badge > 0 && (
                <span
                  style={{
                    minWidth: 22,
                    height: 22,
                    borderRadius: 999,
                    background: on ? 'var(--tv-brand)' : 'var(--tv-danger)',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 6px',
                  }}
                >
                  {badge}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
      <div style={{ flex: 1 }} />
      {/* Toggle de alertas (sonido) — accesible desde cualquier sección */}
      <button
        type="button"
        onClick={toggleSound}
        className={`tv-btn tv-btn-sm ${soundOn ? 'tv-btn-brand' : 'tv-btn-ghost'} ${counts.new > 0 && soundOn ? 'tv-pulse-brand' : ''}`}
        style={{ marginBottom: 10, width: '100%' }}
      >
        <MS
          name={soundOn ? 'notifications_active' : 'notifications_off'}
          size={16}
          filled={soundOn}
        />
        Alertas {soundOn ? 'ON' : 'OFF'}
      </button>
      <div
        className="tv-card"
        style={{ padding: 12, marginBottom: 10, background: '#FFF4EC', boxShadow: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MS name="circle" size={10} filled style={{ color: paused ? '#B45309' : '#16A34A' }} />
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {paused ? 'Pausado' : 'Plataforma abierta'}
          </div>
        </div>
        <div className="tv-label" style={{ fontSize: 9, marginTop: 4 }}>
          {paused ? 'NO RECIBE PEDIDOS WEB' : 'RECIBIENDO PEDIDOS'}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 6px',
          borderTop: '1px solid var(--tv-border)',
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            background: 'var(--tv-brand-soft)',
            color: 'var(--tv-brand-dark)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          {bizName[0] ?? 'T'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Caja</div>
        </div>
        <button
          type="button"
          onClick={onSignOut}
          title="Salir"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'rgba(26,22,20,0.06)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <MS name="logout" size={18} />
        </button>
      </div>
    </aside>
  )
}

// ── Bottom nav (mobile, persistente) ──────────────────────────────────────────
function navBtnStyle(active: boolean) {
  return {
    background: 'none',
    border: 'none',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 2,
    padding: '6px 4px',
    fontFamily: 'inherit',
    fontSize: 10,
    color: active ? 'var(--tv-brand)' : 'var(--tv-ink-muted)',
    fontWeight: 600,
    cursor: 'pointer',
    borderRadius: 10,
    textDecoration: 'none',
  }
}

function BottomNav({ active }: { active: NavId }) {
  const mas = active === 'historial' || active === 'deuda' || active === 'config'
  return (
    <div className="tv-bottom-nav">
      <Link
        href="/"
        className={active === 'pedidos' ? 'active' : ''}
        style={navBtnStyle(active === 'pedidos')}
      >
        <MS name="receipt_long" size={22} filled={active === 'pedidos'} />
        <span>Pedidos</span>
      </Link>
      <Link
        href="/menu"
        className={active === 'menu' ? 'active' : ''}
        style={navBtnStyle(active === 'menu')}
      >
        <MS name="restaurant_menu" size={22} filled={active === 'menu'} />
        <span>Menú</span>
      </Link>
      <Link href="/nuevo" className="fab">
        <MS name="add" size={28} filled />
      </Link>
      <Link
        href="/efectivo"
        className={active === 'efectivo' ? 'active' : ''}
        style={navBtnStyle(active === 'efectivo')}
      >
        <MS name="payments" size={22} filled={active === 'efectivo'} />
        <span>Efectivo</span>
      </Link>
      <Link href="/configuracion" className={mas ? 'active' : ''} style={navBtnStyle(mas)}>
        <MS name="more_horiz" size={22} filled={mas} />
        <span>Más</span>
      </Link>
    </div>
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
      className="tv-pulse-brand"
      style={{
        position: 'fixed',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--tv-brand)',
        color: '#fff',
        padding: '10px 16px',
        borderRadius: 999,
        fontWeight: 700,
        fontSize: 14,
        textDecoration: 'none',
        boxShadow: '0 8px 24px -6px rgba(249,115,22,0.6)',
      }}
    >
      <MS name="notifications_active" size={18} filled />
      {n === 1 ? 'Nuevo pedido' : `${n} pedidos nuevos`} · ver
    </Link>
  )
}

// ── Chrome autenticado: sidebar + realtime + sonido persistentes ──────────────
function AuthedChrome({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  const pathname = usePathname()
  const active = activeIdFor(pathname)

  const [ready, setReady] = useState(false)
  const [bizId, setBizId] = useState<string | null>(null)
  const [biz, setBiz] = useState<BizState>({
    name: 'Mi negocio',
    accent: ACCENT_DEFAULT,
    qrUrl: null,
    until: null,
    blocked: false,
    reason: null,
  })
  const [rows, setRows] = useState<OrderRow[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [soundOn, setSoundOn] = useState(false)

  const refetchBiz = useCallback(async () => {
    const { data } = await getSupabaseBrowser()
      .from('businesses')
      .select('id,name,accent_color,qr_url,accepting_orders_until,is_blocked,block_reason')
      .maybeSingle()
    if (data) {
      setBizId(data.id as string)
      setBiz({
        name: (data.name as string | null) ?? 'Mi negocio',
        accent: data.accent_color ? `#${data.accent_color}` : ACCENT_DEFAULT,
        qrUrl: (data.qr_url as string | null) ?? null,
        until: (data.accepting_orders_until as string | null) ?? null,
        blocked: (data.is_blocked as boolean | null) ?? false,
        reason: (data.block_reason as string | null) ?? null,
      })
    }
  }, [])

  const refetchOrders = useCallback(async () => {
    const { data } = await getSupabaseBrowser()
      .from('orders')
      .select(ORDER_SELECT)
      .order('created_at', { ascending: false })
      .limit(100)
    setRows((data ?? []) as unknown as OrderRow[])
  }, [])

  // Carga inicial + suscripción Realtime ÚNICA (persiste en toda sección).
  useEffect(() => {
    const supabase = getSupabaseBrowser()
    Promise.all([refetchBiz(), refetchOrders()]).finally(() => setReady(true))
    const channel = supabase
      .channel('biz-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () =>
        refetchOrders(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'businesses' }, () =>
        refetchBiz(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [refetchBiz, refetchOrders])

  // Tick para countdowns / buffer.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

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

  const paused = isBusinessPaused(biz.until, now)
  const pauseMin = pauseMinutesLeft(biz.until, now)
  const hasWaiting = vms.some((o) => o.state === 'waiting')
  const hasBufferP3 = vms.some((o) => o.state === 'buffer_p3')

  // Sonido persistente (corre en el chrome → suena en cualquier sección).
  useDashboardSounds({ hasPending: counts.new > 0, hasWaiting, hasBufferP3, soundOn })

  const toggleSound = useCallback(() => {
    setSoundOn((s) => {
      if (!s) unlockAudio()
      return !s
    })
  }, [])

  const value = useMemo<DashboardCtx | null>(() => {
    if (!bizId) return null
    return {
      bizId,
      bizName: biz.name,
      accent: biz.accent,
      qrUrl: biz.qrUrl,
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

  if (!ready || !value) return <div className="p-10 text-ink-muted">Cargando…</div>

  return (
    <Ctx.Provider value={value}>
      <div className="flex" style={{ height: '100dvh', background: 'var(--tv-surface)' }}>
        <div className="hidden shrink-0 lg:block">
          <Sidebar active={active} onSignOut={onSignOut} />
        </div>
        <div className="flex flex-col" style={{ flex: 1, minWidth: 0, height: '100dvh' }}>
          {children}
          <div className="lg:hidden">
            <BottomNav active={active} />
          </div>
        </div>
      </div>
      <NewOrderToast count={counts.new} />
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

  if (!ready) return <div className="p-10 text-ink-muted">Cargando…</div>
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
