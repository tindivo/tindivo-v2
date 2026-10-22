/**
 * send-push por HTTP, contra la Edge Function REAL servida en local (CAX-002).
 *
 * Los demás tests de send-push prueban el SQL (`claim_push_event`, `push-claim.integration.test.ts`) y el
 * clasificador (`send-push-request-kind.test.ts`) por separado. Este ejecuta el candidato entero: gateway
 * de Supabase -> runtime de Edge Functions -> `supabase/functions/send-push/index.ts` -> base.
 *
 * CÓMO CORRERLO EN LOCAL (no corre en CI: el job `api-integration` arranca el stack con
 * `-x ...edge-runtime...`, así que aquí NO hay funciones que servir; el test se salta con un aviso
 * visible y NO pasa en falso):
 *
 *   1. Un archivo de entorno FUERA del repo, con valores sintéticos. Las llaves VAPID deben ser válidas
 *      (si no, la función responde 500 `config`); el secreto de OpsAlert, el que sea:
 *        VAPID_PUBLIC_KEY=<65 bytes P-256 en base64url>
 *        VAPID_PRIVATE_KEY=<32 bytes en base64url>
 *        VAPID_SUBJECT=mailto:test@example.com
 *        OPS_ALERT_SECRET=secreto-sintetico-local
 *   2. Desde la raíz del worktree que quieres probar (el runtime monta SU supabase/functions):
 *        supabase functions serve send-push --env-file <ruta-fuera-del-repo>/send-push.env
 *      y comprueba el montaje con
 *        docker inspect supabase_edge_runtime_zpnipajgwfthxhdtzhly --format '{{json .Mounts}}'
 *   3. Con el candado (la base es compartida):
 *        TINDIVO_EDGE_HTTP=1 TINDIVO_EDGE_OPS_ALERT_SECRET=secreto-sintetico-local \
 *          pnpm db:lock run pnpm --filter @tindivo/api exec vitest run lib/__tests__/send-push-http.integration.test.ts
 *
 * LA CARRERA DEL TRIGGER. Si el test insertara un evento de un tipo que `dispatch_event` despacha, el propio
 * trigger (pg_net) llamaría a la función y lo reclamaría antes que el test. Se evita quitando la fila
 * `push_dispatch` de `app_settings` mientras corre el archivo (sin URL el trigger no hace nada) y devolviéndola
 * intacta (valor y `updated_at`) al terminar, también si algo falla. Lo mismo con `push_claim_since` y con la
 * fila de `ops_alert_throttle`.
 */
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanup, localClient, type SeededOrder, seedPrepaidOrder } from './helpers/local-db'
import {
  prepareIsolation,
  type Row,
  type RowStore,
  SettingsSnapshot,
} from './helpers/settings-snapshot'

const ENABLED = process.env.TINDIVO_EDGE_HTTP === '1'
const OPS_SECRET = process.env.TINDIVO_EDGE_OPS_ALERT_SECRET ?? ''

if (!ENABLED) {
  console.warn(
    '[send-push-http] SALTADO: falta TINDIVO_EDGE_HTTP=1. Este test necesita la Edge Function servida ' +
      '(`supabase functions serve send-push --env-file …`); la CI no la tiene. Ver la cabecera del archivo.',
  )
}

const BASE = 'http://127.0.0.1:54321'
const FN_URL = `${BASE}/functions/v1/send-push`
// Clave anónima del stack local de Supabase CLI: pública, está en su documentación.
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

type Reply = { status: number; json: Record<string, unknown> }

async function post(
  body: unknown,
  extraHeaders: Record<string, string> = {},
  bearer: string = ANON_KEY,
): Promise<Reply> {
  const res = await fetch(FN_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${bearer}`,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }
  return { status: res.status, json }
}

const iso = (msFromNow: number): string => new Date(Date.now() + msFromNow).toISOString()
const MIN = 60_000

async function insertEvent(opts: {
  eventType: string
  aggregateId: string
  occurredAt?: string
  payload?: Record<string, unknown>
}): Promise<string> {
  const id = crypto.randomUUID()
  const { error } = await localClient.from('domain_events').insert({
    id,
    aggregate_type: 'order',
    aggregate_id: opts.aggregateId,
    event_type: opts.eventType,
    payload: (opts.payload ?? {}) as never,
    ...(opts.occurredAt ? { occurred_at: opts.occurredAt } : {}),
  })
  if (error) throw new Error(`insert domain_events: ${error.message}`)
  return id
}

async function claimedAt(eventId: string): Promise<string | null> {
  const { data, error } = await localClient
    .from('domain_events')
    .select('push_claimed_at')
    .eq('id', eventId)
    .single()
  if (error) throw new Error(error.message)
  return (data as { push_claimed_at: string | null }).push_claimed_at
}

async function eventTimes(eventId: string): Promise<{
  push_claimed_at: string | null
  push_done_at: string | null
  push_dead_at: string | null
}> {
  const { data, error } = await localClient
    .from('domain_events')
    .select('push_claimed_at,push_done_at,push_dead_at')
    .eq('id', eventId)
    .single()
  if (error) throw new Error(error.message)
  return data as {
    push_claimed_at: string | null
    push_done_at: string | null
    push_dead_at: string | null
  }
}

async function setCut(value: string): Promise<void> {
  const { error } = await localClient
    .from('app_settings')
    .upsert({ key: 'push_claim_since', value }, { onConflict: 'key' })
  if (error) throw new Error(`push_claim_since: ${error.message}`)
}

async function deliveryLogCount(subscriptionId: string): Promise<number> {
  const { count, error } = await localClient
    .from('push_delivery_log')
    .select('id', { count: 'exact', head: true })
    .eq('subscription_id', subscriptionId)
  if (error) throw new Error(error.message)
  return count ?? 0
}

// ── Respaldo de las filas de la base compartida (CAX-003) ──────────────────────
// Tres ids, tres estados (ver helpers/settings-snapshot.ts): no se toca nada hasta haber leído y respaldado.
const THROTTLE_KIND = 'otp_phone_limit_misconfigured'
const ID_DISPATCH = 'app_settings:push_dispatch'
const ID_CUT = 'app_settings:push_claim_since'
const ID_THROTTLE = `ops_alert_throttle:${THROTTLE_KIND}`
// 0272: el freno de `PushDeliveryFailed` vive en la base (`retry_push_dispatch`), ya no en `send-push`: esta fila
// NO debe aparecer por el paso de un aviso de fallo (se respalda para comprobarlo y para dejarla como estaba).
const ID_UNDELIVERED = 'ops_alert_throttle:push_undelivered'

// Contra la base local, como postgres (para quitar y devolver permisos). Los acentos viajan por stdin.
const DB_CONTAINER = 'supabase_db_zpnipajgwfthxhdtzhly'
function psql(sql: string): string {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      DB_CONTAINER,
      'psql',
      '-U',
      'postgres',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      '-',
    ],
    { input: sql, encoding: 'utf8' },
  ).trim()
}
/** Privilegios que `service_role` tiene sobre una tabla / una función, para comprobar que se devolvieron. */
const tablePrivs = (table: string) =>
  psql(
    `select coalesce(string_agg(privilege_type, ',' order by privilege_type), '') from information_schema.role_table_grants where grantee = 'service_role' and table_schema = 'public' and table_name = '${table}';`,
  )
const canExecute = (fn: string) =>
  psql(`select has_function_privilege('service_role', '${fn}', 'execute');`)

function target(id: string): {
  table: 'app_settings' | 'ops_alert_throttle'
  col: string
  val: string
} {
  const [table, ...rest] = id.split(':')
  const val = rest.join(':')
  if (table === 'app_settings') return { table, col: 'key', val }
  if (table === 'ops_alert_throttle') return { table, col: 'kind', val }
  throw new Error(`id de respaldo desconocido: ${id}`)
}

const settingsStore: RowStore = {
  async read(id) {
    const t = target(id)
    const { data, error } = await localClient
      .from(t.table)
      .select('*')
      .eq(t.col, t.val)
      .maybeSingle()
    if (error) return { data: null, error: error.message }
    return { data: (data as Row | null) ?? null, error: null }
  },
  async remove(id) {
    const t = target(id)
    const { error } = await localClient.from(t.table).delete().eq(t.col, t.val)
    return { error: error?.message ?? null }
  },
  async write(id, row) {
    const t = target(id)
    const { error } = await localClient.from(t.table).insert(row as never)
    return { error: error?.message ?? null }
  },
}

describe.skipIf(!ENABLED)('send-push · HTTP real contra la Edge Function servida (CAX-002)', () => {
  let seed: SeededOrder
  let subscriptionId = ''
  const eventIds: string[] = []
  const snapshot = new SettingsSnapshot(settingsStore, [
    ID_DISPATCH,
    ID_CUT,
    ID_THROTTLE,
    ID_UNDELIVERED,
  ])

  async function track(id: string): Promise<string> {
    eventIds.push(id)
    return id
  }

  beforeAll(async () => {
    // Orden: 1) precondiciones, sin leer ni tocar nada; 2) respaldo de las filas; 3) quitar push_dispatch.
    // Ver «LA CARRERA DEL TRIGGER» y helpers/settings-snapshot.ts.
    await prepareIsolation({
      preconditions: [
        () => {
          if (!OPS_SECRET) {
            throw new Error(
              'Falta TINDIVO_EDGE_OPS_ALERT_SECRET (el mismo OPS_ALERT_SECRET del --env-file).',
            )
          }
        },
        async () => {
          // La función debe estar servida: un POST vacío no tiene efectos y responde 400.
          const res = await fetch(FN_URL, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: `Bearer ${ANON_KEY}` },
            body: '{}',
          }).catch((e: unknown) => {
            throw new Error(
              `La función send-push no es alcanzable en ${FN_URL}: ${e instanceof Error ? e.message : String(e)}`,
            )
          })
          if (res.status !== 400) {
            throw new Error(`send-push respondió ${res.status} a un cuerpo vacío; se esperaba 400.`)
          }
        },
      ],
      snapshot,
      removeIds: [ID_DISPATCH],
    })

    // Un negocio con un pedido en pending_acceptance y UNA suscripción (endpoint que no existe: el envío
    // falla, pero cada intento queda en push_delivery_log, que es lo observable).
    seed = await seedPrepaidOrder({ status: 'pending_acceptance' })
    const { data: sub, error: subErr } = await localClient
      .from('push_subscriptions')
      .insert({
        user_id: seed.userId,
        endpoint: 'http://127.0.0.1:9/send-push-http-test',
        p256dh:
          'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
        auth: 'tBHItJI5svbpez7KI4CCXg',
      })
      .select('id')
      .single()
    if (subErr) throw new Error(`push_subscriptions: ${subErr.message}`)
    subscriptionId = sub.id
  })

  afterAll(async () => {
    const errors: string[] = []
    try {
      if (eventIds.length) await localClient.from('domain_events').delete().in('id', eventIds)
      if (seed) await cleanup(seed)
    } catch (e) {
      errors.push(`limpieza de fixtures: ${e instanceof Error ? e.message : String(e)}`)
    }
    // Cada fila se restaura por su cuenta; si alguna falla, el error queda visible y lista cuáles.
    try {
      await snapshot.restoreAll()
    } catch (e) {
      errors.push(e instanceof Error ? e.message : String(e))
    }
    if (errors.length > 0) throw new Error(errors.join('\n'))
  })

  // ── Validación del cuerpo ──────────────────────────────────────────────────
  it('400 sin event_id y con event_id que no es UUID', async () => {
    expect((await post({})).status).toBe(400)
    expect((await post({ event_type: 'OrderCreated', aggregate_id: seed.orderId })).status).toBe(
      400,
    )
    const noUuid = await post({ event_id: 'no-soy-un-uuid' })
    expect(noUuid.status).toBe(400)
    expect(noUuid.json.ok).toBe(false)
    expect((await post({ event_id: 12345 })).status).toBe(400)
  })

  // ── Rechazos del reclamo ───────────────────────────────────────────────────
  it('409 con un UUID que no existe', async () => {
    await setCut('2020-01-01T00:00:00Z')
    const r = await post({ event_id: crypto.randomUUID() })
    expect(r.status).toBe(409)
    expect(r.json.ok).toBe(false)
  })

  it('409 con un evento de más de 15 minutos, y queda sin reclamar', async () => {
    await setCut('2020-01-01T00:00:00Z')
    const id = await track(
      await insertEvent({
        eventType: 'OrderCreated',
        aggregateId: seed.orderId,
        occurredAt: iso(-16 * MIN),
      }),
    )
    expect((await post({ event_id: id })).status).toBe(409)
    expect(await claimedAt(id)).toBeNull()
  })

  it('409 con un evento anterior al corte push_claim_since (ya lo envió la función vieja)', async () => {
    const ocurrido = iso(-2 * MIN)
    const id = await track(
      await insertEvent({
        eventType: 'OrderCreated',
        aggregateId: seed.orderId,
        occurredAt: ocurrido,
      }),
    )
    await setCut(iso(-1 * MIN)) // el corte se fijó DESPUÉS del evento
    const r = await post({ event_id: id })
    expect(r.status).toBe(409)
    expect(await claimedAt(id)).toBeNull()
  })

  it('409 con todo evento si no existe la fila de corte (fallo cerrado)', async () => {
    const { error } = await localClient.from('app_settings').delete().eq('key', 'push_claim_since')
    expect(error).toBeNull()
    const id = await track(
      await insertEvent({ eventType: 'OrderCreated', aggregateId: seed.orderId }),
    )
    expect((await post({ event_id: id })).status).toBe(409)
    expect(await claimedAt(id)).toBeNull()
  })

  it('rollback -> retorno (CAX-001): E enviado por la vieja no se reclama ni sin fila ni con el corte nuevo; F sí', async () => {
    const antes = await deliveryLogCount(subscriptionId)
    // Corte T0 fijado y evento E posterior a T0, sin sellar: lo que la función VIEJA envió durante el rollback.
    await setCut(iso(-10 * MIN))
    const e = await track(
      await insertEvent({ eventType: 'OrderCreated', aggregateId: seed.orderId }),
    )
    expect(await claimedAt(e)).toBeNull()

    // Paso 1 del rollback (deploy.md §2.2): invalidar el corte. Vuelve la función nueva ANTES de fijar el corte nuevo.
    const del = await localClient.from('app_settings').delete().eq('key', 'push_claim_since')
    expect(del.error).toBeNull()
    const sinFila = await post({ event_id: e })
    expect(sinFila.status).toBe(409)
    expect(await claimedAt(e)).toBeNull()
    expect(await deliveryLogCount(subscriptionId)).toBe(antes)

    // Se fija el corte nuevo (posterior a E, tomando el instante de E de la base: sin depender de relojes).
    const { data: ev, error } = await localClient
      .from('domain_events')
      .select('occurred_at')
      .eq('id', e)
      .single()
    expect(error).toBeNull()
    const corteNuevo = new Date(
      new Date((ev as { occurred_at: string }).occurred_at).getTime() + 1000,
    )
    await setCut(corteNuevo.toISOString())
    const conCorte = await post({ event_id: e })
    expect(conCorte.status).toBe(409)
    expect(await claimedAt(e)).toBeNull()
    expect(await deliveryLogCount(subscriptionId)).toBe(antes)

    // Un evento F posterior al corte nuevo sí notifica, una sola vez.
    const f = await track(
      await insertEvent({
        eventType: 'OrderCreated',
        aggregateId: seed.orderId,
        occurredAt: new Date(corteNuevo.getTime() + 1000).toISOString(),
      }),
    )
    const rf = await post({ event_id: f })
    expect(rf.status).toBe(200)
    expect(rf.json.ok).toBe(true)
    expect(await claimedAt(f)).not.toBeNull()
    expect(await deliveryLogCount(subscriptionId)).toBe(antes + 1)
    expect((await post({ event_id: f })).status).toBe(409)
    expect(await deliveryLogCount(subscriptionId)).toBe(antes + 1)
    // E sigue sin sellar al final.
    expect(await claimedAt(e)).toBeNull()
  })

  // ── Éxito, un solo uso y concurrencia ──────────────────────────────────────
  it('éxito con un evento fresco posterior al corte: notifica y escribe push_claimed_at; el 2º POST es 409', async () => {
    await setCut(iso(-5 * MIN))
    const id = await track(
      await insertEvent({ eventType: 'OrderCreated', aggregateId: seed.orderId }),
    )
    const antes = await deliveryLogCount(subscriptionId)

    const r1 = await post({ event_id: id })
    expect(r1.status).toBe(200)
    expect(r1.json.ok).toBe(true)
    expect(r1.json.recipients).toBe(1) // el dueño del negocio, resuelto desde la base
    expect(await claimedAt(id)).not.toBeNull()
    expect(await deliveryLogCount(subscriptionId)).toBe(antes + 1) // intentó enviar a su suscripción

    const r2 = await post({ event_id: id })
    expect(r2.status).toBe(409)
    expect(await deliveryLogCount(subscriptionId)).toBe(antes + 1) // y no hubo segundo envío
  })

  // MV7b: el env-file de esta prueba NO trae FCM_SERVICE_ACCOUNT_JSON ni APNS_*: el push nativo queda apagado.
  it('sin configuración nativa, el Web Push no cambia y los dispositivos no se tocan', async () => {
    await setCut(iso(-5 * MIN))
    const token = `mv7b-${crypto.randomUUID()}-${'x'.repeat(16)}`
    const { data: dev, error: devErr } = await localClient
      .from('push_devices')
      .insert({
        user_id: seed.userId,
        install_id: `mv7b-${crypto.randomUUID()}`.slice(0, 40),
        platform: 'android',
        app: 'negocios',
        token,
        app_version: '1.0.0',
        notifications_enabled: true,
      })
      .select('id')
      .single()
    if (devErr) throw new Error(`push_devices: ${devErr.message}`)
    try {
      const id = await track(
        await insertEvent({ eventType: 'OrderCreated', aggregateId: seed.orderId }),
      )
      const antes = await deliveryLogCount(subscriptionId)
      const r = await post({ event_id: id })
      expect(r.status).toBe(200)
      expect(r.json.recipients).toBe(1)
      expect(await deliveryLogCount(subscriptionId)).toBe(antes + 1) // el Web Push intentó, como siempre
      expect(r.json.sent).toBe(0)
      expect(r.json.failed).toBe(1) // solo el Web Push (endpoint inexistente); el dispositivo no suma

      const { data: row } = await localClient
        .from('push_devices')
        .select('failure_count,last_failed_at,last_successful_at,disabled_at')
        .eq('id', dev.id)
        .single()
      expect(row).toEqual({
        failure_count: 0,
        last_failed_at: null,
        last_successful_at: null,
        disabled_at: null,
      })
      const { count } = await localClient
        .from('push_delivery_log')
        .select('id', { count: 'exact', head: true })
        .eq('device_id', dev.id)
      expect(count).toBe(0)
    } finally {
      await localClient.from('push_devices').delete().eq('id', dev.id)
    }
  })

  it('dos POST concurrentes del mismo id fresco: exactamente un éxito', async () => {
    await setCut(iso(-5 * MIN))
    const id = await track(
      await insertEvent({ eventType: 'OrderCreated', aggregateId: seed.orderId }),
    )
    const antes = await deliveryLogCount(subscriptionId)
    const rs = await Promise.all([post({ event_id: id }), post({ event_id: id })])
    const estados = rs.map((r) => r.status).sort()
    expect(estados).toEqual([200, 409])
    expect(await deliveryLogCount(subscriptionId)).toBe(antes + 1)
  })

  // ── El cuerpo no se cree ───────────────────────────────────────────────────
  it('un cuerpo con event_type/aggregate_id/payload falsos usa lo de la base', async () => {
    await setCut(iso(-5 * MIN))
    // En la base el evento es de un tipo que NO notifica a nadie; el cuerpo finge un OrderCreated del pedido
    // del negocio con suscripción. Si la función creyera el cuerpo, `recipients` sería 1 (ver el test de
    // éxito, donde el mismo tipo en la BASE sí da 1) y habría una fila nueva en push_delivery_log.
    const id = await track(
      await insertEvent({ eventType: 'BusinessBlocked', aggregateId: seed.orderId }),
    )
    const antes = await deliveryLogCount(subscriptionId)
    const r = await post({
      event_id: id,
      event_type: 'OrderCreated',
      aggregate_id: seed.orderId,
      payload: { action: 'accept' },
    })
    expect(r.status).toBe(200)
    expect(r.json.recipients).toBe(0)
    expect(await deliveryLogCount(subscriptionId)).toBe(antes)
    expect(await claimedAt(id)).not.toBeNull()
    expect((await eventTimes(id)).push_done_at).not.toBeNull() // cero destinatarios SIN error sí termina
  })

  it('sin event_id real, un cuerpo falso solo NO notifica (el ataque original)', async () => {
    const antes = await deliveryLogCount(subscriptionId)
    const r = await post({
      event_type: 'OrderCreated',
      aggregate_id: seed.orderId,
      payload: {},
      event_id: crypto.randomUUID(),
    })
    expect(r.status).toBe(409)
    expect(await deliveryLogCount(subscriptionId)).toBe(antes)
  })

  // ── 0272: el reclamo con plazo y el marcado del final ──────────────────────
  it('0272: tras el éxito de un evento fresco quedan push_claimed_at y push_done_at', async () => {
    await setCut(iso(-5 * MIN))
    const id = await track(
      await insertEvent({ eventType: 'OrderCreated', aggregateId: seed.orderId }),
    )
    const antes = await eventTimes(id)
    expect(antes.push_done_at).toBeNull()
    const r = await post({ event_id: id })
    expect(r.status).toBe(200)
    expect(r.json.ok).toBe(true)
    const despues = await eventTimes(id)
    expect(despues.push_claimed_at).not.toBeNull()
    expect(despues.push_done_at).not.toBeNull()
    expect(despues.push_dead_at).toBeNull()
  })

  it('0272: un evento reclamado hace más de 180 s y sin terminar se reclama otra vez y queda terminado', async () => {
    await setCut(iso(-5 * MIN))
    const id = await track(
      await insertEvent({ eventType: 'OrderCreated', aggregateId: seed.orderId }),
    )
    const viejo = iso(-200_000)
    const { error } = await localClient
      .from('domain_events')
      .update({ push_claimed_at: viejo })
      .eq('id', id)
    expect(error).toBeNull()
    const antes = await deliveryLogCount(subscriptionId)
    const r = await post({ event_id: id })
    expect(r.status).toBe(200)
    expect(r.json.ok).toBe(true)
    const t = await eventTimes(id)
    expect(t.push_done_at).not.toBeNull()
    expect(new Date(t.push_claimed_at as string).getTime()).toBeGreaterThan(
      new Date(viejo).getTime(),
    )
    expect(await deliveryLogCount(subscriptionId)).toBe(antes + 1)
  })

  it('0272: un evento terminado (push_done_at) o perdido (push_dead_at) da 409', async () => {
    await setCut(iso(-5 * MIN))
    const hecho = await track(
      await insertEvent({ eventType: 'OrderCreated', aggregateId: seed.orderId }),
    )
    const perdido = await track(
      await insertEvent({ eventType: 'OrderCreated', aggregateId: seed.orderId }),
    )
    const u1 = await localClient
      .from('domain_events')
      .update({ push_done_at: iso(0) })
      .eq('id', hecho)
    expect(u1.error).toBeNull()
    const u2 = await localClient
      .from('domain_events')
      .update({ push_dead_at: iso(0) })
      .eq('id', perdido)
    expect(u2.error).toBeNull()
    const antes = await deliveryLogCount(subscriptionId)
    expect((await post({ event_id: hecho })).status).toBe(409)
    expect((await post({ event_id: perdido })).status).toBe(409)
    expect(await claimedAt(hecho)).toBeNull()
    expect(await claimedAt(perdido)).toBeNull()
    expect(await deliveryLogCount(subscriptionId)).toBe(antes)
  })

  it('0272: PushDeliveryFailed se acepta y queda terminado; send-push ya no frena (el freno está en la base): dos seguidos se entregan los dos', async () => {
    await setCut(iso(-5 * MIN))
    const { error: delErr } = await localClient
      .from('ops_alert_throttle')
      .delete()
      .eq('kind', 'push_undelivered')
    expect(delErr).toBeNull()
    // Cuántos admins hay en esta base: cada aviso de fallo va a cada uno (puede ser 0 en una base limpia).
    const admins = Number(psql(`select count(*) from public.user_roles where role = 'admin';`))

    const nuevo = async (): Promise<string> => {
      const id = crypto.randomUUID()
      const { error } = await localClient.from('domain_events').insert({
        id,
        aggregate_type: 'push_outbox',
        aggregate_id: crypto.randomUUID(),
        event_type: 'PushDeliveryFailed',
        payload: { count: 2, eventTypes: 'OrderCreated' } as never,
      })
      if (error) throw new Error(`insert PushDeliveryFailed: ${error.message}`)
      return track(id)
    }

    const a = await nuevo()
    const r1 = await post({ event_id: a })
    expect(r1.status).toBe(200)
    expect(r1.json.ok).toBe(true)
    expect(r1.json.recipients).toBe(admins)
    expect((await eventTimes(a)).push_done_at).not.toBeNull()

    const b = await nuevo()
    const r2 = await post({ event_id: b })
    expect(r2.status).toBe(200)
    expect(r2.json.ok).toBe(true)
    expect(r2.json.recipients).toBe(admins) // sin freno en send-push: se entrega igual
    expect((await eventTimes(b)).push_done_at).not.toBeNull()

    // Y send-push no escribe ya el freno `push_undelivered` (ahora vive en la base).
    const { data: fila, error: filaErr } = await localClient
      .from('ops_alert_throttle')
      .select('*')
      .eq('kind', 'push_undelivered')
      .maybeSingle()
    expect(filaErr).toBeNull()
    expect(fila).toBeNull()
  })

  // ── 0272 · CAX-003 / CAX-004: un error interno no da el aviso por entregado ─────────────────
  it('CAX-003: si falla la lectura de admins, 500 y el evento queda reclamado SIN terminar; restaurado el permiso y vencido el plazo, se procesa', async () => {
    await setCut(iso(-5 * MIN))
    const id = await track(
      await insertEvent({
        eventType: 'PushDeliveryFailed',
        aggregateId: crypto.randomUUID(),
        payload: { count: 2, eventTypes: 'OrderCreated' },
      }),
    )
    const privsAntes = tablePrivs('user_roles')
    expect(privsAntes).toContain('SELECT') // si no, el caso no probaría nada
    let r: Reply
    try {
      psql('revoke select on public.user_roles from service_role;')
      r = await post({ event_id: id })
    } finally {
      psql('grant select on public.user_roles to service_role;')
    }
    expect(tablePrivs('user_roles')).toBe(privsAntes)
    expect(r.status).toBe(500)
    expect(r.json.ok).toBe(false)
    const t = await eventTimes(id)
    expect(t.push_claimed_at).not.toBeNull()
    expect(t.push_done_at).toBeNull()

    // Vencido el plazo del reclamo (180 s) la base lo puede reclamar de nuevo; con el permiso, termina.
    const { error } = await localClient
      .from('domain_events')
      .update({ push_claimed_at: iso(-200_000) })
      .eq('id', id)
    expect(error).toBeNull()
    const r2 = await post({ event_id: id })
    expect(r2.status).toBe(200)
    expect(r2.json.ok).toBe(true)
    expect((await eventTimes(id)).push_done_at).not.toBeNull()
  })

  it('CAX-003: cero destinatarios legítimos (pedido que no existe) es 200 y SÍ termina', async () => {
    await setCut(iso(-5 * MIN))
    const id = await track(
      await insertEvent({ eventType: 'OrderStatusChanged', aggregateId: crypto.randomUUID() }),
    )
    const r = await post({ event_id: id })
    expect(r.status).toBe(200)
    expect(r.json.ok).toBe(true)
    expect(r.json.recipients).toBe(0)
    expect((await eventTimes(id)).push_done_at).not.toBeNull()
  })

  it('CAX-004: si no se puede marcar el final, el aviso sale (200) y el evento queda sin terminar; vencido el plazo se reclama otra vez (al menos una vez)', async () => {
    await setCut(iso(-5 * MIN))
    const id = await track(
      await insertEvent({ eventType: 'OrderCreated', aggregateId: seed.orderId }),
    )
    const antes = await deliveryLogCount(subscriptionId)
    expect(canExecute('public.complete_push_event(uuid)')).toBe('t')
    let r: Reply
    try {
      psql('revoke execute on function public.complete_push_event(uuid) from service_role;')
      r = await post({ event_id: id })
    } finally {
      psql('grant execute on function public.complete_push_event(uuid) to service_role;')
    }
    expect(canExecute('public.complete_push_event(uuid)')).toBe('t')
    expect(r.status).toBe(200) // el aviso salió: la respuesta no cambia
    expect(r.json.ok).toBe(true)
    expect(await deliveryLogCount(subscriptionId)).toBe(antes + 1)
    const t = await eventTimes(id)
    expect(t.push_claimed_at).not.toBeNull()
    expect(t.push_done_at).toBeNull()

    // Documenta el duplicado aceptado: vencido el plazo se reclama otra vez y el aviso sale OTRA vez.
    const { error } = await localClient
      .from('domain_events')
      .update({ push_claimed_at: iso(-200_000) })
      .eq('id', id)
    expect(error).toBeNull()
    const r2 = await post({ event_id: id })
    expect(r2.status).toBe(200)
    expect(await deliveryLogCount(subscriptionId)).toBe(antes + 2)
    expect((await eventTimes(id)).push_done_at).not.toBeNull()
  })

  // ── OpsAlert ───────────────────────────────────────────────────────────────
  const ops = {
    event_type: 'OpsAlert',
    aggregate_id: 'otp_phone_limit_misconfigured',
    payload: { kind: 'otp_phone_limit_misconfigured' },
  }

  it('OpsAlert sin secreto o con uno equivocado: 403', async () => {
    expect((await post(ops)).status).toBe(403)
    expect((await post(ops, { 'x-ops-alert-secret': 'otro-secreto' })).status).toBe(403)
    expect((await post(ops, { 'x-ops-alert-secret': '' })).status).toBe(403)
  })

  it('OpsAlert con el secreto correcto: aceptado (y la segunda, frenada por la ventana)', async () => {
    await localClient
      .from('ops_alert_throttle')
      .delete()
      .eq('kind', 'otp_phone_limit_misconfigured')
    const r = await post(ops, { 'x-ops-alert-secret': OPS_SECRET })
    expect(r.status).toBe(200)
    expect(r.json.ok).toBe(true)
    expect(r.json.throttled).toBeUndefined()
    const again = await post(ops, { 'x-ops-alert-secret': OPS_SECRET })
    expect(again.status).toBe(200)
    expect(again.json.throttled).toBe(true)
  })

  // ── La RPC no se llama desde fuera ─────────────────────────────────────────
  it('/rest/v1/rpc/claim_push_event con la clave anónima y con un JWT de usuario: rechazada y sin reclamar', async () => {
    await setCut(iso(-5 * MIN))
    const id = await track(
      await insertEvent({ eventType: 'BusinessBlocked', aggregateId: seed.orderId }),
    )

    const anon = await fetch(`${BASE}/rest/v1/rpc/claim_push_event`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        authorization: `Bearer ${ANON_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ p_event_id: id }),
    })
    expect(anon.ok).toBe(false)
    expect([401, 403, 404]).toContain(anon.status)

    // JWT de un usuario autenticado real (el dueño del negocio sembrado).
    const email = `edge-http-${crypto.randomUUID().slice(0, 8)}@integration.local`
    const password = 'test-password-12345'
    const created = await localClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (created.error) throw new Error(created.error.message)
    try {
      const anonClient = createClient(BASE, ANON_KEY, { auth: { persistSession: false } })
      const sess = await anonClient.auth.signInWithPassword({ email, password })
      const jwt = sess.data.session?.access_token
      expect(jwt).toBeTruthy()
      const authd = await fetch(`${BASE}/rest/v1/rpc/claim_push_event`, {
        method: 'POST',
        headers: {
          apikey: ANON_KEY,
          authorization: `Bearer ${jwt}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ p_event_id: id }),
      })
      expect(authd.ok).toBe(false)
      expect([401, 403, 404]).toContain(authd.status)
    } finally {
      await localClient.from('users').delete().eq('id', created.data.user.id)
      await localClient.auth.admin.deleteUser(created.data.user.id)
    }
    expect(await claimedAt(id)).toBeNull()
  })
})
