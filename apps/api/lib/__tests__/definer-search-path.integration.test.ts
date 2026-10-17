/**
 * Migración 0267: invariante 3 (toda función SECURITY DEFINER lleva `SET search_path = ''`).
 *
 * Contra la base LOCAL, por `docker exec psql` (como `push-claim`): PostgREST no lee el catálogo.
 * Todo lo que escribe corre dentro de una transacción que se revierte, así que no deja datos.
 *
 *   1 · BARRIDO. Ninguna función DEFINER de `public` sin `search_path=""`. Una función nueva que
 *       vuelva a nacer con `public` en el search_path pone esto rojo.
 *   2 · IDENTIDAD LÓGICA. El cuerpo vivo de `handle_new_user` y de `create_business_manual_order`
 *       es el de las migraciones 0090 y 0190 (leídas del repo, no copiadas), salvo los prefijos
 *       `public.`.
 *   3 · COMPORTAMIENTO. Un alta en `auth.users` crea su fila en `public.users`, y un pedido manual
 *       sale con el mismo jsonb, la misma fila y los mismos importes con el cuerpo NUEVO que con el
 *       ANTERIOR: dentro de la misma transacción se vuelve a instalar la definición de la 0190
 *       (DDL transaccional), se repite la llamada y se compara. Todo se revierte.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { E2E } from './helpers/local-db'

const CONTAINER = 'supabase_db_zpnipajgwfthxhdtzhly'

/** SQL por stdin (los acentos no se corrompen); corta al primer error. */
function psql(sql: string): string {
  return execFileSync(
    'docker',
    [
      'exec',
      '-i',
      '-e',
      'PGCLIENTENCODING=UTF8',
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
    { input: sql, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  )
}

function marca(out: string, tag: string): string {
  const line = out.split(/\r?\n/).find((l) => l.startsWith(`${tag}|`))
  if (!line) throw new Error(`sin ${tag}: ${out}`)
  return line.slice(tag.length + 1)
}

const migracion = (nombre: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../../supabase/migrations/${nombre}`, import.meta.url)),
    'utf8',
  ).replace(/\r\n/g, '\n')

/** Sin prefijos de esquema añadidos y con los espacios normalizados. */
const normalizar = (s: string) =>
  s
    .replace(/\bpublic\./g, '')
    .replace(/\s+/g, ' ')
    .trim()

const M_0090 = migracion('0090_fix_handle_new_user_trigger.sql')
const M_0190 = migracion('0190_the_cashier_can_fix_what_she_just_typed.sql')

/** Cuerpo de `handle_new_user` tal como lo dejó la 0090 (entre `AS $$` y `$$;`). */
const CUERPO_HNU_0090 = (() => {
  const m = /AS \$\$\n([\s\S]*?)\n\$\$;/.exec(M_0090)
  if (!m) throw new Error('no se encontró el cuerpo de handle_new_user en la 0090')
  return m[1] as string
})()

/** Sentencia completa de `create_business_manual_order` de la 0190 (la definición anterior a la 0267). */
const CREATE_CBMO_0190 = (() => {
  const ini = M_0190.indexOf('CREATE OR REPLACE FUNCTION public.create_business_manual_order(')
  if (ini < 0) throw new Error('no se encontró create_business_manual_order en la 0190')
  const fin = M_0190.indexOf('$function$;', ini)
  if (fin < 0)
    throw new Error('no se encontró el cierre de create_business_manual_order en la 0190')
  return M_0190.slice(ini, fin + '$function$;'.length)
})()
const CUERPO_CBMO_0190 = (() => {
  const m = /AS \$function\$\n([\s\S]*?)\n\$function\$;$/.exec(CREATE_CBMO_0190)
  if (!m) throw new Error('no se pudo extraer el cuerpo de la 0190')
  return m[1] as string
})()

describe('0267 · funciones DEFINER con search_path vacío', () => {
  it('1 · ninguna función SECURITY DEFINER de public queda sin search_path vacío', () => {
    const out = psql(`
select 'MAL|' || p.oid::regprocedure::text || ' ' || coalesce(p.proconfig::text, 'sin proconfig')
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.prosecdef
   and p.prokind in ('f', 'p')
   and not coalesce(p.proconfig @> array['search_path=""'], false)
 order by 1;
select 'TOTAL|' || count(*) from pg_proc p
 where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.prokind in ('f', 'p');
select 'UNA|' || count(*) from pg_proc
 where pronamespace = 'public'::regnamespace and proname in ('handle_new_user', 'create_business_manual_order');
`)
    const malas = out
      .split(/\r?\n/)
      .filter((l) => l.startsWith('MAL|'))
      .map((l) => l.slice(4))
    expect(malas, `DEFINER sin search_path vacío: ${malas.join(' · ')}`).toEqual([])
    expect(Number(marca(out, 'TOTAL'))).toBeGreaterThan(0)
    // Una sola de cada una: la 0267 reemplaza, no crea una sobrecarga.
    expect(Number(marca(out, 'UNA'))).toBe(2)
  })

  it('2 · el cuerpo vivo de handle_new_user es el de la 0090, salvo prefijos', () => {
    const out = psql(`
select 'SEC|' || prosecdef from pg_proc where oid = 'public.handle_new_user()'::regprocedure;
select 'CFG|' || proconfig::text from pg_proc where oid = 'public.handle_new_user()'::regprocedure;
select 'SRC|' || replace(encode(convert_to(prosrc, 'UTF8'), 'base64'), E'
', '')
  from pg_proc where oid = 'public.handle_new_user()'::regprocedure;
`)
    expect(marca(out, 'SEC')).toBe('true')
    expect(marca(out, 'CFG')).toBe('{"search_path=\\"\\""}')
    const vivo = Buffer.from(marca(out, 'SRC').replace(/\s/g, ''), 'base64').toString('utf8')
    expect(normalizar(vivo)).toBe(normalizar(CUERPO_HNU_0090))
  })

  it('2 · el cuerpo vivo de create_business_manual_order es el de la 0190, salvo prefijos', () => {
    const out = psql(`
select 'N|' || count(*) from pg_proc
 where pronamespace = 'public'::regnamespace and proname = 'create_business_manual_order';
select 'SEC|' || prosecdef from pg_proc
 where pronamespace = 'public'::regnamespace and proname = 'create_business_manual_order';
select 'CFG|' || proconfig::text from pg_proc
 where pronamespace = 'public'::regnamespace and proname = 'create_business_manual_order';
select 'ARGS|' || pg_get_function_identity_arguments(oid) from pg_proc
 where pronamespace = 'public'::regnamespace and proname = 'create_business_manual_order';
select 'SRC|' || replace(encode(convert_to(prosrc, 'UTF8'), 'base64'), E'
', '') from pg_proc
 where pronamespace = 'public'::regnamespace and proname = 'create_business_manual_order';
`)
    expect(marca(out, 'N')).toBe('1')
    expect(marca(out, 'SEC')).toBe('true')
    expect(marca(out, 'CFG')).toBe('{"search_path=\\"\\""}')
    // La firma (nombres, tipos y orden) no cambió respecto de la 0190.
    expect(marca(out, 'ARGS')).toBe(
      'p_business_user_id uuid, p_delivery_method delivery_method, p_payment_intent payment_intent, ' +
        'p_total_amount numeric, p_customer_name text, p_customer_phone text, p_prep_time_minutes integer, ' +
        'p_delivery_reference text, p_client_pays_with numeric, p_yape_amount numeric, p_cash_amount numeric, ' +
        'p_delivery_distance_band distance_band, p_address_directory_id uuid',
    )
    const vivo = Buffer.from(marca(out, 'SRC').replace(/\s/g, ''), 'base64').toString('utf8')
    expect(normalizar(vivo)).toBe(normalizar(CUERPO_CBMO_0190))
  })

  it('3 · un alta en auth.users sigue creando su fila en public.users y su rol', () => {
    const out = psql(`
begin;
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
values
  ('c0267000-0000-4000-8000-000000000001', 'sp0267-cliente@example.test', '{}'::jsonb,
   '{"full_name":"Cliente Cero Dos Seis Siete"}'::jsonb),
  ('c0267000-0000-4000-8000-000000000002', 'sp0267-moto@example.test',
   '{"primary_role":"driver"}'::jsonb, '{}'::jsonb),
  ('c0267000-0000-4000-8000-000000000003', 'sp0267-raro@example.test',
   '{"primary_role":"rol-inventado"}'::jsonb, '{}'::jsonb);
select 'U|' || u.email || '|' || u.full_name || '|' || u.primary_role || '|' || u.is_active
  from public.users u where u.id::text like 'c0267000-%' order by u.email;
select 'R|' || r.user_id || '|' || r.role from public.user_roles r
 where r.user_id::text like 'c0267000-%' order by r.user_id;
rollback;
`)
    const us = out.split(/\r?\n/).filter((l) => l.startsWith('U|'))
    expect(us).toEqual([
      'U|sp0267-cliente@example.test|Cliente Cero Dos Seis Siete|customer|true',
      'U|sp0267-moto@example.test|sp0267-moto@example.test|driver|true',
      'U|sp0267-raro@example.test|sp0267-raro@example.test|customer|true',
    ])
    const rs = out.split(/\r?\n/).filter((l) => l.startsWith('R|'))
    expect(rs).toEqual([
      'R|c0267000-0000-4000-8000-000000000001|customer',
      'R|c0267000-0000-4000-8000-000000000002|driver',
      'R|c0267000-0000-4000-8000-000000000003|customer',
    ])
  })

  describe('3 · pedido manual: mismo resultado con el cuerpo nuevo que con el anterior', () => {
    const OWNER = E2E.BUSINESS_USER_ID

    interface Caso {
      nombre: string
      args: string
      /** Lo que debe salir en la fila (importes), medido contra las reglas de la 0190. */
      esperado: Record<string, string | number | null>
    }

    const BASE = `p_business_user_id := '${OWNER}'`
    const DIR_PHONE = '987267001'
    const DIR_REF = 'Esquina del mercado, puerta verde'
    const DIR_ID = 'd0267000-0000-4000-8000-000000000001'

    const casos: Caso[] = [
      {
        nombre: 'efectivo con vuelto',
        args: `${BASE}, p_delivery_method := 'delivery', p_payment_intent := 'pending_cash',
          p_total_amount := 30, p_customer_name := 'Vecino Cero Dos Seis Siete',
          p_customer_phone := '987267002', p_prep_time_minutes := 20,
          p_delivery_reference := 'Porton azul frente al parque', p_client_pays_with := 50`,
        esperado: { order_amount: 28, delivery_fee: 2, change_to_give: 20, client_pays_with: 50 },
      },
      {
        nombre: 'Yape',
        args: `${BASE}, p_delivery_method := 'delivery', p_payment_intent := 'pending_yape',
          p_total_amount := 30, p_customer_phone := '987267003',
          p_delivery_reference := 'Porton azul frente al parque'`,
        esperado: {
          order_amount: 28,
          delivery_fee: 2,
          change_to_give: null,
          client_pays_with: null,
        },
      },
      {
        nombre: 'mixto (Yape + efectivo)',
        args: `${BASE}, p_delivery_method := 'delivery', p_payment_intent := 'pending_mixed',
          p_total_amount := 40, p_customer_phone := '987267004',
          p_delivery_reference := 'Porton azul frente al parque',
          p_client_pays_with := 20, p_yape_amount := 25, p_cash_amount := 15`,
        esperado: { order_amount: 38, delivery_fee: 2, yape_amount: 25, cash_amount: 15 },
      },
      {
        nombre: 'con dirección del directorio',
        args: `${BASE}, p_delivery_method := 'delivery', p_payment_intent := 'pending_cash',
          p_total_amount := 25, p_customer_name := 'Vecino Directorio',
          p_customer_phone := '${DIR_PHONE}', p_delivery_reference := '${DIR_REF}',
          p_client_pays_with := 30, p_delivery_distance_band := 'near',
          p_address_directory_id := '${DIR_ID}'`,
        esperado: { order_amount: 23, delivery_fee: 2, change_to_give: 5 },
      },
    ]

    const FONOS_NO_SEMBRADOS = "'987267002', '987267003', '987267004'"

    const COLUMNAS = `jsonb_build_object(
      'status', o.status, 'source', o.source, 'delivery_method', o.delivery_method,
      'payment_intent', o.payment_intent, 'customer_name', o.customer_name,
      'customer_phone', o.customer_phone, 'delivery_address', o.delivery_address,
      'delivery_reference', o.delivery_reference, 'order_amount', o.order_amount,
      'delivery_fee', o.delivery_fee, 'client_pays_with', o.client_pays_with,
      'yape_amount', o.yape_amount, 'cash_amount', o.cash_amount,
      'change_to_give', o.change_to_give, 'delivery_distance_band', o.delivery_distance_band,
      'delivery_fee_source', o.delivery_fee_source, 'prep_time_minutes', o.prep_time_minutes,
      'address_directory_id', o.address_directory_id,
      'lat', o.delivery_coordinates_lat, 'lng', o.delivery_coordinates_lng)`

    /** Llama a la función viva, lee la fila resultante y emite `<tag>|<jsonb>|<fila>`. */
    const llamar = (tag: string, args: string) => `
select public.create_business_manual_order(${args})::text as jn \\gset
select '${tag}|' || :'jn' || '|' || (select ${COLUMNAS}::text from public.orders o
  where o.id = (:'jn'::jsonb ->> 'id')::uuid);
`

    it('mismos importes, mismo jsonb y misma fila en los cuatro casos', () => {
      const pasos = casos
        .map(
          (c, i) => `
-- ${c.nombre}: cuerpo NUEVO
${llamar(`NEW${i}`, c.args)}`,
        )
        .join('')
      const pasosViejos = casos
        .map(
          (c, i) => `
-- ${c.nombre}: cuerpo ANTERIOR (0190)
${llamar(`OLD${i}`, c.args)}`,
        )
        .join('')

      // Una fila de directorio sembrada dentro de la transacción: ambas llamadas la encuentran.
      const out = psql(`
begin;
insert into public.address_directory (id, phone, customer_name, reference, source, is_default, updated_by)
values ('${DIR_ID}', '${DIR_PHONE}', 'Vecino Directorio', '${DIR_REF}', 'business_created', true, '${OWNER}');
${pasos}
-- Las filas del directorio que creó el cuerpo NUEVO se quitan para que el ANTERIOR parta igual.
update public.orders set address_directory_id = null
 where address_directory_id in (select id from public.address_directory where phone in (${FONOS_NO_SEMBRADOS}));
delete from public.address_directory where phone in (${FONOS_NO_SEMBRADOS});
select 'CFGNEW|' || proconfig::text from pg_proc
 where pronamespace = 'public'::regnamespace and proname = 'create_business_manual_order';
${CREATE_CBMO_0190}
select 'CFGOLD|' || proconfig::text from pg_proc
 where pronamespace = 'public'::regnamespace and proname = 'create_business_manual_order';
${pasosViejos}
rollback;
`)
      expect(marca(out, 'CFGNEW')).toBe('{"search_path=\\"\\""}')
      // Control de que de verdad se comparó contra la definición anterior.
      expect(marca(out, 'CFGOLD')).toBe('{"search_path=public, pg_temp"}')

      const parse = (tag: string) => {
        const [jsonb, fila] = marca(out, tag).split('|')
        return {
          jsonb: JSON.parse(jsonb as string) as Record<string, unknown>,
          fila: JSON.parse(fila as string) as Record<string, unknown>,
        }
      }

      casos.forEach((c, i) => {
        const nuevo = parse(`NEW${i}`)
        const viejo = parse(`OLD${i}`)

        // Lo único que distingue dos pedidos iguales es su identidad.
        for (const r of [nuevo.jsonb, viejo.jsonb]) {
          expect(typeof r.id, c.nombre).toBe('string')
          expect(typeof r.shortId, c.nombre).toBe('string')
          expect(typeof r.orderNumber, c.nombre).toBe('number')
        }
        // La fila del directorio de los tres primeros casos la crea cada cuerpo (id distinto);
        // la del cuarto está sembrada y debe ser la misma.
        const sembrado = i === 3
        const sinIdentidad = (j: Record<string, unknown>, claveDir: string) => {
          const { id, shortId, orderNumber, ...resto } = j
          return sembrado ? resto : { ...resto, [claveDir]: resto[claveDir] ? '<dir>' : null }
        }
        expect(sinIdentidad(nuevo.jsonb, 'addressDirectoryId'), `${c.nombre}: jsonb`).toEqual(
          sinIdentidad(viejo.jsonb, 'addressDirectoryId'),
        )
        expect(sinIdentidad(nuevo.fila, 'address_directory_id'), `${c.nombre}: fila`).toEqual(
          sinIdentidad(viejo.fila, 'address_directory_id'),
        )

        // Y los importes son los que mandan las reglas, no solo «iguales entre sí».
        expect(nuevo.jsonb.status, c.nombre).toBe('preparing')
        for (const [k, v] of Object.entries(c.esperado)) {
          const real = nuevo.fila[k]
          expect(real === null ? null : Number(real), `${c.nombre}: ${k}`).toBe(v)
        }
      })

      // El caso del directorio reutiliza la fila sembrada, no crea otra.
      expect(parse('NEW3').jsonb.addressDirectoryId).toBe(DIR_ID)
      expect(parse('NEW3').jsonb.addressCreated).toBe(false)
    })
  })
})
