// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchOrderDetail } from '@/lib/orders/detail-cache'
import type { OrderDetailResponse } from '@/lib/types'
import { useDoorPayment } from '../use-door-payment'

vi.mock('@/lib/orders/detail-cache', () => ({ fetchOrderDetail: vi.fn() }))
const fetchMock = vi.mocked(fetchOrderDetail)

type Order = OrderDetailResponse['order']

function orden(over: Partial<Order> = {}): Order {
  return {
    id: 'ord-1',
    paymentIntent: 'pending_yape',
    isManual: false,
    orderAmount: 20,
    deliveryFee: 5,
    hasPaymentProof: false,
    paymentProofStatus: null,
    paymentVerifiedAt: null,
    ...over,
  } as unknown as Order
}
const confirmada = () => orden({ paymentVerifiedAt: '2026-11-27T20:00:00Z' })
const detalle = (order: Order) => ({ order }) as unknown as OrderDetailResponse

function diferido<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  fetchMock.mockReset()
})

describe('useDoorPayment', () => {
  type Respuesta = 'collect' | 'falla' | 'vence'
  const casos: Respuesta[] = ['collect', 'falla', 'vence']

  it.each(
    casos,
  )('CAX-001: con la confirmación llegada por props, la relectura que %s no la borra', async (respuesta) => {
    const lectura = diferido<OrderDetailResponse>()
    fetchMock.mockReturnValue(lectura.promise)
    const { result, rerender } = renderHook(({ order }) => useDoorPayment(order), {
      initialProps: { order: orden() },
    })
    expect(result.current.door.mode).toBe('collect')
    expect(result.current.checking).toBe(true)

    // Llegan props confirmadas con la relectura todavía en vuelo.
    rerender({ order: confirmada() })
    expect(result.current.door.mode).toBe('confirmed_by_business')

    await act(async () => {
      if (respuesta === 'collect') lectura.resolve(detalle(orden()))
      else if (respuesta === 'falla') lectura.reject(new Error('sin señal'))
      else await vi.advanceTimersByTimeAsync(4000)
    })

    expect(result.current.door.mode).toBe('confirmed_by_business')
    expect(result.current.checkFailed).toBe(false)
    expect(result.current.checking).toBe(false)
  })
})
