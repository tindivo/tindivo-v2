/**
 * En qué paso del recorrido está un pedido MÍO.
 *
 * Son los cuatro que el gesto recorre, y solo uno no sale del estado: «en la
 * puerta» es `picked_up` con `arrived_at_customer_at` puesto (el servidor no
 * cambia el estado al llegar a la puerta, solo estampa la hora).
 */
export type MinePhase = 'heading' | 'waiting' | 'carrying' | 'atdoor'

export function minePhase(order: {
  status: string
  arrived_at_customer_at?: string | null
}): MinePhase | null {
  switch (order.status) {
    case 'heading_to_restaurant':
      return 'heading'
    case 'waiting_at_restaurant':
      return 'waiting'
    case 'picked_up':
      return order.arrived_at_customer_at ? 'atdoor' : 'carrying'
    default:
      return null
  }
}

/**
 * Soltar el pedido solo es posible antes de recogerlo. Con la comida recogida
 * `advance_order` lo rechaza («contacta a soporte»), así que ahí la tarjeta no
 * debe ofrecer el gesto: prometería algo que el servidor niega.
 */
export function canRelease(phase: MinePhase): boolean {
  return phase === 'heading' || phase === 'waiting'
}

/**
 * Minutos que faltan si recoger AHORA es prematuro; 0 si no lo es.
 *
 * Es el único caso en que hace falta parar y preguntar «¿ya te lo dieron?»: la
 * hora estimada no ha llegado y la cocina no marcó el pedido como listo. El
 * servidor no exige nada de esto para recoger, así que la pregunta es puro
 * criterio de UX, y por eso solo se hace cuando de verdad hay riesgo de llevarse
 * un pedido que no es el tuyo.
 *
 * `ready_early_used` GANA sobre la hora: «listo» recorta `estimated_ready_at` a
 * unos minutos por delante, no a cero, así que mirar solo la hora seguiría
 * avisando de «faltan 5 min» sobre una comida que la cajera ya dio por lista.
 */
export function prematureMinutes(
  order: { estimated_ready_at: string | null; ready_early_used: boolean | null },
  now: number,
): number {
  if (order.ready_early_used) return 0
  if (order.estimated_ready_at == null) return 0
  const left = Date.parse(order.estimated_ready_at) - now
  if (!(left > 0)) return 0
  return Math.max(1, Math.round(left / 60_000))
}
