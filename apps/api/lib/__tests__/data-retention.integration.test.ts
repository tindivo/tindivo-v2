/**
 * Migraciones 0284 y 0285 + módulo `retention`: plazos de conservación. Contra la base y el Storage
 * LOCALES, con el caso de uso real (`applyRetentionPolicy`).
 *
 * Por categoría, con el día de corte que da la propia base (`retention_cutoff`):
 *  · una fila vencida (un segundo antes del corte) se purga o se anonimiza;
 *  · una al límite exacto (el instante del corte) y una reciente no se tocan;
 *  · lo activo o abierto nunca se toca, por viejo que sea.
 * Además: la imagen exclusiva de un reporte se borra de Storage; la compartida se queda;
 * una URL externa se conserva. Ningún importe cambia. Sin la clave o con un valor inválido,
 * nada se toca (falla cerrada). La segunda corrida no hace nada. Ni anon ni authenticated
 * pueden ejecutar las funciones (GRANT), por PostgREST y por catálogo.
 */
import { execFileSync, spawn } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import {
  applyRetentionPolicy,
  type RetentionSummary,
  SupabaseDataRetentionRepository,
  SupabaseProofStorage,
} from '@tindivo/backend/retention'
import { createLogger, type LogLevel } from '@tindivo/backend/shared'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  localClient as db,
  type SeededOrder,
  seedContraentregaOrder,
} from './helpers/local-db'

// Cada consulta es un `docker exec` (~1 s en Windows): la preparación siembra unas 35 filas.
vi.setConfig({ hookTimeout: 240_000, testTimeout: 120_000 })

const CONTAINER = 'supabase_db_zpnipajgwfthxhdtzhly'
const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const CLAVE = 'test-password-12345'
const PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
)
const DEFAULT_SETTING =
  '{"customerIncidentsMonths": 24, "reportsMonths": 24, "phoneRestrictionsMonths": 24, "storeEventsMonths": 13, "pushDeliveryLogMonths": 13, "adminAlertsMonths": 13, "cashRecordsYears": 5, "strikesMonths": 24, "addressDirectoryMonths": 24, "phoneAssignmentsMonths": 24}'

/** Las funciones nuevas de la 0284 que ningún cliente puede llamar. */
const FUNCIONES = [
  'retention_cutoff',
  'retention_ref_is_path',
  'retention_ref_objects',
  'retention_ref_shared',
  'purge_old_store_events',
  'purge_old_push_delivery_log',
  'purge_old_admin_alerts',
  'purge_old_phone_restrictions',
  'anonymize_old_customer_incidents',
  'retention_report_due',
  'list_report_retention_due',
  'report_retention_precheck',
  'finish_report_retention',
  'retention_cash_cutoff',
  'anonymize_old_cash_settlement_notes',
  'retention_fraud_claim_due',
  'list_fraud_claim_retention_due',
  'fraud_claim_retention_precheck',
  'finish_fraud_claim_retention',
  'retention_window_start',
  'retention_lock_path',
  'retention_prepare_delete',
  'retention_mark_valid',
  'retention_release_mark',
  'retention_guard_ref',
  'retention_guard_row',
  'anonymize_old_customer_strikes',
  'purge_old_address_directory',
  'purge_old_phone_assignments',
]
/** Las que se pueden llamar por PostgREST, con argumentos válidos. */
const LLAMABLES: [string, Record<string, unknown>][] = [
  ['retention_cutoff', { p_key: 'reportsMonths' }],
  ['purge_old_store_events', { p_limit: 1 }],
  ['purge_old_push_delivery_log', { p_limit: 1 }],
  ['purge_old_admin_alerts', { p_limit: 1 }],
  ['purge_old_phone_restrictions', { p_limit: 1 }],
  ['anonymize_old_customer_incidents', { p_limit: 1 }],
  ['list_report_retention_due', { p_limit: 1 }],
  ['report_retention_precheck', { p_report_id: '00000000-0000-4000-8000-000000000000' }],
  ['finish_report_retention', { p_report_id: '00000000-0000-4000-8000-000000000000' }],
  ['retention_cash_cutoff', {}],
  ['anonymize_old_cash_settlement_notes', { p_limit: 1 }],
  ['list_fraud_claim_retention_due', { p_limit: 1 }],
  ['fraud_claim_retention_precheck', { p_claim_id: '00000000-0000-4000-8000-000000000000' }],
  ['finish_fraud_claim_retention', { p_claim_id: '00000000-0000-4000-8000-000000000000' }],
  ['retention_window_start', { p_key: 'strikesMonths' }],
  ['anonymize_old_customer_strikes', { p_limit: 1 }],
  ['purge_old_address_directory', { p_limit: 1 }],
  ['purge_old_phone_assignments', { p_limit: 1 }],
]

/** SQL contra la base local por stdin (los acentos no se corrompen). */
function sql(query: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: query, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  ).trim()
}

/** Un INSERT … RETURNING id. */
const ins = (query: string): string => sql(query).split('\n')[0] ?? ''

const runId = crypto.randomUUID().slice(0, 8)
const tag = (s: string) => `ret-${runId}-${s}`
/** Un teléfono de 9 dígitos distinto por corrida. */
const telefono = (n: number) =>
  `9${String(Number.parseInt(runId, 16) % 1_000_000).padStart(6, '0')}${n}${n}`

/** Instantes relativos al corte de una clave: vencida = 1 s antes, límite = el corte, reciente = ayer. */
const VENCIDA = (key: string) => `public.retention_cutoff('${key}') - interval '1 second'`
const LIMITE = (key: string) => `public.retention_cutoff('${key}')`
const RECIENTE = `now() - interval '1 day'`
const ANTIGUA = `now() - interval '6 years'`

async function subir(path: string): Promise<void> {
  const { error } = await db.storage
    .from('payment-proofs')
    .upload(path, PNG, { contentType: 'image/png' })
  if (error) throw new Error(`subir ${path} falló: ${error.message}`)
}

/** `false` solo con la respuesta contractual de Storage local para un objeto inexistente. */
async function existe(path: string): Promise<boolean> {
  const { data, error } = await db.storage.from('payment-proofs').download(path)
  if (!error) return data !== null
  const e = error as { statusCode?: string; message?: string }
  if (e.statusCode === '404' && e.message === 'Object not found') return false
  throw new Error(
    `Storage respondió algo que no es «no existe» para ${path}: ${JSON.stringify(error)}`,
  )
}

function correr(lines: string[] = []): Promise<RetentionSummary> {
  return applyRetentionPolicy({
    retention: new SupabaseDataRetentionRepository(() => db),
    storage: new SupabaseProofStorage(() => db),
    logger: createLogger({
      module: 'test',
      sink: { write: (_level: LogLevel, line: string) => void lines.push(line) },
    }),
  })
}

const existeFila = (tabla: string, id: string) =>
  sql(`select count(*) from public.${tabla} where id = '${id}';`) === '1'

/**
 * Huella de TODAS las columnas de las tablas de dinero (fila completa en jsonb), salvo las que la
 * retención borra a propósito, que se listan aquí de forma explícita (CAX-002):
 *  · reports: customer_phone, description, resolution_note, customer_user_id, evidence_url
 *    (+ updated_at, que registra la anonimización);
 *  · fraud_coverage_claims: reason, resolution_note, evidence_url (+ updated_at);
 *  · cash_settlements: dispute_note, resolution_note (+ updated_at).
 * `business_charges` y el `balance_due` derivado de cada negocio entran sin excepción.
 */
const FOTO_SQL = `
    select md5(coalesce(string_agg((to_jsonb(r) - array['customer_phone', 'description',
             'resolution_note', 'customer_user_id', 'evidence_url', 'updated_at'])::text, ',' order by r.id), ''))
      from public.reports r;
    select md5(coalesce(string_agg((to_jsonb(c) - array['reason', 'resolution_note', 'evidence_url',
             'updated_at'])::text, ',' order by c.id), '')) from public.fraud_coverage_claims c;
    select md5(coalesce(string_agg((to_jsonb(cs) - array['dispute_note', 'resolution_note',
             'updated_at'])::text, ',' order by cs.id), '')) from public.cash_settlements cs;
    select md5(coalesce(string_agg(to_jsonb(bc)::text, ',' order by bc.id), '')) from public.business_charges bc;
    select md5(coalesce(string_agg(concat_ws('|', b.id, b.balance_due), ',' order by b.id), '')) from public.businesses b;
    select md5(coalesce(string_agg(concat_ws('|', id, is_strike, incident_type, review_result,
             reviewed_at, created_at), ',' order by id), '')) from public.customer_incidents;`
const fotoDelDinero = (): string => sql(FOTO_SQL)

let settingOriginal: string
let adminId: string
let dineroAntes: string
let primera: RetentionSummary
const lineas: string[] = []
const ids: Record<string, string> = {}
const archivos = {
  propio: `retencion-${runId}/propio.png`,
  compartido: `retencion-${runId}/compartido.png`,
  vecino: `retencion-${runId}/vecino.png`,
}
let usuarioPrueba: string | undefined
let pedidoCaja: SeededOrder | undefined
let pedidoCarrera: SeededOrder | undefined
/** Caja (§5): el corte es el 1 de enero en Lima; vencida = 1 s antes, límite = el corte. */
const CAJA_VENCIDA = `public.retention_cash_cutoff() - interval '1 second'`
const CAJA_LIMITE = 'public.retention_cash_cutoff()'
const archivoReclamo = `retencion-${runId}/reclamo.png`
/** `settlement_date` de cada liquidación al sembrarla: la purga no puede moverla. */
const fechasCaja: Record<string, string> = {}

beforeAll(async () => {
  settingOriginal = sql(
    `select coalesce((select value::text from public.app_settings where key = 'data_retention'), '');`,
  )
  sql(`insert into public.app_settings (key, value) values ('data_retention', '${DEFAULT_SETTING}'::jsonb)
       on conflict (key) do update set value = excluded.value;`)
  adminId = sql(`select id from public.users order by created_at limit 1;`)
  expect(adminId).toMatch(/^[0-9a-f-]{36}$/)

  // ── 6 · Registros técnicos ────────────────────────────────────────────────
  for (const [k, when] of [
    ['vencida', VENCIDA('storeEventsMonths')],
    ['limite', LIMITE('storeEventsMonths')],
    ['reciente', RECIENTE],
  ] as const) {
    ids[`store_${k}`] = ins(`insert into public.store_events (type, session_id, created_at)
      values ('view_list', '${tag(k)}', ${when}) returning id;`)
  }
  for (const [k, when] of [
    ['vencida', VENCIDA('pushDeliveryLogMonths')],
    ['limite', LIMITE('pushDeliveryLogMonths')],
    ['reciente', RECIENTE],
  ] as const) {
    ids[`push_${k}`] = ins(`insert into public.push_delivery_log (event_type, status, "at")
      values ('${tag(k)}', 'ok', ${when}) returning id;`)
  }
  for (const [k, resolved] of [
    ['vencida', VENCIDA('adminAlertsMonths')],
    ['limite', LIMITE('adminAlertsMonths')],
    ['reciente', RECIENTE],
    ['abierta', 'null'],
  ] as const) {
    ids[`alert_${k}`] =
      ins(`insert into public.admin_alerts (type, payload, resolved_at, resolved_by, created_at)
      values ('${tag(k)}', '{}'::jsonb, ${resolved}, ${resolved === 'null' ? 'null' : `'${adminId}'`}, ${ANTIGUA})
      returning id;`)
  }

  // ── 4 · Restricciones del número ──────────────────────────────────────────
  const restr = (k: string, phone: string, kind: string, until: string, lifted: string | null) => {
    ids[`restr_${k}`] = ins(`insert into public.phone_restrictions
        (phone, kind, "until", source, created_at, lifted_at, lifted_by, lift_reason)
      values ('${phone}', '${kind}', ${until}, 'transfer', ${ANTIGUA},
        ${lifted ?? 'null'}, ${lifted ? `'${adminId}'` : 'null'}, ${lifted ? "'prueba de retención'" : 'null'})
      returning id;`)
  }
  restr(
    'levantada_vencida',
    telefono(1),
    'contraentrega_blocked',
    'null',
    VENCIDA('phoneRestrictionsMonths'),
  )
  restr(
    'levantada_limite',
    telefono(2),
    'contraentrega_blocked',
    'null',
    LIMITE('phoneRestrictionsMonths'),
  )
  restr('levantada_reciente', telefono(3), 'contraentrega_blocked', 'null', RECIENTE)
  restr('expirada_vencida', telefono(4), 'blocked', VENCIDA('phoneRestrictionsMonths'), null)
  restr('expirada_limite', telefono(5), 'blocked', LIMITE('phoneRestrictionsMonths'), null)
  restr('activa_sin_plazo', telefono(6), 'contraentrega_blocked', 'null', null)
  restr('activa_futura', telefono(7), 'blocked', `now() + interval '10 days'`, null)

  // ── 3 · Incidentes ────────────────────────────────────────────────────────
  const incidente = (k: string, created: string, reviewed: string | null) => {
    ids[`inc_${k}`] = ins(`insert into public.customer_incidents
        (customer_user_id, customer_phone, delivery_reference, incident_type, description,
         reported_by_role, is_strike, reviewed_at, review_result, created_at)
      values ('${adminId}', '${telefono(8)}', '${tag(`ref-${k}`)}', 'no_show', '${tag(`desc-${k}`)}',
        'driver', false, ${reviewed ?? 'null'}, ${reviewed ? "'dismissed'" : 'null'}, ${created})
      returning id;`)
  }
  incidente('vencida', ANTIGUA, VENCIDA('customerIncidentsMonths'))
  incidente('limite', ANTIGUA, LIMITE('customerIncidentsMonths'))
  incidente('revisada_hace_poco', ANTIGUA, RECIENTE)
  incidente('sin_revisar', ANTIGUA, null)

  // ── 3 · Reportes ──────────────────────────────────────────────────────────
  await subir(archivos.propio)
  await subir(archivos.compartido)
  await subir(archivos.vecino)
  const reporte = (k: string, cols: Record<string, string>) => {
    const base: Record<string, string> = {
      type: "'no_show'",
      status: "'resolved'",
      customer_user_id: `'${adminId}'`,
      customer_phone: `'${telefono(9)}'`,
      description: `'${tag(`desc-${k}`)}'`,
      resolution_note: `'${tag(`nota-${k}`)}'`,
      created_at: ANTIGUA,
      resolved_at: VENCIDA('reportsMonths'),
      ...cols,
    }
    ids[`rep_${k}`] = ins(`insert into public.reports (${Object.keys(base).join(', ')})
      values (${Object.values(base).join(', ')}) returning id;`)
  }
  reporte('propio', { evidence_url: `'${archivos.propio}'` })
  reporte('compartido', { evidence_url: `'${archivos.compartido}'` })
  // El vecino que comparte el archivo no vence: el archivo se queda con él.
  reporte('compartido_vecino', { evidence_url: `'${archivos.compartido}'`, resolved_at: RECIENTE })
  reporte('url', { evidence_url: "'https://ejemplo.invalid/evidencia.png'" })
  reporte('archivo_perdido', { evidence_url: `'retencion-${runId}/no-existe.png'` })
  reporte('limite', { evidence_url: `'${archivos.vecino}'`, resolved_at: LIMITE('reportsMonths') })
  reporte('abierto', { status: "'open'", resolved_at: 'null' })
  reporte('apelacion_pendiente', {
    type: "'rejected_proof_disputed'",
    appeal_status: "'pending'",
  })
  reporte('devolucion_pendiente', {
    type: "'rejected_proof_disputed'",
    appeal_status: "'approved'",
    refund_status: "'pending'",
  })
  reporte('devolucion_completa', {
    type: "'rejected_proof_disputed'",
    appeal_status: "'approved'",
    refund_status: "'completed'",
    refund_amount: '12.50',
    refund_proof_path: `'retencion-${runId}/devolucion.png'`,
    refund_completed_at: VENCIDA('reportsMonths'),
  })

  // ── 5 · Caja y reclamos económicos ────────────────────────────────────────
  const driverId = sql(`select id from public.drivers order by created_at limit 1;`)
  expect(driverId).toMatch(/^[0-9a-f-]{36}$/)
  pedidoCaja = await seedContraentregaOrder()
  const liquidacion = (k: string, status: string, created: string) => {
    ids[`caja_${k}`] = ins(`insert into public.cash_settlements
        (business_id, driver_id, settlement_date, total_cash, order_count, status,
         reported_amount, dispute_note, resolved_amount, resolution_note, created_at)
      values ('${pedidoCaja?.businessId}', '${driverId}', (${created})::date, 150.75, 3, '${status}',
        140.25, '${tag(`disputa-${k}`)}', 145.50, '${tag(`resol-${k}`)}', ${created})
      returning id;`)
  }
  liquidacion('vencida', 'resolved', CAJA_VENCIDA)
  liquidacion('limite', 'resolved', CAJA_LIMITE)
  liquidacion('disputada', 'disputed', CAJA_VENCIDA)
  liquidacion('reciente', 'resolved', RECIENTE)
  for (const k of ['vencida', 'limite', 'disputada', 'reciente']) {
    fechasCaja[k] = sql(
      `select settlement_date::text from public.cash_settlements where id = '${ids[`caja_${k}`]}';`,
    )
  }
  await db.storage
    .from('payment-proofs')
    .upload(archivoReclamo, PNG, { contentType: 'image/png' })
    .then(({ error }) => {
      if (error) throw new Error(`subir el reclamo falló: ${error.message}`)
    })
  const reclamo = (k: string, status: string, created: string, evidence: string | null) => {
    ids[`reclamo_${k}`] = ins(`insert into public.fraud_coverage_claims
        (order_id, business_id, amount, reason, evidence_url, status, resolution_note, created_at)
      values ('${pedidoCaja?.orderId}', '${pedidoCaja?.businessId}', 33.30, '${tag(`motivo-${k}`)}',
        ${evidence ? `'${evidence}'` : 'null'}, '${status}', '${tag(`nota-${k}`)}', ${created})
      returning id;`)
  }
  reclamo('vencido', 'approved', CAJA_VENCIDA, archivoReclamo)
  reclamo('limite', 'rejected', CAJA_LIMITE, null)
  reclamo('pendiente', 'pending', CAJA_VENCIDA, null)

  dineroAntes = fotoDelDinero()
})

afterAll(async () => {
  const restaurar = settingOriginal
    ? `insert into public.app_settings (key, value) values ('data_retention', '${settingOriginal}'::jsonb)
       on conflict (key) do update set value = excluded.value;`
    : `delete from public.app_settings where key = 'data_retention';`
  sql(restaurar)
  await db.storage
    .from('payment-proofs')
    .remove([archivos.propio, archivos.compartido, archivos.vecino])
  const lista = (prefijo: string) =>
    Object.entries(ids)
      .filter(([k]) => k.startsWith(prefijo))
      .map(([, v]) => `'${v}'`)
      .join(',') || 'null'
  sql(`delete from public.reports where id in (${lista('rep_')});
       delete from public.customer_incidents where id in (${lista('inc_')});
       delete from public.phone_restrictions where id in (${lista('restr_')});
       delete from public.admin_alerts where id in (${lista('alert_')});
       delete from public.push_delivery_log where id in (${lista('push_')});
       delete from public.store_events where id in (${lista('store_')});
       delete from public.cash_settlements where id in (${lista('caja_')});
       delete from public.fraud_coverage_claims where id in (${lista('reclamo_')});`)
  await db.storage.from('payment-proofs').remove([archivoReclamo])
  if (pedidoCaja) await cleanup(pedidoCaja)
  if (usuarioPrueba) {
    await db.from('users').delete().eq('id', usuarioPrueba)
    await db.auth.admin.deleteUser(usuarioPrueba)
  }
})

describe('falla cerrada', () => {
  it('sin la clave data_retention, ninguna función toca nada', async () => {
    sql(`delete from public.app_settings where key = 'data_retention';`)
    try {
      expect(sql(`select public.retention_cutoff('reportsMonths') is null;`)).toBe('t')
      const resumen = await correr()
      for (const [categoria, s] of Object.entries(resumen)) {
        expect(s.rows, categoria).toBe(0)
        expect(s.failed, categoria).toBe(0)
      }
      expect(existeFila('store_events', ids.store_vencida ?? '')).toBe(true)
      expect(await existe(archivos.propio)).toBe(true)
    } finally {
      sql(`insert into public.app_settings (key, value) values ('data_retention', '${DEFAULT_SETTING}'::jsonb)
           on conflict (key) do update set value = excluded.value;`)
    }
  })

  it.each([
    '"24"',
    '0',
    '2.5',
    '-3',
    '1201',
    'null',
  ])('con %s como plazo, no hay día de corte', (malo) => {
    sql(`update public.app_settings set value = jsonb_set(value, '{reportsMonths}', '${malo}'::jsonb)
           where key = 'data_retention';`)
    try {
      expect(sql(`select public.retention_cutoff('reportsMonths') is null;`)).toBe('t')
    } finally {
      sql(
        `update public.app_settings set value = '${DEFAULT_SETTING}'::jsonb where key = 'data_retention';`,
      )
    }
  })

  it('el día de corte es la medianoche de Lima de hoy menos el plazo', () => {
    expect(
      sql(`select public.retention_cutoff('reportsMonths')
                = ((((now() at time zone 'America/Lima')::date - interval '24 months')::date)::timestamp
                   at time zone 'America/Lima');`),
    ).toBe('t')
  })
})

describe('plazos de conservación (0284), primera corrida', () => {
  beforeAll(async () => {
    primera = await correr(lineas)
  })

  it('ninguna categoría falló y cada una dejó su línea de resumen', () => {
    for (const [categoria, s] of Object.entries(primera)) {
      expect(s.failed, categoria).toBe(0)
    }
    expect(lineas.filter((l) => l.includes('data_retention_category_done'))).toHaveLength(11)
    expect(lineas.join('\n')).not.toContain(adminId)
    expect(lineas.join('\n')).not.toContain(runId)
  })

  it('registros técnicos: lo vencido se borra; el límite, lo reciente y lo no resuelto se quedan', () => {
    expect(existeFila('store_events', ids.store_vencida ?? '')).toBe(false)
    expect(existeFila('store_events', ids.store_limite ?? '')).toBe(true)
    expect(existeFila('store_events', ids.store_reciente ?? '')).toBe(true)
    expect(existeFila('push_delivery_log', ids.push_vencida ?? '')).toBe(false)
    expect(existeFila('push_delivery_log', ids.push_limite ?? '')).toBe(true)
    expect(existeFila('push_delivery_log', ids.push_reciente ?? '')).toBe(true)
    expect(existeFila('admin_alerts', ids.alert_vencida ?? '')).toBe(false)
    expect(existeFila('admin_alerts', ids.alert_limite ?? '')).toBe(true)
    expect(existeFila('admin_alerts', ids.alert_reciente ?? '')).toBe(true)
    expect(existeFila('admin_alerts', ids.alert_abierta ?? '')).toBe(true)
    expect(primera.store_events.rows).toBeGreaterThanOrEqual(1)
    expect(primera.push_delivery_log.rows).toBeGreaterThanOrEqual(1)
    expect(primera.admin_alerts.rows).toBeGreaterThanOrEqual(1)
  })

  it('restricciones: se borran las levantadas o vencidas hace más del plazo; las activas nunca', () => {
    expect(existeFila('phone_restrictions', ids.restr_levantada_vencida ?? '')).toBe(false)
    expect(existeFila('phone_restrictions', ids.restr_expirada_vencida ?? '')).toBe(false)
    for (const k of [
      'levantada_limite',
      'levantada_reciente',
      'expirada_limite',
      'activa_sin_plazo',
      'activa_futura',
    ]) {
      expect(existeFila('phone_restrictions', ids[`restr_${k}`] ?? ''), k).toBe(true)
    }
    // El riesgo del número sigue igual: la activa todavía exige pago adelantado y bloquea.
    expect(sql(`select public.customer_requires_prepayment(null, '${telefono(6)}', null);`)).toBe(
      't',
    )
    expect(sql(`select public.customer_is_blocked(null, '${telefono(7)}');`)).toBe('t')
  })

  it('incidentes: el revisado hace más del plazo queda sin persona; el resto, intacto', () => {
    const fila = (k: string) =>
      sql(`select concat_ws('|', customer_phone, coalesce(delivery_reference, '∅'), coalesce(description, '∅'),
                  coalesce(customer_user_id::text, '∅'), incident_type, is_strike,
                  coalesce(review_result, ''))
             from public.customer_incidents where id = '${ids[`inc_${k}`]}';`)
    expect(fila('vencida')).toBe('eliminado|∅|∅|∅|no_show|f|dismissed')
    for (const k of ['limite', 'revisada_hace_poco', 'sin_revisar']) {
      expect(fila(k), k).toBe(
        `${telefono(8)}|${tag(`ref-${k}`)}|${tag(`desc-${k}`)}|${adminId}|no_show|f|${k === 'sin_revisar' ? '' : 'dismissed'}`,
      )
    }
  })

  it('reportes cerrados: datos y evidencia fuera; la imagen propia se borra de Storage', async () => {
    const fila = (k: string) =>
      sql(`select concat_ws('|', coalesce(customer_phone, '∅'), coalesce(description, '∅'),
                  coalesce(resolution_note, '∅'), coalesce(customer_user_id::text, '∅'),
                  coalesce(evidence_url, '∅'))
             from public.reports where id = '${ids[`rep_${k}`]}';`)
    expect(fila('propio')).toBe('∅|∅|∅|∅|∅')
    expect(await existe(archivos.propio)).toBe(false)
    // Compartido con un reporte que no vence: se suelta la referencia, el archivo se queda.
    expect(fila('compartido')).toBe('∅|∅|∅|∅|∅')
    expect(await existe(archivos.compartido)).toBe(true)
    expect(fila('compartido_vecino')).toContain(archivos.compartido)
    // Una URL externa no se resuelve contra Storage: se conserva y la fila cuenta como pendiente.
    expect(fila('url')).toBe('∅|∅|∅|∅|https://ejemplo.invalid/evidencia.png')
    expect(primera.reports.pending).toBeGreaterThanOrEqual(1)
    expect(fila('archivo_perdido')).toBe('∅|∅|∅|∅|∅')
    expect(primera.reports.files).toBeGreaterThanOrEqual(1)
  })

  it('reportes: el del límite exacto, el abierto y los de dinero abiertos no se tocan', async () => {
    for (const k of ['limite', 'abierto', 'apelacion_pendiente', 'devolucion_pendiente']) {
      const fila =
        sql(`select concat_ws('|', customer_phone, description, resolution_note, customer_user_id)
                          from public.reports where id = '${ids[`rep_${k}`]}';`)
      expect(fila, k).toBe(`${telefono(9)}|${tag(`desc-${k}`)}|${tag(`nota-${k}`)}|${adminId}`)
    }
    expect(await existe(archivos.vecino)).toBe(true)
  })

  it('reporte con devolución completada: se anonimiza y el comprobante de la devolución se queda', () => {
    expect(
      sql(`select concat_ws('|', coalesce(description, '∅'), refund_amount, refund_proof_path, refund_status)
             from public.reports where id = '${ids.rep_devolucion_completa}';`),
    ).toBe(`∅|12.50|retencion-${runId}/devolucion.png|completed`)
  })

  it('ningún importe, estado ni fecha de negocio cambió', () => {
    expect(fotoDelDinero()).toBe(dineroAntes)
  })

  it('la segunda corrida no toca nada', async () => {
    const segunda = await correr()
    for (const [categoria, s] of Object.entries(segunda)) {
      expect(s.rows, categoria).toBe(0)
      expect(s.failed, categoria).toBe(0)
    }
  })

  it('finish_report_retention se niega con un reporte abierto o inexistente', () => {
    expect(sql(`select public.finish_report_retention('${ids.rep_abierto}');`)).toBe('not_due')
    expect(
      sql(`select public.report_retention_precheck('${ids.rep_abierto}')::jsonb ->> 'status';`),
    ).toBe('not_due')
    expect(
      sql(`select public.finish_report_retention('00000000-0000-4000-8000-000000000000');`),
    ).toBe('not_found')
  })

  it('finish_report_retention no anonimiza mientras el archivo propio siga en Storage', async () => {
    const path = `retencion-${runId}/sigue.png`
    await subir(path)
    try {
      const id =
        ins(`insert into public.reports (type, status, description, evidence_url, created_at, resolved_at)
        values ('no_show', 'resolved', '${tag('sigue')}', '${path}', ${ANTIGUA}, ${VENCIDA('reportsMonths')})
        returning id;`)
      ids.rep_sigue = id
      expect(sql(`select public.finish_report_retention('${id}');`)).toBe('object_remains')
      expect(sql(`select description from public.reports where id = '${id}';`)).toBe(tag('sigue'))
    } finally {
      await db.storage.from('payment-proofs').remove([path])
    }
  })
})

describe('caja y reclamos económicos (0285)', () => {
  it('el corte es el 1 de enero en Lima: 5 años contados desde el año siguiente', () => {
    // Hoy no es 1 de enero en Lima salvo un día al año; ese día el corte retrocede un año.
    expect(
      sql(`select public.retention_cash_cutoff() = (make_date(
                extract(year from (now() at time zone 'America/Lima'))::int - 5
                - case when (now() at time zone 'America/Lima')::date
                            = make_date(extract(year from (now() at time zone 'America/Lima'))::int, 1, 1)
                       then 1 else 0 end, 1, 1)::timestamp at time zone 'America/Lima');`),
    ).toBe('t')
  })

  it('liquidaciones: la vencida pierde sus notas; límite, disputa abierta y reciente, intactas', () => {
    const fila = (k: string) =>
      sql(`select concat_ws('|', coalesce(dispute_note, '∅'), coalesce(resolution_note, '∅'),
                  total_cash, reported_amount, resolved_amount, status, settlement_date)
             from public.cash_settlements where id = '${ids[`caja_${k}`]}';`)
    expect(fila('vencida')).toBe(`∅|∅|150.75|140.25|145.50|resolved|${fechasCaja.vencida}`)
    for (const [k, estado] of [
      ['limite', 'resolved'],
      ['disputada', 'disputed'],
      ['reciente', 'resolved'],
    ] as const) {
      expect(fila(k), k).toBe(
        `${tag(`disputa-${k}`)}|${tag(`resol-${k}`)}|150.75|140.25|145.50|${estado}|${fechasCaja[k]}`,
      )
    }
    expect(primera.cash_settlements.rows).toBeGreaterThanOrEqual(1)
  })

  it('reclamos: el vencido pierde motivo, nota y evidencia (la imagen se borra); el importe se queda', async () => {
    const fila = (k: string) =>
      sql(`select concat_ws('|', reason, coalesce(resolution_note, '∅'), coalesce(evidence_url, '∅'),
                  amount, status)
             from public.fraud_coverage_claims where id = '${ids[`reclamo_${k}`]}';`)
    expect(fila('vencido')).toBe('Dato eliminado|∅|∅|33.30|approved')
    expect(await existe(archivoReclamo)).toBe(false)
    expect(fila('limite')).toBe(`${tag('motivo-limite')}|${tag('nota-limite')}|∅|33.30|rejected`)
    expect(fila('pendiente')).toBe(
      `${tag('motivo-pendiente')}|${tag('nota-pendiente')}|∅|33.30|pending`,
    )
    expect(primera.fraud_coverage_claims).toMatchObject({ rows: 1, files: 1, failed: 0 })
  })
})

describe('permisos: solo service_role', () => {
  it('todas las funciones son SECURITY DEFINER, con search_path vacío y sin EXECUTE para clientes', () => {
    const filas = sql(`
      select p.proname || '|' || p.prosecdef || '|' || coalesce(array_to_string(p.proconfig, ','), '') || '|' ||
             has_function_privilege('anon', p.oid, 'execute') || '|' ||
             has_function_privilege('authenticated', p.oid, 'execute') || '|' ||
             has_function_privilege('service_role', p.oid, 'execute')
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in (${FUNCIONES.map((f) => `'${f}'`).join(',')})
       order by p.proname;`).split('\n')
    expect(filas).toHaveLength(FUNCIONES.length)
    for (const fila of filas) {
      const [nombre, secdef, cfg, anon, auth, service] = fila.split('|')
      expect([secdef, cfg, anon, auth, service], nombre).toEqual([
        'true',
        'search_path=""',
        'false',
        'false',
        'true',
      ])
    }
  })

  it('anon no puede llamarlas por PostgREST', async () => {
    const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    for (const [nombre, args] of LLAMABLES) {
      const { data, error } = await (
        anon as unknown as {
          rpc(n: string, a: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
        }
      ).rpc(nombre, args)
      expect(error, nombre).not.toBeNull()
      expect(data, nombre).toBeNull()
    }
  })

  it('un usuario con sesión (authenticated) tampoco', async () => {
    const email = `retencion-${runId}@integration.local`
    const { data: creado, error: e1 } = await db.auth.admin.createUser({
      email,
      password: CLAVE,
      email_confirm: true,
    })
    if (e1) throw new Error(`crear el usuario falló: ${e1.message}`)
    usuarioPrueba = creado.user.id
    const cli = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error: e2 } = await cli.auth.signInWithPassword({ email, password: CLAVE })
    if (e2) throw new Error(`iniciar sesión falló: ${e2.message}`)
    for (const [nombre, args] of LLAMABLES) {
      const { data, error } = await (
        cli as unknown as {
          rpc(n: string, a: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
        }
      ).rpc(nombre, args)
      expect(error, nombre).not.toBeNull()
      expect(data, nombre).toBeNull()
    }
  })
})

/** Una conexión psql aparte (proceso propio): las pruebas de carrera necesitan dos sesiones REALES. */
function psqlAsync(
  input: string,
): Promise<{ code: number | null; out: string; err: string; ms: number }> {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const child = spawn(
      'docker',
      [
        'exec',
        '-i',
        CONTAINER,
        'psql',
        '-U',
        'postgres',
        '-At',
        '-v',
        'ON_ERROR_STOP=1',
        '-f',
        '-',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => {
      out += d
    })
    child.stderr.on('data', (d) => {
      err += d
    })
    child.on('close', (code) => resolve({ code, out: out.trim(), err, ms: Date.now() - t0 }))
    child.stdin.end(input)
  })
}
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * CAX-001 (Codex R1): el borrado de Storage ocurre fuera de la base, así que la exclusión es una MARCA
 * puesta bajo candado de fila y de ruta por el precheck. Dos conexiones reales se intercalan:
 *  · A: precheck (marca) y sostiene su transacción 3 s; B intenta adoptar la ruta a mitad: B espera
 *    el candado y, al soltarse, el trigger la rechaza (`retention_pending_delete`);
 *  · B adopta primero y sostiene su transacción; A (precheck) espera y, al soltarse, ve la ruta
 *    compartida: no marca nada, no devuelve objetos y la imagen se conserva.
 */
describe.each([
  {
    nombre: 'reports (0284)',
    source: 'reports',
    tabla: 'reports',
    precheck: 'report_retention_precheck',
    finish: 'finish_report_retention',
    abrir: (id: string) => `update public.reports set status = 'open' where id = '${id}';`,
    sembrar: (path: string, k: string) =>
      ins(`insert into public.reports (type, status, description, evidence_url, created_at, resolved_at)
        values ('no_show', 'resolved', '${tag(`carrera-${k}`)}', '${path}', ${ANTIGUA}, ${VENCIDA('reportsMonths')})
        returning id;`),
  },
  {
    nombre: 'fraud_coverage_claims (0285, dinero)',
    source: 'fraud_coverage_claims',
    tabla: 'fraud_coverage_claims',
    precheck: 'fraud_claim_retention_precheck',
    finish: 'finish_fraud_claim_retention',
    abrir: (id: string) =>
      `update public.fraud_coverage_claims set status = 'pending' where id = '${id}';`,
    sembrar: (path: string, k: string) =>
      ins(`insert into public.fraud_coverage_claims
          (order_id, business_id, amount, reason, evidence_url, status, resolution_note, created_at)
        values ('${pedidoCarrera?.orderId}', '${pedidoCarrera?.businessId}', 12.50, '${tag(`carrera-${k}`)}',
          '${path}', 'approved', '${tag(`nota-${k}`)}', ${CAJA_VENCIDA})
        returning id;`),
  },
])('CAX-001 · carrera entre el precheck y la adopción de la ruta: $nombre', (caso) => {
  const creados: { reportes: string[]; reclamos: string[]; archivos: string[] } = {
    reportes: [],
    reclamos: [],
    archivos: [],
  }

  beforeAll(async () => {
    if (caso.source === 'fraud_coverage_claims') pedidoCarrera = await seedContraentregaOrder()
  })

  afterAll(async () => {
    if (creados.reportes.length) {
      sql(
        `delete from public.reports where id in (${creados.reportes.map((i) => `'${i}'`).join(',')});`,
      )
    }
    if (creados.reclamos.length) {
      sql(
        `delete from public.fraud_coverage_claims where id in (${creados.reclamos.map((i) => `'${i}'`).join(',')});`,
      )
    }
    sql(
      `delete from public.retention_storage_marks where path like 'retencion-${runId}/carrera-%';`,
    )
    if (creados.archivos.length) await db.storage.from('payment-proofs').remove(creados.archivos)
    if (pedidoCarrera) await cleanup(pedidoCarrera)
    pedidoCarrera = undefined
  })

  /** Fila vencida con su archivo en Storage + un reporte abierto que intentará adoptar la ruta. */
  async function escenario(k: string) {
    const path = `retencion-${runId}/carrera-${caso.source}-${k}.png`
    await subir(path)
    creados.archivos.push(path)
    const vencida = caso.sembrar(path, k)
    ;(caso.source === 'reports' ? creados.reportes : creados.reclamos).push(vencida)
    const adoptante = ins(`insert into public.reports (type, status, description, created_at)
      values ('no_show', 'open', '${tag(`adopta-${k}`)}', now()) returning id;`)
    creados.reportes.push(adoptante)
    const adoptar = `update public.reports set evidence_url = '${path}' where id = '${adoptante}';`
    return { path, vencida, adoptante, adoptar }
  }

  it('A marca primero: la adopción espera el candado y el trigger la rechaza; se borra solo lo del precheck', async () => {
    const { path, vencida, adoptante, adoptar } = await escenario('a')
    const a = psqlAsync(
      `begin; select public.${caso.precheck}('${vencida}'); select pg_sleep(3); commit;`,
    )
    await pausa(1000)
    const b = await psqlAsync(adoptar)
    const ra = await a

    expect(ra.code, ra.err).toBe(0)
    const precheck = JSON.parse(ra.out.split('\n').find((l) => l.startsWith('{')) ?? '{}') as {
      status: string
      token: string | null
      objects: { bucket: string; path: string }[]
    }
    expect(precheck.status).toBe('ok')
    expect(precheck.objects).toEqual([{ bucket: 'payment-proofs', path }])
    // B esperó el candado de A (la intercalación fue real) y luego fue rechazada.
    expect(b.code).not.toBe(0)
    expect(b.err).toContain('retention_pending_delete')
    expect(b.ms).toBeGreaterThan(1500)
    expect(sql(`select evidence_url is null from public.reports where id = '${adoptante}';`)).toBe(
      't',
    )

    // El job borra lo que dijo el precheck y cierra con el token.
    await db.storage.from('payment-proofs').remove(precheck.objects.map((o) => o.path))
    expect(await existe(path)).toBe(false)
    expect(sql(`select public.${caso.finish}('${vencida}', '${precheck.token}');`)).toBe(
      'anonymized',
    )
    expect(sql(`select count(*) from public.retention_storage_marks where path = '${path}';`)).toBe(
      '0',
    )
  })

  it('la adopción gana: el precheck espera, ve la ruta compartida, no marca ni lista nada y la imagen se conserva', async () => {
    const { path, vencida, adoptante, adoptar } = await escenario('b')
    const b = psqlAsync(`begin; ${adoptar} select pg_sleep(3); commit;`)
    await pausa(1000)
    const a = await psqlAsync(`select public.${caso.precheck}('${vencida}');`)
    const rb = await b

    expect(rb.code, rb.err).toBe(0)
    expect(a.code, a.err).toBe(0)
    expect(a.ms).toBeGreaterThan(1500)
    const precheck = JSON.parse(a.out) as {
      status: string
      token: string | null
      objects: unknown[]
    }
    expect(precheck).toEqual({ status: 'ok', token: null, objects: [] })
    expect(sql(`select count(*) from public.retention_storage_marks where path = '${path}';`)).toBe(
      '0',
    )
    // El job no borra nada; el cierre solo suelta la referencia de la fila vencida.
    expect(sql(`select public.${caso.finish}('${vencida}');`)).toBe('anonymized')
    expect(await existe(path)).toBe(true)
    expect(sql(`select evidence_url from public.reports where id = '${adoptante}';`)).toBe(path)
  })

  it('una fila marcada no se reabre mientras se borra su imagen (A bloquea la fila; B espera y es rechazada)', async () => {
    const { path, vencida } = await escenario('c')
    const a = psqlAsync(
      `begin; select public.${caso.precheck}('${vencida}'); select pg_sleep(3); commit;`,
    )
    await pausa(1000)
    const b = await psqlAsync(caso.abrir(vencida))
    const ra = await a
    expect(ra.code, ra.err).toBe(0)
    expect(b.code).not.toBe(0)
    expect(b.err).toContain('retention_pending_delete')
    expect(b.ms).toBeGreaterThan(1500)
    expect(sql(`select count(*) from public.retention_storage_marks where path = '${path}';`)).toBe(
      '1',
    )
  })

  it('con una marca vencida (más de 1 h) la ruta vuelve a poder adoptarse', async () => {
    const { path, vencida, adoptante, adoptar } = await escenario('d')
    sql(`select public.${caso.precheck}('${vencida}');`)
    sql(
      `update public.retention_storage_marks set created_at = now() - interval '2 hours' where path = '${path}';`,
    )
    const r = await psqlAsync(adoptar)
    expect(r.code, r.err).toBe(0)
    expect(sql(`select evidence_url from public.reports where id = '${adoptante}';`)).toBe(path)
  })

  it('sustitución: si la fila cambia su evidencia después del precheck, el cierre responde stale', async () => {
    const { vencida } = await escenario('f')
    const precheck = JSON.parse(sql(`select public.${caso.precheck}('${vencida}');`)) as {
      token: string
    }
    const otra = `retencion-${runId}/carrera-${caso.source}-f-otra.png`
    sql(`update public.${caso.tabla} set evidence_url = '${otra}' where id = '${vencida}';`)
    expect(sql(`select public.${caso.finish}('${vencida}', '${precheck.token}');`)).toBe('stale')
    expect(sql(`select evidence_url from public.${caso.tabla} where id = '${vencida}';`)).toBe(otra)
  })

  it('el cierre con un token que ya no vale responde stale y no anonimiza', async () => {
    const { path, vencida } = await escenario('e')
    const precheck = JSON.parse(sql(`select public.${caso.precheck}('${vencida}');`)) as {
      token: string
      objects: { path: string }[]
    }
    await db.storage.from('payment-proofs').remove(precheck.objects.map((o) => o.path))
    sql(`delete from public.retention_storage_marks where path = '${path}';`)
    expect(sql(`select public.${caso.finish}('${vencida}', '${precheck.token}');`)).toBe('stale')
    expect(
      sql(`select evidence_url is not null from public.${caso.tabla} where id = '${vencida}';`),
    ).toBe('t')
  })
})

/**
 * CAX-002 (Codex R1): el catálogo EFECTIVO de triggers de las tablas de dinero y la prueba de que la
 * huella detecta una alteración (control negativo).
 */
describe('CAX-002 · triggers efectivos y control negativo de la huella del dinero', () => {
  const TABLAS = `'reports','fraud_coverage_claims','cash_settlements','business_charges','customer_incidents'`

  it('los únicos triggers de esas tablas son los conocidos, y los de retención solo leen', () => {
    const triggers = sql(`select c.relname || '.' || t.tgname || '->' || p.proname
        from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
       where not t.tgisinternal and c.relnamespace = 'public'::regnamespace and c.relname in (${TABLAS})
       order by 1;`).split('\n')
    expect(triggers).toEqual([
      'business_charges.trg_business_charges_recalc_balance->recalc_business_balance',
      'cash_settlements.touch_cash_settlements->touch_updated_at',
      'customer_incidents.trg_incident_apply_strike->apply_incident_strike',
      'fraud_coverage_claims.trg_retention_guard_claims_evidence->retention_guard_ref',
      'fraud_coverage_claims.trg_retention_guard_claims_row->retention_guard_row',
      'reports.touch_reports->touch_updated_at',
      'reports.trg_retention_guard_reports_evidence->retention_guard_ref',
      'reports.trg_retention_guard_reports_refund->retention_guard_ref',
      'reports.trg_retention_guard_reports_row->retention_guard_row',
    ])
    // Ningún trigger de retención escribe: sin INSERT/UPDATE/DELETE en el cuerpo de sus funciones.
    expect(
      sql(`select count(*) from pg_proc where pronamespace = 'public'::regnamespace
             and proname in ('retention_guard_ref', 'retention_guard_row')
             and prosrc ~* '\\m(insert\\s+into|update\\s+\\S+\\s+set|delete\\s+from)';`),
    ).toBe('0')
    // Lo que la purga dispara de verdad: touch_updated_at (solo `updated_at`) y, en cargos, el recálculo
    // de `balance_due`, que la purga no toca (no escribe en business_charges).
    expect(
      sql(`select count(*) from pg_proc where proname = 'touch_updated_at'
             and prosrc ~* 'new\\.(?!updated_at)';`),
    ).toBe('0')
  })

  it('control negativo: alterar settlement_date o balance_due cambia la huella', () => {
    const foto = (mutacion: string) =>
      sql(`begin; ${FOTO_SQL} ${mutacion} ${FOTO_SQL} rollback;`)
        .split('\n')
        .filter((l) => /^[0-9a-f]{32}$/.test(l))
    const caja = foto(
      `update public.cash_settlements set settlement_date = settlement_date + 1 where id = '${ids.caja_vencida}';`,
    )
    // 6 líneas por foto: reports, claims, cash_settlements, charges, balance_due, incidents.
    expect(caja[2]).not.toBe(caja[8])
    expect(caja[0]).toBe(caja[6])
    const saldo = foto(
      `update public.businesses set balance_due = balance_due + 1 where id = (select id from public.businesses limit 1);`,
    )
    expect(saldo[4]).not.toBe(saldo[10])
  })
})
