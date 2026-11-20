import type { ReactNode } from 'react'

type Variant = 'primary' | 'secondary'

const STYLES: Record<Variant, string> = {
  // Blanco sobre naranja solo desde 18 px en negrita (contraste).
  primary: 'bg-brand text-lg font-bold text-white hover:bg-brand-pressed active:bg-brand-pressed',
  secondary:
    'border border-divider bg-card text-base font-semibold text-brand-text shadow-card hover:bg-page',
}

/** Enlace con forma de botón: `<a href>` real, toque mínimo de 48 px. */
export function ButtonLink({
  href,
  variant = 'primary',
  external = false,
  children,
}: {
  href: string
  variant?: Variant
  external?: boolean
  children: ReactNode
}) {
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={`inline-flex min-h-12 items-center justify-center rounded-xl px-5 py-3 text-center ${STYLES[variant]}`}
    >
      {children}
    </a>
  )
}
