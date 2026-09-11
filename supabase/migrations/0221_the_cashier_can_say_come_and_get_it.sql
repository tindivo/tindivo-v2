-- =============================================================================
-- 0221 · La cajera puede decir «ven a recogerlo»
-- =============================================================================
--
-- POR QUÉ. La 0220 dejó el recojo funcionando de punta a punta y avisando por
-- push: al aceptar («ya está en cocina») y al quedar lista la bolsa («pásalo a
-- recoger»). Los dos avisos son correctos y los dos tienen el mismo techo: el
-- push SOLO llega a quien concedió el permiso de notificaciones y conserva una
-- fila viva en `push_subscriptions`. En un piloto eso es una minoría, y el aviso
-- que más cuesta perder es justo el segundo — la comida ya está hecha y se
-- enfría mientras nadie viene.
--
-- WhatsApp no depende de ningún permiso: el cliente ya dio su número y lo
-- verificó por OTP para poder pedir. Así que el panel abre un chat con el
-- mensaje escrito y la cajera solo pulsa enviar.
--
-- QUÉ HACE ESTA FUNCIÓN, Y QUÉ **NO**. Sella que la cajera ABRIÓ el aviso. No
-- puede decir más: `wa.me` se abre en otra pestaña y desde aquí no hay forma de
-- saber si llegó a pulsar enviar, ni si el cliente lo leyó. Por eso la UI dice
-- «Avisado HH:MM» y no «Recibido»; y por eso el sello NO bloquea nada — se
-- puede volver a avisar las veces que haga falta, cada una pisa la marca.
--
-- SIN COLUMNA NUEVA. `tracking_link_sent_at` y `tracking_link_sent_by` existen
-- desde la 0002 y NADIE las escribía (0 de 4 filas con valor, medido en local
-- el 2026-09-07): se diseñaron para exactamente esto —«la cajera le mandó al
-- cliente el enlace de su pedido»— y llevaban desde entonces esperando a un
-- escritor. Es el mismo caso que `cash_owed_at_delivery` antes de la 0141.
--
-- POR QUÉ UNA RPC Y NO UN UPDATE DESDE EL PANEL. `orders` solo tiene policy de
-- escritura para admin (`ord_admin_all`): el negocio no puede tocar la fila
-- directamente, y está bien que siga sin poder. Este es el mismo patrón de
-- `extend_order_prep` — una función con nombre propio, con su guarda de dueño y
-- su guarda de estado, en vez de abrir la tabla.

CREATE OR REPLACE FUNCTION public.mark_pickup_notified(
  p_order_id uuid,
  p_business_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_order public.orders;
  v_business public.businesses;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no existe' USING errcode = 'P0002';
  END IF;

  SELECT * INTO v_business FROM public.businesses WHERE id = v_order.business_id;
  IF v_business.user_id IS DISTINCT FROM p_business_user_id THEN
    RAISE EXCEPTION 'No autorizado sobre este pedido' USING errcode = 'P0001';
  END IF;

  IF v_order.delivery_method <> 'pickup' THEN
    RAISE EXCEPTION 'Esta accion es solo para pedidos de recojo' USING errcode = 'P0001';
  END IF;

  -- SOLO CON LA BOLSA YA LISTA. Avisar «ven a recogerlo» de un pedido que sigue
  -- en cocina manda al cliente a esperar de pie en el mostrador, que es peor que
  -- no avisarle: ocupa el sitio y ademas se le acaba la paciencia contra un
  -- reloj que todavia no habia empezado.
  IF v_order.status <> 'ready_for_pickup' THEN
    RAISE EXCEPTION 'El pedido todavia no esta listo para recoger' USING errcode = 'P0001';
  END IF;

  IF v_order.customer_phone IS NULL THEN
    RAISE EXCEPTION 'Este pedido no tiene telefono al que escribir' USING errcode = 'P0001';
  END IF;

  -- SIN COALESCE: el sello es «la ULTIMA vez que se le aviso», no la primera.
  -- Si la cajera insiste veinte minutos despues, lo que quiere ver en la
  -- tarjeta es esa insistencia, no el primer intento.
  UPDATE public.orders
    SET tracking_link_sent_at = now(),
        tracking_link_sent_by = p_business_user_id
    WHERE id = p_order_id;

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (p_order_id, 'order.pickup_notified', 'business', p_business_user_id,
    jsonb_build_object('channel', 'whatsapp'));

  RETURN jsonb_build_object(
    'id', p_order_id,
    'shortId', v_order.short_id,
    'notifiedAt', now()
  );
END;
$function$;

COMMENT ON FUNCTION public.mark_pickup_notified(uuid, uuid) IS
  'Sella que la cajera ABRIO el aviso de WhatsApp de un recojo listo. No prueba '
  'que se enviara ni que el cliente lo leyera: `wa.me` se abre fuera del panel. '
  'Reutiliza `tracking_link_sent_at`/`_by`, que existian sin escritor desde la '
  '0002. Repetible a proposito. Ver 0221.';

REVOKE ALL ON FUNCTION public.mark_pickup_notified(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_pickup_notified(uuid, uuid) TO service_role;
