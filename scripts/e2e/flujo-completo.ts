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
const CUSTOMER_NAME = 'Cliente E2E'
const CUSTOMER_PHONE = '900000003'
const DELIVERY = {
  address: 'Jr. Los Pinos 123',
  reference: 'Portón azul, frente al parque',
  lat: -9.151,
  lng: -78.28,
}
const PROD_REF = 'zpnipajgwfthxhdtzhly'
const STAGING_REF = 'jgziumvrtogguljhpdos'
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
type Actor = 'customer' | 'business' | 'driver'

class StepFailure extends Error {}

interface Ctx {
  api: string
  supabase: string
  anonKey: string
  isLocal: boolean
  tokens: Partial<Record<Actor, string>>
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
  opts: { actor?: Actor; body?: unknown; headers?: Record<string, string>; raw?: Uint8Array } = {},
): Promise<{ status: number; body: Json; text: string }> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) }
  const token = opts.actor ? ctx.tokens[opts.actor] : undefined
  if (token) headers.authorization = `Bearer ${token}`
  let payload: BodyInit | undefined
  if (opts.raw) payload = opts.raw as unknown as BodyInit
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json'
    payload = JSON.stringify(opts.body)
  }
  const res = await fetch(url, { method, headers, body: payload })
  const text = await res.text()
  let body: Json = {}
  try {
    body = text ? (JSON.parse(text) as Json) : {}
  } catch {
    body = { _raw: text.slice(0, 300) }
  }
  return { status: res.status, body, text: redact(text) }
}

/** Respuestas `{data: …}` o planas. */
function unwrap(body: Json): Json {
  const d = body.data
  return d && typeof d === 'object' && !Array.isArray(d) ? (d as Json) : body
}

// ── Registro de pasos ─────────────────────────────────────────────────────────────────────────────
const results: { name: string; ok: boolean; ms: number; detail?: string }[] = []
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

async function customerView(ctx: Ctx, id: string): Promise<View> {
  const r = await http(ctx, 'GET', `${ctx.api}/customer/orders/${id}`, { actor: 'customer' })
  expect(r.status === 200, `GET /customer/orders/{id}: ${describeHttp(r)}`)
  const o = unwrap(r.body)
  return { status: String(o.status), shortId: String(o.shortId) }
}

/** La API no ofrece GET por id para el negocio: la app lee `orders` con su JWT, bajo RLS. */
async function businessView(ctx: Ctx, id: string): Promise<View & { row: Json }> {
  const r = await http(
    ctx,
    'GET',
    `${ctx.supabase}/rest/v1/orders?id=eq.${id}&select=id,short_id,status,payment_intent,payment_real,order_amount,delivery_fee,cash_owed_at_delivery,client_pays_with,change_to_give,driver_id`,
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
  opts: { driverMustSee: boolean },
): Promise<Json> {
  const [c, b, d] = [
    await customerView(ctx, id),
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

async function createOrder(
  ctx: Ctx,
  paymentIntent: 'pending_cash' | 'prepaid',
  cashPayingWith?: number,
): Promise<Created> {
  const body: Json = {
    businessId: BUSINESS_ID,
    deliveryMethod: 'delivery',
    paymentIntent,
    customerName: CUSTOMER_NAME,
    customerPhone: CUSTOMER_PHONE,
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
  const r = await http(ctx, 'POST', `${ctx.api}/customer/orders`, {
    actor: 'customer',
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
  const total = SUBTOTAL + Number((await businessView(ctx, id)).row.delivery_fee)
  const row = await readyAndDeliver(ctx, id, {
    paymentReal: 'paid_cash',
    clientPaysWith: PAYS_WITH,
    cashAmount: total,
  })
  await step('dinero: efectivo cobrado y a rendir cuadran', async () => {
    expect(row.payment_real === 'paid_cash', `payment_real "${String(row.payment_real)}"`)
    const owed = Number(row.cash_owed_at_delivery)
    const change = Number(row.change_to_give ?? 0)
    // Regla 0146: rendir = adelanto de vuelto + parte en efectivo del pedido.
    expect(
      Math.abs(owed - (total + change)) < 0.005,
      `cash_owed_at_delivery ${owed}, esperado ${(total + change).toFixed(2)} (total ${total} + vuelto ${change})`,
    )
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
    const put = await fetch(String(u.uploadUrl), {
      method: 'PUT',
      headers: { 'content-type': 'image/png' },
      body: PNG_1X1 as unknown as BodyInit,
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
  if (!['contraentrega', 'prepago', 'all'].includes(scenario))
    return die('--scenario: contraentrega | prepago | all')

  const ctx: Ctx = { api, supabase, anonKey, isLocal, tokens: {} }
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
    if (scenario === 'contraentrega' || scenario === 'all') {
      orders.push({ label: 'contraentrega', id: await scenarioContraentrega(ctx, prep) })
    }
    if (scenario === 'prepago' || scenario === 'all') {
      orders.push({ label: 'prepago', id: await scenarioPrepago(ctx, prep) })
    }
    if (flag('--check-events')) {
      const serviceKey = process.env.TINDIVO_E2E_SERVICE_KEY ?? apiEnv.SUPABASE_SERVICE_ROLE_KEY
      if (!serviceKey)
        throw new Error('--check-events: falta SUPABASE_SERVICE_ROLE_KEY en apps/api/.env.local')
      secrets.push(serviceKey)
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
  console.log(
    `\n${failed ? 'FAIL' : 'PASS'} · ${okCount}/${results.length} pasos · ${((Date.now() - t0) / 1000).toFixed(1)} s`,
  )
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(redact(err instanceof Error ? err.message : String(err)))
  process.exit(1)
})
