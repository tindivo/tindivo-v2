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
import { OpeningControls } from '@/features/apertura/components/opening-controls'
import { AttentionBanner } from '@/features/pedidos/components/attention-banner'
import { getBackoffDelayMs, useChannelHealth } from '@/hooks/use-channel-health'
import { useIconFontReady } from '@/hooks/use-icon-font-ready'
import { usePolledQuery } from '@/hooks/use-polled-query'
import { useBusinessTimers } from '@/hooks/use-queue-lead'
import { attentionState } from '@/lib/orders/attention'
import {
  getColumn,
  isBusinessPaused,
  ORDER_SELECT,
  type OrderRow,
  type OrderVM,
  pauseMinutesLeft,
  toOrderVM,
} from '@/lib/orders/view-model'
import { signOutDevice } from '@/lib/sign-out'
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
  const { bizName, accent, capability, paused, counts, soundOn, toggleSound } = useDashboard()
  const catalogOnly = capability === 'catalog_only'
  // Excepción (DECISIONS §18): con pedidos delivery en vuelo (de antes del
  // cambio de modo), Pedidos sigue accesible desde la nav para no perderlos.
  const hasActiveOrders = counts.new + counts.cooking + counts.route > 0
  const catalogNav: NavId[] = hasActiveOrders ? ['pedidos', ...CATALOG_ONLY_NAV] : CATALOG_ONLY_NAV
  const navItems = catalogOnly ? NAV_ITEMS.filter((it) => catalogNav.includes(it.id)) : NAV_ITEMS
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
  const { capability, counts, soundOn, toggleSound, signOut, bizName } = useDashboard()
  const [moreOpen, setMoreOpen] = useState(false)
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
          <Icon name="payments" size={22} filled={active === 'efectivo'} />
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
        <BottomSheet open onClose={() => setMoreOpen(false)}>
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

  const { setChannelState, refetchIntervalMs, healthStatus } = useChannelHealth()

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
    let activeChannel: any = null
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
  // LA MISMA EXPRESIÓN QUE ENCIENDE EL SONIDO Y QUE PINTA EL BANNER.
  //
  // Estaba aquí como filtro suelto, y el banner no existía: el sonido era global
  // y lo visible vivía solo en `app/page.tsx`. Eso costó `JMAXL98Z` en
  // producción. Ver `lib/orders/attention.ts`.
  const attention = useMemo(() => attentionState(vms), [vms])

  // Sonido persistente (corre en el chrome → suena en cualquier sección).
  useDashboardSounds({
    hasPending: attention.hasPending,
    pendingCount: attention.pendingCount,
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
      refetchOrders,
      refetchBiz,
      signOut: onSignOut,
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
    onSignOut,
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
      <AttentionBanner vm={attention.banner} />
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
