'use client'

import type { Insight } from '@tindivo/core'
import { Card, Icon } from '@tindivo/ui'

const TONE = {
  good: { icon: 'check_circle', wrap: 'bg-success-soft/60 border-success/20', ink: 'text-success' },
  warn: {
    icon: 'priority_high',
    wrap: 'bg-warning-soft/60 border-warning/25',
    ink: 'text-warning',
  },
  info: { icon: 'lightbulb', wrap: 'bg-brand-soft border-brand/20', ink: 'text-brand' },
} as const

/**
 * Lo que los números dicen que hay que hacer.
 *
 * Cada frase sale de `buildInsights`, que solo habla cuando la muestra lo
 * aguanta. Si no hay nada que decir, se dice eso — un consejo genérico que
 * valdría para cualquier restaurante del país es peor que el silencio, porque
 * el negocio actúa sobre él.
 */
export function InsightsPanel({ insights }: { insights: Insight[] }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Icon name="lightbulb" size={18} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-ink">Qué dicen tus números</h3>
          <p className="text-xs text-ink-muted">Lo que cambiaría si fuera tu local</p>
        </div>
      </div>

      {insights.length === 0 ? (
        <p className="mt-4 rounded-xl bg-surface p-3 text-xs text-ink-muted">
          Todavía no hay suficiente historial para sacar conclusiones que valgan. Con dos o tres
          semanas más de pedidos aparecen aquí tu día fuerte, tu día flojo y cómo vas contra el
          periodo anterior.
        </p>
      ) : (
        <ul className="mt-3.5 flex flex-col gap-2.5">
          {insights.map((ins) => {
            const t = TONE[ins.tone]
            return (
              <li key={ins.id} className={`flex gap-2.5 rounded-xl border p-3 ${t.wrap}`}>
                <Icon name={t.icon} size={17} className={`mt-0.5 shrink-0 ${t.ink}`} />
                <div className="min-w-0">
                  <p className="text-[13px] font-bold leading-snug text-ink">{ins.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{ins.action}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
