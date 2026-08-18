'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '../lib/cn'
import { Icon } from '../primitives/icon'

export type BottomNavItem = {
  href: string
  label: string
  icon: string
  badge?: number | null
  badgeColor?: 'danger' | 'brand'
}

export interface BottomNavProps {
  items: BottomNavItem[]
  variant?: 'default' | 'pill'
  className?: string
}

/**
 * Navegación inferior principal.
 *
 * - `default`: barra limpia con borde superior, indicador de pestaña activa.
 * - `pill`: contenedor flotante con esquinas redondeadas y pill activa con
 *   gradiente brand. Más prominente, ideal para apps de staff/driver.
 */
export function BottomNav({ items, variant = 'default', className }: BottomNavProps) {
  const pathname = usePathname()

  let activeHref: string | null = null
  for (const item of items) {
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`)
    if (matches && (!activeHref || item.href.length > activeHref.length)) {
      activeHref = item.href
    }
  }

  if (variant === 'pill') {
    return (
      <nav
        aria-label="Navegación principal"
        className={cn(
          'fixed bottom-0 left-0 right-0 z-30 flex items-stretch gap-1 px-3 backdrop-blur-2xl',
          'bg-white/[0.82] rounded-t-[32px] pt-3.5 shadow-[0_-4px_30px_rgba(26,22,20,0.08)]',
          'pb-[max(14px,env(safe-area-inset-bottom))]',
          className,
        )}
      >
        {items.map((item) => {
          const active = item.href === activeHref
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center justify-center rounded-[22px] p-2.5 transition-all duration-300 active:scale-90',
                active
                  ? 'bg-[linear-gradient(135deg,var(--color-brand),var(--gradient-brand-to))] text-white shadow-glow-brand'
                  : 'text-ink-muted',
              )}
            >
              <span className="relative inline-flex items-center justify-center">
                <Icon
                  name={item.icon}
                  size={24}
                  filled={active}
                  weight={active ? 500 : 400}
                  className="leading-none"
                />
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span
                    role="status"
                    aria-label={`${item.badge} pendientes`}
                    className={cn(
                      'absolute -top-1.5 -right-2.5 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full border-[1.5px] px-1 text-[10px] font-black leading-none shadow-sm',
                      item.badgeColor === 'brand'
                        ? active
                          ? 'border-white bg-white text-brand'
                          : 'border-white bg-brand text-white'
                        : 'border-white bg-danger text-white',
                    )}
                  >
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'mt-[5px] whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em]',
                  active ? 'opacity-100' : 'opacity-75',
                )}
              >
                {item.label}
              </span>
            </Link>
          )
        })}
      </nav>
    )
  }

  return (
    <nav
      aria-label="Navegación principal"
      className={cn(
        'fixed right-0 bottom-0 left-0 z-40 border-t border-border bg-white pb-safe lg:hidden',
        className,
      )}
      style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-[768px] items-center justify-around">
        {items.map((item) => {
          const active = item.href === activeHref
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex flex-1 flex-col items-center gap-0.5 py-2.5 transition-colors',
                active ? 'text-brand' : 'text-ink-subtle',
              )}
            >
              <span className="relative">
                <Icon
                  name={item.icon}
                  size={24}
                  className={active ? 'text-brand' : 'text-ink-subtle'}
                />
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </span>
              <span className="text-[11px] font-medium">{item.label}</span>
              {active && <span className="absolute top-0 h-[2px] w-8 rounded-b-full bg-brand" />}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
