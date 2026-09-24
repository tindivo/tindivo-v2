-- El mapa de seguimiento de Tindivo Entregas (cliente) pinta el pin de origen
-- y destino sobre el mapa persistente. Cuando el seguimiento se abre por el
-- enlace público (`/entregas/[shortId]`, sin haber pasado por el flujo de
-- pedir en esa sesión de navegador), el store del cliente no tiene el
-- `draft.origin`/`draft.destination` con coordenadas — la única fuente es esta
-- respuesta. `courier_orders` ya guarda `origin_lat/lng` y
-- `destination_lat/lng` (0232); esto solo los agrega a la salida.
create or replace function public.get_courier_tracking(p_short_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare v_result jsonb;
begin
  select jsonb_build_object(
    'shortId', co.short_id,
    'orderNumber', co.order_number,
    'status', co.status,
    'originName', co.origin_name,
    'destinationName', co.destination_name,
    'originCoordinates', jsonb_build_object('lat', co.origin_lat, 'lng', co.origin_lng),
    'destinationCoordinates',
      jsonb_build_object('lat', co.destination_lat, 'lng', co.destination_lng),
    'itemDescription', co.item_description,
    'feeAmount', co.fee_amount,
    'payer', co.payer,
    'readyAt', co.ready_at,
    'driverName', d.full_name,
    'createdAt', co.created_at,
    'acceptedAt', co.accepted_at,
    'pickedUpAt', co.picked_up_at,
    'deliveredAt', co.delivered_at,
    'cancelledAt', co.cancelled_at,
    'cancelReason', co.cancel_reason
  )
  into v_result
  from public.courier_orders co
  left join public.drivers d on d.id = co.driver_id
  where co.short_id = p_short_id
    and (co.delivered_at is null or co.delivered_at > now() - interval '24 hours');
  return v_result;
end;
$$;
grant execute on function public.get_courier_tracking(text) to anon, authenticated, service_role;
