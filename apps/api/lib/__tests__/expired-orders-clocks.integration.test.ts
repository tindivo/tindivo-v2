/**
 * Test de INTEGRACIÓN de `cancel_expired_prepay_orders()` — migración 0174.
 *
 * Corre contra la DB LOCAL de Supabase (127.0.0.1:54321).
 *
 * QUÉ PROTEGE
 * La función es la única autoridad sobre las cuatro cancelaciones por tiempo del
 * piloto, y la llaman dos sitios muy distintos: el pg_cron cada minuto y el
 * panel de la cajera desde el navegador cuando uno de sus contadores llega a
 * 0:00. Lo que se comprueba aquí es lo que la 0174 arregló:
 *
 *   1. Cada reloj cancela con SU motivo. Antes, dos cron distintos cancelaban
 *      `pending_acceptance` a los 5 minutos con motivos diferentes, y ganaba el
 *      que confirmara primero. El motivo decide el texto que lee el cliente:
 *      `prepay_timeout` le dice «Se acabó el tiempo para pagar» a alguien a
 *      quien nadie dejó pagar todavía.
 *
 *   2. Los minutos salen de `app_settings.timers`, no del código. Ese es el
 *      único motivo por el que el contador del cliente (0172) puede fiarse de lo
 *      que enseña: si la base ignorase la config, el cliente vería un plazo que
 *      nadie va a respetar.
 *
 *   3. El reloj de la validación humana (5 min, contraentrega) y el del
 *      comprobante (10 min, prepago) no se pisan. La 0159 los separaba con
 *      `validation_context = 'call'`, un valor que el CHECK de la tabla no
 *      admite: funcionaba de rebote y se habría roto en cuanto alguien
 *      escribiera el valor bueno.
 *
 * NOTA SOBRE EL AISLAMIENTO
 * La función actúa sobre TODA la tabla, no sobre un pedido. Los asserts miran
 * solo los pedidos que siembra este fichero, y `fileParallelism: false`
 * garantiza que no hay fixtures de otros ficheros vivos mientras corre.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  backdateTimestamp,
  cleanup,
  localClient,
  type SeededOrder,
  seedPrepaidOrder,
  setOrderStatus,
} from './helpers/local-db'

interface EstadoPedido {
  status: string
  cancel_reason: string | null
}

async function leer(orderId: string): Promise<EstadoPedido> {
  const { data, error } = await localClient
    .from('orders')
    .select('status, cancel_reason')
    .eq('id', orderId)
    .single()
  if (error) throw new Error(`leer(${orderId}) failed: ${error.message}`)
  return data as unknown as EstadoPedido
}

async function barrer(): Promise<void> {
  const { error } = await localClient.rpc('cancel_expired_prepay_orders')
  if (error) throw new Error(`cancel_expired_prepay_orders failed: ${error.message}`)
}

/** El `now()` de la BASE, no el del host: entre los dos hay deriva. */
async function ahoraEnLaBase(orderId: string, columna: string): Promise<string> {
  const { data, error } = await localClient
    .from('orders')
    .select(columna)
    .eq('id', orderId)
    .single()
  if (error) throw new Error(`ahoraEnLaBase failed: ${error.message}`)
  const valor = (data as unknown as Record<string, string | null>)[columna]
  if (!valor) throw new Error(`la columna ${columna} vino NULL`)
  return valor
}

async function leerTimers(): Promise<Record<string, number>> {
  const { data, error } = await localClient
    .from('app_settings')
    .select('value')
    .eq('key', 'timers')
    .single()
  if (error) throw new Error(`leerTimers failed: ${error.message}`)
  return data.value as Record<string, number>
}

async function escribirTimer(clave: string, minutos: number): Promise<void> {
  const timers = await leerTimers()
  const { error } = await localClient
    .from('app_settings')
    .update({ value: { ...timers, [clave]: minutos } })
    .eq('key', 'timers')
  if (error) throw new Error(`escribirTimer failed: ${error.message}`)
}

describe('cancel_expired_prepay_orders — los cuatro relojes (integración)', () => {
  describe('1 · el negocio no confirma disponibilidad', () => {
    let seed: SeededOrder

    beforeAll(async () => {
      seed = await seedPrepaidOrder({ status: 'pending_acceptance' })
      const marca = await ahoraEnLaBase(seed.orderId, 'pending_acceptance_at')
      await backdateTimestamp(seed.orderId, 'pending_acceptance_at', marca, 10)
      await barrer()
    })

    afterAll(async () => {
      await cleanup(seed)
    })

    it('cancela con `pending_acceptance_timeout`, NO con `prepay_timeout`', async () => {
      // El defecto que arregló la 0174. `prepay_timeout` hace que el cliente
      // lea «Se acabó el tiempo para pagar» (`cancelledCopy`, apps/customer)
      // cuando el prepago ni siquiera ha llegado a su turno de pagar: el pago
      // ocurre en `awaiting_payment`, que es el estado SIGUIENTE.
      const pedido = await leer(seed.orderId)
      expect(pedido.status).toBe('cancelled')
      expect(pedido.cancel_reason).toBe('pending_acceptance_timeout')
    })
  })

  describe('2 · los minutos salen de app_settings, no del código', () => {
    let seed: SeededOrder
    let original: number

    beforeAll(async () => {
      original = (await leerTimers()).acceptanceMinutes ?? 5
      seed = await seedPrepaidOrder({ status: 'pending_acceptance' })
      const marca = await ahoraEnLaBase(seed.orderId, 'pending_acceptance_at')
      // Diez minutos de antigüedad: vencido con la ventana normal (8 desde la 0186).
      await backdateTimestamp(seed.orderId, 'pending_acceptance_at', marca, 10)
    })

    afterAll(async () => {
      await escribirTimer('acceptanceMinutes', original)
      await cleanup(seed)
    })

    it('con la ventana ampliada a 30, el mismo pedido sobrevive', async () => {
      await escribirTimer('acceptanceMinutes', 30)
      await barrer()
      expect((await leer(seed.orderId)).status).toBe('pending_acceptance')
    })

    it('y al bajarla a 5, cae', async () => {
      // Los dos asserts son el mismo pedido y el mismo barrido: lo único que
      // cambia entre uno y otro es la fila de `app_settings`. Si la función
      // volviera a llevar el número escrito a mano, el primero fallaría.
      await escribirTimer('acceptanceMinutes', 5)
      await barrer()
      expect((await leer(seed.orderId)).status).toBe('cancelled')
    })
  })

  describe('3 · los dos relojes de `validando` no se pisan', () => {
    let contraentrega: SeededOrder
    let prepago: SeededOrder

    beforeAll(async () => {
      // Contraentrega en validación humana: 5 minutos.
      contraentrega = await seedPrepaidOrder({ status: 'pending_acceptance' })
      await localClient
        .from('orders')
        .update({ payment_intent: 'pending_cash', validation_context: 'antifraud' })
        .eq('id', contraentrega.orderId)
      await setOrderStatus(contraentrega.orderId, 'validando')

      // Prepago con comprobante en revisión: 10 minutos.
      prepago = await seedPrepaidOrder({ status: 'pending_acceptance' })
      await localClient
        .from('orders')
        .update({ validation_context: 'proof', comprobante_prepago_url: 'proofs/x.jpg' })
        .eq('id', prepago.orderId)
      await setOrderStatus(prepago.orderId, 'validando')

      // Siete minutos para los dos: pasada la ventana del antifraude, dentro de
      // la del comprobante. Es el único punto donde los dos relojes discrepan,
      // así que es donde se ve si están separados de verdad.
      for (const s of [contraentrega, prepago]) {
        const marca = await ahoraEnLaBase(s.orderId, 'validating_at')
        await backdateTimestamp(s.orderId, 'validating_at', marca, 7)
      }
      await barrer()
    })

    afterAll(async () => {
      await cleanup(contraentrega)
      await cleanup(prepago)
    })

    it('la contraentrega cae a los 5 con `validation_timeout`', async () => {
      // Con `validation_context = 'antifraud'`, que es el valor que el CHECK
      // admite. La 0159 filtraba por `'call'`, imposible, y este pedido se le
      // escapaba al reloj de 5 para caer en el de 10 con el motivo del prepago.
      const pedido = await leer(contraentrega.orderId)
      expect(pedido.status).toBe('cancelled')
      expect(pedido.cancel_reason).toBe('validation_timeout')
    })

    it('el prepago con comprobante sigue vivo a los 7: tiene 10', async () => {
      expect((await leer(prepago.orderId)).status).toBe('validando')
    })

    it('y cae con `prepay_timeout` una vez pasados los 10', async () => {
      const marca = await ahoraEnLaBase(prepago.orderId, 'validating_at')
      await backdateTimestamp(prepago.orderId, 'validating_at', marca, 5)
      await barrer()
      const pedido = await leer(prepago.orderId)
      expect(pedido.status).toBe('cancelled')
      expect(pedido.cancel_reason).toBe('prepay_timeout')
    })
  })

  describe('4 · el cliente no paga', () => {
    let seed: SeededOrder

    beforeAll(async () => {
      seed = await seedPrepaidOrder({ status: 'awaiting_payment' })
    })

    afterAll(async () => {
      await cleanup(seed)
    })

    it('sobrevive a los 12 minutos: la ventana es de 15, no de 10', async () => {
      // La 0168 subió este plazo de 10 a 15 y el número quedó en tres sitios.
      // Doce minutos es justo el hueco donde se nota si alguno se quedó atrás.
      const marca = await ahoraEnLaBase(seed.orderId, 'awaiting_payment_at')
      await backdateTimestamp(seed.orderId, 'awaiting_payment_at', marca, 12)
      await barrer()
      expect((await leer(seed.orderId)).status).toBe('awaiting_payment')
    })

    it('cae con `prepay_timeout` pasados los 15', async () => {
      const marca = await ahoraEnLaBase(seed.orderId, 'awaiting_payment_at')
      await backdateTimestamp(seed.orderId, 'awaiting_payment_at', marca, 5)
      await barrer()
      const pedido = await leer(seed.orderId)
      expect(pedido.status).toBe('cancelled')
      expect(pedido.cancel_reason).toBe('prepay_timeout')
    })
  })

  describe('5 · lo que no ha vencido no se toca', () => {
    let seed: SeededOrder

    beforeAll(async () => {
      seed = await seedPrepaidOrder({ status: 'pending_acceptance' })
      await barrer()
    })

    afterAll(async () => {
      await cleanup(seed)
    })

    it('un pedido recién creado sigue en pie', async () => {
      expect((await leer(seed.orderId)).status).toBe('pending_acceptance')
    })
  })
})
