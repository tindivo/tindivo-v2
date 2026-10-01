'use client'

import { Button, Card, Icon } from '@tindivo/ui'
import { WhatsAppGlyph } from '@/components/whatsapp-glyph'
import { isValidPePhone, telLink } from '@/lib/deeplinks'
import { prettyPhone } from '@/lib/format'
import type { OrderDetailResponse } from '@/lib/types'

/**
 * El cliente, en la puerta: a quién entregas y cómo alcanzarlo.
 *
 * El número va AGRUPADO EN TRÍOS (`prettyPhone`), como en la ficha de
 * previsualización. Salía crudo justo aquí, que es donde de verdad se llama —
 * con guantes, de noche y a veces dictándoselo a alguien.
 *
 * UN SOLO BOTÓN DE WHATSAPP, y es este.
 * Había dos: éste, que abría el chat con un mensaje fijo escrito a mano aquí
 * dentro, y otro a ancho completo justo debajo de la tarjeta que abría la hoja
 * de plantillas. Dos botones verdes idénticos, uno encima del otro, que hacían
 * cosas distintas — y el de arriba, el que está donde uno lo busca (al lado de
 * «Llamar»), era el que MENOS hacía: mandaba siempre «estoy en camino», aunque
 * ya estuvieras en la puerta.
 * Ahora este abre la hoja, así que el mensaje lo elige el motorizado según
 * dónde esté. De paso se va la copia del texto: vivía duplicado aquí y en
 * `whatsapp-templates`, con dos redacciones distintas.
 */
export function CustomerCard({
  order,
  onWhatsApp,
}: {
  order: OrderDetailResponse['order']
  /** Abre la hoja de plantillas. Sin esto el botón no se pinta. */
  onWhatsApp?: () => void
}) {
  const canWhatsApp = isValidPePhone(order.customerPhone) && onWhatsApp != null

  return (
    <Card className="mt-3.5 p-[18px]">
      <span className="font-mono text-meta font-semibold uppercase tracking-[0.14em] text-ink-muted">
        Entregar a
      </span>
      <div className="mt-1.5 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink/[0.06] text-ink">
          <Icon name="person" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-body-lg">{order.customerName ?? 'Cliente'}</p>
          {order.customerPhone && (
            <p className="mt-0.5 font-mono text-caption text-ink-muted">
              {prettyPhone(order.customerPhone)}
            </p>
          )}
        </div>
      </div>
      {(order.customerPhone || canWhatsApp) && (
        <div className="mt-3.5 grid grid-cols-2 gap-2">
          {order.customerPhone && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              as="a"
              href={telLink(order.customerPhone)}
            >
              <Icon name="phone" size={20} />
              Llamar
            </Button>
          )}
          {canWhatsApp && (
            <Button
              type="button"
              size="sm"
              onClick={onWhatsApp}
              /* `bg-none` NO SOBRA. La variante `brand` pinta el naranja con
                 `background-image: linear-gradient(...)`, y una imagen de fondo
                 se dibuja ENCIMA del `background-color`: sin apagarla, el verde
                 de WhatsApp quedaba debajo y el botón salía naranja como
                 cualquier otro. Llevaba así desde que se escribió. */
              className="w-full bg-none bg-[#25D366] text-white shadow-none hover:bg-[#1ebd5a]"
            >
              <WhatsAppGlyph className="h-4 w-4 fill-current" />
              WhatsApp
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
