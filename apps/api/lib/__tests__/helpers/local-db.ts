/**
 * Helper de integración para tests contra la DB LOCAL de Supabase.
 *
 * GUARD ANTI-PRODUCCIÓN: aborta si la URL no apunta a 127.0.0.1.
 * Expone: cliente service_role tipado, seed de fraud claim, cleanup.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@tindivo/supabase'

// ── Keys locales de Supabase CLI (hardcodeadas, son públicas en la documentación) ──
// https://supabase.com/docs/guides/local-development/cli/getting-started#local-environment-variables
const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

// ═══════════════════════════════════════════════════════════════════════════════
// GUARD ANTI-PRODUCCIÓN — NUNCA debe poder tocar la DB remota.
// ═══════════════════════════════════════════════════════════════════════════════
function assertLocalOnly(url: string): void {
  const parsed = new URL(url)
  if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
    throw new Error(
      `🚨 ABORT: La URL "${url}" NO es local. ` +
        'Este helper SOLO debe correr contra 127.0.0.1. ' +
        'NUNCA lo apuntes a producción.',
    )
  }
}

// ── Cliente service_role tipado ────────────────────────────────────────────────
assertLocalOnly(LOCAL_URL)

export const localClient: SupabaseClient<Database> = createClient<Database>(
  LOCAL_URL,
  LOCAL_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

// ── Tipos de retorno del seed ─────────────────────────────────────────────────
// `SeededOrder` es el mínimo que `cleanup()` necesita para borrar lo sembrado.
export interface SeededOrder {
  userId: string
  businessId: string
  orderId: string
}

export interface SeedResult extends SeededOrder {
  claimId: string
  amount: number
}

// ── Seed: crea lo MÍNIMO para aprobar un fraud claim ──────────────────────────
// Tablas insertadas: auth.users → public.users (via trigger), businesses, orders,
// fraud_coverage_claims. Usa service_role que bypassa RLS.
export async function seedFraudClaim(amount = 20.0): Promise<SeedResult> {
  const userId = crypto.randomUUID()

  // 1. Crear auth user (dispara trigger handle_new_user → public.users)
  const { data: authUser, error: authErr } = await localClient.auth.admin.createUser({
    email: `test-${userId.slice(0, 8)}@integration.local`,
    password: 'test-password-12345',
    email_confirm: true,
    user_metadata: { full_name: 'Test Admin' },
  })
  if (authErr) throw new Error(`seed auth.users failed: ${authErr.message}`)
  const realUserId = authUser.user.id

  // 2. Crear business (FK a public.users.id, NOT NULL: user_id, name)
  const { data: biz, error: bizErr } = await localClient
    .from('businesses')
    .insert({
      user_id: realUserId,
      name: 'Test Restaurant Integration',
      balance_due: 0,
    })
    .select('id')
    .single()
  if (bizErr) throw new Error(`seed businesses failed: ${bizErr.message}`)

  // 3. Crear order (NOT NULL sin default, medido en information_schema:
  //    business_id, short_id, order_amount, delivery_fee, payment_intent)
  // OJO con payment_intent: los ÚNICOS valores válidos del enum son
  //    prepaid | pending_yape | pending_cash | pending_mixed
  // (medido en pg_enum). 'cash' NO existe y hacía fallar el seed.
  // short_id: 8 chars del charset [ABCDEFGHJKLMNPQRSTUVWXYZ23456789] (sin I/O/0/1)
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let shortId = ''
  for (let i = 0; i < 8; i++) shortId += charset[Math.floor(Math.random() * charset.length)]

  const { data: order, error: orderErr } = await localClient
    .from('orders')
    .insert({
      business_id: biz.id,
      short_id: shortId,
      customer_phone: '+51999000111',
      order_amount: 50.0,
      delivery_fee: 3.0,
      payment_intent: 'pending_cash',
    })
    .select('id')
    .single()
  if (orderErr) throw new Error(`seed orders failed: ${orderErr.message}`)

  // 4. Crear fraud_coverage_claim en status 'pending'
  // (NOT NULL: order_id, business_id, amount, reason, status)
  const { data: claim, error: claimErr } = await localClient
    .from('fraud_coverage_claims')
    .insert({
      order_id: order.id,
      business_id: biz.id,
      amount,
      reason: 'Test: cliente no pagó (integración)',
      status: 'pending',
      created_by: realUserId,
    })
    .select('id')
    .single()
  if (claimErr) throw new Error(`seed fraud_coverage_claims failed: ${claimErr.message}`)

  return {
    userId: realUserId,
    businessId: biz.id,
    orderId: order.id,
    claimId: claim.id,
    amount,
  }
}

// ── Seed de pedido PREPAGO para probar los timers de estado ───────────────────
// Crea usuario + negocio + un pedido `prepaid` en el estado pedido. Reusa el mismo
// cliente service_role y el guard anti-producción de arriba.
//
// Valores de enum confirmados contra pg_enum / constraints:
//   payment_intent     -> prepaid | pending_yape | pending_cash | pending_mixed
//   order_status       -> validando | pending_acceptance | ... | awaiting_payment
//   validation_context -> CHECK (validation_context IN ('antifraud','proof'))
export interface SeedOrderOptions {
  status?: 'pending_acceptance' | 'awaiting_payment'
  validationContext?: 'antifraud' | 'proof'
  proofAttempt?: number
}

export async function seedPrepaidOrder(opts: SeedOrderOptions = {}): Promise<SeededOrder> {
  const { status = 'pending_acceptance', validationContext = 'antifraud', proofAttempt = 0 } = opts

  const { data: authUser, error: authErr } = await localClient.auth.admin.createUser({
    email: `prepay-${crypto.randomUUID().slice(0, 8)}@integration.local`,
    password: 'test-password-12345',
    email_confirm: true,
    user_metadata: { full_name: 'Test Business Owner' },
  })
  if (authErr) throw new Error(`seed auth.users failed: ${authErr.message}`)
  const userId = authUser.user.id

  const { data: biz, error: bizErr } = await localClient
    .from('businesses')
    .insert({ user_id: userId, name: 'La Florencia (timer test)', balance_due: 0 })
    .select('id')
    .single()
  if (bizErr) throw new Error(`seed businesses failed: ${bizErr.message}`)

  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let shortId = ''
  for (let i = 0; i < 8; i++) shortId += charset[Math.floor(Math.random() * charset.length)]

  // El trigger `orders_before_write` sella el timestamp del estado en el INSERT.
  const { data: order, error: orderErr } = await localClient
    .from('orders')
    .insert({
      business_id: biz.id,
      short_id: shortId,
      customer_phone: '+51999000222',
      order_amount: 50.0,
      delivery_fee: 3.0,
      payment_intent: 'prepaid',
      status,
      validation_context: validationContext,
      proof_attempt: proofAttempt,
    })
    .select('id')
    .single()
  if (orderErr) throw new Error(`seed orders failed: ${orderErr.message}`)

  return { userId, businessId: biz.id, orderId: order.id }
}

// ── Lectura de los timestamps de estado de un pedido ──────────────────────────
export interface OrderTimestamps {
  status: string
  pending_acceptance_at: string | null
  validating_at: string | null
  awaiting_payment_at: string | null
}

export async function readOrderTimestamps(orderId: string): Promise<OrderTimestamps> {
  const { data, error } = await localClient
    .from('orders')
    .select('status, pending_acceptance_at, validating_at, awaiting_payment_at')
    .eq('id', orderId)
    .single()
  if (error) throw new Error(`readOrderTimestamps failed: ${error.message}`)
  return data as unknown as OrderTimestamps
}

// ── Retroceder un timestamp SIN cambiar el status ─────────────────────────────
// Clave para que el test sea determinista y sin sleeps: el trigger solo toca los
// timestamps cuando `tg_op='INSERT' OR new.status IS DISTINCT FROM old.status`, así
// que un UPDATE que no altera el status no interfiere con el valor que escribimos.
// El valor se calcula a partir de un timestamp que YA generó la DB, no del reloj del
// host, para que no haya deriva entre el contenedor y la máquina que corre el test.
export async function backdateTimestamp(
  orderId: string,
  column: 'pending_acceptance_at' | 'awaiting_payment_at',
  fromDbTimestamp: string,
  minutesBack: number,
): Promise<string> {
  const backdated = new Date(
    new Date(fromDbTimestamp).getTime() - minutesBack * 60_000,
  ).toISOString()
  const { error } = await localClient
    .from('orders')
    .update({ [column]: backdated })
    .eq('id', orderId)
  if (error) throw new Error(`backdateTimestamp failed: ${error.message}`)
  return backdated
}

// ── Cambiar el status de un pedido (dispara el trigger) ───────────────────────
export async function setOrderStatus(orderId: string, status: string): Promise<void> {
  const { error } = await localClient.from('orders').update({ status }).eq('id', orderId)
  if (error) throw new Error(`setOrderStatus(${status}) failed: ${error.message}`)
}

// ── Deuda agregada desde el LEDGER (fuente de verdad, AGENTS.md §2.2) ─────────
// Replica EXACTAMENTE el criterio de settle_business_charges:
//   FROM business_charges WHERE business_id = X AND status = 'pending' -> sum(amount)
// Nota: NO filtra por charge_type — todos los tipos (commission, delivery_fee,
// refund_charge) suman deuda cobrable, igual que en la RPC de liquidación.
// La suma se hace en JS porque PostgREST no expone agregados por defecto.
export async function sumPendingLedgerDebt(businessId: string): Promise<number> {
  const { data, error } = await localClient
    .from('business_charges')
    .select('amount')
    .eq('business_id', businessId)
    .eq('status', 'pending')

  if (error) throw new Error(`sumPendingLedgerDebt failed: ${error.message}`)

  const total = (data ?? []).reduce((acc, row) => acc + Number(row.amount), 0)
  // Redondeo a 2 decimales: los montos son numeric(10,2) y sumarlos como float
  // puede arrastrar error binario (0.1 + 0.2).
  return Math.round(total * 100) / 100
}

// ── Cleanup: borra todo lo sembrado por el test ───────────────────────────────
// Orden: claims → orders → businesses → auth.users (cascade limpia el resto).
export async function cleanup(seed: SeededOrder): Promise<void> {
  await localClient.from('business_charges').delete().eq('order_id', seed.orderId)
  await localClient.from('contingency_advances').delete().eq('order_id', seed.orderId)
  await localClient.from('fraud_coverage_claims').delete().eq('order_id', seed.orderId)
  // `domain_events` referencia el pedido por `aggregate_id`, SIN foreign key, así que no
  // cae por cascada al borrar la orden: hay que borrarlo explícitamente o cada corrida
  // deja eventos huérfanos acumulándose (medido: 4 tras dos corridas de la suite).
  await localClient.from('domain_events').delete().eq('aggregate_id', seed.orderId)
  await localClient.from('orders').delete().eq('id', seed.orderId)
  await localClient.from('businesses').delete().eq('id', seed.businessId)
  // `public.users` NO tiene FK hacia `auth.users` (verificado en pg_constraint), así que
  // borrar el usuario de auth NO lo cascadea: hay que borrarlo explícitamente o quedan
  // filas huérfanas acumulándose entre corridas. Va después de `businesses`, que sí
  // referencia a `users` con ON DELETE CASCADE.
  await localClient.from('users').delete().eq('id', seed.userId)
  await localClient.auth.admin.deleteUser(seed.userId)
}
