'use client'

import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type BottomNavItem = {
  href?: string
  onClick?: () => void
  label: string
  icon: string
  /**
   * Iniciales del motorizado. Cuando vienen, la pestaña pinta su avatar en vez
   * del icono: es la pestaña «Tú», y una cara identifica mejor que un glifo.
   */
  initials?: string
  badge?: number | null
  badgeColor?: 'danger' | 'brand'
  active?: boolean
}

export interface BottomNavProps {
  items: BottomNavItem[]
  className?: string
}

/**
 * TOPE DEL BADGE. Nueve liquidaciones pendientes y doce no son la misma noche,
 * y el «9+» de antes borraba justo el dato por el que se entra a esa pantalla.
 * Con dos cifras el badge sigue cabiendo sin empujar al icono de al lado.
 */
const BADGE_MAX = 99

/**
 * Navegación inferior del motorizado.
 *
 * EL ACTIVO NO PINTA SUPERFICIE, y ese es el cambio. Antes la pestaña activa
 * era una píldora con degradado de marca y `shadow-glow-brand`: el bloque de
 * color más pesado de la pantalla, por delante de la tarjeta que se está
 * pasando de hora. Y la tarjeta ya habla en color —la franja del local, la
 * insignia de estado, el borde rojo con aura de lo vencido, el verde que asoma
 * al arrastrar para tomar—, así que la barra estaba gritando más fuerte que
 * todo eso sin decir nada nuevo. Ahora el activo se marca rellenando el icono
 * (eje FILL de Material Symbols) y subiendo el peso del label: cero superficie.
 *
 * LOS LABELS VAN EN CAJA DE FRASE. En versalitas de 10px con `tracking` todas
 * las palabras tienen la misma silueta rectangular y hay que deletrearlas; esta
 * barra se lee de reojo, con el casco puesto y una mano en el manillar.
 *
 * El inactivo usa `ink-muted` y no un gris más claro a propósito: 7,5:1 sobre
 * el fondo de la barra. La diferencia con el activo la llevan el relleno y el
 * tono, no el contraste — bajarlo penalizaría justo a quien lee al sol.
 *
 * Soporta enlaces (`href`) y botones de acción (`onClick`).
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
      className={`fixed right-0 bottom-0 left-0 z-30 flex items-stretch gap-0.5 border-t border-ink/[0.07] bg-white/[0.92] px-2 pt-2.5 backdrop-blur-2xl pb-[max(12px,env(safe-area-inset-bottom))] ${
        className ?? ''
      }`}
    >
      {items.map((item) => {
        const active =
          item.active !== undefined ? item.active : item.href ? item.href === activeHref : false

        const content = (
          <>
            <span className="relative inline-flex items-center justify-center">
              {item.initials ? (
                <span
                  aria-hidden
                  className={`inline-flex h-[26px] w-[26px] items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-brand),var(--gradient-brand-to))] text-[11px] font-bold text-white ${
                    active ? 'ring-2 ring-brand' : ''
                  }`}
                >
                  {item.initials}
                </span>
              ) : (
                <Icon
                  name={item.icon}
                  size={26}
                  filled={active}
                  weight={active ? 500 : 400}
                  className="leading-none"
                />
              )}
              {typeof item.badge === 'number' && item.badge > 0 && (
                <span
                  role="status"
                  aria-label={`${item.badge} pendientes`}
                  className={`-top-[5px] -right-[11px] absolute inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[12px] font-bold text-white leading-none ${
                    item.badgeColor === 'danger' ? 'bg-danger' : 'bg-brand'
                  }`}
                >
                  {item.badge > BADGE_MAX ? `${BADGE_MAX}+` : item.badge}
                </span>
              )}
            </span>
            <span
              className={`whitespace-nowrap text-[11px] leading-none tracking-[-0.005em] ${
                active ? 'font-bold' : 'font-medium'
              }`}
            >
              {item.label}
            </span>
          </>
        )

        const baseClass = `flex min-h-[52px] flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-[14px] transition-[color,transform] duration-200 active:scale-[0.92] ${
          active ? 'text-brand' : 'text-ink-muted'
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
