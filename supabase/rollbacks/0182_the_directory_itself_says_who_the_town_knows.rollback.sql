-- ROLLBACK de 0182 — del directorio vuelven a valer solo las filas del ETL.
--
-- Devuelve `customer_trusted_for_contraentrega` a la cláusula (3) de 0171: una
-- fila de `address_directory` solo abre la contraentrega si trae
-- `legacy_address_id`, o sea si viene del ETL cerrado del v1. Con esto vuelve a
-- exigirse prepago al vecino que solo figura porque la cajera lo apuntó al
-- tomar un pedido (`business_created`) o porque el motorizado le verificó la
-- puerta sin que ese teléfono tenga aún una entrega en v2 (`driver_verified`
-- sin legacy).
--
-- NO HACE FALTA TOCAR NADA MÁS. `current_customer_trusted_for_contraentrega()`
-- es un wrapper sobre este predicado y `create_customer_order` lo llama por
-- nombre: revirtiendo el cuerpo, revierte todo. Tampoco hay que tocar el front,
-- al revés que en el rollback de 0171 — el checkout pregunta por el wrapper, no
-- por la regla, así que sigue pintando lo que la DB conteste.
--
-- LO QUE NO DESHACE ESTE ARCHIVO. Si mientras 0182 estuvo viva alguien pidió
-- contraentrega apoyándose SOLO en una fila de directorio no-legacy, ese pedido
-- ya existe y no se revisa aquí. Revertir cierra la puerta hacia adelante; no
-- reabre pedidos pasados. Para encontrarlos:
--
--   select o.id, o.short_id, o.customer_phone, o.created_at
--   from public.orders o
--   where o.payment_method <> 'prepaid'
--     and o.created_at >= '<fecha en que se aplicó 0182>'
--     and exists (select 1 from public.address_directory ad
--                  where ad.phone = o.customer_phone
--                    and ad.legacy_address_id is null)
--     and not exists (select 1 from public.orders p
--                      where p.customer_phone = o.customer_phone
--                        and p.status = 'delivered'
--                        and p.created_at < o.created_at);

CREATE OR REPLACE FUNCTION public.customer_trusted_for_contraentrega(p_customer_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
declare
  v_phone text;
begin
  if p_customer_user_id is null then
    return false;
  end if;

  -- El teléfono sale del PERFIL VERIFICADO, nunca de un parámetro. Ver 0171.
  select right(regexp_replace(cp.phone, '\D', '', 'g'), 9)
    into v_phone
  from public.customer_profiles cp
  where cp.user_id = p_customer_user_id
    and cp.phone_verified_at is not null;

  -- Un teléfono fuera de formato no puede casar con `orders.customer_phone` ni
  -- con `address_directory.phone`, que son `^9\d{8}$`. Se anula para que las
  -- cláusulas de abajo lo salten en vez de comparar basura.
  if v_phone is not null and v_phone !~ '^9\d{8}$' then
    v_phone := null;
  end if;

  -- EL RIESGO MANDA SOBRE CUALQUIER HISTORIAL.
  if public.customer_requires_prepayment(p_customer_user_id, v_phone, null) then
    return false;
  end if;

  -- (1) Historial de ESTA cuenta.
  if exists (
    select 1 from public.orders o
    where o.customer_user_id = p_customer_user_id
      and o.status = 'delivered'
  ) then
    return true;
  end if;

  if v_phone is null then
    return false;
  end if;

  -- (2) Entregas del teléfono en v2, incluidos los pedidos manuales.
  if exists (
    select 1 from public.orders o
    where o.customer_phone = v_phone
      and o.status = 'delivered'
  ) then
    return true;
  end if;

  -- (3) Entregas del teléfono en v1. El filtro que 0182 había quitado.
  return exists (
    select 1 from public.address_directory ad
    where ad.phone = v_phone
      and ad.legacy_address_id is not null
  );
end $fn$;

COMMENT ON FUNCTION public.customer_trusted_for_contraentrega(uuid) IS
  'true si el cliente puede pagar contraentrega sin prepago. Resuelve el '
  'telefono desde el perfil VERIFICADO, nunca de un parametro. Ver 0171.';

REVOKE EXECUTE ON FUNCTION public.customer_trusted_for_contraentrega(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_trusted_for_contraentrega(uuid) TO service_role;

-- Guarda simétrica a la de 0182: que el filtro volvió de verdad, y que volvió
-- al CÓDIGO y no a un comentario. Por eso se quitan los `--` antes de mirar.
do $guard$
declare
  v_body text;
begin
  v_body := regexp_replace(
    pg_get_functiondef('public.customer_trusted_for_contraentrega(uuid)'::regprocedure),
    '--[^\n]*',
    '',
    'g'
  );

  if v_body !~* 'legacy_address_id\s+is\s+not\s+null' then
    raise exception 'rollback 0182: el filtro legacy_address_id no volvió al predicado';
  end if;
end $guard$;
