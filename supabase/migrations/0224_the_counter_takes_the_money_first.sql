-- 0224 · EN EL MOSTRADOR SE COBRA ANTES DE COCINAR, Y UN PLANTÓN PAGADO NO ES UNA FALTA
--
-- Segunda mitad de la regla que abrió la 0223. Aquella cerró QUÉ se puede
-- elegir para pagar un recojo; esta mueve CUÁNDO entra el dinero, y arregla lo
-- que ese movimiento rompe al otro lado.
--
-- ── 1 · EL COBRO SE ADELANTA AL MOMENTO DE ACEPTAR ───────────────────────────
--
-- Un recojo «ahora» tiene al cliente de pie delante de la caja. Ese es el único
-- instante en que se le puede cobrar, y ocurre antes de que nadie toque una
-- sartén. Hasta ahora el dinero entraba en `handover`, o sea DESPUÉS de la
-- cocción, apoyándose en que la cajera mirando a la persona bastaba como
-- garantía.
--
-- Basta contra el pedido falso —quien no está, no lo acepta— pero no contra el
-- que se arrepiente: entre aceptar y entregar hay una cocción entera, y quien
-- se va en ese rato deja un plato hecho y sin pagar. Cobrando al aceptar, ese
-- hueco deja de existir.
--
-- `payment_verified_at` NO es una columna nueva ni reciclada a la fuerza: ya
-- significaba «una persona confirmó que el dinero llegó» —la escribe
-- `validate_order` al aprobar una captura de Yape (0181/0189)— y aquí es la
-- misma afirmación, de la misma cajera, sobre billetes en vez de sobre un
-- pantallazo. Que las dos vías escriban la MISMA columna es lo que permite el
-- punto 2 con una sola pregunta.
--
-- ── 2 · UN PLANTÓN DE UN PEDIDO PAGADO YA NO DEJA STRIKE ─────────────────────
--
-- Y esto es lo que el punto 1 rompía si no se tocaba. El strike existe
-- (DECISIONS §8) para frenar a quien le genera PÉRDIDAS al negocio: comida
-- hecha que nadie paga. Con el dinero siempre dentro antes de cocinar, un
-- plantón de recojo deja de ser una pérdida —el negocio se queda con el dinero
-- Y con el plato— y el strike pasaría a castigar a quien pagó.
--
-- El castigo no es simbólico: a los dos strikes la cuenta queda en prepago
-- obligado (que este cliente ya hizo) y a los tres, bloqueada 30 días. Un
-- vecino que pagó su pollo y tuvo una emergencia acabaría sin poder pedir en el
-- único restaurante del pueblo. Es exactamente el problema que la regla del
-- cobro por adelantado venía a evitar, reaparecido por el otro lado.
--
-- El pedido se sigue cancelando y el evento `CustomerNoShow` se sigue emitiendo
-- SIEMPRE (hay que poder contar los plantones), con `paid`/`strike` dentro para
-- que quien lea el outbox no tenga que deducirlo de la ausencia de una fila.
--
-- ── LO QUE NO CAMBIA, Y CONVIENE DECIRLO ─────────────────────────────────────
--
-- · El mostrador sigue SIN autocancelar nada (0220): la comida está hecha, y
--   hacerla desaparecer de la pantalla sin que nadie mire es perder el único
--   momento en que se puede decidir qué pasa con ella. Quien declara el plantón
--   es la cajera, y ahora además sabe que no le está poniendo una falta a nadie
--   que haya pagado.
-- · No hay devolución, y eso se le dice al cliente ANTES de pagar, en el
--   checkout. La política es «te lo guardamos hasta que cierre el local; si no
--   pasas, no se devuelve». Tindivo no retiene fondos —el Yape va directo al
--   negocio— así que la plataforma no puede ejecutar un reembolso aunque
--   quisiera: solo puede registrar lo que el negocio decida.
-- · El delivery no se toca en ninguno de los dos puntos.

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
  v_release_reason text;
  -- Cobro real de la entrega (0140).
  v_payment_real public.payment_real;
  -- 0224 - el cobro de un recojo «ahora» ocurre AL ACEPTAR, no al entregar.
  v_cobro_mostrador boolean := false;
  v_total numeric;
  v_cash numeric;
  v_yape numeric;
  v_pays_with numeric;
  v_cash_owed numeric;
  v_change numeric;
  -- Adelanto de vuelto y parte en efectivo del cobro real (0146).
  v_advance numeric;
  v_planned_cash numeric;
  v_cash_portion numeric;
  -- 0220: desde cuándo la comida lleva esperando en el mostrador.
  v_waiting_since timestamptz;
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
      IF p_actor_role <> 'business' THEN RAISE EXCEPTION 'Accion solo del negocio' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'pending_acceptance' THEN RAISE EXCEPTION 'El pedido no esta pendiente de aceptacion' USING errcode = 'P0001'; END IF;
      
      v_prep := greatest(1, COALESCE((p_params ->> 'prepTimeMinutes')::int, 20));

      -- EN EL MOSTRADOR SE COBRA ANTES DE COCINAR (0224).
      --
      -- Regla del restaurante del piloto. Un recojo «ahora» tiene al cliente de
      -- pie delante de la caja: es el unico instante en que se le puede cobrar,
      -- y ocurre ANTES de que nadie toque una sarten.
      --
      -- La 0220 dejaba el cobro para `handover`, apoyandose en que la cajera
      -- mirando a la persona bastaba como garantia. Basta contra el pedido
      -- falso, no contra el que se arrepiente: entre aceptar y entregar hay una
      -- coccion entera, y quien se va en ese rato deja un plato hecho y sin
      -- pagar. Cobrando aqui, ese hueco no existe.
      --
      -- El prepago NO entra: su dinero ya esta dentro por otra via, y su
      -- `payment_verified_at` lo escribe `validate_order` al aprobar la captura.
      -- Un recojo «mas tarde» del canal cliente tampoco puede caer aqui sin ser
      -- prepago: lo impide el CHECK de la 0223.
      v_cobro_mostrador := (
        v_order.delivery_method = 'pickup'
        AND v_order.pickup_timing = 'now'
        AND v_order.payment_intent <> 'prepaid'
      );
      IF v_cobro_mostrador THEN
        v_payment_real := (p_params ->> 'paymentReal')::public.payment_real;
        IF v_payment_real IS NULL THEN
          RAISE EXCEPTION 'Cobra el pedido antes de mandarlo a cocina: declara si te pago en efectivo o por Yape'
            USING errcode = 'P0001';
        END IF;
        IF v_payment_real NOT IN ('paid_cash', 'paid_yape') THEN
          -- `paid_mixed` queda fuera por lo mismo que en `handover`: partir un
          -- cobro en dos existe porque el motorizado lleva efectivo y el cliente
          -- completa por Yape. En el mostrador no hay tal reparto que declarar.
          RAISE EXCEPTION 'Metodo de cobro no valido en el mostrador' USING errcode = 'P0001';
        END IF;
      END IF;

      IF v_order.payment_intent = 'prepaid' THEN
        v_new_status := 'awaiting_payment';
      ELSE
        v_new_status := 'preparing';
      END IF;

    WHEN 'preparing' THEN
      IF p_actor_role <> 'business' THEN RAISE EXCEPTION 'Accion solo del negocio' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'confirmed' THEN RAISE EXCEPTION 'El pedido no esta confirmado' USING errcode = 'P0001'; END IF;
      v_prep := greatest(1, COALESCE((p_params ->> 'prepTimeMinutes')::int, 20));
      v_new_status := 'preparing';

    WHEN 'ready' THEN
      IF p_actor_role <> 'business' THEN RAISE EXCEPTION 'Accion solo del negocio' USING errcode = 'P0001'; END IF;
      IF v_order.status NOT IN ('preparing', 'waiting_driver', 'heading_to_restaurant', 'waiting_at_restaurant') THEN
        RAISE EXCEPTION 'El pedido no esta en cocina ni esperando recojo' USING errcode = 'P0001';
      END IF;

      IF v_order.ready_early_used THEN
        RETURN (
          SELECT jsonb_build_object(
            'id', id, 'shortId', short_id, 'status', status, 'driverId', driver_id,
            'readyEarlyUsed', ready_early_used, 'readyEarlyAt', ready_early_at,
            'alreadyReady', true
          ) FROM public.orders WHERE id = p_order_id
        );
      END IF;
      -- EN UN RECOJO NO HAY MOTORIZADO QUE ESPERAR (0220).
      -- `waiting_driver` no es un sinónimo de «lista»: es literalmente lo que
      -- mete el pedido en la cola de `apps/motorizados` (ver `ord_driver_read`).
      -- Un recojo que pasara por ahí saldría en la pantalla de todos los
      -- motorizados como trabajo disponible, y el primero en tomarlo se iría a
      -- entregar a domicilio una comida que el cliente viene a recoger.
      IF v_order.delivery_method = 'pickup' THEN
        v_new_status := 'ready_for_pickup';
      ELSIF v_order.driver_id IS NULL THEN
        v_new_status := 'waiting_driver';
      ELSE
        v_new_status := v_order.status;
      END IF;

    WHEN 'take' THEN
      IF p_actor_role <> 'driver' THEN RAISE EXCEPTION 'Accion solo del motorizado' USING errcode = 'P0001'; END IF;
      -- 0220 · Guarda 0: UN RECOJO NO SE TOMA.
      -- La policy `ord_driver_read` ya no se los enseña y `accept` ya no les
      -- abre la cola (`appears_in_queue_at` queda NULL), pero esta funcion la
      -- llama el service client, que no pasa por RLS. La regla se dice aqui
      -- tambien, en el sitio donde no hay forma de rodearla.
      IF v_order.delivery_method = 'pickup' THEN
        RAISE EXCEPTION 'Este pedido es de recojo en el local: no hay nada que llevar' USING errcode = 'P0001';
      END IF;
      IF v_order.status NOT IN ('preparing', 'waiting_driver') THEN RAISE EXCEPTION 'El pedido no esta disponible para tomar' USING errcode = 'P0001'; END IF;
      IF v_order.driver_id IS NOT NULL AND v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'El pedido ya tiene motorizado' USING errcode = 'P0001'; END IF;

      -- 0128 · Guarda 1: el motorizado tiene que estar autorizado en el negocio.
      -- Replica la rama de `ord_driver_read` que filtra por `driver_restaurants`,
      -- pero con `v_driver_id`: dentro de una funcion SECURITY DEFINER llamada por
      -- el service client, `auth.uid()` es NULL y `current_driver_id()` devolveria
      -- NULL, dejando la guarda siempre en falso.
      IF NOT EXISTS (
        SELECT 1 FROM public.driver_restaurants
         WHERE driver_id = v_driver_id
           AND business_id = v_order.business_id
      ) THEN
        RAISE EXCEPTION 'No estas autorizado para este negocio' USING errcode = 'P0001';
      END IF;

      -- 0128 · Guarda 2: la ventana de cola tiene que estar abierta.
      -- Solo aplica a `preparing`. `waiting_driver` pasa sin condicion de tiempo:
      -- la comida ya esta lista y bloquearla dejaria el pedido enfriandose sin que
      -- nadie pudiera tomarlo. Es el mismo criterio del board del motorizado
      -- (use-driver-orders.ts). NULL se rechaza: si el reloj no arranco, la ventana
      -- no esta abierta. El limite es `<= now()`, o sea que el instante exacto de
      -- apertura YA permite tomar (portado del GET de driver/orders/[id]).
      IF v_order.status = 'preparing'
         AND (v_order.appears_in_queue_at IS NULL OR v_order.appears_in_queue_at > now()) THEN
        RAISE EXCEPTION 'Este pedido aun no esta disponible para tomar' USING errcode = 'P0001';
      END IF;

      v_new_status := 'heading_to_restaurant';

    WHEN 'arrived' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'heading_to_restaurant' THEN RAISE EXCEPTION 'El motorizado no va al local' USING errcode = 'P0001'; END IF;
      v_new_status := 'waiting_at_restaurant';

    WHEN 'pickup' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'waiting_at_restaurant' THEN RAISE EXCEPTION 'El pedido no esta listo para recoger' USING errcode = 'P0001'; END IF;
      -- La banda ya no la declara el motorizado (0120): sale del pedido, que
      -- es donde la dejara el calculo por ubicacion (web) o la cajera (manual).
      -- El parametro se sigue aceptando para no romper llamadas existentes.
      v_band := COALESCE(
        (p_params ->> 'band')::public.distance_band,
        v_order.delivery_distance_band,
        'near'::public.distance_band
      );
      v_slots := least(3, greatest(1, COALESCE((p_params ->> 'slots')::int, 1)));
      v_new_status := 'picked_up';

    WHEN 'arrived_customer' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'picked_up' THEN RAISE EXCEPTION 'El pedido no esta en reparto' USING errcode = 'P0001'; END IF;

      IF v_order.arrived_at_customer_at IS NOT NULL THEN
        RETURN (
          SELECT jsonb_build_object(
            'id', id, 'shortId', short_id, 'status', status, 'driverId', driver_id,
            'arrivedAtCustomerAt', arrived_at_customer_at, 'alreadyArrived', true
          ) FROM public.orders WHERE id = p_order_id
        );
      END IF;
      v_new_status := v_order.status;

    WHEN 'deliver' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'picked_up' THEN RAISE EXCEPTION 'El pedido no esta recogido' USING errcode = 'P0001'; END IF;
      v_new_status := 'delivered';

      -- ── COBRO REAL (0140) ──────────────────────────────────────────────────
      -- El cliente puede pagar distinto de lo planeado, y hasta ahora el unico
      -- dato que se guardaba era el metodo. Aqui se valida y se deriva lo que
      -- de verdad importa aguas abajo: cuanto efectivo se lleva el motorizado.
      v_total := COALESCE(v_order.order_amount, 0) + COALESCE(v_order.delivery_fee, 0);
      v_payment_real := COALESCE((p_params ->> 'paymentReal')::public.payment_real, 'paid_cash');

      -- Un prepago no se re-cobra: el metodo no es del motorizado.
      IF v_order.payment_intent = 'prepaid' THEN
        v_payment_real := 'paid_prepaid';
      END IF;

      IF v_payment_real NOT IN ('paid_prepaid', 'paid_cash', 'paid_yape', 'paid_mixed') THEN
        RAISE EXCEPTION 'Metodo de cobro no valido para una entrega' USING errcode = 'P0001';
      END IF;

      v_pays_with := COALESCE((p_params ->> 'clientPaysWith')::numeric, v_order.client_pays_with);

      -- ── EL ADELANTO DE VUELTO (0146) ─────────────────────────────────────
      -- El sencillo lo pone SIEMPRE la caja: la cajera se lo da al motorizado
      -- antes de que salga. Es dinero del negocio en su bolsillo desde ese
      -- momento, asi que se rinde pague el cliente como pague.
      --
      -- Sale de `v_order` (la PRE-IMAGEN, leida con FOR UPDATE arriba) y NUNCA
      -- de `p_params`: es un hecho del plan, ocurrido antes de la entrega. El
      -- motorizado no lo declara porque no es suyo declararlo.
      v_planned_cash := CASE v_order.payment_intent
                          WHEN 'pending_cash'  THEN v_total
                          WHEN 'pending_mixed' THEN COALESCE(v_order.cash_amount, 0)
                          ELSE 0
                        END;

      -- `change_to_give` se persiste al crear desde 0131 (manual) y 0143 (B2C).
      -- El COALESCE cubre las filas manuales creadas entre 0092 y 0131, donde
      -- llego NULL: para ellas se deriva del billete que declaro la cajera.
      IF v_planned_cash > 0 THEN
        v_advance := COALESCE(
          v_order.change_to_give,
          GREATEST(round(COALESCE(v_order.client_pays_with, v_planned_cash) - v_planned_cash, 2), 0),
          0
        );
      ELSE
        v_advance := 0;
      END IF;

      IF v_payment_real = 'paid_mixed' THEN
        -- Si no viene division, se asume la planeada. Un mixto SIN division en
        -- ningun lado no se puede liquidar, asi que se rechaza.
        v_cash := COALESCE((p_params ->> 'cashAmount')::numeric, v_order.cash_amount);
        v_yape := COALESCE((p_params ->> 'yapeAmount')::numeric, v_order.yape_amount);

        IF v_cash IS NULL OR v_yape IS NULL THEN
          RAISE EXCEPTION 'Un pago mixto necesita las dos partes' USING errcode = 'P0001';
        END IF;
        IF v_cash <= 0 OR v_yape <= 0 THEN
          RAISE EXCEPTION 'Las dos partes de un pago mixto deben ser mayores que cero'
            USING errcode = 'P0001';
        END IF;
        IF round(v_cash + v_yape, 2) <> round(v_total, 2) THEN
          RAISE EXCEPTION 'Las partes suman % y el pedido es %', round(v_cash + v_yape, 2), round(v_total, 2)
            USING errcode = 'P0001';
        END IF;

        v_cash_portion := v_cash;

      ELSIF v_payment_real = 'paid_cash' THEN
        v_cash := v_total;
        v_yape := NULL;
        v_cash_portion := v_total;

      ELSE
        -- paid_yape y paid_prepaid: el motorizado no le COBRA efectivo al
        -- cliente. Ojo: eso no quiere decir que no lleve efectivo encima —
        -- el adelanto sigue en su bolsillo y se suma abajo.
        v_cash := NULL;
        v_yape := CASE WHEN v_payment_real = 'paid_yape' THEN v_total ELSE NULL END;
        v_cash_portion := 0;
        v_pays_with := NULL;
      END IF;

      -- El billete se compara contra LO QUE SE LE COBRA AL CLIENTE, no contra
      -- lo que el motorizado acabara rindiendo (0146). Antes se comparaba con
      -- `v_cash_owed`, que ahora incluye el adelanto: con esa comparacion, el
      -- camino "pago exacto" de la hoja —que manda clientPaysWith = total—
      -- quedaria rechazado por no cubrir un sencillo que el cliente ni vio.
      IF v_cash_portion > 0 AND v_pays_with IS NOT NULL THEN
        IF round(v_pays_with, 2) < round(v_cash_portion, 2) THEN
          RAISE EXCEPTION 'El billete de % no cubre los % en efectivo', round(v_pays_with, 2), round(v_cash_portion, 2)
            USING errcode = 'P0001';
        END IF;
        v_change := round(v_pays_with - v_cash_portion, 2);
      ELSE
        v_change := NULL;
      END IF;

      -- ── TODO LO DEL NEGOCIO VUELVE (0146) ────────────────────────────────
      --   rendir = adelanto + efectivo recibido - vuelto devuelto
      --          = adelanto + parte en efectivo del pedido
      -- La segunda forma es la primera despues de simplificar, y no depende
      -- del billete: si el cliente paga con 50 un pedido de 45, el motorizado
      -- se queda con el billete y devuelve el adelanto de 5, y sigue debiendo
      -- 50. Si paga exacto, debe los 45 mas los 5 que no llego a usar.
      v_cash_owed := round(v_advance + v_cash_portion, 2);

    WHEN 'no_show' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001'; END IF;
      IF v_order.status <> 'picked_up' THEN RAISE EXCEPTION 'Solo se reporta no-show con el pedido en reparto' USING errcode = 'P0001'; END IF;

      IF v_order.arrived_at_customer_at IS NULL THEN
        RAISE EXCEPTION 'Primero marca que llegaste al domicilio.' USING errcode = 'P0001';
      END IF;

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

    WHEN 'release' THEN
      IF p_actor_role <> 'driver' OR v_order.driver_id <> v_driver_id THEN
        RAISE EXCEPTION 'No autorizado' USING errcode = 'P0001';
      END IF;

      IF v_order.status = 'picked_up' THEN
        RAISE EXCEPTION 'No puedes soltar un pedido que ya recogiste. Contacta a soporte.' USING errcode = 'P0001';
      END IF;

      IF v_order.status NOT IN ('heading_to_restaurant', 'waiting_at_restaurant') THEN
        RAISE EXCEPTION 'El pedido no está en un estado que permita soltarlo' USING errcode = 'P0001';
      END IF;

      v_release_reason := NULLIF(p_params ->> 'reason', '');
      IF v_release_reason IS NULL OR v_release_reason NOT IN ('averia', 'emergencia', 'muy_lejos', 'otro') THEN
        RAISE EXCEPTION 'Motivo de liberación es obligatorio (averia, emergencia, muy_lejos, otro)' USING errcode = 'P0001';
      END IF;

      IF v_order.estimated_ready_at IS NOT NULL
         AND v_order.estimated_ready_at > now()
         AND NOT COALESCE(v_order.ready_early_used, false) THEN
        v_new_status := 'preparing';
      ELSE
        v_new_status := 'waiting_driver';
      END IF;

    WHEN 'handover' THEN
      -- ── EL EQUIVALENTE DE `deliver` PARA UN RECOJO (0220) ────────────────
      -- No se reutiliza `deliver` porque ese exige `picked_up` y motorizado
      -- asignado, y ademas escribe `cash_owed_at_delivery`, que es lo que el
      -- motorizado tiene que RENDIR al negocio. En un recojo el dinero entra
      -- directo a la caja: no hay nada que rendir, y escribir ahi un numero
      -- distinto de cero le inventaria una deuda al corte de caja de la noche.
      IF p_actor_role NOT IN ('business', 'admin') THEN
        RAISE EXCEPTION 'Accion solo del negocio' USING errcode = 'P0001';
      END IF;
      IF v_order.delivery_method <> 'pickup' THEN
        RAISE EXCEPTION 'Esta accion es solo para pedidos de recojo' USING errcode = 'P0001';
      END IF;
      IF v_order.status <> 'ready_for_pickup' THEN
        RAISE EXCEPTION 'El pedido todavia no esta listo para entregar en el mostrador' USING errcode = 'P0001';
      END IF;

      v_new_status := 'delivered';

      -- El cobro real, con la misma regla que `deliver`: un prepago no se
      -- vuelve a cobrar, y el resto sale de lo que declare la cajera.
      -- LO YA COBRADO MANDA (0224). Si el dinero entro al aceptar, el pie del
      -- mostrador ya no pregunta nada y este parametro no viene; dejar que el
      -- COALESCE cayera en 'paid_cash' reescribiria como efectivo un cobro que
      -- fue por Yape, y el historial diria lo contrario de lo que ella declaro.
      v_payment_real := COALESCE(
        v_order.payment_real,
        (p_params ->> 'paymentReal')::public.payment_real,
        'paid_cash'
      );
      IF v_order.payment_intent = 'prepaid' THEN
        v_payment_real := 'paid_prepaid';
      END IF;
      IF v_payment_real NOT IN ('paid_prepaid', 'paid_cash', 'paid_yape') THEN
        -- `paid_mixed` no entra: partir un cobro en dos existe porque el
        -- motorizado lleva efectivo y el cliente completa por Yape. En el
        -- mostrador no hay tal reparto que declarar.
        RAISE EXCEPTION 'Metodo de cobro no valido para un recojo' USING errcode = 'P0001';
      END IF;

      -- LA COMISION DEL RECOJO, con la MISMA fuente y el mismo override que
      -- usa `pickup` para el delivery: `app_settings.commissions` y
      -- `businesses.commission_override_pickup`. Sin esto, un recojo entregado
      -- pasaba por `generate_delivery_charges` con `commission_amount` NULL y
      -- envio 0, o sea sin generar NINGUN cargo: el recojo salia gratis.
      SELECT value INTO v_commissions FROM public.app_settings WHERE key = 'commissions';
      v_commission_amount := COALESCE(
        v_business.commission_override_pickup,
        (v_commissions ->> 'pickup')::numeric,
        1.00
      );
      v_delivery_fee_charged := 0;
      v_commission := v_commission_amount + v_delivery_fee_charged;

    WHEN 'pickup_no_show' THEN
      -- ── EL CLIENTE NUNCA VINO POR SU COMIDA (0220) ───────────────────────
      -- Hasta ahora el unico escritor de `customer_strikes` era el `no_show`
      -- del motorizado, o sea que un plantón en el mostrador no dejaba rastro
      -- y el mismo cliente podia repetirlo cada noche. Esta accion es su
      -- espejo: mismo motivo, mismo umbral, misma consecuencia de DECISIONS §8.
      IF p_actor_role NOT IN ('business', 'admin') THEN
        RAISE EXCEPTION 'Accion solo del negocio' USING errcode = 'P0001';
      END IF;
      IF v_order.delivery_method <> 'pickup' THEN
        RAISE EXCEPTION 'Esta accion es solo para pedidos de recojo' USING errcode = 'P0001';
      END IF;
      IF v_order.status <> 'ready_for_pickup' THEN
        RAISE EXCEPTION 'Solo se reporta un planton con la comida ya lista en el mostrador' USING errcode = 'P0001';
      END IF;
      IF v_order.customer_phone IS NULL THEN
        -- `customer_strikes.phone` es NOT NULL, y un strike sin telefono no
        -- ancla en nada: no habria forma de que contase la proxima vez.
        RAISE EXCEPTION 'Este pedido no tiene telefono al que anclar la falta' USING errcode = 'P0001';
      END IF;

      -- LA MISMA ESPERA QUE EN LA PUERTA, Y A PROPOSITO UN SOLO NUMERO.
      -- `noShowWaitMinutes` ya significa «cuanto se espera a un cliente que no
      -- aparece»; que el sitio sea una puerta o un mostrador no cambia la
      -- pregunta. Aqui es un SUELO contra el toque accidental justo despues de
      -- marcar «lista», no la espera de verdad: esa la decide la cajera, que
      -- es quien ve si la bolsa lleva cinco minutos o cuarenta en la repisa.
      SELECT COALESCE((value ->> 'noShowWaitMinutes')::int, 5) INTO v_no_show_min
      FROM public.app_settings WHERE key = 'timers';
      v_no_show_min := COALESCE(v_no_show_min, 5);

      v_waiting_since := COALESCE(v_order.ready_for_pickup_at, v_order.updated_at);
      IF now() - v_waiting_since < (v_no_show_min || ' minutes')::interval THEN
        v_remaining_min := CEIL(EXTRACT(EPOCH FROM ((v_waiting_since + (v_no_show_min || ' minutes')::interval) - now())) / 60.0)::int;
        IF v_remaining_min < 1 THEN v_remaining_min := 1; END IF;
        RAISE EXCEPTION 'Espera % % mas antes de reportar que el cliente no vino.',
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

  IF p_action = 'release' THEN
    -- Los sellos de tiempo del intento que se suelta se borran con el.
    -- `orders_before_write` los pone con COALESCE(existente, now()), o sea que
    -- son pegajosos: sin esta limpieza el motorizado que recoja el pedido
    -- despues abre la pantalla con el reloj del anterior ya corriendo ("llevas
    -- 30 min esperando en el local", con su aviso de demora inusual).
    UPDATE public.orders
       SET driver_id = NULL,
           status = v_new_status,
           heading_at = NULL,
           waiting_at_restaurant_at = NULL
     WHERE id = p_order_id;

    UPDATE public.order_transfer_requests
       SET status = 'invalidated',
           resolved_at = now()
     WHERE order_id = p_order_id AND status = 'pending';

    INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('order', p_order_id, 'OrderReleased', jsonb_build_object(
      'driverId', v_driver_id, 'reason', v_release_reason, 'note', p_params ->> 'note'
    ));

    INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
    VALUES (p_order_id, 'order.release', 'driver', p_actor_user_id, p_params);
  ELSIF p_action = 'take' THEN
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

    v_delivery_fee_charged := CASE
      WHEN v_order.delivery_method = 'pickup' THEN 0
      ELSE COALESCE(v_order.delivery_fee, (v_bands ->> 'near')::numeric, 2.00)
    END;

    -- 0125: la comisión ya NO depende de la banda y ya NO se resta el envío.
    -- `commissions.delivery` es la comisión SOLA; el envío se suma aparte en
    -- `v_commission`. Los defaults del COALESCE se corrigen a 1.00 / 1.50:
    -- los viejos (0.50 / 3.00 / 3.50) quedaron desfasados desde la 0110.
    IF v_order.delivery_method = 'pickup' THEN
      v_commission_amount := COALESCE(
        v_business.commission_override_pickup,
        (v_commissions ->> 'pickup')::numeric,
        1.00
      );
    ELSE
      v_commission_amount := COALESCE(
        v_business.commission_override_delivery,
        (v_commissions ->> 'delivery')::numeric,
        1.50
      );
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
    UPDATE public.orders
      SET arrived_at_customer_at = now(),
          arrived_at_customer_lat = (p_params ->> 'lat')::numeric,
          arrived_at_customer_lng = (p_params ->> 'lng')::numeric,
          arrived_at_customer_accuracy_m = (p_params ->> 'accuracy_m')::numeric
      WHERE id = p_order_id;
  ELSIF p_action = 'deliver' THEN
    -- `cash_owed_at_delivery` es la UNICA fuente de verdad del corte de caja
    -- desde 0141. Existia desde 0002 y no la escribia nadie; la liquidacion
    -- deducia el efectivo del metodo, que es justo lo que el mixto rompe.
    --
    -- `cash_amount`/`yape_amount` solo se pisan en un mixto, que es el unico
    -- caso donde significan algo. En los demas se conserva lo que planeo la
    -- cajera: sirve para comparar plan contra realidad.
    UPDATE public.orders
      SET status = v_new_status,
          payment_real = v_payment_real,
          cash_owed_at_delivery = v_cash_owed,
          change_advanced = v_advance,
          cash_amount = CASE WHEN v_payment_real = 'paid_mixed' THEN v_cash ELSE cash_amount END,
          yape_amount = CASE WHEN v_payment_real = 'paid_mixed' THEN v_yape ELSE yape_amount END,
          -- Condicionado a `v_cash_portion`, no a `v_cash_owed` (0146): con un
          -- Yape que solo debe el adelanto, `v_cash_owed > 0` habria escrito el
          -- NULL de `v_pays_with` encima del billete que declaro la cajera,
          -- borrando el plan contra el que se compara la realidad.
          client_pays_with = CASE WHEN v_cash_portion > 0 THEN v_pays_with ELSE client_pays_with END,
          change_to_give = CASE WHEN v_cash_portion > 0 THEN v_change ELSE change_to_give END
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
  ELSIF p_action = 'handover' THEN
    -- `cash_owed_at_delivery` y `change_advanced` van a 0 EXPLICITOS y no a
    -- NULL: la liquidacion de la noche los suma, y un NULL ahi se lee como
    -- «todavia no se sabe» en vez de como «no hay nada que rendir».
    UPDATE public.orders
      SET status = v_new_status,
          payment_real = v_payment_real,
          tindivo_commission = v_commission,
          commission_amount = v_commission_amount,
          delivery_fee_charged = v_delivery_fee_charged,
          cash_owed_at_delivery = 0,
          change_advanced = 0
      WHERE id = p_order_id;
  ELSIF p_action = 'pickup_no_show' THEN
    UPDATE public.orders
      SET status = v_new_status,
          cancel_reason = 'no_show',
          cancelled_by = p_actor_user_id,
          cancelled_at = now()
      WHERE id = p_order_id;
    -- EL STRIKE SOLO SI NADIE HABIA PAGADO (0224).
    --
    -- El strike existe (DECISIONS §8) para frenar a quien le genera PERDIDAS al
    -- negocio: comida hecha que nadie paga. Un recojo cobrado no genera
    -- ninguna. El negocio se queda con el dinero y con el plato.
    --
    -- Marcarlo igual seria castigar a quien pago, y el castigo no es simbolico:
    -- a los dos strikes la cuenta queda en prepago obligado —que este cliente ya
    -- hizo— y a los tres, bloqueada 30 dias. Un vecino que pago su pollo y tuvo
    -- una emergencia acabaria sin poder pedir en el unico restaurante del
    -- pueblo. Es el mismo problema que el cobro por adelantado venia a evitar,
    -- reaparecido por el otro lado.
    --
    -- `payment_verified_at` y NO `payment_intent`: lo que decide es si alguien
    -- confirmo que el dinero entro, no lo que el cliente pensaba pagar al pedir.
    -- Cubre las dos vias con una sola pregunta, la captura que aprueba
    -- `validate_order` y el cobro en caja que escribe `accept`.
    v_blocked := false;
    IF v_order.payment_verified_at IS NULL THEN
      -- LA MISMA FORMA QUE EL STRIKE DEL MOTORIZADO, salvo el ancla de
      -- direccion. `delivery_reference` y las coordenadas van NULL a proposito
      -- y no por omision: en un recojo no hay domicilio del cliente que anclar.
      -- `customer_contraentrega_blocked` cuenta por telefono O por referencia, y
      -- con la referencia NULL esa mitad simplemente no suma (verificado: la
      -- funcion corta con `p_reference is not null`).
      INSERT INTO public.customer_strikes (
        customer_user_id, phone, delivery_reference,
        delivery_coordinates_lat, delivery_coordinates_lng, order_id, reason, reported_by
      ) VALUES (
        v_order.customer_user_id, v_order.customer_phone, NULL,
        NULL, NULL, p_order_id, 'no_show', p_actor_user_id
      );
      v_blocked := public.customer_contraentrega_blocked(v_order.customer_phone, NULL);
      IF v_blocked AND v_order.customer_user_id IS NOT NULL THEN
        UPDATE public.customer_profiles
          SET contraentrega_blocked = true,
              strikes = (SELECT count(*) FROM public.customer_strikes WHERE phone = v_order.customer_phone)
          WHERE user_id = v_order.customer_user_id;
      END IF;
    END IF;
    -- EL EVENTO SALE SIEMPRE. El planton ocurrio, y hay que poder contarlos
    -- estuviera pagado o no. `paid` distingue los dos casos para quien lea el
    -- outbox, que si no tendria que deducirlo de la AUSENCIA de un strike.
    INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('order', p_order_id, 'CustomerNoShow', jsonb_build_object(
      'phone', v_order.customer_phone, 'reference', NULL, 'blocked', v_blocked,
      'channel', 'pickup',
      'paid', v_order.payment_verified_at IS NOT NULL,
      'strike', v_order.payment_verified_at IS NULL
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
      UPDATE public.orders
        SET status = v_new_status, prep_time_minutes = v_prep,
            estimated_ready_at = now() + (v_prep || ' minutes')::interval,
            -- `appears_in_queue_at` ES EL RELOJ QUE ABRE EL PEDIDO A LOS
            -- MOTORIZADOS, no un dato de cocina: la guarda 2 de `take` y la
            -- lista de `use-driver-orders` cuelgan de el. En un recojo se queda
            -- NULL, y NULL ahi significa «la ventana nunca se abre», que es
            -- exactamente lo que se quiere (0220).
            appears_in_queue_at = CASE
              WHEN v_order.delivery_method = 'pickup' THEN NULL
              ELSE now() + (greatest(0, v_prep - public.queue_lead_minutes()) || ' minutes')::interval
            END,
            -- 0224 - el dinero del mostrador, sellado en el momento en que
            -- entro. `payment_verified_at` YA significaba «una persona confirmo
            -- que el dinero llego»: lo escribe `validate_order` al aprobar una
            -- captura. Reusarla aqui no le inventa un sentido nuevo, es la
            -- misma afirmacion de la misma cajera sobre billetes en vez de
            -- sobre un pantallazo. Y es lo que despues permite saber, en un
            -- planton, si ese pedido estaba pagado.
            payment_real = CASE WHEN v_cobro_mostrador THEN v_payment_real ELSE payment_real END,
            payment_verified_at = CASE WHEN v_cobro_mostrador THEN now() ELSE payment_verified_at END,
            payment_verified_by = CASE WHEN v_cobro_mostrador THEN p_actor_user_id ELSE payment_verified_by END
        WHERE id = p_order_id;
    ELSE
      UPDATE public.orders
        SET status = v_new_status, prep_time_minutes = v_prep
        WHERE id = p_order_id;
    END IF;
  ELSIF p_action = 'ready' THEN
    IF v_order.delivery_method = 'pickup' THEN
      -- OJO CON `least(NULL, now())`: en Postgres `least` IGNORA los NULL, asi
      -- que la rama de abajo le habria puesto `appears_in_queue_at = now()` a
      -- un recojo cuyo valor es NULL justo para que nadie lo tome — abriendo la
      -- cola de motorizados en el ultimo sitio donde uno la buscaria.
      UPDATE public.orders
        SET status = v_new_status,
            ready_early_used = true,
            ready_early_at = now(),
            estimated_ready_at = least(estimated_ready_at, now())
        WHERE id = p_order_id;
    ELSIF v_order.driver_id IS NULL THEN
      UPDATE public.orders
        SET status = v_new_status,
            ready_early_used = true,
            ready_early_at = now(),
            estimated_ready_at = least(
              estimated_ready_at,
              now() + (public.queue_lead_minutes() || ' minutes')::interval
            ),
            appears_in_queue_at = least(appears_in_queue_at, now())
        WHERE id = p_order_id;
    ELSE
      UPDATE public.orders
        SET ready_early_used = true,
            ready_early_at = now(),
            estimated_ready_at = least(
              estimated_ready_at,
              now() + (public.queue_lead_minutes() || ' minutes')::interval
            )
        WHERE id = p_order_id;
    END IF;
  ELSE
    UPDATE public.orders SET status = v_new_status WHERE id = p_order_id;
  END IF;

  IF p_action <> 'release' THEN
    INSERT INTO public.domain_events (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('order', p_order_id, 'OrderStatusChanged', jsonb_build_object('action', p_action, 'status', v_new_status));

    INSERT INTO public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
    VALUES (p_order_id, 'order.' || p_action, p_actor_role::text, p_actor_user_id, p_params);
  END IF;

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
$function$


