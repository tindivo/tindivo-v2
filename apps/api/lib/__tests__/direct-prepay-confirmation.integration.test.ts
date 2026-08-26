/**
 * Test de INTEGRACIÓN: confirmación directa del prepago por el negocio (0181).
 *
 * Corre contra la DB LOCAL de Supabase (127.0.0.1:54321).
 *
 * EL CAMINO
 * La cajera ve la plata en su propia cuenta de Yape/Plin y confirma sin esperar
 * la captura del cliente: `validate_order` acepta un pedido en
 * `awaiting_payment` y lo manda a `preparing` con el pago ya verificado.
 *
 * Lo que se prueba, y por qué cada cosa:
 *   (A) La transición completa y sus cuatro efectos (estado, sello de pago,
 *       relojes de cocina, rastro en el log).
 *   (B) El minuto que elige la cajera GANA al que se guardó al aceptar. Es la
 *       decisión (b) de la migración: si perdiera, el modal sería decorativo y
 *       todo pedido cocinaría 20 minutos pasara lo que pasara.
 *   (C) `p_pass = false` sobre `awaiting_payment` levanta P0001 y no devuelve
 *       `ok:false`. No es un capricho de forma: el route handler reemite el
 *       timeout de pago cuando ve `status: 'awaiting_payment'` en la respuesta,
 *       así que un retorno silencioso le regalaría al cliente 15 minutos
 *       nuevos de reloj.
 *   (D) Un negocio ajeno no puede confirmar el pedido de otro. La comprobación
 *       de dueño ya existía, pero la 0181 abre un estado nuevo a la RPC y hay
 *       que probar que ese estado entra por el mismo control.
 *   (E) Idempotencia: repetir la llamada sobre el pedido ya confirmado no
 *       vuelve a arrancar el reloj.
 *   (F) Control de no-regresión: el camino con comprobante (`validando` +
 *       contexto 'proof') sigue comportándose igual y sigue registrando su
 *       propio evento, `order.proof_verified`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, localClient, type SeededOrder, seedPrepaidOrder } from './helpers/local-db'

/** Fila de `orders` con lo que mira este test. */
interface OrderRow {
  status: string
  payment_proof_status: string | null
  payment_verified_at: string | null
  payment_verified_by: string | null
  prep_time_minutes: number | null
  estimated_ready_at: string | null
  appears_in_queue_at: string | null
  preparing_at: string | null
  comprobante_prepago_url: string | null
  proof_attempt: number
}

async function readOrder(orderId: string): Promise<OrderRow> {
  const { data, error } = await localClient
    .from('orders')
    .select(
      'status, payment_proof_status, payment_verified_at, payment_verified_by, prep_time_minutes, estimated_ready_at, appears_in_queue_at, preparing_at, comprobante_prepago_url, proof_attempt',
    )
    .eq('id', orderId)
    .single()
  if (error) throw new Error(`readOrder failed: ${error.message}`)
  return data as unknown as OrderRow
}

async function readEventTypes(orderId: string): Promise<string[]> {
  const { data, error } = await localClient
    .from('order_event_log')
    .select('event_type')
    .eq('order_id', orderId)
  if (error) throw new Error(`readEventTypes failed: ${error.message}`)
  return (data ?? []).map((r) => r.event_type as string)
}

const ms = (iso: string | null): number => {
  if (!iso) throw new Error('timestamp inesperadamente NULL')
  return new Date(iso).getTime()
}

const MIN = 60_000

describe('confirmación directa del prepago desde awaiting_payment (integración)', () => {
  // ── (A) + (B) el camino feliz ───────────────────────────────────────────────
  describe('la cajera confirma que el dinero ya cayó', () => {
    let seed: SeededOrder
    let after: OrderRow
    let result: { ok?: boolean; status?: string; context?: string }

    beforeAll(async () => {
      seed = await seedPrepaidOrder({
        status: 'awaiting_payment',
        validationContext: 'proof',
        proofAttempt: 0,
      })

      // `advance_order` sella un tiempo de cocción al aceptar disponibilidad;
      // el panel manda un 20 fijo que nadie eligió. Se reproduce aquí para que
      // (B) pruebe algo: sin este 20 guardado, el COALESCE no tendría contra
      // qué competir.
      const { error: prepErr } = await localClient
        .from('orders')
        .update({ prep_time_minutes: 20 })
        .eq('id', seed.orderId)
      if (prepErr) throw new Error(`precondición rota: ${prepErr.message}`)

      const { data, error } = await localClient.rpc('validate_order', {
        p_order_id: seed.orderId,
        p_actor_user_id: seed.userId,
        p_actor_role: 'business',
        p_pass: true,
        p_prep_time_minutes: 30,
      })
      if (error) throw new Error(`validate_order RPC failed: ${error.message}`)
      result = data as typeof result
      after = await readOrder(seed.orderId)
    })

    afterAll(async () => {
      if (seed) await cleanup(seed)
    })

    it('(A1) el pedido pasa a preparing', () => {
      expect(result.ok).toBe(true)
      expect(result.status).toBe('preparing')
      expect(result.context).toBe('direct_business_verification')
      expect(after.status).toBe('preparing')
    })

    it('(A2) el pago queda sellado como verificado por quien confirmó', () => {
      expect(after.payment_proof_status).toBe('verified')
      expect(after.payment_verified_at).not.toBeNull()
      expect(after.payment_verified_by).toBe(seed.userId)
    })

    it('(A3) arrancan los relojes de cocina', () => {
      // El reloj se ancla en el instante en que la cocina empieza, que es el
      // que sella el trigger en `preparing_at`. Comparar contra el reloj del
      // host haría el test dependiente de la deriva del contenedor.
      const cocinaEmpieza = ms(after.preparing_at)
      expect(ms(after.estimated_ready_at) - cocinaEmpieza).toBeGreaterThanOrEqual(29.5 * MIN)
      expect(ms(after.estimated_ready_at) - cocinaEmpieza).toBeLessThanOrEqual(30.5 * MIN)
      // La ventana de cola se abre ANTES de que la comida esté lista: de eso
      // depende que el motorizado llegue a tiempo.
      expect(ms(after.appears_in_queue_at)).toBeLessThan(ms(after.estimated_ready_at))
    })

    it('(A4) queda el rastro en el log, con su propio código', async () => {
      // Código propio y no `order.proof_verified`: aquí NO hubo comprobante, y
      // el panel de admin pinta la etiqueta que corresponda al código.
      await expect(readEventTypes(seed.orderId)).resolves.toContain(
        'order.payment_confirmed_direct',
      )
    })

    it('(A5) no se inventa un comprobante que nunca existió', () => {
      expect(after.comprobante_prepago_url).toBeNull()
      expect(after.proof_attempt).toBe(0)
    })

    it('(B) el tiempo elegido por la cajera gana al que se guardó al aceptar', () => {
      expect(after.prep_time_minutes).toBe(30)
    })
  })

  // ── (C) rechazar sin comprobante no es una acción que exista ────────────────
  describe('p_pass = false sobre awaiting_payment', () => {
    let seed: SeededOrder

    beforeAll(async () => {
      seed = await seedPrepaidOrder({ status: 'awaiting_payment', validationContext: 'proof' })
    })

    afterAll(async () => {
      if (seed) await cleanup(seed)
    })

    it('(C) levanta P0001 y deja el pedido donde estaba', async () => {
      const { error } = await localClient.rpc('validate_order', {
        p_order_id: seed.orderId,
        p_actor_user_id: seed.userId,
        p_actor_role: 'business',
        p_pass: false,
        p_reason: 'no me consta el pago',
      })
      expect(error).not.toBeNull()
      expect(error?.code).toBe('P0001')

      const after = await readOrder(seed.orderId)
      expect(after.status).toBe('awaiting_payment')
      expect(after.payment_proof_status).toBeNull()
    })
  })

  // ── (D) el estado nuevo entra por el mismo control de dueño ─────────────────
  describe('un negocio ajeno intenta confirmar', () => {
    let seed: SeededOrder
    let intruso: SeededOrder

    beforeAll(async () => {
      seed = await seedPrepaidOrder({ status: 'awaiting_payment', validationContext: 'proof' })
      intruso = await seedPrepaidOrder({ status: 'awaiting_payment', validationContext: 'proof' })
    })

    afterAll(async () => {
      if (seed) await cleanup(seed)
      if (intruso) await cleanup(intruso)
    })

    it('(D) no autorizado, y el pedido sigue esperando el pago', async () => {
      const { error } = await localClient.rpc('validate_order', {
        p_order_id: seed.orderId,
        p_actor_user_id: intruso.userId,
        p_actor_role: 'business',
        p_pass: true,
        p_prep_time_minutes: 30,
      })
      expect(error).not.toBeNull()
      expect(error?.code).toBe('P0001')

      const after = await readOrder(seed.orderId)
      expect(after.status).toBe('awaiting_payment')
    })
  })

  // ── (E) repetir la confirmación no reinicia nada ────────────────────────────
  describe('doble confirmación (doble clic, o dos pestañas abiertas)', () => {
    let seed: SeededOrder

    beforeAll(async () => {
      seed = await seedPrepaidOrder({ status: 'awaiting_payment', validationContext: 'proof' })
    })

    afterAll(async () => {
      if (seed) await cleanup(seed)
    })

    it('(E) la segunda llamada devuelve ok:false y no toca los relojes', async () => {
      const { error: firstErr } = await localClient.rpc('validate_order', {
        p_order_id: seed.orderId,
        p_actor_user_id: seed.userId,
        p_actor_role: 'business',
        p_pass: true,
        p_prep_time_minutes: 15,
      })
      if (firstErr) throw new Error(`primera confirmación falló: ${firstErr.message}`)
      const first = await readOrder(seed.orderId)

      const { data, error } = await localClient.rpc('validate_order', {
        p_order_id: seed.orderId,
        p_actor_user_id: seed.userId,
        p_actor_role: 'business',
        p_pass: true,
        p_prep_time_minutes: 45,
      })
      if (error) throw new Error(`segunda confirmación falló: ${error.message}`)

      expect(data).toMatchObject({ ok: false, status: 'preparing' })
      const second = await readOrder(seed.orderId)
      expect(second.prep_time_minutes).toBe(first.prep_time_minutes)
      expect(second.estimated_ready_at).toBe(first.estimated_ready_at)
      expect(second.payment_verified_at).toBe(first.payment_verified_at)
    })
  })

  // ── (F) no-regresión del camino con comprobante ─────────────────────────────
  describe('control — el camino con comprobante no cambia', () => {
    let seed: SeededOrder
    let after: OrderRow

    beforeAll(async () => {
      // Como lo deja la subida del cliente: `validando`, contexto 'proof',
      // un intento hecho.
      seed = await seedPrepaidOrder({
        status: 'awaiting_payment',
        validationContext: 'proof',
        proofAttempt: 1,
      })
      const { error: upErr } = await localClient
        .from('orders')
        .update({ status: 'validando', payment_proof_status: 'pending' })
        .eq('id', seed.orderId)
      if (upErr) throw new Error(`precondición rota: ${upErr.message}`)

      const { error } = await localClient.rpc('validate_order', {
        p_order_id: seed.orderId,
        p_actor_user_id: seed.userId,
        p_actor_role: 'business',
        p_pass: true,
        p_prep_time_minutes: 25,
      })
      if (error) throw new Error(`validate_order RPC failed: ${error.message}`)
      after = await readOrder(seed.orderId)
    })

    afterAll(async () => {
      if (seed) await cleanup(seed)
    })

    it('(F) sigue yendo a preparing con el pago verificado y su evento de siempre', async () => {
      expect(after.status).toBe('preparing')
      expect(after.payment_proof_status).toBe('verified')
      expect(after.prep_time_minutes).toBe(25)
      const eventos = await readEventTypes(seed.orderId)
      expect(eventos).toContain('order.proof_verified')
      expect(eventos).not.toContain('order.payment_confirmed_direct')
    })
  })
})
