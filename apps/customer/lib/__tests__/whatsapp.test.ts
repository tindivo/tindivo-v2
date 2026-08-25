import { describe, expect, it } from 'vitest'
import type { CartLine } from '@/lib/cart'
import { buildCartWhatsAppMessage } from '../whatsapp'

describe('buildCartWhatsAppMessage', () => {
  const sampleLines: CartLine[] = [
    {
      key: 'k-1',
      itemId: 'dish-1',
      name: '1/4 de Pollo a la brasa',
      unitPrice: 18.0,
      quantity: 1,
      modifiers: [
        { groupName: 'Papas', optionId: 'o1', optionName: 'Fritas', price: 0 },
        { groupName: 'Ensalada', optionId: 'o2', optionName: 'Clásica', price: 0 },
      ],
      note: 'Bastante ají',
      hue: 0,
      imageUrl: null,
    },
    {
      key: 'k-2',
      itemId: 'dish-2',
      name: 'Inka Cola 500ml',
      unitPrice: 4.5,
      quantity: 2,
      modifiers: [],
      note: null,
      hue: 0,
      imageUrl: null,
    },
  ]

  it('genera el mensaje limpio para usuario anónimo sin nombre ni dirección', () => {
    const msg = buildCartWhatsAppMessage('Pollería Nadia', sampleLines, 27.0)

    expect(msg).toContain('Hola Pollería Nadia 👋 Quiero hacer este pedido:')
    expect(msg).toContain('1× 1/4 de Pollo a la brasa — S/ 18.00')
    expect(msg).toContain('   • Papas: Fritas')
    expect(msg).toContain('   • Ensalada: Clásica')
    expect(msg).toContain('   Nota: Bastante ají')
    expect(msg).toContain('2× Inka Cola 500ml — S/ 9.00')
    expect(msg).toContain('*Total: S/ 27.00*')
    expect(msg).not.toContain('👤')
    expect(msg).not.toContain('📍')
    expect(msg).toContain('Pedido armado en el catálogo de Tindivo 🛍️')
  })

  it('incluye nombre y dirección default cuando el cliente tiene sesión y datos', () => {
    const msg = buildCartWhatsAppMessage('Pollería Nadia', sampleLines, 27.0, {
      name: 'Juan Pérez',
      addressLine: 'Jr. Comercio 123',
      addressReference: 'Frente a la plaza',
    })

    expect(msg).toContain('*Total: S/ 27.00*')
    expect(msg).toContain('👤 Juan Pérez')
    expect(msg).toContain('📍 Jr. Comercio 123 — Frente a la plaza')
    expect(msg).toContain('Pedido armado en el catálogo de Tindivo 🛍️')
  })

  it('incluye solo nombre si el cliente no tiene dirección guardada', () => {
    const msg = buildCartWhatsAppMessage('Pollería Nadia', sampleLines, 27.0, {
      name: 'María García',
    })

    expect(msg).toContain('👤 María García')
    expect(msg).not.toContain('📍')
  })

  it('incluye solo dirección si el nombre está vacío', () => {
    const msg = buildCartWhatsAppMessage('Pollería Nadia', sampleLines, 27.0, {
      addressReference: 'Casa verde con rejas negras',
    })

    expect(msg).not.toContain('👤')
    expect(msg).toContain('📍 Casa verde con rejas negras')
  })

  it('nunca incluye método de pago bajo ninguna circunstancia', () => {
    const msg = buildCartWhatsAppMessage('Pollería Nadia', sampleLines, 27.0, {
      name: 'Carlos',
      addressLine: 'Av. Principal 456',
    })

    expect(msg.toLowerCase()).not.toContain('efectivo')
    expect(msg.toLowerCase()).not.toContain('yape')
    expect(msg.toLowerCase()).not.toContain('plin')
    expect(msg.toLowerCase()).not.toContain('contraentrega')
  })
})
