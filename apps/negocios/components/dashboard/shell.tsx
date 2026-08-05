'use client'

import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import type { ReactNode } from 'react'

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
    <header className="sticky top-0 z-8 flex items-center gap-4 border-b border-ink/[0.06] bg-white/82 px-6 py-3.5 backdrop-blur-md">
      <div className="flex-1">
        <h1 className="font-display text-[22px] font-bold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-muted">{subtitle}</p>}
      </div>
      {right}
    </header>
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
    <header className="sticky top-0 z-10 flex items-center gap-2.5 border-b border-ink/[0.06] bg-white/82 px-3.5 py-3 backdrop-blur-md">
      <Link
        href="/"
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-ink/[0.06] text-ink"
        aria-label="Volver"
      >
        <Icon name="arrow_back" size={20} />
      </Link>
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-lg font-bold leading-tight tracking-tight">{title}</h1>
        {subtitle && (
          <p className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {subtitle}
          </p>
        )}
      </div>
      {right}
    </header>
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="hidden lg:block">
        <DesktopTopBar title={title} subtitle={subtitle} right={headerRight} />
      </div>
      <div className="lg:hidden">
        <MobileTopBar title={title} subtitle={subtitle} right={headerRight} />
      </div>
      <main className="flex-1 overflow-y-auto p-3.5 lg:px-6 lg:py-5">{children}</main>
    </div>
  )
}
