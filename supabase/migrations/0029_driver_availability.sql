-- 0029_driver_availability.sql
-- Fase I (P0 del piloto): disponibilidad del motorizado + cierre de turno.
-- El motorizado activa/desactiva su disponibilidad respetando el horario operativo;
-- un cron cada 15 min cierra a todos fuera de horario. Las transferencias R1-R5 las
-- difiere FASE-1 con 1 moto. Idempotente.

-- ¿Estamos dentro del horario operativo? (America/Lima, soporta cruce de medianoche).
create or replace function public.is_within_platform_schedule()
  returns boolean
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v jsonb;
  v_days text[];
  v_start time;
  v_end time;
  v_t time;
  v_today text;
begin
  select value into v from public.app_settings where key = 'platform_schedule';
  if v is null then return true; end if;
  v_days := array(select jsonb_array_elements_text(v -> 'days'));
  v_start := (v ->> 'startHHMM')::time;
  v_end := (v ->> 'endHHMM')::time;
  v_t := (now() at time zone 'America/Lima')::time;
  v_today := lower(to_char(now() at time zone 'America/Lima', 'dy'));
  if not (v_today = any(v_days)) then return false; end if;
  if v_end > v_start then
    return v_t >= v_start and v_t < v_end;
  else
    return v_t >= v_start or v_t < v_end; -- cruza medianoche
  end if;
end;
$$;

-- El motorizado activa/desactiva su disponibilidad (activarse exige estar en horario).
create or replace function public.set_driver_availability(p_user_id uuid, p_available boolean)
  returns jsonb
  language plpgsql security definer set search_path = ''
as $$
declare
  v_driver_id uuid;
begin
  select id into v_driver_id from public.drivers where user_id = p_user_id and is_active limit 1;
  if v_driver_id is null then
    raise exception 'Motorizado no encontrado o inactivo' using errcode = 'P0001';
  end if;
  if p_available and not public.is_within_platform_schedule() then
    raise exception 'Fuera del horario operativo: no puedes ponerte disponible ahora' using errcode = 'P0001';
  end if;
  insert into public.driver_availability (driver_id, is_available)
  values (v_driver_id, p_available)
  on conflict (driver_id) do update set is_available = excluded.is_available;
  return jsonb_build_object('driverId', v_driver_id, 'available', p_available);
end;
$$;

-- Cierre de turno: si estamos fuera de horario, pone a todos no-disponibles.
create or replace function public.close_drivers_outside_schedule()
  returns int
  language plpgsql security definer set search_path = ''
as $$
declare
  v_count int;
begin
  if public.is_within_platform_schedule() then return 0; end if;
  update public.driver_availability set is_available = false where is_available = true;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.is_within_platform_schedule() from public, anon, authenticated;
revoke all on function public.set_driver_availability(uuid, boolean) from public, anon, authenticated;
revoke all on function public.close_drivers_outside_schedule() from public, anon, authenticated;
grant execute on function public.is_within_platform_schedule() to service_role;
grant execute on function public.set_driver_availability(uuid, boolean) to service_role;
grant execute on function public.close_drivers_outside_schedule() to service_role;

-- Cron: cierra disponibilidad fuera de horario cada 15 min (idempotente).
do $$
begin
  perform cron.unschedule('close-driver-shifts');
exception
  when others then null;
end;
$$;
select cron.schedule('close-driver-shifts', '*/15 * * * *', 'select public.close_drivers_outside_schedule();');
