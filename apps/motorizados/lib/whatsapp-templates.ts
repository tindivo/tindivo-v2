export type WaTemplateId = 'on_the_way' | 'outside' | 'need_location'

export interface WaTemplateCtx {
  customerName: string | null
  businessName: string | null
}

export interface WaTemplate {
  id: WaTemplateId
  label: string
  icon: string
  build: (ctx: WaTemplateCtx) => string
}

const greet = (name: string | null) => (name ? `Hola ${name}, ` : 'Hola, ')
const from = (biz: string | null) => (biz ? ` de ${biz}` : '')

export const WA_TEMPLATES: WaTemplate[] = [
  {
    id: 'on_the_way',
    label: 'Ya salí con tu pedido',
    icon: 'two_wheeler',
    build: (c) =>
      `${greet(c.customerName)}soy tu repartidor de Tindivo. ` +
      `Ya salí con tu pedido${from(c.businessName)}, llego en unos minutos.`,
  },
  {
    id: 'outside',
    label: 'Ya estoy afuera',
    icon: 'person_pin_circle',
    build: (c) =>
      `${greet(c.customerName)}soy tu repartidor de Tindivo. ` +
      `Ya estoy afuera con tu pedido${from(c.businessName)}.`,
  },
  {
    id: 'need_location',
    label: 'No ubico la dirección',
    icon: 'my_location',
    build: (c) =>
      `${greet(c.customerName)}soy tu repartidor de Tindivo. ` +
      `Estoy en camino con tu pedido${from(c.businessName)} pero aún no logro ubicarme. ` +
      `¿Me podrías enviar tu ubicación en tiempo real? (📎 → Ubicación)`,
  },
]
