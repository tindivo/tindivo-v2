// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  confirmationOutcome,
  resetConfirmationMemoryForTests,
} from '@/features/pedidos/lib/payment-confirmation-memory'
import type { OrderVM } from '@/lib/orders/view-model'
import { type DetailActions, DetailScreen } from '../pedido-detail'

vi.mock('@/lib/supabase/client', () => ({ getSupabaseBrowser: () => ({}) }))
vi.mock('@/features/pedidos/lib/proof-url', () => ({ getProofUrl: async () => null }))

afterEach(() => {
  cleanup()
  resetConfirmationMemoryForTests()
})

function pedidoViejo(): OrderVM {
  return {
    rowId: 'row-a',
    id: 'AAAAAAAA',
    source: 'web',
    payment: 'pending_wallet',
    status: 'preparing',
    method: 'delivery',
    amount: 20,
    deliveryFee: 5,
    subtotal: 20,
    total: 25,
    customer: 'Ana',
    yaCobrado: false,
    paymentReal: null,
    proofStatus: 'rejected',
    proofUrl: null,
    proofAttempt: 2,
  } as unknown as OrderVM
}

// Cualquier acción no usada en la prueba es un no-op.
const actions = new Proxy(
  { onConfirmDeliveryPayment: async () => 'confirmed' as const },
  { get: (t, k) => (k in t ? t[k as keyof typeof t] : () => {}) },
) as unknown as DetailActions

describe('DetailScreen · pago único: nunca «cobra» y «confirmado» a la vez', () => {
  it('con el tablero viejo y la confirmación respondida, no queda nada que mande cobrar', async () => {
    const order = pedidoViejo()
    const { rerender } = render(
      <DetailScreen
        order={order}
        items={[]}
        proofUrl={null}
        paymentQrs={[]}
        busy={false}
        actions={actions}
      />,
    )
    expect(screen.getByText(/Cobrar con billetera digital/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Ya me llegó el pago' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sí, me llegó' }))
    await waitFor(() => expect(screen.getByText(/Ingreso confirmado/)).toBeTruthy())

    // El tablero sigue viejo: se vuelve a pintar con el mismo pedido.
    rerender(
      <DetailScreen
        order={{ ...order }}
        items={[]}
        proofUrl={null}
        paymentQrs={[]}
        busy={false}
        actions={actions}
      />,
    )
    expect(screen.getByText(/Ingreso confirmado/)).toBeTruthy()
    expect(screen.queryByText(/cobrar/i)).toBeNull()
    expect(screen.queryByText(/paga en la puerta/i)).toBeNull()
    // La tarjeta recibe el pedido crudo: la memoria no se borra sola.
    expect(confirmationOutcome('row-a')).toBe('confirmed')
  })
})
