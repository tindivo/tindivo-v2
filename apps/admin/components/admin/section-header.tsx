import type { ReactNode } from 'react'

/** Encabezado de sección: eyebrow + título display + descripción + slot derecho. */
export function SectionHeader({
  eyebrow,
  title,
  description,
  right,
}: {
  eyebrow?: string
  title: string
  description?: string
  right?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="t-eyebrow">{eyebrow}</p>}
        <h1 className="t-display text-[28px] text-ink">{title}</h1>
        {description && <p className="mt-0.5 text-[14px] text-ink-muted">{description}</p>}
      </div>
      {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
    </header>
  )
}
