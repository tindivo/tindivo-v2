'use client'

import { BottomNav as BottomNavPattern } from '@tindivo/ui'
import { usePathname } from 'next/navigation'
import { useActiveOrders } from '@/features/catalog/hooks/use-active-order'

const ROUTES = [
  { href: '/', label: 'Inicio', icon: 'home' },
  { href: '/pedidos', label: 'Pedidos', icon: 'receipt_long' },
  { href: '/cuenta', label: 'Cuenta', icon: 'person' },
] as const

export function BottomNav() {
  const pathname = usePathname()
  const activeOrders = useActiveOrders()
  const activeCount = activeOrders.length

  const isVisible = ROUTES.some((r) => r.href === pathname)
  if (!isVisible) return null

  const items = ROUTES.map((route) => ({
    ...route,
    badge: route.href === '/pedidos' ? activeCount : undefined,
  }))

  return <BottomNavPattern items={items} variant="default" />
}
