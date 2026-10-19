-- ROLLBACK de la 0268 · quita el registro de dispositivos nativos de push
--
-- OJO: BORRA la tabla `push_devices` y con ella todos los tokens registrados (las apps
-- los volverán a registrar al abrirse). `push_subscriptions` (Web Push) no se toca.
-- Úsese solo si la 0268 rompe algo; ninguna otra migración depende de ella.

drop function if exists public.unregister_push_device(uuid, text);
drop function if exists public.register_push_device(
  uuid, text, text, text, text, text, text, text, text, text, text, boolean
);
drop table if exists public.push_devices;

do $check$
begin
  if to_regclass('public.push_devices') is not null
     or exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
                 where s.nspname = 'public'
                   and p.proname in ('register_push_device', 'unregister_push_device')) then
    raise exception 'rollback 0268 abortado: quedan objetos de la 0268';
  end if;
end
$check$;
