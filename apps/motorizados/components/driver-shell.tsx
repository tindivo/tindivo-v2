'use client'

import { GlassTopBar, Icon } from '@tindivo/ui'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { BottomNav, type BottomNavItem } from './bottom-nav'
import { CapacityIndicator } from './capacity-indicator'

const NAV_ITEMS: BottomNavItem[] = [
  { href: '/', label: 'Pedidos', icon: 'receipt_long' },
  { href: '/efectivo', label: 'Efectivo', icon: 'payments' },
  { href: '/historial', label: 'Historial', icon: 'history' },
  { href: '/perfil', label: 'Perfil', icon: 'person' },
]

/**
 * Shell de la app del motorizado: glass top bar + bottom navigation.
 * Inspirado en tindivo-delivery, adaptado a la arquitectura de tindivo-v2.
 */
export function DriverShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-surface pb-28">
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
      <BottomNav items={NAV_ITEMS} />
    </div>
  )
}
