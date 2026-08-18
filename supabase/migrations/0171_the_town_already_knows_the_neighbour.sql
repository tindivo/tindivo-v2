-- =============================================================================
-- 0171 · El pueblo ya conoce al vecino
-- =============================================================================
--
-- POR QUÉ.
--   Todo cliente nuevo paga por adelantado: sube la captura del Yape y espera a
--   que la cajera la valide. Es la fricción más cara del embudo, y en San
--   Jacinto es además absurda para la mayoría de los que la sufren: el piloto
--   lleva desde abril entregando en la puerta de esta gente.
--
--   El guard anterior (0057, vivo hasta la 0162) preguntaba una sola cosa:
--
--     exists (select 1 from orders
--              where customer_user_id = p_customer_user_id
--                and status = 'delivered')
--
--   Es decir: "¿ESTA CUENTA tiene una entrega?". Y casi nadie la tiene, porque
--   el historial del piloto no está atado a cuentas. Medido en prod hoy:
--
--     · 75 teléfonos con al menos un pedido `delivered` en v2
--     · de ésos, 72 con `customer_user_id IS NULL` — pedidos MANUALES que tomó
--       la cajera por teléfono, invisibles para el guard
--     · 591 teléfonos más con historial de entregas del v1, congelados en el
--       ETL de `address_directory` (0122)
--
--   O sea que el guard trataba como desconocidos a 622 vecinos a los que el
--   motorizado ya les tocó la puerta. Esta migración le enseña a mirar ahí.
--
-- QUÉ CUENTA COMO HISTORIAL, Y QUÉ NO.
--   Cuentan tres cosas, en `customer_trusted_for_contraentrega`:
--     (1) una entrega de esta cuenta             — el criterio de siempre
--     (2) una entrega de su teléfono en v2       — incluye los manuales
--     (3) una fila del directorio VENIDA DEL ETL — la entrega ocurrió en v1
--
--   NO cuenta "estar en `address_directory`" a secas, y la diferencia es todo
--   el diseño. La 0145 hace que la cajera CREE la fila del directorio al TOMAR
--   el pedido (`source = 'business_created'`), no al entregarlo. Un gate sobre
--   la mera presencia se acuñaría solo: llamas al restaurante, das tu número,
--   cancelas, y ya eres "conocido". Por eso (3) exige `legacy_address_id IS NOT
--   NULL` — el ETL del v1 es un registro cerrado de entregas consumadas, y las
--   filas nacidas en v2 no hacen falta ahí porque para ésas ya está (2), que
--   pregunta por la entrega y no por la captura de la dirección.
--
-- DE DÓNDE SALE EL TELÉFONO. ESTO ES LO QUE SOSTIENE TODO LO DEMÁS.
--   Del PERFIL VERIFICADO por OTP, nunca de `p_customer_phone`.
--
--   `create_customer_order` recibe `p_customer_phone` del navegador y NO lo
--   compara jamás contra `customer_profiles.phone`: su guard de OTP (0056) solo
--   verifica que la cuenta tenga ALGÚN teléfono confirmado, no que sea ÉSE. En
--   un pueblo donde te sabes el número de tus vecinos, un gate sobre el
--   parámetro sería regalar contraentrega a quien teclee el número de al lado.
--   La función ignora el parámetro y resuelve el teléfono ella misma desde
--   `customer_profiles` exigiendo `phone_verified_at IS NOT NULL`. Para heredar
--   el historial de un número hay que controlar ese WhatsApp.
--
--   (El agujero de fondo —que `p_customer_phone` sea libre y los strikes se
--   anclen a él— es PREEXISTENTE y sigue abierto: un cliente puede esquivar sus
--   propios strikes cambiando el número que escribe. No se cierra aquí porque
--   toca el antifraude entero, pero queda anotado en PENDIENTES.)
--
-- NORMALIZACIÓN.
--   `customer_profiles.phone` guarda `+51999999999` (12 chars, medido: 16/16
--   filas verificadas). `orders.customer_phone` y `address_directory.phone`
--   guardan 9 dígitos (`^9\d{8}$`, medido: 0 filas fuera de formato). Sin el
--   `right(regexp_replace(...), 9)` la comparación NUNCA casa y la función
--   devuelve false siempre — un fallo mudo que se leería como "el directorio no
--   sirve".
--
-- LO QUE NO SE AFLOJA.
--   · `prepay_threshold` (S/80) sigue igual: vecino conocido con pedido de
--     S/120 paga por adelantado.
--   · `customer_is_blocked` y el guard de OTP siguen corriendo antes, intactos.
--   · El riesgo anula el crédito de historial, vía `customer_requires_prepayment`
--     (0044): `contraentrega_blocked` del perfil y los strikes anclados a la
--     cuenta o al teléfono verificado.
--
--     Y eso es MÁS estricto que hoy, no menos. 0044 llamaba a ese helper desde
--     `create_customer_order`; la 0162 ya no lo hace. Desde entonces
--     `contraentrega_blocked` solo lo miraba el frontend
--     (`use-checkout-state.ts:131`) y un cliente restringido podía saltárselo
--     llamando a la RPC directo. La 0171 lo devuelve a la DB.
--
-- QUÉ CAMBIA.
--   A) `public.customer_trusted_for_contraentrega(uuid)` — el predicado.
--   B) `public.current_customer_trusted_for_contraentrega()` — el mismo, para
--      `auth.uid()`, que es lo que el checkout necesita para pintar la pantalla.
--   C) `create_customer_order`: el guard llama a (A). El cuerpo sale de
--      `pg_get_functiondef` de la definición viva (0162, md5 verificado contra
--      prod), y cambia ÚNICAMENTE ese bloque.
--
-- ROLLBACK: supabase/rollbacks/0171_the_town_already_knows_the_neighbour.rollback.sql
-- =============================================================================

-- ─── A · El predicado ────────────────────────────────────────────────────────
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

  -- El teléfono sale del PERFIL VERIFICADO, nunca de un parámetro. Ver cabecera.
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

  -- EL RIESGO MANDA SOBRE CUALQUIER HISTORIAL. `customer_requires_prepayment`
  -- (0044) es el helper canónico —el mismo que usa el alta manual de la cajera
  -- (0080)— y cubre las tres anclas: `contraentrega_blocked` del perfil, y los
  -- strikes anclados a la cuenta Y al teléfono. La referencia va NULL porque
  -- aquí todavía no hay dirección que mirar.
  --
  -- Que la RPC del cliente vuelva a consultarlo es NUEVO: 0044 lo llamaba y la
  -- 0162 ya no. Desde 0171, `contraentrega_blocked` deja de ser decoración del
  -- frontend y lo hace cumplir la DB.
  if public.customer_requires_prepayment(p_customer_user_id, v_phone, null) then
    return false;
  end if;

  -- (1) Historial de ESTA cuenta. No depende del teléfono a propósito: quien ya
  --     pidió aquí y cambió de número sigue avalado por sus propias entregas.
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

  -- (2) Entregas del teléfono en v2, incluidos los pedidos manuales de la
  --     cajera (`customer_user_id IS NULL`), que son 72 de los 75 del piloto.
  if exists (
    select 1 from public.orders o
    where o.customer_phone = v_phone
      and o.status = 'delivered'
  ) then
    return true;
  end if;

  -- (3) Entregas del teléfono en v1. `legacy_address_id IS NOT NULL` es lo que
  --     distingue el registro cerrado del ETL de una fila que la cajera acaba
  --     de crear al teclear el pedido. Ver la cabecera.
  return exists (
    select 1 from public.address_directory ad
    where ad.phone = v_phone
      and ad.legacy_address_id is not null
  );
end $fn$;

COMMENT ON FUNCTION public.customer_trusted_for_contraentrega(uuid) IS
  'true si el cliente puede pagar contraentrega sin prepago. Resuelve el '
  'teléfono desde el perfil VERIFICADO, nunca de un parámetro. Ver 0171.';

-- No se expone al navegador: con un uuid arbitrario sería un oráculo sobre
-- cuentas ajenas. El checkout usa el wrapper de abajo, que no acepta a quién
-- preguntar.
REVOKE EXECUTE ON FUNCTION public.customer_trusted_for_contraentrega(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.customer_trusted_for_contraentrega(uuid) TO service_role;

-- ─── B · El wrapper del checkout ─────────────────────────────────────────────
-- Sin parámetro A PROPÓSITO. La pregunta que el navegador puede hacer es "¿yo?"
-- y ninguna otra: así no hay forma de barrer cuentas ni de convertir esto en un
-- padrón de quién es cliente del pueblo.
CREATE OR REPLACE FUNCTION public.current_customer_trusted_for_contraentrega()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $fn$
  select public.customer_trusted_for_contraentrega(auth.uid());
$fn$;

COMMENT ON FUNCTION public.current_customer_trusted_for_contraentrega() IS
  'El predicado de 0171 aplicado a auth.uid(). Lo llama el checkout del cliente '
  'para saber si puede ofrecer contraentrega. Sin sesión devuelve false.';

-- OBLIGATORIO: 0009 revoca EXECUTE a anon/authenticated y 0100 fija los default
-- privileges. Sin este grant el checkout recibe "permission denied for
-- function", que se lee como un bug de la pantalla de pago.
REVOKE EXECUTE ON FUNCTION public.current_customer_trusted_for_contraentrega() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.current_customer_trusted_for_contraentrega() TO authenticated, service_role;

-- ─── C · El guard de create_customer_order ───────────────────────────────────
-- Verificar antes de aplicar en producción (§2.9 AGENTS.md):
--   SELECT oid, pg_get_function_arguments(oid)
--   FROM pg_proc WHERE proname = 'create_customer_order';
-- Debe devolver UNA sola fila.

CREATE OR REPLACE FUNCTION public.create_customer_order(p_business_id uuid, p_customer_user_id uuid, p_delivery_method delivery_method, p_payment_intent payment_intent, p_customer_name text, p_customer_phone text, p_items jsonb, p_delivery_address text, p_delivery_reference text, p_delivery_lat numeric DEFAULT NULL::numeric, p_delivery_lng numeric DEFAULT NULL::numeric, p_source order_source DEFAULT 'customer_pwa'::order_source, p_client_pays_with numeric DEFAULT NULL::numeric, p_customer_gps_lat double precision DEFAULT NULL::double precision, p_customer_gps_lng double precision DEFAULT NULL::double precision, p_customer_gps_accuracy_m double precision DEFAULT NULL::double precision, p_customer_gps_distance_to_center_km numeric DEFAULT NULL::numeric, p_customer_gps_method text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
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
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El pedido no tiene items' using errcode = 'P0001';
  end if;

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
      'waiting_driver', 'heading_to_restaurant', 'waiting_at_restaurant', 'picked_up'
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

  -- GUARD DE CONTRAENTREGA: exige historial de entregas.
  -- 0171 amplía QUÉ cuenta como historial. Antes: solo pedidos `delivered` de
  -- ESTA cuenta, que en el piloto casi nadie tiene porque los pedidos los tomó
  -- la cajera con `customer_user_id NULL`. Ahora también cuentan las entregas
  -- del teléfono VERIFICADO —las de v2, manuales incluidas, y las del v1
  -- congeladas en el ETL del directorio—. El teléfono lo resuelve la función
  -- desde el perfil, NUNCA desde `p_customer_phone`, que el cliente elige
  -- libremente. Ver la cabecera de 0171.
  if p_payment_intent in ('pending_cash', 'pending_yape') then
    if not public.customer_trusted_for_contraentrega(p_customer_user_id) then
      raise exception 'Pago adelantado requerido para primer pedido.'
        using errcode = 'P0001';
    end if;
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
    delivery_distance_band, delivery_fee_source
  ) values (
    p_business_id, p_customer_user_id, p_source, p_delivery_method, p_payment_intent,
    p_customer_name, p_customer_phone, p_delivery_address, p_delivery_reference,
    p_delivery_lat, p_delivery_lng,
    p_customer_gps_lat, p_customer_gps_lng, p_customer_gps_accuracy_m,
    p_customer_gps_distance_to_center_km,
    case when p_customer_gps_method is not null then now() else null end,
    p_customer_gps_method,
    0, v_delivery_fee, 'pending_acceptance',
    v_band, 'system'
  ) returning id, short_id, order_number into v_order_id, v_short_id, v_order_number;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_menu_item from public.menu_items
      where id = (v_item ->> 'menu_item_id')::uuid and business_id = p_business_id;
    if not found then raise exception 'Un item no pertenece a este negocio' using errcode = 'P0001'; end if;
    if not v_menu_item.is_available then
      raise exception 'El item "%" no esta disponible', v_menu_item.name using errcode = 'P0001';
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

  select (value #>> '{}')::numeric into v_threshold from public.app_settings where key = 'prepay_threshold';
  v_threshold := coalesce(v_threshold, 80);
  if v_order_amount + v_delivery_fee > v_threshold and p_payment_intent <> 'prepaid' then
    raise exception 'Pedidos mayores a S/% requieren pago adelantado.', v_threshold
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

    select (value #>> '{}')::numeric into v_max_change from public.app_settings where key = 'max_change';
    v_max_change := coalesce(v_max_change, 50);

    -- R2: el billete declarado no puede superar el máximo
    if p_client_pays_with > v_max_bill then
      raise exception 'El billete máximo aceptado es S/%. Usa un billete menor o paga con Yape/Plin.', v_max_bill
        using errcode = 'P0001';
    end if;

    -- R3: el vuelto requerido no puede superar el máximo
    if p_client_pays_with - (v_order_amount + v_delivery_fee) > v_max_change then
      raise exception 'El vuelto requerido (S/%) supera el máximo que puede llevar el motorizado (S/%). Paga con un billete menor o usa Yape/Plin.',
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
      v_status := 'validando';
    end if;
  end if;

  update public.orders set
    order_amount = v_order_amount,
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
    'total', v_order_amount + v_delivery_fee
  );
end;
$function$

