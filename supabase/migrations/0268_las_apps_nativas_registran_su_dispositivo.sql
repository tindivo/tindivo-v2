-- ============================================================================
-- 0268 — las apps nativas registran su dispositivo de push (MV7a, D-25)
-- ============================================================================
--
-- Las apps nativas (iOS y Android) registran el token de APNs/FCM de su instalación para
-- recibir avisos de pedidos. Este lote es SOLO el registro, la rotación del token, la baja y
-- el cambio de usuario en el mismo aparato; el envío es otro lote. Web Push
-- (`push_subscriptions`) no se toca.
--
-- TABLA `push_devices`. Una fila por INSTALACIÓN (`install_id`, UUID que genera la app al
-- instalarse). El token es una credencial: la tabla es solo de servidor (RLS sin políticas,
-- DB-2) y la API nunca lo devuelve. `user_id` apunta a `auth.users` con `on delete cascade`:
-- al borrar la cuenta, `delete_customer_account` (0259) borra la identidad y los tokens
-- caen con ella (DB-13).
--
-- `register_push_device` (DEFINER, solo `service_role`, DB-3 y DB-4), en UNA transacción:
--   1. Candado de aviso sobre el hash del token: dos registros del MISMO token desde dos
--      instalaciones se serializan, así que el segundo no choca contra el `unique` (sería un
--      500) sino que borra al primero.
--   2. Rechaza la cuenta borrada (`users.deleted_at`), leída FOR SHARE como la 0266, para
--      que un JWT todavía válido no re-registre un token tras el borrado.
--   3. Borra la fila de OTRA instalación con el mismo token (el token cambió de manos).
--   4. Si el `install_id` ya es de OTRO usuario, aborta con `install_id_taken` sin tocar
--      nada: conocer un installId no da su fila. El cambio de usuario en el mismo aparato
--      va por el TOKEN: la app regenera su installId al cerrar sesión y el usuario nuevo
--      registra el nuevo con el mismo token; la fila vieja de ese token se borra (paso 3).
--   5. Upsert por `install_id` de la propia instalación. Si el token cambió (rotación),
--      reinicia los contadores de fallo y reactiva el dispositivo. El `where` del upsert
--      cubre la carrera de dos usuarios con el mismo installId nuevo.
-- `unregister_push_device`: borra solo si la instalación es del actor; si es de otro o no
-- existe, no hace nada y devuelve false (la API responde 204 igual: no revela nada).
--
-- Rollback: supabase/rollbacks/0268_las_apps_nativas_registran_su_dispositivo.rollback.sql
-- ============================================================================

create table if not exists public.push_devices (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  install_id            text not null unique
                          check (char_length(install_id) between 8 and 64),
  platform              text not null check (platform in ('ios', 'android')),
  app                   text not null check (app in ('customer', 'negocios', 'motorizados')),
  token                 text not null unique
                          check (char_length(token) between 32 and 4096),
  environment           text not null default 'production'
                          check (environment in ('production', 'sandbox')),
  app_version           text not null check (char_length(app_version) between 1 and 64),
  os_version            text check (char_length(os_version) <= 64),
  device_model          text check (char_length(device_model) <= 128),
  locale                text check (char_length(locale) <= 64),
  timezone              text check (char_length(timezone) <= 64),
  notifications_enabled boolean not null,
  last_seen_at          timestamptz not null default now(),
  last_successful_at    timestamptz,
  last_failed_at        timestamptz,
  failure_count         integer not null default 0 check (failure_count >= 0),
  disabled_at           timestamptz,
  disabled_reason       text check (char_length(disabled_reason) <= 128),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists push_devices_user_id_idx on public.push_devices (user_id);

drop trigger if exists touch_push_devices on public.push_devices;
create trigger touch_push_devices
  before update on public.push_devices
  for each row execute function public.touch_updated_at();

alter table public.push_devices enable row level security;
comment on table public.push_devices is 'server-only';

revoke all on table public.push_devices from public, anon, authenticated;
grant select, insert, update, delete on table public.push_devices to service_role;

-- ── register_push_device ────────────────────────────────────────────────────
create or replace function public.register_push_device(
  p_actor_user_id         uuid,
  p_install_id            text,
  p_platform              text,
  p_app                   text,
  p_token                 text,
  p_environment           text,
  p_app_version           text,
  p_os_version            text,
  p_device_model          text,
  p_locale                text,
  p_timezone              text,
  p_notifications_enabled boolean
) returns public.push_devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted timestamptz;
  v_row     public.push_devices;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_token, 0));

  select u.deleted_at into v_deleted
  from public.users u
  where u.id = p_actor_user_id
  for share;
  if not found or v_deleted is not null then
    raise exception using errcode = 'P0001', message = 'account_deleted';
  end if;

  -- El installId es del primero que lo registra: conocerlo no basta para quedarse la fila.
  -- Se lee FOR UPDATE antes de tocar nada; si es de otro usuario, aborta sin cambios.
  perform 1
  from public.push_devices d
  where d.install_id = p_install_id and d.user_id <> p_actor_user_id
  for update;
  if found then
    raise exception using errcode = 'P0001', message = 'install_id_taken';
  end if;

  delete from public.push_devices d
  where d.token = p_token and d.install_id <> p_install_id;

  insert into public.push_devices as d (
    user_id, install_id, platform, app, token, environment, app_version,
    os_version, device_model, locale, timezone, notifications_enabled
  ) values (
    p_actor_user_id, p_install_id, p_platform, p_app, p_token, p_environment, p_app_version,
    p_os_version, p_device_model, p_locale, p_timezone, p_notifications_enabled
  )
  on conflict (install_id) do update set
    platform              = excluded.platform,
    app                   = excluded.app,
    environment           = excluded.environment,
    app_version           = excluded.app_version,
    os_version            = excluded.os_version,
    device_model          = excluded.device_model,
    locale                = excluded.locale,
    timezone              = excluded.timezone,
    notifications_enabled = excluded.notifications_enabled,
    last_seen_at          = now(),
    failure_count   = case when d.token is distinct from excluded.token then 0
                           else d.failure_count end,
    last_failed_at  = case when d.token is distinct from excluded.token then null
                           else d.last_failed_at end,
    disabled_at     = case when d.token is distinct from excluded.token then null
                           else d.disabled_at end,
    disabled_reason = case when d.token is distinct from excluded.token then null
                           else d.disabled_reason end,
    token                 = excluded.token
  where d.user_id = excluded.user_id
  returning d.* into v_row;

  -- Otro usuario insertó este installId entre la lectura y el insert (otro token, otro
  -- candado): el `where` impide pisar su fila y aquí se rechaza, deshaciendo todo.
  if not found then
    raise exception using errcode = 'P0001', message = 'install_id_taken';
  end if;

  return v_row;
end;
$$;

revoke execute on function public.register_push_device(
  uuid, text, text, text, text, text, text, text, text, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.register_push_device(
  uuid, text, text, text, text, text, text, text, text, text, text, boolean
) to service_role;

-- ── unregister_push_device ──────────────────────────────────────────────────
create or replace function public.unregister_push_device(
  p_actor_user_id uuid,
  p_install_id    text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from public.push_devices d
  where d.install_id = p_install_id and d.user_id = p_actor_user_id;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

revoke execute on function public.unregister_push_device(uuid, text)
  from public, anon, authenticated;
grant execute on function public.unregister_push_device(uuid, text) to service_role;

-- ── Comprobación: si algo no quedó como debe, la migración falla ────────────
do $check$
declare
  v_name   text;
  n        int;
  v_secdef boolean;
  v_cfg    text[];
begin
  foreach v_name in array array['register_push_device', 'unregister_push_device'] loop
    select count(*) into n from pg_proc p join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = v_name;
    if n <> 1 then
      raise exception '0268: se esperaba UNA sola % y hay %', v_name, n;
    end if;
    select p.prosecdef, p.proconfig into v_secdef, v_cfg from pg_proc p
      join pg_namespace s on s.oid = p.pronamespace
     where s.nspname = 'public' and p.proname = v_name;
    if not v_secdef then
      raise exception '0268: % no es SECURITY DEFINER', v_name;
    end if;
    if v_cfg is distinct from array['search_path=""'] then
      raise exception '0268: % no quedó con search_path vacío (%)', v_name, v_cfg;
    end if;
    if exists (
      select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
       where s.nspname = 'public' and p.proname = v_name
         and (has_function_privilege('anon', p.oid, 'execute')
           or has_function_privilege('authenticated', p.oid, 'execute')
           or not has_function_privilege('service_role', p.oid, 'execute'))
    ) then
      raise exception '0268: permisos de % incorrectos (solo service_role)', v_name;
    end if;
  end loop;
  if not (select c.relrowsecurity from pg_class c
           where c.oid = 'public.push_devices'::regclass) then
    raise exception '0268: push_devices sin RLS';
  end if;
end
$check$;
