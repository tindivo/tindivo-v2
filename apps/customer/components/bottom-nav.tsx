'use client'

import { Icon } from '@tindivo/ui'
import Link from 'next/link'
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

  return (
    <nav className="fixed right-0 bottom-0 left-0 z-40 border-t border-border bg-white pb-safe lg:hidden">
      <div className="mx-auto flex max-w-[768px] items-center justify-around">
        {ROUTES.map((route) => {
          const active = pathname === route.href
          const isOrders = route.href === '/pedidos'
          return (
            <Link
              key={route.href}
              href={route.href}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 transition-colors ${
                active ? 'text-brand' : 'text-ink-subtle'
              }`}
            >
              <span className="relative">
                <Icon
                  name={route.icon}
                  size={24}
                  className={active ? 'text-brand' : 'text-ink-subtle'}
                />
                {isOrders && activeCount > 0 && (
                  <span className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                    {activeCount > 9 ? '9+' : activeCount}
                  </span>
                )}
              </span>
              <span className="text-[11px] font-medium">{route.label}</span>
              {active && <span className="absolute top-0 h-[2px] w-8 rounded-b-full bg-brand" />}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
