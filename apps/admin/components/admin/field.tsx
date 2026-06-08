import type { ReactNode } from 'react'

/** Input/select compacto para edición inline en tablas y banners (más bajo que .t-field). */
export const fieldSm =
  'h-10 w-full rounded-[12px] border border-border bg-card px-3 text-[14px] text-ink outline-none transition-colors focus:border-ink'

/** Campo de formulario: etiqueta uppercase + control (usa la clase global .t-field). */
export function Field({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: el control se pasa como children dentro del label
    <label className={`block ${className ?? ''}`}>
      <span className="t-field-label">{label}</span>
      {children}
    </label>
  )
}
