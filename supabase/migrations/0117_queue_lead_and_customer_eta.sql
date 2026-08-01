-- =============================================================================
-- 0117 - Parte 5: el lead de cola deja de estar hardcodeado, y el cliente ve un ETA
-- =============================================================================
--
-- 1. EL LEAD DE COLA
-- La ventana del motorizado abre cuando quedan 10 minutos de coccion:
-- `appears_in_queue_at = now() + (prep - 10)`. Ese 10 estaba escrito a mano en
-- CUATRO sitios de tres funciones distintas, y cada migracion que reescribia
-- una de ellas lo volvia a copiar (0012, 0031, 0043, 0059, 0074, 0078, 0079,
-- 0081, 0106, 0107, 0109, 0110, 0114, 0115). Cambiarlo obligaba a encontrar los
-- cuatro y no equivocarse en ninguno.
--
-- Pasa a `app_settings.timers.queueLeadMinutes`, leido por
-- `public.queue_lead_minutes()`. Mismo tratamiento que `noShowWaitMinutes` en
-- 0114: parametro operativo en app_settings, no hardcode (CLAUDE.md).
--
-- EL BORDE: con `prep < lead`, `greatest(0, prep - lead)` da 0 y el pedido es
-- tomable de inmediato. Con prep=10 y lead=10 eso significa "tomable ya, quedan
-- 10 restantes", que es exactamente la regla. Con prep=5 da 0 tambien: tomable
-- ya, quedan 5. No hay negativos ni intervalos invalidos.
--
-- 2. EL ETA DEL CLIENTE
-- Hoy la pantalla de tracking muestra `ETA ~N min` calculado SOLO sobre
-- `estimated_ready_at` (customer/features/tracking/lib/format.ts:97), que es
-- cuando la comida esta lista, no cuando llega. Y si ese campo es NULL se
-- inventa un "25-35 min" fijo.
--
-- Se anaden `travelMinutesMin` (20) y `travelMinutesMax` (25). No son el
-- trayecto real (10-15): el numero publicado cubre el trayecto MAS encontrar la
-- casa y que el cliente salga a la puerta. Con direcciones por referencia verbal
-- ese ultimo tramo no es despreciable y hoy no esta medido. En un pueblo de
-- 5.000 habitantes sobreestimar cuesta una sorpresa agradable; subestimar cuesta
-- un WhatsApp molesto.
--
-- `get_tracking` gana `travelMinutes`, `readyEarlyUsed` y `readyEarlyAt`. El
-- rango se calcula en el cliente a partir de `estimated_ready_at`, que ya
-- viajaba (0099): no se duplica el dato.
--
-- `readyEarlyUsed` hace falta porque marcar listo antes NO toca
-- `estimated_ready_at` (decidido en la Parte 3, divergiendo de prod): sin ese
-- flag el ETA anunciaria 25 minutos para comida ya hecha.
--
-- METODO
-- Generada con `scratch/build-0117.py` desde el `pg_get_functiondef` de las
-- cuatro funciones vivas, con asercion sobre el texto exacto de cada linea
-- tocada. Se afirma ademas que NO cambian: el calculo de comision y envio de
-- `advance_order`, su ventana de no-show, y el CASE que oculta el telefono del
-- motorizado en `get_tracking`. Los cuerpos no se escribieron a mano.
-- =============================================================================

-- 1. Las tres claves nuevas. `||` sobre el jsonb existente conserva lo que ya
--    hay; el `- 'k' || jsonb` de abajo NO se usa a proposito, para no pisar un
--    valor que alguien haya ajustado desde /admin/configuracion.
update public.app_settings
   set value = jsonb_build_object(
         'queueLeadMinutes', 10,
         'travelMinutesMin', 20,
         'travelMinutesMax', 25
       ) || value
 where key = 'timers';

-- 2. El lector unico del lead. SECURITY DEFINER con search_path vacio, como el
--    resto de helpers (invariante 3). STABLE: se llama dentro de un UPDATE.
create or replace function public.queue_lead_minutes()
  returns int
  language sql
  stable
  security definer
  set search_path = ''
as $$
  select coalesce((value ->> 'queueLeadMinutes')::int, 10)
  from public.app_settings where key = 'timers';
$$;

comment on function public.queue_lead_minutes() is
  'Minutos de coccion restantes a los que el pedido entra en la cola del '
  'motorizado. Unico lector de app_settings.timers.queueLeadMinutes.';

revoke execute on function public.queue_lead_minutes() from public, anon;
grant execute on function public.queue_lead_minutes() to authenticated, service_role;

-- 3. Las cuatro funciones, con el literal sustituido.
CREATE OR REPLACE FUNCTION public.advance_order(p_order_id uuid, p_actor_user_id uuid, p_actor_role user_role, p_action text, p_params jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_order public.orders;
  v_business public.businesses;
  v_driver_id uuid;
  v_new_status public.order_status;
  v_band public.distance_band;
  v_commission numeric;
  v_commission_amount numeric;
  v_delivery_fee_charged numeric;
  v_commissions jsonb;
  v_bands jsonb;
  v_prep int;
  v_slots int;
  v_blocked boolean;
  v_cancel_reason public.cancel_reason;
  v_cancel_reason_detail text;
  v_no_show_min int;
  v_remaining_min int;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no existe' USING errcode = 'P0002'; END IF;

  SELECT * INTO v_business FROM public.businesses WHERE id = v_order.business_id;

  IF p_actor_role = 'business' THEN
    IF v_business.user_id <> p_actor_user_id THEN
      RAISE EXCEPTION 'No autorizado sobre este pedido' USING errcode = 'P0001';
    END IF;
  ELSIF p_actor_role = 'driver' THEN
    SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = p_actor_user_id;
    IF v_driver_id IS NULL THEN RAISE EXCEPTION 'Motorizado no encontrado' USING errcode = 'P0001'; END IF;
  END IF;

  CASE p_action
    WHEN 'accept' THEN
      IF p_actor_role <> 'business' THEN RAISE EXCEPTION 'Acción solo del negocio' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'pending_acceptance' THEN RAISE EXCEPTION 'El pedido no esta pendiente de aceptacion' USING errcode = 'P0001'; END IF;
      
      -- El tiempo de cocción que la cajera eligió se guarda en AMBOS flujos.
      v_prep := greatest(1, COALESCE((p_params ->> 'prepTimeMinutes')::int, 20));
      IF v_order.payment_intent = 'prepaid' THEN
        v_new_status := 'awaiting_payment';
      ELSE
        -- Contraentrega: aceptar y empezar a cocinar es el mismo acto de la
        -- cajera. Va directo a preparing, en una sola transacción, para que un
        -- fallo de red no deje el pedido huérfano entre las dos llamadas.
        v_new_status := 'preparing';
      END IF;

    WHEN 'preparing' THEN
      IF p_actor_role <> 'business' THEN RAISE EXCEPTION 'Accion solo del negocio' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'confirmed' THEN RAISE EXCEPTION 'El pedido no esta confirmado' USING errcode = 'P0001'; END IF;
      v_prep := greatest(1, COALESCE((p_params ->> 'prepTimeMinutes')::int, 20));
      v_new_status := 'preparing';

    WHEN 'ready' THEN
      IF p_actor_role <> 'business' THEN RAISE EXCEPTION 'Accion solo del negocio' USING errcode = 'P0001'; END IF;
      -- Los CUATRO estados en los que la comida puede seguir en cocina.
      -- Traducción de prod (order.ts:1019), que permite waiting_driver,
      -- heading_to_restaurant y waiting_at_restaurant; v2 añade preparing.
      IF v_order.status NOT IN ('preparing', 'waiting_driver', 'heading_to_restaurant', 'waiting_at_restaurant') THEN
        RAISE EXCEPTION 'El pedido no esta en cocina ni esperando recojo' USING errcode = 'P0001';
      END IF;

      -- Idempotente: la cajera pudo pulsar dos veces. No se reescribe el
      -- timestamp ni se vuelve a notificar, y NO se lanza excepción.
      IF v_order.ready_early_used THEN
        RETURN (
          SELECT jsonb_build_object(
            'id', id, 'shortId', short_id, 'status', status, 'driverId', driver_id,
            'readyEarlyUsed', ready_early_used, 'readyEarlyAt', ready_early_at,
            'alreadyReady', true
          ) FROM public.orders WHERE id = p_order_id
        );
      END IF;
      -- Sin motorizado, el pedido pasa a esperar recojo. Con motorizado ya
      -- asignado el estado NO cambia: marcar listo declara un hecho sobre la
      -- comida, no una transición del pedido.
      IF v_order.driver_id IS NULL THEN
        v_new_status := 'waiting_driver';
      ELSE
        v_new_status := v_order.status;
      END IF;

    WHEN 'take' THEN
      IF p_actor_role <> 'driver' THEN RAISE EXCEPTION 'Accion solo del motorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status NOT IN ('preparing', 'waiting_driver') THEN RAISE EXCEPTION 'El pedido no esta disponible para tomar' USING errcode = 'P0001'; END IF;
      IF v_order.driver_id IS NOT NULL AND v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'El pedido ya tiene motorizado' USING errcode = 'P0001'; END IF;
      v_new_status := 'heading_to_restaurant';

    WHEN 'arrived' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'heading_to_restaurant' THEN RAISE EXCEPTION 'El motorizado no va al local' USING errcode = 'P0001'; END IF;
      v_new_status := 'waiting_at_restaurant';

    WHEN 'pickup' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'waiting_at_restaurant' THEN RAISE EXCEPTION 'El pedido no esta listo para recoger' USING errcode = 'P0001'; END IF;
      v_band := (p_params ->> 'band')::public.distance_band;
      IF v_order.delivery_method = 'delivery' AND v_band IS NULL THEN
        RAISE EXCEPTION 'Declara la banda (cerca/lejos)' USING errcode = 'P0001';
      END IF;
      v_slots := least(3, greatest(1, COALESCE((p_params ->> 'slots')::int, 1)));
      v_new_status := 'picked_up';

    WHEN 'arrived_customer' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'picked_up' THEN RAISE EXCEPTION 'El pedido no esta en reparto' USING errcode = 'P0001'; END IF;

      -- Idempotente: el motorizado pudo pulsar dos veces, o la cola offline
      -- reintentar. Ni el timestamp ni las coordenadas se reescriben, y NO se
      -- lanza excepcion. Mismo patron que 'ready' (alreadyReady).
      IF v_order.arrived_at_customer_at IS NOT NULL THEN
        RETURN (
          SELECT jsonb_build_object(
            'id', id, 'shortId', short_id, 'status', status, 'driverId', driver_id,
            'arrivedAtCustomerAt', arrived_at_customer_at, 'alreadyArrived', true
          ) FROM public.orders WHERE id = p_order_id
        );
      END IF;

      -- Marcar llegada NO es una transicion: declara un hecho sobre el
      -- motorizado, igual que 'ready' lo declara sobre la comida. El pedido
      -- sigue en picked_up hasta que se entregue o se reporte no-show.
      v_new_status := v_order.status;

    WHEN 'deliver' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'picked_up' THEN RAISE EXCEPTION 'El pedido no esta recogido' USING errcode = 'P0001'; END IF;
      v_new_status := 'delivered';

    WHEN 'no_show' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'picked_up' THEN RAISE EXCEPTION 'Solo se reporta no-show con el pedido en reparto' USING errcode = 'P0001'; END IF;

      -- Guarda 1: sin llegada marcada no hay no-show. Un strike es permanente
      -- (bloquea la contraentrega y no hay forma de retirarlo desde ninguna
      -- interfaz), asi que exige haber estado en la puerta.
      IF v_order.arrived_at_customer_at IS NULL THEN
        RAISE EXCEPTION 'Primero marca que llegaste al domicilio.' USING errcode = 'P0001';
      END IF;

      -- Guarda 2: la ventana de espera. Parametro operativo en app_settings,
      -- no hardcode; 5 minutos si falta la clave.
      SELECT COALESCE((value ->> 'noShowWaitMinutes')::int, 5) INTO v_no_show_min
      FROM public.app_settings WHERE key = 'timers';
      v_no_show_min := COALESCE(v_no_show_min, 5);

      IF now() - v_order.arrived_at_customer_at < (v_no_show_min || ' minutes')::interval THEN
        v_remaining_min := CEIL(EXTRACT(EPOCH FROM ((v_order.arrived_at_customer_at + (v_no_show_min || ' minutes')::interval) - now())) / 60.0)::int;
        IF v_remaining_min < 1 THEN v_remaining_min := 1; END IF;
        RAISE EXCEPTION 'Espera % % más antes de reportar que el cliente no aparece.',
          v_remaining_min,
          CASE WHEN v_remaining_min = 1 THEN 'minuto' ELSE 'minutos' END
          USING errcode = 'P0001';
      END IF;

      v_new_status := 'cancelled';

    WHEN 'cancel' THEN
      IF p_actor_role NOT IN ('business', 'admin') THEN RAISE EXCEPTION 'No autorizado para cancelar' USING errcode = 'P0001'; END IF;
      IF v_order.status IN ('delivered', 'cancelled') THEN RAISE EXCEPTION 'El pedido ya esta cerrado' USING errcode = 'P0001'; END IF;
      v_new_status := 'cancelled';

    ELSE
      RAISE EXCEPTION 'Accion desconocida: %', p_action USING errcode = 'P0001';
  END CASE;

  IF p_action = 'take' THEN
    UPDATE public.orders SET status = v_new_status, driver_id = v_driver_id WHERE id = p_order_id;
  ELSIF p_action = 'preparing' THEN
    UPDATE public.orders
      SET status = v_new_status, prep_time_minutes = v_prep,
          estimated_ready_at = now() + (v_prep || ' minutes')::interval,
          appears_in_queue_at = now() + (greatest(0, v_prep - public.queue_lead_minutes()) || ' minutes')::interval
      WHERE id = p_order_id;
  ELSIF p_action = 'pickup' THEN
    SELECT value INTO v_commissions FROM public.app_settings WHERE key = 'commissions';
    SELECT value INTO v_bands FROM public.app_settings WHERE key = 'delivery_bands';

    -- El envío que se cobra al negocio es el que el cliente PAGÓ de verdad,
    -- no el que se deduce de la banda que declara el motorizado.
    --
    -- Antes salía de la banda: un pedido declarado 'far' cargaba 2.50 al
    -- negocio mientras el cliente había pagado 2.00, porque la creación del
    -- pedido nunca calcula banda y siempre cobra 'near'. El negocio absorbía
    -- esos S/0.50 sin haber hecho nada. Medido en el recorrido de la Parte 4.
    --
    -- La banda se sigue guardando en delivery_distance_band: es el dato que
    -- hará falta para diseñar 'far' de verdad, cuando el lado del cliente
    -- distinga distancia y cobre en consecuencia.
    v_delivery_fee_charged := CASE
      WHEN v_order.delivery_method = 'pickup' THEN 0
      ELSE COALESCE(v_order.delivery_fee, (v_bands ->> 'near')::numeric, 2.00)
    END;

    -- Cada rama resuelve SOLO la comisión. `commissions` guarda el TOTAL que
    -- se cobra al negocio, así que la comisión es ese total menos el envío.
    IF v_order.delivery_method = 'pickup' THEN
      v_commission_amount := COALESCE(
        v_business.commission_override_pickup,
        (v_commissions ->> 'pickup')::numeric,
        0.50
      );
    ELSIF v_band = 'near' THEN
      v_commission_amount := COALESCE(
        v_business.commission_override_near,
        (v_commissions ->> 'near')::numeric,
        3.00
      ) - v_delivery_fee_charged;
    ELSE -- far
      v_commission_amount := COALESCE(
        v_business.commission_override_far,
        (v_commissions ->> 'far')::numeric,
        3.50
      ) - v_delivery_fee_charged;
    END IF;

    v_commission := v_commission_amount + v_delivery_fee_charged;

    UPDATE public.orders
      SET status = v_new_status,
          delivery_distance_band = v_band,
          tindivo_commission = v_commission,
          commission_amount = v_commission_amount,
          delivery_fee_charged = v_delivery_fee_charged,
          occupancy_slots = v_slots
      WHERE id = p_order_id;
  ELSIF p_action = 'arrived_customer' THEN
    -- Las coordenadas son OPCIONALES: si el motorizado denego el permiso de
    -- GPS o el fix tardo mas de 5s, llegan ausentes o en null y la llegada se
    -- registra igual. Registrar la hora es lo que abre la ventana de no-show y
    -- destapa el telefono del motorizado en get_tracking; el GPS solo sirve
    -- para resolver un reclamo despues.
    UPDATE public.orders
      SET arrived_at_customer_at = now(),
          arrived_at_customer_lat = (p_params ->> 'lat')::numeric,
          arrived_at_customer_lng = (p_params ->> 'lng')::numeric,
          arrived_at_customer_accuracy_m = (p_params ->> 'accuracy_m')::numeric
      WHERE id = p_order_id;
  ELSIF p_action = 'deliver' THEN
    UPDATE public.orders
      SET status = v_new_status,
          payment_real = COALESCE((p_params ->> 'paymentReal')::public.payment_real, 'paid_cash')
      WHERE id = p_order_id;
  ELSIF p_action = 'no_show' THEN
    UPDATE public.orders
      SET status = v_new_status,
          cancel_reason = 'no_show',
          cancelled_by = p_actor_user_id,
          cancelled_at = now()
      WHERE id = p_order_id;
    INSERT INTO public.customer_strikes (
      customer_user_id, phone, delivery_reference,
      delivery_coordinates_lat, delivery_coordinates_lng, order_id, reason, reported_by
    ) VALUES (
      v_order.customer_user_id, v_order.customer_phone, v_order.delivery_reference,
      v_order.delivery_coordinates_lat, v_order.delivery_coordinates_lng, p_order_id, 'no_show', p_actor_user_id
    );
    v_blocked := public.customer_contraentrega_blocked(v_order.customer_phone, v_order.delivery_reference);
    IF v_blocked AND v_order.customer_user_id IS NOT NULL THEN
      UPDATE public.customer_profiles
        SET contraentrega_blocked = true,
            strikes = (SELECT count(*) FROM public.customer_strikes WHERE phone = v_order.customer_phone)
        WHERE user_id = v_order.customer_user_id;
    END IF;
    INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('order', p_order_id, 'CustomerNoShow', jsonb_build_object(
      'phone', v_order.customer_phone, 'reference', v_order.delivery_reference, 'blocked', v_blocked
    ));
  ELSIF p_action = 'cancel' THEN
    v_cancel_reason := COALESCE((p_params ->> 'reason')::public.cancel_reason, 'business_cancelled');
    v_cancel_reason_detail := NULLIF(p_params ->> 'cancelReasonDetail', '');

    IF v_cancel_reason = 'business_cancelled' AND v_cancel_reason_detail IS NULL THEN
      RAISE EXCEPTION 'Motivo detallado de cancelación es obligatorio para cancelaciones de negocio' USING errcode = 'P0001';
    END IF;

    UPDATE public.orders
      SET status = v_new_status,
          cancel_reason = v_cancel_reason,
          cancel_reason_detail = v_cancel_reason_detail,
          cancel_note = NULLIF(p_params ->> 'reasonText', ''),
          cancelled_by = p_actor_user_id,
          cancelled_at = now()
      WHERE id = p_order_id;
  ELSIF p_action = 'accept' THEN
    IF v_new_status = 'preparing' THEN
      -- Contraentrega: arranca el reloj aquí mismo.
      UPDATE public.orders
        SET status = v_new_status, prep_time_minutes = v_prep,
            estimated_ready_at = now() + (v_prep || ' minutes')::interval,
            appears_in_queue_at = now() + (greatest(0, v_prep - public.queue_lead_minutes()) || ' minutes')::interval
        WHERE id = p_order_id;
    ELSE
      -- Prepago: se guarda el tiempo elegido, pero el reloj NO arranca hasta
      -- que el comprobante esté verificado.
      UPDATE public.orders
        SET status = v_new_status, prep_time_minutes = v_prep
        WHERE id = p_order_id;
    END IF;
  ELSIF p_action = 'ready' THEN
    IF v_order.driver_id IS NULL THEN
      -- appears_in_queue_at se fuerza a now() por integridad del dato y
      -- paridad con prod. Desde 0108 waiting_driver ya es tomable sin
      -- condición de tiempo, así que no cambia la tomabilidad por sí solo.
      UPDATE public.orders
        SET status = v_new_status,
            ready_early_used = true,
            ready_early_at = now(),
            appears_in_queue_at = least(appears_in_queue_at, now())
        WHERE id = p_order_id;
    ELSE
      UPDATE public.orders
        SET ready_early_used = true,
            ready_early_at = now()
        WHERE id = p_order_id;
    END IF;
  ELSE
    UPDATE public.orders SET status = v_new_status WHERE id = p_order_id;
  END IF;

  INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('order', p_order_id, 'OrderStatusChanged', jsonb_build_object('action', p_action, 'status', v_new_status));

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (p_order_id, 'order.' || p_action, p_actor_role::text, p_actor_user_id, p_params);

  RETURN (
    SELECT jsonb_build_object(
      'id', id, 'shortId', short_id, 'status', status, 'driverId', driver_id,
      'band', delivery_distance_band, 'tindivoCommission', tindivo_commission,
      'commissionAmount', commission_amount, 'deliveryFeeCharged', delivery_fee_charged,
      'paymentReal', payment_real, 'prepTimeMinutes', prep_time_minutes,
      'cancelReason', cancel_reason, 'cancelReasonDetail', cancel_reason_detail,
      'cancelledAt', cancelled_at,
      'readyEarlyUsed', ready_early_used, 'readyEarlyAt', ready_early_at
    ) FROM public.orders WHERE id = p_order_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_business_manual_order(p_business_user_id uuid, p_delivery_method delivery_method, p_payment_intent payment_intent, p_order_amount numeric, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_prep_time_minutes integer DEFAULT 20, p_delivery_reference text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_client_pays_with numeric DEFAULT NULL::numeric, p_yape_amount numeric DEFAULT NULL::numeric, p_cash_amount numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_business public.businesses;
  v_order_id uuid;
  v_short_id text;
  v_order_number bigint;
  v_delivery_fee numeric;
  v_bands jsonb;
  v_prep int;
  v_cash_part numeric;
  v_change numeric;
  v_clean_phone text;
BEGIN
  SELECT * INTO v_business FROM public.businesses WHERE user_id = p_business_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Negocio no encontrado' USING errcode = 'P0002'; END IF;
  IF v_business.is_blocked THEN RAISE EXCEPTION 'Tu cuenta esta suspendida' USING errcode = 'P0001'; END IF;
  IF NOT v_business.is_active THEN RAISE EXCEPTION 'Negocio inactivo' USING errcode = 'P0001'; END IF;
  IF COALESCE(p_order_amount, 0) <= 0 THEN RAISE EXCEPTION 'Monto invalido' USING errcode = 'P0001'; END IF;

  -- 1. Validar referencia condicional a delivery_method
  IF p_delivery_method = 'delivery' AND length(trim(COALESCE(p_delivery_reference, ''))) < 5 THEN
    RAISE EXCEPTION 'La dirección o referencia de entrega debe tener al menos 5 caracteres' USING errcode = 'P0001';
  END IF;

  -- 2. Normalizar teléfono (dígitos limpios) y validar formato
  v_clean_phone := NULLIF(regexp_replace(COALESCE(p_customer_phone, ''), '\D', '', 'g'), '');
  IF v_clean_phone IS NOT NULL AND v_clean_phone !~ '^9\d{8}$' THEN
    RAISE EXCEPTION 'Formato de teléfono inválido' USING errcode = 'P0001';
  END IF;

  -- 3. Validar blacklist de teléfonos de prueba
  IF v_clean_phone IS NOT NULL AND v_clean_phone IN (
    '999999999', '987654321', '912345678', '955555555', '900000000', '911111111', '123456789'
  ) THEN
    RAISE EXCEPTION 'Número de teléfono de prueba no permitido' USING errcode = 'P0001';
  END IF;

  -- 4. Antifraude del cliente
  IF v_clean_phone IS NOT NULL AND public.customer_is_blocked(NULL, v_clean_phone) THEN
    RAISE EXCEPTION 'Cliente temporalmente bloqueado por incidentes reiterados de entrega.'
      USING errcode = 'P0001';
  END IF;

  v_prep := greatest(5, least(COALESCE(p_prep_time_minutes, 20), 120));

  IF p_delivery_method = 'pickup' THEN
    v_delivery_fee := 0;
  ELSE
    SELECT value INTO v_bands FROM public.app_settings WHERE key = 'delivery_bands';
    v_delivery_fee := COALESCE((v_bands ->> 'near')::numeric, v_business.delivery_fee, 2.00);
  END IF;

  IF p_payment_intent = 'pending_mixed' THEN
    v_cash_part := COALESCE(p_cash_amount, 0);
    IF COALESCE(p_yape_amount, 0) + v_cash_part <> p_order_amount + v_delivery_fee THEN
      RAISE EXCEPTION 'La suma de Yape y Efectivo debe ser igual al total' USING errcode = 'P0001';
    END IF;
  ELSE
    v_cash_part := CASE WHEN p_payment_intent = 'pending_cash' THEN p_order_amount + v_delivery_fee ELSE 0 END;
  END IF;

  IF (p_payment_intent = 'pending_cash' OR p_payment_intent = 'pending_mixed') AND p_client_pays_with IS NOT NULL THEN
    IF p_client_pays_with < v_cash_part THEN
      RAISE EXCEPTION 'El monto con el que pagará el cliente debe cubrir la parte en efectivo' USING errcode = 'P0001';
    END IF;
    v_change := round(p_client_pays_with - v_cash_part, 2);
  ELSE
    v_change := 0;
  END IF;

  INSERT INTO public.orders (
    business_id, customer_user_id, source, delivery_method, payment_intent,
    customer_name, customer_phone, delivery_address, delivery_reference,
    order_amount, delivery_fee, status, prep_time_minutes,
    estimated_ready_at, appears_in_queue_at,
    client_pays_with, yape_amount, cash_amount
  ) VALUES (
    v_business.id, NULL, 'business_manual', p_delivery_method, p_payment_intent,
    NULLIF(trim(COALESCE(p_customer_name, '')), ''), v_clean_phone,
    CASE WHEN p_delivery_method = 'pickup' THEN 'Recojo en tienda' ELSE 'Pedido manual' END,
    CASE WHEN p_delivery_method = 'pickup' THEN NULL ELSE NULLIF(trim(COALESCE(p_delivery_reference, '')), '') END,
    p_order_amount, v_delivery_fee, 'preparing', v_prep,
    -- El reloj arranca aquí: la cajera crea y acepta en el mismo acto.
    now() + (v_prep || ' minutes')::interval,
    -- Ventana de cola: se abre cuando quedan 10 minutos RESTANTES.
    -- El 10 sale literal, igual que en advance_order; se centraliza en app_settings después.
    now() + (greatest(0, v_prep - public.queue_lead_minutes()) || ' minutes')::interval,
    p_client_pays_with, p_yape_amount, p_cash_amount
  ) RETURNING id, short_id, order_number INTO v_order_id, v_short_id, v_order_number;

  INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  VALUES ('order', v_order_id, 'OrderCreated', jsonb_build_object(
    'shortId', v_short_id, 'businessId', v_business.id,
    'orderAmount', p_order_amount, 'deliveryFee', v_delivery_fee,
    'deliveryMethod', p_delivery_method, 'paymentIntent', p_payment_intent,
    'source', 'business_manual', 'prepTimeMinutes', v_prep,
    'clientPaysWith', p_client_pays_with, 'yapeAmount', p_yape_amount, 'cashAmount', p_cash_amount
  ));

  INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  VALUES (v_order_id, 'order.created_manual', 'business', p_business_user_id,
    jsonb_build_object('deliveryMethod', p_delivery_method, 'paymentIntent', p_payment_intent, 'amount', p_order_amount));

  RETURN jsonb_build_object(
    'id', v_order_id,
    'shortId', v_short_id,
    'orderNumber', v_order_number,
    'status', 'preparing',
    'total', p_order_amount + v_delivery_fee,
    'change', v_change
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_order(p_order_id uuid, p_actor_user_id uuid, p_actor_role user_role, p_pass boolean, p_reason text DEFAULT NULL::text, p_reason_code text DEFAULT NULL::text, p_prep_time_minutes integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_order public.orders;
  v_business public.businesses;
  v_context text;
  v_prep int;
BEGIN
  -- Tiempo de cocción elegido por la cajera. Acotado igual que en advance_order.
  v_prep := greatest(1, COALESCE(p_prep_time_minutes, 20));
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no existe' USING errcode = 'P0002'; END IF;
  IF v_order.status <> 'validando' THEN
    RETURN jsonb_build_object('ok', false, 'status', v_order.status);
  END IF;

  IF p_actor_role = 'business' THEN
    SELECT * INTO v_business FROM public.businesses WHERE id = v_order.business_id;
    IF v_business.user_id <> p_actor_user_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
  ELSIF p_actor_role <> 'admin' THEN
    RAISE EXCEPTION 'Solo el negocio o admin validan' USING errcode = 'P0001';
  END IF;

  -- Determinar el contexto: usar la columna explícita, o deducir de proof_attempt
  -- (backward-compat para órdenes que entraron a validando antes de esta migración)
  v_context := COALESCE(v_order.validation_context,
    CASE WHEN v_order.proof_attempt >= 1 THEN 'proof' ELSE 'antifraud' END);

  IF p_pass THEN
    -- =========================================================================
    -- RAMA PASS = TRUE
    -- =========================================================================
    IF v_context = 'proof' THEN
      -- CASO A: Verificación de comprobante real (proof_attempt >= 1).
      -- El cliente subió un voucher de Yape/Plin → la cajera lo revisa y aprueba.
      -- Transición: validando → preparing + payment_proof_status = 'verified'.
      -- Es el instante exacto en que la cocina empieza: aquí arranca el reloj.
      UPDATE public.orders
        SET status = 'preparing',
            -- El reloj arranca al verificar el pago, no antes.
            prep_time_minutes   = COALESCE(v_order.prep_time_minutes, v_prep),
            estimated_ready_at  = now() + (COALESCE(v_order.prep_time_minutes, v_prep) || ' minutes')::interval,
            appears_in_queue_at = now() + (greatest(0, COALESCE(v_order.prep_time_minutes, v_prep) - public.queue_lead_minutes()) || ' minutes')::interval,
            payment_proof_status = CASE WHEN v_order.payment_intent = 'prepaid' THEN 'verified' ELSE payment_proof_status END,
            payment_verified_at  = CASE WHEN v_order.payment_intent = 'prepaid' THEN now() ELSE payment_verified_at END,
            payment_verified_by  = CASE WHEN v_order.payment_intent = 'prepaid' THEN p_actor_user_id ELSE payment_verified_by END
        WHERE id = p_order_id;

      INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
      VALUES ('order', p_order_id, 'OrderProofVerified', jsonb_build_object('shortId', v_order.short_id));
      INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
      VALUES (p_order_id, 'order.proof_verified', p_actor_role::text, p_actor_user_id,
        jsonb_build_object('context', 'proof'));

      RETURN jsonb_build_object('ok', true, 'status', 'preparing', 'context', 'proof');

    ELSE
      -- CASO B: Antifraude — validación por llamada (proof_attempt = 0).
      -- La cajera llamó al cliente para verificar que el pedido es legítimo.
      -- NO hay comprobante de pago de por medio.
      -- Ramificar por payment_intent para decidir el siguiente estado.
      IF v_order.payment_intent = 'prepaid' THEN
        -- Prepago: soltar el hold de antifraude y volver a pending_acceptance.
        -- El pedido sigue su curso normal: accept → awaiting_payment → pago → verificar.
        -- NO marcar payment_proof_status = 'verified' (no se ha verificado ningún pago).
        UPDATE public.orders
          SET status = 'pending_acceptance'
          WHERE id = p_order_id;

        INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
        VALUES ('order', p_order_id, 'OrderValidated', jsonb_build_object('shortId', v_order.short_id));
        INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
        VALUES (p_order_id, 'order.validation_passed', p_actor_role::text, p_actor_user_id,
          jsonb_build_object('context', 'antifraud', 'paymentIntent', 'prepaid', 'nextStatus', 'pending_acceptance'));

        RETURN jsonb_build_object('ok', true, 'status', 'pending_acceptance', 'context', 'antifraud');

      ELSE
        -- Contraentrega (pending_cash / pending_wallet / pending_mixed):
        -- La cajera ya validó por teléfono → saltar pending_acceptance y confirmed,
        -- directo a preparing en la misma transacción.
        UPDATE public.orders
          SET status = 'preparing',
              prep_time_minutes   = v_prep,
              estimated_ready_at  = now() + (v_prep || ' minutes')::interval,
              appears_in_queue_at = now() + (greatest(0, v_prep - public.queue_lead_minutes()) || ' minutes')::interval
          WHERE id = p_order_id;

        INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
        VALUES ('order', p_order_id, 'OrderValidated', jsonb_build_object('shortId', v_order.short_id));
        INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
        VALUES (p_order_id, 'order.validation_passed', p_actor_role::text, p_actor_user_id,
          jsonb_build_object('context', 'antifraud', 'paymentIntent', v_order.payment_intent, 'nextStatus', 'preparing'));

        RETURN jsonb_build_object('ok', true, 'status', 'preparing', 'context', 'antifraud');
      END IF;
    END IF;

  ELSE
    -- =========================================================================
    -- RAMA PASS = FALSE (rechazo)
    -- =========================================================================
    IF v_context = 'proof' AND v_order.payment_intent = 'prepaid' AND v_order.proof_attempt < 2 THEN
      -- Rechazo de comprobante con reintento permitido (attempt 1 de 2).
      -- Vuelve a awaiting_payment para que el cliente suba otro comprobante.
      UPDATE public.orders
        SET status = 'awaiting_payment',
            payment_proof_status = 'rejected',
            rejection_reason_code = COALESCE(NULLIF(p_reason_code, ''), 'invalid_proof'),
            rejection_reason_text = p_reason,
            rejected_at = now(),
            rejected_by = p_actor_user_id
        WHERE id = p_order_id;

      INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
      VALUES ('order', p_order_id, 'OrderStatusChanged', jsonb_build_object('action', 'validate_fail_retry', 'status', 'awaiting_payment'));
      INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
      VALUES (p_order_id, 'order.validation_failed_retry', p_actor_role::text, p_actor_user_id,
        jsonb_build_object('reason', p_reason, 'reasonCode', p_reason_code, 'attempt', v_order.proof_attempt, 'context', 'proof'));

      RETURN jsonb_build_object('ok', true, 'status', 'awaiting_payment', 'outcome', 'retry_allowed', 'context', 'proof');

    ELSE
      -- Rechazo definitivo: cancelar el pedido.
      -- - proof context + prepaid + proof_attempt >= 2 → proof_rejected_final
      -- - proof context + no prepaid → business_cancelled
      -- - antifraud context → business_cancelled (la cajera no pudo validar)
      UPDATE public.orders
        SET status = 'cancelled',
            cancel_reason = CASE
              WHEN v_context = 'proof' AND v_order.payment_intent = 'prepaid'
                THEN 'proof_rejected_final'::public.cancel_reason
              ELSE 'business_cancelled'::public.cancel_reason
            END,
            cancelled_by = p_actor_user_id,
            cancel_note = p_reason,
            payment_proof_status = CASE
              WHEN v_context = 'proof' AND v_order.payment_intent = 'prepaid'
                THEN 'rejected' ELSE payment_proof_status
            END,
            rejection_reason_code = COALESCE(NULLIF(p_reason_code, ''),
              CASE WHEN v_context = 'proof' AND v_order.payment_intent = 'prepaid'
                THEN 'invalid_proof' ELSE NULL END),
            rejection_reason_text = p_reason,
            rejected_at = now(),
            rejected_by = p_actor_user_id
        WHERE id = p_order_id;

      INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
      VALUES ('order', p_order_id, 'OrderStatusChanged', jsonb_build_object('action', 'validate_fail', 'status', 'cancelled'));
      INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
      VALUES (p_order_id, 'order.validation_failed', p_actor_role::text, p_actor_user_id,
        jsonb_build_object('reason', p_reason, 'reasonCode', p_reason_code, 'context', v_context));

      RETURN jsonb_build_object('ok', true, 'status', 'cancelled', 'outcome', 'cancelled_final', 'context', v_context);
    END IF;
  END IF;
END;
$function$;

-- 4. get_tracking: travelMinutes + readyEarly* para el ETA del cliente.
CREATE OR REPLACE FUNCTION public.get_tracking(p_short_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'shortId', o.short_id, 'orderNumber', o.order_number, 'businessName', b.name,
    'businessAccentColor', b.accent_color, 'status', o.status, 'deliveryMethod', o.delivery_method,
    'paymentIntent', o.payment_intent, 'cancelReason', o.cancel_reason,
    'paysWith', o.client_pays_with, 'changeToGive', o.change_to_give,
    'estimatedReadyAt', o.estimated_ready_at, 'deliveredAt', o.delivered_at, 'driverName', d.full_name,
    'arrivedAtCustomerAt', o.arrived_at_customer_at,
    'readyEarlyUsed', coalesce(o.ready_early_used, false), 'readyEarlyAt', o.ready_early_at,
    'travelMinutes', jsonb_build_object(
      'min', coalesce((t.value ->> 'travelMinutesMin')::int, 20),
      'max', coalesce((t.value ->> 'travelMinutesMax')::int, 25)
    ),
    'driverPhone', CASE WHEN o.arrived_at_customer_at IS NOT NULL THEN d.phone ELSE NULL END,
    'amount', o.order_amount, 'deliveryFee', o.delivery_fee, 'total', o.order_amount + o.delivery_fee,
    'createdAt', o.created_at,
    'awaitingPaymentAt', o.awaiting_payment_at,
    'proofAttempt', o.proof_attempt,
    'proofUrl', o.comprobante_prepago_url,
    'hasAppeal', EXISTS (
      SELECT 1 FROM public.reports r
      WHERE r.order_id = o.id AND r.type = 'rejected_proof_disputed'
    ),
    'items', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', i.item_name_snapshot, 'qty', i.quantity, 'lineTotal', i.line_total,
          'modifiers', coalesce((
            SELECT jsonb_agg(
              jsonb_build_object(
                'group', m.group_name_snapshot,
                'name', m.option_name_snapshot,
                'price', m.additional_price_snapshot
              )
              ORDER BY m.created_at
            )
            FROM public.customer_order_item_modifiers m WHERE m.item_id = i.id
          ), '[]'::jsonb)
        )
        ORDER BY i.created_at
      )
      FROM public.customer_order_items i WHERE i.order_id = o.id
    ), '[]'::jsonb)
  )
  INTO v_result
  FROM public.orders o
  JOIN public.businesses b ON b.id = o.business_id
  LEFT JOIN public.drivers d ON d.id = o.driver_id
  LEFT JOIN public.app_settings t ON t.key = 'timers'
  WHERE o.short_id = p_short_id
    AND (o.delivered_at IS NULL OR o.delivered_at > now() - interval '24 hours');
  RETURN v_result;
END;
$function$;

grant execute on function public.get_tracking(text) to anon, authenticated;
