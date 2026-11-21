import type { ReactNode } from 'react'

type Variant = 'primary' | 'secondary'

const STYLES: Record<Variant, string> = {
  // Blanco sobre #EE6417 da 3,25:1: solo vale como texto grande (negrita desde 18,66 px), por eso 20 px.
  primary: 'bg-brand text-xl font-bold text-white hover:bg-brand-pressed active:bg-brand-pressed',
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
