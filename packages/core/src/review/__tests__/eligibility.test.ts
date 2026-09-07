import { describe, expect, it } from 'vitest'
import { pickPendingReview, type ReviewableOrder, reviewEligibility } from '../eligibility'

const VENTANA = 21

/** Pedido entregado hace `dias`, sin reseña ni descarte. Base de los casos. */
function pedido(dias: number, extra: Partial<ReviewableOrder> = {}): ReviewableOrder {
  return {
    orderId: `o-${dias}`,
    status: 'delivered',
    deliveredAt: new Date(Date.now() - dias * 86_400_000),
    hasReview: false,
    dismissedAt: null,
    ...extra,
  }
}

describe('reviewEligibility — cuándo se puede calificar un pedido', () => {
  const ahora = new Date()

  it('un pedido entregado dentro de la ventana está abierto', () => {
    const r = reviewEligibility(pedido(2), ahora, VENTANA)
    expect(r.kind).toBe('open')
  })

  it('devuelve cuándo se cierra la ventana, para que la UI no tenga que calcularlo', () => {
    const entregado = new Date('2026-09-01T00:00:00Z')
    const r = reviewEligibility(
      pedido(0, { deliveredAt: entregado }),
      new Date('2026-09-02T00:00:00Z'),
      VENTANA,
    )
    expect(r).toEqual({ kind: 'open', closesAt: new Date('2026-09-22T00:00:00Z') })
  })

  it('un pedido que no llegó a delivered no se califica', () => {
    // Cubre los dos motivos distintos: sigue vivo, o se canceló.
    expect(reviewEligibility(pedido(1, { status: 'preparing' }), ahora, VENTANA).kind).toBe(
      'not_delivered',
    )
    expect(reviewEligibility(pedido(1, { status: 'cancelled' }), ahora, VENTANA).kind).toBe(
      'not_delivered',
    )
  })

  it('delivered sin delivered_at no se califica (dato inconsistente, no se adivina)', () => {
    expect(reviewEligibility(pedido(1, { deliveredAt: null }), ahora, VENTANA).kind).toBe(
      'not_delivered',
    )
  })

  it('fuera de la ventana caduca', () => {
    expect(reviewEligibility(pedido(22), ahora, VENTANA).kind).toBe('expired')
  })

  it('el borde de la ventana es inclusivo hasta el instante exacto', () => {
    const entregado = new Date('2026-09-01T00:00:00Z')
    const justo = new Date('2026-09-22T00:00:00Z') // +21d exactos
    const pasado = new Date('2026-09-22T00:00:01Z')
    expect(reviewEligibility(pedido(0, { deliveredAt: entregado }), justo, VENTANA).kind).toBe(
      'open',
    )
    expect(reviewEligibility(pedido(0, { deliveredAt: entregado }), pasado, VENTANA).kind).toBe(
      'expired',
    )
  })

  it('un pedido ya calificado no se vuelve a calificar', () => {
    expect(reviewEligibility(pedido(1, { hasReview: true }), ahora, VENTANA).kind).toBe(
      'already_reviewed',
    )
  })

  it('ya calificado gana a caducado: el motivo que se le muestra al cliente es el suyo', () => {
    expect(reviewEligibility(pedido(30, { hasReview: true }), ahora, VENTANA).kind).toBe(
      'already_reviewed',
    )
  })

  it('el descarte cierra la puerta a preguntar, pero no a calificar si el cliente entra solo', () => {
    // Descartar es "no me preguntes", no "no quiero opinar". La ventana sigue
    // abierta para quien entra por su cuenta desde el historial.
    expect(reviewEligibility(pedido(1, { dismissedAt: new Date() }), ahora, VENTANA).kind).toBe(
      'open',
    )
  })
})

describe('pickPendingReview — por cuál preguntar, si hay varios', () => {
  const ahora = new Date()

  it('sin pedidos, no se pregunta nada', () => {
    expect(pickPendingReview([], ahora, VENTANA)).toBeNull()
  })

  it('pregunta por el más reciente, no por el más viejo', () => {
    const elegido = pickPendingReview([pedido(9), pedido(1), pedido(5)], ahora, VENTANA)
    expect(elegido?.orderId).toBe('o-1')
  })

  it('nunca acumula cola: los demás pendientes se dejan caducar en silencio', () => {
    const candidatos = [pedido(1), pedido(2), pedido(3)]
    expect(pickPendingReview(candidatos, ahora, VENTANA)?.orderId).toBe('o-1')
  })

  it('salta los descartados aunque sean los más recientes', () => {
    const elegido = pickPendingReview(
      [pedido(1, { dismissedAt: new Date() }), pedido(4)],
      ahora,
      VENTANA,
    )
    expect(elegido?.orderId).toBe('o-4')
  })

  it('salta los ya calificados, los caducados y los que no se entregaron', () => {
    const elegido = pickPendingReview(
      [pedido(1, { hasReview: true }), pedido(2, { status: 'cancelled' }), pedido(40), pedido(6)],
      ahora,
      VENTANA,
    )
    expect(elegido?.orderId).toBe('o-6')
  })

  it('si no queda ninguno elegible, devuelve null en vez de una tarjeta vacía', () => {
    expect(
      pickPendingReview([pedido(1, { hasReview: true }), pedido(40)], ahora, VENTANA),
    ).toBeNull()
  })
})
