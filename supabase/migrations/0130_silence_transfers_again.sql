-- =============================================================================
-- 0130 · El silencio vuelve a transferir, con salvaguarda de capacidad
-- =============================================================================
--
-- REVIERTE LA 0119 Y RESTAURA LA SEMÁNTICA DE LA 0043.
-- A partir de aquí, LA VERDAD VIGENTE ES ESTA. Si lees la cabecera de la 0119
-- ("el pedido SE QUEDA con el dueño") o la de la 0121, están describiendo un
-- estado anterior; no las sigas.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- EL CASO DE USO QUE LO JUSTIFICA
--
--   Quien pide el traspaso YA ESTÁ EN EL LOCAL, de pie, con la comida saliendo
--   de cocina. Pide el pedido de un compañero porque puede salir con él ahora.
--
--   El dueño tiene una ventana de 30 segundos para responder. Si no responde
--   —sin cobertura, el móvil en el bolsillo, conduciendo—, lo que importa es que
--   el reparto salga: el silencio se interpreta como conformidad y el pedido
--   pasa al solicitante.
--
--   La 0119 decidió lo contrario ("el silencio NO equivale a ceder") y subió el
--   TTL a 60s. Con un solo motorizado daba igual; con dos personas y comida
--   enfriándose, la espera la paga quien está de pie en el local.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LOS DOS CAMBIOS VAN JUNTOS, POR DISEÑO
--
--   1. Expirar transfiere.
--   2. `transferTtlSeconds` vuelve de 60 a 30.
--
--   Fue la 0119 quien subió el TTL EN EL MISMO ACTO en que quitó la
--   transferencia: con el silencio inocuo, esperar más era gratis. Ahora el
--   silencio cuesta el pedido, así que la ventana vuelve a su valor original.
--   Revertir una cosa sin la otra deja el sistema a medio camino.
--
--   El TTL SIGUE SIENDO CONFIGURABLE. Este UPDATE fija el valor, no lo convierte
--   en constante: nada en código puede hardcodearlo. El cliente ya deriva la
--   ventana de `expires_at - created_at` de cada fila, así que un cambio del
--   ajuste se refleja solo, incluso con solicitudes en vuelo.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SALVAGUARDA: NO SE MUEVE COMIDA A UNA MOCHILA LLENA
--
--   Con esta migración el pedido puede cambiar de manos SIN QUE NINGUNA DE LAS
--   DOS PERSONAS PULSE NADA. Si el solicitante se llenó entre que pidió y que
--   venció la ventana, el sistema le metería comida que no puede llevar y nadie
--   habría decidido eso. Por eso la capacidad se evalúa EN EL MOMENTO DE
--   EXPIRAR, no en el de pedir.
--
--   Regla: SUM(occupancy_slots) de los pedidos activos del solicitante
--   (heading_to_restaurant, waiting_at_restaurant, picked_up) MÁS los slots del
--   pedido entrante, <= `assignment_rules.maxOccupancySlotsPerDriver`.
--
--   Se cuenta en SLOTS y no en pedidos: un pedido puede ocupar hasta 3. Se lee
--   de un ajuste NUEVO en vez de reutilizar `maxOrdersPerDriver`, que cuenta
--   pedidos; mezclar las dos unidades es el defecto que ya se descartó en la UI.
--
--   Si no hay hueco: la solicitud se cierra igualmente como 'expired' y EL
--   PEDIDO SE QUEDA CON SU DUEÑO. No se cancela ni se suelta. El solicitante
--   puede volver a pedirlo cuando entregue.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ASIMETRÍA CONOCIDA Y ACEPTADA: `take` NO TIENE REGLA DE CAPACIDAD
--
--   Esta es la PRIMERA regla de capacidad del sistema en la base. `advance_order`
--   no comprueba nada al tomar un pedido: el "Mochila llena 3/3" vive solo en el
--   cliente y bloquea la UI, no la API. `assignment_rules.maxOrdersPerDriver`
--   está sembrado desde la 0006 y ninguna función lo lee.
--
--   Se acepta la asimetría a propósito: aquí es estructural —el pedido se mueve
--   solo— y en `take` hay una persona pulsando. Cerrar `take` queda registrado
--   como TAREA-CAP, fuera de esta migración.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- TRAZABILIDAD: EL ENUM NO SE TOCA
--
--   'accepted' (sí explícito) · 'rejected' (no explícito) · 'expired' (silencio)
--   siguen siendo tres estados distintos. Lo que cambia es el EFECTO de
--   'expired', y el efecto pertenece al evento, no al estado.
--
--   Como 'expired' pasa a significar dos cosas —transferido por silencio, o
--   caducado sin mover por falta de hueco—, ambos eventos llevan `transferred`
--   y, cuando es false, `reason: 'requester_no_capacity'`. Es el dato que se
--   consulta en una disputa del tipo "yo no lo rechacé, no tenía señal".
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ HAY DROP Y NO SOLO CREATE OR REPLACE
--
--   `apply_order_transfer` pasa de `RETURNS void` a `RETURNS boolean`, y Postgres
--   no permite cambiar el tipo de retorno con CREATE OR REPLACE. El booleano hace
--   falta para que `respond_order_transfer` devuelva `transferred` con la verdad
--   en vez de una constante — que es justo el defecto que la 0121 vino a corregir
--   y que no conviene reintroducir en espejo.
--
--   `expire_order_transfers` NO se toca: llama con `perform`, que funciona igual
--   con una función que ahora devuelve boolean.
-- =============================================================================


-- ── 1 · Ajustes: TTL a 30s y el nuevo tope de slots ──────────────────────────
UPDATE public.app_settings
   SET value = jsonb_set(value, '{transferTtlSeconds}', '30'::jsonb)
 WHERE key = 'timers';

UPDATE public.app_settings
   SET value = value || '{"maxOccupancySlotsPerDriver": 3}'::jsonb
 WHERE key = 'assignment_rules';


-- ── 2 · Fuera la firma que devolvía void ─────────────────────────────────────
DROP FUNCTION IF EXISTS public.apply_order_transfer(
  public.order_transfer_requests, public.transfer_request_status);


-- ── 3 · La firma nueva: devuelve si transfirió ───────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_order_transfer(
  p_req public.order_transfer_requests,
  p_final public.transfer_request_status
) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
declare
  v_transferred boolean := false;
  v_limit int;
  v_used int;
  v_incoming int;
  v_reason text;
begin
  if p_final = 'accepted' then
    -- Aceptar explícito mueve el pedido SIN comprobar capacidad: hay una persona
    -- decidiendo, y esa persona sabe lo que lleva encima. La salvaguarda existe
    -- para el camino que se recorre solo.
    update public.orders set driver_id = p_req.to_driver_id where id = p_req.order_id;
    v_transferred := true;

  elsif p_final = 'expired' then
    select coalesce((value ->> 'maxOccupancySlotsPerDriver')::int, 3)
      into v_limit
      from public.app_settings
     where key = 'assignment_rules';
    v_limit := coalesce(v_limit, 3);

    -- Se BLOQUEAN las filas del solicitante antes de contarlas: sin esto, dos
    -- expiraciones simultáneas podrían leer la misma mochila medio vacía y
    -- meterle dos pedidos. `perform ... for update` y no `select sum(...) for
    -- update` porque Postgres no admite FOR UPDATE junto a un agregado.
    perform 1 from public.orders
      where driver_id = p_req.to_driver_id
        and status in ('heading_to_restaurant', 'waiting_at_restaurant', 'picked_up')
      for update;

    select coalesce(sum(occupancy_slots), 0) into v_used
      from public.orders
     where driver_id = p_req.to_driver_id
       and status in ('heading_to_restaurant', 'waiting_at_restaurant', 'picked_up');

    select coalesce(occupancy_slots, 1) into v_incoming
      from public.orders where id = p_req.order_id;

    if v_used + coalesce(v_incoming, 1) <= v_limit then
      update public.orders set driver_id = p_req.to_driver_id where id = p_req.order_id;
      v_transferred := true;
    else
      -- Sin hueco: la solicitud caduca igual, pero el pedido se queda con su
      -- dueño. Ni se cancela ni se suelta.
      v_reason := 'requester_no_capacity';
    end if;
  end if;

  update public.order_transfer_requests
     set status = p_final, resolved_at = now()
   where id = p_req.id;

  update public.order_transfer_requests
     set status = 'invalidated', resolved_at = now()
   where order_id = p_req.order_id and status = 'pending' and id <> p_req.id;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', p_req.order_id, 'TransferResolved', jsonb_build_object(
    'requestId', p_req.id, 'resolution', p_final,
    'fromDriverId', p_req.from_driver_id, 'toDriverId', p_req.to_driver_id,
    'transferred', v_transferred, 'reason', v_reason));

  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (p_req.order_id,
          case when p_final = 'expired' then 'order.transfer_expired' else 'order.transfer_accepted' end,
          'driver', null,
          jsonb_build_object('requestId', p_req.id,
            'fromDriverId', p_req.from_driver_id, 'toDriverId', p_req.to_driver_id,
            'transferred', v_transferred, 'reason', v_reason));

  return v_transferred;
end;
$function$;


-- ── 4 · Grants: la ACL no sobrevive al DROP ──────────────────────────────────
REVOKE ALL ON FUNCTION public.apply_order_transfer(
  public.order_transfer_requests, public.transfer_request_status)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_order_transfer(
  public.order_transfer_requests, public.transfer_request_status)
  TO service_role;


-- ── 5 · respond_order_transfer deja de mentir en `transferred` ───────────────
-- Solo cambia el cuerpo. Cuerpo tomado de la definición viva (0121) con la rama
-- de expiración perezosa y la de aceptación leyendo el booleano.
CREATE OR REPLACE FUNCTION public.respond_order_transfer(p_request_id uuid, p_responder_user_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_req public.order_transfer_requests;
  v_order public.orders;
  v_driver_id uuid;
  v_transferred boolean;
begin
  select id into v_driver_id from public.drivers where user_id = p_responder_user_id;
  if v_driver_id is null then raise exception 'Motorizado no encontrado' using errcode = 'P0001'; end if;

  -- Lock orders primero (orden consistente), luego la solicitud.
  select o.* into v_order
    from public.orders o
    join public.order_transfer_requests r on r.order_id = o.id
    where r.id = p_request_id
    for update of o;
  if not found then raise exception 'Solicitud no existe' using errcode = 'P0002'; end if;

  select * into v_req from public.order_transfer_requests where id = p_request_id for update;
  if v_req.status <> 'pending' then
    raise exception 'La solicitud ya fue resuelta' using errcode = 'P0001';
  end if;
  if v_req.from_driver_id <> v_driver_id then
    raise exception 'No eres el motorizado de este pedido' using errcode = 'P0001';
  end if;

  -- El pedido cambió de manos o de estado mientras la solicitud vivía.
  if v_order.driver_id is distinct from v_req.from_driver_id
     or v_order.status not in ('heading_to_restaurant', 'waiting_at_restaurant') then
    update public.order_transfer_requests set status = 'invalidated', resolved_at = now() where id = p_request_id;
    return jsonb_build_object('id', p_request_id, 'status', 'invalidated', 'transferred', false);
  end if;

  -- Expiración perezosa. Desde la 0130 vencer SÍ cede el pedido, salvo que el
  -- solicitante no tenga hueco. Da igual que la respuesta llegue tarde
  -- aceptando o rechazando: la ventana ya se cerró, y `transferred` dice lo que
  -- de verdad pasó en vez de una constante.
  if v_req.expires_at is not null and v_req.expires_at <= now() then
    v_transferred := public.apply_order_transfer(v_req, 'expired');
    return jsonb_build_object('id', p_request_id, 'status', 'expired', 'transferred', v_transferred);
  end if;

  if p_accept then
    v_transferred := public.apply_order_transfer(v_req, 'accepted');
    return jsonb_build_object('id', p_request_id, 'status', 'accepted', 'transferred', v_transferred);
  end if;

  update public.order_transfer_requests set status = 'rejected', resolved_at = now() where id = p_request_id;
  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', v_req.order_id, 'TransferResolved',
          jsonb_build_object('requestId', p_request_id, 'resolution', 'rejected'));
  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (v_req.order_id, 'order.transfer_rejected', 'driver', p_responder_user_id,
          jsonb_build_object('requestId', p_request_id));
  return jsonb_build_object('id', p_request_id, 'status', 'rejected', 'transferred', false);
end;
$function$;


-- ── 6 · Guards ───────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_n int;
  v_ret text;
BEGIN
  SELECT count(*) INTO v_n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'apply_order_transfer';
  IF v_n <> 1 THEN
    RAISE EXCEPTION '0130 abortada: quedan % sobrecargas de apply_order_transfer', v_n
      USING errcode = 'P0001';
  END IF;

  SELECT pg_get_function_result(p.oid) INTO v_ret FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'apply_order_transfer';
  IF v_ret <> 'boolean' THEN
    RAISE EXCEPTION '0130 abortada: apply_order_transfer devuelve %, se esperaba boolean', v_ret
      USING errcode = 'P0001';
  END IF;

  IF (SELECT value ->> 'transferTtlSeconds' FROM public.app_settings WHERE key = 'timers') <> '30' THEN
    RAISE EXCEPTION '0130 abortada: transferTtlSeconds no quedó en 30' USING errcode = 'P0001';
  END IF;
END $$;
