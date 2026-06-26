'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { MS } from './primitives'

// El chrome (sidebar + bottom-nav + auth + contexto + realtime + sonido) vive ahora
// en el layout (components/dashboard/chrome.tsx) y persiste entre secciones. Este
// `DashboardShell` es solo el cromo PER-PÁGINA: topbar (título/subtítulo) + scroll.
export type { NavId } from './chrome'
export { useDashboard } from './chrome'

/**
 * @deprecated El sidebar real vive en el chrome (components/dashboard/chrome.tsx) y
 * persiste en el layout. Este stub mantiene la compatibilidad del editor de ítems de
 * menú (que tenía su propio cromo full-screen) sin duplicar el sidebar: renderiza null.
 */
export function DashboardSidebar(_props: {
  active?: string
  bizName?: string
  accent?: string
  pedidosBadge?: number
  onSignOut?: () => void
}): null {
  return null
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

// ── Shell per-página (topbar + área de contenido scrolleable) ──────────────────
// `active` se conserva por compatibilidad de llamadas; el resaltado del sidebar lo
// deriva el chrome desde la ruta (usePathname), así que aquí se ignora.
export function DashboardShell({
  title,
  subtitle,
  headerRight,
  children,
}: {
  /** Conservado por compatibilidad de llamadas; el activo lo deriva el chrome por ruta. */
  active?: string
  title: string
  subtitle?: string
  headerRight?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col" style={{ flex: 1, minHeight: 0 }}>
      <div className="hidden lg:block">
        <DesktopTopBar title={title} subtitle={subtitle} right={headerRight} />
      </div>
      <div className="lg:hidden">
        <MobileTopBar title={title} subtitle={subtitle} right={headerRight} />
      </div>
      <div className="tv-scroll p-3.5 lg:px-6 lg:py-5" style={{ flex: 1, overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  )
}
