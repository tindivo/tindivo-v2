-- ============================================================================
-- 0279 — una cuenta nueva solo se crea con Google (hook «before user created»)
-- ============================================================================
--
-- PROBLEMA. Supabase Auth tiene la confirmación de correo apagada (autoconfirm), así que
-- `auth.signUp({ email, password })` desde la clave anónima crea una cuenta con el correo ya
-- «confirmado» sin que nadie haya demostrado que controla ese buzón. Si después el dueño real
-- entra con Google, GoTrue vincula su identidad a esa misma cuenta (el correo figura como
-- confirmado), y la contraseña que eligió quien la creó sigue entrando: preapropiación de
-- cuenta. La vinculación automática solo descarta identidades NO confirmadas, y con autoconfirm
-- no hay ninguna (consulta Codex 2026-10-25, §5).
--
-- POR QUÉ UN HOOK. No hay ajuste de Auth que cierre solo el alta por correo:
--   · apagar el proveedor email apaga también el inicio de sesión con contraseña, y el
--     personal (negocios, motorizados, admin) entra así;
--   · `disable_signup` bloquea también las altas con Google, que es como entra el cliente.
-- El hook «before user created» corre en las altas públicas y deja pasar la creación
-- administrativa. Medido en el código de GoTrue v2.192.0 (la versión de la base local): lo
-- invocan `signup.go` (correo y teléfono, también el alta por OTP/enlace mágico),
-- `external.go` (OAuth web), `token_oidc.go` (id_token de la app Android), `anonymous.go`,
-- `invite.go`, `web3.go`, `samlacs.go` y `mail.go` (`generateLink` de tipo signup o invite).
-- NO lo invoca `admin.go`: `auth.admin.createUser`, que es como se crea al personal
-- (`/admin/businesses`, `/admin/drivers`) y a las cuentas de prueba, no pasa por aquí.
-- Tampoco corre al iniciar sesión ni al vincular una identidad a una cuenta que ya existe.
--
-- REGLA. Lista de permitidos, no de prohibidos: solo pasa `app_metadata.provider = 'google'`
-- sin `is_anonymous`. Todo lo demás (correo, teléfono, anónimo, SSO, web3, un proveedor que se
-- active mañana o un evento sin proveedor) se rechaza con 403. Si un día se añade Apple, se
-- añade aquí con su propia migración.
--
-- ORDEN EN PRODUCCIÓN. El hook se activa en la configuración de Auth (panel o Management API),
-- no en esta migración. Primero `db push` (crea la función), después se activa el hook: al
-- revés, GoTrue no encuentra la función y falla TODA alta, también la de Google. Para
-- desactivarlo basta apagar el hook en Auth; la función puede quedarse.
--
-- ESQUEMA PROPIO. La función vive en `auth_hooks`, no en `public`: la 0271 dejó a
-- `supabase_auth_admin` sin ningún privilegio en `public` (y su prueba lo exige), y un esquema
-- que PostgREST no expone tampoco se puede llamar como RPC. Solo `supabase_auth_admin` tiene
-- USAGE sobre el esquema y EXECUTE sobre la función.
--
-- PERMISOS. La función no es SECURITY DEFINER: no lee ninguna tabla, solo el evento. Corre como
-- `supabase_auth_admin`. Una función nueva nace con EXECUTE para PUBLIC: se revoca a cada rol.
--
-- Rollback: supabase/rollbacks/0279_una_cuenta_nueva_solo_se_crea_con_google.rollback.sql
-- ============================================================================

create schema if not exists auth_hooks;
revoke all on schema auth_hooks from public;
revoke all on schema auth_hooks from anon, authenticated, service_role;
grant usage on schema auth_hooks to supabase_auth_admin;

create or replace function auth_hooks.before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  if event #>> '{user,app_metadata,provider}' is not distinct from 'google'
     and coalesce((event #>> '{user,is_anonymous}')::boolean, false) = false then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Las cuentas nuevas de Tindivo se crean con Google.'
    )
  );
end;
$$;

revoke all on function auth_hooks.before_user_created(jsonb) from public;
revoke all on function auth_hooks.before_user_created(jsonb) from anon;
revoke all on function auth_hooks.before_user_created(jsonb) from authenticated;
revoke all on function auth_hooks.before_user_created(jsonb) from service_role;
grant execute on function auth_hooks.before_user_created(jsonb) to supabase_auth_admin;

-- ── Comprobación: si algo no quedó como debe, la migración falla ────────────
do $check$
begin
  if exists (
    select 1
    from pg_proc p, aclexplode(p.proacl) a
    where p.oid = 'auth_hooks.before_user_created(jsonb)'::regprocedure
      and a.privilege_type = 'EXECUTE'
      and a.grantee not in ('postgres'::regrole, 'supabase_auth_admin'::regrole)
  ) then
    raise exception '0279: auth_hooks.before_user_created se puede ejecutar con un rol que no es supabase_auth_admin';
  end if;

  if exists (
    select 1
    from pg_namespace s, aclexplode(s.nspacl) a
    where s.nspname = 'auth_hooks'
      and a.grantee not in ('postgres'::regrole, 'supabase_auth_admin'::regrole)
  ) then
    raise exception '0279: el esquema auth_hooks da privilegios a un rol que no es supabase_auth_admin';
  end if;

  if not has_function_privilege('supabase_auth_admin', 'auth_hooks.before_user_created(jsonb)', 'EXECUTE') then
    raise exception '0279: supabase_auth_admin no puede ejecutar auth_hooks.before_user_created';
  end if;

  if auth_hooks.before_user_created(
       '{"user": {"app_metadata": {"provider": "google"}, "is_anonymous": false}}'::jsonb
     ) <> '{}'::jsonb then
    raise exception '0279: el hook rechaza un alta con Google';
  end if;

  if auth_hooks.before_user_created(
       '{"user": {"app_metadata": {"provider": "email"}}}'::jsonb
     ) #>> '{error,http_code}' is distinct from '403' then
    raise exception '0279: el hook deja pasar un alta por correo';
  end if;
end
$check$;
