-- Una entrega sin aceptar se cancela sola a los `timers.courierAcceptMinutes`
-- (15) minutos (`expire_courier_orders`, 0232). Hasta ahora eso solo lo sabía
-- la base: el cliente leía «15 minutos» escrito a mano en la pantalla y el
-- motorizado no veía nada.
--
-- El plazo sale de AQUÍ para los dos lados: mismo `created_at`, mismo ajuste.
-- Si alguien cambia los 15 en `app_settings`, el cliente y el motorizado ven
-- el número nuevo sin desplegar nada, y el reloj nunca dice algo distinto de
-- lo que hará el barrido.
--
-- `acceptDeadline` solo existe mientras la entrega espera motorizado
-- (`requested`). Aceptada o cerrada, no hay plazo que contar.
create or replace function public.get_courier_tracking(p_short_id text) returns jsonb
  language plpgsql stable security definer set search_path = ''
as $$
declare
  v_result jsonb;
  v_minutes int;
begin
  select coalesce((value ->> 'courierAcceptMinutes')::int, 15) into v_minutes
    from public.app_settings where key = 'timers';
  v_minutes := coalesce(v_minutes, 15);

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
    'cancelReason', co.cancel_reason,
    'acceptMinutes', v_minutes,
    'acceptDeadline', case
      when co.status = 'requested' then co.created_at + make_interval(mins => v_minutes)
    end
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
