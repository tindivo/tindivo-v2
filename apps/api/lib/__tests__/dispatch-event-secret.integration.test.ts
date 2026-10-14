/**
 * `dispatch_event` (migración 0264) manda al receptor un secreto de despacho propio,
 * guardado en Supabase Vault, en la cabecera `x-push-dispatch-secret`.
 * Contra la base LOCAL. Todo corre dentro de una transacción que se revierte: el
 * worker de pg_net no ve filas sin confirmar, así que `net.http_request_queue`
 * conserva lo encolado hasta que lo leemos y nada llega a salir ni a quedar.
 */
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'

const CONTAINER = 'supabase_db_zpnipajgwfthxhdtzhly'
const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SECRETO = 'secreto-de-prueba-despacho-xyz'

/** Ejecuta SQL en la base local por stdin (los acentos no se corrompen) y devuelve la salida. */
function psql(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8' },
  )
}

function encolado(conSecreto: boolean): { headers: Record<string, string>; url: string } {
  const out = psql(`
begin;
insert into public.app_settings (key, value)
  values ('push_dispatch', '{"url":"http://host.docker.internal:54321/functions/v1/send-push","anonKey":"anon-de-prueba"}')
  on conflict (key) do update set value = excluded.value;
delete from vault.secrets where name = 'push_dispatch_secret';
${conSecreto ? `select vault.create_secret('${SECRETO}', 'push_dispatch_secret');` : ''}
delete from net.http_request_queue;
insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', gen_random_uuid(), 'OrderStatusChanged', '{"toStatus":"accepted"}');
select 'FILA|' || (select row_to_json(q)::text from (select url, headers from net.http_request_queue limit 1) q);
rollback;
`)
  const line = out.split('\n').find((l) => l.startsWith('FILA|'))
  if (!line) throw new Error(`sin fila encolada: ${out}`)
  return JSON.parse(line.slice(5))
}

describe('dispatch_event · secreto de despacho (0264)', () => {
  it('manda x-push-dispatch-secret con el valor del Vault y conserva la clave anónima', () => {
    const { headers } = encolado(true)
    expect(headers['x-push-dispatch-secret']).toBe(SECRETO)
    expect(headers.Authorization).toBe('Bearer anon-de-prueba')
    expect(headers['Content-Type']).toBe('application/json')
  })

  it('sin secreto en el Vault sigue despachando (compatibilidad), sin la cabecera', () => {
    const { headers } = encolado(false)
    expect(headers['x-push-dispatch-secret']).toBeUndefined()
    expect(headers.Authorization).toBe('Bearer anon-de-prueba')
  })

  it('dispatch_event sigue siendo UNA sola función y ni anon ni authenticated la ejecutan', () => {
    const out = psql(`
select count(*) from pg_proc where proname = 'dispatch_event';
select has_function_privilege('anon','public.dispatch_event()','execute')
    or has_function_privilege('authenticated','public.dispatch_event()','execute');
`).trim()
    expect(out.split('\n')).toEqual(['1', 'f'])
  })

  it('anon y authenticated no ven el secreto: ni el Vault ni app_settings', async () => {
    const out = psql(`
select has_table_privilege('anon','vault.decrypted_secrets','select')
    or has_table_privilege('authenticated','vault.decrypted_secrets','select')
    or has_table_privilege('anon','vault.secrets','select')
    or has_table_privilege('authenticated','vault.secrets','select');
select has_schema_privilege('anon','vault','usage') or has_schema_privilege('authenticated','vault','usage');
`).trim()
    expect(out.split('\n')).toEqual(['f', 'f'])

    // Y por REST: la clave anónima no lee push_dispatch (no está en la whitelist de lectura pública).
    const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
    const sel = await anon.from('app_settings').select('key').eq('key', 'push_dispatch')
    expect(sel.error !== null || (sel.data ?? []).length === 0).toBe(true)
  })
})
