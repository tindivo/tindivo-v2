'use client'

import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type BottomNavItem = {
  href?: string
  onClick?: () => void
  label: string
  icon: string
  badge?: number | null
  badgeColor?: 'danger' | 'brand'
  active?: boolean
}

export interface BottomNavProps {
  items: BottomNavItem[]
  className?: string
}

/**
 * Navegación inferior flotante (pill) del motorizado.
 * Soporta tanto enlaces directos (Link) como botones de acción (ej. modal "Más").
 */
export function BottomNav({ items, className }: BottomNavProps) {
  const pathname = usePathname()

  let activeHref: string | null = null
  for (const item of items) {
    if (item.href) {
      const matches =
        pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`))
      if (matches && (!activeHref || item.href.length > activeHref.length)) {
        activeHref = item.href
      }
    }
  }

  return (
    <nav
      aria-label="Navegación principal"
      className={`fixed bottom-0 left-0 right-0 z-30 flex items-stretch gap-1 px-3 backdrop-blur-2xl bg-white/[0.85] rounded-t-[32px] pt-3.5 shadow-[0_-4px_30px_rgba(26,22,20,0.08)] pb-[max(14px,env(safe-area-inset-bottom))] ${
        className ?? ''
      }`}
    >
      {items.map((item) => {
        const active =
          item.active !== undefined ? item.active : item.href ? item.href === activeHref : false

        const content = (
          <>
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
                  className={`absolute -top-1.5 -right-2 inline-flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full border-[1.5px] px-1 text-[10px] font-black leading-none shadow-xs ${
                    item.badgeColor === 'danger'
                      ? 'border-white bg-danger text-white'
                      : active
                        ? 'border-white bg-white text-brand'
                        : 'border-white bg-brand text-white'
                  }`}
                >
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </span>
            <span
              className={`mt-[5px] whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.08em] ${
                active ? 'opacity-100' : 'opacity-75'
              }`}
            >
              {item.label}
            </span>
          </>
        )

        const baseClass = `flex flex-1 flex-col items-center justify-center rounded-[22px] p-2.5 transition-all duration-300 active:scale-90 cursor-pointer ${
          active
            ? 'bg-[linear-gradient(135deg,var(--color-brand),var(--gradient-brand-to))] text-white shadow-glow-brand'
            : 'text-ink-muted hover:text-ink'
        }`

        if (item.onClick) {
          return (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              aria-current={active ? 'page' : undefined}
              className={baseClass}
            >
              {content}
            </button>
          )
        }

        return (
          <Link
            key={item.href ?? item.label}
            href={item.href ?? '/'}
            aria-current={active ? 'page' : undefined}
            className={baseClass}
          >
            {content}
          </Link>
        )
      })}
    </nav>
  )
}
