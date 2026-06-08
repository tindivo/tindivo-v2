/** Donut de un porcentaje con conic-gradient naranja (sin librería). */
export function DonutMini({
  pct,
  label,
  sublabel,
}: {
  pct: number
  label?: string
  sublabel?: string
}) {
  const p = Math.max(0, Math.min(100, pct))
  return (
    <div className="flex items-center gap-3">
      <div
        className="grid h-20 w-20 shrink-0 place-items-center rounded-full"
        style={{ background: `conic-gradient(#F97316 ${p * 3.6}deg, rgba(26,22,20,0.08) 0deg)` }}
      >
        <div className="grid h-14 w-14 place-items-center rounded-full bg-card">
          <span className="t-display text-[16px] tabular-nums text-ink">{Math.round(p)}%</span>
        </div>
      </div>
      {(label || sublabel) && (
        <div className="min-w-0">
          {label && <p className="text-[14px] text-ink">{label}</p>}
          {sublabel && <p className="text-[12px] text-ink-subtle">{sublabel}</p>}
        </div>
      )}
    </div>
  )
}
