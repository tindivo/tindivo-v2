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
        'material-symbols-rounded inline-flex select-none items-center justify-center leading-none',
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
