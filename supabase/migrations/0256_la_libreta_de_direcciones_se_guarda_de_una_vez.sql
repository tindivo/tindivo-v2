-- La libreta de direcciones del cliente, escrita de una vez (lote MV4b).
--
-- Hasta hoy la web escribía `customer_addresses` con varias sentencias sueltas
-- desde el navegador: para marcar una predeterminada hacía un UPDATE que
-- despejaba a todas y otro que marcaba la elegida, y para borrar la
-- predeterminada, un DELETE y luego otro UPDATE a la heredera. Si la red se
-- cortaba entre las dos, el cliente quedaba sin predeterminada (el estado que la
-- 0203 tuvo que reparar a mano) o con un error de índice único.
--
-- Estas dos funciones hacen cada operación en UNA transacción. Son SECURITY
-- INVOKER a propósito: corren con los permisos del cliente que llama, así que la
-- policy `ca_self_all` sigue siendo la que decide qué filas toca, y `auth.uid()`
-- es el dueño — no reciben ningún id de usuario que alguien pueda falsear.
--
-- Aditiva: no cambia tablas ni datos. La web no las usa; las usa la API.

-- ── Guardar (alta o edición) ─────────────────────────────────────────────────
--
-- `p_make_default`:
--   · true  → la hace predeterminada y despeja a la anterior (despeja primero,
--             marca después: el índice único parcial no admite dos a la vez).
--   · null  → no decide: en un alta, nace predeterminada solo si el cliente no
--             tiene ninguna (cura también a quien tenga direcciones sin marcar);
--             en una edición no toca la columna.
--
-- Escribe la fila entera: quien llama ya fusionó lo que no cambió.
create or replace function public.customer_address_save(
  p_id uuid,
  p_label text,
  p_line text,
  p_reference text,
  p_lat numeric,
  p_lng numeric,
  p_location_confirmed_at timestamptz,
  p_location_accuracy_m numeric,
  p_make_default boolean default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_default boolean;
begin
  if v_uid is null then
    raise exception 'customer_address_unauthenticated' using errcode = '42501';
  end if;

  -- Una escritura de la libreta por cliente a la vez: dos toques casi
  -- simultáneos (dos dispositivos) se ponen en fila en vez de chocar con el
  -- índice único de la predeterminada.
  perform pg_advisory_xact_lock(hashtextextended('customer_address:' || v_uid::text, 0));

  if p_make_default is true then
    update public.customer_addresses
       set is_default = false, updated_at = now()
     where user_id = v_uid
       and is_default
       and id is distinct from p_id;
  end if;

  if p_id is null then
    v_default := coalesce(
      p_make_default,
      not exists (
        select 1 from public.customer_addresses
         where user_id = v_uid and is_default
      )
    );
    insert into public.customer_addresses (
      user_id, label, line, reference,
      coordinates_lat, coordinates_lng,
      location_confirmed_at, location_accuracy_m, is_default
    ) values (
      v_uid, p_label, p_line, p_reference,
      p_lat, p_lng,
      p_location_confirmed_at, p_location_accuracy_m, v_default
    )
    returning id into v_id;
    return v_id;
  end if;

  update public.customer_addresses
     set label = p_label,
         line = p_line,
         reference = p_reference,
         coordinates_lat = p_lat,
         coordinates_lng = p_lng,
         location_confirmed_at = p_location_confirmed_at,
         location_accuracy_m = p_location_accuracy_m,
         is_default = case when p_make_default is true then true else is_default end,
         updated_at = now()
   where id = p_id and user_id = v_uid
  returning id into v_id;

  if v_id is null then
    raise exception 'customer_address_not_found' using errcode = 'P0002';
  end if;
  return v_id;
end;
$$;

comment on function public.customer_address_save(uuid, text, text, text, numeric, numeric, timestamptz, numeric, boolean) is
  'Alta o edición de una dirección del cliente (auth.uid()) en una transacción; marcar predeterminada despeja a la anterior. SECURITY INVOKER: la RLS decide.';

-- ── Borrar ───────────────────────────────────────────────────────────────────
--
-- Si se borra la predeterminada y quedan otras, la más antigua hereda el puesto
-- en la misma transacción. Devuelve false si la fila no existe o no es suya.
create or replace function public.customer_address_delete(p_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_deleted uuid;
begin
  if v_uid is null then
    raise exception 'customer_address_unauthenticated' using errcode = '42501';
  end if;

  -- Una escritura de la libreta por cliente a la vez: dos toques casi
  -- simultáneos (dos dispositivos) se ponen en fila en vez de chocar con el
  -- índice único de la predeterminada.
  perform pg_advisory_xact_lock(hashtextextended('customer_address:' || v_uid::text, 0));

  delete from public.customer_addresses
   where id = p_id and user_id = v_uid
  returning id into v_deleted;

  if v_deleted is null then
    return false;
  end if;

  -- Mira a los que sobreviven, no a la que se fue: así también cura a quien ya
  -- estuviera sin predeterminada antes de este borrado.
  if not exists (
       select 1 from public.customer_addresses
        where user_id = v_uid and is_default
     ) then
    update public.customer_addresses
       set is_default = true, updated_at = now()
     where id = (
       select id from public.customer_addresses
        where user_id = v_uid
        order by created_at, id
        limit 1
     );
  end if;
  return true;
end;
$$;

comment on function public.customer_address_delete(uuid) is
  'Borra una dirección propia; si era la predeterminada, la más antigua de las que quedan hereda el puesto. SECURITY INVOKER.';

-- Permisos: solo el cliente autenticado (y el service role). Los default
-- privileges de Supabase dejan EXECUTE a anon; hay que quitárselo a mano.
revoke all on function public.customer_address_save(uuid, text, text, text, numeric, numeric, timestamptz, numeric, boolean)
  from public, anon;
grant execute on function public.customer_address_save(uuid, text, text, text, numeric, numeric, timestamptz, numeric, boolean)
  to authenticated, service_role;

revoke all on function public.customer_address_delete(uuid) from public, anon;
grant execute on function public.customer_address_delete(uuid) to authenticated, service_role;
