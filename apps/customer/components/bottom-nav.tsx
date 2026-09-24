'use client'

import { BottomNav as BottomNavPattern } from '@tindivo/ui'
import { usePathname } from 'next/navigation'
import { useActiveCourierOrders } from '@/lib/active-courier-orders'
import { useActiveOrders } from '@/lib/active-orders'

const ROUTES = [
  { href: '/', label: 'Inicio', icon: 'home' },
  { href: '/pedidos', label: 'Pedidos', icon: 'receipt_long' },
  { href: '/cuenta', label: 'Cuenta', icon: 'person' },
] as const

export function BottomNav() {
  const pathname = usePathname()
  const activeOrders = useActiveOrders()
  // El badge de "Pedidos" suma las dos cosas: un cliente puede tener a la vez
  // un pedido a un restaurante Y una entrega de Tindivo Entregas en curso
  // (DECISIONS §31 — no comparten el guard de "un pedido activo").
  const activeCourierOrders = useActiveCourierOrders()
  const activeCount = activeOrders.length + activeCourierOrders.length

  const isVisible = ROUTES.some((r) => r.href === pathname)
  if (!isVisible) return null

  const items = ROUTES.map((route) => ({
    ...route,
    badge: route.href === '/pedidos' ? activeCount : undefined,
  }))

  return <BottomNavPattern items={items} variant="default" />
}
