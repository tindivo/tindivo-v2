-- ROLLBACK de la 0279 · quita el hook que solo deja crear cuentas con Google
--
-- ANTES de ejecutarlo: apagar el hook «before user created» en la configuración de Auth (panel o
-- Management API). Si el hook sigue activo y la función desaparece, GoTrue falla TODA alta, también
-- la de Google.
--
-- Qué hace: borra `auth_hooks.before_user_created(jsonb)` y el esquema `auth_hooks`. Con el hook apagado, el alta pública por
-- correo vuelve a funcionar como antes de la 0279 (con la preapropiación que la 0279 cerraba).

drop function if exists auth_hooks.before_user_created(jsonb);
drop schema if exists auth_hooks;
