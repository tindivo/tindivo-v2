/**
 * Pedidos de DEMO para mirar la app del motorizado — SOLO DB LOCAL.
 *
 * NO ES EL SEED E2E. `db:seed:e2e` monta el mundo (negocio, menú, motorizados,
 * clientes) y lo consumen los tests de integración; esto son pedidos encima de
 * ese mundo, hechos para VERSE. Se pueden borrar y volver a sembrar sin tocar
 * nada de lo otro.
 *
 * POR QUÉ ES UN SCRIPT Y NO UN PUÑADO DE INSERTS A MANO.
 * Los relojes son relativos a `now()`: un pedido que faltaban cuatro minutos
 * para estar listo, media hora después está rojo y ya no enseña el caso que
 * venía a enseñar. Esto se vuelve a correr y todo vuelve a su sitio.
 *
 * INSERTA DIRECTO, saltándose la máquina de estados a propósito: aquí no se
 * prueban los RPC, se pintan pantallas. Por eso vive fuera de la suite.
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

const min = (n: number) => new Date(Date.now() + n * 60_000).toISOString()
const ago = (n: number) => new Date(Date.now() - n * 60_000).toISOString()

/**
 * Prefijo `DEMZ` y no `DEMO`: el alfabeto del `short_id` excluye I/O/0/1
 * (invariante 1 de CLAUDE.md) y `orders_short_id_format` lo hace cumplir.
 */
const PREFIX = 'DEMZ'

const base = {
  business_id: E2E.BUSINESS_ID,
  source: 'business_manual',
  delivery_address: 'Jr. Los Pinos 123',
  delivery_fee: 5,
  prep_time_minutes: 20,
  // EXPLÍCITO EN TODAS LAS FILAS: PostgREST normaliza el lote a un conjunto
  // común de columnas, así que si una sola la trae, las demás la reciben NULL
  // y revientan el `not null`.
  occupancy_slots: 1,
}

/** Cada fila existe para enseñar UNA cosa. El comentario dice cuál. */
const rows = [
  // ── EN ESPERA · toca cualquiera para ver la ficha de "tomar" ───────────────
  {
    ...base,
    short_id: `${PREFIX}AA22`,
    status: 'waiting_driver',
    customer_name: 'María Quispe',
    delivery_reference: 'Frente a la bodega de doña Rosa, portón azul',
    order_amount: 40,
    payment_intent: 'pending_cash',
    client_pays_with: 50, // → vuelto S/ 5.00 en toda la app
    estimated_ready_at: min(4),
    appears_in_queue_at: ago(1),
    ready_early_used: false,
  },
  {
    // Comida lista: insignia verde + el reloj sigue corriendo (§23).
    ...base,
    short_id: `${PREFIX}BB33`,
    status: 'waiting_driver',
    customer_name: 'Elena Ramos',
    delivery_reference: 'Subiendo el cerro, casa de dos pisos con reja verde',
    order_amount: 28,
    payment_intent: 'pending_yape',
    estimated_ready_at: min(6),
    appears_in_queue_at: ago(2),
    ready_early_used: true,
  },
  {
    // Sin nombre: el #short_id sube a identidad. Y mixto con desglose y vuelto.
    ...base,
    short_id: `${PREFIX}CC44`,
    status: 'waiting_driver',
    customer_name: null,
    delivery_reference: 'Al costado del colegio, tienda de abarrotes',
    order_amount: 40,
    payment_intent: 'pending_mixed',
    cash_amount: 30,
    yape_amount: 15,
    client_pays_with: 50, // → vuelto S/ 20.00
    estimated_ready_at: min(9),
    appears_in_queue_at: ago(1),
    ready_early_used: false,
  },
  {
    // Reloj PASADO de cero: rojo con "!" y, por encima del margen, borde rojo.
    ...base,
    short_id: `${PREFIX}DD55`,
    status: 'waiting_driver',
    customer_name: 'Rosa Ttito',
    delivery_reference: 'Pasaje Las Flores, tercera puerta',
    order_amount: 33,
    payment_intent: 'prepaid', // → "Prepagado / no cobrar", sin cifra
    estimated_ready_at: ago(13),
    appears_in_queue_at: ago(25),
    ready_early_used: false,
  },
  {
    // En cocina todavía: insignia gris "En cocina".
    ...base,
    short_id: `${PREFIX}EE66`,
    status: 'preparing',
    customer_name: 'Sofía Ayala',
    delivery_reference: 'Calle Comercio 45, encima de la ferretería',
    order_amount: 52,
    payment_intent: 'pending_cash',
    client_pays_with: 100, // → vuelto S/ 43.00
    estimated_ready_at: min(14),
    appears_in_queue_at: ago(1),
    ready_early_used: false,
  },

  // ── MÍOS · un pedido por cada momento del detalle ──────────────────────────
  {
    // Momento «Voy al local».
    ...base,
    short_id: `${PREFIX}FF77`,
    status: 'heading_to_restaurant',
    driver_id: E2E.DRIVER_ID,
    customer_name: 'Julio Mamani',
    delivery_reference: 'Av. San Martín 450, al lado del grifo',
    order_amount: 45,
    payment_intent: 'pending_cash',
    client_pays_with: 100, // → vuelto S/ 50.00
    estimated_ready_at: min(5),
    appears_in_queue_at: ago(5),
    ready_early_used: false,
    assigned_at: ago(4),
    heading_at: ago(4),
  },
  {
    // Momento «En el local», con comida lista y vuelto: aquí sale el aviso de
    // "consigue el sencillo antes de salir".
    ...base,
    short_id: `${PREFIX}GG88`,
    status: 'waiting_at_restaurant',
    driver_id: E2E.DRIVER_ID,
    customer_name: 'Carmen Huamán',
    delivery_reference: 'Detrás del mercado, puerta marrón',
    order_amount: 22,
    payment_intent: 'pending_cash',
    client_pays_with: 50, // → vuelto S/ 23.00
    estimated_ready_at: ago(4),
    appears_in_queue_at: ago(20),
    ready_early_used: true,
    assigned_at: ago(12),
    heading_at: ago(12),
    waiting_at_restaurant_at: ago(3),
  },
  {
    // Momento «En reparto». Recogido hace 6 min: el reloj cuenta hacia arriba y
    // todavía en negro (el umbral son 20, migración 0139).
    ...base,
    short_id: `${PREFIX}HH99`,
    status: 'picked_up',
    driver_id: E2E.DRIVER_ID,
    customer_name: 'Pedro Ccahuana',
    delivery_reference: 'Calle Bolognesi 88',
    order_amount: 55,
    payment_intent: 'pending_cash',
    client_pays_with: 60, // → vuelto S/ 0.00, así que NO sale la caja del vuelto
    estimated_ready_at: ago(25),
    appears_in_queue_at: ago(40),
    ready_early_used: true,
    assigned_at: ago(30),
    picked_up_at: ago(6),
    delivery_distance_band: 'near',
  },

  // ── HISTORIAL ─────────────────────────────────────────────────────────────
  {
    // Entregado hoy. Con la ETA vencidísima a propósito: es el caso que antes
    // teñía TODO el historial de rojo.
    ...base,
    short_id: `${PREFIX}JJ23`,
    status: 'delivered',
    driver_id: E2E.DRIVER_ID,
    customer_name: 'Luis Ayala',
    delivery_reference: 'Jr. Grau 210, casa celeste',
    order_amount: 30,
    payment_intent: 'pending_cash',
    client_pays_with: 50,
    estimated_ready_at: ago(200),
    appears_in_queue_at: ago(220),
    ready_early_used: true,
    assigned_at: ago(60),
    picked_up_at: ago(45),
    delivered_at: ago(30),
    payment_real: 'paid_cash',
    delivery_distance_band: 'near',
  },
]

async function wipe() {
  const { data } = await db.from('orders').select('id').like('short_id', `${PREFIX}%`)
  const ids = (data ?? []).map((r) => r.id)
  if (ids.length === 0) return 0

  // Los entregados devengaron cargos y las FK los sujetan: se van primero.
  for (const [table, col] of [
    ['business_charges', 'order_id'],
    ['order_transfer_requests', 'order_id'],
    ['domain_events', 'aggregate_id'],
  ] as const) {
    await db.from(table).delete().in(col, ids)
  }
  await db.from('orders').delete().in('id', ids)
  return ids.length
}

/**
 * El QR de Yape del local.
 *
 * El seed e2e deja el negocio sin `qr_url`, así que la hoja de entrega enseñaba
 * el bloque del QR vacío — y desde fuera eso parece un fallo de carga, no un
 * dato ausente. Se genera contra un servicio público a partir del número, que
 * es lo que un Yape real codifica.
 */
async function ensureQr() {
  const { data } = await db
    .from('businesses')
    .select('qr_url,yape_number')
    .eq('id', E2E.BUSINESS_ID)
    .single()
  if (data?.qr_url) return

  const numero = data?.yape_number ?? '987654321'
  await db
    .from('businesses')
    .update({
      yape_number: numero,
      // 1000px, no 400: el QR se abre a pantalla completa y a 400 se ve
      // interpolado justo cuando más nítido hace falta — que es cuando el
      // primer intento de escaneo ha fallado.
      qr_url: `https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&margin=8&data=${encodeURIComponent(
        `yape://p2p?n=${numero}`,
      )}`,
    })
    .eq('id', E2E.BUSINESS_ID)
}

const cleanOnly = process.argv.includes('--clean')
if (!cleanOnly) await ensureQr()
const borrados = await wipe()

if (cleanOnly) {
  console.log(`🧹 ${borrados} pedidos de demo borrados`)
  process.exit(0)
}

const { error } = await db.from('orders').insert(rows)
if (error) {
  console.error('❌', error.message)
  process.exit(1)
}

console.log(`🧹 ${borrados} anteriores borrados`)
console.log(`✅ ${rows.length} pedidos de demo listos\n`)
console.log('   En espera  5   · toca cualquiera para ver la ficha de "tomar"')
console.log('   Míos       3   · uno por momento: voy / en el local / en reparto')
console.log('   Historial  1\n')
console.log(`   Entra con ${E2E.DRIVER_EMAIL} · ${E2E.PASSWORD}`)
