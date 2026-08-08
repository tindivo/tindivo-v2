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
 * Wrapper de Material Symbols Rounded.
 * Variable font axes: FILL, wght, GRAD, opsz.
 * Siempre setear los 4 ejes para evitar render `.notdef`.
 *
 * El contenido es el NOMBRE del icono en texto; la ligadura de la fuente lo
 * convierte en glifo. Por eso la fuente DEBE cargarse con `font-display: block`
 * en todas las apps: con `swap` se lee «two_wheeler» literal mientras carga.
 *
 * `overflow-hidden` es la red de seguridad para cuando eso falle igual (fuente
 * caída, CDN bloqueado, red muerta): el nombre en texto es mucho más ancho que
 * el glifo y sin recorte desborda y descuadra la tarjeta que lo contiene. Con
 * él, el peor caso es un hueco vacío del tamaño correcto.
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
      style={{
        fontSize: `${size}px`,
        lineHeight: `${size}px`,
        width: `${size}px`,
        height: `${size}px`,
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' ${grade}, 'opsz' ${opticalSize}`,
      }}
      role="img"
      aria-label={label}
    >
      {name}
    </span>
  )
}
