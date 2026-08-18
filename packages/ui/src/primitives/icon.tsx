import type { CSSProperties } from 'react'
import { cn } from '../lib/cn'

type IconWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700

type Props = {
  name: string
  filled?: boolean
  weight?: IconWeight
  grade?: -25 | 0 | 200
  opticalSize?: 20 | 24 | 40 | 48
  size?: number
  className?: string
  'aria-label'?: string
}

/**
 * Los nombres de icono son `[a-z0-9_]`. El saneado no es paranoia: el nombre
 * viaja dentro de una cadena CSS entrecomillada, y `name` llega a veces de un
 * view-model (`<Icon name={vm.badge.icon} />`), no de un literal. Una comilla
 * ahí cerraría el `content` y el resto se interpretaría como CSS.
 */
function sanitizar(name: string): string {
  return name.replace(/[^a-z0-9_]/gi, '')
}

/**
 * Wrapper de Material Symbols Rounded.
 * Variable font axes: FILL, wght, GRAD, opsz.
 * Siempre setear los 4 ejes para evitar render `.notdef`.
 *
 * **El nombre del icono NO va en el texto del elemento.** Material Symbols
 * dibuja el glifo a partir de una ligadura, así que la forma natural de usarlo
 * es poner «schedule» como contenido y dejar que la fuente lo sustituya. El
 * problema es que entonces la palabra está de verdad en el DOM, y cualquiera
 * que lea el texto de la página sin aplicar la fuente la ve. Google la vio: el
 * 2026-08-18 el snippet de la portada decía «...en un gran ambiente.Cerrado
 * schedule 25–50 minlocal_shipping».
 *
 * Ahora el nombre viaja en la custom property `--icon-glyph` y lo materializa
 * la regla `::before` de `theme.css`. Se ve exactamente igual, la ligadura
 * funciona igual, y el texto de la página queda limpio. La accesibilidad no
 * depende del contenido: la dan `role="img"` y `aria-label`.
 *
 * Como efecto secundario, desaparece el fallo que describía el comentario
 * anterior: con la fuente caída ya no se lee «two_wheeler» suelto, no se pinta
 * nada. `overflow-hidden` se queda igualmente como red del tamaño.
 */
export function Icon({
  name,
  filled = false,
  weight = 400,
  grade = 0,
  opticalSize = 24,
  size = 24,
  className,
  'aria-label': ariaLabel,
}: Props) {
  const label = ariaLabel ?? name.replace(/_/g, ' ')
  return (
    <span
      className={cn(
        'material-symbols-rounded inline-flex shrink-0 select-none items-center justify-center overflow-hidden leading-none',
        className,
      )}
      style={
        {
          fontSize: `${size}px`,
          lineHeight: `${size}px`,
          width: `${size}px`,
          height: `${size}px`,
          fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' ${grade}, 'opsz' ${opticalSize}`,
          '--icon-glyph': `"${sanitizar(name)}"`,
        } as CSSProperties
      }
      role="img"
      aria-label={label}
    />
  )
}
