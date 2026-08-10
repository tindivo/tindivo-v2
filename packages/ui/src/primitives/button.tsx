import type { AnchorHTMLAttributes, ButtonHTMLAttributes, Ref } from 'react'
import { cn } from '../lib/cn'

type Variant = 'brand' | 'soft' | 'outline' | 'ghost' | 'danger' | 'success' | 'secondary'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  /** CTA principal. Degradado oscuro→claro (135deg) + text-shadow sutil para
   *  que el blanco destaque incluso ante cualquier reset de color del navegador. */
  brand:
    'btn-white-text bg-[linear-gradient(135deg,var(--color-brand),var(--gradient-brand-to))] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.28)] tracking-wide font-extrabold shadow-[0_4px_20px_rgba(171,53,0,0.2)] hover:shadow-[0_10px_40px_rgba(255,107,53,0.3)]',
  /** Secundario neutro: superficie tenue de marca, sin borde. */
  soft: 'bg-brand/[0.08] text-brand-dark font-semibold hover:bg-brand/[0.12]',
  outline: 'border border-brand/[0.25] bg-card text-brand-dark font-semibold hover:bg-brand/[0.05]',
  ghost: 'text-brand-dark font-semibold hover:bg-brand/[0.06]',
  danger:
    'btn-white-text bg-[linear-gradient(135deg,#dc2626,#ef4444)] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.25)] tracking-wide font-extrabold shadow-[0_4px_16px_rgba(220,38,38,0.25)] hover:shadow-[0_8px_28px_rgba(220,38,38,0.35)]',
  /** Confirmación positiva e irreversible: «Confirmo el monto», «Sí, está
   *  lista». No usar como CTA primario — para eso está `brand`. */
  success:
    'btn-white-text bg-[linear-gradient(135deg,#16a34a,#22c55e)] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.2)] tracking-wide font-extrabold shadow-[0_4px_16px_rgba(22,163,74,0.25)] hover:shadow-[0_8px_28px_rgba(22,163,74,0.35)]',
  secondary:
    'btn-white-text bg-[linear-gradient(135deg,#27272a,#3f3f46)] text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.2)] tracking-wide font-extrabold hover:opacity-90',
}

/* Alturas fijas a propósito: dan una línea base consistente aunque cambie el
   tamaño de texto. Los CTA escritos a mano suelen derivar la altura del padding
   (`px-5 py-3 text-[15px]` = 46px), que queda a 2px de `md` — indistinguible.
   Por eso no hay un tamaño `xs`: no hay un hueco real que llenar. */
const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-body',
  md: 'h-11 px-5 text-body-lg',
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
