// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type OrderVM, pagoUnicoView } from '@/lib/orders/view-model'
import {
  confirmationOutcome,
  rememberConfirmation,
  resetConfirmationMemoryForTests,
} from '../../lib/payment-confirmation-memory'
import { PagoUnicoCard } from '../pago-unico-card'

const getProofUrl = vi.fn<(rowId: string, path: string) => Promise<string | null>>()
vi.mock('../../lib/proof-url', () => ({
  getProofUrl: (rowId: string, path: string) => getProofUrl(rowId, path),
}))

afterEach(() => {
  cleanup()
  getProofUrl.mockReset()
  resetConfirmationMemoryForTests()
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
      <PagoUnicoCard
        order={A}
        view={conVista(A)}
        onConfirm={async () => 'confirmed' as const}
        busy={false}
      />,
    )
    // Sin `key`: es justo el caso que la limpieza del efecto debe resolver sola.
    rerender(
      <PagoUnicoCard
        order={B}
        view={conVista(B)}
        onConfirm={async () => 'confirmed' as const}
        busy={false}
      />,
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

  it('CAX-006: si la confirmación se pierde (devuelve «uncertain») no dice «paga en la puerta»', async () => {
    const order = sinCaptura()
    render(
      <PagoUnicoCard
        order={order}
        view={conVista(order)}
        onConfirm={async () => 'uncertain' as const}
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

  it('CAX-006: el servidor confirmó pero el pedido sigue viejo (captura_rechazada): dice «Ingreso confirmado» y no «paga en la puerta»', async () => {
    const order = pedido({ proofStatus: 'rejected', proofAttempt: 2 })
    render(
      <PagoUnicoCard
        order={order}
        view={conVista(order)}
        onConfirm={async () => 'confirmed' as const}
        busy={false}
      />,
    )
    expect(screen.getByText(/paga en la puerta/i)).toBeTruthy()
    await confirmar()
    await waitFor(() => expect(screen.getByText(/Ingreso confirmado/)).toBeTruthy())
    expect(screen.queryByText(/paga en la puerta/i)).toBeNull()
  })

  // CAX-006 (R2): el resultado vive por pedido, fuera de la tarjeta. Cerrar y
  // reabrir, o pasar A→B→A con el tablero viejo, no lo borra.
  function tarjeta(order: OrderVM, onConfirm: () => Promise<'confirmed' | 'uncertain'>) {
    return (
      <PagoUnicoCard
        key={order.rowId}
        order={order}
        view={conVista(order)}
        onConfirm={onConfirm}
        onReject={() => {}}
        busy={false}
      />
    )
  }

  it('CAX-006: confirmado por la respuesta, cerrar y reabrir con el tablero viejo sigue diciendo «Ingreso confirmado»', async () => {
    const viejo = pedido({ proofStatus: 'rejected', proofAttempt: 2 })
    const first = render(tarjeta(viejo, async () => 'confirmed' as const))
    await confirmar()
    await waitFor(() => expect(screen.getByText(/Ingreso confirmado/)).toBeTruthy())
    first.unmount()

    render(tarjeta(viejo, async () => 'confirmed' as const))
    expect(screen.getByText(/Ingreso confirmado/)).toBeTruthy()
    expect(screen.queryByText(/paga en la puerta/i)).toBeNull()
  })

  it('CAX-006: confirmado en A, pasar a B y volver a A con el tablero viejo no reaparece «paga en la puerta»', async () => {
    const a = pedido({ proofStatus: 'rejected', proofAttempt: 2 })
    const b = pedido({ rowId: 'row-b', id: 'BBBBBBBB', proofStatus: 'rejected', proofAttempt: 2 })
    const { rerender } = render(tarjeta(a, async () => 'confirmed' as const))
    await confirmar()
    await waitFor(() => expect(screen.getByText(/Ingreso confirmado/)).toBeTruthy())

    rerender(tarjeta(b, async () => 'confirmed' as const))
    // B no hereda la confirmación de A.
    expect(screen.getByText(/paga en la puerta/i)).toBeTruthy()

    rerender(tarjeta(a, async () => 'confirmed' as const))
    expect(screen.getByText(/Ingreso confirmado/)).toBeTruthy()
    expect(screen.queryByText(/paga en la puerta/i)).toBeNull()
  })

  it('CAX-006: incierto, cerrar y reabrir sigue sin instrucción de cobro; volver a confirmar lo resuelve', async () => {
    const viejo = sinCaptura()
    const first = render(tarjeta(viejo, async () => 'uncertain' as const))
    await confirmar()
    await waitFor(() =>
      expect(screen.getByText(/No sabemos si se guardó tu confirmación/)).toBeTruthy(),
    )
    first.unmount()

    render(tarjeta(viejo, async () => 'confirmed' as const))
    expect(screen.getByText(/No sabemos si se guardó tu confirmación/)).toBeTruthy()
    expect(screen.queryByText(/Puede pagar al motorizado/)).toBeNull()
    expect(screen.queryByText(/paga en la puerta/i)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Volver a confirmar' }))
    await waitFor(() => expect(screen.getByText(/Ingreso confirmado/)).toBeTruthy())
    expect(confirmationOutcome(viejo.rowId)).toBe('confirmed')
  })

  it('CAX-006: cuando el tablero ya trae el pago confirmado, la memoria se reconcilia y se borra', async () => {
    const viejo = sinCaptura()
    const { rerender } = render(tarjeta(viejo, async () => 'uncertain' as const))
    await confirmar()
    await waitFor(() => expect(confirmationOutcome(viejo.rowId)).toBe('uncertain'))

    rerender(tarjeta({ ...viejo, yaCobrado: true }, async () => 'confirmed' as const))
    await waitFor(() => expect(confirmationOutcome(viejo.rowId)).toBeUndefined())
    expect(screen.getByText(/Ingreso confirmado/)).toBeTruthy()
  })

  it('CAX-006: una respuesta incierta posterior no rebaja lo ya confirmado', () => {
    rememberConfirmation('row-a', 'confirmed', 1)
    rememberConfirmation('row-a', 'uncertain', 1)
    rememberConfirmation('row-a', 'uncertain', 2)
    expect(confirmationOutcome('row-a')).toBe('confirmed')
    const viejo = pedido({ proofStatus: 'rejected', proofAttempt: 2 })
    render(tarjeta(viejo, async () => 'uncertain' as const))
    expect(screen.getByText(/Ingreso confirmado/)).toBeTruthy()
    expect(screen.queryByText(/paga en la puerta/i)).toBeNull()
  })

  it('CAX-006: lo incierto de un intento no tapa la captura nueva: se puede revisar y rechazar', async () => {
    const intento1 = pedido({ proofStatus: 'rejected', proofAttempt: 1 })
    const { rerender } = render(tarjeta(intento1, async () => 'uncertain' as const))
    await confirmar()
    await waitFor(() =>
      expect(screen.getByText(/No sabemos si se guardó tu confirmación/)).toBeTruthy(),
    )
    getProofUrl.mockResolvedValue('https://firmada/b.jpg')
    rerender(
      tarjeta(
        pedido({ proofStatus: 'pending', proofAttempt: 2, proofUrl: 'a/captura-2.jpg' }),
        async () => 'uncertain' as const,
      ),
    )
    expect(screen.getByText('El cliente envió su captura')).toBeTruthy()
    expect(screen.queryByText(/No sabemos si se guardó tu confirmación/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Rechazar captura' })).toBeTruthy()
  })
})
