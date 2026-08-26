'use client'

import { GlassTopBar, Icon } from '@tindivo/ui'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { useCashSummary } from '@/features/efectivo/hooks/use-cash-summary'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { BottomNav, type BottomNavItem } from './bottom-nav'
import { CapacityIndicator } from './capacity-indicator'
import { DriverToastHost } from './driver-toast'
import { ShiftStatus } from './shift-status'

/** «Jesús Castillo Vidal» → «JC». Con un solo nombre, una sola letra. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return `${parts[0]?.charAt(0) ?? ''}${parts[1]?.charAt(0) ?? ''}`.toUpperCase()
}

/**
 * Shell de la app del motorizado: barra de turno arriba, navegación abajo.
 *
 * YA NO HAY «MÁS». Ese botón abría un `BottomSheet` con tres cosas:
 * Restaurantes, Mi Perfil y cerrar sesión. Las dos primeras son DESTINOS, no
 * ajustes, así que suben a la barra como «Locales» y como la pestaña «Tú» con
 * el avatar; la tercera ya vivía en /perfil, junto a los dos interruptores y a
 * la salida de emergencia. El sheet era una capa de más para llegar a sitios
 * que ahora están a un toque, y de paso el perfil tenía dos puertas (el círculo
 * gris de la cabecera y el menú) en vez de una.
 *
 * El nombre del motorizado se lee AQUÍ y no en la home porque ahora lo usan dos
 * cosas de la shell: el saludo del turno y las iniciales del avatar. Antes lo
 * pedía `Home` para escribir «Hola, X» encima de la bandeja.
 */
export function DriverShell({ children }: { children: ReactNode }) {
  const { businesses } = useCashSummary()
  const [driverName, setDriverName] = useState<string | null>(null)

  useEffect(() => {
    getSupabaseBrowser()
      .from('drivers')
      .select('full_name')
      .maybeSingle()
      .then(({ data }) => setDriverName(data?.full_name ?? null))
  }, [])

  // Conteo de pedidos en efectivo pendientes de liquidar por el motorizado
  const pendingCashCount = useMemo(
    () => businesses.flatMap((b) => b.orders.filter((o) => o.state === 'pending')).length,
    [businesses],
  )

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
      { href: '/restaurantes', label: 'Locales', icon: 'storefront' },
      {
        href: '/perfil',
        label: 'Tú',
        // Sin nombre todavía no hay iniciales que pintar: la pestaña cae al
        // icono de persona hasta que la consulta resuelve.
        icon: 'person',
        initials: driverName ? initialsOf(driverName) : undefined,
      },
    ],
    [pendingCashCount, driverName],
  )

  return (
    <div className="min-h-dvh bg-surface pb-24">
      <DriverToastHost />
      <GlassTopBar
        // `h-10` fija la altura de la cabecera en los mismos 64px que tenía con
        // el botón de perfil de 40px, así que los `pt-20` y los `sticky top-…`
        // de las pantallas siguen cuadrando sin tocarlos.
        left={
          <div className="flex h-10 min-w-0 items-center gap-2.5">
            <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px] bg-[linear-gradient(135deg,var(--color-brand),var(--gradient-brand-to))] text-white">
              <Icon name="two_wheeler" size={19} aria-label="Tindivo Motorizado" />
            </span>
            <ShiftStatus name={driverName} />
          </div>
        }
        right={<CapacityIndicator />}
      />
      {children}
      <BottomNav items={navItems} />
    </div>
  )
}
