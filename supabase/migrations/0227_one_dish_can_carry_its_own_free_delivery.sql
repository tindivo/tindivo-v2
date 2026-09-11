-- =============================================================================
-- 0227 · Un plato puede llevar su propio envío gratis
--
-- Idempotente (add column if not exists / create or replace). Rollback en
-- supabase/rollbacks/0227_one_dish_can_carry_its_own_free_delivery.rollback.sql
-- =============================================================================
--
-- EL CASO
-- Al Punto (negocio del piloto) quiere lanzar "4 Alitas Crispy" con envío
-- gratis los martes y jueves, financiado por Tindivo (no por el negocio: la
-- comisión que le cobramos no cambia, y el motorizado cobra igual). A
-- diferencia de la promo de lanzamiento (0187), esta es ILIMITADA a propósito
-- —no hay 30, ni 100, ni "los primeros N"— así que no hace falta ni el ledger
-- de redenciones ni el candado de tope global de esa migración: la pregunta es
-- sencilla, "¿es martes o jueves Y el pedido es solo esto?", y se puede
-- contestar sin guardar estado en ningún lado.
--
-- GENERALIZADA A PROPÓSITO. La columna vive en `menu_items`, no en una tabla
-- de "promos de Al Punto": cualquier plato de cualquier negocio puede llevar
-- su propio calendario de envío gratis. Lo que SÍ es específico de este caso
-- es el UPDATE del final, que solo toca el plato real.
--
-- QUÉ CUBRE Y QUÉ NO (decidido con el negocio antes de escribir esto):
--   · Solo si el carrito es ÚNICAMENTE ese plato (cualquier cantidad, con o
--     sin modificadores). Si lleva además otra cosa, se cobra el envío
--     completo — así no se regala el envío de un pedido de S/100 porque
--     llevaba una alita de S/13.90 de paso.
--   · Solo canal `customer_pwa`. El 88% de los pedidos los teclea la cajera
--     (`business_manual`), y esta promo la financia Tindivo: no es una
--     decisión que deba activarse sola en un pedido telefónico. Ver
--     DECISIONS del guard de franja horaria (0226) para el mismo criterio de
--     "todo guard nuevo cuelga de `p_source`".
--   · `pickup` queda fuera por construcción: ahí el envío ya es 0 (0185), así
--     que el guard de `v_delivery_fee > 0` lo excluye solo.
--
-- POR QUÉ UNA FUNCIÓN PURA APARTE (`menu_item_free_delivery_day`)
-- Igual que `menu_item_in_window` (0226), separar el cálculo del día en una
-- función `stable`, sin leer tablas, la hace probable con valores de mano —
-- sin necesidad de que el test corra un martes de verdad. La diferencia
-- deliberada con `menu_item_in_window`: esa función es FAIL-OPEN (un dato roto
-- deja ver el plato, porque esconder un plato es una venta perdida). Esta es
-- FAIL-CLOSED (un array NULL o vacío NUNCA aplica la promo), porque el dato
-- roto aquí no cuesta una venta, cuesta plata de Tindivo regalada sin límite.
-- Misma disciplina de polaridad positiva que ya dejó escrita la 0187: "aplicar
-- solo si consta que sí", nunca "saltar si consta que no".
--
-- LA FRONTERA DEL DÍA ES LA JORNADA OPERATIVA, NO EL RELOJ. Reimplementa a
-- propósito la fórmula de `current_service_date` (0154: arranca a las 05:00 de
-- Lima) en vez de llamarla, para no depender de sus GRANTs desde una función
-- nueva y para poder pasarle un `p_at` de prueba sin tocar `now()`. Es la
-- misma duplicación consciente que ya tiene la franja horaria de platos entre
-- TS y SQL: mismo corpus de casos cubre los dos lados.
--
-- CONVENCIÓN DE DÍAS: 0=Lunes..6=Domingo (la de `business_schedule` y de
-- `available_days`, NO la de `extract(dow)` de Postgres).
-- =============================================================================

alter table public.menu_items
  add column if not exists free_delivery_days smallint[];

comment on column public.menu_items.free_delivery_days is
  'Días en que este plato trae el envío gratis, financiado por Tindivo (no por el negocio). 0=Lunes..6=Domingo. NULL o vacío = nunca (fail-closed: un dato roto no regala envíos). Solo aplica si el pedido es ÚNICAMENTE este plato, por canal customer_pwa, en modo delivery.';

-- -----------------------------------------------------------------------------
-- ¿Trae envío gratis este plato en el instante `p_at`?
--
-- Pura: no lee ninguna tabla. FAIL-CLOSED en todo: un array NULL, vacío, o un
-- día fuera de 0-6 hacen que NO aplique. Es la polaridad contraria a
-- `menu_item_in_window` (0226) a propósito — ver cabecera de la migración.
-- -----------------------------------------------------------------------------
create or replace function public.menu_item_free_delivery_day(
  p_free_delivery_days smallint[],
  p_at timestamptz default now()
) returns boolean
language sql
stable
set search_path = ''
as $function$
  -- `coalesce` al final a propósito: con array vacío, `array_length(...,1)` da
  -- NULL (no 0), y NULL propagado por el `and` dejaría la función devolviendo
  -- NULL en vez de `false`. Un `if` de PL/pgSQL trata NULL igual que `false`
  -- —así que el guard de arriba ya era seguro—, pero un valor NULL en vez de
  -- `false` es una trampa para quien llame a esta función desde otro sitio
  -- mañana, o desde un test.
  select coalesce(
    p_free_delivery_days is not null
    and array_length(p_free_delivery_days, 1) > 0
    and (
      -- Mismo cálculo que current_service_date (0154): la jornada de Lima
      -- empieza a las 05:00, así que la madrugada cuenta como el día anterior.
      (extract(isodow from (timezone('America/Lima', coalesce(p_at, now())) - interval '5 hours')::date)::int + 6) % 7
    )::smallint = any(
      array(select d from unnest(p_free_delivery_days) d where d between 0 and 6)
    ),
    false
  )
$function$;

comment on function public.menu_item_free_delivery_day(smallint[], timestamptz) is
  'Fail-closed: NULL, vacío, o sin coincidencia de día no aplican nunca. Jornada operativa (05:00 Lima), no el reloj.';

-- Superficie cerrada (patrón 0009/0204): solo la llama create_customer_order,
-- que es SECURITY DEFINER de postgres.
revoke all on function public.menu_item_free_delivery_day(smallint[], timestamptz)
  from public, anon, authenticated;
grant execute on function public.menu_item_free_delivery_day(smallint[], timestamptz)
  to service_role;

-- -----------------------------------------------------------------------------
-- `create_customer_order` con el guard de envío gratis por plato. El resto del
-- cuerpo es la definición que dejó la 0226, copiada tal cual: este bloque solo
-- AÑADE dos variables y el `if` nuevo, colocado justo detrás del bloque de la
-- promo de lanzamiento (0187) y antes de las validaciones de pago — porque
-- esas validaciones leen `v_delivery_fee`, que es lo que este bloque cambia.
-- Si la 0187 ya lo dejó en 0 (promo de lanzamiento reactivada algún día), este
-- bloque no hace nada: el guard de `v_delivery_fee > 0` lo salta solo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_customer_order(p_business_id uuid, p_customer_user_id uuid, p_delivery_method delivery_method, p_payment_intent payment_intent, p_customer_name text, p_customer_phone text, p_items jsonb, p_delivery_address text, p_delivery_reference text, p_delivery_lat numeric DEFAULT NULL::numeric, p_delivery_lng numeric DEFAULT NULL::numeric, p_source order_source DEFAULT 'customer_pwa'::order_source, p_client_pays_with numeric DEFAULT NULL::numeric, p_customer_gps_lat double precision DEFAULT NULL::double precision, p_customer_gps_lng double precision DEFAULT NULL::double precision, p_customer_gps_accuracy_m double precision DEFAULT NULL::double precision, p_customer_gps_distance_to_center_km numeric DEFAULT NULL::numeric, p_customer_gps_method text DEFAULT NULL::text, p_customer_notes text DEFAULT NULL::text, p_delivery_accuracy_m integer DEFAULT NULL::integer, p_delivery_confirmed_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_pickup_timing text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- Promo de lanzamiento «envío gratis» (0187)
  v_promo jsonb;
  v_promo_code text;
  v_promo_active boolean;
  v_promo_max int;
  v_promo_taken int;
  v_prior_delivered int;
  v_had_history boolean;
  v_verified_phone text;
  v_redemption_id uuid;
  v_promo_applied boolean := false;
  v_fee_source text := 'system';
  -- Promo de envío gratis por plato (0227)
  v_item_promo_distinct int;
  v_item_promo_days smallint[];
  v_order_id uuid;
  v_short_id text;
  v_order_number int;
  v_delivery_fee numeric;
  v_order_amount numeric := 0;
  v_menu_item record;
  v_business record;
  v_coi_id uuid;
  v_item jsonb;
  v_optid text;
  v_qty int;
  v_unit numeric;
  v_mods jsonb;
  v_opt record;
  v_line_total numeric;
  v_mod jsonb;
  v_status public.order_status := 'pending_acceptance';
  v_requires_validation boolean := false;
  v_validation_reason text := null;
  v_threshold numeric;
  v_vthreshold numeric;
  v_location jsonb;
  v_risk_flags jsonb := '{}'::jsonb;
  v_bands jsonb;
  v_band public.distance_band;
  v_max_accuracy numeric := 150;

  -- Burst detection
  v_same_phone_window int;
  v_same_phone_threshold int;
  v_same_phone_count int;

  v_nearby_window int;
  v_nearby_radius_m numeric;
  v_nearby_threshold int;
  v_nearby_count int;

  v_high_ticket_amount numeric;
  v_high_ticket_threshold int;
  v_new_high_ticket_count int;
  v_night_start timestamptz;

  -- Spike detection
  v_recent_hour_count int;
  v_avg_hourly numeric;
  v_spike_days int;
  v_spike_multiplier numeric;
  v_spike_min int;

  -- Guard de pedido activo (instrumentación del bloqueo)
  v_active_id uuid;
  v_active_short_id text;
  v_active_status public.order_status;

  -- B.3: Umbrales de efectivo (R2, R3)
  v_max_bill numeric;
  v_max_change numeric;

  -- 0211: motivo detrás del guard de contraentrega (trusted | risk_blocked | no_history)
  v_contraentrega_decision text;

  -- 0220: cuándo dijo el cliente que pasa por su recojo, y el atajo booleano.
  v_pickup_timing text;
  v_pickup_now boolean := false;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene items' using errcode = 'P0001';
  end if;

  -- ── RECOJO: CUÁNDO VIENE, PREGUNTADO Y NO INFERIDO (0220) ─────────────
  -- No sale de `p_source` ni de ningún parámetro de campaña. Un QR pegado en el
  -- mostrador se fotografía y se comparte por WhatsApp en diez segundos, así
  -- que «entró por el póster» no dice NADA sobre dónde está parado quien pide.
  -- Lo dice el cliente, con un toque, y de ahí cuelga todo lo demás.
  --
  -- EL DEFAULT ES 'later', QUE ES EL LADO CARO. Un llamador que omita el
  -- argumento cae en el camino con GPS, guard de contraentrega y «validando»,
  -- o sea el que ya existía. Si el default fuera 'now', olvidarse del argumento
  -- REGALARÍA la exención por presencia física, que es justo lo que el bloque
  -- de más abajo existe para no regalar.
  v_pickup_timing := case
    when p_delivery_method <> 'pickup' then null
    when p_pickup_timing in ('now', 'later') then p_pickup_timing
    else 'later'
  end;
  v_pickup_now := (v_pickup_timing = 'now');

  -- B.1: Guard explícito para pending_mixed.
  -- El canal B2C no acepta este método: no hay cajera que coordine las dos partes.
  if p_payment_intent = 'pending_mixed' then
    raise exception 'El pago mixto no está disponible en el canal de cliente. Elige efectivo, Yape/Plin o prepago.'
      using errcode = 'P0001';
  end if;

  -- GUARD: un solo pedido activo por cliente + negocio.
  select o.id, o.short_id, o.status into v_active_id, v_active_short_id, v_active_status
  from public.orders o
  where o.customer_user_id = p_customer_user_id
    and o.business_id = p_business_id
    and o.status in (
      'validando', 'pending_acceptance', 'awaiting_payment', 'confirmed', 'preparing',
      'waiting_driver', 'heading_to_restaurant', 'waiting_at_restaurant', 'picked_up',
      -- 0220: una bolsa esperando en el mostrador es un pedido ABIERTO. Sin
      -- esta línea, quien no pasa a recoger puede seguir pidiendo al mismo
      -- restaurante y acumular comida hecha que nadie va a llevarse — que es
      -- justo el escenario que el guard de 0105 existe para cerrar.
      'ready_for_pickup'
    )
  order by o.created_at desc
  limit 1;

  if v_active_short_id is not null then
    raise exception 'Ya tienes un pedido activo en este restaurante. Espera a que termine antes de hacer uno nuevo.'
      using errcode = 'P0001',
            detail = 'active_order_block:' || v_active_id::text || ':' || v_active_short_id
                     || ':' || v_active_status::text;
  end if;

  select * into v_business from public.businesses where id = p_business_id;
  if not found then raise exception 'Negocio no existe' using errcode = 'P0002'; end if;

  if public.customer_is_blocked(p_customer_user_id, p_customer_phone) then
    raise exception 'Por razones operativas, no podemos procesar tu pedido en este momento. Escribenos para regularizar.'
      using errcode = 'P0001';
  end if;

  -- GUARD DE TELÉFONO VERIFICADO (WhatsApp OTP)
  if not exists (
    select 1 from public.customer_profiles
    where user_id = p_customer_user_id
    and phone_verified_at is not null
  ) then
    raise exception 'Verifica tu número de WhatsApp antes de hacer un pedido.'
      using errcode = 'P0001';
  end if;

  -- GUARD DE CONTRAENTREGA: exige historial de entregas, O (0211) un cliente
  -- sin historial pero geolocalizado en San Jacinto — ese caso SÍ entra, pero
  -- fuerza `validando` más abajo (v_requires_validation). El riesgo
  -- ('risk_blocked') nunca pasa por el crédito de GPS: corta siempre. Ver
  -- DECISIONS.md §8 y la cabecera de 0211.
  if p_payment_intent in ('pending_cash', 'pending_yape') then
    v_contraentrega_decision := public.customer_contraentrega_decision(p_customer_user_id);

    if v_contraentrega_decision = 'risk_blocked' then
      raise exception 'Pago adelantado requerido para primer pedido.'
        using errcode = 'P0001';
    elsif v_contraentrega_decision = 'no_history' then
      if v_pickup_now then
        -- ── RECOJO «AHORA»: LA GARANTÍA ES LA PERSONA, NO EL DATO (0220) ────
        -- Este es el único camino del sistema donde un cliente sin ninguna
        -- historia paga contraentrega sin GPS y sin llamada. La razón es que
        -- aquí no hay nada fiado: NADIE COCINA hasta que la cajera acepta el
        -- pedido, y para aceptarlo tiene delante a quien lo hizo. La
        -- verificación es un humano mirando a otro humano, y eso es MÁS fuerte
        -- que una coordenada — el GPS de un navegador se falsifica sin root;
        -- estar de pie en el mostrador, no.
        --
        -- Y mentir aquí no le cuesta nada al negocio: quien dice «ahora» y no
        -- aparece deja un pedido que nadie tocó, y que se autocancela solo por
        -- la ventana de aceptación que ya corre para todos.
        --
        -- LO QUE ESTA RAMA NO PERDONA: el `risk_blocked` de arriba corta antes
        -- de llegar aquí. Un cliente con strikes no compra a crédito por estar
        -- de pie: la sanción de DECISIONS §8 es de la cuenta, no del canal.
        v_risk_flags := v_risk_flags || jsonb_build_object('pickupNowPresence', true);
      elsif not public.customer_gps_in_coverage(p_customer_gps_lat, p_customer_gps_lng, p_customer_gps_method) then
        raise exception 'Pago adelantado requerido para primer pedido.'
          using errcode = 'P0001';
      else
        -- Sin historial, pero el GPS dice San Jacinto: contraentrega permitida,
        -- con la misma llamada de validación que ya paga cualquier cliente
        -- nuevo. El GPS es falsificable; la llamada es la salvaguarda.
        --
        -- Vale igual para un recojo «más tarde»: ahí la comida se hace con
        -- nadie delante, exactamente como en un delivery, así que se le pide
        -- exactamente lo mismo.
        v_requires_validation := true;
        v_validation_reason := coalesce(v_validation_reason, 'new_customer_local_gps');
        v_risk_flags := v_risk_flags || jsonb_build_object('newCustomerLocalGps', true);
      end if;
    end if;
    -- 'trusted': contraentrega libre, sin marcar nada adicional.
  end if;

  if p_delivery_method = 'delivery' then
    if p_delivery_lat is null or p_delivery_lng is null then
      raise exception 'Coordenadas de entrega obligatorias para delivery' using errcode = 'P0001';
    end if;

    -- Validar cobertura
    if not public.point_in_coverage_polygon(p_delivery_lat, p_delivery_lng) then
      raise exception 'Dirección fuera de la zona de reparto establecida para San Jacinto' using errcode = 'P0001';
    end if;

    -- Validar GPS vs Dirección
    -- 0148: `manual_skip_prepaid` ENTRA AQUI, igual que `failed`.
    --
    -- Los dos significan lo mismo: NO HAY POSICION. El cliente denego el
    -- permiso, el GPS no fijo, o pulso la salida de emergencia de
    -- `GeoBlockView` ("no puedo dar mi ubicacion, pago por adelantado").
    -- Solo `failed` estaba exento, asi que `manual_skip_prepaid` caia en el
    -- raise de abajo y el pedido moria con un 422 -- justo el camino que la
    -- app ofrece para RECUPERARSE de un fallo de GPS
    -- (`use-checkout-actions.ts:67` y `:96`).
    --
    -- La contradiccion estaba dentro de esta misma funcion: doce lineas mas
    -- abajo, `if p_customer_gps_method in ('failed', 'manual_skip_prepaid')`
    -- ya trataba a los dos como pareja para marcar `gpsFallbackPrepaid`. Un
    -- lado los rechazaba y el otro contaba con ellos.
    --
    -- El bloque entero se salta con razon: lo unico que hay dentro, ademas
    -- del raise, es la comparacion de distancia GPS-vs-direccion, y sin
    -- coordenadas no hay nada que comparar.
    if p_customer_gps_method is not null
       and p_customer_gps_method not in ('failed', 'manual_skip_prepaid') then
      if p_customer_gps_lat is null or p_customer_gps_lng is null then
        raise exception 'Coordenadas GPS del cliente incompletas' using errcode = 'P0001';
      end if;

      if public.geo_distance_km(p_customer_gps_lat, p_customer_gps_lng, p_delivery_lat::double precision, p_delivery_lng::double precision) > 0.4 then
        v_requires_validation := true;
        v_validation_reason := coalesce(v_validation_reason, 'gps_warning_zone');
        v_risk_flags := v_risk_flags || jsonb_build_object('gpsWarningZone', true);
      end if;
    end if;

    if p_customer_gps_method in ('failed', 'manual_skip_prepaid') then
      v_risk_flags := v_risk_flags || jsonb_build_object('gpsFallbackPrepaid', true);
    elsif p_customer_gps_accuracy_m is not null and p_customer_gps_accuracy_m > v_max_accuracy then
      v_risk_flags := v_risk_flags || jsonb_build_object('gpsLowAccuracy', true);
    end if;
  end if;

  if p_delivery_method = 'pickup' then
    -- El recojo no tiene banda: el cliente va al local. Escribir 'near' seria
    -- meter un dato falso en los reportes (misma decision que 0126).
    v_delivery_fee := 0;
    v_band := null;
  else
    -- LA BANDA SALE DEL PUNTO, NO DE UN LITERAL (0162).
    v_band := public.delivery_band_for_point(p_delivery_lat, p_delivery_lng);
    select value into v_bands from public.app_settings where key = 'delivery_bands';
    v_delivery_fee := coalesce((v_bands ->> v_band::text)::numeric, v_business.delivery_fee, 2.00);
  end if;

  insert into public.orders (
    business_id, customer_user_id, source, delivery_method, payment_intent,
    customer_name, customer_phone, delivery_address, delivery_reference,
    delivery_coordinates_lat, delivery_coordinates_lng,
    customer_gps_lat, customer_gps_lng, customer_gps_accuracy_m,
    customer_gps_distance_to_center_km, customer_gps_validated_at, customer_gps_method,
    order_amount, delivery_fee, status,
    delivery_distance_band, delivery_fee_source,
    customer_notes,
    delivery_coordinates_accuracy_m, delivery_location_confirmed_at,
    pickup_timing
  ) values (
    p_business_id, p_customer_user_id, p_source, p_delivery_method, p_payment_intent,
    p_customer_name, p_customer_phone, p_delivery_address, p_delivery_reference,
    p_delivery_lat, p_delivery_lng,
    p_customer_gps_lat, p_customer_gps_lng, p_customer_gps_accuracy_m,
    p_customer_gps_distance_to_center_km,
    case when p_customer_gps_method is not null then now() else null end,
    p_customer_gps_method,
    0, v_delivery_fee, 'pending_acceptance',
    v_band, 'system',
    left(nullif(btrim(regexp_replace(coalesce(p_customer_notes, ''), '\s+', ' ', 'g')), ''), 200),
    nullif(greatest(coalesce(p_delivery_accuracy_m, 0), 0), 0),
    p_delivery_confirmed_at,
    v_pickup_timing
  ) returning id, short_id, order_number into v_order_id, v_short_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_menu_item from public.menu_items
      where id = (v_item ->> 'menu_item_id')::uuid and business_id = p_business_id;
    if not found then raise exception 'Un item no pertenece a este negocio' using errcode = 'P0001'; end if;
    if not v_menu_item.is_available then
      raise exception 'El item "%" no esta disponible', v_menu_item.name using errcode = 'P0001';
    end if;

    -- FRANJA HORARIA DEL PLATO (0226). SOLO PARA EL CANAL DEL CLIENTE.
    --
    -- 462 de los 527 pedidos de prod entran por `business_manual`: los
    -- teclea la cajera, que tiene la cocina delante. Si a las 15:05 queda
    -- ceviche, lo vende, y el servidor no esta en posicion de discutirselo.
    -- Este guard es la red de seguridad de una PESTAÑA VIEJA del cliente:
    -- la carta que se sirvio a las 14:00 del sabado no puede seguir
    -- pidiendo ceviche el martes a las 21:00.
    --
    -- El mensaje no detalla la franja a proposito: la frase humana
    -- («Solo sab y dom, de 11:00 a 15:00») la compone `describeWindow` en
    -- el cliente, y duplicar aqui ese formateo seria una tercera copia de
    -- la misma regla. El cliente ve el detalle en la card y en la bolsa;
    -- esto solo tiene que impedir el pedido.
    if p_source = 'customer_pwa'
       and not public.menu_item_orderable_now(
             v_menu_item.available_days,
             v_menu_item.available_from,
             v_menu_item.available_to) then
      raise exception 'El item "%" no se sirve en este turno', v_menu_item.name
        using errcode = 'P0001';
    end if;
    v_qty := greatest(1, coalesce((v_item ->> 'quantity')::int, 1));

    v_unit := v_menu_item.base_price;
    v_mods := '[]'::jsonb;
    for v_optid in select value from jsonb_array_elements_text(coalesce(v_item -> 'modifiers', '[]'::jsonb))
    loop
      select o.name as oname, o.additional_price as oprice, g.name as gname into v_opt
        from public.menu_modifier_options o
        join public.menu_modifier_groups g on g.id = o.group_id
        where o.id = v_optid::uuid and o.is_available
          and exists (
            select 1 from public.menu_item_modifier_groups mig
            where mig.item_id = v_menu_item.id and mig.group_id = o.group_id
          );
      if not found then raise exception 'Modificador no valido para este item' using errcode = 'P0001'; end if;
      v_unit := v_unit + v_opt.oprice;
      v_mods := v_mods || jsonb_build_object('g', v_opt.gname, 'n', v_opt.oname, 'p', v_opt.oprice);
    end loop;

    v_line_total := round(v_unit * v_qty, 2);
    v_order_amount := v_order_amount + v_line_total;

    insert into public.customer_order_items (
      order_id, menu_item_id, item_name_snapshot, base_price_snapshot,
      quantity, unit_price, line_total, note
    ) values (
      v_order_id, v_menu_item.id, v_menu_item.name, v_menu_item.base_price,
      v_qty, v_unit, v_line_total, nullif(v_item ->> 'note', '')
    ) returning id into v_coi_id;

    for v_mod in select * from jsonb_array_elements(v_mods)
    loop
      insert into public.customer_order_item_modifiers (
        item_id, group_name_snapshot, option_name_snapshot, additional_price_snapshot
      ) values (v_coi_id, v_mod ->> 'g', v_mod ->> 'n', (v_mod ->> 'p')::numeric);
    end loop;
  end loop;

  -- ── PROMO DE LANZAMIENTO: ENVÍO GRATIS (0187) ──────────────────────────────
  -- POR QUÉ AQUÍ, y no justo tras el insert del pedido: el lock del tope se
  -- sostiene hasta el COMMIT, así que todo lo que quede por debajo entra en la
  -- sección crítica. Bajarlo por debajo del bucle de ítems saca de ahí las N
  -- consultas de menu_items y los inserts de líneas y modificadores, que es la
  -- parte más cara y la que más varía con el tamaño del carrito.
  --
  -- Y no puede ir más abajo: las validaciones de pago que vienen a continuación
  -- leen `v_delivery_fee`, que es exactamente lo que esta promo cambia.
  if p_delivery_method = 'delivery' and v_delivery_fee > 0 then
    -- MUTEX DEL TOPE GLOBAL.
    -- No se puede hacer `select count(*) ... for update`: Postgres lo rechaza
    -- con "FOR UPDATE is not allowed with aggregate functions". Y aunque se
    -- pudiera, bloquear filas EXISTENTES no impide que otra transacción INSERTE
    -- una nueva, que es justo la carrera a cerrar. El candado tiene que estar
    -- sobre algo que todos los competidores toquen: la fila de configuración.
    select value into v_promo
      from public.app_settings
     where key = 'promo_free_delivery'
       for update;

    -- CONFIG AUSENTE = NO HAY PROMO, dicho explícitamente.
    -- Sin este `if found`, el caso funcionaría igual por propagación de NULL
    -- (v_promo es jsonb: `NULL ->> 'active'` da NULL y el if no entra), pero
    -- eso es implícito y se rompe la próxima vez que alguien reordene el bloque.
    if found then
      v_promo_code   := v_promo ->> 'code';
      v_promo_active := coalesce((v_promo ->> 'active')::boolean, false);
      v_promo_max    := (v_promo ->> 'max_redemptions')::int;

      -- POLARIDAD POSITIVA, SIEMPRE.
      -- Cada condición dice "aplicar solo si consta que sí". Escrita al revés
      -- ("saltar si consta que no"), un campo NULL en la config —un JSON editado
      -- a medias desde el panel— abriría la promo SIN TECHO en vez de cerrarla.
      -- Con `v_taken < v_max` y v_max NULL no se entra: no aplica. Con
      -- `v_taken >= v_max` tampoco se entraría... y se aplicaría sin límite.
      if v_promo_active
         and v_promo_code is not null
         and v_promo_max is not null
         and public.current_service_date()
               between (v_promo ->> 'from')::date and (v_promo ->> 'to')::date
      then
        -- El conteo se DERIVA del ledger de redenciones, no se acumula en un
        -- contador. Misma lección que 0124 con balance_due: un contador que
        -- sube y baja se desincroniza el día que una fila entre o salga por un
        -- camino no previsto, y entonces el tope publicitado miente hacia el
        -- lado caro. `released` no cuenta: cancelar devuelve el cupo.
        select count(*) into v_promo_taken
          from public.promo_redemptions
         where promo_code = v_promo_code
           and status in ('reserved', 'redeemed');

        if v_promo_taken < v_promo_max then
          -- El teléfono sale del PERFIL VERIFICADO, nunca de p_customer_phone,
          -- que el cliente elige libre. Misma disciplina que 0171.
          select cp.phone into v_verified_phone
            from public.customer_profiles cp
           where cp.user_id = p_customer_user_id
             and cp.phone_verified_at is not null;

          if v_verified_phone is not null then
            -- Dos definiciones de "¿era nuevo?", las dos guardadas en crudo:
            --   prior_delivered_count  entregas de v2 de esta cuenta O de su
            --                          teléfono verificado (las que tomó la
            --                          cajera cuentan: son del mismo humano).
            --   had_delivery_history   la definición ancha de 0171/0182, que
            --                          además incluye el directorio del v1.
            -- En el piloto las dos dan números muy distintos. Guardar el dato
            -- crudo evita atar el análisis a una sola hoy.
            select count(*) into v_prior_delivered
              from public.orders o
             where o.status = 'delivered'
               and (o.customer_user_id = p_customer_user_id
                    or o.customer_phone = v_verified_phone);

            v_had_history := public.customer_trusted_for_contraentrega(p_customer_user_id);

            -- `on conflict do nothing` SIN CONFLICT TARGET. No es un descuido:
            -- sin target arbitra contra TODAS las restricciones únicas, así que
            -- cubre a la vez el índice por cuenta y el de teléfono, en la misma
            -- inserción especulativa. Con target cubriría SOLO ese índice y una
            -- colisión contra el otro levantaría unique_violation (23505),
            -- abortando la transacción y tumbando el pedido entero en vez de
            -- cobrarle el envío.  NO AÑADIR EL TARGET.
            insert into public.promo_redemptions (
              promo_code, customer_user_id, verified_phone, order_id,
              status, waived_amount, distance_band,
              prior_delivered_count, had_delivery_history
            ) values (
              v_promo_code, p_customer_user_id, v_verified_phone, v_order_id,
              'reserved', v_delivery_fee, v_band,
              v_prior_delivered, v_had_history
            )
            on conflict do nothing
            returning id into v_redemption_id;

            -- Con do-nothing y conflicto, v_redemption_id queda NULL (no es
            -- INTO STRICT, no levanta excepción). Eso es cómo se sabe si entró.
            if v_redemption_id is not null then
              v_promo_applied := true;
              v_delivery_fee  := 0;
              v_fee_source    := 'promo';
            end if;
          end if;
        end if;
      end if;
    end if;
  end if;

  -- ── PROMO DE ENVÍO GRATIS POR PLATO (0227) ─────────────────────────────────
  -- Mismo sitio que la promo de lanzamiento y por la misma razón: hay que
  -- decidir antes de las validaciones de pago, que leen `v_delivery_fee`.
  -- `v_delivery_fee > 0` hace que si la promo de lanzamiento (arriba) ya dejó
  -- el envío en 0, este bloque no tenga nada que hacer — no hay conflicto
  -- posible entre las dos.
  if p_source = 'customer_pwa'
     and p_delivery_method = 'delivery'
     and v_delivery_fee > 0
  then
    -- "Únicamente ese plato": el carrito no puede tener más de un menu_item_id
    -- distinto. La cantidad de ese plato no importa, ni si lleva modificadores.
    select count(distinct (elem ->> 'menu_item_id')) into v_item_promo_distinct
      from jsonb_array_elements(p_items) elem;

    if v_item_promo_distinct = 1 then
      select mi.free_delivery_days into v_item_promo_days
        from public.menu_items mi
       where mi.id = (p_items -> 0 ->> 'menu_item_id')::uuid
         and mi.business_id = p_business_id;

      if public.menu_item_free_delivery_day(v_item_promo_days) then
        v_delivery_fee := 0;
        v_fee_source   := 'promo';
      end if;
    end if;
  end if;

  select (value #>> '{}')::numeric into v_threshold from public.app_settings where key = 'prepay_threshold';
  v_threshold := coalesce(v_threshold, 80);
  if v_order_amount + v_delivery_fee > v_threshold and p_payment_intent <> 'prepaid' then
    raise exception 'El total con envio (S/ %) pasa de S/ %, asi que el pago debe ser adelantado.',
      to_char(v_order_amount + v_delivery_fee, 'FM999990.00'),
      to_char(v_threshold, 'FM999990.00')
      using errcode = 'P0001';
  end if;

  -- R1: el monto declarado debe cubrir el total
  if p_payment_intent = 'pending_cash' and p_client_pays_with is not null
     and p_client_pays_with < v_order_amount + v_delivery_fee then
    raise exception 'El monto con que pagaras (S/ %) no cubre el total del pedido (S/ %)',
      to_char(p_client_pays_with, 'FM999990.00'),
      to_char(v_order_amount + v_delivery_fee, 'FM999990.00')
      using errcode = 'P0001';
  end if;

  -- B.3: R2 y R3 — umbrales de billete y vuelto
  if p_payment_intent = 'pending_cash' and p_client_pays_with is not null then
    select (value #>> '{}')::numeric into v_max_bill from public.app_settings where key = 'max_cash_bill';
    v_max_bill := coalesce(v_max_bill, 100);

    -- El techo de vuelto lo pone la caja de esta noche, no una constante. Si la
    -- cajera no declaró nada, `effective_max_change` devuelve el global de
    -- siempre, así que el comportamiento sin declaración es idéntico al de ayer.
    v_max_change := public.effective_max_change(p_business_id);

    -- R2: el billete declarado no puede superar el máximo
    if p_client_pays_with > v_max_bill then
      raise exception 'El billete máximo aceptado es S/%. Usa un billete menor o paga con Yape/Plin.', v_max_bill
        using errcode = 'P0001';
    end if;

    -- R3: el vuelto requerido no puede superar el máximo
    if p_client_pays_with - (v_order_amount + v_delivery_fee) > v_max_change then
      raise exception 'El vuelto requerido (S/%) supera el vuelto disponible esta noche (S/%). Paga con un billete menor o usa Yape/Plin.',
        to_char(p_client_pays_with - (v_order_amount + v_delivery_fee), 'FM999990.00'),
        v_max_change
        using errcode = 'P0001';
    end if;
  end if;

  select value into v_location from public.app_settings where key = 'validation';
  v_vthreshold := coalesce((v_location ->> 'amountThreshold')::numeric, 80);
  v_same_phone_window := coalesce((v_location ->> 'samePhoneWindowMinutes')::int, 30);
  v_same_phone_threshold := coalesce((v_location ->> 'samePhoneThreshold')::int, 3);
  v_nearby_window := coalesce((v_location ->> 'nearbyAddressWindowMinutes')::int, 60);
  v_nearby_radius_m := coalesce((v_location ->> 'nearbyAddressRadiusM')::numeric, 200);
  v_nearby_threshold := coalesce((v_location ->> 'nearbyAddressThreshold')::int, 3);
  v_high_ticket_amount := coalesce((v_location ->> 'newPhoneHighTicketAmount')::numeric, 50);
  v_high_ticket_threshold := coalesce((v_location ->> 'newPhoneHighTicketThreshold')::int, 3);
  v_spike_days := coalesce((v_location ->> 'spikeLookbackDays')::int, 14);
  v_spike_multiplier := coalesce((v_location ->> 'spikeMultiplier')::numeric, 2);
  v_spike_min := coalesce((v_location ->> 'spikeMinimumOrdersPerHour')::int, 6);

  select count(*) into v_same_phone_count
  from public.orders o
  where o.customer_phone = p_customer_phone
    and o.created_at >= now() - make_interval(mins => v_same_phone_window)
    and o.status <> 'cancelled';
  if v_same_phone_count >= v_same_phone_threshold then
    v_requires_validation := true;
    v_validation_reason := coalesce(v_validation_reason, 'same_phone_burst');
    v_risk_flags := v_risk_flags || jsonb_build_object('samePhoneBurst', true);
  end if;

  if p_delivery_lat is not null and p_delivery_lng is not null then
    select count(*) into v_nearby_count
    from public.orders o
    where o.business_id = p_business_id
      and o.delivery_coordinates_lat is not null
      and o.delivery_coordinates_lng is not null
      and o.created_at >= now() - make_interval(mins => v_nearby_window)
      and o.status <> 'cancelled'
      and public.geo_distance_km(
        o.delivery_coordinates_lat::double precision,
        o.delivery_coordinates_lng::double precision,
        p_delivery_lat::double precision,
        p_delivery_lng::double precision
      ) <= (v_nearby_radius_m / 1000.0);
    if v_nearby_count >= v_nearby_threshold then
      v_requires_validation := true;
      v_validation_reason := coalesce(v_validation_reason, 'nearby_address_burst');
      v_risk_flags := v_risk_flags || jsonb_build_object('nearbyAddressBurst', true);
    end if;
  end if;

  v_night_start := (date_trunc('day', now() at time zone 'America/Lima') + interval '18 hours') at time zone 'America/Lima';
  if now() < v_night_start then
    v_night_start := v_night_start - interval '1 day';
  end if;

  if v_order_amount >= v_high_ticket_amount then
    with nightly_orders as (
      select o.*
      from public.orders o
      where o.business_id = p_business_id
        and o.created_at >= v_night_start
        and o.order_amount >= v_high_ticket_amount
        and o.status <> 'cancelled'
        and o.customer_phone is not null
    ),
    new_phones as (
      select distinct no.customer_phone
      from nightly_orders no
      where not exists (
        select 1
        from public.orders prior
        where prior.customer_phone = no.customer_phone
          and prior.id <> no.id
          and prior.created_at < v_night_start
          and prior.status <> 'cancelled'
      )
    )
    select count(*) into v_new_high_ticket_count from new_phones;

    if v_new_high_ticket_count >= v_high_ticket_threshold then
      v_requires_validation := true;
      v_validation_reason := coalesce(v_validation_reason, 'new_phone_high_ticket_burst');
      v_risk_flags := v_risk_flags || jsonb_build_object('newPhoneHighTicketBurst', true);
    end if;
  end if;

  select count(*) into v_recent_hour_count
  from public.orders o
  where o.business_id = p_business_id
    and o.created_at >= now() - interval '1 hour'
    and o.status <> 'cancelled';

  select avg(hour_count)::numeric into v_avg_hourly
  from (
    select date_trunc('hour', o.created_at) as bucket, count(*) as hour_count
    from public.orders o
    where o.business_id = p_business_id
      and o.created_at >= now() - make_interval(days => v_spike_days)
      and o.created_at < now() - interval '1 hour'
      and o.status <> 'cancelled'
    group by 1
  ) h;

  if v_recent_hour_count >= v_spike_min
     and v_avg_hourly is not null
     and v_recent_hour_count > (v_avg_hourly * v_spike_multiplier) then
    v_requires_validation := true;
    v_validation_reason := coalesce(v_validation_reason, 'order_spike');
    v_risk_flags := v_risk_flags || jsonb_build_object('orderSpike', true);
    if not exists (
      select 1 from public.admin_alerts
      where type = 'fraud_order_spike'
        and created_at >= now() - interval '1 hour'
        and resolved_at is null
    ) then
      insert into public.admin_alerts (type, payload)
      values ('fraud_order_spike', jsonb_build_object(
        'businessId', p_business_id,
        'recentHourCount', v_recent_hour_count,
        'averageHourlyCount', v_avg_hourly,
        'orderId', v_order_id
      ));
    end if;
  end if;

  if p_payment_intent = 'prepaid' then
    v_status := 'pending_acceptance';
  else
    if (not exists (
          select 1 from public.orders o
          where o.customer_phone = p_customer_phone and o.id <> v_order_id and o.status <> 'cancelled'
        ))
       or (select count(*) from public.customer_strikes where phone = p_customer_phone) >= 1
       or (p_delivery_reference is not null
           and (select count(*) from public.customer_strikes where delivery_reference = p_delivery_reference) >= 1)
       or v_order_amount >= v_vthreshold
    then
      v_requires_validation := true;
      v_validation_reason := coalesce(v_validation_reason, 'standard_validation_rule');
    end if;

    if v_requires_validation then
      if v_pickup_now then
        -- `validando` SIGNIFICA «LA CAJERA LLAMA POR TELÉFONO» (DECISIONS §8),
        -- y no se llama a quien está al otro lado del mostrador. Las señales
        -- que llevaron hasta aquí NO se pierden: `requires_validation`,
        -- `validation_reason_code` y `risk_flags` se guardan igual, y la
        -- tarjeta del tablero las enseña. Lo que cambia es quién resuelve la
        -- duda: no una llamada, sino la persona que lo tiene delante y que
        -- todavía no ha aceptado el pedido.
        v_risk_flags := v_risk_flags || jsonb_build_object('resolvedAtCounter', true);
      else
        v_status := 'validando';
      end if;
    end if;
  end if;

  update public.orders set
    order_amount = v_order_amount,
    delivery_fee = v_delivery_fee,
    delivery_fee_source = v_fee_source,
    status = v_status,
    requires_validation = v_requires_validation,
    validation_reason_code = v_validation_reason,
    risk_flags = v_risk_flags,
    client_pays_with = (case when p_payment_intent = 'pending_cash' then p_client_pays_with end),
    change_to_give = (case
      -- B.2: round() simple, sin greatest(0,...).
      -- R1 ya garantiza que p_client_pays_with >= total; greatest ocultaba el problema.
      when p_payment_intent = 'pending_cash' and p_client_pays_with is not null
      then round(p_client_pays_with - (v_order_amount + v_delivery_fee), 2)
    end)
  where id = v_order_id;

  insert into public.domain_events (aggregate_type, aggregate_id, event_type, payload)
  values ('order', v_order_id, 'OrderCreated', jsonb_build_object(
    'shortId', v_short_id, 'businessId', p_business_id, 'status', v_status,
    'orderAmount', v_order_amount, 'deliveryMethod', p_delivery_method,
    'pickupTiming', v_pickup_timing,
    'requiresValidation', v_requires_validation, 'riskFlags', v_risk_flags
  ));

  insert into public.order_event_log (order_id, event_type, actor_role, actor_user_id, data)
  values (v_order_id, 'order.created', 'cliente', p_customer_user_id,
    jsonb_build_object(
      'itemCount', jsonb_array_length(p_items),
      'status', v_status,
      'requiresValidation', v_requires_validation,
      'validationReasonCode', v_validation_reason,
      'riskFlags', v_risk_flags
    ));

  return jsonb_build_object(
    'id', v_order_id, 'shortId', v_short_id, 'orderNumber', v_order_number,
    'status', v_status, 'orderAmount', v_order_amount, 'deliveryFee', v_delivery_fee,
    'total', v_order_amount + v_delivery_fee,
    'promoApplied', v_promo_applied,
    'pickupTiming', v_pickup_timing
  );
end;
$function$;

-- -----------------------------------------------------------------------------
-- El flag real: "4 Alitas Crispy" (Al Punto) trae envío gratis martes y jueves.
-- Específico de este lanzamiento — la columna y la función de arriba son la
-- capacidad genérica; esto es el único dato que depende del caso real.
-- No hace nada en una base que no tenga este negocio (0 filas, sin error).
-- -----------------------------------------------------------------------------
update public.menu_items
   set free_delivery_days = array[1,3]::smallint[]  -- 1=martes, 3=jueves
 where id = 'f8877a34-6b3e-4928-a9e6-9c87499b110b'
   and business_id = '14f7a752-dac0-4332-9930-b09079521af1';
