export interface Form {
  name: string
  phone: string
  whatsappNumber: string
  yapeNumber: string
  tagline: string
  accentColor: string
  estimatedEtaMin: number
  estimatedEtaMax: number
  deliveryFee: number
  publishesCatalog: boolean
  acceptsWebPickup: boolean
  acceptsWebDelivery: boolean
  usesTindivoDrivers: boolean
}

export type SectionId = 'datos' | 'yape' | 'tiempos' | 'capacidades' | 'horario'
