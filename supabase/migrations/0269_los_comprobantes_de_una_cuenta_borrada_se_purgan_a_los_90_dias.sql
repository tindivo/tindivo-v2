-- ============================================================================
-- 0269 — los comprobantes de una cuenta borrada se purgan a los 90 días (D-44, OPS-2)
-- ============================================================================
--
-- La 0259 anonimiza la cuenta pero CONSERVA `orders.comprobante_prepago_url` y los archivos
-- de Storage sin límite. D-44 («comprobantes 90 días») fija el plazo: pasados 90 días desde
-- `users.deleted_at`, se borran los archivos del cliente y se quitan las referencias.
--
-- Reparto del trabajo (los archivos NO se borran por SQL: borrar filas de `storage.objects`
-- deja el archivo en el disco; el borrado va por la API de Storage con service-role):
--   1. `list_proof_purge_due(p_limit)`     cuentas borradas vencidas y sin purgar.
--   2. `list_user_proof_objects(p_user)`   sus objetos en `payment-proofs` y `receipts`
--                                          (primera carpeta = id del usuario, 0258).
--   3. (API de Storage)                    el caso de uso de `packages/backend` los borra.
--   4. `finish_proof_purge(p_user)`        SOLO si ya no queda ningún objeto: pone a NULL
--                                          las referencias y marca `users.proofs_purged_at`.
--
-- REFERENCIAS que se anulan (importe, estado y `business_charges` no se tocan):
--   · `orders.comprobante_prepago_url` de los pedidos del cliente.
--   · `reports.evidence_url` cuando apunta a su carpeta: `create_appeal_report` lo copia de
--     `comprobante_prepago_url` (0262/0266), así que es la misma ruta de `payment-proofs`.
--     `reports.refund_proof_path` NO se toca: es el comprobante de devolución que sube el
--     negocio o la administración, no un archivo del cliente.
--
-- `orders_proof_immutable` impedía poner a NULL un comprobante ya registrado. Se redefine
-- con UNA excepción: poner a NULL el comprobante de un pedido de la cuenta cuyo id está en
-- `tindivo.deleting_account` (el mismo bypass de transacción de la 0259, solo ese usuario y
-- solo durante su transacción). Cambiarlo a otro valor sigue prohibido.
--
-- Parámetro operativo en `app_settings.account_deletion` = {"proofRetentionDays": 90}
-- (invariante 10). Si la clave falta o no es un entero ≥ 1, no se purga nada (falla cerrada).
--
-- Las tres funciones: SECURITY DEFINER, search_path vacío, solo `service_role` (DB-3, DB-4).
-- Rollback: supabase/rollbacks/0269_los_comprobantes_de_una_cuenta_borrada_se_purgan_a_los_90_dias.rollback.sql
-- ============================================================================

alter table public.users add column if not exists proofs_purged_at timestamptz;

insert into public.app_settings (key, value)
values ('account_deletion', '{"proofRetentionDays": 90}'::jsonb)
on conflict (key) do nothing;

-- ── orders_proof_immutable: la única salida nueva es la purga ───────────────
create or replace function public.orders_proof_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.comprobante_prepago_url is not null
     and new.comprobante_prepago_url is distinct from old.comprobante_prepago_url
     and new.proof_attempt <= old.proof_attempt
     and not (
       new.comprobante_prepago_url is null
       and coalesce(
         current_setting('tindivo.deleting_account', true) = old.customer_user_id::text,
         false
       )
     ) then
    raise exception 'El comprobante registrado no se puede cambiar'
      using errcode = 'P0001', hint = 'proof_immutable';
  end if;
  return new;
end;
$$;

-- ── list_proof_purge_due ────────────────────────────────────────────────────
create or replace function public.list_proof_purge_due(p_limit integer)
returns table (user_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_raw  jsonb;
  v_days integer;
begin
  select s.value -> 'proofRetentionDays' into v_raw
  from public.app_settings s
  where s.key = 'account_deletion';

  -- Falla cerrada: sin un entero entre 1 y 36500, no hay nada vencido.
  if v_raw is null or jsonb_typeof(v_raw) <> 'number' then
    return;
  end if;
  if (v_raw #>> '{}')::numeric <> trunc((v_raw #>> '{}')::numeric)
     or (v_raw #>> '{}')::numeric < 1
     or (v_raw #>> '{}')::numeric > 36500 then
    return;
  end if;
  v_days := (v_raw #>> '{}')::integer;

  return query
  select u.id
  from public.users u
  where u.deleted_at is not null
    and u.proofs_purged_at is null
    and u.deleted_at <= now() - make_interval(days => v_days)
  order by u.deleted_at, u.id
  limit least(greatest(coalesce(p_limit, 100), 1), 100);
end;
$$;

revoke execute on function public.list_proof_purge_due(integer)
  from public, anon, authenticated;
grant execute on function public.list_proof_purge_due(integer) to service_role;

-- ── list_user_proof_objects ─────────────────────────────────────────────────
create or replace function public.list_user_proof_objects(p_user_id uuid)
returns table (bucket_id text, name text)
language sql
security definer
set search_path = ''
stable
as $$
  select o.bucket_id, o.name
  from storage.objects o
  join public.users u on u.id = p_user_id and u.deleted_at is not null
  where o.bucket_id in ('payment-proofs', 'receipts')
    and (storage.foldername(o.name))[1] = p_user_id::text
  order by o.bucket_id, o.name;
$$;

revoke execute on function public.list_user_proof_objects(uuid)
  from public, anon, authenticated;
grant execute on function public.list_user_proof_objects(uuid) to service_role;

-- ── finish_proof_purge ──────────────────────────────────────────────────────
create or replace function public.finish_proof_purge(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user    public.users%rowtype;
  v_raw     jsonb;
  v_days    integer;
  v_orders  integer;
  v_reports integer;
begin
  select * into v_user from public.users where id = p_user_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'user_not_found';
  end if;

  if v_user.proofs_purged_at is not null then
    return jsonb_build_object('status', 'already_purged', 'orders', 0, 'reports', 0);
  end if;

  select s.value -> 'proofRetentionDays' into v_raw
  from public.app_settings s
  where s.key = 'account_deletion';
  if v_raw is null or jsonb_typeof(v_raw) <> 'number'
     or (v_raw #>> '{}')::numeric <> trunc((v_raw #>> '{}')::numeric)
     or (v_raw #>> '{}')::numeric < 1
     or (v_raw #>> '{}')::numeric > 36500 then
    raise exception using errcode = 'P0001', message = 'not_due';
  end if;
  v_days := (v_raw #>> '{}')::integer;

  if v_user.deleted_at is null
     or v_user.deleted_at > now() - make_interval(days => v_days) then
    raise exception using errcode = 'P0001', message = 'not_due';
  end if;

  if exists (
    select 1 from storage.objects o
    where o.bucket_id in ('payment-proofs', 'receipts')
      and (storage.foldername(o.name))[1] = p_user_id::text
  ) then
    raise exception using errcode = 'P0001', message = 'proof_objects_remain';
  end if;

  -- El guard de `reject_deleted_account` y `orders_proof_immutable` dejan pasar a esta
  -- transacción, solo para este usuario (mismo bypass que la 0259).
  perform set_config('tindivo.deleting_account', p_user_id::text, true);

  update public.orders
  set comprobante_prepago_url = null
  where customer_user_id = p_user_id and comprobante_prepago_url is not null;
  get diagnostics v_orders = row_count;

  update public.reports
  set evidence_url = null
  where evidence_url is not null
    and starts_with(evidence_url, p_user_id::text || '/');
  get diagnostics v_reports = row_count;

  update public.users set proofs_purged_at = now() where id = p_user_id;

  perform set_config('tindivo.deleting_account', '', true);

  return jsonb_build_object('status', 'purged', 'orders', v_orders, 'reports', v_reports);
end;
$$;

revoke execute on function public.finish_proof_purge(uuid)
  from public, anon, authenticated;
grant execute on function public.finish_proof_purge(uuid) to service_role;

-- ── Comprobación: si algo no quedó como debe, la migración falla ────────────
do $check$
declare
  v_name   text;
  n        int;
  v_secdef boolean;
  v_cfg    text[];
begin
  foreach v_name in array array['list_proof_purge_due', 'list_user_proof_objects', 'finish_proof_purge'] loop
    select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = v_name;
    if n <> 1 then
      raise exception '0269: se esperaba UNA sola % y hay %', v_name, n;
    end if;
    select p.prosecdef, p.proconfig into v_secdef, v_cfg from pg_proc p
      join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = v_name;
    if not v_secdef then
      raise exception '0269: % no es SECURITY DEFINER', v_name;
    end if;
    if v_cfg is distinct from array['search_path=""'] then
      raise exception '0269: % no quedó con search_path vacío (%)', v_name, v_cfg;
    end if;
    if exists (
      select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
       where s.nspname = 'public' and p.proname = v_name
         and (has_function_privilege('anon', p.oid, 'execute')
           or has_function_privilege('authenticated', p.oid, 'execute')
           or not has_function_privilege('service_role', p.oid, 'execute'))
    ) then
      raise exception '0269: permisos de % incorrectos (solo service_role)', v_name;
    end if;
  end loop;
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'users' and column_name = 'proofs_purged_at'
  ) then
    raise exception '0269: falta users.proofs_purged_at';
  end if;
  if not exists (select 1 from public.app_settings where key = 'account_deletion') then
    raise exception '0269: falta app_settings.account_deletion';
  end if;
end
$check$;
