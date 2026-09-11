import { describe, expect, it } from 'vitest'
import type { OrderVM } from '@/lib/orders/view-model'
import { buildComandaHtml } from '../comanda-ticket'
import type { DetailItem } from '../types'

describe('buildComandaHtml', () => {
  const baseOrder: OrderVM = {
    rowId: 'row-123',
    id: 'F4A2',
    source: 'web',
    payment: 'pending_cash',
    status: 'preparing',
    state: 'cooking',
    customer: 'Carlos Ramírez',
    phone: '987654321',
    address: 'Jr. Comercio 123',
    addressRef: 'Frente al parque',
    method: 'delivery',
    total: 35.5,
    amount: 32,
    subtotal: 32,
    deliveryFee: 3.5,
    countdownSec: 600,
    prepMinutes: 25,
    minutesLeft: 10,
    readySec: 600,
    waitingCustomerSec: null,
    pickupTiming: null,
    yaCobrado: false,
    paymentReal: null,
    deliverySec: null,
    bufferMinutes: null,
    pickupMinAgo: null,
    driver: { name: 'Luis Moto' },
    paysWith: 50,
    cashChange: 14.5,
    walletPart: null,
    cashPart: null,
    requiresValidation: false,
    validationReasonCode: null,
    riskFlags: {},
    extensionUsed: false,
    extensionMin: null,
    readyEarly: false,
  }

  const items: DetailItem[] = [
    {
      qty: 2,
      name: 'Lomo Saltado',
      mods: 'Papas fritas extra',
      note: 'Sin cebolla, bien cocido',
      price: 16,
    },
  ]

  it('formatea comanda de MOTORIZADO con datos completos de despacho, precios y cobro', () => {
    const html = buildComandaHtml({
      order: baseOrder,
      items,
      bizName: 'Al Punto',
      mode: 'motorizado',
    })

    expect(html).toContain('TINDIVO · SAN JACINTO')
    expect(html).toContain('AL PUNTO')
    expect(html).toContain('PEDIDO: #F4A2')
    expect(html).toContain('DELIVERY')
    expect(html).toContain('Carlos Ramírez')
    expect(html).toContain('987654321')
    expect(html).toContain('Jr. Comercio 123')
    expect(html).toContain('Frente al parque')
    expect(html).toContain('Luis Moto')
    expect(html).toContain('[ 2x ]')
    expect(html).toContain('Lomo Saltado')
    expect(html).toContain('Papas fritas extra')
    expect(html).toContain('*** NOTA: Sin cebolla, bien cocido ***')
    expect(html).toContain('S/ 32.00')
    expect(html).toContain('S/ 3.50')
    expect(html).toContain('TOTAL A COBRAR:')
    expect(html).toContain('S/ 35.50')
    expect(html).toContain('EFECTIVO')
    expect(html).toContain('Paga con:')
    expect(html).toContain('S/ 50.00')
    expect(html).toContain('Vuelto a dar:')
    expect(html).toContain('S/ 14.50')

    // Pie de ticket sin Áncash
    expect(html).toContain('¡Buen provecho! · Tindivo Delivery')
    expect(html).toContain('tindivo.com · San Jacinto')
    expect(html).not.toContain('Áncash')
    expect(html).not.toContain('Ancash')
  })

  it('formatea comanda de COCINA enfocada en preparación (sin precios, sin totales, sin dirección)', () => {
    const html = buildComandaHtml({
      order: baseOrder,
      items,
      bizName: 'Al Punto',
      mode: 'cocina',
    })

    // Datos que COCINA sí necesita
    expect(html).toContain('*** COMANDA COCINA ***')
    expect(html).toContain('#F4A2')
    expect(html).toContain('AL PUNTO')
    expect(html).toContain('DELIVERY')
    expect(html).toContain('CLIENTE')
    expect(html).toContain('Carlos Ramírez')
    expect(html).toContain('[ 2x ]')
    expect(html).toContain('LOMO SALTADO')
    expect(html).toContain('PAPAS FRITAS EXTRA')
    expect(html).toContain('*** NOTA: SIN CEBOLLA, BIEN COCIDO ***')

    // Datos que COCINA NO debe ver (privacidad, espacio y foco operativo)
    expect(html).not.toContain('S/ 32.00')
    expect(html).not.toContain('S/ 3.50')
    expect(html).not.toContain('S/ 35.50')
    expect(html).not.toContain('TOTAL A COBRAR')
    expect(html).not.toContain('Jr. Comercio 123')
    expect(html).not.toContain('Frente al parque')
    expect(html).not.toContain('Luis Moto')
    expect(html).not.toContain('Paga con:')
    expect(html).not.toContain('Vuelto a dar:')

    // Pie de ticket sin Áncash
    expect(html).toContain('¡Buen provecho! · Tindivo Delivery')
    expect(html).toContain('tindivo.com · San Jacinto')
    expect(html).not.toContain('Áncash')
    expect(html).not.toContain('Ancash')
  })

  it('formatea comanda de RECOJO EN TIENDA prepago cuando cliente está en local', () => {
    const pickupOrder: OrderVM = {
      ...baseOrder,
      id: 'B109',
      method: 'pickup',
      pickupTiming: 'now',
      payment: 'prepaid',
      yaCobrado: true,
      deliveryFee: 0,
      total: 32,
    }

    const html = buildComandaHtml({
      order: pickupOrder,
      items,
      bizName: 'Al Punto',
      mode: 'motorizado',
    })

    expect(html).toContain('TINDIVO · SAN JACINTO')
    expect(html).toContain('AL PUNTO')
    expect(html).toContain('RECOJO EN TIENDA')
    expect(html).toContain('(CLIENTE EN EL LOCAL)')
    expect(html).not.toContain('DIRECCIÓN:')
    expect(html).toContain('PREPAGO (ONLINE / YAPE)')
    expect(html).toContain('*** [ ✓ YA PAGÓ - NO COBRAR ] ***')
  })

  it('formatea comanda con cobro de Billetera Digital (Yape / Plin)', () => {
    const walletOrder: OrderVM = {
      ...baseOrder,
      payment: 'pending_wallet',
      yaCobrado: false,
    }

    const html = buildComandaHtml({
      order: walletOrder,
      items,
      bizName: 'Al Punto',
    })

    expect(html).toContain('BILLETERA (YAPE / PLIN)')
    expect(html).toContain('*** COBRAR AL ENTREGAR: S/ 35.50 ***')
  })

  it('escapa caracteres especiales contra XSS', () => {
    const maliciousOrder: OrderVM = {
      ...baseOrder,
      id: '<script>alert(1)</script>',
      customer: '<b>Hack</b> & "More"',
    }

    const html = buildComandaHtml({
      order: maliciousOrder,
      items,
    })

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toContain('&lt;b&gt;Hack&lt;/b&gt; &amp; &quot;More&quot;')
  })

  it('utiliza tipografía sans-serif de alto contraste para cabezales térmicos', () => {
    const html = buildComandaHtml({
      order: baseOrder,
      items,
    })

    expect(html).toContain('font-family: Arial')
    expect(html).not.toContain('JetBrains Mono')
    expect(html).not.toContain('Courier New')
  })
})
