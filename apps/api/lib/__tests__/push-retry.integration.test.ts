/**
 * Migración 0272: el reclamo con plazo, `complete_push_event` y el cron `retry_push_dispatch`.
 * Contra la base LOCAL, por psql dentro del contenedor (como `push-claim.integration.test.ts`).
 *
 * Casi todo corre dentro de una transacción que se revierte: la configuración que se cambia
 * (`push_retry`, `push_dispatch`, `push_claim_since`) y los eventos no llegan a nadie, y el cron
 * real (cada minuto) no los ve. Las horas se fijan con valores relativos a `now()`, que dentro de
 * la transacción es constante.
 *
 * La carrera real (varios reclamos a la vez) NO puede ir en una transacción: ahí sí se confirma
 * un evento y `push_claim_since`, y se devuelven tal cual en un `finally`. Mientras tanto se quita
 * `push_dispatch` para que el trigger no llame a `send-push` y se lleve el evento antes que el test.
 *
 * Los permisos de `anon` y `authenticated` se prueban con `set local role` sobre las funciones.
 */
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type Row, type RowStore, SettingsSnapshot } from './helpers/settings-snapshot'

const CONTAINER = 'supabase_db_zpnipajgwfthxhdtzhly'
const run = promisify(execFile)
const PSQL_ARGS = [
  'exec',
  '-i',
  CONTAINER,
  'psql',
  '-U',
  'postgres',
  '-At',
  '-v',
  'ON_ERROR_STOP=1',
]

/** Ejecuta SQL por stdin (los acentos no se corrompen) y devuelve la salida. */
function psql(sql: string): string {
  return execFileSync('docker', [...PSQL_ARGS, '-f', '-'], { input: sql, encoding: 'utf8' })
}

/** Como `psql`, pero devuelve el error (stderr) en vez de lanzar, para probar los permisos. */
function psqlError(sql: string): string {
  try {
    execFileSync('docker', [...PSQL_ARGS, '-f', '-'], {
      input: sql,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return ''
  } catch (e) {
    return String((e as { stderr?: string }).stderr ?? e)
  }
}

function marca(out: string, tag: string): string {
  const line = out.split('\n').find((l) => l.startsWith(`${tag}|`))
  if (!line) throw new Error(`sin ${tag}: ${out}`)
  return line.slice(tag.length + 1)
}

const id = (n: number) => `00000000-0000-4000-8000-0000000072${String(n).padStart(2, '0')}`

/** Configuración dentro de la transacción. `since` nulo => sin esa clave. */
function config(opts: { since: string | null; url: string | null; retry?: string }): string {
  const retry =
    opts.retry ??
    `jsonb_build_object('maxAttempts', 3, 'ttlMinutes', 15, 'leaseSeconds', 180, 'backoffMinutes', jsonb_build_array(1, 2, 4))` +
      (opts.since ? ` || jsonb_build_object('since', ${opts.since})` : '')
  return `
insert into public.app_settings (key, value) values ('push_retry', ${retry})
  on conflict (key) do update set value = excluded.value;
insert into public.app_settings (key, value)
  values ('push_dispatch', ${opts.url ? `jsonb_build_object('url', '${opts.url}', 'anonKey', 'anon-de-prueba')` : `'{}'::jsonb`})
  on conflict (key) do update set value = excluded.value;
insert into public.app_settings (key, value) values ('push_claim_since', to_jsonb('2020-01-01T00:00:00Z'::text))
  on conflict (key) do update set value = excluded.value;
-- Los eventos pendientes de otras pruebas (la suite entera genera muchos) se dan por terminados
-- DENTRO de la transacción, para que el cron solo vea los de esta prueba. Se revierte al final.
update public.domain_events set push_done_at = now()
  where push_done_at is null and push_dead_at is null and id::text not like '00000000-0000-4000-8000-0000000072%';
-- Un aviso de fallo REAL de las últimas horas haría callar al freno (alertWindowMinutes) y
-- falsearía las pruebas de «nace uno»; se quitan dentro de la transacción, que se revierte.
delete from public.domain_events where event_type = 'PushDeliveryFailed'
  and id::text not like '00000000-0000-4000-8000-0000000072%';
delete from net.http_request_queue;`
}

type Ev = {
  n: number
  type?: string
  /** Segundos desde que ocurrió. */
  ago: number
  attempts?: number
  /** Segundos desde el último reintento. */
  lastAgo?: number
  /** Segundos desde que se reclamó. */
  claimedAgo?: number
  done?: boolean
  dead?: boolean
}

function ev(e: Ev): string {
  return `insert into public.domain_events
  (id, aggregate_type, aggregate_id, event_type, payload, occurred_at,
   push_attempts, push_last_dispatch_at, push_claimed_at, push_done_at, push_dead_at)
values ('${id(e.n)}', 'order', '${id(e.n)}', '${e.type ?? 'OrderCreated'}', '{}',
  now() - interval '${e.ago} seconds', ${e.attempts ?? 0},
  ${e.lastAgo !== undefined ? `now() - interval '${e.lastAgo} seconds'` : 'null'},
  ${e.claimedAgo !== undefined ? `now() - interval '${e.claimedAgo} seconds'` : 'null'},
  ${e.done ? 'now()' : 'null'}, ${e.dead ? 'now()' : 'null'});`
}

const claim = (tag: string, n: number) =>
  `select '${tag}|' || (select count(*) from public.claim_push_event('${id(n)}'));`

describe('claim_push_event · plazo y vida (0272)', () => {
  it('reclamado no se reclama; vencido el plazo, una vez; terminado, perdido o viejo, nunca', () => {
    const out = psql(`
begin;
${config({ since: null, url: null })}
${ev({ n: 1, ago: 10 })}
${ev({ n: 2, ago: 400, claimedAgo: 200 })}
${ev({ n: 3, ago: 400, claimedAgo: 200, done: true })}
${ev({ n: 4, ago: 400, claimedAgo: 200, dead: true })}
${ev({ n: 5, ago: 16 * 60, claimedAgo: 200 })}
${ev({ n: 6, ago: 400, claimedAgo: 60 })}
${claim('A1', 1)}
${claim('A2', 1)}
${claim('B1', 2)}
${claim('B2', 2)}
${claim('C', 3)}
${claim('D', 4)}
${claim('E', 5)}
${claim('F', 6)}
rollback;
`)
    expect(marca(out, 'A1')).toBe('1') // recién creado
    expect(marca(out, 'A2')).toBe('0') // ya reclamado: plazo vigente
    expect(marca(out, 'B1')).toBe('1') // reclamado hace 200 s > 180 s
    expect(marca(out, 'B2')).toBe('0') // y ahora el plazo corre de nuevo
    expect(marca(out, 'C')).toBe('0') // terminado
    expect(marca(out, 'D')).toBe('0') // perdido
    expect(marca(out, 'E')).toBe('0') // más viejo que ttl
    expect(marca(out, 'F')).toBe('0') // reclamado hace 60 s: plazo vigente
  })
})

describe('complete_push_event (0272)', () => {
  it('true sobre un reclamado; false sobre uno sin reclamar y sobre uno ya terminado', () => {
    const out = psql(`
begin;
${config({ since: null, url: null })}
${ev({ n: 1, ago: 10, claimedAgo: 5 })}
${ev({ n: 2, ago: 10 })}
select 'A|' || public.complete_push_event('${id(1)}');
select 'B|' || public.complete_push_event('${id(1)}');
select 'C|' || public.complete_push_event('${id(2)}');
select 'D|' || (push_done_at is not null) from public.domain_events where id = '${id(1)}';
select 'E|' || (push_done_at is null) from public.domain_events where id = '${id(2)}';
select 'F|' || public.complete_push_event(gen_random_uuid());
rollback;
`)
    expect(marca(out, 'A')).toBe('true')
    expect(marca(out, 'B')).toBe('false')
    expect(marca(out, 'C')).toBe('false')
    expect(marca(out, 'D')).toBe('true')
    expect(marca(out, 'E')).toBe('true')
    expect(marca(out, 'F')).toBe('false')
  })
})

describe('retry_push_dispatch · apagado (0272)', () => {
  it('sin since devuelve 0 y no toca push_attempts', () => {
    const out = psql(`
begin;
${config({ since: null, url: 'http://127.0.0.1:9/' })}
${ev({ n: 1, ago: 70 })}
delete from net.http_request_queue; -- los INSERT de arriba ya encolaron por el trigger
select 'N|' || public.retry_push_dispatch();
select 'T|' || push_attempts || '|' || (push_last_dispatch_at is null) || '|' || (push_dead_at is null)
  from public.domain_events where id = '${id(1)}';
select 'Q|' || count(*) from net.http_request_queue;
rollback;
`)
    expect(marca(out, 'N')).toBe('0')
    expect(marca(out, 'T')).toBe('0|true|true')
    expect(marca(out, 'Q')).toBe('0')
  })

  it('con since inválido (no es una fecha) también queda apagado', () => {
    const out = psql(`
begin;
${config({ since: `to_jsonb('mañana'::text)`, url: 'http://127.0.0.1:9/' })}
${ev({ n: 1, ago: 70 })}
delete from net.http_request_queue; -- los INSERT de arriba ya encolaron por el trigger
select 'N|' || public.retry_push_dispatch();
rollback;
`)
    expect(marca(out, 'N')).toBe('0')
  })

  it('con push_dispatch.url nulo devuelve 0 aunque haya since', () => {
    const out = psql(`
begin;
${config({ since: `to_jsonb((now() - interval '5 minutes')::text)`, url: null })}
${ev({ n: 1, ago: 70 })}
delete from net.http_request_queue; -- los INSERT de arriba ya encolaron por el trigger
select 'N|' || public.retry_push_dispatch();
select 'T|' || push_attempts from public.domain_events where id = '${id(1)}';
rollback;
`)
    expect(marca(out, 'N')).toBe('0')
    expect(marca(out, 'T')).toBe('0')
  })
})

describe('retry_push_dispatch · encendido (0272)', () => {
  it('reintenta solo lo que toca, con la espera de su intento', () => {
    const out = psql(`
begin;
${config({ since: `to_jsonb((now() - interval '5 minutes')::text)`, url: 'http://127.0.0.1:9/' })}
${ev({ n: 1, ago: 70 })}
${ev({ n: 2, ago: 30 })}
${ev({ n: 3, ago: 150, attempts: 1, lastAgo: 90 })}
${ev({ n: 4, ago: 200, attempts: 1, lastAgo: 130 })}
${ev({ n: 5, ago: 70, type: 'BusinessBlocked' })}
${ev({ n: 6, ago: 8 * 60 })}
${ev({ n: 7, ago: 70, claimedAgo: 60 })}
delete from net.http_request_queue; -- los INSERT de arriba ya encolaron por el trigger
select 'N|' || public.retry_push_dispatch();
select 'T' || right(id::text, 2) || '|' || push_attempts || '|' || (push_last_dispatch_at is not null)
  from public.domain_events where id::text like '00000000-0000-4000-8000-0000000072%' order by id;
select 'Q|' || count(*) from net.http_request_queue;
select 'W|' || count(*) from public.domain_events where event_type = 'PushDeliveryFailed' and occurred_at >= now();
rollback;
`)
    expect(marca(out, 'N')).toBe('2')
    expect(marca(out, 'T01')).toBe('1|true') // 70 s sin reintento previo: toca (espera 1 min)
    expect(marca(out, 'T02')).toBe('0|false') // 30 s: aún no
    expect(marca(out, 'T03')).toBe('1|true') // intento 1, último hace 90 s: toca esperar 2 min
    expect(marca(out, 'T04')).toBe('2|true') // intento 1, último hace 130 s: ya pasó
    expect(marca(out, 'T05')).toBe('0|false') // auditoría: nunca
    expect(marca(out, 'T06')).toBe('0|false') // anterior a since: nunca
    expect(marca(out, 'T07')).toBe('0|false') // reclamado hace 60 s: plazo vigente
    expect(marca(out, 'Q')).toBe('2')
    expect(marca(out, 'W')).toBe('0')
  })
})

describe('retry_push_dispatch · perdidos (0272)', () => {
  const ENCENDIDO = config({
    since: `to_jsonb((now() - interval '1 hour')::text)`,
    url: 'http://127.0.0.1:9/',
  })
  const FALLOS = `select 'W|' || count(*) || '|' || coalesce(max(payload::text), '') from public.domain_events
    where event_type = 'PushDeliveryFailed' and aggregate_type = 'push_outbox' and occurred_at >= now();`

  it('agotados los intentos: push_dead_at y UN solo PushDeliveryFailed con el conteo', () => {
    const out = psql(`
begin;
${ENCENDIDO}
${ev({ n: 1, ago: 600, attempts: 3, lastAgo: 200 })}
${ev({ n: 2, ago: 600, attempts: 3, lastAgo: 200, type: 'CashDelivered' })}
${ev({ n: 3, ago: 600, attempts: 3, lastAgo: 60 })}
delete from net.http_request_queue; -- los INSERT de arriba ya encolaron por el trigger
select 'N|' || public.retry_push_dispatch();
select 'D' || right(id::text, 2) || '|' || (push_dead_at is not null) from public.domain_events
  where id::text like '00000000-0000-4000-8000-0000000072%' order by id;
${FALLOS}
rollback;
`)
    expect(marca(out, 'N')).toBe('0')
    expect(marca(out, 'D01')).toBe('true')
    expect(marca(out, 'D02')).toBe('true')
    expect(marca(out, 'D03')).toBe('false') // el último reintento aún está en plazo
    const w = marca(out, 'W')
    expect(w.startsWith('1|')).toBe(true)
    const payload = JSON.parse(w.slice(2))
    expect(payload.count).toBe(2)
    expect(payload.eventTypes).toBe('CashDelivered,OrderCreated')
  })

  it('un evento más viejo que ttl se da por perdido', () => {
    const out = psql(`
begin;
${ENCENDIDO}
${ev({ n: 1, ago: 16 * 60 })}
delete from net.http_request_queue; -- los INSERT de arriba ya encolaron por el trigger
select 'N|' || public.retry_push_dispatch();
select 'D|' || (push_dead_at is not null) || '|' || push_attempts from public.domain_events where id = '${id(1)}';
${FALLOS}
rollback;
`)
    expect(marca(out, 'N')).toBe('0')
    expect(marca(out, 'D')).toBe('true|0')
    expect(JSON.parse(marca(out, 'W').slice(2)).count).toBe(1)
  })

  it('si lo único perdido es un PushDeliveryFailed no nace otro', () => {
    const out = psql(`
begin;
${ENCENDIDO}
${ev({ n: 1, ago: 16 * 60, type: 'PushDeliveryFailed' })}
delete from net.http_request_queue; -- los INSERT de arriba ya encolaron por el trigger
select 'N|' || public.retry_push_dispatch();
select 'D|' || (push_dead_at is not null) from public.domain_events where id = '${id(1)}';
${FALLOS}
rollback;
`)
    expect(marca(out, 'D')).toBe('true')
    expect(marca(out, 'W')).toBe('0|')
  })
})

describe('retry_push_dispatch · freno del aviso de fallo, en la base (0272)', () => {
  const ENCENDIDO = config({
    since: `to_jsonb((now() - interval '1 hour')::text)`,
    url: 'http://127.0.0.1:9/',
  })
  const FALLOS = `select 'W|' || count(*) from public.domain_events
    where event_type = 'PushDeliveryFailed' and aggregate_type = 'push_outbox' and occurred_at >= now();`

  it('con un PushDeliveryFailed de hace 5 min, los perdidos se marcan pero NO nace otro aviso', () => {
    const out = psql(`
begin;
${ENCENDIDO}
${ev({ n: 8, ago: 300, type: 'PushDeliveryFailed', done: true })}
${ev({ n: 1, ago: 600, attempts: 3, lastAgo: 200 })}
${ev({ n: 2, ago: 600, attempts: 3, lastAgo: 200 })}
delete from net.http_request_queue;
select 'N|' || public.retry_push_dispatch();
select 'D|' || count(*) from public.domain_events
  where id in ('${id(1)}', '${id(2)}') and push_dead_at is not null;
${FALLOS}
rollback;
`)
    expect(marca(out, 'D')).toBe('2')
    expect(marca(out, 'W')).toBe('0')
  })

  it('con uno de hace 31 min (fuera de la ventana de 30) sí nace uno nuevo', () => {
    const out = psql(`
begin;
${ENCENDIDO}
${ev({ n: 8, ago: 31 * 60, type: 'PushDeliveryFailed', done: true })}
${ev({ n: 1, ago: 600, attempts: 3, lastAgo: 200 })}
delete from net.http_request_queue;
select 'N|' || public.retry_push_dispatch();
select 'D|' || count(*) from public.domain_events where id = '${id(1)}' and push_dead_at is not null;
${FALLOS}
rollback;
`)
    expect(marca(out, 'D')).toBe('1')
    expect(marca(out, 'W')).toBe('1')
  })

  it('alertWindowMinutes manda: con 60 min, uno de hace 31 min aún frena', () => {
    const out = psql(`
begin;
${config({
  since: `to_jsonb((now() - interval '1 hour')::text)`,
  url: 'http://127.0.0.1:9/',
  retry: `jsonb_build_object('alertWindowMinutes', 60, 'since', to_jsonb((now() - interval '1 hour')::text))`,
})}
${ev({ n: 8, ago: 31 * 60, type: 'PushDeliveryFailed', done: true })}
${ev({ n: 1, ago: 600, attempts: 3, lastAgo: 200 })}
delete from net.http_request_queue;
select 'N|' || public.retry_push_dispatch();
${FALLOS}
rollback;
`)
    expect(marca(out, 'W')).toBe('0')
  })
})

describe('permisos (0272)', () => {
  const llamadas = [
    `select public.complete_push_event('${id(1)}')`,
    'select public.retry_push_dispatch()',
    `select public.post_push_dispatch('${id(1)}', 'OrderCreated', '${id(1)}', '{}'::jsonb)`,
    'select * from public.push_retry_settings(false)',
  ]
  for (const rol of ['anon', 'authenticated']) {
    it.each(llamadas)(`${rol} no puede ejecutar: %s`, (llamada) => {
      const err = psqlError(`begin; set local role ${rol}; ${llamada}; rollback;`)
      expect(err).toContain('permission denied for function')
    })
  }
})

describe('push_retry_settings · configuración inválida usa los valores por defecto (0272)', () => {
  const lee = `select 'S|' || max_attempts || '|' || ttl || '|' || lease || '|' || backoff::text || '|' || alert_window from public.push_retry_settings(false);`

  it('valores con forma o rango inválidos caen a los defectos', () => {
    const out = psql(`
begin;
update public.app_settings set value =
  '{"maxAttempts": "tres", "ttlMinutes": 999, "leaseSeconds": 5, "backoffMinutes": []}'::jsonb
  where key = 'push_retry';
${lee}
rollback;
`)
    expect(marca(out, 'S')).toBe('3|00:15:00|00:03:00|{1,2,4}|00:30:00')
  })

  it('valores válidos se respetan, y un backoff con un elemento malo se descarta entero', () => {
    const out = psql(`
begin;
update public.app_settings set value =
  '{"maxAttempts": 5, "ttlMinutes": 20, "leaseSeconds": 60, "backoffMinutes": [1, 3], "alertWindowMinutes": 10}'::jsonb
  where key = 'push_retry';
${lee}
update public.app_settings set value = '{"backoffMinutes": [1, "x", 3]}'::jsonb where key = 'push_retry';
${lee.replace("'S|'", "'T|'")}
rollback;
`)
    expect(marca(out, 'S')).toBe('5|00:20:00|00:01:00|{1,3}|00:10:00')
    expect(marca(out, 'T')).toBe('3|00:15:00|00:03:00|{1,2,4}|00:30:00')
  })

  // CAX-001: un número enorme no desborda el int: se ignora y queda el valor por defecto.
  const ENORMES = `'{"maxAttempts": 2147483648, "ttlMinutes": 99999999999, "leaseSeconds": 1e30, "backoffMinutes": [2147483648], "alertWindowMinutes": 999999}'::jsonb`

  it('valores enormes (2147483648, 99999999999, 1e30, 999999) devuelven los defectos sin error', () => {
    const out = psql(`
begin;
update public.app_settings set value = ${ENORMES} where key = 'push_retry';
${lee}
select 'U|' || ok from public.push_retry_settings(false);
rollback;
`)
    expect(marca(out, 'S')).toBe('3|00:15:00|00:03:00|{1,2,4}|00:30:00')
    expect(marca(out, 'U')).toBe('true')
  })

  it('con valores enormes claim_push_event no falla y el cron sin since devuelve 0', () => {
    const out = psql(`
begin;
${config({ since: null, url: 'http://127.0.0.1:9/', retry: ENORMES })}
${ev({ n: 1, ago: 10 })}
${ev({ n: 2, ago: 70 })}
delete from net.http_request_queue; -- los INSERT de arriba ya encolaron por el trigger
${claim('C', 1)}
select 'N|' || public.retry_push_dispatch();
select 'T|' || push_attempts from public.domain_events where id = '${id(2)}';
select 'Q|' || count(*) from net.http_request_queue;
rollback;
`)
    expect(marca(out, 'C')).toBe('1')
    expect(marca(out, 'N')).toBe('0')
    expect(marca(out, 'T')).toBe('0')
    expect(marca(out, 'Q')).toBe('0')
  })
})

// ── Carreras reales: varias sesiones psql a la vez, sobre estado CONFIRMADO ───────────────────────
// Aquí no hay transacción que revertir (las sesiones tienen que verse entre sí), así que se respalda
// con `SettingsSnapshot` lo que se toca de `app_settings` y el trabajo del cron real se pausa. Todo
// se devuelve en `afterAll`, también si una prueba falla, y se comprueba que `push_dispatch.url`
// quedó igual (CAX-005).
describe('carreras reales (0272)', () => {
  const KEYS = ['push_dispatch', 'push_claim_since', 'push_retry'] as const
  const sqlLit = (v: string) => `$v$${v}$v$`

  const store: RowStore = {
    async read(key) {
      try {
        const out = execFileSync(
          'docker',
          [
            ...PSQL_ARGS,
            '-c',
            `select row_to_json(t)::text from public.app_settings t where key = ${sqlLit(key)};`,
          ],
          { encoding: 'utf8' },
        ).trim()
        return { data: out === '' ? null : (JSON.parse(out) as Row), error: null }
      } catch (e) {
        return { data: null, error: String(e) }
      }
    },
    async remove(key) {
      try {
        psql(`delete from public.app_settings where key = ${sqlLit(key)};`)
        return { error: null }
      } catch (e) {
        return { error: String(e) }
      }
    },
    async write(_key, row) {
      try {
        psql(
          `insert into public.app_settings select * from json_populate_record(null::public.app_settings, ${sqlLit(JSON.stringify(row))}::json);`,
        )
        return { error: null }
      } catch (e) {
        return { error: String(e) }
      }
    },
  }
  const snapshot = new SettingsSnapshot(store, KEYS)
  const urlDeDispatch = () =>
    execFileSync(
      'docker',
      [
        ...PSQL_ARGS,
        '-c',
        `select value->>'url' from public.app_settings where key = 'push_dispatch';`,
      ],
      { encoding: 'utf8' },
    ).trim()
  let urlOriginal: string | null = null
  let cronEstabaActivo: boolean | null = null

  const limpiarEventos = () =>
    psql(`
delete from public.domain_events where id::text like '00000000-0000-4000-8000-0000000072%';
delete from public.domain_events where event_type = 'PushDeliveryFailed'
  and aggregate_id::text like '00000000-0000-4000-8000-0000000072%';`)

  beforeAll(async () => {
    await snapshot.capture()
    urlOriginal = urlDeDispatch()
    // Sin esto el cron real (cada minuto) también tocaría los eventos de la prueba.
    cronEstabaActivo =
      psql(`select active from cron.job where jobname = 'retry-push-dispatch';`).trim() === 't'
    if (cronEstabaActivo) {
      psql(
        `select cron.alter_job((select jobid from cron.job where jobname = 'retry-push-dispatch'), active := false);`,
      )
    }
    psql(`
insert into public.app_settings (key, value) values ('push_claim_since', to_jsonb('2020-01-01T00:00:00Z'::text))
  on conflict (key) do update set value = excluded.value;`)
  })

  afterAll(async () => {
    const problemas: string[] = []
    try {
      limpiarEventos()
    } catch (e) {
      problemas.push(`eventos: ${String(e)}`)
    }
    try {
      if (cronEstabaActivo) {
        psql(
          `select cron.alter_job((select jobid from cron.job where jobname = 'retry-push-dispatch'), active := true);`,
        )
      }
    } catch (e) {
      problemas.push(`cron: ${String(e)}`)
    }
    try {
      await snapshot.restoreAll()
    } catch (e) {
      problemas.push(String(e))
    }
    if (urlOriginal !== null && urlDeDispatch() !== urlOriginal) {
      problemas.push(
        `push_dispatch.url no quedó igual: «${urlDeDispatch()}» en vez de «${urlOriginal}»`,
      )
    }
    if (problemas.length > 0) throw new Error(problemas.join('\n'))
  })

  // Las pruebas de este bloque usan sesiones reales (sin transacción que revertir), así que no pueden dar por
  // terminados los eventos de OTRAS pruebas como hace `config()`. En la CI, los archivos que corren justo antes
  // dejan eventos pendientes dentro de la ventana del cron, y `retry_push_dispatch` los cuenta. Se aíslan igual
  // que en `config()`, pero a mano: se marcan como terminados antes de cada prueba y se restauran después.
  let ajenos: string[] = []
  const aislarAjenos = () => {
    const out = psql(`
with t as (
  update public.domain_events set push_done_at = now()
   where push_done_at is null and push_dead_at is null
     and id::text not like '00000000-0000-4000-8000-0000000072%'
  returning id
) select coalesce(string_agg(id::text, ','), '') from t;`).trim()
    ajenos = out === '' ? [] : out.split(',')
  }
  const restaurarAjenos = () => {
    if (ajenos.length === 0) return
    psql(
      `update public.domain_events set push_done_at = null where id in (${ajenos.map((a) => `'${a}'`).join(',')});`,
    )
    ajenos = []
  }

  beforeEach(() => {
    limpiarEventos()
    aislarAjenos()
    // Sin URL el trigger no llama a nadie al insertar eventos de la prueba.
    psql(`delete from public.app_settings where key = 'push_dispatch';`)
  })

  afterEach(() => {
    restaurarAjenos()
  })

  /** Enciende el cron con una `since` cercana (solo ve eventos de los últimos `desdeSeg` s) y una URL muerta. */
  function armarCron(desdeSeg = 280) {
    psql(`
insert into public.app_settings (key, value) values ('push_retry',
  jsonb_build_object('maxAttempts', 3, 'ttlMinutes', 15, 'leaseSeconds', 180,
    'backoffMinutes', jsonb_build_array(1, 2, 4), 'alertWindowMinutes', 30,
    'since', to_jsonb((now() - interval '${desdeSeg} seconds')::text)))
  on conflict (key) do update set value = excluded.value;
insert into public.app_settings (key, value)
  values ('push_dispatch', jsonb_build_object('url', 'http://127.0.0.1:9/', 'anonKey', 'anon-de-prueba'))
  on conflict (key) do update set value = excluded.value;`)
  }

  const cron = () =>
    run('docker', [...PSQL_ARGS, '-c', 'select public.retry_push_dispatch();']).then((r) => ({
      n: Number(r.stdout.trim()),
      fin: Date.now(),
    }))

  /** Una sesión que ejecuta `sql` y se queda `marca` segundos con la transacción abierta. */
  function sesionQueRetiene(sql: string, marca: string) {
    return run('docker', [...PSQL_ARGS, '-c', `${sql}\nselect pg_sleep(${marca});`]).then(() => ({
      fin: Date.now(),
    }))
  }

  async function esperarDormida(marca: string) {
    for (let i = 0; i < 40; i++) {
      const n = Number(
        psql(
          `select count(*) from pg_stat_activity where state = 'active' and pid <> pg_backend_pid() and query like '%pg_sleep(${marca})%';`,
        ).trim(),
      )
      if (n > 0) return
      await new Promise((r) => setTimeout(r, 150))
    }
    throw new Error(`la sesión que retiene (${marca}) no llegó a dormir`)
  }

  function fila(n: number): { a: number; done: boolean; dead: boolean } {
    const out = psql(
      `select row_to_json(s)::text from (select push_attempts as a, push_done_at is not null as done, push_dead_at is not null as dead from public.domain_events where id = '${id(n)}') s;`,
    ).trim()
    return JSON.parse(out)
  }

  const avisosDeFallo = () =>
    Number(
      psql(
        `select count(*) from public.domain_events where event_type = 'PushDeliveryFailed' and aggregate_id::text like '00000000-0000-4000-8000-0000000072%';`,
      ).trim(),
    )

  it('5 reclamos simultáneos sobre un evento con plazo vencido: exactamente 1 gana', async () => {
    psql(`insert into public.domain_events (id, aggregate_type, aggregate_id, event_type, payload, push_claimed_at)
  values ('${id(50)}', 'order', '${id(50)}', 'OrderCreated', '{}', now() - interval '200 seconds');`)
    const resultados = await Promise.all(
      Array.from({ length: 5 }, () =>
        run('docker', [
          ...PSQL_ARGS,
          '-c',
          `select count(*) from public.claim_push_event('${id(50)}');`,
        ]).then((r) => Number(r.stdout.trim())),
      ),
    )
    expect(resultados.reduce((a, b) => a + b, 0)).toBe(1)
    expect(resultados.filter((n) => n === 1)).toHaveLength(1)
  })

  it('cron/cron con el candado tomado: la otra corrida devuelve 0 y no toca nada', async () => {
    for (const n of [1, 2, 3]) psql(ev({ n, ago: 70 }))
    armarCron()
    const marca = '6.101'
    const retiene = sesionQueRetiene(
      `select pg_advisory_xact_lock(hashtext('tindivo.retry_push_dispatch'));`,
      marca,
    )
    await esperarDormida(marca)
    const durante = await cron()
    expect(durante.n).toBe(0)
    for (const n of [1, 2, 3]) expect(fila(n).a).toBe(0)
    const libre = await retiene
    expect(durante.fin).toBeLessThan(libre.fin) // no esperó al que retenía: salió con 0 de inmediato
    // Soltado el candado, la siguiente corrida sí trabaja.
    const despues = await cron()
    expect(despues.n).toBeGreaterThanOrEqual(3)
    for (const n of [1, 2, 3]) expect(fila(n).a).toBe(1)
  }, 30_000)

  it('cron/cron a la vez (3 rondas): cada evento sube exactamente 1 y a lo sumo una corrida trabaja', async () => {
    for (let ronda = 0; ronda < 3; ronda++) {
      limpiarEventos()
      psql(`delete from public.app_settings where key = 'push_dispatch';`)
      for (const n of [1, 2, 3, 4]) psql(ev({ n, ago: 70 }))
      armarCron()
      const [a, b] = await Promise.all([cron(), cron()])
      expect([a.n, b.n].filter((x) => x > 0).length).toBeLessThanOrEqual(1)
      expect([a.n, b.n].reduce((x, y) => x + y, 0)).toBeGreaterThanOrEqual(4)
      for (const n of [1, 2, 3, 4]) expect(fila(n).a).toBe(1)
    }
  }, 60_000)

  it('cron/reclamo: el evento que se reclama mientras corre el cron no se reintenta', async () => {
    // 61: pendiente de reintento (plazo vencido, 0 intentos). Se reclama dentro de la transacción abierta.
    psql(ev({ n: 61, ago: 250, claimedAgo: 200 }))
    armarCron()
    const marca = '6.102'
    const retiene = sesionQueRetiene(
      `select count(*) from public.claim_push_event('${id(61)}');`,
      marca,
    )
    await esperarDormida(marca)
    const durante = await cron()
    expect(durante.n).toBe(0) // lo saltó (skip locked): nadie más tiene pendientes
    const libre = await retiene
    expect(durante.fin).toBeLessThan(libre.fin) // y no esperó a que el reclamo terminara
    expect(fila(61)).toEqual({ a: 0, done: false, dead: false })
    // Con el reclamo recién hecho (plazo vigente) la siguiente corrida tampoco lo toca.
    expect((await cron()).n).toBe(0)
    expect(fila(61).a).toBe(0)
  }, 30_000)

  it('cron/reclamo: un evento a punto de darse por perdido y reclamado a tiempo NO se pierde', async () => {
    // 62: intentos agotados y último reintento vencido => el cron lo daría por perdido, salvo que se reclame.
    psql(ev({ n: 62, ago: 250, attempts: 3, lastAgo: 200, claimedAgo: 200 }))
    armarCron()
    const marca = '6.103'
    const retiene = sesionQueRetiene(
      `select count(*) from public.claim_push_event('${id(62)}');`,
      marca,
    )
    await esperarDormida(marca)
    const durante = await cron() // espera el candado de fila de la otra sesión y reevalúa con el reclamo nuevo
    await retiene
    expect(durante.n).toBe(0)
    expect(fila(62)).toEqual({ a: 3, done: false, dead: false })
    expect(avisosDeFallo()).toBe(0)
  }, 30_000)

  it('cron/final: el evento que se termina mientras corre el cron no se reintenta', async () => {
    psql(ev({ n: 71, ago: 250, claimedAgo: 200 }))
    armarCron()
    const marca = '6.104'
    const retiene = sesionQueRetiene(`select public.complete_push_event('${id(71)}');`, marca)
    await esperarDormida(marca)
    const durante = await cron()
    const libre = await retiene
    expect(durante.n).toBe(0)
    expect(durante.fin).toBeLessThan(libre.fin)
    expect(fila(71)).toEqual({ a: 0, done: true, dead: false })
    expect((await cron()).n).toBe(0)
    expect(fila(71).a).toBe(0)
  }, 30_000)

  it('cron/final: el evento que se termina mientras el cron iba a darlo por perdido NO se pierde', async () => {
    psql(ev({ n: 72, ago: 250, attempts: 3, lastAgo: 200, claimedAgo: 200 }))
    armarCron()
    const marca = '6.105'
    const retiene = sesionQueRetiene(`select public.complete_push_event('${id(72)}');`, marca)
    await esperarDormida(marca)
    const durante = await cron() // espera la fila, y al reevaluarla ya está terminada
    await retiene
    expect(durante.n).toBe(0)
    expect(fila(72)).toEqual({ a: 3, done: true, dead: false })
    expect(avisosDeFallo()).toBe(0)
  }, 30_000)
})
