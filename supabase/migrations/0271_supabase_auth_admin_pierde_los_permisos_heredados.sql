-- ============================================================================
-- 0271 — `supabase_auth_admin` pierde los permisos heredados sobre `public`
-- ============================================================================
--
-- PROBLEMA. La comparación del catálogo de `tindivo-prod` con lo que generan las
-- migraciones (2026-10-19, solo catálogo, por el MCP de lectura) encontró una sola
-- diferencia propia de la base: en prod, `supabase_auth_admin` (el rol con el que corre
-- GoTrue) tiene USAGE sobre el esquema `public`, todos los privilegios sobre 37 tablas,
-- SELECT/UPDATE/USAGE sobre `order_number_seq` y EXECUTE sobre 59 funciones. Ninguna
-- migración los concede: vienen de antes del repo (las 0125, 0126 y 0128 ya los
-- llamaban «grant de plataforma» y los dejaron intactos). En una base nueva hecha con
-- las migraciones no existen.
--
-- POR QUÉ SOBRAN. GoTrue solo escribe en el esquema `auth`. El alta en `public.users`
-- la hace el trigger `on_auth_user_created` → `public.handle_new_user()`, que es
-- SECURITY DEFINER y corre como su dueño: Postgres no comprueba EXECUTE ni USAGE del rol
-- que dispara un trigger. En la base local (sin estos permisos) las altas de GoTrue
-- crean su fila en `public.users` en cada corrida de la suite. No hay ningún hook de Auth
-- en `public` (ninguna función con la forma `(event jsonb) returns jsonb` lo usa).
-- Un rol con escritura en `orders`, `business_charges` o `users` que nadie usa es
-- superficie de ataque sin función (OPS-7, permisos mínimos).
--
-- ARREGLO. Se revoca todo lo que `supabase_auth_admin` tiene en `public`. Tras esta
-- migración, prod queda igual que lo que generan las migraciones. Idempotente: revocar
-- lo que no existe no falla. El rollback restaura exactamente la lista medida en prod.
-- Rollback: supabase/rollbacks/0271_supabase_auth_admin_pierde_los_permisos_heredados.rollback.sql
-- ============================================================================

revoke all on all tables in schema public from supabase_auth_admin;
revoke all on all sequences in schema public from supabase_auth_admin;
revoke all on all functions in schema public from supabase_auth_admin;
revoke usage on schema public from supabase_auth_admin;

-- ── Comprobación: si algo no quedó como debe, la migración falla ────────────
do $check$
declare
  n integer;
begin
  select count(*) into n
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and exists (select 1 from aclexplode(c.relacl) a where a.grantee = 'supabase_auth_admin'::regrole);
  if n <> 0 then
    raise exception '0271: supabase_auth_admin conserva privilegios en % relaciones de public', n;
  end if;

  select count(*) into n
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace
    and exists (select 1 from aclexplode(p.proacl) a where a.grantee = 'supabase_auth_admin'::regrole);
  if n <> 0 then
    raise exception '0271: supabase_auth_admin conserva EXECUTE en % funciones de public', n;
  end if;

  -- La concesión PROPIA del rol, no el privilegio efectivo: `public` da USAGE a PUBLIC (todos los
  -- roles), así que `has_schema_privilege` es siempre true y no dice nada de lo que se revocó.
  if exists (
    select 1 from pg_namespace s, aclexplode(s.nspacl) a
    where s.nspname = 'public' and a.grantee = 'supabase_auth_admin'::regrole
  ) then
    raise exception '0271: supabase_auth_admin conserva su USAGE propio sobre public';
  end if;

  -- El alta de usuarios no depende de estos permisos, pero su trigger tiene que seguir ahí y
  -- disparar en las sesiones normales de GoTrue: `O` (origen) o `A` (siempre). `R` solo dispara
  -- en modo réplica y `D` nunca: con cualquiera de los dos el alta no crearía `public.users`.
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'auth.users'::regclass
      and t.tgname = 'on_auth_user_created'
      and t.tgfoid = 'public.handle_new_user()'::regprocedure
      and t.tgenabled in ('O', 'A')
  ) then
    raise exception '0271: falta el trigger on_auth_user_created → handle_new_user, o no dispara en sesiones normales';
  end if;
end
$check$;
