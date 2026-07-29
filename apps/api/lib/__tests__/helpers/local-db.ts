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
export interface SeedResult {
  userId: string
  businessId: string
  orderId: string
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
export async function cleanup(seed: SeedResult): Promise<void> {
  await localClient.from('business_charges').delete().eq('order_id', seed.orderId)
  await localClient.from('contingency_advances').delete().eq('order_id', seed.orderId)
  await localClient.from('fraud_coverage_claims').delete().eq('order_id', seed.orderId)
  await localClient.from('orders').delete().eq('id', seed.orderId)
  await localClient.from('businesses').delete().eq('id', seed.businessId)
  // Auth user cleanup (esto cascadea a public.users via FK ON DELETE CASCADE)
  await localClient.auth.admin.deleteUser(seed.userId)
}
