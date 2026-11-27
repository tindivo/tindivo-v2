// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchOrderDetail } from '@/lib/orders/detail-cache'
import type { OrderDetailResponse } from '@/lib/types'
import { CollectCard } from '../collect-card'

vi.mock('@/lib/orders/detail-cache', () => ({ fetchOrderDetail: vi.fn() }))
vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }))
const fetchMock = vi.mocked(fetchOrderDetail)

type Order = OrderDetailResponse['order']

function orden(over: Partial<Order> = {}): Order {
  return {
    id: 'ord-1',
    paymentIntent: 'pending_yape',
    isManual: false,
    orderAmount: 20,
    deliveryFee: 5,
    cashAmount: null,
    yapeAmount: null,
    clientPaysWith: null,
    changeToGive: null,
    hasPaymentProof: false,
    paymentProofStatus: null,
    paymentVerifiedAt: null,
    ...over,
  } as unknown as Order
}
const detalle = (order: Order) =>
  ({
    order,
    business: { name: 'Pollería', yapeNumber: '999888777', paymentQrs: [] },
  }) as unknown as OrderDetailResponse

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

describe('CollectCard', () => {
  it('CAX-005: el pedido manual cobra como en la base, sin releer ni avisar', async () => {
    fetchMock.mockRejectedValue(new Error('sin señal'))
    await act(async () => {
      render(<CollectCard detail={detalle(orden({ isManual: true }))} />)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText(/No pudimos comprobar/)).toBeNull()
    expect(screen.getByText('El cliente paga al Yape del restaurante')).toBeTruthy()
  })

  it('QR desactualizado: con pollMs, la relectura trae la confirmación y la tarjeta deja de mostrar el QR', async () => {
    const lecturas: ReturnType<typeof diferido<OrderDetailResponse>>[] = []
    fetchMock.mockImplementation(() => {
      const d = diferido<OrderDetailResponse>()
      lecturas.push(d)
      return d.promise
    })
    await act(async () => {
      render(<CollectCard detail={detalle(orden())} />)
    })
    // La del montaje sigue «cobra».
    await act(async () => {
      lecturas[0]?.resolve(detalle(orden()))
    })
    expect(screen.getByText('El cliente paga al Yape del restaurante')).toBeTruthy()

    // Pasa el intervalo: la nueva lectura trae al negocio confirmando.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(lecturas.length).toBeGreaterThanOrEqual(2)
    await act(async () => {
      lecturas[lecturas.length - 1]?.resolve(
        detalle(orden({ paymentVerifiedAt: '2026-11-27T20:00:00Z' })),
      )
    })
    expect(screen.queryByText('El cliente paga al Yape del restaurante')).toBeNull()
    expect(screen.getByText('El restaurante ya confirmó el pago. No cobres nada.')).toBeTruthy()
  })
})
