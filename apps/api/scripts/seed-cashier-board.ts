/**
 * El tablero de la CAJERA con los DOS canales a la vez — SOLO DB LOCAL.
 *
 * Por qué existe y por qué no es `seed-demo-board.ts`: ese inserta filas
 * directas para pintar los 13 estados del motorizado de golpe. Aquí lo que hay
 * que ver es lo contrario — que un pedido ONLINE y uno MANUAL se distinguen en
 * la tarjeta —, y eso solo se comprueba si cada uno nace por SU camino real:
 *
 *   · Online → `create_customer_order`. El cliente escoge platos del menú, así
 *     que el importe SALE DE LOS ITEMS (nadie lo teclea), la dirección y la
 *     referencia son dos campos distintos, y quedan filas en
 *     `customer_order_items`.
 *   · Manual → `create_business_manual_order`. La cajera teclea UN total y UNA
 *     línea de dirección; `delivery_address` se queda con el relleno
 *     'Pedido manual' y no hay items.
 *
 * Con inserts a mano esa diferencia me la inventaría yo, que es justo lo que no
 * sirve para revisar la pantalla.
 *
 * GUARDS DEL CANAL B2C que condicionan lo que se puede sembrar (`0143`):
 *   1. Un solo pedido ACTIVO por cliente y negocio → como máximo tantos pedidos
 *      online simultáneos como clientes hay en el mundo e2e (tres).
 *   2. Teléfono verificado por WhatsApp OTP.
 *   3. Contraentrega (efectivo / Yape al recibir) SOLO con un `delivered` en el
 *      historial: el primer pedido de un cliente nuevo va siempre prepagado.
 *      Por eso el script le fabrica historial a un cliente antes de pedirle un
 *      pedido en efectivo — sin eso, el canal online solo sabría enseñar
 *      prepagos y la mitad de los estados de cobro quedaría sin mirar.
 *   4. Mixto PROHIBIDO en B2C (no hay cajera que coordine las dos partes). Es
 *      exclusivo del manual, y por eso el mixto de abajo es manual.
 *
 * Los relojes son relativos a `now()`: se vuelve a correr y todo vuelve a su
 * sitio.
 *
 * ⚠ NO LO CORRAS JUSTO ANTES DE `pnpm test`.
 * Esto siembra en el MISMO negocio e2e (`E2E.BUSINESS_ID`) contra el que corren
 * los tests de integración de `apps/api`, y la limpieza de esos tests está
 * acotada a lo que ellos mismos sembraron: `parkPending()` de
 * `cash-summary-scope.integration.test.ts` solo alcanza pedidos cuyo teléfono
 * está en `TELEFONOS_FIXTURE`. Lo que deje este script queda fuera de ese
 * filtro, se suma al efectivo sin rendir del par motorizado-negocio y revienta
 * las aserciones de importe con un número que no cuadra con nada
 * (medido el 2026-08-12: `expected 204 to be 104`, y el mismo fichero en verde
 * al correrlo aislado). El error apunta a la caja, no aquí, así que se pierde
 * un buen rato buscando en el sitio equivocado.
 *
 * Si ya lo corriste: `pnpm db:seed:e2e` y vuelve a lanzar la suite.
 *
 *   pnpm --filter @tindivo/api exec tsx scripts/seed-cashier-board.ts
 */

import { createClient } from '@supabase/supabase-js'
import { E2E } from './e2e-fixtures.ts'

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// ── GUARD ANTI-PRODUCCIÓN ─────────────────────────────────────────────────────
if (new URL(LOCAL_URL).hostname !== '127.0.0.1') {
  throw new Error('🚨 ABORT: este script SOLO corre contra 127.0.0.1')
}

const db = createClient(LOCAL_URL, LOCAL_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const ago = (n: number) => new Date(Date.now() - n * 60_000).toISOString()

type Json = Record<string, unknown>

function unwrap(label: string, data: unknown, error: { message: string } | null): Json {
  if (error) throw new Error(`${label}: ${error.message}`)
  const row = data as Json
  if (row?.ok === false) throw new Error(`${label}: ${JSON.stringify(row)}`)
  return row
}

// ── 1 · Limpieza ──────────────────────────────────────────────────────────────
// Los pedidos de los clientes e2e, que es lo que este script crea y lo que el
// guard "un pedido activo por cliente" convierte en un bloqueo si se quedan.
async function wipe(): Promise<number> {
  const { data } = await db
    .from('orders')
    .select('id')
    .eq('business_id', E2E.BUSINESS_ID)
    .not('status', 'in', '("delivered","cancelled")')
  const ids = (data ?? []).map((r) => r.id as string)
  if (ids.length === 0) return 0
  await db.from('domain_events').delete().in('aggregate_id', ids)
  await db.from('customer_order_items').delete().in('order_id', ids)
  await db.from('orders').delete().in('id', ids)
  return ids.length
}

/**
 * Historial mínimo para que un cliente pueda pedir CONTRAENTREGA.
 *
 * Se inserta directo, saltándose la máquina de estados: es un pedido del pasado
 * que nadie va a mirar, existe solo para que el guard 3 del RPC deje pasar el
 * pedido en efectivo. Fabricar el historial "de verdad" —crear, aceptar,
 * cocinar, repartir y entregar— serían seis llamadas para un pedido que la
 * pantalla ni enseña.
 */
async function darHistorial(customerUserId: string, shortId: string): Promise<void> {
  const { count } = await db
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('customer_user_id', customerUserId)
    .eq('status', 'delivered')
  if ((count ?? 0) > 0) return

  const { error } = await db.from('orders').insert({
    business_id: E2E.BUSINESS_ID,
    customer_user_id: customerUserId,
    source: 'customer_pwa',
    short_id: shortId,
    status: 'delivered',
    delivery_method: 'delivery',
    payment_intent: 'prepaid',
    payment_proof_status: 'verified',
    customer_name: 'Historial',
    customer_phone: '+51900000004',
    delivery_address: E2E.CUSTOMER_ADDRESS,
    delivery_reference: E2E.CUSTOMER_REFERENCE,
    order_amount: 20,
    delivery_fee: 4,
    occupancy_slots: 1,
    created_at: ago(60 * 24 * 3),
    delivered_at: ago(60 * 24 * 3 - 45),
  })
  // Ya existe de una corrida anterior: no es un fallo.
  if (error && !error.message.includes('duplicate')) throw new Error(`historial: ${error.message}`)
}

// ── 2 · Pedidos ONLINE (B2C) ──────────────────────────────────────────────────
// El cliente escoge platos: el importe lo calcula el RPC sumando los items y sus
// modificadores. Ninguna de estas cifras está escrita en este fichero.
const ITEMS = {
  polloConQueso: [
    { menu_item_id: E2E.ITEM_POLLO_ID, quantity: 1, modifiers: [E2E.MODOPT_QUESO_ID] },
    { menu_item_id: E2E.ITEM_GASEOSA_ID, quantity: 2, modifiers: [] },
  ],
  medioYPapas: [
    { menu_item_id: E2E.ITEM_MEDIO_ID, quantity: 2, modifiers: [] },
    { menu_item_id: E2E.ITEM_GASEOSA_ID, quantity: 1, modifiers: [] },
  ],
  polloSolo: [{ menu_item_id: E2E.ITEM_POLLO_ID, quantity: 1, modifiers: [E2E.MODOPT_PAPAS_ID] }],
}

/** Direcciones DISTINTAS de la referencia: es lo que la tarjeta enseña en dos líneas. */
const ONLINE = [
  {
    cliente: E2E.CUSTOMERS[0],
    nombre: 'Elena Ramos',
    address: 'Jr. Ancash 234',
    reference: 'Portón azul al costado de la bodega de doña Rosa',
    intent: 'prepaid' as const,
    items: ITEMS.polloConQueso,
    /** Prepago SIN verificar: el caso que la cajera tiene que atender. */
    proof: null,
  },
  {
    cliente: E2E.CUSTOMERS[1],
    nombre: 'Rosa Ttito',
    address: 'Av. Miramar 88',
    reference: 'Tercera puerta subiendo por el estadio',
    intent: 'pending_cash' as const,
    items: ITEMS.medioYPapas,
    /**
     * Contraentrega: solo puede porque `darHistorial` le dio un `delivered`.
     *
     * El billete NO se elige a ojo. El total lo fija el RPC sumando los items, y
     * dos reglas de `app_settings` lo acotan por arriba y por abajo:
     * `max_cash_bill` (100) y `max_change` (50). Con este pedido el único
     * billete que pasa las dos es el de 100.
     */
    paysWith: 100,
    proof: null,
  },
  {
    cliente: E2E.CUSTOMERS[2],
    nombre: 'Luis Aguilar',
    address: 'Calle Comercio 45',
    reference: 'Encima de la ferretería, timbre de la derecha',
    intent: 'prepaid' as const,
    items: ITEMS.polloSolo,
    /** Prepago YA verificado: la plata entró, no hay nada que hacer. */
    proof: 'verified' as const,
  },
]

// ── 3 · Pedidos MANUALES ──────────────────────────────────────────────────────
// La cajera teclea el total, no escoge platos. Una sola línea de dirección.
const MANUALES = [
  {
    nombre: 'JESUS',
    phone: '924054196',
    reference: 'RENOVACION CASA DE LALI',
    total: 25,
    intent: 'pending_cash' as const,
    paysWith: 50,
  },
  {
    /** Sin nombre: el manual lo permite (0032) y el #código sube a identidad. */
    nombre: null,
    phone: '955123478',
    reference: 'Al costado del colegio, tienda de abarrotes',
    total: 30,
    intent: 'pending_mixed' as const,
    yape: 18,
    cash: 12,
    paysWith: 20,
  },
  {
    nombre: 'Sofía Ayala',
    phone: '933444555',
    reference: 'Subiendo por el estadio, casa de dos pisos con reja azul',
    total: 47,
    intent: 'pending_yape' as const,
  },
]

// ── Ejecución ─────────────────────────────────────────────────────────────────
const borrados = await wipe()
console.log(`🧹 ${borrados} pedido(s) activo(s) borrado(s)`)

await darHistorial(E2E.CUSTOMERS[1].userId, 'HSTZAA22')

const creados: string[] = []

for (const o of ONLINE) {
  const { data, error } = await db.rpc('create_customer_order', {
    p_customer_user_id: o.cliente.userId,
    p_business_id: E2E.BUSINESS_ID,
    p_delivery_method: 'delivery',
    p_payment_intent: o.intent,
    p_customer_name: o.nombre,
    p_customer_phone: o.cliente.phone,
    p_delivery_address: o.address,
    p_delivery_reference: o.reference,
    p_delivery_lat: E2E.CUSTOMER_LAT,
    p_delivery_lng: E2E.CUSTOMER_LNG,
    p_items: o.items,
    p_source: 'customer_pwa',
    ...(o.intent === 'pending_cash' ? { p_client_pays_with: o.paysWith } : {}),
  })
  const res = unwrap(`online ${o.nombre}`, data, error)
  const shortId = String(res.shortId ?? res.short_id)

  if (o.proof === 'verified') {
    await db
      .from('orders')
      .update({ payment_proof_status: 'verified', comprobante_prepago_url: 'https://x/proof.jpg' })
      .eq('short_id', shortId)
  } else if (o.intent === 'prepaid') {
    // Comprobante subido y SIN mirar: `pending` es lo que pinta la tarjeta de
    // ámbar con "Falta verificar el pago".
    await db
      .from('orders')
      .update({ payment_proof_status: 'pending', comprobante_prepago_url: 'https://x/proof.jpg' })
      .eq('short_id', shortId)
  }

  creados.push(`  ONLINE  #${shortId}  ${o.nombre.padEnd(14)} ${o.intent}`)
}

for (const m of MANUALES) {
  const { data, error } = await db.rpc('create_business_manual_order', {
    p_business_user_id: E2E.BUSINESS_USER_ID,
    p_delivery_method: 'delivery',
    p_payment_intent: m.intent,
    p_total_amount: m.total,
    p_customer_name: m.nombre ?? undefined,
    p_customer_phone: m.phone,
    p_delivery_reference: m.reference,
    p_prep_time_minutes: 20,
    ...(m.intent === 'pending_mixed' ? { p_yape_amount: m.yape, p_cash_amount: m.cash } : {}),
    ...(m.paysWith != null ? { p_client_pays_with: m.paysWith } : {}),
  })
  const res = unwrap(`manual ${m.nombre ?? '(sin nombre)'}`, data, error)
  const shortId = String(res.shortId ?? res.short_id)
  creados.push(`  MANUAL  #${shortId}  ${(m.nombre ?? '—').padEnd(14)} ${m.intent}`)
}

console.log(`\n✅ ${creados.length} pedidos:\n${creados.join('\n')}`)
console.log('\n👉 http://localhost:3002 · negocio@e2e.local')
