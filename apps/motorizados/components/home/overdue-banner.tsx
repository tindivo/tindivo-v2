'use client'

import { Icon } from '@tindivo/ui'

type Props = {
  count: number
}

/**
 * Banner de máxima prioridad de la bandeja "En espera".
 *
 * NO DICE "VENCIDO", Y ES DELIBERADO. `orderUrgency` marca un pedido por dos
 * motivos distintos, y ninguno es un contador que llegue a cero:
 *
 *   - `urgent_since`: el cron `OrderOverdue` (0134) lo sella cuando NADIE ha
 *     tomado el pedido tras `assignment_rules.urgentAfterMinutes` (5 por
 *     defecto). Es el reloj de la ASIGNACIÓN.
 *   - `estimated_ready_at` ya pasada: es el reloj de la COCINA.
 *
 * El primero se dispara con la comida todavía en el horno, así que el banner
 * decía "vencido" junto a una tarjeta con el contador corriendo tan tranquilo
 * —`06:17`—, y eso se lee como una contradicción. "Lleva esperando" es cierto
 * en los dos casos y no promete un plazo agotado.
 */
export function OverdueBanner({ count }: Props) {
  if (count === 0) return null

  return (
    <div
      role="alert"
      aria-live="polite"
      className="relative mb-3 overflow-hidden rounded-[22px] shadow-lg transition-all duration-300 tindivo-overdue-glow"
      style={{
        background: 'linear-gradient(135deg, #991B1B 0%, #BA1A1A 55%, #DC2626 100%)',
        color: '#ffffff',
        padding: '14px 16px',
        boxShadow: '0 8px 24px -6px rgba(186, 26, 26, 0.45)',
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-8 -right-8 h-32 w-32 rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(255,255,255,0.22) 0%, transparent 60%)',
        }}
      />
      <div className="relative flex items-center gap-3">
        <span
          className="inline-flex shrink-0 items-center justify-center text-white"
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '14px',
            background: 'rgba(255,255,255,0.22)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <Icon name="priority_high" size={24} filled />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-white/85">
            Pedidos urgentes
          </div>
          <div className="font-display text-base font-bold tracking-tight text-white">
            {count === 1
              ? '1 pedido lleva esperando — tómalo primero'
              : `${count} pedidos llevan esperando — tómalos primero`}
          </div>
        </div>
      </div>
    </div>
  )
}
