/**
 * Migración 0264: `dispatch_event` manda el `event_id` (sin cabecera secreta) y send-push
 * reclama el evento con `claim_push_event`. Contra la base LOCAL. Todo corre dentro de una
 * transacción que se revierte: el worker de pg_net no ve filas sin confirmar, así que
 * `net.http_request_queue` conserva lo encolado hasta que lo leemos y nada llega a salir.
 */
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const CONTAINER = 'supabase_db_zpnipajgwfthxhdtzhly'

/** Ejecuta SQL en la base local por stdin (los acentos no se corrompen) y devuelve la salida. */
function psql(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8' },
  )
}

const CONFIG = `insert into public.app_settings (key, value)
  values ('push_dispatch', '{"url":"http://host.docker.internal:54321/functions/v1/send-push","anonKey":"anon-de-prueba"}')
  on conflict (key) do update set value = excluded.value;`

/** Fija el corte `push_claim_since` dentro de la transacción (se revierte con el rollback). */
function corte(valor: string): string {
  return `insert into public.app_settings (key, value) values ('push_claim_since', ${valor})
  on conflict (key) do update set value = excluded.value;`
}
const CORTE_PASADO = corte(`to_jsonb('2020-01-01T00:00:00Z'::text)`)

function marca(out: string, tag: string): string {
  const line = out.split('\n').find((l) => l.startsWith(`${tag}|`))
  if (!line) throw new Error(`sin ${tag}: ${out}`)
  return line.slice(tag.length + 1)
}

describe('dispatch_event · cuerpo con event_id y sin secreto (0264)', () => {
  it('encola el event_id junto a los campos de siempre, y SIN cabecera secreta', () => {
    const out = psql(`
begin;
${CONFIG}
delete from net.http_request_queue;
insert into public.domain_events (id, aggregate_type, aggregate_id, event_type, payload)
  values ('00000000-0000-4000-8000-0000000000b1', 'order', '00000000-0000-4000-8000-0000000000b2', 'OrderStatusChanged', '{"toStatus":"accepted"}');
select 'FILA|' || (select row_to_json(q)::text from (
  select url, headers, convert_from(body,'utf8')::jsonb as body,
    (select id from public.domain_events where id = '00000000-0000-4000-8000-0000000000b1') as event_id,
    (select aggregate_id from public.domain_events where id = '00000000-0000-4000-8000-0000000000b1') as aggregate_id
  from net.http_request_queue limit 1) q);
rollback;
`)
    const fila = JSON.parse(marca(out, 'FILA'))
    expect(fila.body.event_id).toBe(fila.event_id)
    expect(fila.body.event_type).toBe('OrderStatusChanged')
    expect(fila.body.aggregate_id).toBe(fila.aggregate_id)
    expect(fila.body.payload).toEqual({ toStatus: 'accepted' })
    // Con la 0238 el cuerpo tenía exactamente esas tres claves: solo se suma event_id.
    expect(Object.keys(fila.body).sort()).toEqual([
      'aggregate_id',
      'event_id',
      'event_type',
      'payload',
    ])
    expect(Object.keys(fila.headers).sort()).toEqual(['Authorization', 'Content-Type'])
    expect(fila.headers.Authorization).toBe('Bearer anon-de-prueba')
  })

  it('un evento fuera de la lista no se despacha (sin cambios respecto a la 0238)', () => {
    const out = psql(`
begin;
${CONFIG}
delete from net.http_request_queue;
insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', gen_random_uuid(), 'CustomerNoShow', '{}');
select 'N|' || count(*) from net.http_request_queue;
rollback;
`)
    expect(marca(out, 'N')).toBe('0')
  })
})

describe('claim_push_event · un solo uso, solo eventos recientes (0264)', () => {
  it('el primer claim devuelve la fila de la base y el segundo, nada', () => {
    const out = psql(`
begin;
${CORTE_PASADO}
insert into public.domain_events (id, aggregate_type, aggregate_id, event_type, payload)
  values ('00000000-0000-4000-8000-0000000000a1','order',gen_random_uuid(),'OrderCreated','{"k":1}');
select 'A|' || (select count(*) from public.claim_push_event('00000000-0000-4000-8000-0000000000a1'));
select 'B|' || (select count(*) from public.claim_push_event('00000000-0000-4000-8000-0000000000a1'));
select 'C|' || (select event_type || ':' || payload::text from public.domain_events where id='00000000-0000-4000-8000-0000000000a1');
select 'D|' || (select count(*) from public.claim_push_event(gen_random_uuid()));
rollback;
`)
    expect(marca(out, 'A')).toBe('1')
    expect(marca(out, 'B')).toBe('0')
    expect(marca(out, 'C')).toBe('OrderCreated:{"k": 1}')
    expect(marca(out, 'D')).toBe('0')
  })

  it('devuelve el tipo, el agregado y el payload de la BASE', () => {
    const out = psql(`
begin;
${CORTE_PASADO}
insert into public.domain_events (id, aggregate_type, aggregate_id, event_type, payload)
  values ('00000000-0000-4000-8000-0000000000a2','order','11111111-1111-4111-8111-111111111111','CashDelivered','{"x":"y"}');
select 'R|' || (select row_to_json(c)::text from public.claim_push_event('00000000-0000-4000-8000-0000000000a2') c);
rollback;
`)
    expect(JSON.parse(marca(out, 'R'))).toEqual({
      event_type: 'CashDelivered',
      aggregate_id: '11111111-1111-4111-8111-111111111111',
      payload: { x: 'y' },
    })
  })

  it('un evento de hace 16 minutos no se reclama', () => {
    const out = psql(`
begin;
${CORTE_PASADO}
insert into public.domain_events (id, aggregate_type, aggregate_id, event_type, payload, occurred_at)
  values ('00000000-0000-4000-8000-0000000000a3','order',gen_random_uuid(),'OrderCreated','{}', now() - interval '16 minutes'),
         ('00000000-0000-4000-8000-0000000000a4','order',gen_random_uuid(),'OrderCreated','{}', now() - interval '14 minutes');
select 'VIEJO|' || (select count(*) from public.claim_push_event('00000000-0000-4000-8000-0000000000a3'));
select 'RECIENTE|' || (select count(*) from public.claim_push_event('00000000-0000-4000-8000-0000000000a4'));
rollback;
`)
    expect(marca(out, 'VIEJO')).toBe('0')
    expect(marca(out, 'RECIENTE')).toBe('1')
  })

  it('anon y authenticated no la ejecutan; service_role sí; y es UNA sola función', () => {
    const out = psql(`
select 'P|' || has_function_privilege('anon','public.claim_push_event(uuid)','execute')
  || ',' || has_function_privilege('authenticated','public.claim_push_event(uuid)','execute')
  || ',' || has_function_privilege('service_role','public.claim_push_event(uuid)','execute');
select 'N|' || count(*) from pg_proc where proname = 'claim_push_event';
select 'D|' || count(*) from pg_proc where proname = 'dispatch_event';
`)
    expect(marca(out, 'P')).toBe('false,false,true')
    expect(marca(out, 'N')).toBe('1')
    expect(marca(out, 'D')).toBe('1')
  })
})

describe('claim_push_event · corte push_claim_since (CAX-001)', () => {
  const EV = (n: number, extra = '') =>
    `insert into public.domain_events (id, aggregate_type, aggregate_id, event_type, payload${extra ? ', occurred_at' : ''})
  values ('00000000-0000-4000-8000-0000000000c${n}','order',gen_random_uuid(),'OrderCreated','{}'${extra ? `, ${extra}` : ''});`
  const CLAIM = (n: number) =>
    `(select count(*) from public.claim_push_event('00000000-0000-4000-8000-0000000000c${n}'))`

  it('sin fila de corte no reclama ni un evento fresco (fallo cerrado)', () => {
    const out = psql(`
begin;
delete from public.app_settings where key = 'push_claim_since';
${EV(1)}
select 'R|' || ${CLAIM(1)};
select 'S|' || (select push_claimed_at is null from public.domain_events where id = '00000000-0000-4000-8000-0000000000c1');
rollback;
`)
    expect(marca(out, 'R')).toBe('0')
    expect(marca(out, 'S')).toBe('true')
  })

  it('un valor nulo, no-cadena o no convertible a fecha tampoco permite reclamar', () => {
    const valores = [
      `'null'::jsonb`,
      `'42'::jsonb`,
      `'{"since":"2020-01-01T00:00:00Z"}'::jsonb`,
      `to_jsonb('mañana'::text)`,
      `to_jsonb('2020-13-45T00:00:00Z'::text)`,
      `to_jsonb('now'::text)`,
      `to_jsonb('-infinity'::text)`,
      `to_jsonb(''::text)`,
    ]
    const sql = valores
      .map(
        (v, i) => `
savepoint sp${i};
${corte(v)}
${EV(2)}
select 'V${i}|' || ${CLAIM(2)};
rollback to savepoint sp${i};`,
      )
      .join(String.fromCharCode(10))
    const out = psql(`begin;
${sql}
rollback;
`)
    valores.forEach((_, i) => {
      expect(marca(out, `V${i}`)).toBe('0')
    })
  })

  it('evento anterior al corte (ya enviado por la función vieja) no se reclama', () => {
    const out = psql(`
begin;
${corte(`to_jsonb(to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))`)}
${EV(3, "now() - interval '1 minute'")}
select 'ANTES|' || ${CLAIM(3)};
select 'MARCA|' || (select push_claimed_at is null from public.domain_events where id = '00000000-0000-4000-8000-0000000000c3');
rollback;
`)
    expect(marca(out, 'ANTES')).toBe('0')
    expect(marca(out, 'MARCA')).toBe('true')
  })

  it('evento posterior al corte se reclama una vez y la segunda no', () => {
    const out = psql(`
begin;
${corte(`to_jsonb(to_char((now() - interval '2 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))`)}
${EV(4, "now() - interval '1 minute'")}
select 'UNO|' || ${CLAIM(4)};
select 'DOS|' || ${CLAIM(4)};
rollback;
`)
    expect(marca(out, 'UNO')).toBe('1')
    expect(marca(out, 'DOS')).toBe('0')
  })

  it('rollback -> versión nueva: mover el corte a now() deja no reclamables los eventos intermedios', () => {
    const out = psql(`
begin;
${corte(`to_jsonb('2020-01-01T00:00:00Z'::text)`)}
${EV(5, "now() - interval '3 minutes'")}
${EV(6, "now() - interval '1 minute'")}
-- la función vieja volvió a estar viva y envió c5 y c6 sin reclamarlos; se vuelve a la nueva
-- y el operador mueve el corte a ahora:
${corte(`to_jsonb(to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))`)}
select 'I5|' || ${CLAIM(5)};
select 'I6|' || ${CLAIM(6)};
rollback;
`)
    expect(marca(out, 'I5')).toBe('0')
    expect(marca(out, 'I6')).toBe('0')
  })

  it('rollback -> retorno (CAX-001): borrar la fila del corte en el rollback deja E no reclamable hasta y después del corte nuevo', () => {
    const NOW_ISO = `to_jsonb(to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))`
    const out = psql(`
begin;
-- 1. Corte vigente T0 (el del primer despliegue de la función nueva).
${corte(`to_jsonb(to_char((now() - interval '10 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))`)}
-- 2. Evento E posterior a T0 que envió la función VIEJA durante el rollback: sin sellar push_claimed_at.
${EV(7, "now() - interval '1 minute'")}
select 'E0|' || (select push_claimed_at is null from public.domain_events where id = '00000000-0000-4000-8000-0000000000c7');
-- 3. Paso 1 del rollback: invalidar el corte.
delete from public.app_settings where key = 'push_claim_since';
select 'FILA|' || (select count(*) from public.app_settings where key = 'push_claim_since');
-- 4. Vuelve la función nueva, ANTES de fijar el corte nuevo: E no se reclama.
select 'E1|' || ${CLAIM(7)};
select 'S1|' || (select push_claimed_at is null from public.domain_events where id = '00000000-0000-4000-8000-0000000000c7');
-- 5. Se fija el corte nuevo a now(): E sigue sin reclamarse.
${corte(NOW_ISO)}
select 'E2|' || ${CLAIM(7)};
select 'S2|' || (select push_claimed_at is null from public.domain_events where id = '00000000-0000-4000-8000-0000000000c7');
-- 6. Un evento F posterior al corte nuevo se reclama una sola vez.
${EV(8, "now() + interval '1 second'")}
select 'F1|' || ${CLAIM(8)};
select 'F2|' || ${CLAIM(8)};
rollback;
`)
    expect(marca(out, 'E0')).toBe('true') // E nace sin sellar (lo envió la vieja)
    expect(marca(out, 'FILA')).toBe('0') // el rollback dejó la base sin fila de corte
    expect(marca(out, 'E1')).toBe('0') // sin fila: fallo cerrado, E no se reclama
    expect(marca(out, 'S1')).toBe('true')
    expect(marca(out, 'E2')).toBe('0') // con el corte nuevo, E (anterior) sigue sin reclamarse
    expect(marca(out, 'S2')).toBe('true')
    expect(marca(out, 'F1')).toBe('1') // F, posterior al corte nuevo, se reclama
    expect(marca(out, 'F2')).toBe('0') // y solo una vez
  })

  it('la fila real de app_settings queda como estaba (los tests no la tocan fuera de transacción)', () => {
    const antes = psql(
      `select coalesce((select value::text from public.app_settings where key='push_claim_since'),'SIN-FILA');`,
    )
    psql(`begin;
${corte(`to_jsonb('2030-01-01T00:00:00Z'::text)`)}
rollback;`)
    const despues = psql(
      `select coalesce((select value::text from public.app_settings where key='push_claim_since'),'SIN-FILA');`,
    )
    expect(despues).toBe(antes)
  })
})
