/**
 * Flujo completo de UN pedido de restaurante, solo por la API REST pública (`/api/v1`), como lo hacen
 * las apps. Runbook: `Docs/operacion/e2e-flujo-completo.md`.
 *
 *   node scripts/e2e/flujo-completo.ts [--scenario contraentrega|prepago|all]
 *       [--api-url <url>] [--supabase-url <url>] [--anon-key <clave>]
 *       [--credentials <cuentas.md>] [--staging] [--check-events]
 *       [--customer-email <email>] [--prep-minutes <n>]
 *
 * Qué hace: inicia sesión con email + contraseña (Supabase Auth, clave anon) como cliente, cajera y
 * motorizado, usa su JWT como Bearer y recorre el pedido paso a paso. Tras cada paso lee el pedido
 * desde las tres vistas (cliente: GET /customer/orders/{id}; motorizado: GET /driver/orders/{id};
 * negocio: lectura de `orders` con su JWT bajo RLS, porque la API no tiene un GET por id para el
 * negocio, y así lo lee la app de negocios) y comprueba el estado esperado y que los tres ven el
 * mismo `short_id` de 8 caracteres.
 *
 * Destino por defecto: la pila LOCAL (Supabase 127.0.0.1:54321, API http://localhost:3001/api/v1).
 * Guardias: se niega a correr contra `tindivo-prod` (`zpnipajgwfthxhdtzhly`); `tindivo-dev`
 * (`jgziumvrtogguljhpdos`) solo con `--staging`; cualquier otra URL remota se rechaza.
 * Nunca imprime contraseñas ni tokens.
 *
 * Credenciales:
 *   - Local: las cuentas del mundo e2e (`apps/api/scripts/e2e-fixtures.ts`), clave `E2E.PASSWORD`.
 *   - Staging: `--credentials` apunta al `cuentas.md` que escribe `seed-staging.ts`
 *     (`| email | rol | contraseña | estado |`). Sirve también en local si se pasa.
 * La clave anon sale de `--anon-key`, de `TINDIVO_E2E_ANON_KEY` o, en local, de `apps/api/.env.local`.
 *
 * `--check-events` (solo LOCAL): con la service role de `apps/api/.env.local` lee `domain_events` del
 * pedido y comprueba que existen los eventos de ciclo de vida.
 *
 * Código de salida: 0 si todo pasó, 1 si algo falló, 2 si los argumentos o las guardias lo impiden.
 */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exigirCandado, assertUploadUrl, fetchSinRedireccion } from './guardas.mjs'

// ── Constantes del mundo e2e (espejo de apps/api/scripts/e2e-fixtures.ts) ─────────────────────────
const E2E_PASSWORD = 'e2e-password-12345'
const BUSINESS_ID = 'e2e00000-0000-4000-8000-000000000010'
const ITEM_MEDIO_ID = 'e2e00000-0000-4000-8000-000000000032' // 25.00
const ITEM_GASEOSA_ID = 'e2e00000-0000-4000-8000-000000000033' // 8.00
const SUBTOTAL = 33
const ACCOUNTS = {
  customer: 'cliente@e2e.local',
  business: 'negocio@e2e.local',
  driver: 'motorizado@e2e.local',
}
// Cuentas e ids que solo usan los escenarios nuevos (espejo de apps/api/scripts/e2e-fixtures.ts).
const ADMIN_EMAIL = 'admin@e2e.local'
const DRIVER_2_EMAIL = 'motorizado2@e2e.local'
const DRIVER_1_ID = 'e2e00000-0000-4000-8000-000000000050'
const DRIVER_2_ID = 'e2e00000-0000-4000-8000-0000000000d2'
const CUSTOMER_NAME = 'Cliente E2E'
const CUSTOMER_PHONE = '900000003'
const PHONES: Partial<Record<string, string>> = {
  customer: '900000003',
  customer2: '900000004',
  customer3: '900000005',
}
const DELIVERY = {
  address: 'Jr. Los Pinos 123',
  reference: 'Portón azul, frente al parque',
  lat: -9.151,
  lng: -78.28,
}
const PROD_REF = 'zpnipajgwfthxhdtzhly'
const STAGING_REF = 'jgziumvrtogguljhpdos'
const STAGING_API_HOST = 'tindivo-api-staging.vercel.app'
// PNG real de 1x1: pasa la validación de imagen del bucket.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

// ── Utilidades ────────────────────────────────────────────────────────────────────────────────────
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..')

function flag(name: string): boolean {
  return process.argv.includes(name)
}
function opt(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}
function die(msg: string, code = 2): never {
  console.error(`\nNO SE EJECUTA: ${msg}`)
  process.exit(code)
}
function readEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m?.[1]) out[m[1]] = (m[2] ?? '').replace(/^["']|["']$/g, '')
  }
  return out
}

type Json = Record<string, unknown>
type Actor =
  | 'customer'
  | 'business'
  | 'driver'
  | 'customer2'
  | 'customer3'
  | 'fresh'
  | 'fresh2'
  | 'admin'
  | 'driver2'

class StepFailure extends Error {}

interface Ctx {
  api: string
  supabase: string
  anonKey: string
  isLocal: boolean
  tokens: Partial<Record<Actor, string>>
  /** Contraseña de una cuenta (local: la del mundo e2e; staging: la del `cuentas.md`). Solo para sesiones perezosas. */
  pass: (email: string) => string
}

const secrets: string[] = []
function redact(text: string): string {
  let out = text
  for (const s of secrets) if (s) out = out.split(s).join('***')
  return out
}

async function http(
  ctx: Ctx,
  method: string,
  url: string,
  opts: { actor?: Actor; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: Json; text: string; headers: Headers }> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) }
  const token = opts.actor ? ctx.tokens[opts.actor] : undefined
  if (token) headers.authorization = `Bearer ${token}`
  let payload: BodyInit | undefined
  if (opts.body !== undefined) {
    headers['content-type'] = 'application/json'
    payload = JSON.stringify(opts.body)
  }
  // Nunca se sigue una redirección: el Bearer viajaría a otro host. Un 3xx es un error.
  const res = await fetchSinRedireccion(url, { method, headers, body: payload })
  const text = await res.text()
  let body: Json = {}
  try {
    body = text ? (JSON.parse(text) as Json) : {}
  } catch {
    body = { _raw: text.slice(0, 300) }
  }
  return { status: res.status, body, text: redact(text), headers: res.headers }
}

/** PUT a la URL firmada de subida: solo al origen de la Supabase permitida y sin seguir redirecciones. */
async function putUpload(ctx: Ctx, uploadUrl: string, init: RequestInit): Promise<Response> {
  assertUploadUrl(uploadUrl, ctx.supabase)
  return fetchSinRedireccion(uploadUrl, init)
}

/** Respuestas `{data: …}` o planas. */
function unwrap(body: Json): Json {
  const d = body.data
  return d && typeof d === 'object' && !Array.isArray(d) ? (d as Json) : body
}

// ── Registro de pasos ─────────────────────────────────────────────────────────────────────────────
const results: { name: string; ok: boolean; ms: number; detail?: string; expected?: boolean }[] = []

interface Scenario {
  name: string
  localOnly?: boolean
  run: () => Promise<void>
}
type Outcome = 'ok' | 'falla' | 'rojo-esperado' | 'defecto-corregido' | 'saltado' | 'parcial'
const outcomes: { name: string; outcome: Outcome; note?: string }[] = []

const SCENARIO_NAMES = [
  'contraentrega',
  'prepago',
  'rechazo',
  'cancela-cliente',
  'no-show',
  'recojo',
  'prepago-heic',
  'mis-pedidos',
  'prepago-vencido',
  'celular-sms',
  'entregas',
  'borrar-cuenta',
  'compat-v1',
  'comprobante-rechazado',
  'negocio-cancela',
  'traspaso',
  'admin-negocio',
  'admin-caso',
  'store',
  'invitado',
]
/**
 * Defectos reales del producto que un escenario destapó, atados a UN paso concreto. El escenario sigue
 * corriendo: se espera que falle justo en ese paso; si falla en otro, o si pasa entero, la suite falla y
 * avisa para quitar la marca. `row` es la fila de `Docs/trabajo/e2e/escenarios.md`. No se arregla aquí:
 * es código de producto. Hoy hay uno (comprobante-rechazado).
 */
const STEP_PAGO_BLOQUEA = 'cliente2: tras el rechazo en firme, un pedido nuevo está bloqueado (CA-PAY-01)'
const KNOWN_DEFECTS: Record<string, { step: string; row: string; why: string }> = {
  'comprobante-rechazado': {
    step: STEP_PAGO_BLOQUEA,
    row: '20',
    why: 'CA-PAY-01/P7 y CUS-PAY-008 piden bloquear pedidos nuevos tras el rechazo en firme y dicen que la regla la decide el servidor; el servidor no la tiene (create_customer_order solo bloquea por pedido ACTIVO, strikes o bloqueo manual) y el bloqueo hoy vive en el cliente (apps/customer/lib/payment-block.ts)',
  },
}
async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now()
  try {
    const out = await fn()
    const ms = Date.now() - t0
    results.push({ name, ok: true, ms })
    console.log(`  OK    ${String(ms).padStart(5)} ms  ${name}`)
    return out
  } catch (err) {
    const ms = Date.now() - t0
    const detail = redact(err instanceof Error ? err.message : String(err))
    results.push({ name, ok: false, ms, detail })
    console.log(
      `  FALLA ${String(ms).padStart(5)} ms  ${name}\n        ${detail.replace(/\n/g, '\n        ')}`,
    )
    throw new StepFailure(detail)
  }
}
function expect(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}
function describeHttp(r: { status: number; text: string }): string {
  return `HTTP ${r.status} ${r.text.slice(0, 400)}`
}
/** Un rechazo se afirma por su estado HTTP y por el `code` del problema RFC 9457, no por «cualquier 4xx». */
function expectProblem(
  r: { status: number; body: Json; text: string },
  status: number,
  code: string,
  what: string,
): void {
  expect(
    r.status === status && r.body.code === code,
    `${what}: esperaba HTTP ${status} ${code}; llegó ${describeHttp(r)}`,
  )
}
/** Dinero como cadena decimal (API-8): dos decimales y el valor esperado, calculado desde los datos de entrada. */
function expectMoney(label: string, got: unknown, expectedCents: number): void {
  expect(typeof got === 'string' && /^\d+\.\d{2}$/.test(got), `${label} no es una cadena decimal: ${JSON.stringify(got)}`)
  expect(
    Math.round(Number(got) * 100) === expectedCents,
    `${label} = ${String(got)}; se esperaba ${(expectedCents / 100).toFixed(2)}`,
  )
}

// ── Credenciales ──────────────────────────────────────────────────────────────────────────────────
/** Lee el `cuentas.md` de seed-staging: filas `| email | rol | contraseña | estado |`. */
function parseAccountsFile(path: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (!line.startsWith('|')) continue
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim())
    const [email, , password] = cells
    if (!email?.includes('@') || !password || password === '—' || password === '---')
      continue
    if (!map.has(email)) {
      map.set(email, password)
      secrets.push(password)
    }
  }
  return map
}

async function login(ctx: Ctx, email: string, password: string): Promise<string> {
  const r = await http(ctx, 'POST', `${ctx.supabase}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ctx.anonKey },
    body: { email, password },
  })
  const token = r.body.access_token
  if (r.status !== 200 || typeof token !== 'string') {
    throw new Error(
      `login de ${email} falló: HTTP ${r.status} ${String(r.body.error_description ?? r.body.msg ?? '')}`,
    )
  }
  secrets.push(token)
  return token
}

// ── Vistas de cada actor ──────────────────────────────────────────────────────────────────────────
interface View {
  status: string
  shortId: string
}

async function customerView(ctx: Ctx, id: string, who: Actor = 'customer'): Promise<View> {
  const r = await http(ctx, 'GET', `${ctx.api}/customer/orders/${id}`, { actor: who })
  expect(r.status === 200, `GET /customer/orders/{id}: ${describeHttp(r)}`)
  const o = unwrap(r.body)
  return { status: String(o.status), shortId: String(o.shortId) }
}

/** La API no ofrece GET por id para el negocio: la app lee `orders` con su JWT, bajo RLS. */
async function businessView(ctx: Ctx, id: string): Promise<View & { row: Json }> {
  const r = await http(
    ctx,
    'GET',
    `${ctx.supabase}/rest/v1/orders?id=eq.${id}&select=id,short_id,status,payment_intent,payment_real,order_amount,delivery_fee,cash_owed_at_delivery,client_pays_with,change_to_give,driver_id,cancel_note`,
    { actor: 'business', headers: { apikey: ctx.anonKey } },
  )
  const parsed: unknown = JSON.parse(r.text || '[]')
  const row = Array.isArray(parsed) ? (parsed[0] as Json | undefined) : undefined
  expect(r.status === 200 && row, `lectura de orders por la cajera (RLS): ${describeHttp(r)}`)
  return { status: String(row.status), shortId: String(row.short_id), row }
}

/** Antes de que el pedido esté en cola, el motorizado no lo ve (404): devuelve null. */
async function driverView(ctx: Ctx, id: string): Promise<View | null> {
  const r = await http(ctx, 'GET', `${ctx.api}/driver/orders/${id}`, { actor: 'driver' })
  if (r.status === 404) return null
  expect(r.status === 200, `GET /driver/orders/{id}: ${describeHttp(r)}`)
  const o = unwrap(r.body).order as Json | undefined
  expect(o, `GET /driver/orders/{id} sin "order": ${r.text.slice(0, 200)}`)
  return { status: String(o.status), shortId: String(o.shortId) }
}

/** Comprueba estado esperado en las tres vistas y el mismo short_id de 8 caracteres. */
async function assertViews(
  ctx: Ctx,
  id: string,
  expected: string,
  opts: { driverMustSee: boolean; who?: Actor },
): Promise<Json> {
  const [c, b, d] = [
    await customerView(ctx, id, opts.who ?? 'customer'),
    await businessView(ctx, id),
    await driverView(ctx, id),
  ]
  expect(c.status === expected, `cliente ve "${c.status}", se esperaba "${expected}"`)
  expect(b.status === expected, `negocio ve "${b.status}", se esperaba "${expected}"`)
  if (opts.driverMustSee) {
    expect(d, 'el motorizado no ve el pedido (404) y debería')
    expect(d.status === expected, `motorizado ve "${d.status}", se esperaba "${expected}"`)
  } else if (d) {
    expect(d.status === expected, `motorizado ve "${d.status}", se esperaba "${expected}"`)
  }
  const ids = new Set([c.shortId, b.shortId, ...(d ? [d.shortId] : [])])
  expect(ids.size === 1, `short_id distinto entre actores: ${[...ids].join(' / ')}`)
  expect(/^[A-HJ-NP-Z2-9]{8}$/.test(c.shortId), `short_id inválido: "${c.shortId}"`)
  return b.row
}

// ── Acciones ──────────────────────────────────────────────────────────────────────────────────────
async function transition(
  ctx: Ctx,
  actor: 'business' | 'driver',
  id: string,
  body: Json,
  expectedStatus: string,
): Promise<void> {
  const r = await http(ctx, 'POST', `${ctx.api}/${actor}/orders/${id}/transition`, { actor, body })
  expect(r.status === 200, `${actor} ${String(body.action)}: ${describeHttp(r)}`)
  const got = unwrap(r.body).status
  expect(
    got === undefined || got === expectedStatus,
    `respuesta dice status "${String(got)}", se esperaba "${expectedStatus}"`,
  )
}

interface Created {
  id: string
  shortId: string
  status: string
}

function orderBody(
  paymentIntent: 'pending_cash' | 'prepaid',
  cashPayingWith?: number,
  who: Actor = 'customer',
  extra: Json = {},
): Json {
  const body: Json = {
    businessId: BUSINESS_ID,
    deliveryMethod: 'delivery',
    paymentIntent,
    customerName: CUSTOMER_NAME,
    customerPhone: PHONES[who] ?? CUSTOMER_PHONE,
    deliveryAddress: DELIVERY.address,
    deliveryReference: DELIVERY.reference,
    coordinates: { lat: DELIVERY.lat, lng: DELIVERY.lng },
    gpsValidation: {
      lat: DELIVERY.lat,
      lng: DELIVERY.lng,
      accuracyM: 15,
      distanceToCenterKm: 0.5,
      method: 'gps_high_accuracy',
    },
    items: [
      { menuItemId: ITEM_MEDIO_ID, quantity: 1 },
      { menuItemId: ITEM_GASEOSA_ID, quantity: 1 },
    ],
  }
  if (cashPayingWith !== undefined) body.cashPayingWith = cashPayingWith
  Object.assign(body, extra)
  if (extra.deliveryMethod === 'pickup') {
    // Un recojo no lleva domicilio ni punto de entrega.
    for (const k of ['deliveryAddress', 'deliveryReference', 'coordinates', 'gpsValidation']) {
      delete body[k]
    }
  }
  return body
}

async function createOrder(
  ctx: Ctx,
  paymentIntent: 'pending_cash' | 'prepaid',
  cashPayingWith?: number,
  who: Actor = 'customer',
  extra: Json = {},
): Promise<Created> {
  const body = orderBody(paymentIntent, cashPayingWith, who, extra)
  const r = await http(ctx, 'POST', `${ctx.api}/customer/orders`, {
    actor: who,
    body,
    headers: { 'idempotency-key': randomUUID() },
  })
  expect(r.status === 201, `POST /customer/orders: ${describeHttp(r)}`)
  const o = unwrap(r.body)
  expect(
    typeof o.id === 'string' && typeof o.shortId === 'string',
    `respuesta sin id/shortId: ${r.text.slice(0, 300)}`,
  )
  return { id: String(o.id), shortId: String(o.shortId), status: String(o.status) }
}

/** La cajera aprueba un pedido en `validando` (llamada hecha) y deja constancia del estado resultante. */
async function validatePass(ctx: Ctx, id: string, prep: number): Promise<string> {
  const r = await http(ctx, 'POST', `${ctx.api}/business/orders/${id}/validate`, {
    actor: 'business',
    body: { pass: true, prepTimeMinutes: prep },
  })
  expect(r.status === 200, `POST /business/orders/{id}/validate: ${describeHttp(r)}`)
  return String(unwrap(r.body).status)
}

/** `ready` → driver: take · arrived · pickup · arrived_customer · deliver. */
async function readyAndDeliver(ctx: Ctx, id: string, deliver: Json): Promise<Json> {
  await step('negocio: ready → waiting_driver', async () => {
    await transition(ctx, 'business', id, { action: 'ready' }, 'waiting_driver')
    await assertViews(ctx, id, 'waiting_driver', { driverMustSee: false })
  })
  await step('motorizado: take → heading_to_restaurant', async () => {
    await transition(ctx, 'driver', id, { action: 'take' }, 'heading_to_restaurant')
    await assertViews(ctx, id, 'heading_to_restaurant', { driverMustSee: true })
  })
  await step('motorizado: arrived → waiting_at_restaurant', async () => {
    await transition(ctx, 'driver', id, { action: 'arrived' }, 'waiting_at_restaurant')
    await assertViews(ctx, id, 'waiting_at_restaurant', { driverMustSee: true })
  })
  await step('motorizado: pickup → picked_up', async () => {
    await transition(ctx, 'driver', id, { action: 'pickup' }, 'picked_up')
    await assertViews(ctx, id, 'picked_up', { driverMustSee: true })
  })
  await step('motorizado: arrived_customer (sigue picked_up)', async () => {
    await transition(
      ctx,
      'driver',
      id,
      { action: 'arrived_customer', lat: DELIVERY.lat, lng: DELIVERY.lng, accuracy_m: 10 },
      'picked_up',
    )
    await assertViews(ctx, id, 'picked_up', { driverMustSee: true })
    const c = await http(ctx, 'GET', `${ctx.api}/customer/orders/${id}`, { actor: 'customer' })
    expect(
      unwrap(c.body).arrivedAtCustomerAt,
      'el cliente no ve arrivedAtCustomerAt tras arrived_customer',
    )
  })
  let row: Json = {}
  await step('motorizado: deliver → delivered', async () => {
    await transition(ctx, 'driver', id, { action: 'deliver', ...deliver }, 'delivered')
    row = await assertViews(ctx, id, 'delivered', { driverMustSee: true })
  })
  return row
}

// ── Escenarios ────────────────────────────────────────────────────────────────────────────────────
async function scenarioContraentrega(ctx: Ctx, prep: number): Promise<string> {
  console.log('\nEscenario 1 · contraentrega (efectivo)')
  const PAYS_WITH = 50
  const created = await step(
    'cliente: POST /customer/orders (pending_cash, billete 50)',
    async () => {
      const o = await createOrder(ctx, 'pending_cash', PAYS_WITH)
      expect(
        ['validando', 'pending_acceptance'].includes(o.status),
        `estado inicial inesperado: ${o.status}`,
      )
      return o
    },
  )
  const id = created.id
  console.log(`        pedido ${created.shortId} (${id}) nace en ${created.status}`)
  // Dinero esperado, calculado AQUÍ desde la entrada y desde `app_settings.delivery_bands` (la tarifa que el seed y las
  // migraciones fijan para la banda cercana); nunca desde la fila que se está comprobando ni desde la cotización.
  const feeCents = await expectedFeeCents(ctx)
  const totalCents = SUBTOTAL * 100 + feeCents
  const changeCents = PAYS_WITH * 100 - totalCents
  expect(changeCents > 0, `el escenario necesita vuelto: paga con ${PAYS_WITH} y el total es ${totalCents / 100}`)
  await step('dinero como cadena (API-8): amount, deliveryFee, total, paysWith, changeToGive', async () => {
    const r = await call(ctx, 'customer', 'GET', `/customer/orders/${id}`)
    expect(r.status === 200, `GET order: ${describeHttp(r)}`)
    const o = unwrap(r.body)
    expectMoney('amount', o.amount, SUBTOTAL * 100)
    expectMoney('deliveryFee', o.deliveryFee, feeCents)
    expectMoney('total', o.total, totalCents)
    expectMoney('paysWith', o.paysWith, PAYS_WITH * 100)
    expectMoney('changeToGive', o.changeToGive, changeCents)
  })
  await step(`vistas: ${created.status}`, async () => {
    await assertViews(ctx, id, created.status, { driverMustSee: false })
  })
  let status = created.status
  if (status === 'validando') {
    status = await step('negocio: validate pass (llamada de la cajera)', async () => {
      const s = await validatePass(ctx, id, prep)
      expect(['pending_acceptance', 'preparing'].includes(s), `validate dejó "${s}"`)
      await assertViews(ctx, id, s, { driverMustSee: false })
      return s
    })
  }
  if (status === 'pending_acceptance') {
    await step(`negocio: accept (prep ${prep} min) → preparing`, async () => {
      await transition(
        ctx,
        'business',
        id,
        { action: 'accept', prepTimeMinutes: prep },
        'preparing',
      )
      await assertViews(ctx, id, 'preparing', { driverMustSee: false })
    })
  }
  const row = await readyAndDeliver(ctx, id, {
    paymentReal: 'paid_cash',
    clientPaysWith: PAYS_WITH,
    cashAmount: totalCents / 100,
  })
  await step('dinero: efectivo cobrado, vuelto y a rendir salen de la fórmula, no de la fila', async () => {
    expect(row.payment_real === 'paid_cash', `payment_real "${String(row.payment_real)}"`)
    expectMoneyNumber('client_pays_with', row.client_pays_with, PAYS_WITH * 100)
    expectMoneyNumber('change_to_give', row.change_to_give, changeCents)
    // Regla 0146: rendir = adelanto de vuelto + parte en efectivo del pedido. Con paga-con 50 y total T:
    // vuelto = 50 − T y a rendir = (50 − T) + T = 50. Una regresión coordinada (vuelto 0 y rendir = T) rompe las dos.
    expectMoneyNumber('cash_owed_at_delivery', row.cash_owed_at_delivery, changeCents + totalCents)
  })
  return id
}

async function scenarioPrepago(ctx: Ctx, prep: number): Promise<string> {
  console.log('\nEscenario 2 · prepago (comprobante)')
  const created = await step('cliente: POST /customer/orders (prepaid)', async () => {
    const o = await createOrder(ctx, 'prepaid')
    expect(o.status === 'pending_acceptance', `estado inicial inesperado: ${o.status}`)
    return o
  })
  const id = created.id
  console.log(`        pedido ${created.shortId} (${id}) nace en ${created.status}`)
  await step('vistas: pending_acceptance', async () => {
    await assertViews(ctx, id, 'pending_acceptance', { driverMustSee: false })
  })
  await step('negocio: accept → awaiting_payment', async () => {
    await transition(
      ctx,
      'business',
      id,
      { action: 'accept', prepTimeMinutes: prep },
      'awaiting_payment',
    )
    await assertViews(ctx, id, 'awaiting_payment', { driverMustSee: false })
  })
  const path = await step('cliente: prepay-proof/upload-url + PUT de la imagen', async () => {
    const r = await http(ctx, 'POST', `${ctx.api}/customer/orders/${id}/prepay-proof/upload-url`, {
      actor: 'customer',
      body: { contentType: 'image/png' },
    })
    expect(r.status === 200 || r.status === 201, `upload-url: ${describeHttp(r)}`)
    const u = unwrap(r.body)
    expect(
      typeof u.path === 'string' && typeof u.uploadUrl === 'string',
      `upload-url sin path/uploadUrl: ${r.text.slice(0, 200)}`,
    )
    const put = await putUpload(ctx, String(u.uploadUrl), {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: new Blob([PNG_1X1], { type: 'image/png' }),
    })
    expect(put.ok, `PUT a Storage: HTTP ${put.status} ${redact((await put.text()).slice(0, 300))}`)
    return String(u.path)
  })
  await step('cliente: POST prepay-proof → validando', async () => {
    const r = await http(ctx, 'POST', `${ctx.api}/customer/orders/${id}/prepay-proof`, {
      actor: 'customer',
      body: { path },
    })
    expect(r.status === 200, `prepay-proof: ${describeHttp(r)}`)
    await assertViews(ctx, id, 'validando', { driverMustSee: false })
  })
  await step('negocio: validate pass → preparing', async () => {
    const s = await validatePass(ctx, id, prep)
    expect(s === 'preparing', `validate dejó "${s}", se esperaba "preparing"`)
    await assertViews(ctx, id, 'preparing', { driverMustSee: false })
  })
  const row = await readyAndDeliver(ctx, id, {})
  await step('dinero: pago real = paid_prepaid, nada que rendir en efectivo', async () => {
    expect(row.payment_real === 'paid_prepaid', `payment_real "${String(row.payment_real)}"`)
    expect(
      Number(row.cash_owed_at_delivery ?? 0) === 0,
      `cash_owed_at_delivery ${String(row.cash_owed_at_delivery)}`,
    )
  })
  return id
}


/** Dinero de una columna numérica de la base (llega como número o cadena) contra centavos esperados. */
function expectMoneyNumber(label: string, got: unknown, expectedCents: number): void {
  expect(
    got !== null && got !== undefined && Math.round(Number(got) * 100) === expectedCents,
    `${label} = ${String(got)}; se esperaba ${(expectedCents / 100).toFixed(2)}`,
  )
}

/** Tarifa de envío esperada para la banda cercana: `app_settings.delivery_bands.near` (legible por cualquier sesión). */
async function expectedFeeCents(ctx: Ctx): Promise<number> {
  const r = await http(
    ctx,
    'GET',
    `${ctx.supabase}/rest/v1/app_settings?key=eq.delivery_bands&select=value`,
    { actor: 'customer', headers: { apikey: ctx.anonKey } },
  )
  const rows = JSON.parse(r.text || '[]') as { value?: { near?: unknown } }[]
  const near = Number(rows[0]?.value?.near)
  expect(r.status === 200 && Number.isFinite(near), `app_settings.delivery_bands.near: ${describeHttp(r)}`)
  return Math.round(near * 100)
}

// ── Escenarios 3 en adelante (ver Docs/trabajo/e2e/escenarios.md) ─────────────────────────────────
async function call(
  ctx: Ctx,
  actor: Actor,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; body: Json; text: string; headers: Headers }> {
  return http(ctx, method, `${ctx.api}${path}`, { actor, body, headers })
}

const svcHeaders = (key: string): Record<string, string> => ({
  apikey: key,
  authorization: `Bearer ${key}`,
})

/** Si el pedido nació en `validando`, la cajera lo valida; devuelve el estado resultante. */
async function settle(ctx: Ctx, o: Created, who: Actor): Promise<string> {
  if (o.status === 'validando') await validatePass(ctx, o.id, 2)
  return (await customerView(ctx, o.id, who)).status
}

/** Pedido de efectivo de `who` hasta `preparing`. */
async function toPreparing(ctx: Ctx, who: Actor): Promise<Created> {
  const o = await createOrder(ctx, 'pending_cash', 50, who)
  const st = await settle(ctx, o, who)
  if (st === 'pending_acceptance') {
    await transition(ctx, 'business', o.id, { action: 'accept', prepTimeMinutes: 2 }, 'preparing')
  }
  expect((await customerView(ctx, o.id, who)).status === 'preparing', 'no llegó a preparing')
  return o
}

/** Cierra cualquier pedido activo de `who` en el negocio e2e: un escenario roto no debe dejar pedidos que arrastren a los demás. */
async function releaseActive(ctx: Ctx, who: Actor): Promise<void> {
  const list = await call(ctx, who, 'GET', '/customer/orders')
  if (list.status !== 200) return
  const root = unwrap(list.body)
  const rows = (Array.isArray(root.items) ? root.items : Array.isArray(list.body.data) ? list.body.data : []) as Json[]
  for (const row of rows) {
    const st = String(row.status)
    if (st === 'delivered' || st === 'cancelled') continue
    const r = await call(ctx, 'business', 'POST', `/business/orders/${String(row.id)}/transition`, {
      action: 'cancel',
      reasonCode: 'other',
    })
    console.log(`        limpieza: pedido ${String(row.id).slice(0, 8)} de ${who} en ${st} → HTTP ${r.status}`)
  }
}

async function scenarioRechazo(ctx: Ctx): Promise<string> {
  console.log('\nEscenario · el negocio rechaza el pedido')
  const o = await step('cliente2: POST /customer/orders (efectivo)', () =>
    createOrder(ctx, 'pending_cash', 50, 'customer2'),
  )
  await step('negocio: llamada de la cajera si hace falta', async () => {
    await settle(ctx, o, 'customer2')
  })
  await step('negocio: cancel (sin stock) → cancelled, visto por todos', async () => {
    await transition(
      ctx,
      'business',
      o.id,
      { action: 'cancel', reasonCode: 'out_of_stock' },
      'cancelled',
    )
    await assertViews(ctx, o.id, 'cancelled', { driverMustSee: false, who: 'customer2' })
  })
  await step('un pedido cancelado es terminal: accept da 4xx', async () => {
    const r = await call(ctx, 'business', 'POST', `/business/orders/${o.id}/transition`, {
      action: 'accept',
      prepTimeMinutes: 5,
    })
    expectProblem(r, 409, 'invalid_state_transition', 'accept sobre un pedido cancelado')
  })
  return o.id
}

async function scenarioCancelaCliente(ctx: Ctx): Promise<string> {
  console.log('\nEscenario · el cliente cancela dentro de la ventana')
  const a = await step('cliente3: POST /customer/orders', () =>
    createOrder(ctx, 'pending_cash', 50, 'customer3'),
  )
  await step('cliente3: un segundo pedido en el mismo negocio se bloquea', async () => {
    let status = 0
    let text = ''
    try {
      await createOrder(ctx, 'pending_cash', 50, 'customer3')
    } catch (e) {
      text = e instanceof Error ? e.message : String(e)
      status = Number(/HTTP (\d+)/.exec(text)?.[1] ?? 0)
    }
    // CUS-CAT-018 dice 409 `active_order_block`; el servidor responde 422 `validation_error` con el texto «pedido activo».
    // Es una discrepancia entre el CA y el código (ver Docs/trabajo/e2e/escenarios.md): aquí se afirma el bloqueo.
    expect(status === 409 || status === 422, `esperaba 409/422: ${text.slice(0, 200)}`)
    expect(/pedido activo/i.test(text), `el bloqueo no explica el motivo: ${text.slice(0, 200)}`)
    console.log(`        el servidor respondió HTTP ${status} (el CA dice 409)`)
  })
  await step('cliente3: POST /cancel → cancelled', async () => {
    const r = await call(ctx, 'customer3', 'POST', `/customer/orders/${a.id}/cancel`)
    expect(r.status === 200, `cancel: ${describeHttp(r)}`)
    await assertViews(ctx, a.id, 'cancelled', { driverMustSee: false, who: 'customer3' })
  })
  const b = await step('cliente3: pide otro y el negocio lo acepta', () => toPreparing(ctx, 'customer3'))
  await step('cliente3: ya aceptado, cancelar da 4xx', async () => {
    const r = await call(ctx, 'customer3', 'POST', `/customer/orders/${b.id}/cancel`)
    expectProblem(r, 409, 'order_not_cancellable', 'cancelar tras aceptar')
    expect(
      (await customerView(ctx, b.id, 'customer3')).status === 'preparing',
      'el pedido cambió de estado',
    )
  })
  await step('negocio: cierra ese pedido para no dejarlo activo', async () => {
    await transition(ctx, 'business', b.id, { action: 'cancel', reasonCode: 'other' }, 'cancelled')
  })
  return a.id
}

async function scenarioNoShow(ctx: Ctx, serviceKey: string): Promise<string> {
  console.log('\nEscenario · el motorizado reporta «no se presentó»')
  // Un cliente propio (teléfono y referencia únicos): el strike del no-show no envenena a los clientes e2e fijos
  // ni la dirección «Portón azul…» que comparte Playwright (apps/api/scripts/e2e-fixtures.ts).
  const o = await step('cliente nuevo propio: pedido hasta preparing', async () => {
    await createFreshCustomer(ctx, serviceKey, 'fresh2')
    const put = await call(ctx, 'fresh2', 'PUT', '/customer/profile', { fullName: 'Cliente No Show' })
    expect(put.status === 200, `PUT profile: ${describeHttp(put)}`)
    const phone = `9${String(Date.now() + 1).slice(-8)}`
    const s0 = await call(ctx, 'fresh2', 'POST', '/customer/phone/send-code', { phone })
    expect(s0.status === 200, `send-code: ${describeHttp(s0)}`)
    const v0 = await call(ctx, 'fresh2', 'POST', '/customer/phone/verify', { phone, code: '000000' })
    expect(v0.status === 200, `verify: ${describeHttp(v0)}`)
    const c = await createOrder(ctx, 'pending_cash', 50, 'fresh2', {
      customerPhone: phone,
      deliveryReference: `Casa de la prueba no-show ${Date.now()}`,
    })
    const st = await settle(ctx, c, 'fresh2')
    if (st === 'pending_acceptance') {
      await transition(ctx, 'business', c.id, { action: 'accept', prepTimeMinutes: 2 }, 'preparing')
    }
    expect((await customerView(ctx, c.id, 'fresh2')).status === 'preparing', 'no llegó a preparing')
    return c
  })
  await step('negocio + motorizado: ready → take → arrived → pickup', async () => {
    await transition(ctx, 'business', o.id, { action: 'ready' }, 'waiting_driver')
    await transition(ctx, 'driver', o.id, { action: 'take' }, 'heading_to_restaurant')
    await transition(ctx, 'driver', o.id, { action: 'arrived' }, 'waiting_at_restaurant')
    await transition(ctx, 'driver', o.id, { action: 'pickup' }, 'picked_up')
  })
  await step('motorizado: arrived_customer; antes de 5 min no_show se rechaza', async () => {
    await transition(
      ctx,
      'driver',
      o.id,
      { action: 'arrived_customer', lat: DELIVERY.lat, lng: DELIVERY.lng, accuracy_m: 10 },
      'picked_up',
    )
    const early = await call(ctx, 'driver', 'POST', `/driver/orders/${o.id}/transition`, {
      action: 'no_show',
      lat: DELIVERY.lat,
      lng: DELIVERY.lng,
      accuracy_m: 10,
    })
    expectProblem(early, 409, 'invalid_state_transition', 'no_show antes de 5 minutos')
  })
  await step('pasan 5 min (se envejece la llegada) y no_show → cancelled', async () => {
    const svc = svcHeaders(serviceKey)
    const p = await http(ctx, 'PATCH', `${ctx.supabase}/rest/v1/orders?id=eq.${o.id}`, {
      headers: { ...svc, prefer: 'return=minimal' },
      body: { arrived_at_customer_at: new Date(Date.now() - 10 * 60_000).toISOString() },
    })
    expect(p.status < 300, `envejecer la llegada: ${describeHttp(p)}`)
    await transition(
      ctx,
      'driver',
      o.id,
      { action: 'no_show', lat: DELIVERY.lat, lng: DELIVERY.lng, accuracy_m: 10 },
      'cancelled',
    )
    await assertViews(ctx, o.id, 'cancelled', { driverMustSee: true, who: 'fresh2' })
  })
  return o.id
}

async function scenarioRecojo(ctx: Ctx): Promise<string> {
  console.log('\nEscenario · recojo en el local')
  await step('recojo «más tarde» en efectivo se rechaza (va prepagado)', async () => {
    const r = await http(ctx, 'POST', `${ctx.api}/customer/orders`, {
      actor: 'customer3',
      body: {
        businessId: BUSINESS_ID,
        deliveryMethod: 'pickup',
        pickupTiming: 'later',
        paymentIntent: 'pending_cash',
        customerName: CUSTOMER_NAME,
        customerPhone: PHONES.customer3,
        items: [{ menuItemId: ITEM_MEDIO_ID, quantity: 1 }],
      },
      headers: { 'idempotency-key': randomUUID() },
    })
    expectProblem(r, 422, 'validation_error', 'recojo «más tarde» en efectivo')
  })
  const o = await step('cliente3: POST recojo «ya», prepago', () =>
    createOrder(ctx, 'prepaid', undefined, 'customer3', {
      deliveryMethod: 'pickup',
      pickupTiming: 'now',
    }),
  )
  console.log(`        recojo ${o.shortId} nace en ${o.status}`)
  await step('negocio: el recojo sin domicilio ni tarifa llega a la cajera', async () => {
    const b = await businessView(ctx, o.id)
    expect(Number(b.row.delivery_fee ?? 0) === 0, `delivery_fee ${String(b.row.delivery_fee)}`)
  })
  await step('negocio: accept → awaiting_payment', async () => {
    await transition(
      ctx,
      'business',
      o.id,
      { action: 'accept', prepTimeMinutes: 2 },
      'awaiting_payment',
    )
  })
  await step('cliente3: comprobante → validando → la cajera valida → preparing', async () => {
    const up = await call(ctx, 'customer3', 'POST', `/customer/orders/${o.id}/prepay-proof/upload-url`, {
      contentType: 'image/png',
    })
    expect(up.status === 200 || up.status === 201, `upload-url: ${describeHttp(up)}`)
    const u = unwrap(up.body)
    const put = await putUpload(ctx, String(u.uploadUrl), {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: new Blob([PNG_1X1], { type: 'image/png' }),
    })
    expect(put.ok, `PUT: HTTP ${put.status}`)
    const pp = await call(ctx, 'customer3', 'POST', `/customer/orders/${o.id}/prepay-proof`, {
      path: String(u.path),
    })
    expect(pp.status === 200, `prepay-proof: ${describeHttp(pp)}`)
    const s = await validatePass(ctx, o.id, 2)
    expect(s === 'preparing', `validate dejó "${s}"`)
  })
  await step('negocio: ready → ready_for_pickup → handover (mostrador)', async () => {
    await transition(ctx, 'business', o.id, { action: 'ready' }, 'ready_for_pickup')
    await transition(ctx, 'business', o.id, { action: 'handover' }, 'delivered')
    await assertViews(ctx, o.id, 'delivered', { driverMustSee: false, who: 'customer3' })
  })
  return o.id
}

async function scenarioPrepagoHeic(ctx: Ctx): Promise<string> {
  console.log('\nEscenario · prepago con comprobante HEIC (foto de iPhone)')
  // Cabecera ISO-BMFF `ftyp heic`: lo mínimo para que el servidor lo reconozca como HEIC.
  const HEIC = Buffer.from('0000001866747970686569630000000068656963', 'hex')
  const o = await step('cliente3: POST prepago y el negocio acepta', async () => {
    const c = await createOrder(ctx, 'prepaid', undefined, 'customer3')
    await transition(ctx, 'business', c.id, { action: 'accept', prepTimeMinutes: 2 }, 'awaiting_payment')
    return c
  })
  await step('cliente3: upload-url image/heic + PUT + prepay-proof → validando', async () => {
    const up = await call(ctx, 'customer3', 'POST', `/customer/orders/${o.id}/prepay-proof/upload-url`, {
      contentType: 'image/heic',
    })
    expect(up.status === 200 || up.status === 201, `upload-url heic: ${describeHttp(up)}`)
    const u = unwrap(up.body)
    const put = await putUpload(ctx, String(u.uploadUrl), {
      method: 'PUT',
      headers: { 'content-type': 'image/heic' },
      body: new Blob([HEIC], { type: 'image/heic' }),
    })
    expect(put.ok, `PUT heic: HTTP ${put.status} ${redact((await put.text()).slice(0, 200))}`)
    const pp = await call(ctx, 'customer3', 'POST', `/customer/orders/${o.id}/prepay-proof`, {
      path: String(u.path),
    })
    expect(pp.status === 200, `prepay-proof heic: ${describeHttp(pp)}`)
    await assertViews(ctx, o.id, 'validando', { driverMustSee: false, who: 'customer3' })
  })
  await step('negocio: cancel para no dejarlo activo', async () => {
    await transition(ctx, 'business', o.id, { action: 'cancel', reasonCode: 'other' }, 'cancelled')
  })
  return o.id
}

async function scenarioMisPedidos(ctx: Ctx, deliveredId: string): Promise<void> {
  console.log('\nEscenario · Mis pedidos, repetir pedido y reseña')
  await step('cliente: GET /customer/orders lista el pedido entregado', async () => {
    const r = await call(ctx, 'customer', 'GET', '/customer/orders')
    expect(r.status === 200, `lista: ${describeHttp(r)}`)
    expect(r.text.includes(deliveredId), 'el pedido entregado no aparece en Mis pedidos')
  })
  await step('cliente: GET reorder trae la bolsa del pedido', async () => {
    const r = await call(ctx, 'customer', 'GET', `/customer/orders/${deliveredId}/reorder`)
    expect(r.status === 200, `reorder: ${describeHttp(r)}`)
    const d = unwrap(r.body)
    expect(d.businessId === BUSINESS_ID, 'reorder de otro negocio')
    expect(
      Array.isArray(d.items) && d.items.length === 2,
      `items del reorder: ${JSON.stringify(d.items)?.slice(0, 120)}`,
    )
  })
  await step('otro cliente no puede repetir un pedido ajeno (404)', async () => {
    const r = await call(ctx, 'customer2', 'GET', `/customer/orders/${deliveredId}/reorder`)
    expect(r.status === 404, `esperaba 404: ${describeHttp(r)}`)
  })
  let reviewId = deliveredId
  await step('la reseña aparece pendiente (es UN pedido: el más reciente sin calificar)', async () => {
    const r = await call(ctx, 'customer', 'GET', '/customer/reviews/pending')
    expect(r.status === 200, `pending: ${describeHttp(r)}`)
    const d = unwrap(r.body)
    expect(typeof d.orderId === 'string', `sin pedido pendiente: ${r.text.slice(0, 200)}`)
    reviewId = String(d.orderId)
    expect(d.businessId === BUSINESS_ID, 'la reseña pendiente es de otro negocio')
  })
  await step('POST review 5 estrellas → creada; una segunda falla', async () => {
    const r = await call(ctx, 'customer', 'POST', `/customer/orders/${reviewId}/review`, {
      rating: 5,
      tags: [],
      comment: 'e2e',
    })
    expect(r.status === 201 || r.status === 200, `review: ${describeHttp(r)}`)
    const again = await call(ctx, 'customer', 'POST', `/customer/orders/${reviewId}/review`, {
      rating: 4,
      tags: [],
    })
    expectProblem(again, 409, 'conflict', 'la 2.ª reseña del mismo pedido')
  })
}

async function scenarioPrepagoVencido(ctx: Ctx, serviceKey: string): Promise<string> {
  console.log('\nEscenario · cancelación automática por falta de pago (solo local)')
  const svc = svcHeaders(serviceKey)
  const o = await step('cliente2: POST prepago y el negocio acepta', async () => {
    const c = await createOrder(ctx, 'prepaid', undefined, 'customer2')
    await transition(ctx, 'business', c.id, { action: 'accept', prepTimeMinutes: 2 }, 'awaiting_payment')
    return c
  })
  await step('se envejece awaiting_payment_at 60 min y corre el barrido (pg_cron)', async () => {
    const g = await http(
      ctx,
      'GET',
      `${ctx.supabase}/rest/v1/orders?id=eq.${o.id}&select=awaiting_payment_at`,
      { headers: svc },
    )
    const at = (JSON.parse(g.text) as { awaiting_payment_at: string }[])[0]?.awaiting_payment_at
    expect(at, 'sin awaiting_payment_at')
    const p = await http(ctx, 'PATCH', `${ctx.supabase}/rest/v1/orders?id=eq.${o.id}`, {
      headers: { ...svc, prefer: 'return=minimal' },
      body: { awaiting_payment_at: new Date(Date.parse(at) - 60 * 60_000).toISOString() },
    })
    expect(p.status < 300, `envejecer: ${describeHttp(p)}`)
    const sweep = await http(
      ctx,
      'POST',
      `${ctx.supabase}/rest/v1/rpc/cancel_expired_prepay_orders`,
      { headers: svc, body: {} },
    )
    expect(sweep.status < 300, `barrido: ${describeHttp(sweep)}`)
  })
  await step('todos ven cancelled por prepay_timeout y hay OrderExpired en el outbox', async () => {
    await assertViews(ctx, o.id, 'cancelled', { driverMustSee: false, who: 'customer2' })
    const r = await http(
      ctx,
      'GET',
      `${ctx.supabase}/rest/v1/orders?id=eq.${o.id}&select=cancel_reason`,
      { headers: svc },
    )
    expect(r.text.includes('prepay_timeout'), `cancel_reason: ${r.text}`)
    const e = await http(
      ctx,
      'GET',
      `${ctx.supabase}/rest/v1/domain_events?aggregate_id=eq.${o.id}&event_type=eq.OrderExpired&select=event_type`,
      { headers: svc },
    )
    expect(e.text.includes('OrderExpired'), 'sin OrderExpired en el outbox')
  })
  return o.id
}

// Un número distinto en cada corrida: un celular verificado queda asociado a su cuenta (no se reutiliza).
const FRESH_PHONE = `9${String(Date.now()).slice(-8)}`

/** Cliente nuevo (solo local, con service role): lo que ve la app tras entrar por primera vez. */
async function createFreshCustomer(
  ctx: Ctx,
  serviceKey: string,
  who: Actor = 'fresh',
): Promise<{ email: string }> {
  const email = `${who}-${Date.now()}@e2e.local`
  const r = await http(ctx, 'POST', `${ctx.supabase}/auth/v1/admin/users`, {
    headers: svcHeaders(serviceKey),
    body: { email, password: E2E_PASSWORD, email_confirm: true },
  })
  expect(r.status < 300, `crear usuario nuevo: ${describeHttp(r)}`)
  ctx.tokens[who] = await login(ctx, email, E2E_PASSWORD)
  return { email }
}

/** El cliente nuevo con celular verificado (lo que piden pedir y Entregas); se crea una sola vez por corrida. */
async function ensureVerifiedFresh(ctx: Ctx, serviceKey: string): Promise<void> {
  if (ctx.tokens.fresh && freshVerified) return
  if (!ctx.tokens.fresh) await createFreshCustomer(ctx, serviceKey)
  const put = await call(ctx, 'fresh', 'PUT', '/customer/profile', { fullName: 'Cliente Nuevo' })
  expect(put.status === 200, `PUT profile: ${describeHttp(put)}`)
  const s = await call(ctx, 'fresh', 'POST', '/customer/phone/send-code', { phone: FRESH_PHONE })
  expect(s.status === 200, `send-code: ${describeHttp(s)}`)
  const v = await call(ctx, 'fresh', 'POST', '/customer/phone/verify', { phone: FRESH_PHONE, code: '000000' })
  expect(v.status === 200, `verify: ${describeHttp(v)}`)
  freshVerified = true
}
let freshVerified = false

async function scenarioCelularSms(ctx: Ctx, serviceKey: string): Promise<void> {
  console.log('\nEscenario · cliente nuevo: acceso con celular por SMS (OTP simulado en local)')
  await step('cliente nuevo: sin perfil (404), PUT /customer/profile lo crea', async () => {
    if (!ctx.tokens.fresh) await createFreshCustomer(ctx, serviceKey)
    const before = await call(ctx, 'fresh', 'GET', '/customer/profile')
    expect(before.status === 404, `un cliente nuevo no tiene perfil: ${describeHttp(before)}`)
    const r = await call(ctx, 'fresh', 'PUT', '/customer/profile', { fullName: 'Cliente Nuevo' })
    expect(r.status === 200, `PUT profile: ${describeHttp(r)}`)
  })
  await step('send-code → 200; un código equivocado no verifica', async () => {
    const s = await call(ctx, 'fresh', 'POST', '/customer/phone/send-code', { phone: FRESH_PHONE })
    expect(s.status === 200, `send-code: ${describeHttp(s)}`)
    const bad = await call(ctx, 'fresh', 'POST', '/customer/phone/verify', {
      phone: FRESH_PHONE,
      code: '111111',
    })
    expectProblem(bad, 422, 'validation_error', 'código SMS equivocado')
  })
  await step('verify con el código del simulacro (000000) → teléfono verificado', async () => {
    const v = await call(ctx, 'fresh', 'POST', '/customer/phone/verify', {
      phone: FRESH_PHONE,
      code: '000000',
    })
    expect(v.status === 200, `verify: ${describeHttp(v)}`)
    const p = await call(ctx, 'fresh', 'GET', '/customer/profile')
    expect(p.text.includes(FRESH_PHONE), `el perfil no muestra el celular verificado: ${p.text.slice(0, 200)}`)
    freshVerified = true
  })
}

async function scenarioEntregas(ctx: Ctx, serviceKey: string): Promise<string> {
  console.log('\nEscenario · Tindivo Entregas de A a B')
  await step('cliente nuevo con celular verificado', () => ensureVerifiedFresh(ctx, serviceKey))
  const body = {
    origin: {
      contactName: 'Tienda de Rosa',
      coordinates: { lat: -9.1465, lng: -78.2779 },
      referenceText: 'Frente a la plaza, puerta verde',
    },
    destination: {
      contactName: 'María Pérez',
      contactPhone: '900000077',
      coordinates: { lat: DELIVERY.lat, lng: DELIVERY.lng },
      referenceText: 'Portón azul, frente al parque',
    },
    requesterName: 'Cliente Nuevo',
    requesterPhone: FRESH_PHONE,
    itemDescription: 'Una caja pequeña ya pagada',
    isFragile: false,
    readyInMin: 0,
    payer: 'origin',
    weightConfirmed: true,
    prepaidConfirmed: true,
  }
  const id = await step('cliente nuevo (verificado): POST /customer/courier-orders', async () => {
    const r = await call(ctx, 'fresh', 'POST', '/customer/courier-orders', body, {
      'idempotency-key': randomUUID(),
    })
    expect(r.status === 201, `courier-orders: ${describeHttp(r)}`)
    const d = unwrap(r.body)
    expect(typeof d.id === 'string', `sin id: ${r.text.slice(0, 200)}`)
    return String(d.id)
  })
  await step('motorizado: la entrega aparece en su lista', async () => {
    const r = await call(ctx, 'driver', 'GET', '/driver/courier-orders')
    expect(r.status === 200, `driver courier-orders: ${describeHttp(r)}`)
    expect(r.text.includes(id), 'la entrega no aparece al motorizado')
  })
  for (const [step_, extra] of [
    ['accept', {}],
    ['pick_up', { paymentMethod: 'cash' }],
    ['deliver', {}],
  ] as const) {
    await step(`motorizado: ${step_}`, async () => {
      const r = await call(ctx, 'driver', 'POST', `/driver/courier-orders/${id}/step`, {
        step: step_,
        ...extra,
      })
      expect(r.status === 200, `${step_}: ${describeHttp(r)}`)
    })
  }
  await step('cliente: Entregas lo muestra entregado en su historial', async () => {
    const r = await call(ctx, 'fresh', 'GET', '/customer/courier-orders')
    expect(r.status === 200, `historial: ${describeHttp(r)}`)
    expect(r.text.includes(id) && r.text.includes('delivered'), `historial: ${r.text.slice(0, 300)}`)
  })
  return id
}

async function scenarioBorrarCuenta(ctx: Ctx, serviceKey: string): Promise<void> {
  console.log('\nEscenario · borrar la cuenta (Apple 5.1.1(v) / Google)')
  await step('cliente nuevo con celular verificado', () => ensureVerifiedFresh(ctx, serviceKey))
  const o = await step('cliente nuevo: pedido en curso (recojo no; delivery efectivo)', async () => {
    const c = await createOrder(ctx, 'pending_cash', 50, 'fresh', { customerPhone: FRESH_PHONE })
    return c
  })
  await step('DELETE /customer/account con un pedido en curso → 409', async () => {
    const r = await call(ctx, 'fresh', 'DELETE', '/customer/account')
    expect(r.status === 409, `esperaba 409: ${describeHttp(r)}`)
  })
  await step('el pedido se cancela y la cuenta se borra → 204', async () => {
    const c = await call(ctx, 'fresh', 'POST', `/customer/orders/${o.id}/cancel`)
    expect(c.status === 200, `cancel: ${describeHttp(c)}`)
    const r = await call(ctx, 'fresh', 'DELETE', '/customer/account')
    expect(r.status === 204, `esperaba 204: ${describeHttp(r)}`)
  })
  await step('con el mismo token la cuenta ya no existe (401)', async () => {
    const r = await call(ctx, 'fresh', 'GET', '/customer/profile')
    expect(r.status === 401, `esperaba 401: ${describeHttp(r)}`)
  })
}

async function scenarioCompatV1(ctx: Ctx): Promise<void> {
  console.log('\nEscenario · compatibilidad: formas que la app instalada ya conoce (invariante 11)')
  await step('GET /health y /openapi.json responden', async () => {
    const h = await http(ctx, 'GET', `${ctx.api}/health`)
    expect(h.status === 200, `health ${h.status}`)
    const o = await http(ctx, 'GET', `${ctx.api}/openapi.json`)
    expect(o.status === 200 && o.text.includes('/customer/orders'), `openapi ${o.status}`)
  })
  await step('un POST de pedido sin Idempotency-Key se rechaza con 422 (no se crea nada)', async () => {
    const r = await http(ctx, 'POST', `${ctx.api}/customer/orders`, {
      actor: 'customer3',
      body: orderBody('pending_cash', 50, 'customer3'),
    })
    expectProblem(r, 422, 'validation_error', 'pedido válido sin Idempotency-Key')
    expect(/Idempotency-Key/.test(r.text), `el rechazo no nombra la cabecera: ${r.text.slice(0, 200)}`)
    const list = await call(ctx, 'customer3', 'GET', '/customer/orders')
    expect(!/pending_acceptance|validando/.test(list.text), 'sin la clave se creó un pedido activo')
  })
  await step('la misma Idempotency-Key repetida no crea un segundo pedido', async () => {
    const key = randomUUID()
    const body = orderBody('pending_cash', 50, 'customer3')
    const first = await http(ctx, 'POST', `${ctx.api}/customer/orders`, {
      actor: 'customer3',
      body,
      headers: { 'idempotency-key': key },
    })
    expect(first.status === 201, `primer envío: ${describeHttp(first)}`)
    const again = await http(ctx, 'POST', `${ctx.api}/customer/orders`, {
      actor: 'customer3',
      body,
      headers: { 'idempotency-key': key },
    })
    expect(again.status === 201, `repetición: ${describeHttp(again)}`)
    expect(unwrap(again.body).id === unwrap(first.body).id, 'la repetición devolvió otro pedido')
    expect(again.headers.get('idempotency-replayed') === 'true', 'falta idempotency-replayed: true')
    const list = await call(ctx, 'customer3', 'GET', '/customer/orders')
    const ids = (Array.isArray(unwrap(list.body).items) ? (unwrap(list.body).items as unknown[]) : []).filter((i): i is Json => typeof i === 'object' && i !== null).filter((i) => i.id === unwrap(first.body).id)
    expect(ids.length === 1, `el pedido aparece ${ids.length} veces en Mis pedidos`)
    await releaseActive(ctx, 'customer3')
  })
  await step('los pedidos entregados conservan las claves v1 (id, shortId, status, businessId)', async () => {
    const list = await call(ctx, 'customer', 'GET', '/customer/orders')
    expect(list.status === 200, `lista: ${describeHttp(list)}`)
    for (const k of ['"id"', '"shortId"', '"status"', '"businessId"']) {
      expect(list.text.includes(k), `la lista de pedidos perdió la clave ${k}`)
    }
  })
}

// ── Escenarios del 20 al 26 (ver Docs/trabajo/e2e/escenarios.md) ──────────────────────────────────
/** Sesión perezosa: solo los escenarios que usan estas cuentas las piden (staging puede no tenerlas). */
async function ensureLogin(ctx: Ctx, actor: Actor, email: string): Promise<void> {
  if (ctx.tokens[actor]) return
  ctx.tokens[actor] = await login(ctx, email, ctx.pass(email))
}

/** Intentos de comprobante que da el servidor: con `proof_attempt` < 2 un rechazo deja reintentar (`validate_order`). */
const MAX_PROOF_ATTEMPTS = 2

/** El cliente sube un PNG como comprobante del intento `attempt` y lo confirma: el pedido queda en `validando`. */
async function submitProof(ctx: Ctx, id: string, who: Actor, attempt: number): Promise<void> {
  const up = await call(ctx, who, 'POST', `/customer/orders/${id}/prepay-proof/upload-url`, {
    contentType: 'image/png',
  })
  expect(up.status === 200 || up.status === 201, `upload-url del intento ${attempt}: ${describeHttp(up)}`)
  const u = unwrap(up.body)
  expect(
    typeof u.path === 'string' && typeof u.uploadUrl === 'string',
    `upload-url sin path/uploadUrl: ${up.text.slice(0, 200)}`,
  )
  expect(
    String(u.path).includes(`/attempt-${attempt}-`),
    `la ruta no es del intento ${attempt}: ${String(u.path)}`,
  )
  const put = await putUpload(ctx, String(u.uploadUrl), {
    method: 'PUT',
    headers: { 'content-type': 'image/png' },
    body: new Blob([PNG_1X1], { type: 'image/png' }),
  })
  expect(put.ok, `PUT del intento ${attempt}: HTTP ${put.status} ${redact((await put.text()).slice(0, 200))}`)
  const pp = await call(ctx, who, 'POST', `/customer/orders/${id}/prepay-proof`, { path: String(u.path) })
  expect(pp.status === 200, `prepay-proof del intento ${attempt}: ${describeHttp(pp)}`)
}

/** La cajera rechaza el comprobante (`pass: false`, `invalid_proof`) y devuelve la respuesta de `validate_order`. */
async function rejectProof(ctx: Ctx, id: string, reason: string): Promise<Json> {
  const r = await call(ctx, 'business', 'POST', `/business/orders/${id}/validate`, {
    pass: false,
    reasonCode: 'invalid_proof',
    reason,
  })
  expect(r.status === 200, `validate pass:false: ${describeHttp(r)}`)
  return unwrap(r.body)
}

/** Pedido prepagado de `who`, aceptado por el negocio: queda esperando el comprobante. */
async function prepaidAwaitingPayment(ctx: Ctx, who: Actor): Promise<Created> {
  const c = await createOrder(ctx, 'prepaid', undefined, who)
  expect(c.status === 'pending_acceptance', `estado inicial inesperado: ${c.status}`)
  await transition(ctx, 'business', c.id, { action: 'accept', prepTimeMinutes: 2 }, 'awaiting_payment')
  return c
}

/** El pedido tal como lo ve el cliente (el DTO completo, no solo el estado). */
async function customerOrder(ctx: Ctx, id: string, who: Actor): Promise<Json> {
  const r = await call(ctx, who, 'GET', `/customer/orders/${id}`)
  expect(r.status === 200, `GET /customer/orders/{id}: ${describeHttp(r)}`)
  return unwrap(r.body)
}

async function scenarioComprobanteRechazado(ctx: Ctx): Promise<string> {
  console.log('\nEscenario · comprobante rechazado dos veces (CA-PAY-01, CA-PAY-P7)')
  const who: Actor = 'customer2'
  const o = await step('cliente2: POST prepago y el negocio acepta → awaiting_payment', () =>
    prepaidAwaitingPayment(ctx, who),
  )
  await step('prepay-info: sin comprobante todavía (proofAttempt 0, hasProof false)', async () => {
    const r = await call(ctx, who, 'GET', `/customer/orders/${o.id}/prepay-info`)
    expect(r.status === 200, `prepay-info: ${describeHttp(r)}`)
    const d = unwrap(r.body)
    expect(d.status === 'awaiting_payment', `prepay-info status "${String(d.status)}"`)
    expect(d.proofAttempt === 0 && d.hasProof === false, `prepay-info: ${r.text.slice(0, 200)}`)
  })
  await step('cliente2: primer comprobante (intento 1) → validando, proofAttempt 1', async () => {
    await submitProof(ctx, o.id, who, 1)
    await assertViews(ctx, o.id, 'validando', { driverMustSee: false, who })
    expect((await customerOrder(ctx, o.id, who)).proofAttempt === 1, 'proofAttempt no es 1 tras el primer comprobante')
  })
  await step('negocio: rechaza el primero → vuelve a awaiting_payment y al cliente le queda 1 intento', async () => {
    const d = await rejectProof(ctx, o.id, 'e2e: no se ve el monto')
    expect(
      d.status === 'awaiting_payment' && d.outcome === 'retry_allowed',
      `el rechazo 1 dejó ${JSON.stringify(d).slice(0, 200)}; se esperaba awaiting_payment / retry_allowed`,
    )
    await assertViews(ctx, o.id, 'awaiting_payment', { driverMustSee: false, who })
    const dto = await customerOrder(ctx, o.id, who)
    expect(dto.paymentProofStatus === 'rejected', `paymentProofStatus "${String(dto.paymentProofStatus)}"`)
    const info = unwrap((await call(ctx, who, 'GET', `/customer/orders/${o.id}/prepay-info`)).body)
    expect(info.status === 'awaiting_payment', `prepay-info status "${String(info.status)}"`)
    // «Te queda 1 intento» se calcula como el tope de intentos menos `proofAttempt`: la API no manda el texto.
    expect(
      typeof info.proofAttempt === 'number' && MAX_PROOF_ATTEMPTS - info.proofAttempt === 1,
      `prepay-info.proofAttempt = ${String(info.proofAttempt)}; quedaría ${MAX_PROOF_ATTEMPTS - Number(info.proofAttempt)} intento(s), se esperaba 1`,
    )
  })
  await step('cliente2: segundo comprobante (intento 2) → validando, proofAttempt 2', async () => {
    await submitProof(ctx, o.id, who, 2)
    await assertViews(ctx, o.id, 'validando', { driverMustSee: false, who })
    expect((await customerOrder(ctx, o.id, who)).proofAttempt === 2, 'proofAttempt no es 2 tras el segundo comprobante')
  })
  await step('negocio: rechaza el segundo → cancelled por comprobante rechazado en firme, visto por los tres', async () => {
    const d = await rejectProof(ctx, o.id, 'e2e: sigue sin verse')
    expect(
      d.status === 'cancelled' && d.outcome === 'cancelled_final',
      `el rechazo 2 dejó ${JSON.stringify(d).slice(0, 200)}; se esperaba cancelled / cancelled_final`,
    )
    await assertViews(ctx, o.id, 'cancelled', { driverMustSee: false, who })
    const dto = await customerOrder(ctx, o.id, who)
    expect(dto.cancelReason === 'proof_rejected_final', `cancelReason "${String(dto.cancelReason)}"`)
    expect(dto.paymentProofStatus === 'rejected', `paymentProofStatus "${String(dto.paymentProofStatus)}"`)
  })
  await step('un pedido cancelado no admite otro comprobante (upload-url → 409)', async () => {
    const r = await call(ctx, who, 'POST', `/customer/orders/${o.id}/prepay-proof/upload-url`, {
      contentType: 'image/png',
    })
    expectProblem(r, 409, 'invalid_state_transition', 'tercer comprobante')
  })
  // Último paso a propósito: es el que falla hoy (KNOWN_DEFECTS). Si el servidor deja crear el pedido, se cancela para
  // no dejar un pedido activo y el paso falla igual con el motivo.
  // Cuando exista el código propio del servidor para este bloqueo (canon de pagos, fila 7), se exigirá ese código exacto.
  await step(STEP_PAGO_BLOQUEA, async () => {
    const activos = async (): Promise<Json[]> => {
      const l = await call(ctx, who, 'GET', '/customer/orders')
      expect(l.status === 200, `lista de pedidos: ${describeHttp(l)}`)
      const root = unwrap(l.body)
      const rows = (Array.isArray(root.items) ? root.items : []) as Json[]
      return rows.filter((x) => !['delivered', 'cancelled'].includes(String(x.status)))
    }
    expect((await activos()).length === 0, 'cliente2 ya tiene un pedido activo: el bloqueo no sería de pago')
    const r = await http(ctx, 'POST', `${ctx.api}/customer/orders`, {
      actor: who,
      body: orderBody('prepaid', undefined, who),
      headers: { 'idempotency-key': randomUUID() },
    })
    if (r.status === 201) {
      const nuevo = String(unwrap(r.body).id)
      await call(ctx, 'business', 'POST', `/business/orders/${nuevo}/transition`, {
        action: 'cancel',
        reasonCode: 'other',
      })
      throw new Error(
        `el servidor CREÓ un pedido nuevo (HTTP 201, ${nuevo.slice(0, 8)}) tras el rechazo en firme; el canon pide bloquearlo`,
      )
    }
    const code = String(r.body.code)
    expect(
      [403, 409, 422].includes(r.status) &&
        !['active_order_block', 'validation_error', 'unauthorized', 'forbidden'].includes(code),
      `el rechazo no es un bloqueo de pago (code "${code}"): ${describeHttp(r)}`,
    )
    expect((await activos()).length === 0, 'tras el rechazo quedó un pedido activo nuevo')
    console.log(`        el servidor bloqueó con HTTP ${r.status} ${code}`)
  })
  return o.id
}

const NOTA_CANCELA = 'e2e: el negocio cierra antes de entregar'

async function scenarioNegocioCancela(ctx: Ctx): Promise<string> {
  console.log('\nEscenario · el negocio cancela un pedido de contraentrega ya aceptado')
  const who: Actor = 'customer3'
  const o = await step('cliente3: pedido de efectivo hasta preparing', () => toPreparing(ctx, who))
  await step('negocio: cancel con motivo desde preparing → cancelled, visto por los tres', async () => {
    await transition(
      ctx,
      'business',
      o.id,
      { action: 'cancel', reasonCode: 'other', reasonText: NOTA_CANCELA },
      'cancelled',
    )
    const row = await assertViews(ctx, o.id, 'cancelled', { driverMustSee: false, who })
    expect(row.cancel_note === NOTA_CANCELA, `cancel_note "${String(row.cancel_note)}"; se esperaba el motivo enviado`)
    const dto = await customerOrder(ctx, o.id, who)
    expect(dto.cancelReason === 'business_cancelled', `cancelReason "${String(dto.cancelReason)}"`)
  })
  await step('cancelled es terminal: accept, ready y take dan 409 invalid_state_transition', async () => {
    const accept = await call(ctx, 'business', 'POST', `/business/orders/${o.id}/transition`, {
      action: 'accept',
      prepTimeMinutes: 5,
    })
    expectProblem(accept, 409, 'invalid_state_transition', 'accept sobre un pedido cancelado')
    const ready = await call(ctx, 'business', 'POST', `/business/orders/${o.id}/transition`, { action: 'ready' })
    expectProblem(ready, 409, 'invalid_state_transition', 'ready sobre un pedido cancelado')
    const take = await call(ctx, 'driver', 'POST', `/driver/orders/${o.id}/transition`, { action: 'take' })
    expectProblem(take, 409, 'invalid_state_transition', 'take sobre un pedido cancelado')
    expect((await customerView(ctx, o.id, who)).status === 'cancelled', 'el pedido salió de cancelled')
  })
  return o.id
}

/**
 * Depende del horario operativo: activar la disponibilidad solo se puede dentro de él (`set_driver_availability`);
 * el mundo e2e lo deja abierto todo el día. Al terminar, motorizado2 vuelve a no disponible aunque el escenario falle.
 */
async function scenarioTraspaso(ctx: Ctx): Promise<string> {
  try {
    return await scenarioTraspasoCuerpo(ctx)
  } finally {
    if (ctx.tokens.driver2) {
      await call(ctx, 'driver2', 'POST', '/driver/availability', { available: false }).catch(
        () => undefined,
      )
    }
  }
}

async function scenarioTraspasoCuerpo(ctx: Ctx): Promise<string> {
  console.log('\nEscenario · traspaso de un pedido entre motorizados')
  // Sin norma en Docs/producto/ para el traspaso: se afirma lo que hace el código (0043, 0130, 0134).
  const who: Actor = 'customer3'
  await step('motorizado2: inicia sesión y queda disponible', async () => {
    await ensureLogin(ctx, 'driver2', DRIVER_2_EMAIL)
    const r = await call(ctx, 'driver2', 'POST', '/driver/availability', { available: true })
    expect(r.status === 200, `disponibilidad de motorizado2: ${describeHttp(r)}`)
    const g = await call(ctx, 'driver2', 'GET', '/driver/availability')
    expect(unwrap(g.body).available === true, `motorizado2 no quedó disponible: ${g.text.slice(0, 200)}`)
  })
  const o = await step('cliente3: pedido en preparing → ready → motorizado1 toma → heading_to_restaurant', async () => {
    const c = await toPreparing(ctx, who)
    await transition(ctx, 'business', c.id, { action: 'ready' }, 'waiting_driver')
    await transition(ctx, 'driver', c.id, { action: 'take' }, 'heading_to_restaurant')
    const row = await assertViews(ctx, c.id, 'heading_to_restaurant', { driverMustSee: true, who })
    expect(row.driver_id === DRIVER_1_ID, `driver_id ${String(row.driver_id)}; se esperaba el motorizado 1`)
    return c
  })
  const requestId = await step('motorizado2: transfer-request → solicitud pending; el pedido sigue con el 1', async () => {
    const r = await call(
      ctx,
      'driver2',
      'POST',
      `/driver/orders/${o.id}/transfer-request`,
      { reason: 'e2e: voy cerca del local' },
      { 'idempotency-key': randomUUID() },
    )
    expect(r.status === 200 || r.status === 201, `transfer-request: ${describeHttp(r)}`)
    const d = unwrap(r.body)
    expect(
      typeof d.id === 'string' && d.status === 'pending' && d.orderId === o.id,
      `solicitud inesperada: ${r.text.slice(0, 200)}`,
    )
    const row = (await businessView(ctx, o.id)).row
    expect(row.driver_id === DRIVER_1_ID, 'el pedido cambió de manos sin respuesta del dueño')
    return String(d.id)
  })
  await step('motorizado2 no puede responder su propia solicitud (no es el dueño)', async () => {
    const r = await call(ctx, 'driver2', 'POST', `/driver/transfers/${requestId}/respond`, { accept: true })
    // Sin norma: el código responde 422 validation_error con «No eres el motorizado de este pedido».
    expectProblem(r, 422, 'validation_error', 'responder sin ser el dueño')
    expect(/motorizado/i.test(r.text), `el rechazo no explica el motivo: ${r.text.slice(0, 200)}`)
    expect((await businessView(ctx, o.id)).row.driver_id === DRIVER_1_ID, 'el pedido cambió de manos')
  })
  await step('motorizado1: respond accept → accepted y transferred; el driver_id del pedido pasa al 2', async () => {
    const r = await call(ctx, 'driver', 'POST', `/driver/transfers/${requestId}/respond`, { accept: true })
    expect(r.status === 200, `respond: ${describeHttp(r)}`)
    const d = unwrap(r.body)
    expect(d.status === 'accepted' && d.transferred === true, `respuesta: ${r.text.slice(0, 200)}`)
    const row = await assertViews(ctx, o.id, 'heading_to_restaurant', { driverMustSee: false, who })
    expect(row.driver_id === DRIVER_2_ID, `driver_id ${String(row.driver_id)}; se esperaba el motorizado 2`)
  })
  await step('motorizado1 ya no lo ve como suyo (404) y no puede operarlo (409); motorizado2 sí lo ve', async () => {
    const viejo = await call(ctx, 'driver', 'GET', `/driver/orders/${o.id}`)
    expect(viejo.status === 404, `el motorizado 1 aún ve el pedido: ${describeHttp(viejo)}`)
    const op = await call(ctx, 'driver', 'POST', `/driver/orders/${o.id}/transition`, { action: 'arrived' })
    expectProblem(op, 409, 'invalid_state_transition', 'el motorizado 1 operando un pedido traspasado')
    const nuevo = await call(ctx, 'driver2', 'GET', `/driver/orders/${o.id}`)
    expect(nuevo.status === 200, `el motorizado 2 no ve el pedido: ${describeHttp(nuevo)}`)
    const ord = unwrap(nuevo.body).order as Json | undefined
    expect(ord?.status === 'heading_to_restaurant', `motorizado 2 ve "${String(ord?.status)}"`)
  })
  await step('motorizado2 lo lleva hasta delivered (efectivo) y el negocio ve su driver_id', async () => {
    const feeCents = await expectedFeeCents(ctx)
    const totalCents = SUBTOTAL * 100 + feeCents
    const go = async (body: Json, status: string): Promise<void> => {
      const r = await call(ctx, 'driver2', 'POST', `/driver/orders/${o.id}/transition`, body)
      expect(r.status === 200, `motorizado2 ${String(body.action)}: ${describeHttp(r)}`)
      const got = unwrap(r.body).status
      expect(got === status, `${String(body.action)} dejó "${String(got)}", se esperaba "${status}"`)
    }
    await go({ action: 'arrived' }, 'waiting_at_restaurant')
    await go({ action: 'pickup' }, 'picked_up')
    await go(
      { action: 'arrived_customer', lat: DELIVERY.lat, lng: DELIVERY.lng, accuracy_m: 10 },
      'picked_up',
    )
    await go(
      { action: 'deliver', paymentReal: 'paid_cash', clientPaysWith: 50, cashAmount: totalCents / 100 },
      'delivered',
    )
    const row = await assertViews(ctx, o.id, 'delivered', { driverMustSee: false, who })
    expect(row.driver_id === DRIVER_2_ID, `driver_id ${String(row.driver_id)} tras entregar`)
    expect(row.payment_real === 'paid_cash', `payment_real "${String(row.payment_real)}"`)
  })
  return o.id
}

async function scenarioAdminNegocio(ctx: Ctx): Promise<void> {
  console.log('\nEscenario · el admin da de alta, bloquea y desbloquea un negocio')
  // Crea una cuenta de Auth y un negocio que la API no sabe borrar: por eso corre solo en local y con datos únicos por
  // corrida. El negocio nuevo no publica catálogo ni acepta pedidos web, para no tocar el mundo de los demás tests.
  const stamp = Date.now()
  const email = `e2e-alta-${stamp}@e2e.local`
  const name = `E2E Alta ${stamp}`
  await step('admin: inicia sesión', () => ensureLogin(ctx, 'admin', ADMIN_EMAIL))
  const body = {
    email,
    password: E2E_PASSWORD,
    name,
    publishesCatalog: false,
    acceptsWebDelivery: false,
    acceptsWebPickup: false,
    usesTindivoDrivers: false,
  }
  await step('un negocio (no admin) no puede dar de alta: POST /admin/businesses → 403 forbidden', async () => {
    const r = await call(ctx, 'business', 'POST', '/admin/businesses', body)
    expectProblem(r, 403, 'forbidden', 'alta hecha por un negocio')
  })
  const businessId = await step('admin: POST /admin/businesses → 201 con el negocio y su usuario', async () => {
    const r = await call(ctx, 'admin', 'POST', '/admin/businesses', body)
    expect(r.status === 201, `alta: ${describeHttp(r)}`)
    const d = unwrap(r.body)
    const biz = d.business as Json | undefined
    expect(
      typeof d.userId === 'string' && typeof biz?.id === 'string' && biz.name === name,
      `alta sin userId/negocio con el nombre pedido: ${r.text.slice(0, 300)}`,
    )
    return String(biz.id)
  })
  await step('admin: GET /admin/businesses/{id} y la lista traen el negocio, sin bloquear', async () => {
    const r = await call(ctx, 'admin', 'GET', `/admin/businesses/${businessId}`)
    expect(r.status === 200, `detalle: ${describeHttp(r)}`)
    const d = unwrap(r.body)
    expect(d.name === name && d.is_blocked === false, `detalle: ${r.text.slice(0, 300)}`)
    const list = await call(ctx, 'admin', 'GET', '/admin/businesses')
    expect(list.status === 200 && list.text.includes(businessId), 'la lista del admin no trae el negocio nuevo')
  })
  await step('admin: repetir el alta con el mismo email → 409 conflict', async () => {
    const r = await call(ctx, 'admin', 'POST', '/admin/businesses', { ...body, name: `${name} bis` })
    expectProblem(r, 409, 'conflict', 'alta con email repetido')
  })
  let nuevoToken = ''
  const resumenNegocio = async (): Promise<Json> => {
    const r = await http(ctx, 'GET', `${ctx.api}/business/account/summary`, {
      headers: { authorization: `Bearer ${nuevoToken}` },
    })
    expect(r.status === 200, `GET /business/account/summary del negocio nuevo: ${describeHttp(r)}`)
    return unwrap(r.body)
  }
  await step('la cuenta del negocio nuevo inicia sesión y su resumen de cuenta responde 200 sin bloqueo', async () => {
    nuevoToken = await login(ctx, email, E2E_PASSWORD)
    expect((await resumenNegocio()).isBlocked === false, 'el negocio nuevo nace bloqueado')
  })
  await step('un negocio no puede bloquear: POST /block → 403 forbidden', async () => {
    const r = await call(ctx, 'business', 'POST', `/admin/businesses/${businessId}/block`, { reason: 'e2e' })
    expectProblem(r, 403, 'forbidden', 'bloqueo hecho por un negocio')
  })
  await step('admin: block con motivo → is_blocked, block_reason y sin marca de deuda', async () => {
    const reason = 'e2e: prueba de bloqueo'
    const r = await call(ctx, 'admin', 'POST', `/admin/businesses/${businessId}/block`, { reason })
    expect(r.status === 200, `block: ${describeHttp(r)}`)
    const d = unwrap(r.body)
    expect(d.blocked === true && d.forDebt === false, `respuesta del bloqueo: ${r.text.slice(0, 200)}`)
    const det = unwrap((await call(ctx, 'admin', 'GET', `/admin/businesses/${businessId}`)).body)
    expect(
      det.is_blocked === true && det.block_reason === reason && det.blocked_for_debt === false,
      `detalle tras bloquear: ${JSON.stringify(det).slice(0, 300)}`,
    )
    expect((await resumenNegocio()).isBlocked === true, 'el negocio no ve su propio bloqueo')
  })
  await step('admin: unblock → desbloqueado y sin motivo', async () => {
    const r = await call(ctx, 'admin', 'POST', `/admin/businesses/${businessId}/unblock`)
    expect(r.status === 200 && unwrap(r.body).blocked === false, `unblock: ${describeHttp(r)}`)
    const det = unwrap((await call(ctx, 'admin', 'GET', `/admin/businesses/${businessId}`)).body)
    expect(
      det.is_blocked === false && det.block_reason === null,
      `detalle tras desbloquear: ${JSON.stringify(det).slice(0, 300)}`,
    )
    expect((await resumenNegocio()).isBlocked === false, 'el negocio sigue viéndose bloqueado')
  })
  await step('bloquear un negocio que no existe → 404 not_found', async () => {
    const r = await call(ctx, 'admin', 'POST', `/admin/businesses/${randomUUID()}/block`, { reason: 'e2e' })
    expectProblem(r, 404, 'not_found', 'bloqueo de un negocio inexistente')
  })
}

/** Busca un caso en la bandeja del admin recorriendo las páginas (la bandeja crece con cada corrida). */
async function findAppeal(ctx: Ctx, status: string, reportId: string): Promise<Json | undefined> {
  const PER_PAGE = 100
  for (let page = 1; page <= 50; page++) {
    const r = await call(
      ctx,
      'admin',
      'GET',
      `/admin/appeals?appeal_status=${status}&per_page=${PER_PAGE}&page=${page}`,
    )
    expect(r.status === 200, `bandeja ${status}, página ${page}: ${describeHttp(r)}`)
    const items = (Array.isArray(unwrap(r.body).items) ? unwrap(r.body).items : []) as Json[]
    const hit = items.find((i) => i.id === reportId)
    if (hit) return hit
    if (items.length < PER_PAGE) return undefined
  }
  return undefined
}

async function scenarioAdminCaso(ctx: Ctx): Promise<string> {
  console.log('\nEscenario · el admin revisa el caso de un comprobante rechazado en firme (solo lectura de dinero)')
  // `resolve` y `refund` NO se llaman: mueven dinero (business_charges, reembolsos; invariante 9 y revisión de Jesús).
  // Aquí solo la apelación del cliente, su lectura y el paso a «en revisión», que no escribe en ninguna tabla de dinero.
  const who: Actor = 'customer3'
  await step('admin: inicia sesión', () => ensureLogin(ctx, 'admin', ADMIN_EMAIL))
  const o = await step('cliente3: prepago rechazado dos veces → cancelled (proof_rejected_final)', async () => {
    const c = await prepaidAwaitingPayment(ctx, who)
    await submitProof(ctx, c.id, who, 1)
    const d1 = await rejectProof(ctx, c.id, 'e2e: caso para el admin, 1')
    expect(d1.outcome === 'retry_allowed', `rechazo 1: ${JSON.stringify(d1).slice(0, 200)}`)
    await submitProof(ctx, c.id, who, 2)
    const d2 = await rejectProof(ctx, c.id, 'e2e: caso para el admin, 2')
    expect(d2.outcome === 'cancelled_final', `rechazo 2: ${JSON.stringify(d2).slice(0, 200)}`)
    await assertViews(ctx, c.id, 'cancelled', { driverMustSee: false, who })
    return c
  })
  await step('cliente3: aún sin apelación → GET appeal da 404 not_found', async () => {
    const r = await call(ctx, who, 'GET', `/customer/orders/${o.id}/appeal`)
    expectProblem(r, 404, 'not_found', 'apelación inexistente')
  })
  const reportId = await step('cliente3: POST appeal → ok, alreadyExisted false; repetir devuelve el mismo caso', async () => {
    const r = await call(ctx, who, 'POST', `/customer/orders/${o.id}/appeal`, {
      description: 'e2e: el pago sí se hizo',
    })
    expect(r.status === 200, `appeal: ${describeHttp(r)}`)
    const d = unwrap(r.body)
    expect(
      d.ok === true && d.alreadyExisted === false && typeof d.reportId === 'string',
      `appeal: ${r.text.slice(0, 200)}`,
    )
    const again = unwrap((await call(ctx, who, 'POST', `/customer/orders/${o.id}/appeal`, {})).body)
    expect(
      again.alreadyExisted === true && again.reportId === d.reportId,
      `la segunda apelación no devolvió el mismo caso: ${JSON.stringify(again)}`,
    )
    return String(d.reportId)
  })
  await step('cliente3: GET appeal → pending, sin devolución', async () => {
    const d = unwrap((await call(ctx, who, 'GET', `/customer/orders/${o.id}/appeal`)).body)
    expect(
      d.id === reportId && d.orderId === o.id && d.appealStatus === 'pending' && d.refundStatus === null,
      `apelación del cliente: ${JSON.stringify(d).slice(0, 300)}`,
    )
  })
  await step('un cliente no puede revisar: POST review → 403 forbidden', async () => {
    const r = await call(ctx, who, 'POST', `/admin/appeals/${reportId}/review`)
    expectProblem(r, 403, 'forbidden', 'review hecho por un cliente')
  })
  await step('admin: la bandeja lista el caso (pending, pedido y comprobante rechazado dos veces)', async () => {
    const mine = await findAppeal(ctx, 'pending', reportId)
    expect(mine, `el caso ${reportId} no está en la bandeja de pendientes`)
    expect(
      mine.orderId === o.id &&
        mine.orderShortId === o.shortId &&
        mine.appealStatus === 'pending' &&
        mine.rejectionReasonCode === 'invalid_proof' &&
        mine.proofAttempt === 2,
      `caso en la bandeja: ${JSON.stringify(mine).slice(0, 400)}`,
    )
  })
  await step('admin: review → in_review; repetirlo es idempotente; el cliente lo ve en revisión', async () => {
    const r = await call(ctx, 'admin', 'POST', `/admin/appeals/${reportId}/review`)
    expect(r.status === 200, `review: ${describeHttp(r)}`)
    expect(unwrap(r.body).appealStatus === 'in_review', `review: ${r.text.slice(0, 200)}`)
    const again = unwrap((await call(ctx, 'admin', 'POST', `/admin/appeals/${reportId}/review`)).body)
    expect(
      again.alreadyInReviewOrResolved === true && again.status === 'in_review',
      `segundo review: ${JSON.stringify(again)}`,
    )
    const d = unwrap((await call(ctx, who, 'GET', `/customer/orders/${o.id}/appeal`)).body)
    expect(d.appealStatus === 'in_review' && d.refundStatus === null, `el cliente ve: ${JSON.stringify(d).slice(0, 200)}`)
    expect(await findAppeal(ctx, 'in_review', reportId), 'el caso no aparece en la bandeja «en revisión»')
  })
  console.log('        resolve/refund NO se ejecutan: mueven dinero (business_charges); queda sin resolver a propósito')
  return o.id
}

/** Escenarios que corrieron pero no probaron todo lo que dicen: se registran como PARCIAL y no ponen `failed`. */
const parciales = new Map<string, string>()

async function scenarioStore(ctx: Ctx): Promise<void> {
  console.log('\nEscenario · Tindivo Store público (sin sesión)')
  const first: { slug: string | null; title: string | null } = { slug: null, title: null }
  await step('GET /public/store sin Bearer → 200 con productos, vendidos, categorías y ajustes', async () => {
    const r = await http(ctx, 'GET', `${ctx.api}/public/store`)
    expect(r.status === 200, `store: ${describeHttp(r)}`)
    const d = unwrap(r.body)
    expect(
      Array.isArray(d.products) &&
        Array.isArray(d.sold) &&
        Array.isArray(d.categories) &&
        typeof d.totalAvailable === 'number' &&
        typeof d.settings === 'object' &&
        d.settings !== null,
      `forma de la lista: ${r.text.slice(0, 300)}`,
    )
    if ((d.totalAvailable as number) > 0) {
      const p = (d.products as Json[]).find((x) => typeof x.slug === 'string' && typeof x.title === 'string')
      expect(p, 'totalAvailable > 0 pero la lista no trae ningún artículo con slug y título')
      first.slug = String(p.slug)
      first.title = String(p.title)
    }
  })
  const { slug, title } = first
  if (slug && title) {
    const fragment = title.split(/[ ]+/).find((w) => w.length >= 3) ?? title
    await step('buscar con un fragmento del nombre del primer artículo lo trae (el filtro q se aplica)', async () => {
      const r = await http(ctx, 'GET', `${ctx.api}/public/store?q=${encodeURIComponent(fragment)}`)
      expect(r.status === 200, `store con q: ${describeHttp(r)}`)
      const products = (unwrap(r.body).products ?? []) as Json[]
      expect(
        products.some((x) => x.slug === slug),
        `la búsqueda "${fragment}" no trae el artículo ${slug}`,
      )
    })
    await step('GET /public/store/{slug} de ese artículo → 200 con el mismo slug', async () => {
      const r = await http(ctx, 'GET', `${ctx.api}/public/store/${encodeURIComponent(slug)}`)
      expect(r.status === 200, `detalle: ${describeHttp(r)}`)
      const d = unwrap(r.body)
      const p = d.product as Json | undefined
      expect(p?.slug === slug, `el detalle es de otro artículo: ${r.text.slice(0, 200)}`)
      expect(
        ['available', 'reserved', 'sold'].includes(String(p?.status)),
        `estado público inesperado: ${String(p?.status)}`,
      )
      expect(Array.isArray(d.related), 'el detalle no trae related')
    })
    await step('una búsqueda que no coincide con nada devuelve products vacío', async () => {
      const r = await http(ctx, 'GET', `${ctx.api}/public/store?q=zzz-sin-coincidencia-${Date.now()}`)
      expect(r.status === 200, `store con q: ${describeHttp(r)}`)
      const products = unwrap(r.body).products
      expect(
        Array.isArray(products) && products.length === 0,
        `la búsqueda sin coincidencias devolvió productos: ${r.text.slice(0, 200)}`,
      )
    })
  } else {
    // El mundo e2e no trae artículos de Store y un artículo publicado exige fotos subidas a Storage: no se crean aquí.
    parciales.set('store', 'sin artículos en el mundo e2e: no se probó el detalle ni el filtro')
    console.log('        sin artículos publicados en la base: el detalle y el filtro q NO se probaron (PARCIAL)')
  }
  await step('un slug inexistente → 404 not_found', async () => {
    const r = await http(ctx, 'GET', `${ctx.api}/public/store/no-existe-${Date.now()}`)
    expectProblem(r, 404, 'not_found', 'slug de Store inexistente')
  })
}

async function scenarioInvitado(ctx: Ctx): Promise<void> {
  console.log('\nEscenario · invitado: el catálogo es público, pedir exige sesión')
  const noToken = (status: number, r: { headers: Headers }, what: string): void =>
    expect(
      (r.headers.get('content-type') ?? '').includes('application/problem+json'),
      `${what}: el error de ${status} no es application/problem+json`,
    )
  await step('GET /public/businesses sin Bearer → 200 y trae el negocio e2e', async () => {
    const r = await http(ctx, 'GET', `${ctx.api}/public/businesses`)
    expect(r.status === 200, `businesses: ${describeHttp(r)}`)
    const list = r.body.data
    expect(
      Array.isArray(list) && (list as Json[]).some((b) => b.id === BUSINESS_ID),
      `la lista pública no trae el negocio e2e: ${r.text.slice(0, 200)}`,
    )
  })
  await step('GET /public/businesses/{id} sin Bearer → 200 con la carta; uno inexistente → 404', async () => {
    const r = await http(ctx, 'GET', `${ctx.api}/public/businesses/${BUSINESS_ID}`)
    expect(r.status === 200, `detalle: ${describeHttp(r)}`)
    const d = unwrap(r.body)
    expect((d.business as Json | undefined)?.id === BUSINESS_ID, 'el detalle es de otro negocio')
    expect(Array.isArray(d.categories) && d.categories.length > 0, 'el detalle no trae la carta')
    const none = await http(ctx, 'GET', `${ctx.api}/public/businesses/${randomUUID()}`)
    expectProblem(none, 404, 'not_found', 'negocio público inexistente')
  })
  await step('GET /public/config, /public/schedule y /public/landmarks sin Bearer → 200', async () => {
    const cfg = await http(ctx, 'GET', `${ctx.api}/public/config`)
    expect(cfg.status === 200 && typeof unwrap(cfg.body) === 'object', `config: ${describeHttp(cfg)}`)
    const sch = await http(ctx, 'GET', `${ctx.api}/public/schedule`)
    expect(sch.status === 200, `schedule: ${describeHttp(sch)}`)
    expect(typeof unwrap(sch.body).isOpen === 'boolean', `schedule sin isOpen: ${sch.text.slice(0, 200)}`)
    const lm = await http(ctx, 'GET', `${ctx.api}/public/landmarks`)
    expect(lm.status === 200 && Array.isArray(unwrap(lm.body).items), `landmarks: ${describeHttp(lm)}`)
  })
  await step('POST /customer/checkout/quote sin Bearer → 401 unauthorized', async () => {
    const r = await http(ctx, 'POST', `${ctx.api}/customer/checkout/quote`, {
      body: { businessId: BUSINESS_ID, items: [{ menuItemId: ITEM_MEDIO_ID, quantity: 1 }] },
    })
    expectProblem(r, 401, 'unauthorized', 'cotizar sin sesión')
    expect(r.body.status === 401, `el cuerpo no repite el status: ${r.text.slice(0, 200)}`)
    noToken(401, r, 'quote')
  })
  await step('POST /customer/orders sin Bearer → 401 unauthorized', async () => {
    const r = await http(ctx, 'POST', `${ctx.api}/customer/orders`, {
      body: orderBody('pending_cash', 50),
      headers: { 'idempotency-key': randomUUID() },
    })
    expectProblem(r, 401, 'unauthorized', 'pedir sin sesión')
    expect(r.body.status === 401, `el cuerpo no repite el status: ${r.text.slice(0, 200)}`)
    noToken(401, r, 'orders')
  })
  await step('un Bearer que no es un JWT válido → 401 unauthorized', async () => {
    const r = await http(ctx, 'POST', `${ctx.api}/customer/checkout/quote`, {
      body: { businessId: BUSINESS_ID, items: [{ menuItemId: ITEM_MEDIO_ID, quantity: 1 }] },
      headers: { authorization: 'Bearer esto-no-es-un-jwt' },
    })
    expectProblem(r, 401, 'unauthorized', 'cotizar con un token inválido')
  })
}

async function checkEvents(ctx: Ctx, serviceKey: string, id: string, label: string): Promise<void> {
  await step(`domain_events (${label}): ciclo de vida registrado`, async () => {
    const r = await http(
      ctx,
      'GET',
      `${ctx.supabase}/rest/v1/domain_events?aggregate_id=eq.${id}&select=event_type,payload,occurred_at&order=occurred_at`,
      { headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } },
    )
    expect(r.status === 200, `leer domain_events: ${describeHttp(r)}`)
    const events = JSON.parse(r.text) as { event_type: string; payload: unknown }[]
    console.log(`        eventos: ${events.map((e) => e.event_type).join(', ')}`)
    expect(events.length > 0, 'sin ningún domain_event para el pedido')
    expect(
      events.some((e) => JSON.stringify(e.payload).includes('delivered')),
      'ningún domain_event registra el paso a delivered',
    )
  })
}

// ── Principal ─────────────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const apiEnv = readEnvFile(join(REPO, 'apps', 'api', '.env.local'))
  const supabase = (
    opt('--supabase-url') ??
    process.env.TINDIVO_E2E_SUPABASE_URL ??
    'http://127.0.0.1:54321'
  ).replace(/\/$/, '')
  const api = (
    opt('--api-url') ??
    process.env.TINDIVO_E2E_API_URL ??
    'http://localhost:3001/api/v1'
  ).replace(/\/$/, '')
  const staging = flag('--staging')

  // Guardias de destino
  let host: string
  try {
    host = new URL(supabase).hostname
  } catch {
    return die(`URL de Supabase inválida: ${supabase}`)
  }
  if ([supabase, api].some((u) => u.includes(PROD_REF))) {
    return die(
      `el destino es PRODUCCIÓN (${PROD_REF}). Este script nunca corre contra tindivo-prod.`,
    )
  }
  const isLocal = host === '127.0.0.1' || host === 'localhost'
  // Todo escenario local escribe en la base compartida: solo bajo `pnpm db:lock run` / `db:cycle`.
  if (isLocal) exigirCandado()
  // La API también se restringe: localhost, o el staging conocido y solo con --staging. Nunca una URL libre.
  let apiHost: string
  try {
    apiHost = new URL(api).hostname
  } catch {
    return die(`URL de la API inválida: ${api}`)
  }
  const apiLocal = apiHost === '127.0.0.1' || apiHost === 'localhost'
  if (!apiLocal && !(staging && apiHost === STAGING_API_HOST)) {
    return die(`la API ${apiHost} no está permitida: localhost, o ${STAGING_API_HOST} con --staging.`)
  }
  if (isLocal !== apiLocal) {
    return die('Supabase y la API deben ser los dos locales o los dos de staging.')
  }
  if (!isLocal) {
    if (!staging) return die(`${host} no es local; el staging exige --staging.`)
    if (host !== `${STAGING_REF}.supabase.co`) {
      return die(`con --staging solo se acepta ${STAGING_REF}.supabase.co (recibido: ${host}).`)
    }
  } else if (staging) {
    return die('--staging con una URL local: quita --staging o apunta a tindivo-dev.')
  }
  if (flag('--check-events') && !isLocal)
    return die('--check-events solo se permite contra la base LOCAL.')

  const anonKey =
    opt('--anon-key') ??
    process.env.TINDIVO_E2E_ANON_KEY ??
    (isLocal ? apiEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY : undefined)
  if (!anonKey) return die('falta la clave anon (--anon-key o TINDIVO_E2E_ANON_KEY).')
  secrets.push(anonKey)

  const credPath = opt('--credentials')
  let passwords = new Map<string, string>()
  if (credPath) {
    if (!existsSync(credPath)) return die(`no existe el archivo de credenciales: ${credPath}`)
    passwords = parseAccountsFile(credPath)
  } else if (!isLocal) {
    return die('staging exige --credentials <cuentas.md>.')
  }
  const customerEmail = opt('--customer-email') ?? ACCOUNTS.customer
  const emails = { ...ACCOUNTS, customer: customerEmail }
  const pass = (email: string): string => {
    const p = passwords.get(email) ?? (isLocal ? E2E_PASSWORD : undefined)
    if (!p) throw new Error(`sin contraseña para ${email} en el archivo de credenciales`)
    secrets.push(p)
    return p
  }

  const prep = Number(opt('--prep-minutes') ?? 2)
  const scenario = opt('--scenario') ?? 'all'
  if (scenario !== 'all' && !SCENARIO_NAMES.includes(scenario))
    return die(`--scenario: ${SCENARIO_NAMES.join(' | ')} | all`)

  const ctx: Ctx = { api, supabase, anonKey, isLocal, tokens: {}, pass }
  console.log('Flujo completo de un pedido · API REST')
  console.log(`  destino   ${isLocal ? 'LOCAL' : 'STAGING (tindivo-dev)'}`)
  console.log(`  supabase  ${supabase}`)
  console.log(`  api       ${api}`)
  console.log(`  cuentas   ${Object.values(emails).join(', ')}`)

  const t0 = Date.now()
  const orders: { label: string; id: string }[] = []
  let failed = false
  try {
    console.log('\nSesiones')
    for (const actor of ['customer', 'business', 'driver'] as const) {
      await step(`login ${actor} (${emails[actor]})`, async () => {
        ctx.tokens[actor] = await login(ctx, emails[actor], pass(emails[actor]))
      })
    }
    await step('API viva: GET /health', async () => {
      const r = await http(ctx, 'GET', `${api}/health`)
      expect(r.status === 200, `health: ${describeHttp(r)}`)
    })
    // Next en desarrollo compila cada ruta en su primera visita y, mientras tanto, responde una 404 HTML
    // (Docs/operacion/trampas.md, «Los rojos intermitentes de e2e son Next compilando»). Se calienta la ruta de
    // subida con un pedido que no existe: hasta que conteste el 404 JSON de la API, no es un resultado.
    await step('API caliente: la ruta de subida del comprobante responde JSON', async () => {
      for (let i = 0; i < 10; i++) {
        const r = await http(
          ctx,
          'POST',
          `${api}/customer/orders/${randomUUID()}/prepay-proof/upload-url`,
          { actor: 'customer', body: { contentType: 'image/png' } },
        )
        if (r.status === 404 && r.body.code === 'not_found') return
        await new Promise((res) => setTimeout(res, 1500))
      }
      throw new Error('la ruta de subida no respondió con el 404 JSON de la API tras 10 intentos')
    })
    const serviceKey = process.env.TINDIVO_E2E_SERVICE_KEY ?? apiEnv.SUPABASE_SERVICE_ROLE_KEY
    if (isLocal) {
      if (!serviceKey) throw new Error('falta SUPABASE_SERVICE_ROLE_KEY en apps/api/.env.local')
      secrets.push(serviceKey)
    }
    for (const [actor, email] of [
      ['customer2', 'cliente2@e2e.local'],
      ['customer3', 'cliente3@e2e.local'],
    ] as const) {
      await step(`login ${actor} (${email})`, async () => {
        ctx.tokens[actor] = await login(ctx, email, pass(email))
      })
    }
    let deliveredId = ''
    const want = (n: string): boolean => scenario === 'all' || scenario === n
    const scenarios: Scenario[] = [
      {
        name: 'contraentrega',
        run: async () => {
          deliveredId = await scenarioContraentrega(ctx, prep)
          orders.push({ label: 'contraentrega', id: deliveredId })
        },
      },
      {
        name: 'prepago',
        run: async () => {
          orders.push({ label: 'prepago', id: await scenarioPrepago(ctx, prep) })
        },
      },
      { name: 'rechazo', run: async () => void (await scenarioRechazo(ctx)) },
      { name: 'cancela-cliente', run: async () => void (await scenarioCancelaCliente(ctx)) },
      {
        name: 'no-show',
        localOnly: true,
        run: async () => void (await scenarioNoShow(ctx, serviceKey ?? '')),
      },
      { name: 'recojo', run: async () => void (await scenarioRecojo(ctx)) },
      { name: 'prepago-heic', run: async () => void (await scenarioPrepagoHeic(ctx)) },
      {
        name: 'mis-pedidos',
        run: async () => {
          if (!deliveredId) deliveredId = await scenarioContraentrega(ctx, prep)
          await scenarioMisPedidos(ctx, deliveredId)
        },
      },
      {
        name: 'prepago-vencido',
        localOnly: true,
        run: async () => void (await scenarioPrepagoVencido(ctx, serviceKey ?? '')),
      },
      {
        name: 'celular-sms',
        localOnly: true,
        run: async () => void (await scenarioCelularSms(ctx, serviceKey ?? '')),
      },
      {
        name: 'entregas',
        localOnly: true,
        run: async () => void (await scenarioEntregas(ctx, serviceKey ?? '')),
      },
      {
        name: 'borrar-cuenta',
        localOnly: true,
        run: async () => void (await scenarioBorrarCuenta(ctx, serviceKey ?? '')),
      },
      { name: 'compat-v1', run: async () => void (await scenarioCompatV1(ctx)) },
      {
        name: 'comprobante-rechazado',
        run: async () => void (await scenarioComprobanteRechazado(ctx)),
      },
      { name: 'negocio-cancela', run: async () => void (await scenarioNegocioCancela(ctx)) },
      {
        // Local: la cuenta motorizado2 no está garantizada en el `cuentas.md` de staging.
        name: 'traspaso',
        localOnly: true,
        run: async () => {
          orders.push({ label: 'traspaso', id: await scenarioTraspaso(ctx) })
        },
      },
      {
        // Local: crea una cuenta y un negocio que la API no borra.
        name: 'admin-negocio',
        localOnly: true,
        run: async () => void (await scenarioAdminNegocio(ctx)),
      },
      {
        // Local: la cuenta admin no está garantizada en el `cuentas.md` de staging.
        name: 'admin-caso',
        localOnly: true,
        run: async () => void (await scenarioAdminCaso(ctx)),
      },
      { name: 'store', run: async () => void (await scenarioStore(ctx)) },
      { name: 'invitado', run: async () => void (await scenarioInvitado(ctx)) },
    ]
    for (const sc of scenarios) {
      if (!want(sc.name)) continue
      if (sc.localOnly && !isLocal) {
        console.log(`\nEscenario ${sc.name}: SALTADO (solo corre contra la base local)`)
        outcomes.push({ name: sc.name, outcome: 'saltado' })
        continue
      }
      for (const who of ['customer', 'customer2', 'customer3'] as const) await releaseActive(ctx, who)
      const known = KNOWN_DEFECTS[sc.name]
      const knownText = known ? `${known.why} (fila ${known.row}, paso «${known.step}»)` : ''
      const before = results.length
      try {
        await sc.run()
        if (known) {
          outcomes.push({ name: sc.name, outcome: 'defecto-corregido' })
          failed = true
          console.log(`  FALLA  ${sc.name} pasó pero estaba marcado como defecto conocido (${knownText}): quita la marca`)
        } else if (parciales.has(sc.name)) {
          outcomes.push({ name: sc.name, outcome: 'parcial', note: parciales.get(sc.name) })
        } else outcomes.push({ name: sc.name, outcome: 'ok' })
      } catch (err) {
        if (!(err instanceof StepFailure)) {
          console.error(`\nError inesperado: ${redact(err instanceof Error ? err.message : String(err))}`)
        }
        const failedStep = results.slice(before).find((r) => !r.ok)
        if (known && failedStep?.name === known.step) {
          outcomes.push({ name: sc.name, outcome: 'rojo-esperado', note: knownText })
          failedStep.expected = true
        } else {
          outcomes.push({ name: sc.name, outcome: 'falla' })
          failed = true
        }
      }
    }
    if (flag('--check-events')) {
      if (!serviceKey)
        throw new Error('--check-events: falta SUPABASE_SERVICE_ROLE_KEY en apps/api/.env.local')
      for (const o of orders) await checkEvents(ctx, serviceKey, o.id, o.label)
    }
  } catch (err) {
    failed = true
    if (!(err instanceof StepFailure)) {
      console.error(
        `\nError inesperado: ${redact(err instanceof Error ? err.message : String(err))}`,
      )
    }
  }

  const okCount = results.filter((r) => r.ok).length
  const expectedRed = results.filter((r) => !r.ok && r.expected).length
  console.log('\nEscenarios')
  for (const o of outcomes) console.log(`  ${o.outcome.toUpperCase().padEnd(18)} ${o.name}${o.note ? ` — ${o.note}` : ''}`)
  const count = (k: Outcome): number => outcomes.filter((o) => o.outcome === k).length
  console.log(
    `\n${failed ? 'FAIL' : 'PASS'} · ${okCount}/${results.length} pasos (${expectedRed} rojos esperados) · escenarios: ${count('ok')} ok, ${count('falla')} fallan, ${count('rojo-esperado')} rojos esperados, ${count('parcial')} parciales, ${count('saltado')} saltados · ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  )
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(redact(err instanceof Error ? err.message : String(err)))
  process.exit(1)
})
