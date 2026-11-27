// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type OrderVM, pagoUnicoView } from '@/lib/orders/view-model'
import { PagoUnicoCard } from '../pago-unico-card'

const getProofUrl = vi.fn<(rowId: string, path: string) => Promise<string | null>>()
vi.mock('../../lib/proof-url', () => ({
  getProofUrl: (rowId: string, path: string) => getProofUrl(rowId, path),
}))

afterEach(() => {
  cleanup()
  getProofUrl.mockReset()
})

function pedido(over: Partial<OrderVM> = {}): OrderVM {
  return {
    rowId: 'row-a',
    id: 'AAAAAAAA',
    source: 'online',
    payment: 'pending_wallet',
    status: 'heading_to_restaurant',
    method: 'delivery',
    total: 25,
    customer: 'Ana',
    yaCobrado: false,
    paymentReal: null,
    proofStatus: 'pending',
    proofUrl: 'a/captura.jpg',
    proofAttempt: 1,
    ...over,
  } as unknown as OrderVM
}

function conVista(order: OrderVM) {
  const view = pagoUnicoView(order)
  if (!view) throw new Error('el pedido de prueba debe tener pago único')
  return view
}

function diferido<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('PagoUnicoCard (negocios)', () => {
  it('CAX-004: la captura de A que llega tarde no se pinta sobre el pedido B', async () => {
    const a = diferido<string | null>()
    const b = diferido<string | null>()
    getProofUrl.mockImplementation((rowId) => (rowId === 'row-a' ? a.promise : b.promise))
    const A = pedido({ rowId: 'row-a', proofUrl: 'a/captura.jpg' })
    const B = pedido({ rowId: 'row-b', proofUrl: 'b/captura.jpg' })

    const { rerender } = render(
      <PagoUnicoCard order={A} view={conVista(A)} onConfirm={async () => true} busy={false} />,
    )
    // Sin `key`: es justo el caso que la limpieza del efecto debe resolver sola.
    rerender(
      <PagoUnicoCard order={B} view={conVista(B)} onConfirm={async () => true} busy={false} />,
    )

    b.resolve('https://firmada/b.jpg')
    await waitFor(() =>
      expect(screen.getByAltText('Captura del cliente').getAttribute('src')).toBe(
        'https://firmada/b.jpg',
      ),
    )
    a.resolve('https://firmada/a.jpg')
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.getByAltText('Captura del cliente').getAttribute('src')).toBe(
      'https://firmada/b.jpg',
    )
  })

  async function confirmar() {
    fireEvent.click(screen.getByRole('button', { name: 'Ya me llegó el pago' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sí, me llegó' }))
  }
  const sinCaptura = () => pedido({ proofUrl: null, proofStatus: null, proofAttempt: 0 })

  it('CAX-006: si la confirmación se pierde (devuelve false) no dice «paga en la puerta»', async () => {
    const order = sinCaptura()
    render(
      <PagoUnicoCard
        order={order}
        view={conVista(order)}
        onConfirm={async () => false}
        busy={false}
      />,
    )
    // Antes de confirmar sí dice que puede pagar en la puerta.
    expect(screen.getByText(/Puede pagar al motorizado/)).toBeTruthy()
    await confirmar()
    await waitFor(() =>
      expect(screen.getByText(/No sabemos si se guardó tu confirmación/)).toBeTruthy(),
    )
    expect(screen.queryByText(/paga en la puerta/i)).toBeNull()
    expect(screen.queryByText(/Puede pagar al motorizado/)).toBeNull()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Volver a confirmar' })).toBeTruthy(),
    )
  })

  it('CAX-006: si la confirmación lanza un error tampoco dice «paga en la puerta»', async () => {
    const order = sinCaptura()
    render(
      <PagoUnicoCard
        order={order}
        view={conVista(order)}
        onConfirm={async () => {
          throw new Error('sin red')
        }}
        busy={false}
      />,
    )
    await confirmar()
    await waitFor(() =>
      expect(screen.getByText(/No sabemos si se guardó tu confirmación/)).toBeTruthy(),
    )
    expect(screen.queryByText(/paga en la puerta/i)).toBeNull()
    expect(screen.queryByText(/Puede pagar al motorizado/)).toBeNull()
  })
})
