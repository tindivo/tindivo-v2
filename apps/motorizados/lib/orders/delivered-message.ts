import { soles } from '@/lib/format'

/**
 * Lo que dice el aviso tras entregar. Una sola fuente para la ficha y para
 * «Míos»: es el momento en que el motorizado ve cuánto efectivo se lleva, y que
 * dos pantallas lo calculen por separado es cómo dejan de coincidir.
 */
export function deliveredMessage(
  order: {
    shortId: string
    paymentIntent: string | null
    orderAmount: number
    deliveryFee: number
    cashAmount: number | null
  },
  params: { paymentReal?: string; cashAmount?: number },
): string {
  const paymentReal = params.paymentReal ?? order.paymentIntent
  let cashOwed = 0
  if (paymentReal === 'paid_cash') {
    cashOwed = order.orderAmount + order.deliveryFee
  } else if (paymentReal === 'paid_mixed') {
    cashOwed = Number(params.cashAmount ?? order.cashAmount ?? 0)
  }

  return cashOwed > 0
    ? `Pedido #${order.shortId} entregado · Cobraste ${soles(cashOwed)} en efectivo`
    : `Pedido #${order.shortId} entregado con éxito`
}
