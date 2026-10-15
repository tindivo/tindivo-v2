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
