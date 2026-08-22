import { PhonePeSchema } from '@tindivo/contracts'
import type { Form, SectionId } from '../types'

export const CAPABILITY_LABELS: Record<string, string> = {
  drivers_only: 'Solo motorizados',
  catalog_pickup: 'Catálogo + recojo',
  catalog_delivery: 'Catálogo + delivery',
  catalog_full: 'Catálogo completo',
  pickup_local: 'Atención en local',
  catalog_only: 'Solo catálogo (WhatsApp)',
}

export const capabilityLabel = (c: string): string => CAPABILITY_LABELS[c] ?? c

export const WA_ERROR = 'Celular peruano inválido (9 dígitos, empieza con 9).'

/** Vacío = sin WhatsApp (válido). Con texto, valida contra la primitiva canónica. */
export const isWaInvalid = (v: string): boolean =>
  v.trim() !== '' && !PhonePeSchema.safeParse(v.trim()).success

export const SECTIONS: {
  id: SectionId
  icon: string
  label: string
  hiddenFor?: string[]
}[] = [
  { id: 'datos', icon: 'storefront', label: 'Datos' },
  { id: 'yape', icon: 'qr_code_2', label: 'Cobros', hiddenFor: ['catalog_only'] },
  { id: 'tiempos', icon: 'schedule', label: 'Tiempos y precio', hiddenFor: ['catalog_only'] },
  { id: 'capacidades', icon: 'tune', label: 'Capacidades' },
  { id: 'horario', icon: 'calendar_month', label: 'Horario' },
]

export const CAP_ITEMS: {
  key: keyof Form
  icon: string
  title: string
  desc: string
}[] = [
  {
    key: 'publishesCatalog',
    icon: 'storefront',
    title: 'Publicar catálogo',
    desc: 'Aparecer en el marketplace de Tindivo',
  },
  {
    key: 'acceptsWebPickup',
    icon: 'shopping_bag',
    title: 'Recojo en local',
    desc: 'El cliente puede hacer pedidos para recoger',
  },
  {
    key: 'acceptsWebDelivery',
    icon: 'delivery_dining',
    title: 'Delivery web',
    desc: 'Aceptar pedidos con envío a domicilio',
  },
  {
    key: 'usesTindivoDrivers',
    icon: 'two_wheeler',
    title: 'Motorizados Tindivo',
    desc: 'Usar la flota de motos de Tindivo',
  },
]
