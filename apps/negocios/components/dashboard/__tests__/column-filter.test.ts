import { describe, expect, it } from 'vitest'
import type { OrderVM } from '@/lib/orders/view-model'
import { calculateColumnFilterCounts, matchesColumnFilter } from '../column-filter'

describe('column-filter-dropdown', () => {
  const mockOrders: OrderVM[] = [
    {
      rowId: '1',
      id: 'DEL1',
      method: 'delivery',
      source: 'web',
      status: 'preparing',
      state: 'cooking',
      payment: 'prepaid',
      customer: 'Cliente 1',
      phone: '999',
      address: 'Calle 1',
      addressRef: null,
      total: 20,
      amount: 20,
      subtotal: 16,
      deliveryFee: 4,
      countdownSec: 100,
      prepMinutes: 15,
      minutesLeft: 10,
      readySec: 100,
      waitingCustomerSec: null,
      pickupTiming: null,
      yaCobrado: true,
      paymentReal: null,
      deliverySec: null,
      bufferMinutes: null,
      pickupMinAgo: null,
      driver: null,
      paysWith: null,
      cashChange: null,
      walletPart: null,
      cashPart: null,
      requiresValidation: false,
      validationReasonCode: null,
      riskFlags: {},
      extensionUsed: false,
      extensionMin: null,
      readyEarly: false,
    },
    {
      rowId: '2',
      id: 'PICK1',
      method: 'pickup',
      source: 'web',
      status: 'preparing',
      state: 'cooking',
      payment: 'pending_wallet',
      customer: 'Cliente 2',
      phone: '888',
      address: null,
      addressRef: null,
      total: 25,
      amount: 25,
      subtotal: 25,
      deliveryFee: 0,
      countdownSec: 200,
      prepMinutes: 20,
      minutesLeft: 15,
      readySec: 200,
      waitingCustomerSec: null,
      pickupTiming: 'now',
      yaCobrado: false,
      paymentReal: null,
      deliverySec: null,
      bufferMinutes: null,
      pickupMinAgo: null,
      driver: null,
      paysWith: null,
      cashChange: null,
      walletPart: null,
      cashPart: null,
      requiresValidation: false,
      validationReasonCode: null,
      riskFlags: {},
      extensionUsed: false,
      extensionMin: null,
      readyEarly: false,
    },
    {
      rowId: '3',
      id: 'MAN1',
      method: 'delivery',
      source: 'manual',
      status: 'preparing',
      state: 'cooking',
      payment: 'pending_cash',
      customer: 'Cliente 3',
      phone: '777',
      address: null,
      addressRef: 'Frente a la plaza',
      total: 30,
      amount: 30,
      subtotal: 26,
      deliveryFee: 4,
      countdownSec: 300,
      prepMinutes: 25,
      minutesLeft: 20,
      readySec: 300,
      waitingCustomerSec: null,
      pickupTiming: null,
      yaCobrado: false,
      paymentReal: null,
      deliverySec: null,
      bufferMinutes: null,
      pickupMinAgo: null,
      driver: null,
      paysWith: 50,
      cashChange: 20,
      walletPart: null,
      cashPart: null,
      requiresValidation: false,
      validationReasonCode: null,
      riskFlags: {},
      extensionUsed: false,
      extensionMin: null,
      readyEarly: false,
    },
  ]

  it('matchesColumnFilter filtra correctamente por cada opción', () => {
    // all
    expect(matchesColumnFilter(mockOrders[0], 'all')).toBe(true)
    expect(matchesColumnFilter(mockOrders[1], 'all')).toBe(true)
    expect(matchesColumnFilter(mockOrders[2], 'all')).toBe(true)

    // delivery
    expect(matchesColumnFilter(mockOrders[0], 'delivery')).toBe(true)
    expect(matchesColumnFilter(mockOrders[1], 'delivery')).toBe(false)
    expect(matchesColumnFilter(mockOrders[2], 'delivery')).toBe(true)

    // pickup
    expect(matchesColumnFilter(mockOrders[0], 'pickup')).toBe(false)
    expect(matchesColumnFilter(mockOrders[1], 'pickup')).toBe(true)
    expect(matchesColumnFilter(mockOrders[2], 'pickup')).toBe(false)

    // manual
    expect(matchesColumnFilter(mockOrders[0], 'manual')).toBe(false)
    expect(matchesColumnFilter(mockOrders[1], 'manual')).toBe(false)
    expect(matchesColumnFilter(mockOrders[2], 'manual')).toBe(true)
  })

  it('calculateColumnFilterCounts cuenta exactamente las tarjetas de cada tipo', () => {
    const counts = calculateColumnFilterCounts(mockOrders)
    expect(counts.all).toBe(3)
    expect(counts.delivery).toBe(2)
    expect(counts.pickup).toBe(1)
    expect(counts.manual).toBe(1)
  })
})
