/**
 * Limpieza de TRANSACCIONALES del e2e — SOLO DB LOCAL.
 *
 * Borra únicamente los pedidos generados por las corridas del e2e y lo que
 * cuelga de ellos. NO toca el mundo sembrado por `seed-e2e.ts` (negocio, menú,
 * motorizado, cliente, settings): tras correr esto, el e2e puede volver a
 * ejecutarse sin re-sembrar.
 *
 * MARCADOR: `orders.customer_user_id IN E2E_CUSTOMER_USER_IDS`.
 * Son ids fijos y exclusivos de los clientes de prueba, así que no pueden
 * arrastrar pedidos reales por accidente. Se prefiere a heurísticas por texto
 * o por fecha.
 *
 * GUARD ANTI-PRODUCCIÓN: heredado de `local-db.ts` (aborta si no es 127.0.0.1).
 *
 * Uso:  pnpm db:seed:e2e:clean
 */
import { localClient as db } from '../lib/__tests__/helpers/local-db.ts'
import { E2E_CUSTOMER_USER_IDS } from './e2e-fixtures.ts'

// biome-ignore lint/suspicious/noExplicitAny: database.types.ts está desactualizado
const raw = db as any

async function main(): Promise<void> {
  console.log('\nLimpieza e2e — solo transaccionales\n')

  // 1. Localizar los pedidos de los clientes de prueba (el marcador).
  const { data: orders, error: selErr } = await raw
    .from('orders')
    .select('id, short_id')
    .in('customer_user_id', E2E_CUSTOMER_USER_IDS)
  if (selErr) throw new Error(`leer orders falló: ${selErr.message}`)

  const orderIds: string[] = (orders ?? []).map((o: { id: string }) => o.id)

  if (orderIds.length === 0) {
    console.log('  No hay pedidos de prueba que borrar.\n')
    return
  }
  console.log(`  Pedidos a borrar: ${orderIds.length}`)

  // 2. Hijos SIN cascada desde orders. El resto (customer_order_items y sus
  //    modificadores, order_event_log, order_status_history, contingency_advances,
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
