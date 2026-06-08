import type { ReactNode } from 'react'

/**
 * Hero firma del cliente. `orange` = degradado naranja con glow (resúmenes
 * financieros); `dark` = fondo tinta con glow radial (operación en vivo).
 */
export function Hero({
  variant = 'orange',
  eyebrow,
  title,
  subtitle,
  right,
  children,
}: {
  variant?: 'orange' | 'dark'
  eyebrow?: string
  title?: string
  subtitle?: string
  right?: ReactNode
  children?: ReactNode
}) {
  if (variant === 'dark') {
    return (
      <section className="relative overflow-hidden rounded-[28px] bg-[#1A1614] p-6 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-10 h-56 w-56 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(249,115,22,0.40) 0%, transparent 70%)',
          }}
        />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              {eyebrow && <p className="t-eyebrow !text-white/55">{eyebrow}</p>}
              {title && <h2 className="t-display text-[24px]">{title}</h2>}
              {subtitle && <p className="mt-1 text-[14px] text-white/70">{subtitle}</p>}
            </div>
            {right}
          </div>
          {children}
        </div>
      </section>
    )
  }
  return (
    <section
      className="relative overflow-hidden rounded-[28px] p-6 text-white"
      style={{
        background: 'linear-gradient(135deg,#F97316 0%,#EA580C 50%,#C2410C 100%)',
        boxShadow: '0 12px 32px -10px rgba(249,115,22,0.45)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-12 -right-12 h-52 w-52 rounded-full bg-white/10 blur-2xl"
      />
      <div className="relative">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow && <p className="t-eyebrow !text-white/70">{eyebrow}</p>}
            {title && <h2 className="t-display text-[24px]">{title}</h2>}
            {subtitle && <p className="mt-1 text-[14px] text-white/80">{subtitle}</p>}
          </div>
          {right}
        </div>
        {children}
      </div>
    </section>
  )
}
