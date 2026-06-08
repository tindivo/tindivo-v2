import type { ReactNode } from 'react'

/** Tarjeta de monitor en vivo: punto pulsante opcional + valor grande. */
export function StatCard({
  label,
  value,
  pulse,
}: {
  label: string
  value: ReactNode
  pulse?: boolean
}) {
  return (
    <div className="t-card flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        {pulse && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
          </span>
        )}
        <span className="t-eyebrow !text-[10px]">{label}</span>
      </div>
      <span className="t-display text-[26px] tabular-nums leading-none text-ink">{value}</span>
    </div>
  )
}
