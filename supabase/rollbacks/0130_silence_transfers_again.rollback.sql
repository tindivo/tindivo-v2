-- =============================================================================
-- ROLLBACK de la migración 0130 · el silencio vuelve a NO transferir
-- =============================================================================
--
-- 0130 · El silencio vuelve a transferir, con salvaguarda de capacidad.
--
-- Restaura la semántica de la 0119/0121: expirar NO mueve el pedido, y el TTL
-- vuelve a 60 segundos.
--
-- ⚠️ ESTE ARCHIVO REVIERTE LA TRANSFERENCIA POR SILENCIO. Si lo que buscas es
-- revertir `create_business_manual_order` y el vuelto, ese es
-- `rollback-0131.sql`. Los dos archivos estuvieron cruzados: este nombre llegó a
-- contener el rollback de la 0131.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ⚠️ ESTE ROLLBACK NO DESHACE LOS TRASPASOS YA OCURRIDOS
--
--   Mientras la 0130 estuvo viva, cada solicitud que venció sin respuesta movió
--   `orders.driver_id` al solicitante. Esas filas YA ESTÁN CAMBIADAS y este
--   archivo no las devuelve: no hay forma de saber, mirando el pedido, si su
--   motorizado actual lo tomó, lo aceptó o lo heredó por silencio.
--
--   Sí queda rastro para reconstruirlo a mano si hiciera falta: los eventos
--   `order.transfer_expired` con `transferred: true` en `order_event_log` listan
--   exactamente qué pedidos se movieron por esta vía y entre quiénes.
--
--   Antes de revertir, conviene mirar cuántos son:
--     SELECT order_id, data ->> 'fromDriverId', data ->> 'toDriverId', created_at
--       FROM public.order_event_log
--      WHERE event_type = 'order.transfer_expired'
--        AND data ->> 'transferred' = 'true';
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 1 — PRIMERO EL CÓDIGO
--
--       git revert <sha-del-commit-de-0130>
--
--   Cubre la migración, el test de integración que documenta la regla
--   (`release-and-transfer.integration.test.ts`, casos T1 y T1b) y las citas de
--   migración en los comentarios del cliente.
--
--   Los TEXTOS de pantalla ("Pasando el pedido a X", "Traspaso en curso a X")
--   vuelven a ser falsos al revertir: con la semántica vieja el pedido NO se
--   mueve. Si se revierte la base y se dejan esos textos, la pantalla anuncia
--   una transferencia que no ocurre — el mismo defecto que originó todo esto,
--   en espejo.
--
-- PASO 2 — el SQL de abajo, en una sola transacción.
--
-- CÓMO APLICARLO: con el CLI de Supabase, nunca pegándolo en el editor SQL del
-- panel.
-- =============================================================================

BEGIN;

-- ── 1 · Ajustes de vuelta ────────────────────────────────────────────────────
UPDATE public.app_settings
   SET value = jsonb_set(value, '{transferTtlSeconds}', '60'::jsonb)
 WHERE key = 'timers';

-- El tope de slots se retira: sin la transferencia automática no hay camino que
-- mueva un pedido sin que alguien lo pulse, así que la salvaguarda sobra.
UPDATE public.app_settings
   SET value = value - 'maxOccupancySlotsPerDriver'
 WHERE key = 'assignment_rules';


-- ── 2 · Fuera la firma que devuelve boolean ──────────────────────────────────
DROP FUNCTION IF EXISTS public.apply_order_transfer(
  public.order_transfer_requests, public.transfer_request_status);


-- ── 3 · La definición de la 0119/0121, literal ───────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_order_transfer(p_req order_transfer_requests, p_final transfer_request_status)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  -- SOLO cambiar motorizado si la solicitud fue ACEPTADA explícitamente.
  -- Al expirar, el pedido SE QUEDA con el dueño original.
  if p_final = 'accepted' then
    update public.orders set driver_id = p_req.to_driver_id where id = p_req.order_id;
  end if;

  update public.order_transfer_requests set status = p_final, resolved_at = now() where id = p_req.id;
  update public.order_transfer_requests set status = 'invalidated', resolved_at = now()
    where order_id = p_req.order_id and status = 'pending' and id <> p_req.id;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', p_req.order_id, 'TransferResolved', jsonb_build_object(
    'requestId', p_req.id, 'resolution', p_final,
    'fromDriverId', p_req.from_driver_id, 'toDriverId', p_req.to_driver_id));

  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (p_req.order_id,
          case when p_final = 'expired' then 'order.transfer_expired' else 'order.transfer_accepted' end,
          'driver', null,
          jsonb_build_object('requestId', p_req.id,
            'fromDriverId', p_req.from_driver_id, 'toDriverId', p_req.to_driver_id));
end;
$function$;


-- ── 4 · Grants: la ACL no sobrevive al DROP ──────────────────────────────────
REVOKE ALL ON FUNCTION public.apply_order_transfer(
  public.order_transfer_requests, public.transfer_request_status)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_order_transfer(
  public.order_transfer_requests, public.transfer_request_status)
  TO service_role;


-- ── 5 · respond_order_transfer vuelve a la versión de la 0121 ────────────────
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
begin
  select id into v_driver_id from public.drivers where user_id = p_responder_user_id;
  if v_driver_id is null then raise exception 'Motorizado no encontrado' using errcode = 'P0001'; end if;

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

  if v_order.driver_id is distinct from v_req.from_driver_id
     or v_order.status not in ('heading_to_restaurant', 'waiting_at_restaurant') then
    update public.order_transfer_requests set status = 'invalidated', resolved_at = now() where id = p_request_id;
    return jsonb_build_object('id', p_request_id, 'status', 'invalidated', 'transferred', false);
  end if;

  -- Expiración perezosa. Vencer NO cede el pedido: la solicitud se cierra como
  -- 'expired' y el pedido se queda con su dueño.
  if v_req.expires_at is not null and v_req.expires_at <= now() then
    perform public.apply_order_transfer(v_req, 'expired');
    return jsonb_build_object('id', p_request_id, 'status', 'expired', 'transferred', false);
  end if;

  if p_accept then
    perform public.apply_order_transfer(v_req, 'accepted');
    return jsonb_build_object('id', p_request_id, 'status', 'accepted', 'transferred', true);
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


-- ── 6 · Guard ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_ret text;
BEGIN
  SELECT pg_get_function_result(p.oid) INTO v_ret
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'apply_order_transfer';
  IF v_ret <> 'void' THEN
    RAISE EXCEPTION 'rollback 0130 abortado: apply_order_transfer devuelve %, se esperaba void', v_ret
      USING errcode = 'P0001';
  END IF;
END $$;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '0130';

COMMIT;
