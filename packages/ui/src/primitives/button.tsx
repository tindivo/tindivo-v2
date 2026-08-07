import type { AnchorHTMLAttributes, ButtonHTMLAttributes, Ref } from 'react'
import { cn } from '../lib/cn'

type Variant = 'brand' | 'soft' | 'outline' | 'ghost' | 'danger' | 'success' | 'secondary'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  brand:
    'bg-[linear-gradient(135deg,var(--color-brand),var(--gradient-brand-to))] text-white shadow-[0_4px_20px_rgba(171,53,0,0.2)] hover:shadow-[0_10px_40px_rgba(255,107,53,0.3)]',
  /** Secundario neutro: superficie tenue de tinta, sin borde. Es la acción de
   *  apoyo más común de la plataforma — «Cancelar», «Volver», «+10 min».
   *  Para intención distinta al neutro, componer: `variant="soft"
   *  className="text-danger"`. La superficie es la variante; el color del
   *  texto es la intención. */
  soft: 'bg-ink/[0.06] text-ink hover:bg-ink/[0.1]',
  outline: 'border border-ink/[0.08] bg-card text-ink hover:bg-surface',
  ghost: 'text-ink hover:bg-ink/[0.05]',
  danger: 'bg-danger text-white hover:bg-danger/90',
  /** Confirmación positiva e irreversible: «Confirmo el monto», «Sí, está
   *  lista». No usar como CTA primario — para eso está `brand`. */
  success: 'bg-success text-white hover:bg-success/90',
  secondary: 'bg-ink text-white hover:bg-ink/90',
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-[15px]',
  lg: 'h-12 px-6 text-base',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  as?: 'button' | 'a'
  ref?: Ref<HTMLButtonElement | HTMLAnchorElement>
}

export function Button({
  as = 'button',
  className,
  variant = 'brand',
  size = 'md',
  ref,
  ...props
}: ButtonProps & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const classes = cn(
    'inline-flex items-center justify-center gap-2 rounded-full font-sans font-bold transition-all',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
    'disabled:pointer-events-none disabled:opacity-50',
    'active:scale-[0.97]',
    VARIANTS[variant],
    SIZES[size],
    className,
  )
  if (as === 'a') {
    return (
      <a
        ref={ref as Ref<HTMLAnchorElement>}
        className={classes}
        {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)}
      />
    )
  }
  return <button ref={ref as Ref<HTMLButtonElement>} className={classes} {...props} />
}
