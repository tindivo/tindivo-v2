'use client'

import type { ReactNode } from 'react'
import { Icon } from '../primitives/icon'

/**
 * Header con back circular + título display.
 *
 * EL TÍTULO ES UN ENCABEZADO DE VERDAD, y antes no lo era: iba en un `div`
 * mientras las subsecciones de la misma pantalla —«Mis direcciones», «Método de
 * pago», «Tu pedido»— sí eran `h2`. La jerarquía quedaba invertida: el documento
 * tenía nivel 2 y ningún nivel 1, así que quien navega por encabezados con
 * lector de pantalla no podía saltar al título de la pantalla en la que está, y
 * el primer salto lo dejaba ya dentro de una subsección.
 *
 * `as` existe por los BottomSheet. Ahí el header no titula la PANTALLA sino un
 * diálogo abierto sobre ella, y meterle un segundo `h1` al documento sería
 * cambiar un desorden por otro: esos pasan `as="h2"`.
 */
export function ScreenHeader({
  title,
  onBack,
  right,
  as: Titulo = 'h1',
}: {
  title: ReactNode
  onBack?: () => void
  right?: ReactNode
  as?: 'h1' | 'h2'
}) {
  return (
    <div className="sticky top-0 z-40 border-b border-ink/[0.04] bg-white/80 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-ink/[0.06] text-ink"
            aria-label="Volver"
          >
            <Icon name="arrow_back" size={22} />
          </button>
        )}
        {/* El tamaño y el peso van explícitos en las clases, así que cambiar el
            `div` por un encabezado no mueve un píxel: el reset de Tailwind deja
            los `h1`/`h2` en `font-size: inherit` y sin margen. */}
        <Titulo className="flex-1 font-display text-base sm:text-lg font-bold tracking-tight">
          {title}
        </Titulo>
        {right}
      </div>
    </div>
  )
}
