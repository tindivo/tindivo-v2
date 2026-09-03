import { describe, expect, it } from 'vitest'
import { BusinessUpdateSchema } from '../../app/api/v1/admin/businesses/[id]/route'

describe('BusinessUpdateSchema (admin/businesses/[id])', () => {
  it('valida payload completo con coordenadas, dirección, slug y tiempos de entrega', () => {
    const valid = {
      name: 'Pizzería San Jacinto',
      slug: 'pizzeria-san-jacinto',
      tagline: 'Las mejores pizzas artesanales',
      address: 'Jr. Comercio 123',
      coordinatesLat: -9.1465,
      coordinatesLng: -78.2805,
      estimatedEtaMin: 25,
      estimatedEtaMax: 50,
      deliveryFee: 3.5,
      phone: '987654321',
      whatsappNumber: '912345678',
      isActive: true,
      publishesCatalog: true,
      acceptsWebDelivery: true,
      usesTindivoDrivers: true,
    }
    const result = BusinessUpdateSchema.safeParse(valid)
    expect(result.success).toBe(true)
  })

  it('permite limpiar las coordenadas enviando null', () => {
    const result = BusinessUpdateSchema.safeParse({
      coordinatesLat: null,
      coordinatesLng: null,
      address: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.coordinatesLat).toBeNull()
      expect(result.data.coordinatesLng).toBeNull()
      expect(result.data.address).toBeNull()
    }
  })

  it('rechaza coordenadas fuera de rango geográfico', () => {
    // Latitud fuera de [-90, 90]
    expect(BusinessUpdateSchema.safeParse({ coordinatesLat: 95.1 }).success).toBe(false)
    expect(BusinessUpdateSchema.safeParse({ coordinatesLat: -95.1 }).success).toBe(false)

    // Longitud fuera de [-180, 180]
    expect(BusinessUpdateSchema.safeParse({ coordinatesLng: 185.0 }).success).toBe(false)
    expect(BusinessUpdateSchema.safeParse({ coordinatesLng: -185.0 }).success).toBe(false)
  })

  it('valida formato del slug: solo minúsculas, números y guiones, y normaliza mayúsculas', () => {
    // Válidos y normalización a minúsculas
    expect(BusinessUpdateSchema.safeParse({ slug: 'polleria-rokys-2' }).success).toBe(true)
    expect(BusinessUpdateSchema.safeParse({ slug: 'don-tito' }).success).toBe(true)
    expect(BusinessUpdateSchema.parse({ slug: 'Polleria-Rokys' }).slug).toBe('polleria-rokys')

    // Inválidos: espacios, tildes, símbolos, longitud menor a 2
    expect(BusinessUpdateSchema.safeParse({ slug: 'don tito' }).success).toBe(false)
    expect(BusinessUpdateSchema.safeParse({ slug: 'café-central' }).success).toBe(false)
    expect(BusinessUpdateSchema.safeParse({ slug: 'restaurante!' }).success).toBe(false)
    expect(BusinessUpdateSchema.safeParse({ slug: 'a' }).success).toBe(false) // min 2
  })

  it('rechaza tarifas de delivery negativas o tiempos de entrega inválidos', () => {
    expect(BusinessUpdateSchema.safeParse({ deliveryFee: -1 }).success).toBe(false)
    expect(BusinessUpdateSchema.safeParse({ estimatedEtaMin: -5 }).success).toBe(false)
    expect(BusinessUpdateSchema.safeParse({ estimatedEtaMax: 400 }).success).toBe(false)
  })

  it('valida formato de celular peruano en WhatsApp si se provee', () => {
    expect(BusinessUpdateSchema.safeParse({ whatsappNumber: '987654321' }).success).toBe(true)
    expect(BusinessUpdateSchema.safeParse({ whatsappNumber: '+51 987 654 321' }).success).toBe(true)
    // Inválido: no empieza con 9 o tiene longitud incorrecta
    expect(BusinessUpdateSchema.safeParse({ whatsappNumber: '887654321' }).success).toBe(false)
    expect(BusinessUpdateSchema.safeParse({ whatsappNumber: '98765' }).success).toBe(false)
  })
})
