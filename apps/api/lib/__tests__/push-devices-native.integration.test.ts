/**
 * MV7b, migración 0270. Contra la base LOCAL.
 *
 *  · prune_push_devices   borra lo vencido y nada más; sin clave válida no borra nada; permisos.
 *  · cron                 el job `prune-push-devices` existe, diario, fuera de horario (09:00 UTC = 04:00 Lima).
 *  · push_delivery_log    `channel` solo admite web/apns/fcm; borrar el dispositivo deja `device_id` en null.
 *  · selección de envío   la consulta de send-push (misma cadena y filtro `nativeDeviceFilter`) devuelve solo los
 *                         dispositivos de la app del aviso, activos y con avisos permitidos.
 *
 *  · record_native_push_result  anota el resultado de UN envío solo si el dispositivo conserva el token enviado
 *                         (rotación), suma atómicamente los fallos simultáneos y no la ejecutan anon/authenticated.
 *
 * La poda corre en una transacción que se revierte (nada persiste); la selección usa un usuario propio que
 * `afterAll` borra.
 */
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { afterAll, describe, expect, it } from 'vitest'
import { nativeDeviceFilter } from '../../../../supabase/functions/send-push/native.ts'
import { localClient as db } from './helpers/local-db'

const CONTAINER = 'supabase_db_zpnipajgwfthxhdtzhly'

function psql(sql: string): string {
  return execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1', '-f', '-'],
    { input: sql, encoding: 'utf8' },
  ).trim()
}

function marca(out: string, tag: string): string {
  const line = out.split('\n').find((l) => l.startsWith(`${tag}|`))
  if (!line) throw new Error(`sin ${tag}: ${out}`)
  return line.slice(tag.length + 1)
}

const U = '00000000-0000-4000-8000-0000000070a1'
const dev = (n: number) => `00000000-0000-4000-8000-00000000d${String(n).padStart(3, '0')}`

/** Fixture dentro de la transacción: un usuario y siete dispositivos con edades distintas. */
const FIXTURE = `
insert into auth.users (id, email) values ('${U}', 'prune-mv7b@integration.local');
insert into public.push_devices (id, user_id, install_id, platform, app, token, app_version, notifications_enabled, disabled_at, last_seen_at) values
 ('${dev(1)}','${U}','install-0001','ios','customer','${'1'.repeat(40)}','1.0',true, now() - interval '31 days', now()),
 ('${dev(2)}','${U}','install-0002','ios','customer','${'2'.repeat(40)}','1.0',true, now() - interval '29 days', now()),
 ('${dev(3)}','${U}','install-0003','android','customer','${'3'.repeat(40)}','1.0',true, null, now() - interval '181 days'),
 ('${dev(4)}','${U}','install-0004','android','customer','${'4'.repeat(40)}','1.0',true, null, now() - interval '179 days'),
 ('${dev(5)}','${U}','install-0005','ios','motorizados','${'5'.repeat(40)}','1.0',true, null, now()),
 ('${dev(6)}','${U}','install-0006','ios','customer','${'6'.repeat(40)}','1.0',true, now(), now()),
 ('${dev(7)}','${U}','install-0007','android','customer','${'7'.repeat(40)}','1.0',true, null, now() - interval '1 days');
`
const SET = (v: string) =>
  `insert into public.app_settings (key, value) values ('push_devices_retention', '${v}'::jsonb)
   on conflict (key) do update set value = excluded.value;`

const restantes = `select 'REST|' || coalesce(string_agg(right(id::text, 3), ',' order by id), '') from public.push_devices where user_id = '${U}';`

describe('prune_push_devices (0270, OPS-2)', () => {
  it('con los plazos decididos borra los desactivados viejos y los abandonados, y nada más', () => {
    const out = psql(`begin;
${FIXTURE}
${SET('{"disabledDays": 30, "staleDays": 180}')}
select 'N|' || public.prune_push_devices();
${restantes}
rollback;`)
    // Se van: 1 (desactivado hace 31 d) y 3 (visto hace 181 d). Se quedan 2, 4, 5, 6 y 7.
    expect(marca(out, 'N')).toBe('2')
    expect(marca(out, 'REST')).toBe('002,004,005,006,007')
  })

  it('la clave de la migración trae los plazos decididos', () => {
    const v = psql(
      `select 'V|' || value::text from public.app_settings where key = 'push_devices_retention';`,
    )
    expect(JSON.parse(marca(v, 'V'))).toEqual({ disabledDays: 30, staleDays: 180 })
  })

  it('sin la clave no borra nada', () => {
    const out = psql(`begin;
${FIXTURE}
delete from public.app_settings where key = 'push_devices_retention';
select 'N|' || public.prune_push_devices();
${restantes}
rollback;`)
    expect(marca(out, 'N')).toBe('0')
    expect(marca(out, 'REST').split(',')).toHaveLength(7)
  })

  it.each([
    ['falta staleDays', '{"disabledDays": 30}'],
    ['falta disabledDays', '{"staleDays": 180}'],
    ['texto', '{"disabledDays": "30", "staleDays": 180}'],
    ['cero', '{"disabledDays": 0, "staleDays": 180}'],
    ['negativo', '{"disabledDays": 30, "staleDays": -1}'],
    ['decimal', '{"disabledDays": 30.5, "staleDays": 180}'],
    ['demasiado grande', '{"disabledDays": 30, "staleDays": 99999}'],
    ['nulo', 'null'],
    ['no es un objeto', '30'],
  ])('un valor inválido (%s) no borra nada', (_caso, valor) => {
    const out = psql(`begin;
${FIXTURE}
${SET(valor)}
select 'N|' || public.prune_push_devices();
${restantes}
rollback;`)
    expect(marca(out, 'N')).toBe('0')
    expect(marca(out, 'REST').split(',')).toHaveLength(7)
  })

  it('solo service_role y postgres la ejecutan; DEFINER con search_path vacío; una sola función', () => {
    const out = psql(`select 'P|' || json_build_object(
      'n', (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname='public' and p.proname='prune_push_devices'),
      'anon', has_function_privilege('anon', 'public.prune_push_devices()', 'execute'),
      'auth', has_function_privilege('authenticated', 'public.prune_push_devices()', 'execute'),
      'service', has_function_privilege('service_role', 'public.prune_push_devices()', 'execute'),
      'secdef', (select prosecdef from pg_proc where proname='prune_push_devices'),
      'cfg', (select to_json(proconfig) from pg_proc where proname='prune_push_devices'));`)
    expect(JSON.parse(marca(out, 'P'))).toEqual({
      n: 1,
      anon: false,
      auth: false,
      service: true,
      secdef: true,
      cfg: ['search_path=""'],
    })
  })

  it('el job de pg_cron es diario a las 09:00 UTC (04:00 en Lima) y llama a la función', () => {
    const out = psql(`select 'J|' || json_build_object('schedule', schedule, 'command', command)
      from cron.job where jobname = 'prune-push-devices';`)
    const job = JSON.parse(marca(out, 'J')) as { schedule: string; command: string }
    expect(job.schedule).toBe('0 9 * * *')
    expect(job.command).toContain('public.prune_push_devices()')
  })
})

describe('push_delivery_log · canal y dispositivo (0270)', () => {
  it('channel solo admite web, apns y fcm, y vale web por defecto', () => {
    const out = psql(`begin;
insert into public.push_delivery_log (id, event_type, status) values ('00000000-0000-4000-8000-0000000070b1','X','ok');
select 'D|' || channel from public.push_delivery_log where id = '00000000-0000-4000-8000-0000000070b1';
rollback;`)
    expect(marca(out, 'D')).toBe('web')
    expect(() =>
      psql(`begin;
insert into public.push_delivery_log (event_type, status, channel) values ('X','ok','sms');
rollback;`),
    ).toThrow()
  })

  it('al borrar el dispositivo la fila de la bitácora queda con device_id nulo', () => {
    const out = psql(`begin;
${FIXTURE}
insert into public.push_delivery_log (id, event_type, status, channel, device_id)
  values ('00000000-0000-4000-8000-0000000070b2','X','error','apns','${dev(1)}');
delete from public.push_devices where id = '${dev(1)}';
select 'L|' || coalesce(device_id::text, 'null') || ',' || channel from public.push_delivery_log where id = '00000000-0000-4000-8000-0000000070b2';
rollback;`)
    expect(marca(out, 'L')).toBe('null,apns')
  })
})

// Solo importa la forma del filtro (qué plataformas hay), no las claves: el cast queda confinado aquí (TS-2).
const BOTH = {
  fcm: {} as never,
  apns: {
    topics: { customer: 'com.tindivo.customer', motorizados: 'com.tindivo.driver' },
  } as never,
}

describe('send-push · qué dispositivos se leen para un aviso', () => {
  const userIds: string[] = []
  afterAll(async () => {
    for (const id of userIds.splice(0)) {
      await db.from('push_devices').delete().eq('user_id', id)
      await db.auth.admin.deleteUser(id)
    }
  })

  it('un usuario con dos roles solo recibe en la app del aviso; excluye desactivados y sin permiso', async () => {
    const { data, error } = await db.auth.admin.createUser({
      email: `native-sel-${Math.random().toString(36).slice(2, 8)}@integration.local`,
      password: 'test-password-12345',
      email_confirm: true,
    })
    if (error) throw new Error(error.message)
    const uid = data.user.id
    userIds.push(uid)
    const tok = (n: string) => `${n}-${crypto.randomUUID()}`
    const { error: insErr } = await db.from('push_devices').insert([
      {
        user_id: uid,
        install_id: tok('i1'),
        platform: 'ios',
        app: 'customer',
        token: tok('t'.repeat(32)),
        app_version: '1',
        notifications_enabled: true,
      },
      {
        user_id: uid,
        install_id: tok('i2'),
        platform: 'android',
        app: 'motorizados',
        token: tok('u'.repeat(32)),
        app_version: '1',
        notifications_enabled: true,
      },
      {
        user_id: uid,
        install_id: tok('i3'),
        platform: 'ios',
        app: 'customer',
        token: tok('v'.repeat(32)),
        app_version: '1',
        notifications_enabled: false,
      },
      {
        user_id: uid,
        install_id: tok('i4'),
        platform: 'ios',
        app: 'customer',
        token: tok('w'.repeat(32)),
        app_version: '1',
        notifications_enabled: true,
        disabled_at: new Date().toISOString(),
      },
    ])
    if (insErr) throw new Error(insErr.message)

    const filter = nativeDeviceFilter({ userId: uid, app: 'customer' }, BOTH)
    if (!filter) throw new Error('filtro nulo')

    // La misma cadena que usa deliverNative en send-push/index.ts.
    const { data: devices, error: qErr } = await db
      .from('push_devices')
      .select('id,platform,app')
      .eq('user_id', filter.userId)
      .eq('app', filter.app)
      .is('disabled_at', null)
      .eq('notifications_enabled', true)
      .in('platform', filter.platforms)
    expect(qErr).toBeNull()
    expect(devices).toHaveLength(1)
    expect(devices?.[0]).toMatchObject({ platform: 'ios', app: 'customer' })

    const moto = nativeDeviceFilter({ userId: uid, app: 'motorizados' }, BOTH)
    const { data: d2 } = await db
      .from('push_devices')
      .select('platform,app')
      .eq('user_id', uid)
      .eq('app', moto?.app ?? 'x')
      .is('disabled_at', null)
      .eq('notifications_enabled', true)
      .in('platform', moto?.platforms ?? [])
    expect(d2).toEqual([{ platform: 'android', app: 'motorizados' }])
  })
})

// ── record_native_push_result (0270, CAX-001 y CAX-003) ─────────────────────

const LOCAL_URL = 'http://127.0.0.1:54321'
const LOCAL_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const CLAVE = 'test-password-12345'

describe('record_native_push_result (0270)', () => {
  const userIds: string[] = []
  afterAll(async () => {
    for (const id of userIds.splice(0)) {
      await db.from('push_devices').delete().eq('user_id', id)
      await db.auth.admin.deleteUser(id)
    }
  })

  const unico = (p: string) => `${p}-${crypto.randomUUID()}`

  async function crearUsuario(): Promise<{ id: string; email: string }> {
    const email = `native-rec-${Math.random().toString(36).slice(2, 10)}@integration.local`
    const { data, error } = await db.auth.admin.createUser({
      email,
      password: CLAVE,
      email_confirm: true,
    })
    if (error) throw new Error(error.message)
    userIds.push(data.user.id)
    return { id: data.user.id, email }
  }

  async function registrar(userId: string, installId: string, token: string): Promise<string> {
    const { error } = await db.rpc('register_push_device', {
      p_actor_user_id: userId,
      p_install_id: installId,
      p_platform: 'android',
      p_app: 'customer',
      p_token: token,
      p_environment: 'production',
      p_app_version: '1.0.0',
      p_os_version: null,
      p_device_model: null,
      p_locale: null,
      p_timezone: null,
      p_notifications_enabled: true,
    })
    if (error) throw new Error(`register_push_device: ${error.message}`)
    const { data, error: qErr } = await db
      .from('push_devices')
      .select('id')
      .eq('install_id', installId)
      .single()
    if (qErr) throw new Error(qErr.message)
    return data.id
  }

  async function estado(id: string) {
    const { data, error } = await db
      .from('push_devices')
      .select('failure_count,last_successful_at,last_failed_at,disabled_at,disabled_reason')
      .eq('id', id)
      .single()
    if (error) throw new Error(error.message)
    return data
  }

  const registro = (id: string, token: string, outcome: string, reason = '') =>
    db.rpc('record_native_push_result', {
      p_device_id: id,
      p_token: token,
      p_outcome: outcome,
      p_reason: reason,
    })

  it('tras una rotación, la respuesta del token viejo no toca al dispositivo con el token nuevo', async () => {
    const { id: uid } = await crearUsuario()
    const install = unico('inst')
    const tokenA = unico('tokA')
    const tokenB = unico('tokB')
    const devId = await registrar(uid, install, tokenA)
    const idB = await registrar(uid, install, tokenB)
    expect(idB).toBe(devId) // misma instalación: misma fila, token nuevo

    const antes = await estado(devId)
    const viejo = await registro(devId, tokenA, 'invalid_token', 'UNREGISTERED')
    expect(viejo.error).toBeNull()
    expect(viejo.data).toBe(false)
    expect(await estado(devId)).toEqual(antes)
    expect(antes.disabled_at).toBeNull()

    const nuevo = await registro(devId, tokenB, 'failed', 'http_500')
    expect(nuevo.data).toBe(true)
    expect((await estado(devId)).failure_count).toBe((antes.failure_count ?? 0) + 1)
  })

  it('dos fallos simultáneos suman dos (el incremento es de la base)', async () => {
    const { id: uid } = await crearUsuario()
    const token = unico('tokC')
    const devId = await registrar(uid, unico('inst'), token)
    const { error: uErr } = await db
      .from('push_devices')
      .update({ failure_count: 3 })
      .eq('id', devId)
    expect(uErr).toBeNull()

    const [r1, r2] = await Promise.all([
      registro(devId, token, 'failed', 'http_503'),
      registro(devId, token, 'failed', 'timeout'),
    ])
    expect(r1.data).toBe(true)
    expect(r2.data).toBe(true)
    const e = await estado(devId)
    expect(e.failure_count).toBe(5)
    expect(e.last_failed_at).not.toBeNull()
  })

  it('ok pone failure_count en 0 y last_successful_at', async () => {
    const { id: uid } = await crearUsuario()
    const token = unico('tokD')
    const devId = await registrar(uid, unico('inst'), token)
    await db.from('push_devices').update({ failure_count: 4 }).eq('id', devId)
    const r = await registro(devId, token, 'ok')
    expect(r.data).toBe(true)
    const e = await estado(devId)
    expect(e.failure_count).toBe(0)
    expect(e.last_successful_at).not.toBeNull()
    expect(e.disabled_at).toBeNull()
  })

  it('invalid_token desactiva y una segunda llamada no cambia disabled_at', async () => {
    const { id: uid } = await crearUsuario()
    const token = unico('tokE')
    const devId = await registrar(uid, unico('inst'), token)
    expect((await registro(devId, token, 'invalid_token', 'UNREGISTERED')).data).toBe(true)
    const primero = await estado(devId)
    expect(primero.disabled_at).not.toBeNull()
    expect(primero.disabled_reason).toBe('UNREGISTERED')
    expect((await registro(devId, token, 'invalid_token', 'BadDeviceToken')).data).toBe(true)
    const segundo = await estado(devId)
    expect(segundo.disabled_at).toBe(primero.disabled_at)
    expect(segundo.disabled_reason).toBe('UNREGISTERED')
  })

  it('un resultado desconocido se rechaza y no toca nada', async () => {
    const { id: uid } = await crearUsuario()
    const token = unico('tokF')
    const devId = await registrar(uid, unico('inst'), token)
    const antes = await estado(devId)
    const r = await registro(devId, token, 'otro')
    expect(r.error?.code).toBe('22023')
    expect(await estado(devId)).toEqual(antes)
  })

  it('anon y authenticated reciben 42501', async () => {
    const { id: uid, email } = await crearUsuario()
    const token = unico('tokG')
    const devId = await registrar(uid, unico('inst'), token)
    const args = { p_device_id: devId, p_token: token, p_outcome: 'invalid_token', p_reason: 'X' }

    const anon = createClient(LOCAL_URL, LOCAL_ANON_KEY, { auth: { persistSession: false } })
    expect((await anon.rpc('record_native_push_result', args)).error?.code).toBe('42501')

    const autenticado = createClient(LOCAL_URL, LOCAL_ANON_KEY, {
      auth: { persistSession: false },
    })
    const { error: sErr } = await autenticado.auth.signInWithPassword({ email, password: CLAVE })
    if (sErr) throw new Error(sErr.message)
    expect((await autenticado.rpc('record_native_push_result', args)).error?.code).toBe('42501')

    expect((await estado(devId)).disabled_at).toBeNull()
  })
})
