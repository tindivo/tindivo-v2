'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { MS } from './primitives'

// ── Contexto del dashboard (negocio actual) ──────────────────────────────────
interface DashboardCtx {
  bizId: string
  bizName: string
  accent: string
}
const Ctx = createContext<DashboardCtx | null>(null)
export function useDashboard(): DashboardCtx {
  const v = useContext(Ctx)
  if (!v) throw new Error('useDashboard fuera de DashboardShell')
  return v
}

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

// ── Sidebar (desktop) ─────────────────────────────────────────────────────────
export function DashboardSidebar({
  active,
  bizName,
  accent,
  pedidosBadge,
  paused = false,
  onSignOut,
}: {
  active: NavId
  bizName: string
  accent: string
  pedidosBadge?: number
  paused?: boolean
  onSignOut: () => void
}) {
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
            fontFamily: "var(--font-bricolage), 'Bricolage Grotesque', sans-serif",
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
          const badge = it.id === 'pedidos' ? pedidosBadge : undefined
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

// ── Bottom nav (mobile) ───────────────────────────────────────────────────────
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

export function DashboardBottomNav({ active }: { active: NavId }) {
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

// ── Topbars ───────────────────────────────────────────────────────────────────
function DesktopTopBar({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <div
      className="tv-glass"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 8,
        padding: '14px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <div style={{ flex: 1 }}>
        <div className="tv-display" style={{ fontSize: 22, lineHeight: 1.1 }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 13, color: 'var(--tv-ink-muted)', marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
      {right}
    </div>
  )
}

function MobileTopBar({
  title,
  subtitle,
  right,
}: {
  title: string
  subtitle?: string
  right?: ReactNode
}) {
  return (
    <div
      className="tv-glass"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Link
        href="/"
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: 'rgba(26,22,20,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          color: 'var(--tv-ink)',
        }}
      >
        <MS name="arrow_back" size={20} />
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="tv-display" style={{ fontSize: 18, lineHeight: 1.1 }}>
          {title}
        </div>
        {subtitle && (
          <div className="tv-label" style={{ marginTop: 2 }}>
            {subtitle}
          </div>
        )}
      </div>
      {right}
    </div>
  )
}

// ── Shell estándar (vistas que no son Pedidos) ───────────────────────────────
export function DashboardShell({
  active,
  title,
  subtitle,
  headerRight,
  children,
}: {
  active: NavId
  title: string
  subtitle?: string
  headerRight?: ReactNode
  children: ReactNode
}) {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [ctx, setCtx] = useState<DashboardCtx | null>(null)
  const [pending, setPending] = useState(0)

  useEffect(() => {
    const supabase = getSupabaseBrowser()
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/')
        return
      }
      const { data: biz } = await supabase
        .from('businesses')
        .select('id,name,accent_color')
        .maybeSingle()
      if (biz?.id) {
        setCtx({
          bizId: biz.id,
          bizName: biz.name ?? 'Mi negocio',
          accent: biz.accent_color ? `#${biz.accent_color}` : ACCENT_DEFAULT,
        })
        const { count } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', biz.id)
          .eq('status', 'pending_acceptance')
        setPending(count ?? 0)
      }
      setReady(true)
    })
  }, [router])

  async function signOut() {
    await getSupabaseBrowser().auth.signOut()
    router.replace('/')
  }

  if (!ready || !ctx) return <div className="p-10 text-ink-muted">Cargando…</div>

  // Children se renderizan UNA sola vez; el chrome (sidebar/topbar/bottom-nav) se
  // muestra por breakpoint. Evita doble-montaje de efectos (realtime/fetch).
  return (
    <Ctx.Provider value={ctx}>
      <div className="flex" style={{ height: '100dvh', background: 'var(--tv-surface)' }}>
        <div className="hidden shrink-0 lg:block">
          <DashboardSidebar
            active={active}
            bizName={ctx.bizName}
            accent={ctx.accent}
            pedidosBadge={pending}
            onSignOut={signOut}
          />
        </div>
        <div className="flex flex-col" style={{ flex: 1, minWidth: 0, height: '100dvh' }}>
          <div className="hidden lg:block">
            <DesktopTopBar title={title} subtitle={subtitle} right={headerRight} />
          </div>
          <div className="lg:hidden">
            <MobileTopBar title={title} subtitle={subtitle} right={headerRight} />
          </div>
          <div className="tv-scroll p-3.5 lg:px-6 lg:py-5" style={{ flex: 1, overflowY: 'auto' }}>
            {children}
          </div>
          <div className="lg:hidden">
            <DashboardBottomNav active={active} />
          </div>
        </div>
      </div>
    </Ctx.Provider>
  )
}
