/**
 * Test de INTEGRACIÓN: bug #1 — el timer de aceptación de un prepago no se
 * reinicia cuando el pedido vuelve de la validación antifraude.
 *
 * Corre contra la DB LOCAL de Supabase (127.0.0.1:54321).
 * DEBE SALIR ROJO con el código actual.
 *
 * EL BUG
 * `orders_before_write` (0096) sella los timestamps de estado así:
 *     WHEN 'pending_acceptance' THEN new.pending_acceptance_at := COALESCE(new.pending_acceptance_at, now());
 *     WHEN 'awaiting_payment'   THEN new.awaiting_payment_at   := now();
 * El COALESCE conserva el valor viejo, así que al REINGRESAR a pending_acceptance
 * el timestamp sigue siendo el de la creación del pedido. `awaiting_payment` no
 * tiene COALESCE y sí se refresca.
 *
 * El reingreso ocurre en `validate_order` (0095): un prepago que pasa la validación
 * antifraude vuelve de 'validando' a 'pending_acceptance'. Como el reloj nunca se
 * reinició, el cron `auto-cancel-pending-acceptance` (5 min sobre pending_acceptance_at)
 * lo cancela de inmediato — el restaurante no llega a verlo.
 *
 * DECISIÓN DE NEGOCIO (opción A, ya tomada): al reingresar debe refrescarse a now().
 *
 * Asserts:
 *   (A) pending_acceptance_at se refresca en el reingreso            ← FALLA HOY
 *   (B) pending_acceptance_at queda DESPUÉS de validating_at,
 *       o sea refleja el reingreso y no la creación                  ← FALLA HOY
 *   (C) control: awaiting_payment_at SÍ se refresca por el mismo
 *       camino (misma RPC, mismo trigger)                            ← PASA HOY
 *
 * (C) existe para probar que la simulación de transiciones funciona y que el rojo
 * de (A)/(B) es específico de pending_acceptance_at, no un fallo general del setup.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  backdateTimestamp,
  cleanup,
  localClient,
  readOrderTimestamps,
  seedPrepaidOrder,
  setOrderStatus,
  type OrderTimestamps,
  type SeededOrder,
} from './helpers/local-db'

const MINUTES_BACK = 10

const ms = (iso: string | null): number => {
  if (!iso) throw new Error('timestamp inesperadamente NULL')
  return new Date(iso).getTime()
}

describe('bug #1 — timer de aceptación tras validación antifraude (integración)', () => {
  // ── Caso del bug: prepago que vuelve de antifraude a pending_acceptance ──────
  describe('prepago que pasa la validación antifraude', () => {
    let seed: SeededOrder
    let backdatedAt: string
    let after: OrderTimestamps

    beforeAll(async () => {
      // 1. Pedido prepago recién creado, en pending_acceptance (T0).
      seed = await seedPrepaidOrder({
        status: 'pending_acceptance',
        validationContext: 'antifraud',
        proofAttempt: 0,
      })

      const initial = await readOrderTimestamps(seed.orderId)
      if (initial.pending_acceptance_at === null) {
        throw new Error('precondición rota: el trigger no selló pending_acceptance_at en el INSERT')
      }

      // 2. Simular que pasaron 10 minutos desde la creación, sin sleeps reales.
      //    Se ancla en el timestamp que generó la DB, no en el reloj del host.
      backdatedAt = await backdateTimestamp(
        seed.orderId,
        'pending_acceptance_at',
        initial.pending_acceptance_at,
        MINUTES_BACK,
      )

      // 3. Antifraude retiene el pedido: pending_acceptance -> validando.
      await setOrderStatus(seed.orderId, 'validando')

      // 4. La cajera llama al cliente y aprueba. La RPC devuelve el prepago
      //    a pending_acceptance (camino introducido en 0095).
      const { error: rpcErr } = await localClient.rpc('validate_order', {
        p_order_id: seed.orderId,
        p_actor_user_id: seed.userId,
        p_actor_role: 'business',
        p_pass: true,
        p_reason: null,
        p_reason_code: null,
      })
      if (rpcErr) throw new Error(`validate_order RPC failed: ${rpcErr.message}`)

      after = await readOrderTimestamps(seed.orderId)

      // Precondición del escenario: el reingreso realmente ocurrió.
      if (after.status !== 'pending_acceptance') {
        throw new Error(
          `precondición rota: se esperaba status='pending_acceptance' tras validate_order, se obtuvo '${after.status}'`,
        )
      }
    })

    afterAll(async () => {
      if (seed) await cleanup(seed)
    })

    it('(A) pending_acceptance_at se refresca al reingresar', () => {
      expect(ms(after.pending_acceptance_at)).toBeGreaterThan(ms(backdatedAt))
    })

    it('(B) pending_acceptance_at refleja el reingreso, no la creación', () => {
      // Si se refrescó, el reingreso es posterior al paso por validación.
      // Con el bug, conserva el T0 retrocedido y queda ANTES de validating_at.
      expect(ms(after.pending_acceptance_at)).toBeGreaterThan(ms(after.validating_at))
    })
  })

  // ── Control: el mismo camino sobre awaiting_payment SÍ refresca ──────────────
  describe('control — prepago cuyo comprobante se rechaza (reintento)', () => {
    let seed: SeededOrder
    let backdatedAt: string
    let after: OrderTimestamps

    beforeAll(async () => {
      // Pedido prepago esperando pago, con un intento de comprobante ya hecho.
      seed = await seedPrepaidOrder({
        status: 'awaiting_payment',
        validationContext: 'proof',
        proofAttempt: 1,
      })

      const initial = await readOrderTimestamps(seed.orderId)
      if (initial.awaiting_payment_at === null) {
        throw new Error('precondición rota: el trigger no selló awaiting_payment_at en el INSERT')
      }

      backdatedAt = await backdateTimestamp(
        seed.orderId,
        'awaiting_payment_at',
        initial.awaiting_payment_at,
        MINUTES_BACK,
      )

      // El cliente sube comprobante -> la cajera lo revisa.
      await setOrderStatus(seed.orderId, 'validando')

      // Lo rechaza con reintento permitido (proof_attempt 1 < 2):
      // la RPC devuelve el pedido a awaiting_payment.
      const { error: rpcErr } = await localClient.rpc('validate_order', {
        p_order_id: seed.orderId,
        p_actor_user_id: seed.userId,
        p_actor_role: 'business',
        p_pass: false,
        p_reason: 'Comprobante ilegible (test de integración)',
        p_reason_code: 'invalid_proof',
      })
      if (rpcErr) throw new Error(`validate_order RPC failed: ${rpcErr.message}`)

      after = await readOrderTimestamps(seed.orderId)

      if (after.status !== 'awaiting_payment') {
        throw new Error(
          `precondición rota: se esperaba status='awaiting_payment' tras el rechazo, se obtuvo '${after.status}'`,
        )
      }
    })

    afterAll(async () => {
      if (seed) await cleanup(seed)
    })

    it('(C) awaiting_payment_at SÍ se refresca al reingresar', () => {
      expect(ms(after.awaiting_payment_at)).toBeGreaterThan(ms(backdatedAt))
    })
  })
})
