'use client'

import { GlassTopBar, Icon } from '@tindivo/ui'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type ReactNode, useMemo, useState } from 'react'
import { useCashSummary } from '@/features/efectivo/hooks/use-cash-summary'
import { BottomNav, type BottomNavItem } from './bottom-nav'
import { CapacityIndicator } from './capacity-indicator'
import { DriverToastHost } from './driver-toast'
import { MoreSheet } from './more-sheet'

/**
 * Shell de la app del motorizado: glass top bar + bottom navigation + MoreSheet modal.
 * Inspirado en tindivo-delivery, adaptado a la arquitectura de tindivo-v2.
 */
export function DriverShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { businesses } = useCashSummary()
  const [moreOpen, setMoreOpen] = useState(false)

  // Conteo de pedidos en efectivo pendientes de liquidar por el motorizado
  const pendingCashCount = useMemo(
    () => businesses.flatMap((b) => b.orders.filter((o) => o.state === 'pending')).length,
    [businesses],
  )

  const isMoreActive = pathname === '/perfil' || pathname === '/restaurantes' || moreOpen

  const navItems: BottomNavItem[] = useMemo(
    () => [
      { href: '/', label: 'Pedidos', icon: 'receipt_long' },
      {
        href: '/efectivo',
        label: 'Efectivo',
        icon: 'payments',
        badge: pendingCashCount > 0 ? pendingCashCount : undefined,
        badgeColor: 'danger',
      },
      { href: '/historial', label: 'Historial', icon: 'history' },
      {
        onClick: () => setMoreOpen(true),
        label: 'Más',
        icon: 'more_horiz',
        active: isMoreActive,
      },
    ],
    [pendingCashCount, isMoreActive],
  )

  return (
    <div className="min-h-dvh bg-surface pb-28">
      <DriverToastHost />
      <GlassTopBar
        title="TINDIVO"
        subtitle="Motorizado"
        left={
          <Link
            href="/perfil"
            aria-label="Mi perfil"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-ink/[0.06] text-ink transition-colors hover:bg-ink/[0.1] active:scale-[0.97]"
          >
            <Icon name="person" size={22} />
          </Link>
        }
        right={<CapacityIndicator />}
      />
      {children}
      <BottomNav items={navItems} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} activePath={pathname} />
    </div>
  )
}
