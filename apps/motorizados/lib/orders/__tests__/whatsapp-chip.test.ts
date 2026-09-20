import { describe, expect, it } from 'vitest'
import { whatsappChip } from '../whatsapp-chip'

const order = {
  customer_phone: '987654321',
  customer_name: 'Rosa',
  business: { name: 'La Florencia' },
}

describe('whatsappChip', () => {
  it('con la comida encima ofrece «voy en camino»', () => {
    const chip = whatsappChip(order, 'carrying')
    expect(chip?.label).toBe('Avisar: voy en camino')
    expect(chip?.href).toContain('https://wa.me/51987654321')
    expect(decodeURIComponent(chip?.href ?? '')).toContain('Ya salí con tu pedido de La Florencia')
  })

  it('en la puerta ofrece «ya llegué»', () => {
    const chip = whatsappChip(order, 'atdoor')
    expect(chip?.label).toBe('Avisar: ya llegué')
    expect(decodeURIComponent(chip?.href ?? '')).toContain('Ya estoy afuera')
  })

  it('en los pasos previos a recoger no hay nada que avisar', () => {
    expect(whatsappChip(order, 'heading')).toBeNull()
    expect(whatsappChip(order, 'waiting')).toBeNull()
    expect(whatsappChip(order, null)).toBeNull()
  })

  it('sin un teléfono válido no hay chip', () => {
    expect(whatsappChip({ ...order, customer_phone: null }, 'carrying')).toBeNull()
    expect(whatsappChip({ ...order, customer_phone: '12345' }, 'carrying')).toBeNull()
    expect(whatsappChip({ ...order, customer_phone: undefined }, 'atdoor')).toBeNull()
  })

  it('sin nombre ni local saluda igual', () => {
    const chip = whatsappChip(
      { customer_phone: '987654321', customer_name: null, business: null },
      'carrying',
    )
    expect(decodeURIComponent(chip?.href ?? '')).toContain('Hola, soy tu repartidor')
  })
})
