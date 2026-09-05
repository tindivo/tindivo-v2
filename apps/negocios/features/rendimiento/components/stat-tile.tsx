'use client'

import { type Delta, fmtPct } from '@tindivo/core'
import { Icon } from '@tindivo/ui'

/**
 * Cifra con su variación contra el periodo anterior.
 *
 * El delta es la razón de ser de la tarjeta: un número solo («S/ 8,341») no
 * dice si el periodo fue bueno. Cuando no hay con qué comparar se dice, en vez
 * de inventar un porcentaje.
 */
export function StatTile({
  label,
  value,
  sub,
  delta,
  upIsGood = true,
  tone = 'neutral',
}: {
  label: string
  value: string
  sub?: string
  delta?: Delta
  /** En la factura de Tindivo, subir NO es bueno. */
  upIsGood?: boolean
  tone?: 'neutral' | 'positive'
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-ink/[0.05] bg-card p-4">
      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      {/* Cifras proporcionales, no tabulares: a este tamaño `tabular-nums`
          deja los números sueltos. */}
      <span
        className={`mt-1.5 text-[26px] font-bold leading-none tracking-tight ${
          tone === 'positive' ? 'text-success' : 'text-ink'
        }`}
      >
        {value}
      </span>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        {delta && <DeltaBadge delta={delta} upIsGood={upIsGood} />}
        {sub && <span className="text-[11px] text-ink-muted">{sub}</span>}
      </div>
    </div>
  )
}

function DeltaBadge({ delta, upIsGood }: { delta: Delta; upIsGood: boolean }) {
  if (!delta.comparable || delta.pct === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
        Sin periodo previo
      </span>
    )
  }
  if (delta.direction === 'flat') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink-muted">
        Igual que antes
      </span>
    )
  }
  const subio = delta.direction === 'up'
  const bueno = subio === upIsGood
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${
        bueno ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'
      }`}
    >
      <Icon name={subio ? 'arrow_upward' : 'arrow_downward'} size={12} />
      {fmtPct(delta.pct)}
    </span>
  )
}
