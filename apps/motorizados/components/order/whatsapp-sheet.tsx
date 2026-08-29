'use client'

import { BottomSheet, Button, Icon } from '@tindivo/ui'
import { isValidPePhone, waLink } from '@/lib/deeplinks'
import type { OrderDetailResponse } from '@/lib/types'
import { WA_TEMPLATES } from '@/lib/whatsapp-templates'

/** Una sola fuente para el título: lo pinta la pantalla y nombra el diálogo. */
const TITULO = 'Enviar aviso por WhatsApp'

export function WhatsAppSheet({
  detail,
  onClose,
}: {
  detail: OrderDetailResponse
  onClose: () => void
}) {
  const { order, business } = detail
  const phone = order.customerPhone ?? ''

  const isValidPhone = isValidPePhone(phone)

  const ctx = {
    customerName: order.customerName,
    businessName: business?.name ?? null,
  }

  function handleSelect(text: string) {
    const link = waLink(phone, text)
    if (link) {
      window.open(link, '_blank', 'noopener,noreferrer')
    }
    onClose()
  }

  return (
    <BottomSheet open label={TITULO} onClose={onClose}>
      <div className="p-5 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-title font-bold tracking-tight text-ink">{TITULO}</h2>
            <p className="mt-0.5 text-caption text-ink-muted">
              #{order.shortId} · {order.customerName ?? 'Cliente'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/[0.06] text-ink-muted"
          >
            <Icon name="close" size={20} />
          </button>
        </div>

        {!isValidPhone ? (
          <div className="mt-6 flex flex-col items-center justify-center rounded-[20px] border border-ink/[0.08] bg-surface p-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink/[0.08] text-ink-muted">
              <Icon name="phone" size={24} />
            </span>
            <p className="mt-3 font-semibold text-body text-ink">
              Este pedido no tiene teléfono válido
            </p>
            <p className="mt-1 max-w-[280px] text-caption text-ink-muted">
              No se puede abrir WhatsApp sin un número de celular de 9 dígitos.
            </p>
            <Button variant="outline" size="sm" className="mt-4 w-full" onClick={onClose}>
              Entendido
            </Button>
          </div>
        ) : (
          <div className="mt-4 space-y-2.5">
            {WA_TEMPLATES.map((tmpl) => {
              const text = tmpl.build(ctx)
              return (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => handleSelect(text)}
                  className="flex min-h-[64px] w-full items-start gap-3 rounded-[18px] border border-ink/10 bg-card p-3.5 text-left transition-colors hover:border-brand/40 hover:bg-brand-soft/30 active:scale-[0.99]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#25D366]/15 text-[#128C7E]">
                    <Icon name={tmpl.icon} size={20} filled />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-body-lg text-ink">{tmpl.label}</p>
                    <p className="mt-0.5 text-caption text-ink-muted line-clamp-2">{text}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
