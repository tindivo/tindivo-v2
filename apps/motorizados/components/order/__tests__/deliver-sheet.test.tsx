// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchOrderDetail } from '@/lib/orders/detail-cache'
import type { OrderDetailResponse } from '@/lib/types'
import { DeliverSheet } from '../deliver-sheet'

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
const confirmada = () => orden({ paymentVerifiedAt: '2026-11-27T20:00:00Z' })
const detalle = (order: Order) =>
  ({
    order,
    business: { name: 'Pollería', yapeNumber: null, paymentQrs: [] },
  }) as unknown as OrderDetailResponse

type Diferido = {
  promise: Promise<OrderDetailResponse>
  resolve: (v: OrderDetailResponse) => void
  reject: (e: unknown) => void
}
// Cada llamada a `fetchOrderDetail` crea una lectura que la prueba resuelve o
// rechaza a mano, en el orden que pide el caso.
let lecturas: Diferido[] = []

beforeEach(() => {
  lecturas = []
  fetchMock.mockImplementation(() => {
    let resolve!: Diferido['resolve']
    let reject!: Diferido['reject']
    const promise = new Promise<OrderDetailResponse>((res, rej) => {
      resolve = res
      reject = rej
    })
    lecturas.push({ promise, resolve, reject })
    return promise
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  fetchMock.mockReset()
})

function hoja(order: Order) {
  const onConfirm = vi.fn()
  const props = { busy: false, onConfirm, onNoShow: vi.fn(), onClose: vi.fn() }
  const ui = (o: Order) => <DeliverSheet detail={detalle(o)} {...props} />
  const view = render(ui(order))
  return { ...view, onConfirm, ui }
}

const flush = () => act(async () => {})
const confirmar = () => screen.getByRole('button', { name: /Confirmar entrega|Comprobando/ })

describe('DeliverSheet (cobro en la puerta)', () => {
  type Respuesta = 'collect' | 'falla' | 'vence'
  const casos: Respuesta[] = ['collect', 'falla', 'vence']

  it.each(
    casos,
  )('CAX-001: la confirmación llegó mientras la relectura (%s) seguía en vuelo: no se pide método ni se envía efectivo', async (respuesta) => {
    vi.useFakeTimers()
    const { rerender, onConfirm, ui } = hoja(orden())
    expect(lecturas).toHaveLength(1)
    expect(confirmar().hasAttribute('disabled')).toBe(true)

    rerender(ui(confirmada()))
    await act(async () => {
      if (respuesta === 'collect') lecturas[0]?.resolve(detalle(orden()))
      else if (respuesta === 'falla') lecturas[0]?.reject(new Error('sin señal'))
      else await vi.advanceTimersByTimeAsync(4000)
    })

    expect(screen.queryByText('Tal cual lo planeado')).toBeNull()
    expect(screen.queryByText('Cambió el método')).toBeNull()
    expect(screen.queryByText(/No pudimos comprobar/)).toBeNull()
    expect(screen.getByText('El restaurante ya confirmó el pago. No cobres nada.')).toBeTruthy()
    expect(confirmar().hasAttribute('disabled')).toBe(false)

    fireEvent.click(confirmar())
    await flush()
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith({ paymentReal: 'paid_yape' })
    expect(lecturas).toHaveLength(1)
  })

  it('CAX-002: «Cambió el método» con un mixto inválido no bloquea cuando el negocio confirmó', async () => {
    const { rerender, onConfirm, ui } = hoja(orden())
    fireEvent.click(screen.getByText('Cambió el método'))
    fireEvent.click(screen.getByText('Los dos'))
    expect(screen.getByText(/Las dos partes deben sumar/)).toBeTruthy()

    rerender(ui(confirmada()))
    await act(async () => lecturas[0]?.resolve(detalle(orden())))

    expect(confirmar().hasAttribute('disabled')).toBe(false)
    fireEvent.click(confirmar())
    await flush()
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm.mock.calls[0]?.[0]).toStrictEqual({ paymentReal: 'paid_yape' })
  })

  it('CAX-002: «Cambió el método» con un billete insuficiente no bloquea cuando el negocio confirmó', async () => {
    const { rerender, onConfirm, ui } = hoja(orden())
    fireEvent.click(screen.getByText('Cambió el método'))
    fireEvent.click(screen.getByText('Efectivo'))
    fireEvent.change(screen.getByPlaceholderText('Opcional'), { target: { value: '5' } })
    expect(screen.getByText(/No cubre los/)).toBeTruthy()

    rerender(ui(confirmada()))
    await act(async () => lecturas[0]?.resolve(detalle(orden())))

    expect(confirmar().hasAttribute('disabled')).toBe(false)
    fireEvent.click(confirmar())
    await flush()
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm.mock.calls[0]?.[0]).toStrictEqual({ paymentReal: 'paid_yape' })
  })

  it('CAX-003: si la hoja se desmonta durante la relectura del toque, no se envía nada', async () => {
    const { unmount, onConfirm } = hoja(orden())
    await act(async () => lecturas[0]?.resolve(detalle(orden())))

    fireEvent.click(confirmar())
    await flush()
    expect(lecturas).toHaveLength(2)

    unmount()
    await act(async () => lecturas[1]?.resolve(detalle(orden())))
    await flush()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('CAX-005: el pedido manual pending_yape cobra como en la base: no relee, no avisa y envía lo planeado', async () => {
    fetchMock.mockRejectedValue(new Error('sin señal'))
    const { onConfirm } = hoja(orden({ isManual: true }))
    await flush()

    expect(screen.queryByText(/No pudimos comprobar/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar entrega' }))
    await flush()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText(/No pudimos comprobar/)).toBeNull()
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm.mock.calls[0]?.[0]).toStrictEqual({ paymentReal: 'paid_yape' })
  })

  it('carrera negocio→motorizado: la relectura del toque trae la confirmación, no se envía y el segundo toque sí', async () => {
    const { onConfirm } = hoja(orden())
    await act(async () => lecturas[0]?.resolve(detalle(orden())))

    fireEvent.click(confirmar())
    await flush()
    await act(async () => lecturas[1]?.resolve(detalle(confirmada())))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(
      screen.getByText('El restaurante acaba de confirmar el pago. No cobres nada.'),
    ).toBeTruthy()

    fireEvent.click(confirmar())
    await flush()
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith({ paymentReal: 'paid_yape' })
  })

  it('relectura del toque EN VUELO: llegan props confirmadas y la relectura responde collect: no se envía efectivo ni mixto, queda «No cobres nada» y el siguiente toque envía lo confirmado', async () => {
    const { rerender, onConfirm, ui } = hoja(orden())
    await act(async () => lecturas[0]?.resolve(detalle(orden())))

    fireEvent.click(confirmar())
    await flush()
    expect(lecturas).toHaveLength(2)

    rerender(ui(confirmada()))
    await act(async () => lecturas[1]?.resolve(detalle(orden())))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.queryByText('Tal cual lo planeado')).toBeNull()
    expect(screen.queryByText('Cambió el método')).toBeNull()
    expect(screen.getByText('El restaurante ya confirmó el pago. No cobres nada.')).toBeTruthy()

    fireEvent.click(confirmar())
    await flush()
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith({ paymentReal: 'paid_yape' })
  })

  it('aviso antes de enviar: si la relectura del toque falla y el aviso no estaba, el primer toque solo lo muestra y el segundo envía', async () => {
    const { onConfirm } = hoja(orden())
    await act(async () => lecturas[0]?.resolve(detalle(orden())))
    expect(screen.queryByText(/No pudimos comprobar/)).toBeNull()

    fireEvent.click(confirmar())
    await flush()
    await act(async () => lecturas[1]?.reject(new Error('sin señal')))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(screen.getByText(/No pudimos comprobar/)).toBeTruthy()

    fireEvent.click(confirmar())
    await flush()
    await act(async () => lecturas[2]?.reject(new Error('sin señal')))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith({ paymentReal: 'paid_yape' })
  })
})
