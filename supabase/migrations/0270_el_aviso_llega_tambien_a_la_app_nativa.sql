-- ============================================================================
-- 0270 — el aviso llega también a la app nativa (MV7b, D-25)
-- ============================================================================
--
-- `send-push` ya manda Web Push; ahora manda además a los dispositivos nativos de
-- `push_devices` (FCM para Android, APNs para iOS). Esta migración pone lo que la base debe
-- aportar a ese envío.
--
-- 1. `push_delivery_log` distingue el canal y apunta al dispositivo:
--      · `device_id`  FK a `push_devices` con `on delete set null` (la bitácora sobrevive al
--                     dispositivo; su retención de 30 días la sigue purgando `prune-push-delivery-log`).
--      · `channel`    'web' (lo que había, y el valor por defecto), 'apns' o 'fcm'.
--    Una fila nativa lleva `subscription_id` nulo. `error_message` guarda SOLO el código de razón
--    (`BadDeviceToken`, `UNREGISTERED`, `timeout`…), nunca el cuerpo de la respuesta ni el token.
--
-- 2. Retención de tokens de dispositivo (OPS-2). Parámetro operativo en
--    `app_settings.push_devices_retention` = {"disabledDays": 30, "staleDays": 180}.
--    Decisión de Jesús, 2026-10-20 (Ley 29733): `disabledDays` = días que se
--    conserva un dispositivo desactivado (token inválido) antes de borrarlo; `staleDays` = días sin
--    abrir la app (`last_seen_at`) tras los que el token se da por abandonado.
--    `prune_push_devices()` borra ambas clases y devuelve cuántos borró. FALLA CERRADA: sin la clave,
--    o si algún valor no es un entero entre 1 y 3650, no borra nada.
--    DEFINER, `search_path` vacío, solo `service_role`/`postgres` (DB-3, DB-4).
--
-- 3. `pg_cron` diario `prune-push-devices` a las 09:00 UTC = 04:00 en Lima, fuera del horario de
--    pedidos (los demás prunes de la 0007 corren a las 04:00-06:00 UTC, es decir, 23:00-01:00 en
--    Lima, con pedidos en curso; este no repite esa hora). `cron.schedule` reemplaza por nombre:
--    es idempotente.
--
-- 4. `record_native_push_result(dispositivo, token, resultado, razón)`: anota el resultado de UN envío
--    en su dispositivo, atómico y solo si conserva el token enviado. Solo `service_role`.
--
-- Idempotente. Rollback: supabase/rollbacks/0270_el_aviso_llega_tambien_a_la_app_nativa.rollback.sql
-- ============================================================================

alter table public.push_delivery_log
  add column if not exists device_id uuid references public.push_devices (id) on delete set null;

alter table public.push_delivery_log
  add column if not exists channel text not null default 'web'
    check (channel in ('web', 'apns', 'fcm'));

-- Índice del FK (el `on delete set null` de un dispositivo borrado recorre la tabla sin él).
create index if not exists pdl_device_idx on public.push_delivery_log (device_id)
  where device_id is not null;

comment on column public.push_delivery_log.device_id is
  'Dispositivo nativo (push_devices) al que se intentó el envío; nulo en Web Push.';
comment on column public.push_delivery_log.channel is
  'Canal del envío: web (push_subscriptions), apns o fcm (push_devices).';

insert into public.app_settings (key, value)
values ('push_devices_retention', '{"disabledDays": 30, "staleDays": 180}'::jsonb)
on conflict (key) do nothing;

create or replace function public.prune_push_devices() returns bigint
  language plpgsql security definer set search_path = ''
as $$
declare
  v_raw      jsonb;
  v_disabled text;
  v_stale    text;
  v_deleted  bigint;
begin
  select s.value into v_raw from public.app_settings s where s.key = 'push_devices_retention';

  -- Falla cerrada: sin objeto, o con un plazo que no sea un entero de 1 a 3650, no se borra nada.
  if v_raw is null or jsonb_typeof(v_raw) <> 'object' then
    return 0;
  end if;
  if jsonb_typeof(v_raw -> 'disabledDays') is distinct from 'number'
     or jsonb_typeof(v_raw -> 'staleDays') is distinct from 'number' then
    return 0;
  end if;
  v_disabled := v_raw ->> 'disabledDays';
  v_stale    := v_raw ->> 'staleDays';
  if v_disabled !~ '^[1-9][0-9]{0,3}$' or v_stale !~ '^[1-9][0-9]{0,3}$'
     or v_disabled::integer > 3650 or v_stale::integer > 3650 then
    return 0;
  end if;

  -- SKIP LOCKED: la purga nunca espera a un registro o a un envío en curso (se purga mañana).
  delete from public.push_devices
   where ctid in (
     select d.ctid from public.push_devices d
      where (d.disabled_at is not null
             and d.disabled_at < now() - make_interval(days => v_disabled::integer))
         or d.last_seen_at < now() - make_interval(days => v_stale::integer)
      for update skip locked
   );
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

comment on function public.prune_push_devices() is
  'Borra los dispositivos nativos desactivados hace mas de disabledDays y los no vistos hace mas de staleDays (app_settings.push_devices_retention). Sin clave valida, nada. Devuelve cuantos borro. Solo service_role.';

revoke execute on function public.prune_push_devices() from public, anon, authenticated;
grant execute on function public.prune_push_devices() to service_role;

-- ── record_native_push_result ───────────────────────────────────────────────
-- Registra el resultado de UN envío nativo en su dispositivo, solo si el dispositivo sigue
-- teniendo el MISMO token que se envió (CAX-001: una respuesta del token viejo no toca al
-- nuevo tras una rotación) y con el incremento en la base (CAX-003: dos fallos simultáneos
-- suman dos). Devuelve true si actualizó la fila. DEFINER, search_path vacío, solo service_role.
create or replace function public.record_native_push_result(
  p_device_id uuid, p_token text, p_outcome text, p_reason text
) returns boolean
  language plpgsql security definer set search_path = ''
as $$
declare
  v_rows integer;
begin
  if p_outcome not in ('ok', 'invalid_token', 'failed') then
    raise exception using errcode = '22023', message = 'outcome_invalid';
  end if;
  update public.push_devices d
     set last_successful_at = case when p_outcome = 'ok' then now() else d.last_successful_at end,
         failure_count      = case when p_outcome = 'ok' then 0
                                   when p_outcome = 'failed' then d.failure_count + 1
                                   else d.failure_count end,
         last_failed_at     = case when p_outcome = 'failed' then now() else d.last_failed_at end,
         disabled_at        = case when p_outcome = 'invalid_token' then coalesce(d.disabled_at, now()) else d.disabled_at end,
         disabled_reason    = case when p_outcome = 'invalid_token' then coalesce(d.disabled_reason, left(p_reason, 128)) else d.disabled_reason end
   where d.id = p_device_id
     and d.token_sha256 = public.push_token_hash(p_token);
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

comment on function public.record_native_push_result(uuid, text, text, text) is
  'Registra el resultado de un envio nativo solo para el token enviado (ok, invalid_token, failed). Devuelve true si actualizo la fila. Solo service_role.';

revoke execute on function public.record_native_push_result(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_native_push_result(uuid, text, text, text) to service_role;

select cron.schedule('prune-push-devices', '0 9 * * *', $cron$
  select public.prune_push_devices();
$cron$);

-- ── Comprobación: si algo no quedó como debe, la migración falla ────────────
do $check$
declare
  n        int;
  v_secdef boolean;
  v_cfg    text[];
begin
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'prune_push_devices';
  if n <> 1 then
    raise exception '0270: se esperaba UNA sola prune_push_devices y hay %', n;
  end if;
  select p.prosecdef, p.proconfig into v_secdef, v_cfg from pg_proc p
    join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'prune_push_devices';
  if not v_secdef then
    raise exception '0270: prune_push_devices no es SECURITY DEFINER';
  end if;
  if v_cfg is distinct from array['search_path=""'] then
    raise exception '0270: prune_push_devices no quedó con search_path vacío (%)', v_cfg;
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = 'prune_push_devices'
       and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute')
         or not has_function_privilege('service_role', p.oid, 'execute'))
  ) then
    raise exception '0270: permisos de prune_push_devices incorrectos (solo service_role)';
  end if;
  select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'record_native_push_result';
  if n <> 1 then
    raise exception '0270: se esperaba UNA sola record_native_push_result y hay %', n;
  end if;
  select p.prosecdef, p.proconfig into v_secdef, v_cfg from pg_proc p
    join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public' and p.proname = 'record_native_push_result';
  if not v_secdef then
    raise exception '0270: record_native_push_result no es SECURITY DEFINER';
  end if;
  if v_cfg is distinct from array['search_path=""'] then
    raise exception '0270: record_native_push_result no quedó con search_path vacío (%)', v_cfg;
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = 'record_native_push_result'
       and (has_function_privilege('anon', p.oid, 'execute')
         or has_function_privilege('authenticated', p.oid, 'execute')
         or not has_function_privilege('service_role', p.oid, 'execute'))
  ) then
    raise exception '0270: permisos de record_native_push_result incorrectos (solo service_role)';
  end if;
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'push_delivery_log'
     and column_name in ('device_id', 'channel');
  if n <> 2 then
    raise exception '0270: faltan device_id/channel en push_delivery_log';
  end if;
  if not exists (select 1 from public.app_settings where key = 'push_devices_retention') then
    raise exception '0270: falta app_settings.push_devices_retention';
  end if;
  if not exists (select 1 from cron.job where jobname = 'prune-push-devices') then
    raise exception '0270: falta el job prune-push-devices';
  end if;
end
$check$;
