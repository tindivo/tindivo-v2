'use client'

import { cn, Icon } from '@tindivo/ui'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type BottomNavItem = {
  href: string
  label: string
  icon: string
  badge?: number | null
}

export interface BottomNavProps {
  items: BottomNavItem[]
  className?: string
}

/**
 * Bottom navigation principal del driver.
 * Inspirado en tindivo-delivery: pill activa con gradiente brand, badge numérico,
 * esquinas superiores redondeadas y glass sutil.
 */
export function BottomNav({ items, className }: BottomNavProps) {
  const pathname = usePathname()

  let activeHref: string | null = null
  for (const item of items) {
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`)
    if (matches && (!activeHref || item.href.length > activeHref.length)) {
      activeHref = item.href
    }
  }

  return (
    <nav
      aria-label="Navegación principal"
      className={cn(
        'fixed bottom-0 left-0 right-0 z-30 flex items-stretch gap-1 px-3 backdrop-blur-2xl',
        className,
      )}
      style={{
        background: 'rgba(255, 255, 255, 0.82)',
        borderTopLeftRadius: '32px',
        borderTopRightRadius: '32px',
        boxShadow: '0 -4px 30px rgba(26, 22, 20, 0.08)',
        paddingTop: '14px',
        paddingBottom: 'calc(14px + env(safe-area-inset-bottom))',
      }}
    >
      {items.map((item) => {
        const active = item.href === activeHref
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex flex-1 flex-col items-center justify-center transition-all duration-300 active:scale-90',
              active
                ? 'bg-gradient-to-br from-brand to-brand-dark text-white shadow-glow-brand'
                : 'text-ink-muted',
            )}
            style={{
              borderRadius: '22px',
              padding: '10px 6px',
            }}
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
                  className="absolute -top-1.5 -right-2 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-black leading-none"
                  style={{
                    background: active ? '#ffffff' : '#f97316',
                    color: active ? '#f97316' : '#ffffff',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
                    border: active ? '1.5px solid #f97316' : '1.5px solid #ffffff',
                  }}
                >
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </span>
            <span
              className="mt-[5px] whitespace-nowrap text-[10px] font-semibold uppercase"
              style={{ letterSpacing: '0.08em', opacity: active ? 1 : 0.75 }}
            >
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
