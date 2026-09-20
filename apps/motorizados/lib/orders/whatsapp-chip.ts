import { isValidPePhone, waLink } from '@/lib/deeplinks'
import { WA_TEMPLATES, type WaTemplateId } from '@/lib/whatsapp-templates'
import type { MinePhase } from './phase'

/**
 * El aviso de WhatsApp como un chip en la tarjeta, no como una ventana.
 *
 * Tras «Ya recogí» y «Llegué a la puerta» la ficha ofrece avisar al cliente con
 * un aviso que se atraviesa. Con el gesto ese aviso no puede aparecer (la
 * tarjeta cambia al soltar y nadie está mirando una ficha), y ponerlo delante
 * devolvería la fricción que el gesto quita. Aquí queda a un toque, sin
 * interrumpir, mientras el paso sigue vigente: con la comida encima ofrece «voy
 * en camino»; en la puerta, «ya llegué».
 *
 * Solo hay chip con un teléfono válido: sin él no habría a quién escribirle.
 */
const BY_PHASE: Partial<Record<MinePhase, { template: WaTemplateId; label: string }>> = {
  carrying: { template: 'on_the_way', label: 'Avisar: voy en camino' },
  atdoor: { template: 'outside', label: 'Avisar: ya llegué' },
}

export function whatsappChip(
  order: {
    customer_phone?: string | null
    customer_name: string | null
    business: { name: string } | null
  },
  phase: MinePhase | null,
): { label: string; href: string } | null {
  if (!phase) return null
  const spec = BY_PHASE[phase]
  if (!spec) return null
  const phone = order.customer_phone
  if (!isValidPePhone(phone)) return null

  const template = WA_TEMPLATES.find((t) => t.id === spec.template)
  if (!template) return null

  const href = waLink(
    phone,
    template.build({
      customerName: order.customer_name,
      businessName: order.business?.name ?? null,
    }),
  )
  return href ? { label: spec.label, href } : null
}
