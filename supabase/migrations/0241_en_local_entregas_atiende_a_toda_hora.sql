-- ════════════════════════════════════════════════════════════════════════════
-- 0241 · En local, Entregas atiende a toda hora
--
-- Fuera de las 6 a 11 pm no había forma de probar Entregas en la máquina: la
-- tarjeta del home salía cerrada y `create_courier_order` rechazaba con
-- `courier_closed`. La salida que había —poner el horario en 00:00-23:59, como
-- hacen los tests— hacía que el home dijera «12 am a 11:59 pm», que no es lo
-- que se quiere ver.
--
-- Ahora `app_settings.courier.ignoreSchedule = true` hace que
-- `is_within_courier_schedule()` diga «dentro de horario» SIN tocar `hours`:
-- se puede pedir a cualquier hora y el home sigue diciendo «6 a 11 pm».
-- Lo enciende `pnpm db:seed:e2e`, que solo corre contra la base local.
--
-- En producción la clave no existe y nada cambia. Es la única función que
-- decide el horario (`courier_service_status` y `create_courier_order` la
-- llaman), así que basta con tocar esta.
--
-- Idempotente: `create or replace`, misma firma que la 0238.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.is_within_courier_schedule() returns boolean
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_courier jsonb;
  v jsonb;
  v_start time;
  v_end time;
  v_now timestamp := now() at time zone 'America/Lima';
  v_t time := v_now::time;
  v_dow int;
begin
  select value into v_courier from public.app_settings where key = 'courier';
  if v_courier is null then return false; end if;

  -- 0241: solo desarrollo. Ver la cabecera.
  if coalesce((v_courier ->> 'ignoreSchedule')::boolean, false) then
    return true;
  end if;

  v := v_courier -> 'hours';
  if v is null then return false; end if;
  v_start := (v ->> 'start')::time;
  v_end := (v ->> 'end')::time;

  -- El día que cuenta es el de la APERTURA: si algún día el horario cruza la
  -- medianoche, la 1 am del domingo pertenece a la noche del sábado.
  v_dow := extract(isodow from case
    when v_end <= v_start and v_t < v_end then v_now - interval '1 day'
    else v_now
  end)::int;
  if jsonb_typeof(v -> 'days') = 'array'
     and not (v -> 'days') @> to_jsonb(v_dow) then
    return false;
  end if;

  if v_end > v_start then
    return v_t >= v_start and v_t < v_end;
  else
    return v_t >= v_start or v_t < v_end; -- cruza medianoche
  end if;
end;
$$;
grant execute on function public.is_within_courier_schedule() to anon, authenticated, service_role;
