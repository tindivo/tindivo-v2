-- ============================================================================
-- 0286 — el antifraude solo cuenta lo de los últimos 24 meses (decisión de Jesús, 2026-11-12)
-- ============================================================================
-- Completa 0284: los strikes, las filas del directorio de la cajera y las asignaciones de número
-- terminadas que llevan 24 meses sin actividad DEJAN DE CONTAR y se anonimizan o se eliminan.
-- Jesús aceptó que esto cambie a quién se le exige pago adelantado: quien tuvo un strike hace
-- más de 24 meses vuelve a poder pagar contra entrega, y un número que solo era confiable por
-- una fila vieja del directorio deja de serlo.
--
--   · `customer_requires_prepayment` y `customer_contraentrega_decision` (0277) cuentan solo lo
--     que cae dentro de la ventana. Son CREATE OR REPLACE de las de 0277 con ese único cambio.
--   · La purga quita lo que pasa de la ventana, así que `create_customer_order` (regla de
--     validación de la cajera, 0283) y `refresh_customer_profile_risk`, que cuentan strikes sin
--     ventana propia, quedan coherentes con la purga diaria (desfase máximo: un día).
--   · Plazos en `app_settings.data_retention` (meses, hora de Lima, nunca `current_date`):
--     `strikesMonths`, `addressDirectoryMonths`, `phoneAssignmentsMonths`. Si uno falta o es
--     inválido, esa ventana no excluye nada (falla cerrada: se cuenta todo, como antes) y la
--     purga no toca esa tabla.
--   · Strikes: created_at; directorio: lo último entre `last_used_at`, `updated_at` y
--     `created_at`; asignación: `ended_at` (una abierta nunca vence). Las restricciones de
--     número ya vencen en 0284 y solo cuentan las activas.
--   · Sin cambios de importes, estados ni fechas de negocio (invariante 9). Solo `service_role`.
-- ============================================================================

update public.app_settings
set value = value || '{"strikesMonths": 24}'::jsonb
where key = 'data_retention' and not (value ? 'strikesMonths');
update public.app_settings
set value = value || '{"addressDirectoryMonths": 24}'::jsonb
where key = 'data_retention' and not (value ? 'addressDirectoryMonths');
update public.app_settings
set value = value || '{"phoneAssignmentsMonths": 24}'::jsonb
where key = 'data_retention' and not (value ? 'phoneAssignmentsMonths');

-- Inicio de la ventana: lo anterior no cuenta. Sin ventana válida, nada se excluye.
create or replace function public.retention_window_start(p_key text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.retention_cutoff(p_key), '-infinity'::timestamptz);
$$;

revoke execute on function public.retention_window_start(text) from public, anon, authenticated;
grant execute on function public.retention_window_start(text) to service_role;

-- ── Las dos decisiones, ahora con ventana ───────────────────────────────────
create or replace function public.customer_requires_prepayment(
  p_user_id uuid,
  p_phone text,
  p_reference text
) returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_threshold int;
  v_since     timestamptz := public.retention_window_start('strikesMonths');
begin
  -- El riesgo acompaña al número también en los pedidos de la cajera.
  if exists (
    select 1 from public.phone_restrictions r
    where r.phone = regexp_replace(p_phone, '^[+]51', '')
      and r.kind in ('blocked', 'contraentrega_blocked') and r.lifted_at is null
      and (r."until" is null or r."until" > now())
  ) then
    return true;
  end if;
  select coalesce((value ->> 'prepaymentOnlyThreshold')::int, (value ->> 'blockThreshold')::int, 2)
    into v_threshold
  from public.app_settings
  where key = 'strikes';

  v_threshold := coalesce(v_threshold, 2);

  return (
    (p_user_id is not null and exists (
      select 1 from public.customer_profiles cp
      where cp.user_id = p_user_id and cp.contraentrega_blocked = true
    ))
    or (p_user_id is not null and (
      select count(*) from public.customer_strikes s
      where s.customer_user_id = p_user_id and s.created_at >= v_since
    ) >= v_threshold)
    or (p_phone is not null and (
      select count(*) from public.customer_strikes s
      where s.phone = p_phone and s.created_at >= v_since
    ) >= v_threshold)
    or (p_reference is not null and (
      select count(*) from public.customer_strikes s
      where s.delivery_reference = p_reference and s.created_at >= v_since
    ) >= v_threshold)
  );
end;
$$;
revoke execute on function public.customer_requires_prepayment(uuid, text, text) from public, anon, authenticated;
grant execute on function public.customer_requires_prepayment(uuid, text, text) to service_role;

CREATE OR REPLACE FUNCTION public.customer_contraentrega_decision(p_customer_user_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
declare
  v_phone       text;
  v_assign_from timestamptz := public.retention_window_start('phoneAssignmentsMonths');
  v_dir_from    timestamptz := public.retention_window_start('addressDirectoryMonths');
begin
  if p_customer_user_id is null then
    return 'no_history';
  end if;

  -- El teléfono sale del PERFIL VERIFICADO, nunca de un parámetro. Ver 0171.
  select right(regexp_replace(cp.phone, '\D', '', 'g'), 9)
    into v_phone
  from public.customer_profiles cp
  where cp.user_id = p_customer_user_id
    and cp.phone_verified_at is not null;

  if v_phone is not null and v_phone !~ '^9\d{8}$' then
    v_phone := null;
  end if;

  -- EL RIESGO MANDA SOBRE CUALQUIER HISTORIAL, y sobre el GPS también: un
  -- 'risk_blocked' aquí NUNCA se convierte en 'no_history' aguas abajo, así
  -- que el guard de GPS de 0211 jamás lo toca. Ver 0171/0182.
  if public.customer_requires_prepayment(p_customer_user_id, v_phone, null) then
    return 'risk_blocked';
  end if;

  -- Un número con otro dueño solo gana confianza durante la asignación actual. La asignación
  -- ajena cuenta mientras esté abierta o haya terminado dentro de la ventana (0286).
  if v_phone is not null and exists (
    select 1 from public.phone_assignments a
    where a.phone = '+51' || v_phone and a.user_id <> p_customer_user_id
      and (a.ended_at is null or a.ended_at >= v_assign_from)
  ) then
    if exists (
      select 1 from public.phone_assignments a join public.orders o
        on o.customer_user_id = a.user_id and o.customer_phone = v_phone
       and o.status = 'delivered' and o.created_at >= a.started_at
      where a.phone = '+51' || v_phone and a.user_id = p_customer_user_id and a.ended_at is null
    ) then
      return 'trusted';
    end if;
    return 'no_history';
  end if;

  -- (1) Historial de ESTA cuenta.
  if exists (
    select 1 from public.orders o
    where o.customer_user_id = p_customer_user_id
      and o.status = 'delivered'
  ) then
    return 'trusted';
  end if;

  if v_phone is null then
    return 'no_history';
  end if;

  -- (2) Entregas del teléfono en v2 (incluye manuales de la cajera).
  if exists (
    select 1 from public.orders o
    where o.customer_phone = v_phone
      and o.status = 'delivered'
  ) then
    return 'trusted';
  end if;

  -- (3) Fila del directorio para este teléfono con uso dentro de la ventana (0286; 0182: sin
  --     exigir `legacy_address_id`).
  if exists (
    select 1 from public.address_directory ad
    where ad.phone = v_phone
      and greatest(ad.last_used_at, ad.updated_at, ad.created_at) >= v_dir_from
  ) then
    return 'trusted';
  end if;

  return 'no_history';
end $fn$;
revoke execute on function public.customer_contraentrega_decision(uuid) from public, anon, authenticated;
grant execute on function public.customer_contraentrega_decision(uuid) to service_role;

-- ── Purga: lo que pasa de la ventana ────────────────────────────────────────
-- Strikes: se anonimizan (no se borra la fila). `phone` es NOT NULL: queda el marcador
-- 'eliminado' (el de 0278/0284). Ya no casan con ningún número, referencia ni cuenta.
create or replace function public.anonymize_old_customer_strikes(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := public.retention_cutoff('strikesMonths');
  v_n      integer;
begin
  if v_cutoff is null then
    return 0;
  end if;
  update public.customer_strikes s set
    phone = 'eliminado',
    customer_user_id = null,
    delivery_reference = null,
    delivery_coordinates_lat = null,
    delivery_coordinates_lng = null,
    order_id = null
  where s.id in (
    select x.id from public.customer_strikes x
    where x.created_at < v_cutoff
      and (x.phone <> 'eliminado' or x.customer_user_id is not null
           or x.delivery_reference is not null or x.order_id is not null
           or x.delivery_coordinates_lat is not null or x.delivery_coordinates_lng is not null)
    order by x.id
    limit least(greatest(coalesce(p_limit, 500), 1), 1000)
    for update skip locked
  );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.anonymize_old_customer_strikes(integer) from public, anon, authenticated;
grant execute on function public.anonymize_old_customer_strikes(integer) to service_role;

-- Directorio de la cajera: se elimina lo que lleva 24 meses sin uso. `orders.address_directory_id`
-- es ON DELETE SET NULL (0122): ningún pedido se pierde.
create or replace function public.purge_old_address_directory(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := public.retention_cutoff('addressDirectoryMonths');
  v_n      integer;
begin
  if v_cutoff is null then
    return 0;
  end if;
  delete from public.address_directory d
  where d.id in (
    select x.id from public.address_directory x
    where greatest(x.last_used_at, x.updated_at, x.created_at) < v_cutoff
    order by x.id
    limit least(greatest(coalesce(p_limit, 500), 1), 1000)
    for update skip locked
  );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.purge_old_address_directory(integer) from public, anon, authenticated;
grant execute on function public.purge_old_address_directory(integer) to service_role;

-- Asignaciones terminadas hace más de 24 meses: se eliminan junto con los desafíos de traslado
-- que las referencian (FK). Una asignación abierta nunca se toca.
create or replace function public.purge_old_phone_assignments(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz := public.retention_cutoff('phoneAssignmentsMonths');
  v_ids    uuid[];
  v_n      integer;
begin
  if v_cutoff is null then
    return 0;
  end if;
  select coalesce(array_agg(t.id), '{}') into v_ids from (
    select x.id from public.phone_assignments x
    where x.ended_at is not null and x.ended_at < v_cutoff
    order by x.id
    limit least(greatest(coalesce(p_limit, 500), 1), 1000)
    for update skip locked
  ) t;
  if cardinality(v_ids) = 0 then
    return 0;
  end if;
  delete from public.phone_transfer_challenges c
  where c.assignment_id = any (v_ids) or c.result_assignment_id = any (v_ids);
  delete from public.phone_assignments a where a.id = any (v_ids);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.purge_old_phone_assignments(integer) from public, anon, authenticated;
grant execute on function public.purge_old_phone_assignments(integer) to service_role;

do $check_0286$
declare
  v_name   text;
  n        int;
  v_secdef boolean;
  v_cfg    text[];
begin
  foreach v_name in array array[
    'retention_window_start', 'customer_requires_prepayment', 'customer_contraentrega_decision',
    'anonymize_old_customer_strikes', 'purge_old_address_directory', 'purge_old_phone_assignments'
  ] loop
    select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = v_name;
    if n <> 1 then
      raise exception '0286: se esperaba UNA sola % y hay %', v_name, n;
    end if;
    select p.prosecdef, p.proconfig into v_secdef, v_cfg from pg_proc p
      join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = v_name;
    if not v_secdef or v_cfg is distinct from array['search_path=""'] then
      raise exception '0286: % sin SECURITY DEFINER o sin search_path vacío', v_name;
    end if;
    if exists (
      select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
       where s.nspname = 'public' and p.proname = v_name
         and (has_function_privilege('anon', p.oid, 'execute')
           or has_function_privilege('authenticated', p.oid, 'execute')
           or not has_function_privilege('service_role', p.oid, 'execute'))
    ) then
      raise exception '0286: permisos de % incorrectos (solo service_role)', v_name;
    end if;
  end loop;
  if not exists (select 1 from public.app_settings
                  where key = 'data_retention'
                    and value ?& array['strikesMonths', 'addressDirectoryMonths', 'phoneAssignmentsMonths']) then
    raise exception '0286: faltan las ventanas del antifraude en data_retention';
  end if;
end
$check_0286$;
