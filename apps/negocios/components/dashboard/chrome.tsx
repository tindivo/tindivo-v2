'use client'

import {
  ACTIVE_ORDER_STATUSES,
  type BusinessPrimaryCapability,
  type PaymentQrView,
  serviceDayStart,
} from '@tindivo/contracts'
import { canalUnico } from '@tindivo/supabase'
import { BottomSheet, Button, Card, CardBody, Icon } from '@tindivo/ui'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
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
import { OpeningControls } from '@/features/apertura/components/opening-controls'
import { AttentionBanner } from '@/features/pedidos/components/attention-banner'
import { LostSaleAlert } from '@/features/pedidos/components/lost-sale-alert'
import { useLostSales } from '@/features/pedidos/hooks/use-lost-sales'
import { getBackoffDelayMs, useChannelHealth } from '@/hooks/use-channel-health'
import { useIconFontReady } from '@/hooks/use-icon-font-ready'
import { usePolledQuery } from '@/hooks/use-polled-query'
import { usePushStatus } from '@/hooks/use-push-status'
import { useBusinessTimers } from '@/hooks/use-queue-lead'
import { attentionState } from '@/lib/orders/attention'
import {
  getColumn,
  isBusinessPaused,
  needsClockTick,
  ORDER_SELECT,
  type OrderRow,
  type OrderVM,
  pauseMinutesLeft,
  paymentChangeAlert,
  toOrderVM,
} from '@/lib/orders/view-model'
import { signOutDevice } from '@/lib/sign-out'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import {
  audioIsBlocked,
  unlockAudio,
  useDashboardSounds,
  usePaymentChangeAlerts,
} from '@/lib/use-audio-alert'
import { type ResultadoPrueba, SoundCheck } from '../sound-check'
import { DashboardSkeleton } from './dashboard-skeleton'
import { PaymentChangeAlertHost } from './payment-change-alert'
import { SuccessToastHost } from './toast'

// ── Debounce hook ─────────────────────────────────────────────────────────────
function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delay: number,
): (...args: Args) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn

  return useCallback(
    (...args: Args) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => fnRef.current(...args), delay)
    },
    [delay],
  )
}

// ── Navegación (fuente única; el activo se deriva de la ruta) ─────────────────
export type NavId =
  | 'pedidos'
  | 'menu'
  | 'add'
  | 'efectivo'
  | 'historial'
  | 'rendimiento'
  | 'resenas'
  | 'deuda'
  | 'config'

const NAV_ITEMS: { id: NavId; label: string; icon: string; href: string }[] = [
  { id: 'pedidos', label: 'Pedidos', icon: 'receipt_long', href: '/' },
  { id: 'menu', label: 'Menú', icon: 'restaurant_menu', href: '/menu' },
  { id: 'add', label: 'Pedir moto', icon: 'two_wheeler', href: '/nuevo' },
  { id: 'efectivo', label: 'Liquidaciones', icon: 'payments', href: '/efectivo' },
  { id: 'historial', label: 'Historial', icon: 'history', href: '/historial' },
  { id: 'rendimiento', label: 'Rendimiento', icon: 'rocket_launch', href: '/rendimiento' },
  { id: 'resenas', label: 'Reseñas', icon: 'star', href: '/resenas' },
  { id: 'deuda', label: 'Mi cuenta', icon: 'account_balance_wallet', href: '/deuda' },
  { id: 'config', label: 'Config', icon: 'settings', href: '/configuracion' },
]

const ACCENT_DEFAULT = 'var(--color-brand)'

function activeIdFor(pathname: string): NavId {
  if (pathname === '/') return 'pedidos'
  if (pathname.startsWith('/menu')) return 'menu'
  if (pathname.startsWith('/nuevo')) return 'add'
  if (pathname.startsWith('/efectivo')) return 'efectivo'
  if (pathname.startsWith('/historial')) return 'historial'
  if (pathname.startsWith('/rendimiento')) return 'rendimiento'
  if (pathname.startsWith('/resenas')) return 'resenas'
  if (pathname.startsWith('/deuda')) return 'deuda'
  if (pathname.startsWith('/configuracion')) return 'config'
  return 'pedidos'
}

// ── Contexto del dashboard (negocio + pedidos + sonido, compartido por TODA sección) ──
export interface DashboardCtx {
  bizId: string
  bizName: string
  accent: string
  /** Cuentas de cobro del local, principal primero (0184). */
  paymentQrs: PaymentQrView[]
  capability: BusinessPrimaryCapability | null
  paused: boolean
  pauseMinLeft: number | null
  blocked: boolean
  blockReason: string | null
  rows: OrderRow[]
  vms: OrderVM[]
  /**
   * `delivered` y `cancelled` son los de LA JORNADA, no los de todos los
   * tiempos, y lo son por construcción: `fetchOrdersQuery` solo trae los
   * cerrados de esta noche. Ver allí por qué el contador antiguo (`today`)
   * mentía.
   */
  counts: {
    new: number
    cooking: number
    route: number
    delivered: number
    cancelled: number
  }
  now: number
  soundOn: boolean
  toggleSound: () => void
  /**
   * Enciende las alertas, sin alternar. Lo llama la prueba de sonido de la
   * apertura: ahí la intención es inequívoca —se está comprobando que suena—, y
   * un `toggle` habría APAGADO el sonido justo en el turno de quien ya lo tenía
   * bien puesto.
   */
  enableSound: () => void
  /**
   * Pide la prueba de sonido. Vive en el chrome y no en la apertura porque
   * ahora la piden dos sitios muy distintos —la apertura del turno y el aviso
   * de venta perdida— y el resultado es el mismo hecho: en este aparato, a esta
   * hora, alguien confirmó que se oye.
   */
  askSoundCheck: () => void
  /**
   * Cuándo se comprobó el sonido por última vez EN ESTE APARATO, o `null` si
   * nunca. Quien lo lee decide si sigue valiendo: la apertura, por ejemplo, lo
   * caduca al empezar cada turno.
   */
  soundCheckAt: number | null
  /**
   * `force` salta el cooldown de deduplicación de `usePolledQuery`.
   *
   * Lo necesita quien acaba de ESCRIBIR y sabe que el servidor ya tiene el
   * cambio: aplazar un segundo la lectura que confirma tu propia mutación es
   * exactamente el parpadeo que se quiere evitar. El resto (poll, Realtime,
   * visibilitychange) debe seguir pasando por el cooldown.
   */
  refetchOrders: (options?: { force?: boolean }) => Promise<void>
  refetchBiz: () => Promise<void>
  signOut: () => void
  /**
   * Cuántos pedidos RECLAMAN a la cajera, que no es lo mismo que `counts.new`.
   *
   * `counts.new` cuenta la columna «Nuevos» entera, y ahí caben prepagos
   * aceptados esperando a que pague el cliente. Sirve para el chip de la
   * columna, que se llama así; no sirve para interrumpirla desde la barra
   * lateral. Sale del mismo predicado que el sonido, el banner y el latido.
   */
  attentionCount: number
  /** Liquidaciones de efectivo pendientes de confirmación por la cajera. */
  pendingCashCount: number
  /** ¿Está sonando la alarma AHORA? */
  alarmOn: boolean
  /**
   * EL BANNER PIDE ABRIR UN PEDIDO QUE NO ES SUYO.
   *
   * El banner lo pinta el chrome —tiene que sobrevivir a los cambios de ruta— y
   * la ficha del pedido vive en `app/page.tsx`. Sin este canal, el botón «Ver»
   * solo podía navegar a `/` y dejarla a un toque de distancia todavía: el
   * camino más directo para atender la alarma era el único que no la atendía.
   */
  openRequestId: string | null
  requestOpen: (rowId: string) => void
  clearOpenRequest: () => void
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
  paymentQrs: PaymentQrView[]
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
  const {
    bizName,
    accent,
    capability,
    paused,
    soundOn,
    toggleSound,
    attentionCount,
    pendingCashCount,
    alarmOn,
  } = useDashboard()
  const catalogOnly = capability === 'catalog_only'
  const navItems = NAV_ITEMS
  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-border bg-white px-3.5 py-5 pb-4">
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
          // LO QUE LA RECLAMA, NO EL TAMAÑO DE LA COLUMNA.
          //
          // Marcaba `counts.new`, o sea también los prepagos que esperan al
          // cliente. Un número rojo en la barra lateral es una interrupción, y
          // decía «tienes cuatro cosas que hacer» cuando podían ser dos. El
          // reparto completo lo cuenta el subtítulo de la columna, que es donde
          // ella ya está mirando cuando le hace falta.
          const badge =
            it.id === 'pedidos'
              ? attentionCount
              : it.id === 'efectivo'
                ? pendingCashCount
                : undefined
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
        } ${alarmOn ? 'animate-pulse' : ''}`}
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
      <div className="mt-2.5 border-t border-border pt-2.5">
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-danger-soft px-3 py-2.5 text-[13px] font-semibold text-danger transition-transform active:scale-[0.98] hover:bg-danger/20"
        >
          <Icon name="logout" size={18} />
          <span>Cerrar sesión</span>
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
  const { soundOn, toggleSound, signOut, bizName, pendingCashCount } = useDashboard()
  const [moreOpen, setMoreOpen] = useState(false)
  const mas =
    active === 'historial' ||
    active === 'rendimiento' ||
    active === 'resenas' ||
    active === 'deuda' ||
    active === 'config'

  return (
    <>
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
          <span className="relative inline-flex items-center justify-center">
            <Icon name="payments" size={22} filled={active === 'efectivo'} />
            {pendingCashCount > 0 && (
              <span
                role="status"
                aria-label={`${pendingCashCount} por confirmar`}
                className={`absolute -top-1.5 -right-2 inline-flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-black leading-none shadow-xs border border-white ${
                  active === 'efectivo' ? 'bg-brand text-white' : 'bg-danger text-white'
                }`}
              >
                {pendingCashCount > 9 ? '9+' : pendingCashCount}
              </span>
            )}
          </span>
          <span>Efectivo</span>
        </NavLink>
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className={`flex flex-col items-center gap-0.5 rounded-[10px] px-1 py-1.5 text-[10px] font-semibold cursor-pointer ${
            mas ? 'text-brand' : 'text-ink-muted'
          }`}
        >
          <Icon name="more_horiz" size={22} filled={mas} />
          <span>Más</span>
        </button>
      </nav>

      {moreOpen && (
        <BottomSheet open label="Más opciones" onClose={() => setMoreOpen(false)}>
          <div className="flex flex-col px-5 pt-2 pb-7">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="min-w-0">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                  Panel del negocio
                </span>
                <h3 className="truncate font-display text-[17px] font-bold text-ink">{bizName}</h3>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Cerrar menú"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink-muted hover:bg-ink/[0.12]"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-1.5">
              <Link
                href="/historial"
                onClick={() => setMoreOpen(false)}
                className={`flex items-center gap-3.5 rounded-2xl p-3 transition-colors ${
                  active === 'historial'
                    ? 'bg-ink text-white'
                    : 'bg-surface hover:bg-ink/[0.04] text-ink'
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    active === 'historial' ? 'bg-white/15 text-white' : 'bg-ink/[0.06] text-ink'
                  }`}
                >
                  <Icon name="history" size={22} filled={active === 'historial'} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold leading-tight">
                    Historial de pedidos
                  </div>
                  <div
                    className={`mt-0.5 text-[12px] ${
                      active === 'historial' ? 'text-white/70' : 'text-ink-muted'
                    }`}
                  >
                    Pedidos pasados, entregas y reclamos
                  </div>
                </div>
              </Link>

              <Link
                href="/rendimiento"
                onClick={() => setMoreOpen(false)}
                className={`flex items-center gap-3.5 rounded-2xl p-3 transition-colors ${
                  active === 'rendimiento'
                    ? 'bg-ink text-white'
                    : 'bg-surface hover:bg-ink/[0.04] text-ink'
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    active === 'rendimiento' ? 'bg-white/15 text-white' : 'bg-ink/[0.06] text-ink'
                  }`}
                >
                  <Icon name="rocket_launch" size={22} filled={active === 'rendimiento'} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold leading-tight">
                    Rendimiento y Retorno
                  </div>
                  <div
                    className={`mt-0.5 text-[12px] ${
                      active === 'rendimiento' ? 'text-white/70' : 'text-ink-muted'
                    }`}
                  >
                    Ventas, retorno Tindivo y clientes
                  </div>
                </div>
              </Link>

              <Link
                href="/resenas"
                onClick={() => setMoreOpen(false)}
                className={`flex items-center gap-3.5 rounded-2xl p-3 transition-colors ${
                  active === 'resenas'
                    ? 'bg-ink text-white'
                    : 'bg-surface hover:bg-ink/[0.04] text-ink'
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    active === 'resenas' ? 'bg-white/15 text-white' : 'bg-ink/[0.06] text-ink'
                  }`}
                >
                  <Icon name="star" size={22} filled={active === 'resenas'} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold leading-tight">Reseñas</div>
                  <div
                    className={`mt-0.5 text-[12px] ${
                      active === 'resenas' ? 'text-white/70' : 'text-ink-muted'
                    }`}
                  >
                    Cómo calificaron tus pedidos
                  </div>
                </div>
              </Link>

              <Link
                href="/deuda"
                onClick={() => setMoreOpen(false)}
                className={`flex items-center gap-3.5 rounded-2xl p-3 transition-colors ${
                  active === 'deuda'
                    ? 'bg-ink text-white'
                    : 'bg-surface hover:bg-ink/[0.04] text-ink'
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    active === 'deuda' ? 'bg-white/15 text-white' : 'bg-ink/[0.06] text-ink'
                  }`}
                >
                  <Icon name="account_balance_wallet" size={22} filled={active === 'deuda'} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold leading-tight">Mi cuenta / Deuda</div>
                  <div
                    className={`mt-0.5 text-[12px] ${
                      active === 'deuda' ? 'text-white/70' : 'text-ink-muted'
                    }`}
                  >
                    Balance de comisiones, saldo y devoluciones
                  </div>
                </div>
              </Link>

              <Link
                href="/configuracion"
                onClick={() => setMoreOpen(false)}
                className={`flex items-center gap-3.5 rounded-2xl p-3 transition-colors ${
                  active === 'config'
                    ? 'bg-ink text-white'
                    : 'bg-surface hover:bg-ink/[0.04] text-ink'
                }`}
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    active === 'config' ? 'bg-white/15 text-white' : 'bg-ink/[0.06] text-ink'
                  }`}
                >
                  <Icon name="settings" size={22} filled={active === 'config'} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold leading-tight">Configuración</div>
                  <div
                    className={`mt-0.5 text-[12px] ${
                      active === 'config' ? 'text-white/70' : 'text-ink-muted'
                    }`}
                  >
                    Horarios, métodos de pago y datos del local
                  </div>
                </div>
              </Link>
            </div>

            <div className="mt-4 border-t border-border pt-3.5 flex flex-col gap-2">
              <button
                type="button"
                onClick={toggleSound}
                className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[14px] font-semibold transition-transform active:scale-[0.98] ${
                  soundOn ? 'bg-brand text-white' : 'bg-ink/[0.06] text-ink'
                }`}
              >
                <Icon
                  name={soundOn ? 'notifications_active' : 'notifications_off'}
                  size={18}
                  filled={soundOn}
                />
                Alertas de sonido {soundOn ? 'ON' : 'OFF'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false)
                  signOut()
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-danger-soft py-2.5 text-[14px] font-semibold text-danger transition-colors hover:bg-danger/20 cursor-pointer"
              >
                <Icon name="logout" size={18} />
                Cerrar sesión
              </button>
            </div>
          </div>
        </BottomSheet>
      )}
    </>
  )
}

// ── Gate del modo catálogo ─────────────────────────────────────────────────────
/**
 * El aviso de sonido apagado. Sale en dos momentos MUY distintos y el texto
 * tiene que distinguirlos:
 *
 *   · al entrar, cuando las alertas nunca se activaron. Es informativo y se
 *     puede leer con calma;
 *   · CON UN PEDIDO ESPERANDO Y EL SONIDO MUDO. Aquí ya no se está previniendo
 *     nada: se está perdiendo una venta mientras el modal está en pantalla, y
 *     decirlo con las mismas palabras de bienvenida sería mentir por omisión.
 */
function NotificationGate({
  onActivate,
  urgente,
}: {
  onActivate: () => void
  /** Hay algo esperando AHORA y no está sonando. */
  urgente: boolean
}) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-5">
      <div className="w-full max-w-[420px] rounded-3xl bg-white p-8 px-7 text-center">
        <div
          className={`mx-auto mb-4 flex h-[72px] w-[72px] items-center justify-center rounded-[20px] ${
            urgente ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand'
          }`}
        >
          <Icon name={urgente ? 'priority_high' : 'notifications_active'} size={36} filled />
        </div>

        <h2 className="mb-2 text-[22px] font-bold text-ink">
          {urgente ? 'Tienes un pedido y no está sonando' : 'Activa las notificaciones'}
        </h2>

        <div className="mb-2 text-[15px] leading-relaxed text-ink-muted">
          {urgente
            ? 'Hay un pedido esperando respuesta y las alertas de este equipo están apagadas o bloqueadas.'
            : 'Para recibir pedidos necesitas activar las alertas de sonido y notificaciones del navegador.'}
        </div>

        <div className="mb-6 flex items-center gap-2 rounded-xl bg-warning-soft px-4 py-3 text-[13px] text-amber-800">
          <Icon name="warning" size={16} filled />
          {urgente
            ? 'Si no lo aceptas a tiempo, el pedido se cancela solo.'
            : 'Sin notificaciones activas, los pedidos pueden perderse y cancelarse automáticamente.'}
        </div>

        <button
          type="button"
          onClick={onActivate}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-6 py-5 text-lg font-semibold text-white transition-transform active:scale-[0.98]"
        >
          <Icon name="notifications_active" size={22} filled />
          {urgente ? 'Activar el sonido ahora' : 'Activar notificaciones'}
        </button>

        <div className="mt-3 text-[11px] text-ink-muted">
          Puedes ajustar el volumen desde la configuración del navegador
        </div>
      </div>
    </div>
  )
}

// ── Chrome autenticado: sidebar + realtime + sonido persistentes ──────────────
/**
 * Se muestra cuando la carga del negocio terminó sin negocio.
 *
 * Existe porque la alternativa era un esqueleto infinito: la cajera se quedaba
 * mirando cajas grises, de noche y con el cliente al teléfono, sin un botón que
 * tocar ni un texto que leer. Aquí siempre hay dos salidas.
 */
function BizLoadError({
  reason,
  onRetry,
  onSignOut,
}: {
  reason: string | null
  onRetry: () => void
  onSignOut: () => void
}) {
  const noBiz = reason === 'NO_BIZ' || reason === 'NO_SESSION'
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-soft">
        <Icon name={noBiz ? 'store' : 'cloud_off'} size={28} filled className="text-danger" />
      </div>
      <div className="max-w-[360px]">
        <h1 className="font-display text-lg font-bold text-ink">
          {noBiz ? 'Esta cuenta no tiene un negocio' : 'No se pudo cargar tu negocio'}
        </h1>
        <p className="mt-1 text-[14px] text-ink-muted">
          {noBiz
            ? 'Tu sesión es válida, pero no está asociada a ningún negocio. Escríbenos para revisarlo.'
            : 'Puede ser tu conexión o una sesión vencida. Vuelve a intentar; si sigue igual, cierra sesión y entra de nuevo.'}
        </p>
        {!noBiz && reason && (
          <p className="mt-2 break-words font-mono text-[11px] text-ink-muted/70">{reason}</p>
        )}
      </div>
      <div className="flex w-full max-w-[320px] flex-col gap-2">
        {!noBiz && (
          <Button className="w-full" onClick={onRetry}>
            Volver a intentar
          </Button>
        )}
        <button
          type="button"
          onClick={onSignOut}
          className="h-11 w-full cursor-pointer rounded-full border border-ink/[0.12] bg-card text-[15px] font-semibold text-ink transition-colors hover:bg-ink/[0.04]"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

function AuthedChrome({ children, onSignOut }: { children: ReactNode; onSignOut: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const active = activeIdFor(pathname)

  const [ready, setReady] = useState(false)
  const fontsReady = useIconFontReady()
  const [bizId, setBizId] = useState<string | null>(null)
  /** Por qué no se pudo cargar el negocio. `'NO_BIZ'` = la consulta fue bien
   *  pero no devolvió ninguna fila. Cualquier otro texto = error de la consulta. */
  const [bizError, setBizError] = useState<string | null>(null)
  const [biz, setBiz] = useState<BizState>({
    name: 'Mi negocio',
    accent: ACCENT_DEFAULT,
    paymentQrs: [],
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

  /**
   * ¿POR QUÉ HAY UN PEDIDO ESPERANDO EN SILENCIO?
   *
   * Dos causas, y las dos son invisibles desde el mostrador:
   *
   *   · el interruptor de alertas está en OFF. Se guarda en `localStorage` y no
   *     caduca: una noche que alguien se hartó del ruido apaga el sonido de
   *     todas las noches siguientes;
   *   · el `AudioContext` está en `suspended`. Pasa solo, sin error y sin aviso,
   *     cuando la página se recarga y nadie la ha tocado todavía —un despliegue,
   *     un tirón de red— y con él NO SUENA NADA aunque el interruptor esté en
   *     ON y el parlante a tope. Es la explicación más probable de «tengo el
   *     parlante prendido y no sonó».
   *
   * `gateDismissed` no cuenta aquí. Ese «no volver a mostrar» se dio para la
   * pantalla de bienvenida, no para dar permiso a perder un pedido concreto que
   * está esperando ahora mismo. La condición se comprueba solo cuando hay algo
   * en juego, así que en una noche tranquila esto no interrumpe jamás.
   */
  const [audioBloqueado, setAudioBloqueado] = useState(false)

  /** El registro del token de push. Ver `usePushStatus` y el gate de alertas. */
  const { enable: enablePush } = usePushStatus()

  const enableSound = useCallback(() => {
    unlockAudio()
    setSoundOn(true)
    if (typeof window !== 'undefined') {
      localStorage.setItem('tindivo_sound_on', 'true')
    }
  }, [])

  /**
   * LA PRUEBA DE SONIDO, QUE AHORA LA PIDEN DOS SITIOS.
   *
   * Nació dentro de la apertura del turno y ahí se quedaba el resultado. Pero el
   * aviso de venta perdida necesita ofrecer exactamente lo mismo —«¿seguro que
   * esto suena?»— y su respuesta vale igual: es el mismo aparato y el mismo
   * momento. Vive aquí para que haya UN solo hecho registrado, en vez de dos
   * comprobaciones que no se enteran la una de la otra.
   *
   * Se guarda el INSTANTE y no un booleano. «Se comprobó» sin fecha no dice
   * nada: lo que importa es si se comprobó en este turno, y esa pregunta la
   * contesta quien lee, que es quien conoce el horario.
   */
  const [soundCheckAt, setSoundCheckAt] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null
    const raw = Number(localStorage.getItem('tindivo_sound_check_at'))
    return Number.isFinite(raw) && raw > 0 ? raw : null
  })
  const [soundCheckOpen, setSoundCheckOpen] = useState(false)

  const askSoundCheck = useCallback(() => {
    // Encender las alertas es parte de la prueba: comprobar que suena con el
    // interruptor apagado no comprueba nada, y el interruptor puede llevar
    // apagado desde una noche en que alguien se hartó del ruido.
    enableSound()
    setSoundCheckOpen(true)
  }, [enableSound])

  const onSoundCheckDone = useCallback((resultado: ResultadoPrueba) => {
    setSoundCheckOpen(false)
    if (resultado !== 'oido') return
    const ahora = Date.now()
    setSoundCheckAt(ahora)
    try {
      localStorage.setItem('tindivo_sound_check_at', String(ahora))
    } catch {
      // Sin `localStorage` la prueba se repetirá tras recargar. Molesto y
      // preferible a darla por buena sin poder recordarlo.
    }
  }, [])

  const handleActivateNotifications = useCallback(async () => {
    // 1. Permiso Y REGISTRO DEL TOKEN, que son dos cosas y aquí solo se hacía
    //    la primera.
    //
    //    Este handler llamaba a `Notification.requestPermission()` y se
    //    despedía. Quien mandaba el token al backend era `PushManager`, que
    //    mira el permiso una sola vez al montar la página — o sea ANTES de que
    //    este modal exista. Así que el camino normal (entrar, ver el gate,
    //    aceptarlo) acababa con el permiso concedido y sin suscripción: el
    //    navegador enseñaría los avisos que le mandaran, pero nadie tenía a
    //    dónde mandárselos.
    //
    //    `enable()` hace las dos, y pide el permiso lo primero para no romper
    //    el contexto del gesto en iOS. Ver `usePushStatus`.
    await enablePush()

    // 2. Cerrar el modal y persistir el «ya lo vi».
    setGateShown(false)
    setGateDismissed(true)
    if (typeof window !== 'undefined') {
      localStorage.setItem('tindivo_notifications_gate_dismissed', 'true')
    }

    // 3. LA PRUEBA COMPLETA SOLO SI NUNCA SE CONFIRMÓ NADA, EN ESTE APARATO.
    //
    //    Antes esto decía «Notificaciones activadas» con la voz y se despedía.
    //    Decir que están activadas no es lo mismo que comprobar que se oyen —lo
    //    primero lo sabe el código, lo segundo solo lo sabe quien está delante—
    //    y esa diferencia es la que se cobró tres pedidos el 8 de septiembre.
    //
    //    Pero este gate se reabre solo (ver el efecto de `alarmaPendiente` más
    //    abajo) cada vez que hay un pedido esperando y el sonido está apagado o
    //    el `AudioContext` suspendido — y eso pasa en CUALQUIER recarga de la
    //    página, y en cuanto se apaga el interruptor con algo pendiente. Pedir
    //    la prueba entera —bip, voz, «¿lo oíste?», troubleshooting— cada vez que
    //    eso ocurre convierte el gate en un trámite largo justo cuando lo urgente
    //    es volver a atender. Si ya se confirmó alguna vez en este aparato, aquí
    //    basta con recuperar el sonido; la re-verificación de fondo (una vez por
    //    turno, sin importar el gate) la sigue haciendo `OpeningControls`.
    if (soundCheckAt === null) {
      askSoundCheck()
    } else {
      enableSound()
    }
  }, [askSoundCheck, enablePush, enableSound, soundCheckAt])

  const refetchBiz = useCallback(async () => {
    const supabase = getSupabaseBrowser()

    // SE FILTRA POR `user_id`, NO SE CONFÍA EN QUE RLS DEVUELVA UNA SOLA FILA.
    //
    // La consulta era `.from('businesses').select(…).maybeSingle()` a secas, o
    // sea "el negocio que puedo ver". Y `businesses` tiene DOS policies
    // permisivas, que se suman con OR: `biz_self_read` (user_id = auth.uid()) y
    // `biz_admin_all` (cmd=ALL para el rol admin). Un usuario con rol business
    // Y admin —que existe: la cuenta del piloto los tiene ambos— ve TODOS los
    // negocios, así que `maybeSingle()` recibía 69 filas y reventaba con
    // "JSON object requested, multiple (or no) rows returned".
    //
    // El dashboard de negocios quiere EL NEGOCIO DE QUIEN ENTRÓ. Decirlo en la
    // consulta lo hace correcto para cualquier combinación de roles, presente o
    // futura, en vez de depender de que las policies nunca devuelvan dos filas.
    const { data: sessionData } = await supabase.auth.getSession()
    const userId = sessionData.session?.user.id
    if (!userId) {
      setBizError('NO_SESSION')
      return
    }

    const { data, error } = await supabase
      .from('businesses')
      .select(
        'id,name,accent_color,primary_capability,accepting_orders_until,is_blocked,block_reason,default_payment_qr_slot',
      )
      .eq('user_id', userId)
      .maybeSingle()

    // EL ERROR NO SE PUEDE TIRAR A LA BASURA.
    //
    // Antes esto era `const { data } = await …` y el error se descartaba. Si la
    // consulta fallaba —sesión inválida, JWT vencido, RLS que no devuelve
    // ninguna fila— `data` venía null, `setBizId` no llegaba a ejecutarse y
    // `bizId` se quedaba en null. Y con `bizId` null, `value` es null, así que
    // la pantalla devolvía `<DashboardSkeleton />` PARA SIEMPRE: sin error, sin
    // login, sin nada que tocar. Un esqueleto eterno con la consola limpia.
    //
    // Ahora el fallo se guarda y la pantalla lo muestra con salida (reintentar o
    // cerrar sesión). Distinguimos los dos casos porque piden cosas distintas:
    // un error es "reintenta", y cero filas es "esta cuenta no tiene negocio".
    if (error) {
      setBizError(error.message)
      return
    }
    if (!data) {
      setBizError('NO_BIZ')
      return
    }
    setBizError(null)
    if (data) {
      setBizId(data.id as string)
      // Las cuentas de cobro viven en su propia tabla (0184). La cajera concilia
      // contra la que el motorizado está enseñando, así que el orden importa y
      // se resuelve igual que en la API: el slot que apunta el negocio primero,
      // y si ese slot ya no existe manda el más bajo.
      const defaultSlot = (data.default_payment_qr_slot as number | null) ?? 1
      const { data: qrRows } = await supabase
        .from('business_payment_qrs')
        .select('slot,wallet,account_number,account_name,qr_url')
        .eq('business_id', data.id as string)
      const paymentQrs: PaymentQrView[] = [...(qrRows ?? [])]
        .sort(
          (a, b) =>
            Number(b.slot === defaultSlot) - Number(a.slot === defaultSlot) || a.slot - b.slot,
        )
        .map((r, i) => ({
          slot: r.slot,
          wallet: r.wallet,
          accountNumber: r.account_number,
          accountName: r.account_name,
          qrUrl: r.qr_url,
          isDefault: i === 0,
        }))
      setBiz({
        name: (data.name as string | null) ?? 'Mi negocio',
        accent: data.accent_color ? `#${data.accent_color}` : ACCENT_DEFAULT,
        paymentQrs,
        capability: (data.primary_capability as BusinessPrimaryCapability | null) ?? null,
        until: (data.accepting_orders_until as string | null) ?? null,
        blocked: (data.is_blocked as boolean | null) ?? false,
        reason: (data.block_reason as string | null) ?? null,
      })
    }
  }, [])

  const { setChannelState, refetchIntervalMs } = useChannelHealth()

  /**
   * DOS CONSULTAS, PORQUE SON DOS COSAS CON REGLAS DISTINTAS.
   *
   * Era una sola: "las 100 más recientes", sin filtro de negocio ni de fecha. De
   * ahí salían los dos defectos que esto arregla:
   *
   *   · El contador rotulado "entregados hoy" no contaba hoy: contaba TODOS los
   *     entregados que cupieran en esas 100 filas. En producción decía 80 cuando
   *     lo de hoy eran 0, y el más viejo que sumaba era de doce días antes. Peor
   *     todavía, habría dejado de moverse al llegar a 100 sin avisar de nada.
   *   · El chip "Entregados" contaba una cosa (solo `delivered`, sin recortar) y
   *     la lista de debajo enseñaba otra (`delivered` + `cancelled`, recortada a
   *     40). Dos números distintos para el mismo conjunto.
   *
   * Se arregla el DATO, no el contador: si lo que se trae ya es la jornada, el
   * contador es correcto por construcción y la vista no necesita saber nada de
   * fechas.
   *
   * ACTIVOS: sin ventana de tiempo, a propósito. Un pedido vivo tiene que verse
   * aunque lleve dos días atascado — es justo entonces cuando más importa. El
   * `limit(100)` es una barandilla que no debería tocar nunca: cien pedidos
   * activos a la vez ya sería la anomalía.
   *
   * CERRADOS: solo los de la jornada en curso (`serviceDate`, que corta a las
   * 05:00 y es espejo de `current_service_date`). Se filtra por `created_at` y
   * no por `delivered_at`/`cancelled_at` porque es UNA columna, tiene índice
   * (`orders_business_idx`) y —con el corte a las 05:00— da la misma jornada que
   * la entrega para cualquier pedido real: nadie crea a las 04:50 y entrega a
   * las 05:10.
   *
   * Y LAS DOS FILTRAN POR `business_id`. Antes se confiaba solo en la RLS, y
   * `ord_admin_all` es `for all`: el día que esta cuenta reciba también el rol
   * admin —ya pasó con `businesses`, ver `refetchBiz`— el tablero enseñaría
   * pedidos de otros negocios. Decirlo en la consulta lo hace correcto para
   * cualquier combinación de roles.
   */
  const fetchOrdersQuery = useCallback(async () => {
    if (!bizId) return [] as OrderRow[]
    const supabase = getSupabaseBrowser()
    const desdeLaJornada = serviceDayStart()

    const [activos, cerrados] = await Promise.all([
      supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('business_id', bizId)
        .in('status', ACTIVE_ORDER_STATUSES)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('business_id', bizId)
        .in('status', ['delivered', 'cancelled'])
        .gte('created_at', desdeLaJornada)
        .order('created_at', { ascending: false })
        .limit(200),
    ])

    const fetched = [
      ...((activos.data ?? []) as unknown as OrderRow[]),
      ...((cerrados.data ?? []) as unknown as OrderRow[]),
    ]
    setRows(fetched)
    return fetched
  }, [bizId])

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
    let activeChannel: ReturnType<typeof supabase.channel> | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let retryAttempt = 0
    let destroyed = false
    /**
     * ¿Este `SUBSCRIBED` es el primero o una RECONEXIÓN?
     *
     * Importa porque un canal que vuelve no trae lo que se perdió mientras
     * estuvo caído: `postgres_changes` no reenvía nada, empieza a escuchar
     * desde el momento en que se suscribe. Con el backoff llegando a 30s, el
     * agujero es de hasta medio minuto de cambios invisibles, y hasta ahora
     * solo lo cerraba el siguiente tick del poll.
     *
     * En el PRIMER `SUBSCRIBED` no hay nada que recuperar: `usePolledQuery` ya
     * hizo la carga inicial. Refrescar ahí sería una petición de más en cada
     * arranque.
     */
    let reconnecting = false

    function subscribeChannel() {
      if (destroyed) return
      if (activeChannel) {
        supabase.removeChannel(activeChannel)
        activeChannel = null
      }

      // Nombre único POR APERTURA, y aquí importa más que en ningún otro sitio:
      // esta función ES la reconexión. Acaba de pedir la baja del canal anterior,
      // pero `removeChannel` es asíncrono, así que pedir `biz-orders-${bizId}`
      // otra vez devolvía ESE, todavía conectado, y el `.on()` lanzaba — o sea
      // que cada reintento moría justo cuando la conexión ya iba mal.
      // Ver `canalUnico` en `@tindivo/supabase`.
      const channel = supabase
        .channel(canalUnico(`biz-orders-${bizId}`))
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
          // Recuperar el hueco: ver `reconnecting`.
          if (reconnecting) {
            reconnecting = false
            void refetchOrders({ force: true })
            void refetchBiz()
          }
          console.log(
            '[realtime] suscrito a',
            `biz-orders-${bizId}`,
            'Salud:',
            'healthy (30s polling)',
          )
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
          const delayMs = getBackoffDelayMs(retryAttempt)
          retryAttempt++
          reconnecting = true
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
  }, [
    bizId,
    debouncedRefetchOrders,
    debouncedRefetchBiz,
    refetchOrders,
    refetchBiz,
    setChannelState,
  ])

  // Los plazos que decide `app_settings.timers` (0174). Sin esto el tablero
  // contaba con sus propias constantes, y la cajera podía estar mirando un reloj
  // distinto del que usa la base para cancelarle el pedido.
  const timers = useBusinessTimers()
  const vms = useMemo(() => rows.map((r) => toOrderVM(r, now, timers)), [rows, now, timers])
  const counts = useMemo(() => {
    const n = { new: 0, cooking: 0, route: 0, delivered: 0, cancelled: 0 }
    for (const v of vms) {
      const col = getColumn(v.status)
      if (col === 'nuevos') n.new++
      else if (col === 'cocina') n.cooking++
      else if (col === 'reparto') n.route++
      if (v.status === 'delivered') n.delivered++
      else if (v.status === 'cancelled') n.cancelled++
    }
    return n
  }, [vms])

  // Tick inteligente: solo si alguna tarjeta tiene un reloj que mover.
  //
  // La condición vive en `needsClockTick`, al lado de quien decide qué tarjeta
  // lleva reloj: estaba aquí escrita a mano y se le quedó fuera el mostrador
  // (`awaiting_customer`), o sea que ese contador se congelaba en cuanto no
  // quedaba ningún otro pedido vivo en el tablero.
  const needsTickRef = useRef(false)
  const lastExpireTriggerRef = useRef<number>(0)

  useEffect(() => {
    needsTickRef.current = vms.some(needsClockTick)
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
      // Pase lo que pase se refresca: si el RPC canceló algo, para verlo; si
      // falló, porque el tablero no puede quedarse con las tarjetas vencidas.
      // Va con los dos callbacks de `then` y no con `.catch`: el builder de
      // PostgREST es un `PromiseLike`, no una Promise, y no expone `.catch`
      // (antes lo tapaba el `as any` sobre el cliente).
      supabase.rpc('cancel_expired_prepay_orders').then(
        () => {
          debouncedRefetchOrders()
        },
        () => {
          debouncedRefetchOrders()
        },
      )
    }
  }, [vms, debouncedRefetchOrders])

  const paused = isBusinessPaused(biz.until, now)
  const pauseMin = pauseMinutesLeft(biz.until, now)
  // Los ids, no un booleano: el aviso de llegada es UNO POR PEDIDO y con un
  // `some()` la segunda llegada al mismo local no sonaba nunca. Ver `newArrivals`.
  const waitingIds = useMemo(
    () =>
      vms
        .filter((o) => o.state === 'waiting')
        .map((o) => o.rowId)
        .sort(),
    [vms],
  )
  const hasBufferP3 = vms.some(
    (o) =>
      (o.state === 'buffer_p2' || o.state === 'buffer_p3') &&
      (o.comidaLista || (o.readySec != null && o.readySec < 0) || o.readySec == null),
  )
  // LA MISMA EXPRESIÓN QUE ENCIENDE EL SONIDO Y QUE PINTA EL BANNER.
  //
  // Estaba aquí como filtro suelto, y el banner no existía: el sonido era global
  // y lo visible vivía solo en `app/page.tsx`. Eso costó `JMAXL98Z` en
  // producción. Ver `lib/orders/attention.ts`.
  const attention = useMemo(() => attentionState(vms), [vms])

  // LO QUE SE ESCAPÓ. Vive en el chrome, como el sonido y el banner, porque un
  // pedido se puede morir mientras la cajera teclea una comanda en `/nuevo` —de
  // hecho es EL caso—, y ahí el tablero no está montado. Ver `lost-sales.ts`.
  const { pending: ventasPerdidas, dismiss: cerrarVentasPerdidas } = useLostSales(vms)

  // Sonido persistente (corre en el chrome → suena en cualquier sección).
  const alarmaPendiente = attention.alarm.hasPending
  useDashboardSounds({
    hasPending: attention.alarm.hasPending,
    pendingCount: attention.alarm.count,
    urgent: attention.alarm.urgent,
    waitingIds,
    hasBufferP3,
    soundOn,
  })

  // Pedidos de delivery donde el motorizado cobró distinto de lo pactado
  // (ver `paymentChangeAlert`). Mismo motivo que `waitingIds` para ir por ids
  // y no por un booleano: dos motorizados cambiando el cobro en la misma
  // tanda de pedidos no pueden compartir un solo aviso.
  const paymentChangedAlerts = useMemo(
    () =>
      vms.flatMap((o) => {
        const alert = paymentChangeAlert(o)
        if (!alert) return []
        return [
          {
            id: o.rowId,
            message: `#${o.id} — ${alert.driverName} ha cambiado de método de pago a ${alert.toLabel}`,
          },
        ]
      }),
    [vms],
  )
  usePaymentChangeAlerts(paymentChangedAlerts, soundOn)

  // Petición de apertura desde el banner. Ver `DashboardCtx.openRequestId`.
  const [openRequestId, setOpenRequestId] = useState<string | null>(null)
  const clearOpenRequest = useCallback(() => setOpenRequestId(null), [])
  const requestOpen = useCallback(
    (rowId: string) => {
      setOpenRequestId(rowId)
      // La ficha solo existe en el tablero; desde `/nuevo` o `/menu` hay que
      // volver, y la petición espera montada a que `app/page.tsx` la recoja.
      if (pathname !== '/') router.push('/')
    },
    [pathname, router],
  )

  // Liquidaciones de efectivo por confirmar
  const [pendingCashCount, setPendingCashCount] = useState(0)

  const reloadPendingCash = useCallback(async () => {
    if (!bizId) return
    try {
      const supabase = getSupabaseBrowser()
      const { count, error } = await supabase
        .from('cash_settlements')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_confirmation')
      if (!error && typeof count === 'number') {
        setPendingCashCount(count)
      }
    } catch {}
  }, [bizId])

  useEffect(() => {
    if (!bizId) return
    reloadPendingCash()
    const channel = getSupabaseBrowser()
      .channel(canalUnico('biz-cash-badge'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cash_settlements' }, () =>
        reloadPendingCash(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () =>
        reloadPendingCash(),
      )
      .subscribe()
    return () => {
      getSupabaseBrowser().removeChannel(channel)
    }
  }, [bizId, reloadPendingCash])

  // Se sondea solo mientras hay algo esperando: no hay evento de «el audio se
  // suspendió», y preguntarlo cada dos segundos toda la noche sería sondear por
  // sondear.
  useEffect(() => {
    if (!alarmaPendiente) {
      setAudioBloqueado(false)
      return
    }
    const mirar = () => setAudioBloqueado(audioIsBlocked())
    mirar()
    const t = setInterval(mirar, 2000)
    return () => clearInterval(t)
  }, [alarmaPendiente])

  useEffect(() => {
    if (alarmaPendiente && (!soundOn || audioBloqueado)) setGateShown(true)
  }, [alarmaPendiente, soundOn, audioBloqueado])

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
      paymentQrs: biz.paymentQrs,
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
      enableSound,
      askSoundCheck,
      soundCheckAt,
      refetchOrders,
      refetchBiz,
      signOut: onSignOut,
      attentionCount: attention.orders.length,
      pendingCashCount,
      alarmOn: attention.alarm.hasPending && soundOn,
      openRequestId,
      requestOpen,
      clearOpenRequest,
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
    enableSound,
    askSoundCheck,
    soundCheckAt,
    refetchOrders,
    refetchBiz,
    onSignOut,
    attention,
    pendingCashCount,
    openRequestId,
    requestOpen,
    clearOpenRequest,
  ])

  // La carga TERMINÓ y aun así no hay negocio: eso ya no es "cargando", es un
  // fallo, y merece una pantalla con salida. El esqueleto solo se queda mientras
  // de verdad se está esperando algo.
  if (ready && !value) {
    return (
      <BizLoadError
        reason={bizError}
        onRetry={() => {
          setReady(false)
          refetchBiz().finally(() => setReady(true))
        }}
        onSignOut={onSignOut}
      />
    )
  }

  if (!ready || !value || !fontsReady) return <DashboardSkeleton />

  return (
    <Ctx.Provider value={value}>
      {gateShown && (
        <NotificationGate
          onActivate={handleActivateNotifications}
          urgente={alarmaPendiente && (!soundOn || audioBloqueado)}
        />
      )}
      {soundCheckOpen && <SoundCheck bizName={value.bizName} onDone={onSoundCheckDone} />}
      {/* Encima de todo salvo la prueba que él mismo ofrece: si un pedido se
          murió sin que nadie lo tocara, no hay nada en pantalla más importante
          que contarlo. */}
      {ventasPerdidas.length > 0 && !gateShown && (
        <LostSaleAlert
          perdidas={ventasPerdidas}
          onTestSound={() => {
            cerrarVentasPerdidas()
            askSoundCheck()
          }}
          onDismiss={cerrarVentasPerdidas}
        />
      )}
      <div className="flex flex-1 min-h-0 bg-surface">
        <div className="hidden shrink-0 lg:block h-full">
          <Sidebar active={active} onSignOut={onSignOut} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col min-h-0">
          {/* Header móvil con nombre del local y botón de cerrar sesión (solo en vista principal de pedidos para evitar doble header con DashboardShell) */}
          {active === 'pedidos' && (
            <header className="flex shrink-0 items-center justify-between border-b border-border bg-white px-3.5 py-2.5 lg:hidden">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                  style={{ background: value.accent || ACCENT_DEFAULT }}
                >
                  {value.bizName[0] ?? 'T'}
                </div>
                <span className="truncate font-display text-sm font-bold text-ink">
                  {value.bizName}
                </span>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-danger-soft px-3 py-1.5 text-xs font-semibold text-danger active:scale-95 transition-transform"
              >
                <Icon name="logout" size={16} />
                <span>Cerrar sesión</span>
              </button>
            </header>
          )}

          {/* Va dentro del Provider (necesita el bizId del contexto) y en el
              flujo del layout, para que la franja de estado empuje el
              contenido en vez de taparlo. El modal que renderiza es `fixed`, así
              que no le afecta estar aquí. */}
          {!gateShown && <OpeningControls />}

          {children}
          <div className="lg:hidden">
            <BottomNav active={active} />
          </div>
        </div>
      </div>
      {/* «Ver» ABRE el pedido, no lleva al tablero y se despide. Abrirlo ya no
          calla nada: mientras el pedido siga reclamando, sigue sonando. Ver la
          cabecera de `lib/orders/attention.ts`. */}
      <AttentionBanner vm={attention.banner} onOpen={(o) => requestOpen(o.rowId)} />
      <SuccessToastHost />
      <PaymentChangeAlertHost />
    </Ctx.Provider>
  )
}

// ── Chrome raíz: gate de sesión + chrome persistente ──────────────────────────
export function DashboardChrome({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [authed, setAuthed] = useState(false)

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    // `ready` SE PONE EN TRUE PASE LO QUE PASE.
    //
    // `getSession()` no solo resuelve con `{data: {session: null}}` cuando no hay
    // sesión: si hay un refresh token guardado y el servidor lo rechaza
    // ("Invalid Refresh Token: Refresh Token Not Found"), la promesa REVIENTA.
    // Con `.then()` a secas, `setReady(true)` no llegaba a ejecutarse y la
    // pantalla se quedaba en el esqueleto para siempre, sin login ni error —
    // solo una rejection sin manejar en la consola.
    //
    // Le pasa a cualquiera cuya sesión se invalide: token expirado del lado del
    // servidor, sesión revocada, o un `supabase db reset` que se lleve
    // `auth.users` por delante. La cajera, a media noche y con el cliente al
    // teléfono, se queda mirando un esqueleto sin forma de salir salvo borrar
    // los datos del sitio.
    //
    // Un fallo al recuperar la sesión ES no tener sesión: se muestra el login.
    supabase.auth
      .getSession()
      .then(({ data }) => setAuthed(!!data.session))
      .catch(() => setAuthed(false))
      .finally(() => setReady(true))
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
        await signOutDevice()
        setAuthed(false)
      }}
    >
      {children}
    </AuthedChrome>
  )
}
