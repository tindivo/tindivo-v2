-- ROLLBACK de la 0270 · quita la purga de dispositivos y las columnas de canal de la bitácora
--
-- OJO: BORRA `push_delivery_log.device_id` y `channel` (se pierde a qué dispositivo y por qué
-- canal fue cada envío nativo ya registrado; las filas se conservan) y la clave
-- `app_settings.push_devices_retention`. Deja de purgarse `push_devices`: sus tokens se acumulan
-- hasta que se vuelva a aplicar la 0270. Si `send-push` ya manda a dispositivos, desplegar antes su
-- versión anterior: la nueva escribe esas dos columnas.

select cron.unschedule('prune-push-devices')
 where exists (select 1 from cron.job where jobname = 'prune-push-devices');

drop function if exists public.prune_push_devices();
drop index if exists public.pdl_device_idx;
alter table public.push_delivery_log drop column if exists channel;
alter table public.push_delivery_log drop column if exists device_id;
delete from public.app_settings where key = 'push_devices_retention';

do $check$
begin
  if exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
              where s.nspname = 'public' and p.proname = 'prune_push_devices')
     or exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'push_delivery_log'
                   and column_name in ('device_id', 'channel'))
     or exists (select 1 from cron.job where jobname = 'prune-push-devices') then
    raise exception 'rollback 0270 abortado: quedan objetos de la 0270';
  end if;
end
$check$;
