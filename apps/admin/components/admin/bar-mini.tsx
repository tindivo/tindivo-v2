/** Mini barras horizontales con gradiente naranja (sin librería). */
export function BarMini({
  items,
  format,
}: {
  items: { label: string; value: number }[]
  format?: (n: number) => string
}) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className="space-y-2.5">
      {items.map((it) => (
        <li key={it.label}>
          <div className="mb-1 flex items-center justify-between gap-3 text-[13px]">
            <span className="truncate text-ink-muted">{it.label}</span>
            <span className="shrink-0 font-mono tabular-nums text-ink">
              {format ? format(it.value) : it.value}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-ink/[0.06]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(it.value / max) * 100}%`,
                background: 'linear-gradient(90deg,#F97316,#FB923C)',
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
