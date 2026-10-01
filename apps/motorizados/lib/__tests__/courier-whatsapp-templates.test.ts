import type { DriverCourierOrderView } from '@tindivo/contracts'
import { describe, expect, it } from 'vitest'
import { courierWaTemplates } from '../courier-whatsapp-templates'

function orden(over: Partial<DriverCourierOrderView> = {}): DriverCourierOrderView {
  return {
    id: 'x',
    shortId: 'ABCD2345',
    status: 'accepted',
    requesterName: 'Lucía',
    origin: {
      name: 'Bodega Don Lucho',
      phone: '+51922222222',
      referenceText: 'Bodega frente a la plaza',
      coordinates: { lat: 0, lng: 0 },
    },
    destination: {
      name: 'Lucía',
      phone: '+51911111111',
      referenceText: 'Casa celeste',
      coordinates: { lat: 0, lng: 0 },
    },
    itemDescription: 'Comida',
    isFragile: false,
    driverNote: null,
    payer: 'destination',
    feeAmount: 3,
    transportCollected: false,
    paymentMethod: null,
    createdAt: '2026-09-30T00:00:00Z',
    acceptedAt: null,
    acceptDeadline: null,
    deliveredAt: null,
    ...over,
  }
}

const texto = (o: DriverCourierOrderView, p: 'origin' | 'destination', id: string) =>
  courierWaTemplates(o, p).find((t) => t.id === id)?.text ?? ''

describe('plantillas de WhatsApp de Entregas', () => {
  it('el cobro va en el mensaje de quien paga, y solo en ese', () => {
    const o = orden({ payer: 'destination' })
    expect(texto(o, 'destination', 'outside')).toContain('Son S/ 3.00 del transporte')
    expect(texto(o, 'origin', 'outside')).not.toContain('S/ 3.00')
  })

  it('si paga quien entrega, se le avisa a él', () => {
    const o = orden({ payer: 'origin' })
    expect(texto(o, 'origin', 'outside')).toContain('Son S/ 3.00 del transporte')
    expect(texto(o, 'destination', 'outside')).not.toContain('S/ 3.00')
  })

  it('ya cobrado, nadie recibe el aviso de pago', () => {
    const o = orden({ payer: 'destination', transportCollected: true })
    expect(texto(o, 'destination', 'outside')).not.toContain('S/ 3.00')
  })

  it('saluda por el nombre, salvo el de relleno «Quien recibe»', () => {
    expect(texto(orden(), 'destination', 'outside')).toMatch(/^Hola Lucía, /)
    const sinNombre = orden({ destination: { ...orden().destination, name: 'Quien recibe' } })
    expect(texto(sinNombre, 'destination', 'outside')).toMatch(/^Hola, soy/)
  })
})
