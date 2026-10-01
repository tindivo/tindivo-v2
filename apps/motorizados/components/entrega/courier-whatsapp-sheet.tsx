'use client'

import type { DriverCourierOrderView } from '@tindivo/contracts'
import { BottomSheet, Icon } from '@tindivo/ui'
import { type CourierWaPoint, courierWaTemplates } from '@/lib/courier-whatsapp-templates'
import { waLink } from '@/lib/deeplinks'

/**
 * Avisar por WhatsApp a uno de los dos puntos de una entrega, eligiendo una
 * plantilla. Misma piel que la hoja de la comida (`order/whatsapp-sheet`); lo
 * que cambia son los mensajes, que dependen de a quién se le escribe.
 */
export function CourierWhatsAppSheet({
  order,
  point,
  onClose,
}: {
  order: DriverCourierOrderView
  point: CourierWaPoint
  onClose: () => void
}) {
  const who = order[point]
  const titulo = point === 'origin' ? 'Avisar a quien entrega' : 'Avisar a quien recibe'

  function send(text: string) {
    const link = who.phone ? waLink(who.phone, text) : null
    if (link) window.open(link, '_blank', 'noopener,noreferrer')
    onClose()
  }

  return (
    <BottomSheet open label={titulo} onClose={onClose}>
      <div className="p-5 pb-6">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="font-display text-title font-bold tracking-tight text-ink">{titulo}</h2>
            <p className="mt-0.5 truncate text-caption text-ink-muted">
              #{order.shortId} · {who.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink-muted"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="mt-4 space-y-2.5">
          {courierWaTemplates(order, point).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => send(t.text)}
              className="flex min-h-[64px] w-full items-start gap-3 rounded-[18px] border border-ink/10 bg-card p-3.5 text-left transition-colors hover:border-brand/40 hover:bg-brand-soft/30 active:scale-[0.99]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#25D366]/15 text-[#128C7E]">
                <Icon name={t.icon} size={20} filled />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-body-lg text-ink">{t.label}</p>
                <p className="mt-0.5 line-clamp-3 text-caption text-ink-muted">{t.text}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </BottomSheet>
  )
}
