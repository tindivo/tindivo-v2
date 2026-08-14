'use client'

import { Card, Icon } from '@tindivo/ui'
import { soles } from '@/components/dashboard/primitives'

/**
 * Los tres números de la noche.
 *
 * Eran cuatro, y dos decían lo mismo: «Por confirmar» (un conteo de cierres) y
 * «Pendiente confirmar» (el importe de esos mismos cierres). Ahora cada tarjeta
 * responde una pregunta distinta que la cajera se hace de verdad:
 *
 *   ¿Qué tengo que contar ahora?   -> Por confirmar
 *   ¿Cuánto anda por ahí todavía?  -> En camino
 *   ¿Cuánto entró esta noche?      -> Recibido hoy
 *
 * «En disputa» sale solo cuando lo hay: un cero permanente en pantalla enseña a
 * ignorar el sitio donde luego aparecerá algo que sí importa.
 */
export function CashSummary({
  porConfirmar,
  porConfirmarCount,
  enCamino,
  enCaminoCount,
  recibidoHoy,
  enDisputa,
}: {
  porConfirmar: number
  porConfirmarCount: number
  enCamino: number
  enCaminoCount: number
  recibidoHoy: number
  enDisputa: number
}) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      <Kpi
        label="Por confirmar"
        value={soles(porConfirmar)}
        sub={`${porConfirmarCount} ${porConfirmarCount === 1 ? 'cliente' : 'clientes'}`}
        tone={porConfirmarCount > 0 ? 'warning' : 'neutral'}
        iconName={porConfirmarCount > 0 ? 'warning' : undefined}
      />
      <Kpi
        label="En camino"
        value={soles(enCamino)}
        sub={`${enCaminoCount} ${enCaminoCount === 1 ? 'cliente' : 'clientes'} · lo tiene la moto`}
        tone="neutral"
      />
      <Kpi label="Recibido hoy" value={soles(recibidoHoy)} sub="confirmado" tone="brand" />
      {enDisputa > 0 && (
        <Kpi
          label="En disputa"
          value={String(enDisputa)}
          sub="Tindivo lo revisa"
          tone="danger"
          iconName="gavel"
        />
      )}
    </div>
  )
}

const TONOS = {
  brand: { bg: 'bg-brand-soft', fg: 'text-brand-dark' },
  warning: { bg: 'bg-warning-soft', fg: 'text-amber-900' },
  danger: { bg: 'bg-danger-soft', fg: 'text-danger' },
  neutral: { bg: 'bg-card', fg: 'text-ink' },
}

function Kpi({
  label,
  value,
  sub,
  tone = 'neutral',
  iconName,
}: {
  label: string
  value: string
  sub: string
  tone?: keyof typeof TONOS
  iconName?: string
}) {
  const t = TONOS[tone]
  return (
    <Card className={`flex flex-col gap-1 p-3.5 ${t.bg}`}>
      <div className="flex items-center gap-1.5">
        <span
          className={`font-mono text-[10px] font-semibold uppercase tracking-wider ${t.fg} opacity-70`}
        >
          {label}
        </span>
        {iconName && <Icon name={iconName} size={14} filled className={t.fg} />}
      </div>
      <div className={`font-mono text-2xl font-bold leading-none ${t.fg}`}>{value}</div>
      <div className="text-[11px] text-ink-muted">{sub}</div>
    </Card>
  )
}
