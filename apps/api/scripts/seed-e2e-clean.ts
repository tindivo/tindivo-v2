/**
 * Limpieza de TRANSACCIONALES del e2e — SOLO DB LOCAL.
 *
 * Borra únicamente los pedidos generados por las corridas del e2e y lo que
 * cuelga de ellos. NO toca el mundo sembrado por `seed-e2e.ts` (negocio, menú,
 * motorizado, cliente, settings): tras correr esto, el e2e puede volver a
 * ejecutarse sin re-sembrar.
 *
 * DOS MARCADORES, y hacen falta los dos:
 *   1. `orders.customer_user_id IN E2E_CUSTOMER_USER_IDS`
 *   2. `orders.business_id      IN E2E_BUSINESS_IDS`
 *
 * El primero solo alcanza los pedidos hechos DESDE UNA CUENTA. Los specs del
 * motorizado crean pedidos MANUALES, que llevan `customer_user_id NULL` porque
 * los teclea la cajera y no hay cuenta detrás; ese filtro no los veía y se
 * quedaban en la base para siempre. Medido el 2026-08-19: 27 pedidos
 * acumulados en `heading_to_restaurant`, más un `delivered` —y ése no es solo
 * ruido visual, porque `delivered` es terminal y convierte al cliente de prueba
 * en alguien "con historial", lo que hace pasar por el motivo equivocado a
 * cualquier test que necesite un cliente nuevo.
 *
 * Los dos son ids fijos y exclusivos del mundo e2e, así que no pueden arrastrar
 * pedidos reales por accidente. Se prefieren a heurísticas por texto o fecha.
 *
 * GUARD ANTI-PRODUCCIÓN: heredado de `local-db.ts` (aborta si no es 127.0.0.1).
 *
 * Uso:  pnpm db:seed:e2e:clean
 */
import { localClient as db } from '../lib/__tests__/helpers/local-db.ts'
import { E2E_BUSINESS_IDS, E2E_CUSTOMER_USER_IDS } from './e2e-fixtures.ts'

// biome-ignore lint/suspicious/noExplicitAny: database.types.ts está desactualizado
const raw = db as any

async function main(): Promise<void> {
  console.log('\nLimpieza e2e — solo transaccionales\n')

  // 1. Localizar los pedidos de prueba por LOS DOS marcadores. Van en dos
  //    consultas y no en un `.or()` porque PostgREST exige serializar las
  //    listas a mano dentro de `or(...)`, y una lista mal escapada ahí no
  //    falla: filtra de menos, en silencio.
  const idsPorCliente = await raw
    .from('orders')
    .select('id')
    .in('customer_user_id', E2E_CUSTOMER_USER_IDS)
  if (idsPorCliente.error) throw new Error(`leer orders (cliente) falló: ${idsPorCliente.error.message}`)

  const idsPorNegocio = await raw.from('orders').select('id').in('business_id', E2E_BUSINESS_IDS)
  if (idsPorNegocio.error) throw new Error(`leer orders (negocio) falló: ${idsPorNegocio.error.message}`)

  const orderIds: string[] = [
    ...new Set(
      [...(idsPorCliente.data ?? []), ...(idsPorNegocio.data ?? [])].map(
        (o: { id: string }) => o.id,
      ),
    ),
  ]

  if (orderIds.length === 0) {
    console.log('  No hay pedidos de prueba que borrar.\n')
    return
  }
  console.log(`  Pedidos a borrar: ${orderIds.length}`)

  // 2. Hijos SIN cascada desde orders. El resto (customer_order_items y sus
  //    modificadores, order_event_log, order_status_history,
  //    order_assignment_rejections, order_transfer_requests) cae por ON DELETE
  //    CASCADE al borrar el pedido.
  //    - business_charges: FK sin acción -> bloquearía el DELETE.
  //    - reports: FK ON DELETE SET NULL -> sobreviviría huérfano.
  for (const table of ['business_charges', 'reports']) {
    const { error } = await raw.from(table).delete().in('order_id', orderIds)
    if (error) throw new Error(`borrar ${table} falló: ${error.message}`)
    console.log(`  ✓ ${table} purgado`)
  }

  // 3. domain_events no tiene FK a orders (usa aggregate_id): borrado explícito.
  const { error: deErr } = await raw.from('domain_events').delete().in('aggregate_id', orderIds)
  if (deErr) throw new Error(`borrar domain_events falló: ${deErr.message}`)
  console.log('  ✓ domain_events purgado')

  // 4. Los pedidos (arrastra por cascada todo lo demás).
  const { error: ordErr } = await raw.from('orders').delete().in('id', orderIds)
  if (ordErr) throw new Error(`borrar orders falló: ${ordErr.message}`)
  console.log(`  ✓ orders purgado (${orderIds.length})`)

  console.log('\nMundo intacto. Solo se borraron transaccionales.\n')
}

main().catch((err) => {
  console.error('\nLimpieza FALLÓ:', err instanceof Error ? err.message : err)
  process.exit(1)
})
